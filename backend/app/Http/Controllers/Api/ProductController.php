<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Catalogo del cliente, desde su propio panel.
 *
 * products lleva RLS, asi que el contexto de empresa que fija el middleware
 * company.context ya limita todo lo de aqui a su inquilino: no hace falta
 * filtrar por company_id a mano (aunque se hace, como defensa en profundidad).
 */
class ProductController extends Controller
{
    public function index(Request $request)
    {
        $companyId = $request->header('X-Company-Id');

        $productos = DB::table('products')
            ->where('company_id', $companyId)
            ->orderBy('position')
            ->get();

        $imagenes = DB::table('media')
            ->where('model_type', 'product')
            ->whereIn('model_id', $productos->pluck('id'))
            ->orderBy('position')
            ->get()
            ->groupBy('model_id');

        $productos->each(function ($producto) use ($imagenes) {
            $producto->designs = $imagenes->get($producto->id, collect())
                ->map(fn ($m) => [
                    'id' => $m->id,
                    'url' => Storage::disk($m->disk)->url($m->path),
                    'alt' => $m->alt_text ?? '',
                    'label' => $m->alt_text ?? '',
                ])
                ->values();
        });

        return response()->json(['products' => $productos]);
    }

    /**
     * Editar un producto.
     *
     * OJO: el slug NO se toca aqui a proposito. Renombrar un producto no debe
     * cambiar su direccion web, o cada correccion de una errata tiraria a la
     * basura el posicionamiento de esa pagina en Google. Cambiar la direccion
     * sera una accion aparte que ademas deje una redireccion.
     */
    public function update(Request $request, string $id)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:150'],
            'description' => ['sometimes', 'nullable', 'string'],
            'price' => ['sometimes', 'numeric', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
            'meta_title' => ['sometimes', 'nullable', 'string', 'max:200'],
            'meta_description' => ['sometimes', 'nullable', 'string', 'max:300'],
        ]);

        $companyId = $request->header('X-Company-Id');

        $existe = DB::table('products')
            ->where('id', $id)
            ->where('company_id', $companyId)
            ->exists();

        if (! $existe) {
            return response()->json(['message' => 'El producto no existe'], 404);
        }

        if ($data === []) {
            return response()->json(['message' => 'No hay nada que actualizar'], 422);
        }

        DB::table('products')->where('id', $id)->update($data + ['updated_at' => now()]);

        return $this->index($request);
    }
}
