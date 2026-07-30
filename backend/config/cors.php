<?php

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
|
| Sin este archivo, Laravel acepta peticiones desde CUALQUIER origen. Con
| autenticacion por token el riesgo es menor que con cookies, pero significa
| que cualquier web podria llamar a la API con un token robado.
|
| Los origenes se configuran por entorno (CORS_ORIGENES en el .env, separados
| por comas) porque cambian entre local y produccion:
|
|   local:      http://localhost:5173
|   produccion: https://panel.macedotech.pe,https://sublimartes21.com
|
| Si CORS_ORIGENES esta vacio se cae a localhost, para no romper el desarrollo.
| En produccion hay que definirlo si o si.
|
*/

$origenes = array_filter(array_map(
    'trim',
    explode(',', (string) env('CORS_ORIGENES', 'http://localhost:5173,http://127.0.0.1:5173')),
));

return [

    // /c/* es el enlace publico de una cotizacion: lo abre el cliente final
    'paths' => ['api/*', 'c/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $origenes,

    'allowed_origins_patterns' => [],

    // X-Company-Id y X-MTS-Key son cabeceras propias: sin esto el navegador
    // bloquearia la peticion antes de enviarla.
    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 3600,

    // La autenticacion va por token en la cabecera Authorization, no por
    // cookies de sesion. Ponerlo a true obligaria a listar origenes exactos y
    // no aporta nada aqui.
    'supports_credentials' => false,

];
