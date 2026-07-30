<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;
use Spatie\Permission\PermissionRegistrar;

/**
 * Alta de un cliente de Macedo Tech.
 *
 * Esta secuencia vive en un solo sitio a proposito. La usan tanto el alta del
 * back-office como el registro por autoservicio, y el ORDEN IMPORTA: hay que
 * fijar el contexto de empresa ANTES de tocar cualquier tabla con RLS
 * (company_modules, subscriptions, roles, model_has_roles, company_user).
 * Duplicar este flujo es pedir un fallo de aislamiento.
 *
 * El plan y el usuario responsable son OPCIONALES. La mayoria de clientes de
 * Macedo Tech solo tienen una web y un mantenimiento: no usan MTS Platform y no
 * tienen por que entrar a ningun panel. Obligar a inventarse un correo y una
 * contraseña por cada cliente haria la herramienta molesta de usar, y una
 * herramienta molesta no se usa.
 */
class CompanyProvisioner
{
    /**
     * @param  string|null  $planId  Plan de MTS Platform, si el cliente lo contrata
     * @param  array{name: string, email: string, password: string}|null  $owner  Usuario que accedera al panel, si lo hay
     * @return array{company: Company, user: User|null}
     */
    public function provision(string $companyName, ?string $planId = null, ?array $owner = null): array
    {
        return DB::transaction(function () use ($companyName, $planId, $owner) {
            $plan = null;

            if ($planId !== null) {
                $plan = DB::table('plans')->where('id', $planId)->first();

                if (! $plan) {
                    throw new RuntimeException('El plan indicado no existe.');
                }
            }

            $company = Company::create([
                'name' => $companyName,
                'slug' => Str::slug($companyName).'-'.Str::random(6),
            ]);

            $this->setCompanyContext($company->id);

            // Los roles base se siembran siempre, aunque el cliente todavia no
            // acceda al panel: son cuatro filas y evitan un caso especial el dia
            // que si contrate acceso.
            DB::select('select seed_default_roles(?::uuid)', [$company->id]);

            if ($plan) {
                DB::table('subscriptions')->insert([
                    'company_id' => $company->id,
                    'plan_id' => $plan->id,
                    'status' => 'active',
                ]);

                // Solo los modulos que incluye el plan contratado
                DB::select('select sync_company_modules(?::uuid, ?::uuid)', [$company->id, $plan->id]);
            }

            $user = null;

            if ($owner !== null) {
                $user = User::create([
                    'name' => $owner['name'],
                    'email' => $owner['email'],
                    'password' => Hash::make($owner['password']),
                ]);

                DB::table('company_user')->insert([
                    'company_id' => $company->id,
                    'user_id' => $user->id,
                    'is_owner' => true,
                ]);

                $adminRole = Role::where('company_id', $company->id)
                    ->where('name', 'Administrador')
                    ->first();

                $user->assignRole($adminRole);
            }

            return ['company' => $company, 'user' => $user];
        });
    }

    /**
     * Cambia el plan de una empresa: actualiza la suscripcion y recalcula los
     * modulos activos.
     */
    public function changePlan(string $companyId, string $planId): void
    {
        DB::transaction(function () use ($companyId, $planId) {
            $plan = DB::table('plans')->where('id', $planId)->first();

            if (! $plan) {
                throw new RuntimeException('El plan indicado no existe.');
            }

            $this->setCompanyContext($companyId);

            $current = DB::table('subscriptions')
                ->where('company_id', $companyId)
                ->orderByRaw("(status = 'active') desc, created_at desc")
                ->first();

            if ($current) {
                DB::table('subscriptions')->where('id', $current->id)->update([
                    'plan_id' => $plan->id,
                    'status' => 'active',
                ]);
            } else {
                DB::table('subscriptions')->insert([
                    'company_id' => $companyId,
                    'plan_id' => $plan->id,
                    'status' => 'active',
                ]);
            }

            DB::select('select sync_company_modules(?::uuid, ?::uuid)', [$companyId, $plan->id]);
        });
    }

    /**
     * Fija el contexto RLS de PostgreSQL y el "team" de Spatie.
     *
     * El tercer argumento de set_config (is_local) es false a proposito: con
     * SET LOCAL, fuera de una transaccion explicita el valor se descartaria al
     * terminar la sentencia y el contexto RLS se perderia.
     */
    public function setCompanyContext(string $companyId): void
    {
        DB::statement("select set_config('app.current_company_id', ?, false)", [$companyId]);
        app(PermissionRegistrar::class)->setPermissionsTeamId($companyId);
    }
}
