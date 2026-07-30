<?php

namespace App\Console\Commands;

use App\Services\CompanyProvisioner;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Importa el catalogo de un cliente desde el JSON de su web.
 *
 * Todo cliente que llega tiene ya sus productos en algun sitio: un JSON, un
 * Excel, el codigo de su web. Teclearlos a mano en el panel es la forma segura
 * de que la implantacion se haga larga y con erratas.
 *
 * Formato esperado (el de sublimartes21.com):
 *   {
 *     "catalogProducts": [ {id, name, price, image, category}, ... ],
 *     "categoryGalleries": { "categoria": ["/ruta/img1.jpeg", ...] }
 *   }
 */
class ImportarCatalogo extends Command
{
    protected $signature = 'mts:importar-catalogo
                            {empresa : ID o slug de la empresa}
                            {json : Ruta al archivo data.json}
                            {--assets= : Carpeta publica de la web, para copiar las imagenes}';

    protected $description = 'Importa productos e imagenes desde el JSON de la web de un cliente';

    public function handle(CompanyProvisioner $provisioner): int
    {
        $empresa = $this->argument('empresa');

        // companies.id es UUID: comparar un slug contra esa columna hace que
        // PostgreSQL falle en vez de no encontrar nada. Solo se busca por id
        // cuando el argumento tiene forma de UUID.
        $esUuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $empresa);

        $company = DB::table('companies')
            ->when($esUuid, fn ($q) => $q->where('id', $empresa))
            ->when(! $esUuid, fn ($q) => $q->where('slug', $empresa))
            ->first();

        if (! $company) {
            $this->error('No existe esa empresa.');

            return self::FAILURE;
        }

        $rutaJson = $this->argument('json');

        if (! is_file($rutaJson)) {
            $this->error("No se encontro el archivo: {$rutaJson}");

            return self::FAILURE;
        }

        $datos = json_decode(file_get_contents($rutaJson), true);

        if (! isset($datos['catalogProducts'])) {
            $this->error('El JSON no tiene "catalogProducts".');

            return self::FAILURE;
        }

        // products y media llevan RLS: sin contexto, los INSERT serian
        // rechazados por la politica tenant_isolation.
        $provisioner->setCompanyContext($company->id);

        $galerias = $datos['categoryGalleries'] ?? [];
        $assets = rtrim((string) $this->option('assets'), '/\\');

        $creados = 0;
        $omitidos = 0;
        $imagenes = 0;

        $this->info("Importando el catalogo de {$company->name}...");

        foreach ($datos['catalogProducts'] as $fila) {
            $nombre = trim($fila['name'] ?? '');

            if ($nombre === '') {
                continue;
            }

            // Idempotente: si ya existe un producto con ese nombre, no se
            // duplica. Permite reejecutar la importacion sin miedo.
            $existe = DB::table('products')
                ->where('company_id', $company->id)
                ->whereRaw('lower(name) = lower(?)', [$nombre])
                ->exists();

            if ($existe) {
                $omitidos++;
                continue;
            }

            $slug = DB::selectOne(
                'select generar_slug_producto(?::uuid, ?) as slug',
                [$company->id, $nombre],
            )->slug;

            $productId = DB::table('products')->insertGetId([
                'company_id' => $company->id,
                'name' => $nombre,
                'slug' => $slug,
                'price' => (float) ($fila['price'] ?? 0),
                'position' => $creados,
                // Se generan solos: el cliente no tiene por que saber que es
                // una meta descripcion. Puede afinarlas despues.
                'meta_title' => "{$nombre} personalizados | {$company->name}",
                'meta_description' => "{$nombre} personalizados con tu diseño. Sublimacion profesional, envios a todo el pais.",
            ], 'id');

            // Imagen principal primero (position 0), luego la galeria
            $rutas = array_filter(array_merge(
                [$fila['image'] ?? null],
                $galerias[$fila['category'] ?? ''] ?? [],
            ));

            foreach (array_values($rutas) as $orden => $ruta) {
                if ($this->copiarImagen($company->id, $productId, $nombre, $ruta, $orden, $assets)) {
                    $imagenes++;
                }
            }

            $creados++;
            $this->line(sprintf('  %-30s S/%-7s /%s', $nombre, $fila['price'] ?? '?', $slug));
        }

        $this->newLine();
        $this->info("{$creados} productos creados, {$imagenes} imagenes, {$omitidos} omitidos por existir ya.");

        if ($assets === '') {
            $this->warn('Sin --assets: se guardaron las rutas pero no se copiaron los archivos.');
        }

        return self::SUCCESS;
    }

    /**
     * Copia el archivo a la carpeta publica de Laravel y registra la fila en
     * media. Si no se paso --assets, solo registra la ruta original.
     */
    private function copiarImagen(
        string $companyId,
        string $productId,
        string $nombreProducto,
        string $ruta,
        int $orden,
        string $assets,
    ): bool {
        $destino = "productos/{$companyId}/".basename($ruta);

        if ($assets !== '') {
            $origen = $assets.'/'.ltrim($ruta, '/');

            if (! is_file($origen)) {
                $this->warn("  imagen no encontrada: {$ruta}");

                return false;
            }

            Storage::disk('public')->put($destino, file_get_contents($origen));
        }

        DB::table('media')->insert([
            'company_id' => $companyId,
            'model_type' => 'product',
            'model_id' => $productId,
            'disk' => 'public',
            'path' => $destino,
            'mime_type' => 'image/jpeg',
            'position' => $orden,
            // Nunca vacio: el texto alternativo es accesibilidad y SEO
            'alt_text' => $orden === 0
                ? $nombreProducto
                : "{$nombreProducto} - diseño ".$orden,
        ]);

        return true;
    }
}
