<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * El comando pide la contrasena con entrada oculta, asi que no se puede probar
 * canalizando stdin desde un script. Aqui si, simulando las respuestas.
 *
 * La cuenta que crea es la mas sensible del sistema: da acceso a los datos de
 * TODOS los clientes. Por eso su politica de contrasena es mas exigente que la
 * de un usuario de cliente.
 */
class CrearAdminCommandTest extends TestCase
{
    use DatabaseTransactions;

    private const PREGUNTA_CLAVE = 'Contrasena (minimo 12, con letras y numeros)';

    public function test_crea_un_administrador_de_plataforma(): void
    {
        $this->artisan('mts:crear-admin')
            ->expectsQuestion('Nombre', 'Aaron Macedo')
            ->expectsQuestion('Correo electronico', 'nuevo-admin@macedotech.test')
            ->expectsQuestion(self::PREGUNTA_CLAVE, 'MacedoTech2026Clave')
            ->expectsQuestion('Repite la contrasena', 'MacedoTech2026Clave')
            ->assertSuccessful();

        $user = User::where('email', 'nuevo-admin@macedotech.test')->first();

        $this->assertNotNull($user);
        $this->assertTrue($user->is_platform_admin);

        // Un administrador de plataforma no pertenece a ninguna empresa
        $this->assertSame(0, DB::table('company_user')->where('user_id', $user->id)->count());
    }

    public function test_rechaza_contrasenas_que_no_coinciden(): void
    {
        $this->artisan('mts:crear-admin')
            ->expectsQuestion('Nombre', 'Aaron Macedo')
            ->expectsQuestion('Correo electronico', 'otro@macedotech.test')
            ->expectsQuestion(self::PREGUNTA_CLAVE, 'MacedoTech2026Clave')
            ->expectsQuestion('Repite la contrasena', 'OtraCosaLarga2026')
            ->assertFailed();

        $this->assertNull(User::where('email', 'otro@macedotech.test')->first());
    }

    public function test_rechaza_una_contrasena_corta(): void
    {
        // 'clave12345' cumpliria para un usuario de cliente (10 caracteres),
        // pero no para la cuenta que puede ver todas las empresas.
        $this->artisan('mts:crear-admin')
            ->expectsQuestion('Nombre', 'Aaron Macedo')
            ->expectsQuestion('Correo electronico', 'corta@macedotech.test')
            ->expectsQuestion(self::PREGUNTA_CLAVE, 'clave12345')
            ->expectsQuestion('Repite la contrasena', 'clave12345')
            ->assertFailed();

        $this->assertNull(User::where('email', 'corta@macedotech.test')->first());
    }
}
