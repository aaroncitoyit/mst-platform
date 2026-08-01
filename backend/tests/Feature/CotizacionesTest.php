<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\CompanyProvisioner;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Cotizaciones del cliente.
 *
 * Flujo completo: la web crea la cotizacion (producto + diseno, precio
 * congelado), el asesor pone cantidades en el panel, se genera el enlace
 * publico y el cliente final lo abre. Lo critico que hay que vigilar aqui es el
 * aislamiento: una cotizacion es un dato del inquilino y solo su empresa la ve.
 */
class CotizacionesTest extends TestCase
{
    use DatabaseTransactions;

    private ?User $admin = null;

    private function admin(): User
    {
        if ($this->admin === null) {
            $this->admin = User::create([
                'name' => 'Personal MTS',
                'email' => 'cotizaciones@macedotech.test',
                'password' => Hash::make('clave12345'),
            ]);
            $this->admin->forceFill(['is_platform_admin' => true])->save();
        }

        return $this->admin;
    }

    /** Crea una empresa con su usuario de panel (quien atiende las cotizaciones). */
    private function empresaConUsuario(string $nombre): array
    {
        return app(CompanyProvisioner::class)->provision($nombre, null, [
            'name' => "Dueno de $nombre",
            'email' => strtolower(str_replace(' ', '', $nombre)).'@cotizaciones.test',
            'password' => 'clave12345',
        ]);
    }

    /** Clave con la que la web del cliente habla con MTS. */
    private function claveDe(string $companyId): string
    {
        return $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/admin/companies/{$companyId}/api-keys", ['name' => 'Web'])
            ->json('key');
    }

    private function crearProducto(string $companyId, string $nombre, float $precio = 20): string
    {
        app(CompanyProvisioner::class)->setCompanyContext($companyId);

        $slug = DB::selectOne(
            'select generar_slug_producto(?::uuid, ?) as slug',
            [$companyId, $nombre],
        )->slug;

        return DB::table('products')->insertGetId([
            'company_id' => $companyId,
            'name' => $nombre,
            'slug' => $slug,
            'price' => $precio,
            'is_active' => true,
        ], 'id');
    }

    private function crearDiseno(string $companyId, string $modelId, string $path): string
    {
        return DB::table('media')->insertGetId([
            'company_id' => $companyId,
            'model_type' => 'product',
            'model_id' => $modelId,
            'disk' => 'public',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'size_bytes' => 100,
            'position' => 0,
            'alt_text' => 'Diseno de prueba',
        ], 'id');
    }

    public function test_la_web_crea_la_cotizacion_con_precio_congelado(): void
    {
        ['company' => $company] = app(CompanyProvisioner::class)->provision('Imprenta Cotiza');
        $key = $this->claveDe($company->id);

        app(CompanyProvisioner::class)->setCompanyContext($company->id);
        $producto = $this->crearProducto($company->id, 'Tazas de color', 20);
        $diseno = $this->crearDiseno($company->id, $producto, 'fotos/tazas.jpg');

        $respuesta = $this->withHeader('X-MTS-Key', $key)
            ->postJson('/api/public/cotizaciones', [
                'source' => 'https://demo.macedotech.pe/tazas-de-color',
                'items' => [
                    ['product_id' => $producto, 'design_id' => $diseno],
                ],
            ]);

        $respuesta->assertCreated();
        $this->assertSame(4, strlen($respuesta->json('quote.reference')));

        $quoteId = $respuesta->json('quote.id');
        $this->assertSame('nueva', DB::table('quote_requests')->where('id', $quoteId)->value('status'));

        $linea = DB::table('quote_request_items')->where('quote_request_id', $quoteId)->first();
        $this->assertSame('Tazas de color', $linea->product_name);
        $this->assertSame('20.00', (string) $linea->unit_price);
        $this->assertSame($diseno, $linea->design_id);
        $this->assertNull($linea->quantity, 'La cantidad la pone el asesor, no la web.');
        $this->assertNull(DB::table('quote_requests')->where('id', $quoteId)->value('public_token'));

        // El precio queda congelado: si sube el producto, la cotizacion no cambia
        DB::table('products')->where('id', $producto)->update(['price' => 99]);
        $this->assertSame(
            '20.00',
            (string) DB::table('quote_request_items')->where('quote_request_id', $quoteId)->value('unit_price'),
        );
    }

