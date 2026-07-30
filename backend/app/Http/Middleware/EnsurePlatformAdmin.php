<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Restringe el back-office al personal de MTS.
 *
 * Es la unica barrera que protege admin_list_companies(), que es SECURITY
 * DEFINER y cruza todas las empresas: la funcion SQL no comprueba quien la
 * llama, asi que la autorizacion tiene que estar aqui.
 */
class EnsurePlatformAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()->is_platform_admin) {
            return response()->json(['message' => 'No tienes acceso al back-office.'], 403);
        }

        return $next($request);
    }
}
