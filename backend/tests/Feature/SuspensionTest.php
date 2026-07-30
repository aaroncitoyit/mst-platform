<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CompanyProvisioner;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Suspender debe cortar el acceso de verdad.
 *
 * Antes de este trabajo, is_active de empresa y de usuario no se consultaba en
 * ningun sitio: el boton de suspender habria sido decorativo y un cliente que
 * dejara de pagar habria seguido entrando.
 */
class SuspensionTest extends TestCase
{
    use DatabaseTransactions;

    private function crearEmpresa(string $nombre): array
    {
        $planId = DB::table('plans')->where('slug', 'starter')->value('id');

        return app(CompanyProvisioner::class)->provision($nombre, $planId, [
            'name' => "Dueno de $nombre",
            'email' => strtolower(str_replace(' ', '', $nombre)).'@suspension.test',
            'password' => 'clave12345',
        ]);
    }

    public function test_un_usuario_desactivado_no_puede_iniciar_sesion(): void
    {
        $result = $this->crearEmpresa('Empresa Con Usuario Baja');
        $result['user']->forceFill(['is_active' => false])->save();

        $this->postJson('/api/login', [
            'email' => $result['user']->email,
            'password' => 'clave12345',
        ])->assertStatus(403);
    }

    public function test_un_usuario_desactivado_no_puede_usar_un_token_ya_emitido(): void
    {
        // El caso importante: desactivar a alguien con la sesion abierta.
        // Los tokens de Sanctum sobreviven; lo que corta el acceso es la
        // comprobacion en cada peticion.
        $result = $this->crearEmpresa('Empresa Token Vivo');
        $user = $result['user'];

        $this->actingAs($user, 'sanctum')->getJson('/api/my-companies')->assertOk();

        $user->forceFill(['is_active' => false])->save();

        $this->actingAs($user->fresh(), 'sanctum')
            ->getJson('/api/my-companies')
            ->assertStatus(403)
            ->assertJson(['message' => 'Tu usuario esta desactivado.']);
    }

    public function test_una_empresa_suspendida_bloquea_a_sus_usuarios(): void
    {
        $result = $this->crearEmpresa('Empresa Morosa');
        $companyId = $result['company']->id;

        DB::table('companies')->where('id', $companyId)->update(['is_active' => false]);

        $this->actingAs($result['user'], 'sanctum')
            ->withHeader('X-Company-Id', $companyId)
            ->getJson('/api/company')
            ->assertStatus(403)
            ->assertJson([
                'message' => 'Esta empresa esta suspendida. Contacta con Macedo Tech Solutions.',
            ]);
    }

    public function test_el_personal_de_mts_si_entra_a_una_empresa_suspendida(): void
    {
        // Para poder diagnosticar por que esta suspendida
        $result = $this->crearEmpresa('Empresa Suspendida Soporte');
        $companyId = $result['company']->id;

        DB::table('companies')->where('id', $companyId)->update(['is_active' => false]);

        $admin = User::create([
            'name' => 'Personal MTS',
            'email' => 'soporte@macedotech.test',
            'password' => Hash::make('clave12345'),
        ]);
        $admin->forceFill(['is_platform_admin' => true])->save();

        $this->actingAs($admin, 'sanctum')
            ->withHeader('X-Company-Id', $companyId)
            ->getJson('/api/company')
            ->assertOk();
    }

    public function test_el_registro_publico_esta_cerrado(): void
    {
        $this->postJson('/api/register', [
            'company_name' => 'Intrusa',
            'name' => 'Alguien',
            'email' => 'alguien@intrusa.test',
            'password' => 'clave12345',
        ])->assertStatus(403);
    }
}
