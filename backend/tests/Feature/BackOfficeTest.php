<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CompanyProvisioner;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class BackOfficeTest extends TestCase
{
    use DatabaseTransactions;

    private function planId(string $slug): string
    {
        return DB::table('plans')->where('slug', $slug)->value('id');
    }

    private function adminDePlataforma(): User
    {
        $user = User::create([
            'name' => 'Personal MTS',
            'email' => 'personal@macedotech.test',
            'password' => Hash::make('clave12345'),
        ]);

        $user->forceFill(['is_platform_admin' => true])->save();

        return $user;
    }

    private function crearEmpresa(string $nombre, string $planSlug): array
    {
        return app(CompanyProvisioner::class)->provision($nombre, $this->planId($planSlug), [
            'name' => "Dueno de $nombre",
            'email' => strtolower(str_replace(' ', '', $nombre)).'@backoffice.test',
            'password' => 'clave12345',
        ]);
    }

    public function test_el_alta_activa_solo_los_modulos_del_plan(): void
    {
        // La razon de ser de plan_modules: antes toda empresa recibia los
        // cuatro modulos, comprara lo que comprara.
        $result = $this->crearEmpresa('Cliente Starter', 'starter');
        $companyId = $result['company']->id;

        app(CompanyProvisioner::class)->setCompanyContext($companyId);

        $activos = DB::table('company_modules as cm')
            ->join('modules as m', 'm.id', '=', 'cm.module_id')
            ->where('cm.is_active', true)
            ->pluck('m.slug')
            ->sort()
            ->values()
            ->all();

        $this->assertSame(['cms'], $activos);
    }

    public function test_el_alta_crea_la_suscripcion(): void
    {
        $result = $this->crearEmpresa('Cliente Con Suscripcion', 'profesional');
        $companyId = $result['company']->id;

        app(CompanyProvisioner::class)->setCompanyContext($companyId);

        $suscripcion = DB::table('subscriptions')->where('company_id', $companyId)->first();

        $this->assertNotNull($suscripcion, 'El alta debe dejar constancia de que se contrato un plan.');
        $this->assertSame('active', $suscripcion->status);
        $this->assertSame($this->planId('profesional'), $suscripcion->plan_id);
    }

    public function test_cambiar_de_plan_recalcula_los_modulos(): void
    {
        $result = $this->crearEmpresa('Cliente Que Sube', 'starter');
        $companyId = $result['company']->id;

        app(CompanyProvisioner::class)->changePlan($companyId, $this->planId('empresarial'));
        app(CompanyProvisioner::class)->setCompanyContext($companyId);

        $activos = DB::table('company_modules as cm')
            ->join('modules as m', 'm.id', '=', 'cm.module_id')
            ->where('cm.is_active', true)
            ->pluck('m.slug')
            ->sort()
            ->values()
            ->all();

        $this->assertSame(['ai', 'cms', 'crm', 'erp'], $activos);
    }

    public function test_bajar_de_plan_desactiva_los_modulos_sobrantes(): void
    {
        $result = $this->crearEmpresa('Cliente Que Baja', 'empresarial');
        $companyId = $result['company']->id;

        app(CompanyProvisioner::class)->changePlan($companyId, $this->planId('starter'));
        app(CompanyProvisioner::class)->setCompanyContext($companyId);

        $activos = DB::table('company_modules as cm')
            ->join('modules as m', 'm.id', '=', 'cm.module_id')
            ->where('cm.is_active', true)
            ->pluck('m.slug')
            ->all();

        $this->assertSame(['cms'], $activos);

        // Se desactivan, no se borran: asi se conserva el historico
        $total = DB::table('company_modules')->where('company_id', $companyId)->count();
        $this->assertSame(4, $total);
    }

    public function test_un_usuario_normal_no_entra_al_back_office(): void
    {
        $result = $this->crearEmpresa('Cliente Curioso', 'starter');

        // Se comprueba el mensaje, no solo el 403: hay varios middlewares que
        // devuelven 403 y este test debe fallar si pasa por el motivo
        // equivocado (por ejemplo, por usuario inactivo).
        $this->actingAs($result['user'], 'sanctum')
            ->getJson('/api/admin/companies')
            ->assertStatus(403)
            ->assertJson(['message' => 'No tienes acceso al back-office.']);
    }

    public function test_el_administrador_de_plataforma_lista_todas_las_empresas(): void
    {
        $this->crearEmpresa('Empresa Listada', 'starter');
        $admin = $this->adminDePlataforma();

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/companies');

        $response->assertOk();
        $nombres = collect($response->json('companies'))->pluck('name');

        // admin_list_companies() es SECURITY DEFINER: cruza empresas aunque
        // subscriptions y company_modules lleven RLS
        $this->assertTrue($nombres->contains('Empresa Listada'));
    }

    public function test_entrar_como_cliente_queda_registrado_en_la_auditoria(): void
    {
        $result = $this->crearEmpresa('Cliente Con Soporte', 'starter');
        $companyId = $result['company']->id;
        $admin = $this->adminDePlataforma();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/companies/{$companyId}/impersonate")
            ->assertOk();

        app(CompanyProvisioner::class)->setCompanyContext($companyId);

        $registro = DB::table('audit_logs')
            ->where('company_id', $companyId)
            ->where('action', 'impersonation_started')
            ->first();

        $this->assertNotNull($registro, 'Entrar al panel de un cliente debe dejar rastro.');
        $this->assertSame($admin->id, $registro->user_id);
    }
}