    public function test_sin_clave_o_con_items_vacios_no_se_crea_la_cotizacion(): void
    {
        $this->postJson('/api/public/cotizaciones', ['items' => [['slug' => 'x']]])
            ->assertStatus(401);

        ['company' => $company] = app(CompanyProvisioner::class)->provision('Imprenta Vacios');
        $key = $this->claveDe($company->id);

        $this->withHeader('X-MTS-Key', $key)
            ->postJson('/api/public/cotizaciones', ['items' => []])
            ->assertStatus(422);
    }

    public function test_un_producto_oculto_o_inexistente_no_descarta_la_solicitud(): void
    {
        ['company' => $company] = app(CompanyProvisioner::class)->provision('Imprenta Perdidos');
        $key = $this->claveDe($company->id);

        $respuesta = $this->withHeader('X-MTS-Key', $key)
            ->postJson('/api/public/cotizaciones', [
                'items' => [['slug' => 'tazas-que-ya-no-existen']],
            ]);

        $respuesta->assertCreated();
        $quoteId = $respuesta->json('quote.id');
        $linea = DB::table('quote_request_items')->where('quote_request_id', $quoteId)->first();

        $this->assertNull($linea->product_id);
        $this->assertSame('tazas-que-ya-no-existen', $linea->product_name);
        $this->assertSame('0.00', (string) $linea->unit_price);
    }

    public function test_un_diseno_de_otra_empresa_no_se_guarda_en_la_cotizacion(): void
    {
        ['company' => $a] = app(CompanyProvisioner::class)->provision('Imprenta Diseno A');
        ['company' => $b] = app(CompanyProvisioner::class)->provision('Imprenta Diseno B');
        $keyA = $this->claveDe($a->id);

        app(CompanyProvisioner::class)->setCompanyContext($b->id);
        $productoB = $this->crearProducto($b->id, 'Tazas de B');
        $disenoB = $this->crearDiseno($b->id, $productoB, 'fotos/b.jpg');

        $respuesta = $this->withHeader('X-MTS-Key', $keyA)
            ->postJson('/api/public/cotizaciones', [
                'items' => [
                    ['product_id' => $productoB, 'design_id' => $disenoB],
                ],
            ]);

        // La clave de A no ve los productos de B, pero la solicitud no se pierde:
        // la linea queda con nombre de recurso y sin diseno ajeno.
        $respuesta->assertCreated();
        $linea = DB::table('quote_request_items')
            ->where('quote_request_id', $respuesta->json('quote.id'))
            ->first();
        $this->assertNull($linea->product_id);
        $this->assertNull($linea->design_id);
    }

