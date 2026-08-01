<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\QuoteService;
use Illuminate\Http\Request;

/**
 * Cotizaciones del panel. Detras de company.context: el middleware ya valido
 * que el usuario pertenece a la empresa del header X-Company-Id y fijo el
 * contexto RLS, asi que cada consulta del servicio solo ve filas de esa empresa.
 */
class QuoteController extends Controller
{
    public function __construct(private QuoteService $quotes)
    {
    }

    public function index(Request $request)
    {
        return response()->json([
            'quotes' => $this->quotes->listar($request->header('X-Company-Id')),
        ]);
    }

    public function show(Request $request, string $id)
    {
        $quote = $this->quotes->mostrar($request->header('X-Company-Id'), $id);

        if (! $quote) {
            return response()->json(['message' => 'Cotizacion no encontrada'], 404);
        }

        return response()->json(['quote' => $quote]);
    }

    public function updateItems(Request $request, string $id)
    {
        $data = $request->validate([
            'quantities' => ['required', 'array'],
            'quantities.*' => ['nullable', 'integer', 'min:1'],
        ]);

        $quote = $this->quotes->ponerCantidades(
            $request->header('X-Company-Id'),
            $id,
            $data['quantities'],
        );

        if (! $quote) {
            return response()->json(['message' => 'Cotizacion no encontrada'], 404);
        }

        return response()->json(['quote' => $quote]);
    }

    public function updateStatus(Request $request, string $id)
    {
        $data = $request->validate([
            'status' => ['required', 'in:enviada,ganada,perdida'],
        ]);

        $quote = $this->quotes->marcarEstado(
            $request->header('X-Company-Id'),
            $id,
            $data['status'],
        );

        if (! $quote) {
            return response()->json(['message' => 'Cotizacion no encontrada'], 404);
        }

        return response()->json(['quote' => $quote]);
    }
}
