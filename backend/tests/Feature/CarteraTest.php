<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CompanyProvisioner;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * La cartera de clientes de Macedo Tech: servicios contratados, vencimientos y
 * oportunidades. Es la herramienta que Aaron usa a diario, asi que lo que se
 * prueba aqui es lo que le hace ganar (o perder) dinero.
 */
class CarteraTest extends TestCase
{
    use DatabaseTransactions;

    private function admin(): User
    {
        $user = User::create([
            'name' => 'Personal MTS',
            'email' => 'cartera@macedotech.test',
            'password' => Hash::make('clave12345'),
        ]);

        $user->forceFill(['is_platform_admin' => true])->save();

        return $user;
    }

    private function servicio(string $slug): string
    {
        return DB::table('services')->where('slug', $slug)->value('id');
    }

    public function test_se_puede_dar_de_alta_un_cliente_solo_con_el_nombre(): void
    {
        // El caso de uso principal: la mayoria de clientes tienen una web y un
        // mantenimiento, no usan MTS Platform y no entran a ningun panel.
        $result = app(CompanyProvisioner::class)->provision('Ferreteria El Tornillo');

        $this->assertNotNull($result['company']);
        $this->assertNull($result['user'], 'Sin datos de responsable no debe crearse ningun usuario.');

        app(CompanyProvisioner::class)->setCompanyContext($result['company']->id);

        $this->assertSame(0, DB::table('subscriptions')->count(), 'Sin plan no debe haber suscripcion.');
        $this->assertSame(0, DB::table('company_user')->count());

        // Los roles base si se siembran siempre, para no tener un caso especial
        // el dia que ese cliente contrate acceso
        $this->assertSame(4, DB::table('roles')->count());
    }

    public function test_el_alta_con_plan_y_responsable_sigue_funcionando(): void
    {
        $planId = DB::table('plans')->where('slug', 'starter')->value('id');

        $result = app(CompanyProvisioner::class)->provision('Cliente Con Panel', $planId, [
            'name' => 'Responsable',
            'email' => 'responsable@conpanel.test',
            'password' => 'clave12345',
        ]);

        $this->assertNotNull($result['user']);

        app(CompanyProvisioner::class)->setCompanyContext($result['company']->id);

        $this->assertSame(1, DB::table('subscriptions')->count());
        $this->assertSame(1, DB::table('company_user')->count());
    }

    public function test_el_alta_por_api_solo_necesita_el_nombre(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/companies', ['company_name' => 'Panaderia La Espiga'])
            ->assertCreated()
            ->assertJsonPath('company.name', 'Panaderia La Espiga')
            ->assertJsonPath('owner', null);
    }

    public function test_renovar_un_mensual_adelanta_un_mes(): void
    {
        $company = app(CompanyProvisioner::class)->provision('Cliente Mensual')['company'];

        $id = DB::table('client_services')->insertGetId([
            'company_id' => $company->id,
            'service_id' => $this->servicio('mantenimiento-mensual'),
            'price' => 150,
            'billing_period' => 'monthly',
            'next_renewal_on' => '2026-08-04',
        ], 'id');

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/admin/client-services/{$id}/renew")
            ->assertOk()
            ->assertJsonPath('client_service.next_renewal_on', '2026-09-04');
    }

    public function test_renovar_un_anual_adelanta_un_ano(): void
    {
        $company = app(CompanyProvisioner::class)->provision('Cliente Anual')['company'];

        $id = DB::table('client_services')->insertGetId([
            'company_id' => $company->id,
            'service_id' => $this->servicio('dominio'),
            'price' => 60,
            'billing_period' => 'yearly',
            'next_renewal_on' => '2026-07-24',
        ], 'id');

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/admin/client-services/{$id}/renew")
            ->assertOk()
            ->assertJsonPath('client_service.next_renewal_on', '2027-07-24');
    }

    public function test_renovar_a_fin_de_mes_no_se_salta_febrero(): void
    {
        // El 31 de enero mas un mes no puede caer en marzo
        $company = app(CompanyProvisioner::class)->provision('Cliente Fin De Mes')['company'];

        $id = DB::table('client_services')->insertGetId([
            'company_id' => $company->id,
            'service_id' => $this->servicio('mantenimiento-mensual'),
            'price' => 100,
            'billing_period' => 'monthly',
            'next_renewal_on' => '2027-01-31',
        ], 'id');

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/admin/client-services/{$id}/renew")
            ->assertOk()
            ->assertJsonPath('client_service.next_renewal_on', '2027-02-28');
    }

    public function test_un_servicio_de_pago_unico_no_vence_ni_se_renueva(): void
    {
        $company = app(CompanyProvisioner::class)->provision('Cliente Pago Unico')['company'];
        $admin = $this->admin();

        // Aunque se mande una fecha, debe ignorarse
        $response = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/companies/{$company->id}/services", [
                'service_id' => $this->servicio('diseno-web'),
                'price' => 1200,
                'billing_period' => 'one_time',
                'next_renewal_on' => '2027-01-01',
            ])
            ->assertCreated()
            ->assertJsonPath('client_service.next_renewal_on', null);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/client-services/{$response->json('client_service.id')}/renew")
            ->assertStatus(422);
    }

    public function test_el_ingreso_recurrente_prorratea_los_anuales_e_ignora_pausados(): void
    {
        $company = app(CompanyProvisioner::class)->provision('Cliente Ingresos')['company'];

        $filas = [
            // 150 al mes -> 150
            ['mantenimiento-mensual', 150, 'monthly', 'activo'],
            // 60 al año -> 5 al mes
            ['dominio', 60, 'yearly', 'activo'],
            // pausado -> no cuenta
            ['hosting', 240, 'yearly', 'pausado'],
            // pago unico -> no cuenta
            ['diseno-web', 1200, 'one_time', 'activo'],
        ];

        foreach ($filas as [$slug, $price, $period, $status]) {
            DB::table('client_services')->insert([
                'company_id' => $company->id,
                'service_id' => $this->servicio($slug),
                'price' => $price,
                'billing_period' => $period,
                'status' => $status,
            ]);
        }

        $response = $this->actingAs($this->admin(), 'sanctum')->getJson('/api/admin/stats');

        $response->assertOk();

        // Comparacion con margen: es dinero, y JSON no distingue 155 de 155.0
        $this->assertEqualsWithDelta(155, $response->json('ingreso_recurrente_mensual'), 0.01);
    }

    public function test_un_usuario_normal_no_toca_la_cartera(): void
    {
        $result = app(CompanyProvisioner::class)->provision('Cliente Curioso', null, [
            'name' => 'Curioso',
            'email' => 'curioso@cartera.test',
            'password' => 'clave12345',
        ]);

        $this->actingAs($result['user'], 'sanctum')
            ->getJson('/api/admin/services')
            ->assertStatus(403)
            ->assertJson(['message' => 'No tienes acceso al back-office.']);
    }
}
