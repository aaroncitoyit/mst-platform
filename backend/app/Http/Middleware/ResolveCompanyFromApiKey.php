<?php

namespace App\Http\Middleware;

use App\Services\CompanyProvisioner;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Identifica al inquilino por su clave de API, sin usuario logueado.
 *
 * Es lo que permite que la web publica de un cliente hable con MTS. La clave
 * sustituye al usuario como forma de saber de que empresa viene la peticion,
 * pero el aislamiento no cambia: se fija el mismo contexto RLS que fijaria
 * EnsureCompanyContext, y las politicas hacen el resto.
 *
 * Las rutas que usan este middleware deben poder SOLO leer el catalogo y crear
 * cotizaciones. Nunca listar, leer ni modificar nada mas: la clave viaja por
 * internet y hay que asumir que puede filtrarse.
 */
class ResolveCompanyFromApiKey
{
    public function __construct(private CompanyProvisioner $provisioner)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $clave = $request->header('X-MTS-Key');

        if (! $clave) {
            return response()->json(['message' => 'Falta la cabecera X-MTS-Key'], 401);
        }

        // SHA-256 y no bcrypt: hace falta poder BUSCAR por el hash, y bcrypt
        // genera uno distinto cada vez.
        $hash = hash('sha256', $clave);

        // resolver_api_key es SECURITY DEFINER: company_api_keys lleva RLS y sin
        // contexto no devolveria nada, pero el contexto es justo lo que estamos
        // intentando averiguar.
        $companyId = DB::selectOne('select resolver_api_key(?) as company_id', [$hash])?->company_id;

        if (! $companyId) {
            return response()->json(['message' => 'Clave invalida o revocada'], 401);
        }

        $this->provisioner->setCompanyContext($companyId);

        // Origen autorizado. Barrera debil (la cabecera la pone el navegador y
        // se puede falsificar con curl), pero corta el abuso casual. Lo que de
        // verdad acota el daño es que estas rutas no exponen nada sensible.
        $origen = $request->header('Origin');
        $permitidos = DB::table('company_api_keys')
            ->where('key_hash', $hash)
            ->value('allowed_origins');

        if ($permitidos && $origen) {
            $lista = array_map('trim', explode(',', $permitidos));

            if (! in_array($origen, $lista, true)) {
                return response()->json(['message' => 'Origen no autorizado'], 403);
            }
        }

        // Para que el controlador sepa de quien es la peticion
        $request->attributes->set('company_id', $companyId);

        return $next($request);
    }
}
