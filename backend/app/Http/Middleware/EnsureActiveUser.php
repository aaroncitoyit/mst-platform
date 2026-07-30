<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Bloquea a los usuarios desactivados desde el back-office.
 *
 * Los tokens de Sanctum ya emitidos siguen existiendo tras desactivar a un
 * usuario; lo que los inutiliza es esta comprobacion en cada peticion. Por eso
 * va en todos los grupos autenticados y no solo en el login.
 */
class EnsureActiveUser
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()->is_active) {
            return response()->json(['message' => 'Tu usuario esta desactivado.'], 403);
        }

        return $next($request);
    }
}
