<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // El contexto de empresa se fija con set_config(..., false), es decir a
        // nivel de SESION de PostgreSQL: sobrevive al final de la transaccion y
        // por tanto se filtraria de un test al siguiente sobre la misma
        // conexion. Limpiarlo aqui deja cada test partiendo de cero, que es lo
        // que hace fiables los tests de aislamiento.
        DB::statement("select set_config('app.current_company_id', '', false)");

        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