    public function test_el_asesor_completa_cantidades_y_se_genera_el_enlace(): void
    {
        $result = $this->empresaConUsuario('Imprenta Flujo');
        $company = $result['company'];
        $key = $this->claveDe($company->id);

        $p1 = $this->crearProducto($company->id, 'Tazas', 20);
        $p2 = $this->crearProducto($company->id, 'Termos', 45);

        $creada = $this->withHeader('X-MTS-Key', $key)
            ->postJson('/api/public/cotizaciones', [
                'items' => [['product_id' => $p1], ['product_id' => $p2]],
            ]);
        $quoteId = $creada->json('quote.id');

        // En el panel aparece nueva, sin cantidades ni token
        $panel = $this->actingAs($result['user'], 'sanctum')
            ->withHeader('X-Company-Id', $company->id)
            ->getJson('/api/quotes');

        $panel->assertOk();
        $this->assertSame($quoteId, $panel->json('quotes.0.id'));
        $this->assertSame('nueva', $panel->json('quotes.0.status'));
        $this->assertNull($panel->json('quotes.0.public_token'));
        $this->assertNull($panel->json('quotes.0.items.0.quantity'));

        // El asesor pone las cantidades
        $items = $panel->json('quotes.0.items');
        $puesta = $this->actingAs($result['user'], 'sanctum')
            ->withHeader('X-Company-Id', $company->id)
            ->patchJson("/api/quotes/{$quoteId}/items", [
                'quantities' => [
                    $items[0]['id'] => 10,
                    $items[1]['id'] => 2,
                ],
            ]);

        $puesta->assertOk();
        $this->assertSame('cotizada', $puesta->json('quote.status'));
        $this->assertSame(10, $puesta->json('quote.items.0.quantity'));
        $token = $puesta->json('quote.public_token');
        $this->assertNotNull($token);
        $this->assertSame(40, strlen($token));

        // El enlace publico se abre sin clave y marca la primera visita
        $enlace = $this->getJson("/api/public/cotizaciones/{$token}");
        $enlace->assertOk()->assertJsonPath('quote.status', 'vista');
        $viewedAt = $enlace->json('quote.viewed_at');
        $this->assertNotNull($viewedAt);

        // Segunda visita: no reescribe viewed_at
        $this->getJson("/api/public/cotizaciones/{$token}")
            ->assertOk()
            ->assertJsonPath('quote.viewed_at', $viewedAt);

        // Un token inventado no existe
        $this->getJson('/api/public/cotizaciones/'.str_repeat('x', 40))
            ->assertStatus(404);
    }

    public function test_un_cliente_no_ve_las_cotizaciones_de_otro(): void
    {
        $a = $this->empresaConUsuario('Imprenta Vecina Cotiza A');
        $b = $this->empresaConUsuario('Imprenta Vecina Cotiza B');

        app(CompanyProvisioner::class)->setCompanyContext($a['company']->id);
        $producto = $this->crearProducto($a['company']->id, 'Producto secreto de A');
        $keyA = $this->claveDe($a['company']->id);

        $this->withHeader('X-MTS-Key', $keyA)
            ->postJson('/api/public/cotizaciones', ['items' => [['product_id' => $producto]]])
            ->assertCreated();

        $respuesta = $this->actingAs($b['user'], 'sanctum')
            ->withHeader('X-Company-Id', $b['company']->id)
            ->getJson('/api/quotes');

        $respuesta->assertOk();
        $this->assertSame([], $respuesta->json('quotes'));
    }

    public function test_una_cotizacion_cerrada_no_se_reabre(): void
    {
        $result = $this->empresaConUsuario('Imprenta Ganada');
        $company = $result['company'];
        $key = $this->claveDe($company->id);

        $producto = $this->crearProducto($company->id, 'Tazas', 20);
        $creada = $this->withHeader('X-MTS-Key', $key)
            ->postJson('/api/public/cotizaciones', ['items' => [['product_id' => $producto]]]);
        $quoteId = $creada->json('quote.id');

        $items = DB::table('quote_request_items')->where('quote_request_id', $quoteId)->pluck('id');

        $this->actingAs($result['user'], 'sanctum')
            ->withHeader('X-Company-Id', $company->id)
            ->patchJson("/api/quotes/{$quoteId}/items", ['quantities' => [$items[0] => 5]])
            ->assertOk();

        $ganada = $this->actingAs($result['user'], 'sanctum')
            ->withHeader('X-Company-Id', $company->id)
            ->patchJson("/api/quotes/{$quoteId}/status", ['status' => 'ganada'])
            ->assertOk()
            ->json('quote');

        $this->assertSame('ganada', $ganada['status']);
        $tokenAntes = $ganada['public_token'];

        // Volver a tocar cantidades no la reabre ni cambia el token
        $reabierta = $this->actingAs($result['user'], 'sanctum')
            ->withHeader('X-Company-Id', $company->id)
            ->patchJson("/api/quotes/{$quoteId}/items", ['quantities' => [$items[0] => 20]])
            ->assertOk()
            ->json('quote');

        $this->assertSame('ganada', $reabierta['status']);
        $this->assertSame($tokenAntes, $reabierta['public_token']);
    }
}
