<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * "Que mas le puedo ofrecer a este cliente".
 *
 * Sirve para apuntar la idea cuando se te ocurre ("a este le vendria bien una
 * tienda online") en vez de perderla. Como client_services, NO lleva RLS: son
 * apuntes internos de Macedo Tech sobre su cartera.
 */
class OpportunityController extends Controller
{
    private const ESTADOS = ['idea', 'propuesta', 'ganada', 'perdida'];

    public function store(Request $request, string $companyId)
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string'],
            'estimated_value' => ['nullable', 'numeric', 'min:0'],
            'status' => ['sometimes', Rule::in(self::ESTADOS)],
        ]);

        if (! DB::table('companies')->where('id', $companyId)->exists()) {
            return response()->json(['message' => 'El cliente no existe'], 404);
        }

        $id = DB::table('opportunities')->insertGetId(
            $data + ['company_id' => $companyId],
            'id',
        );

        return response()->json(['opportunity' => $this->find($id)], 201);
    }

    public function update(Request $request, string $id)
    {
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:200'],
            'description' => ['sometimes', 'nullable', 'string'],
            'estimated_value' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'status' => ['sometimes', Rule::in(self::ESTADOS)],
        ]);

        if (! $this->find($id)) {
            return response()->json(['message' => 'La oportunidad no existe'], 404);
        }

        if ($data === []) {
            return response()->json(['message' => 'No hay nada que actualizar'], 422);
        }

        DB::table('opportunities')->where('id', $id)->update($data + ['updated_at' => now()]);

        return response()->json(['opportunity' => $this->find($id)]);
    }

    public function destroy(string $id)
    {
        if (! $this->find($id)) {
            return response()->json(['message' => 'La oportunidad no existe'], 404);
        }

        DB::table('opportunities')->where('id', $id)->delete();

        return response()->json(['message' => 'Oportunidad eliminada']);
    }

    private function find(string $id)
    {
        return DB::table('opportunities')->where('id', $id)->first();
    }
}
