<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('APP_URL').'/storage',
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
            'report' => false,
        ],

        /*
        |----------------------------------------------------------------------
        | Cloudflare R2 — donde viven las fotos de producto en produccion
        |----------------------------------------------------------------------
        |
        | Cloud Run tiene disco EFIMERO: cada redespliegue arranca un contenedor
        | nuevo y vacio. Con el disco 'public', las fotos del catalogo durarian
        | hasta el siguiente despliegue. Por eso existe este disco.
        |
        | Que disco se usa de verdad lo decide config('mts.media_disk'), no este
        | archivo: en local sigue siendo 'public' para no depender de la red.
        |
        */

        'r2' => [
            'driver' => 's3',
            'key' => env('R2_ACCESS_KEY_ID'),
            'secret' => env('R2_SECRET_ACCESS_KEY'),

            // R2 no tiene regiones: replica solo. El SDK de AWS exige el campo
            // igualmente, y 'auto' es el valor que Cloudflare documenta.
            'region' => 'auto',

            'bucket' => env('R2_BUCKET'),

            // Endpoint de la API S3: https://<ID-DE-CUENTA>.r2.cloudflarestorage.com
            // Es privado y solo lo usa el backend para escribir. NO es la
            // direccion por la que el navegador pide las fotos.
            'endpoint' => env('R2_ENDPOINT'),

            // Esa direccion publica es esta, y es la que acaba en el HTML:
            // hoy el dominio de desarrollo del bucket (pub-XXXX.r2.dev), el dia
            // que haya DNS propio un subdominio.
            // Se guarda solo aqui, nunca en media.path, para que cambiar de
            // direccion no obligue a reescribir ninguna fila.
            'url' => env('R2_URL'),

            // El endpoint de R2 es de cuenta, no de bucket: el nombre del bucket
            // va en la ruta (.../mts-platform-media/productos/...). Con estilo
            // virtual el SDK lo pondria de subdominio y firmaria mal.
            'use_path_style_endpoint' => true,

            // OJO, ESTO NO ES COSMETICO: Laravel pone 'public' por defecto en
            // todo disco s3, y eso hace que cada subida mande la cabecera
            // "ACL: public-read". R2 NO tiene listas de control por objeto y
            // rechaza la peticion. En R2 lo publico lo decide el dominio
            // conectado al bucket, no el objeto: por eso aqui va 'private'.
            'visibility' => 'private',

            // Que un fallo de subida lance excepcion en vez de devolver false.
            // Con throw en false, una importacion contra credenciales mal
            // puestas terminaria diciendo "51 imagenes" con el bucket vacio.
            'throw' => true,
            'report' => true,

            // Cabeceras que R2 devolvera despues en cada peticion del navegador.
            // Se ponen AQUI y no en cada llamada a put() a proposito: asi no hay
            // forma de olvidarlas al escribir codigo nuevo.
            'options' => [
                // Lo que decide la factura. R2 no cobra por trafico de salida,
                // pero si por operaciones de lectura (10M al mes gratis). Sin
                // esta cabecera el navegador revalida a menudo y cada
                // revalidacion cuenta como lectura.
                //
                // OJO CON 'immutable': le promete al navegador que el archivo
                // en esa ruta NO va a cambiar nunca. Como la ruta se deriva del
                // nombre del archivo original (productos/<empresa>/foto.jpeg),
                // sustituir una foto reusando el mismo nombre dejaria a los
                // visitantes viendo la antigua hasta un ano. Para cambiar una
                // foto, subela con OTRO nombre.
                'CacheControl' => 'public, max-age=31536000, immutable',
            ],
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
