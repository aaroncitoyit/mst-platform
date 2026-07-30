<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\CompanyProvisioner;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Claves de API de un cliente, desde el back-office.
 *
 * Solo Macedo Tech las crea y las revoca: son la credencial con la que la web
 * del cliente habla con MTS.
 */
class ApiKeyController extends Controller
{
    public function __construct(private CompanyProvisioner $provisioner)
    {
    }

    public function index(Request $request, string $companyId)
    {
        // company_api_keys lleva RLS
        $this->provisioner->setCompanyContext($companyId);

        return response()->json([
            'keys' => DB::table('company_api_keys')
                ->where('company_id', $companyId)
                ->orderByDesc('created_at')
                ->get(['id', 'name', 'key_prefix', 'allowed_origins', 'last_used_at', 'revoked_at', 'created_at']),
        ]);
    }

    /**
     * Genera una clave nueva.
     *
     * Es la UNICA vez que se devuelve en claro: en la base solo queda su hash,
     * asi que si el cliente la pierde hay que revocarla y crear otra. Es
     * deliberado — una clave que se puede volver a consultar es una clave que
     * cualquiera con acceso al panel puede robar.
     */
    public function store(Request $request, string $companyId)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'allowed_origins' => ['nullable', 'string', 'max:500'],
        ]);

        if (! DB::table('companies')->where('id', $companyId)->exists()) {
            return response()->json(['message' => 'El cliente no existe'], 404);
        }

        $this->provisioner->setCompanyContext($companyId);

        // El prefijo permite reconocerla en el panel sin revelarla entera
        $clave = 'mts_'.Str::random(40);
        $prefijo = substr($clave, 0, 12);

        $id = DB::table('company_api_keys')->insertGetId([
            'company_id' => $companyId,
            'name' => $data['name'],
            'key_prefix' => $prefijo,
            'key_hash' => hash('sha256', $clave),
            'allowed_origins' => $data['allowed_origins'] ?? null,
        ], 'id');

        return response()->json([
            'id' => $id,
            // En claro una sola vez
            'key' => $clave,
            'aviso' => 'Copiala ahora: no se puede volver a consultar.',
        ], 201);
    }

    public function revoke(string $companyId, string $id)
    {
        $this->provisioner->setCompanyContext($companyId);

        $afectadas = DB::table('company_api_keys')
            ->where('id', $id)
            ->where('company_id', $companyId)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);

        if ($afectadas === 0) {
            return response()->json(['message' => 'La clave no existe o ya estaba revocada'], 404);
        }

        return response()->json(['message' => 'Clave revocada']);
    }
}
