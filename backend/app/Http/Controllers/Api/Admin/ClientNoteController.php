<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Historial de contacto con el cliente.
 *
 * La otra mitad de "como va el cliente": que se hablo, cuando y que quedo
 * pendiente. Sin esto, dentro de seis meses no recordaras por que aquel cliente
 * dejo de contestar.
 */
class ClientNoteController extends Controller
{
    public function store(Request $request, string $companyId)
    {
        $data = $request->validate([
            'body' => ['required', 'string'],
        ]);

        if (! DB::table('companies')->where('id', $companyId)->exists()) {
            return response()->json(['message' => 'El cliente no existe'], 404);
        }

        $id = DB::table('client_notes')->insertGetId([
            'company_id' => $companyId,
            'user_id' => $request->user()->id,
            'body' => $data['body'],
        ], 'id');

        return response()->json(['note' => $this->find($id)], 201);
    }

    public function destroy(string $id)
    {
        if (! $this->find($id)) {
            return response()->json(['message' => 'La nota no existe'], 404);
        }

        DB::table('client_notes')->where('id', $id)->delete();

        return response()->json(['message' => 'Nota eliminada']);
    }

    private function find(string $id)
    {
        return DB::table('client_notes as n')
            ->leftJoin('users as u', 'u.id', '=', 'n.user_id')
            ->where('n.id', $id)
            ->first(['n.id', 'n.company_id', 'n.body', 'n.created_at', 'u.name as author_name']);
    }
}
