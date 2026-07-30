<?php

namespace Tests\Feature;

use App\Services\CompanyProvisioner;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * El catalogo del cliente.
 *
 * Lo que se prueba aqui es sobre todo el slug: es la direccion web del producto
 * y si cambia sola, cada edicion del cliente devuelve un 404 y tira a la basura
 * el posicionamiento de esa pagina en Google.
 */
class ProductosTest extends TestCase
{
    use DatabaseTransactions;

    private function empresaConUsuario(string $nombre): array
    {
        return app(CompanyProvisioner::class)->provision($nombre, null, [
            'name' => "Dueno de $nombre",
            'email' => strtolower(str_replace(' ', '', $nombre)).'@productos.test',
            'password' => 'clave12345',
        ]);
    }

    private function crearProducto(string $companyId, string $nombre, float $precio = 20): string
    {
        $slug = DB::selectOne(
            'select generar_slug_producto(?::uuid, ?) as slug',
            [$companyId, $nombre],
        )->slug;

        return DB::table('products')->insertGetId([
            'company_id' => $companyId,
            'name' => $nombre,
            'slug' => $slug,
            'price' => $precio,
        ], 'id');
    }

    public function test_el_slug_se_genera_limpio_del_nombre(): void
    {
        $company = app(CompanyProvisioner::class)->provision('Imprenta Slug')['company'];
        app(CompanyProvisioner::class)->setCompanyContext($company->id);

        $casos = [
            'Tazas de color' => 'tazas-de-color',
            'Termos para Autos' => 'termos-para-autos',
            'Rompe cabezas 120 piezas' => 'rompe-cabezas-120-piezas',
            '  ¡Diseño Ñandú!  ' => 'diseno-nandu',
        ];

        foreach ($casos as $nombre => $esperado) {
            $slug = DB::selectOne(
                'select generar_slug_producto(?::uuid, ?) as slug',
                [$company->id, $nombre],
            )->slug;

            $this->assertSame($esperado, $slug, "Fallo con: $nombre");
        }
    }

    public function test_dos_productos_con_el_mismo_nombre_no_chocan(): void
    {
        $company = app(CompanyProvisioner::class)->provision('Imprenta Duplicados')['company'];
        app(CompanyProvisioner::class)->setCompanyContext($company->id);

        $this->crearProducto($company->id, 'Tazas de color');

        $segundo = DB::selectOne(
            'select generar_slug_producto(?::uuid, ?) as slug',
            [$company->id, 'Tazas de color'],
        )->slug;

        $this->assertSame('tazas-de-color-2', $segundo);
    }

    public function test_dos_empresas_pueden_usar_el_mismo_slug(): void
    {
        // La unicidad es POR empresa: que un cliente venda tazas no puede
        // impedirle al siguiente tener su propia pagina de tazas.
        $a = app(CompanyProvisioner::class)->provision('Imprenta A')['company'];
        $b = app(CompanyProvisioner::class)->provision('Imprenta B')['company'];

        app(CompanyProvisioner::class)->setCompanyContext($a->id);
        $this->crearProducto($a->id, 'Tazas de color');

        app(CompanyProvisioner::class)->setCompanyContext($b->id);
        $slugB = DB::selectOne(
            'select generar_slug_producto(?::uuid, ?) as slug',
            [$b->id, 'Tazas de color'],
        )->slug;

        $this->assertSame('tazas-de-color', $slugB);
    }

    public function test_renombrar_un_producto_no_cambia_su_direccion_web(): void
    {
        // El test mas importante del archivo: si esto falla, cada vez que el
        // cliente corrija una errata pierde el posicionamiento de esa pagina.
        $result = $this->empresaConUsuario('Imprenta Renombra');
        $company = $result['company'];

        app(CompanyProvisioner::class)->setCompanyContext($company->id);
        $id = $this->crearProducto($company->id, 'Tazas de color');

        $this->actingAs($result['user'], 'sanctum')
            ->withHeader('X-Company-Id', $company->id)
            ->patchJson("/api/products/{$id}", ['name' => 'Tazas bicolor premium'])
            ->assertOk();

        $producto = DB::table('products')->where('id', $id)->first();

        $this->assertSame('Tazas bicolor premium', $producto->name);
        $this->assertSame('tazas-de-color', $producto->slug, 'El slug NO debe cambiar al renombrar.');
    }

    public function test_no_se_puede_cambiar_el_slug_por_la_api(): void
    {
        $result = $this->empresaConUsuario('Imprenta Slug Fijo');
        $company = $result['company'];

        app(CompanyProvisioner::class)->setCompanyContext($company->id);
        $id = $this->crearProducto($company->id, 'Llaveros');

        $this->actingAs($result['user'], 'sanctum')
            ->withHeader('X-Company-Id', $company->id)
            ->patchJson("/api/products/{$id}", ['slug' => 'otro-slug'])
            ->assertStatus(422);

        $this->assertSame('llaveros', DB::table('products')->where('id', $id)->value('slug'));
    }

    public function test_un_cliente_no_ve_el_catalogo_de_otro(): void
    {
        $a = $this->empresaConUsuario('Imprenta Vecina A');
        $b = $this->empresaConUsuario('Imprenta Vecina B');

        app(CompanyProvisioner::class)->setCompanyContext($a['company']->id);
        $this->crearProducto($a['company']->id, 'Producto secreto de A');

        $response = $this->actingAs($b['user'], 'sanctum')
            ->withHeader('X-Company-Id', $b['company']->id)
            ->getJson('/api/products');

        $response->assertOk();
        $this->assertSame([], $response->json('products'));
    }
}
