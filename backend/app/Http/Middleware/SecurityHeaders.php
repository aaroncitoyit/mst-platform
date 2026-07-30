<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cabeceras de seguridad en todas las respuestas.
 *
 * Son baratas y tapan familias enteras de ataque. Van aqui y no en el servidor
 * web para que viajen con la aplicacion: si mañana cambias de hosting, no se
 * quedan olvidadas en una configuracion de nginx.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // El navegador no adivina el tipo de contenido. Evita que un archivo
        // subido como imagen se acabe ejecutando como script.
        $response->headers->set('X-Content-Type-Options', 'nosniff');

        // Nadie puede meter el panel en un iframe: sin esto, un sitio hostil
        // puede superponer botones invisibles sobre el tuyo (clickjacking).
        $response->headers->set('X-Frame-Options', 'DENY');

        // Al salir hacia otro dominio no se filtra la ruta completa, que puede
        // llevar identificadores en la URL.
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');

        // Esta API no necesita camara, microfono ni ubicacion.
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

        // HSTS: obliga al navegador a usar HTTPS durante un año, incluso si
        // alguien teclea http://. Solo en produccion y sobre una peticion ya
        // segura: activarlo en local dejaria el navegador negandose a abrir
        // http://localhost durante meses, y eso se arregla a mano en la
        // configuracion del navegador.
        if (app()->environment('production') && $request->secure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
