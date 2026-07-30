<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        api: __DIR__.'/../routes/api.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // En un hosting gestionado (Render, Fly, Railway) el TLS termina en el
        // borde y a la aplicacion le llega HTTP con X-Forwarded-Proto. Sin
        // confiar en esa cabecera pasan tres cosas, y ninguna da error:
        //
        //  - $request->secure() es false, asi que la cabecera HSTS de
        //    SecurityHeaders no se envia NUNCA aunque el sitio vaya por HTTPS.
        //  - las URL generadas salen con http://.
        //  - $request->ip() devuelve la IP del proxy y no la del visitante, con
        //    lo que el throttle de las rutas publicas mete a todo el mundo en
        //    el mismo cubo: el trafico de un cliente agota el limite de todos.
        //
        // Se confia en cualquier proxy ('*') porque estas plataformas no
        // publican un rango de IPs fijo. Es seguro mientras el contenedor solo
        // sea accesible a traves de su balanceador, que es como funciona
        // Render: nadie puede hablar con el directamente para falsear la
        // cabecera.
        $middleware->trustProxies(at: '*');

        // Cabeceras de seguridad en TODAS las respuestas, incluidas las de
        // error. Van con la aplicacion y no en la configuracion del servidor
        // web para que no se pierdan al cambiar de hosting.
        $middleware->append(\App\Http\Middleware\SecurityHeaders::class);

        $middleware->alias([
            'company.context' => \App\Http\Middleware\EnsureCompanyContext::class,
            'user.active' => \App\Http\Middleware\EnsureActiveUser::class,
            'platform.admin' => \App\Http\Middleware\EnsurePlatformAdmin::class,
            'api.key' => \App\Http\Middleware\ResolveCompanyFromApiKey::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
