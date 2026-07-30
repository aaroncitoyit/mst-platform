<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Rules\PasswordPolicy;
use App\Services\CompanyProvisioner;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Back-office de MTS: gestion de las empresas cliente.
 *
 * Principio que hay que respetar en todo este controlador: NUNCA se elude RLS,
 * se cambia de contexto. Toda operacion sobre una empresa concreta llama antes
 * a setCompanyContext(); si se olvida, las consultas a subscriptions,
 * company_modules o company_user devuelven cero filas en silencio.
 */
class CompanyAdminController extends Controller
{
    public function __construct(private CompanyProvisioner $provisioner)
    {
    }

    /**
     * Listado global. Usa la unica funcion SECURITY DEFINER que cruza empresas;
     * la autorizacion la garantiza el middleware platform.admin de la ruta.
     */
    public function index(Request $request)
    {
        $companies = collect(DB::select('select * from admin_list_companies()'));

        if ($search = trim((string) $request->query('buscar'))) {
            $needle = mb_strtolower($search);
            $companies = $companies->filter(
                fn ($c) => str_contains(mb_strtolower($c->name), $needle)
                    || str_contains(mb_strtolower($c->slug), $needle)
            )->values();
        }

        return response()->json(['companies' => $companies]);
    }

    /**
     * Alta de un cliente.
     *
     * Solo el nombre es obligatorio. El plan de MTS Platform y el usuario que
     * accede al panel son extras para los clientes que de verdad usan la
     * plataforma; la mayoria solo tiene una web y un mantenimiento.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'company_name' => ['required', 'string', 'max:150'],
            'plan_id' => ['nullable', 'uuid', Rule::exists('plans', 'id')->where('is_active', true)],
            // Los tres datos del responsable van juntos: o los tres o ninguno
            'owner_name' => ['nullable', 'required_with:owner_email', 'string', 'max:150'],
            'owner_email' => ['nullable', 'email', 'max:150', 'unique:users,email'],
            'owner_password' => ['nullable', 'required_with:owner_email', 'string', PasswordPolicy::paraCliente()],
        ]);

        $owner = isset($data['owner_email']) && $data['owner_email'] !== null
            ? [
                'name' => $data['owner_name'],
                'email' => $data['owner_email'],
                'password' => $data['owner_password'],
            ]
            : null;

        $result = $this->provisioner->provision(
            $data['company_name'],
            $data['plan_id'] ?? null,
            $owner,
        );

        return response()->json([
            'company' => $result['company'],
            'owner' => $result['user'],
        ], 201);
    }

    public function show(string $id)
    {
        $company = DB::table('companies')->where('id', $id)->first();

        if (! $company) {
            return response()->json(['message' => 'La empresa no existe'], 404);
        }

        // A partir de aqui se consultan tablas con RLS: sin contexto devuelven cero filas
        $this->provisioner->setCompanyContext($id);

        $subscription = DB::table('subscriptions as s')
            ->join('plans as p', 'p.id', '=', 's.plan_id')
            ->where('s.company_id', $id)
            ->orderByRaw("(s.status = 'active') desc, s.created_at desc")
            ->first(['s.id', 's.status', 's.starts_at', 's.ends_at', 'p.id as plan_id', 'p.name as plan_name', 'p.slug as plan_slug', 'p.price']);

        $modules = DB::table('company_modules as cm')
            ->join('modules as m', 'm.id', '=', 'cm.module_id')
            ->where('cm.company_id', $id)
            ->orderBy('m.name')
            ->get(['m.id', 'm.name', 'm.slug', 'cm.is_active']);

        $users = DB::table('company_user as cu')
            ->join('users as u', 'u.id', '=', 'cu.user_id')
            ->where('cu.company_id', $id)
            ->orderBy('u.name')
            ->get(['u.id', 'u.name', 'u.email', 'u.is_active', 'cu.is_owner']);

        // Cartera: estas tres tablas NO llevan RLS (ver el script 012), son
        // apuntes internos de Macedo Tech sobre el cliente.
        $services = DB::table('client_services as cs')
            ->join('services as s', 's.id', '=', 'cs.service_id')
            ->where('cs.company_id', $id)
            ->orderByRaw("(cs.status = 'activo') desc, cs.next_renewal_on nulls last")
            ->get([
                'cs.id', 'cs.price', 'cs.billing_period', 'cs.status', 'cs.started_on',
                'cs.next_renewal_on', 'cs.notes', 'cs.service_id',
                's.name as service_name', 's.slug as service_slug',
            ]);

        $opportunities = DB::table('opportunities')
            ->where('company_id', $id)
            ->orderByRaw("(status in ('idea','propuesta')) desc, created_at desc")
            ->get();

        $notes = DB::table('client_notes as n')
            ->leftJoin('users as u', 'u.id', '=', 'n.user_id')
            ->where('n.company_id', $id)
            ->orderByDesc('n.created_at')
            ->get(['n.id', 'n.body', 'n.created_at', 'u.name as author_name']);

        return response()->json([
            'company' => $company,
            'services' => $services,
            'opportunities' => $opportunities,
            'notes' => $notes,
            // Lo relativo a MTS Platform queda en segundo plano: de momento
            // casi ningun cliente entra al panel.
            'subscription' => $subscription,
            'modules' => $modules,
            'users' => $users,
        ]);
    }

    /** Renombrar, y suspender o reactivar. */
    public function update(Request $request, string $id)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:150'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (! DB::table('companies')->where('id', $id)->exists()) {
            return response()->json(['message' => 'La empresa no existe'], 404);
        }

        if ($data === []) {
            return response()->json(['message' => 'No hay nada que actualizar'], 422);
        }

        DB::table('companies')->where('id', $id)->update($data + ['updated_at' => now()]);

        return response()->json([
            'company' => DB::table('companies')->where('id', $id)->first(),
        ]);
    }

    /** Cambia el plan: actualiza la suscripcion y recalcula los modulos activos. */
    public function changePlan(Request $request, string $id)
    {
        $data = $request->validate([
            'plan_id' => ['required', 'uuid', Rule::exists('plans', 'id')->where('is_active', true)],
        ]);

        if (! DB::table('companies')->where('id', $id)->exists()) {
            return response()->json(['message' => 'La empresa no existe'], 404);
        }

        $this->provisioner->changePlan($id, $data['plan_id']);

        return $this->show($id);
    }

    /**
     * Deja constancia de que un administrador de MTS entra al panel de un
     * cliente.
     *
     * El acceso en si lo permite EnsureCompanyContext (que salta la
     * comprobacion de pertenencia para el personal de MTS). Este endpoint
     * existe para que ese acceso tenga un momento REGISTRADO de entrada, en
     * vez de ser implicito y silencioso.
     */
    public function impersonate(Request $request, string $id)
    {
        $company = DB::table('companies')->where('id', $id)->first();

        if (! $company) {
            return response()->json(['message' => 'La empresa no existe'], 404);
        }

        $this->provisioner->setCompanyContext($id);

        DB::table('audit_logs')->insert([
            'company_id' => $id,
            'user_id' => $request->user()->id,
            'action' => 'impersonation_started',
            'model_type' => 'company',
            'model_id' => $id,
            'changes' => json_encode([
                'admin_email' => $request->user()->email,
                'company_name' => $company->name,
                'ip' => $request->ip(),
            ]),
        ]);

        return response()->json([
            'company' => [
                'id' => $company->id,
                'name' => $company->name,
                'slug' => $company->slug,
                'is_owner' => false,
            ],
        ]);
    }
}
