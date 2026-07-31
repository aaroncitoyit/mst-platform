<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Registro por autoservicio
    |--------------------------------------------------------------------------
    |
    | Desactivado por defecto: el alta de empresas la hace MTS desde el
    | back-office, que es lo que encaja con un modelo de implantaciones a
    | medida. Poniendolo a true se reabre POST /api/register y cualquiera
    | podria crear una empresa.
    |
    */

    'self_registration' => env('MTS_SELF_REGISTRATION', false),

    /*
    |--------------------------------------------------------------------------
    | Plan por defecto
    |--------------------------------------------------------------------------
    |
    | Plan que se asigna en el registro por autoservicio, cuando nadie elige uno.
    | Debe coincidir con un slug de la tabla plans.
    |
    */

    'default_plan' => env('MTS_DEFAULT_PLAN', 'starter'),

    /*
    |--------------------------------------------------------------------------
    | Disco de los archivos de cliente
    |--------------------------------------------------------------------------
    |
    | Donde se guardan las fotos de producto y demas archivos subidos. En local
    | 'public' (una carpeta, sin depender de la red); en produccion 'r2'.
    |
    | Va aparte de FILESYSTEM_DISK a proposito. FILESYSTEM_DISK es el disco por
    | defecto de TODO Laravel, incluidos archivos internos que no tienen por que
    | salir a internet. Esta variable dice solo una cosa: donde van los archivos
    | que el navegador de un cliente va a pedir.
    |
    | Cada fila de media guarda ademas SU disco en la columna 'disk', asi que
    | cambiar esto no rompe las filas antiguas: las que ya apuntan a 'public'
    | se siguen sirviendo desde 'public' hasta que se migren con
    | "php artisan mts:migrar-media".
    |
    */

    'media_disk' => env('MTS_MEDIA_DISK', 'public'),

];
