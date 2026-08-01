<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\QuoteService;
use Illuminate\Http\Request;

/**
 * Cotizaciones desde la web del cliente (publica) y enlace publico.
 *
 * Crear cotizaciones va con la clave de sitio (api.key), igual que el catalogo:
 * la web del cliente habla con MTS sin usuario logueado. El enlace publico no
 * lleva clave: ahi el token es la credencial, y la unica barrera es el throttle.
 */
class PublicQuoteController extends Controller
{
    public function __construct(private QuoteService $quotes)
    {
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'source' => ['sometimes', 'nullable', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['sometimes', 'string'],
            'items.*.slug' => ['sometimes', 'string'],
            'items.*.design_id' => ['sometimes', 'string'],
        ]);

        $companyId = $request->attributes->get('company_id');

        $creada = $this->quotes->crearDesdeWeb($companyId, $data['items'], $data['source'] ?? null);

        return response()->json(['quote' => $creada], 201);
    }

    public function show(string $token)
    {
        $quote = $this->quotes->mostrarPublica($token);

        if (! $quote) {
            return response()->json(['message' => 'Cotizacion no encontrada'], 404);
        }

        return response()->json(['quote' => $quote]);
    }
}
