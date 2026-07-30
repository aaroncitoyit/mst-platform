<?php

namespace Tests\Feature;

use App\Services\CompanyProvisioner;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Aislamiento multi-tenant a nivel de motor.
 *
 * Es la propiedad central de MTS Platform y la unica cuya rotura seria
 * catastrofica: una empresa viendo datos de otra. Se comprueba contra
 * PostgreSQL de verdad y con el rol mts_app (NOSUPERUSER NOBYPASSRLS); con
 * mts_user estos tests pasarian siempre sin probar nada, porque los
 * superusuarios ignoran RLS.
 */
class RlsIsolationTest extends TestCase
{
    use DatabaseTransactions;

    private function crearEmpresa(string $nombre): string
    {
        $plan = DB::table('plans')->where('slug', 'empresarial')->first();

        $result = app(CompanyProvisioner::class)->provision($nombre, $plan->id, [
            'name' => "Dueno de $nombre",
            'email' => strtolower(str_replace(' ', '', $nombre)).'@aislamiento.test',
            'password' => 'clave12345',
        ]);

        return $result['company']->id;
    }

    public function test_el_rol_de_la_aplicacion_no_es_superusuario(): void
    {
        // Si esto falla, todos los demas tests de este archivo son humo
        $esSuper = DB::selectOne('select usesuper from pg_user where usename = current_user');

        $this->assertFalse(
            (bool) $esSuper->usesuper,
            'Los tests corren como superusuario: RLS no se estaria aplicando. Revisa DB_USERNAME en .env.testing.',
        );
    }

    public function test_sin_contexto_las_tablas_protegidas_no_devuelven_nada(): void
    {
        $this->crearEmpresa('Alfa');

        DB::statement("select set_config('app.current_company_id', '', false)");

        $this->assertSame(0, DB::table('company_modules')->count());
        $this->assertSame(0, DB::table('subscriptions')->count());
        $this->assertSame(0, DB::table('company_user')->count());
    }

    public function test_una_empresa_no_ve_los_datos_de_otra(): void
    {
        $alfa = $this->crearEmpresa('Alfa');
        $beta = $this->crearEmpresa('Beta');

        $provisioner = app(CompanyProvisioner::class);

        $provisioner->setCompanyContext($alfa);
        $modulosAlfa = DB::table('company_modules')->pluck('company_id')->unique()->values();
        $usuariosAlfa = DB::table('company_user')->pluck('company_id')->unique()->values();

        $this->assertSame([$alfa], $modulosAlfa->all());
        $this->assertSame([$alfa], $usuariosAlfa->all());

        $provisioner->setCompanyContext($beta);
        $modulosBeta = DB::table('company_modules')->pluck('company_id')->unique()->values();

        $this->assertSame([$beta], $modulosBeta->all());
    }

    public function test_no_se_puede_escribir_en_otra_empresa(): void
    {
        $alfa = $this->crearEmpresa('Alfa');
        $beta = $this->crearEmpresa('Beta');

        app(CompanyProvisioner::class)->setCompanyContext($alfa);

        // La politica tenant_isolation no lleva WITH CHECK propio, asi que
        // PostgreSQL usa la expresion de USING tambien para las inserciones:
        // insertar con el company_id de otra empresa debe fallar.
        $this->expectException(\Illuminate\Database\QueryException::class);

        DB::table('settings')->insert([
            'company_id' => $beta,
            'key' => 'intruso',
            'value' => 'no deberia entrar',
        ]);
    }
}
