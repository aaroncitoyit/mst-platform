<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Catalogo publico: lo que consume la web del cliente.
 *
 * Se identifica con la clave de API, no con un usuario. El middleware
 * api.key ya fijo el contexto RLS, asi que products solo devuelve los de esa
 * empresa aunque no se filtre a mano.
 *
 * Devuelve SOLO lo que va a salir publicado en la web. Nada de datos internos:
 * esta clave viaja por internet y hay que asumir que puede filtrarse.
 */
class PublicCatalogController extends Controller
{
    public function index(Request $request)
    {
        $companyId = $request->attributes->get('company_id');

        $productos = DB::table('products')
            ->where('company_id', $companyId)
            ->where('is_active', true)   // lo oculto no se publica
            ->orderBy('position')
            ->get([
                'id', 'slug', 'name', 'description', 'price',
                'meta_title', 'meta_description',
            ]);

        $imagenes = DB::table('media')
            ->where('model_type', 'product')
            ->whereIn('model_id', $productos->pluck('id'))
            ->orderBy('position')
            ->get()
            ->groupBy('model_id');

        // OJO al pasar a R2: url() genera direcciones ESTABLES, que el navegador
        // y el CDN pueden cachear. NO cambiar a temporaryUrl(): las URL firmadas
        // llevan firma y caducidad distintas en cada llamada, el navegador las ve
        // como nuevas y no cachea ninguna. Cada visita pasaria a ser una lectura
        // facturable en R2. El bucket debe ser publico.
        $productos->each(function ($producto) use ($imagenes) {
            $fotos = $imagenes->get($producto->id, collect());

            $producto->images = $fotos
                ->map(fn ($m) => [
                    // id es el design_id que la web manda al pedir cotizacion,
                    // para que el asesor vea en el panel cual diseno eligio.
                    'id' => $m->id,
                    'url' => Storage::disk($m->disk)->url($m->path),
                    // Nunca vacio: es accesibilidad y SEO
                    'alt' => $m->alt_text ?: $producto->name,
                ])
                ->values();

            $producto->price = (float) $producto->price;
        });

        return response()->json([
            'products' => $productos,
            // La web lo usa para saber si tiene que reconstruirse
            'updated_at' => DB::table('products')
                ->where('company_id', $companyId)
                ->max('updated_at'),
        ]);
    }
}
