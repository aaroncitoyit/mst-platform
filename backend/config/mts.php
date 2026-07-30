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

];
