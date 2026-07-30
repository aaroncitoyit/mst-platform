<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CompanyProvisioner;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Barreras que no dependen de la logica de negocio.
 *
 * El login es el punto mas atacado de cualquier sistema: es la unica puerta
 * abierta que acepta credenciales. Sin limite de intentos, la cuenta del
 * back-office —que da acceso a los datos de todos los clientes— se puede
 * reventar a fuerza bruta.
 */
class SeguridadTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('');
    }

    public function test_el_login_corta_tras_cuatro_intentos_fallidos(): void
    {
        $credenciales = ['email' => 'noexiste@fuerzabruta.test', 'password' => 'loquesea'];

        // Los 4 primeros responden 401: credenciales invalidas
        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/login', $credenciales)->assertStatus(401);
        }

        // El quinto ya no llega ni a comprobar la contrasena
        $this->postJson('/api/login', $credenciales)->assertStatus(429);
    }

    public function test_los_tokens_se_emiten_con_caducidad(): void
    {
        // Un token sin caducidad sirve para siempre si se filtra: el portatil
        // del cliente, un movil perdido, una copia en un correo.
        $cliente = app(CompanyProvisioner::class)->provision('Imprenta Caducidad', null, [
            'name' => 'Duena',
            'email' => 'duena@caducidad.test',
            'password' => 'clave12345',
        ])['user'];

        $this->postJson('/api/login', [
            'email' => 'duena@caducidad.test',
            'password' => 'clave12345',
        ])->assertOk();

        $expira = DB::table('personal_access_tokens')
            ->where('tokenable_id', $cliente->id)
            ->value('expires_at');

        $this->assertNotNull($expira, 'Todo token debe nacer con fecha de caducidad.');
        $this->assertTrue(now()->addDays(8)->gt($expira), 'El de un cliente no deberia pasar de 7 dias.');
    }

    public function test_el_token_del_personal_de_mts_caduca_mucho_antes(): void
    {
        // Su cuenta ve los datos de TODOS los clientes: vale menos tiempo.
        $admin = User::create([
            'name' => 'Personal MTS',
            'email' => 'caducidad@macedotech.test',
            'password' => Hash::make('MacedoTech2026Clave'),
        ]);
        $admin->forceFill(['is_platform_admin' => true])->save();

        $this->postJson('/api/login', [
            'email' => 'caducidad@macedotech.test',
            'password' => 'MacedoTech2026Clave',
        ])->assertOk();

        $expira = DB::table('personal_access_tokens')
            ->where('tokenable_id', $admin->id)
            ->value('expires_at');

        $this->assertTrue(
            now()->addHours(13)->gt($expira),
            'El token del personal de MTS no deberia durar mas de 12 horas.',
        );
    }

    public function test_un_token_caducado_no_sirve(): void
    {
        $cliente = app(CompanyProvisioner::class)->provision('Imprenta Caducada', null, [
            'name' => 'Duena',
            'email' => 'duena@caducada.test',
            'password' => 'clave12345',
        ])['user'];

        $token = $this->postJson('/api/login', [
            'email' => 'duena@caducada.test',
            'password' => 'clave12345',
        ])->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/my-companies')
            ->assertOk();

        // Se envejece el token a mano
        DB::table('personal_access_tokens')
            ->where('tokenable_id', $cliente->id)
            ->update(['expires_at' => now()->subMinute()]);

        // En HTTP real cada peticion arranca de cero, pero en los tests la
        // aplicacion vive entre llamadas y el guard recuerda al usuario que ya
        // autentico. Sin esto, el test pasaria aunque la caducidad no
        // funcionase.
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/my-companies')
            ->assertStatus(401);
    }

    public function test_el_registro_publico_tambien_esta_limitado(): void
    {
        // Aunque responde 403 por estar cerrado, no debe poder martillearse
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/register', [
                'company_name' => 'X',
                'name' => 'X',
                'email' => "spam{$i}@ejemplo.test",
                'password' => 'clave12345',
            ]);
        }

        $this->postJson('/api/register', [
            'company_name' => 'X',
            'name' => 'X',
            'email' => 'ultimo@ejemplo.test',
            'password' => 'clave12345',
        ])->assertStatus(429);
    }
}
