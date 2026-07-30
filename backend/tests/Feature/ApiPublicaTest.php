<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CompanyProvisioner;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * La API publica: lo unico de MTS abierto a internet.
 *
 * La clave de sitio identifica al inquilino sin usuario logueado. Lo critico es
 * que siga aislando igual: una clave solo puede ver el catalogo de SU empresa.
 */
class ApiPublicaTest extends TestCase
{
    use DatabaseTransactions;

    private ?User $admin = null;

    /** Se reutiliza: varios tests lo piden mas de una vez y el correo es unico. */
    private function admin(): User
    {
        if ($this->admin === null) {
            $this->admin = User::create([
                'name' => 'Personal MTS',
                'email' => 'apipublica@macedotech.test',
                'password' => Hash::make('clave12345'),
            ]);
            $this->admin->forceFill(['is_platform_admin' => true])->save();
        }

        return $this->admin;
    }

    /** @return array{company: object, key: string} */
    private function empresaConClave(string $nombre, ?string $origenes = null): array
    {
        $company = app(CompanyProvisioner::class)->provision($nombre)['company'];

        $respuesta = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/admin/companies/{$company->id}/api-keys", [
                'name' => 'Web',
                'allowed_origins' => $origenes,
            ]);

        return ['company' => $company, 'key' => $respuesta->json('key')];
    }

    private function crearProducto(string $companyId, string $nombre, bool $activo = true): void
    {
        app(CompanyProvisioner::class)->setCompanyContext($companyId);

        $slug = DB::selectOne('select generar_slug_producto(?::uuid, ?) as slug', [$companyId, $nombre])->slug;

        DB::table('products')->insert([
            'company_id' => $companyId,
            'name' => $nombre,
            'slug' => $slug,
            'price' => 20,
            'is_active' => $activo,
        ]);
    }

    public function test_la_clave_se_devuelve_solo_al_crearla(): void
    {
        $company = app(CompanyProvisioner::class)->provision('Imprenta Clave')['company'];

        $respuesta = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/admin/companies/{$company->id}/api-keys", ['name' => 'Web']);

        $respuesta->assertCreated();
        $this->assertStringStartsWith('mts_', $respuesta->json('key'));

        // Al listarlas ya no aparece: en la base solo queda el hash
        $listado = $this->actingAs($this->admin(), 'sanctum')
            ->getJson("/api/admin/companies/{$company->id}/api-keys");

        $this->assertArrayNotHasKey('key', $listado->json('keys.0'));
        $this->assertArrayNotHasKey('key_hash', $listado->json('keys.0'));
    }

    public function test_la_web_puede_leer_su_catalogo_sin_usuario(): void
    {
        ['company' => $company, 'key' => $key] = $this->empresaConClave('Imprenta Publica');
        $this->crearProducto($company->id, 'Tazas de color');

        $this->withHeader('X-MTS-Key', $key)
            ->getJson('/api/public/catalogo')
            ->assertOk()
            ->assertJsonPath('products.0.name', 'Tazas de color')
            ->assertJsonPath('products.0.slug', 'tazas-de-color');
    }

    public function test_una_clave_no_ve_el_catalogo_de_otra_empresa(): void
    {
        // El test que importa: si esto falla, un cliente publica el catalogo de otro.
        ['company' => $a, 'key' => $claveA] = $this->empresaConClave('Imprenta Publica A');
        ['company' => $b] = $this->empresaConClave('Imprenta Publica B');

        $this->crearProducto($a->id, 'Producto de A');
        $this->crearProducto($b->id, 'Producto de B');

        $nombres = collect(
            $this->withHeader('X-MTS-Key', $claveA)->getJson('/api/public/catalogo')->json('products')
        )->pluck('name');

        $this->assertTrue($nombres->contains('Producto de A'));
        $this->assertFalse($nombres->contains('Producto de B'), 'La clave de A no puede ver productos de B.');
    }

    public function test_los_productos_ocultos_no_se_publican(): void
    {
        ['company' => $company, 'key' => $key] = $this->empresaConClave('Imprenta Ocultos');
        $this->crearProducto($company->id, 'Visible');
        $this->crearProducto($company->id, 'Descatalogado', activo: false);

        $nombres = collect(
            $this->withHeader('X-MTS-Key', $key)->getJson('/api/public/catalogo')->json('products')
        )->pluck('name');

        $this->assertTrue($nombres->contains('Visible'));
        $this->assertFalse($nombres->contains('Descatalogado'));
    }

    public function test_sin_clave_o_con_clave_invalida_no_se_entra(): void
    {
        $this->getJson('/api/public/catalogo')->assertStatus(401);

        $this->withHeader('X-MTS-Key', 'mts_inventada')
            ->getJson('/api/public/catalogo')
            ->assertStatus(401);
    }

    public function test_una_clave_revocada_deja_de_funcionar(): void
    {
        ['company' => $company, 'key' => $key] = $this->empresaConClave('Imprenta Revoca');
        $this->crearProducto($company->id, 'Tazas');

        $this->withHeader('X-MTS-Key', $key)->getJson('/api/public/catalogo')->assertOk();

        $keyId = $this->actingAs($this->admin(), 'sanctum')
            ->getJson("/api/admin/companies/{$company->id}/api-keys")
            ->json('keys.0.id');

        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/admin/companies/{$company->id}/api-keys/{$keyId}")
            ->assertOk();

        $this->withHeader('X-MTS-Key', $key)
            ->getJson('/api/public/catalogo')
            ->assertStatus(401);
    }

    public function test_se_rechaza_un_origen_no_autorizado(): void
    {
        ['company' => $company, 'key' => $key] = $this->empresaConClave(
            'Imprenta Origen',
            'https://sublimartes21.com',
        );
        $this->crearProducto($company->id, 'Tazas');

        $this->withHeaders(['X-MTS-Key' => $key, 'Origin' => 'https://sublimartes21.com'])
            ->getJson('/api/public/catalogo')
            ->assertOk();

        $this->withHeaders(['X-MTS-Key' => $key, 'Origin' => 'https://sitio-pirata.com'])
            ->getJson('/api/public/catalogo')
            ->assertStatus(403);
    }
}
