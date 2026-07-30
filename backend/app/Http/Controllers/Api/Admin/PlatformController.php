<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PlatformController extends Controller
{
    /**
     * Datos del administrador de plataforma.
     *
     * Existe aparte de /api/me porque aquel esta detras de company.context y
     * exige el header X-Company-Id, y un administrador de plataforma no
     * pertenece a ninguna empresa.
     */
    public function me(Request $request)
    {
        return response()->json(['user' => $request->user()]);
    }

    /** Catalogo de planes de MTS Platform con los modulos que incluye cada uno. */
    public function plans()
    {
        $plans = DB::table('plans')->orderBy('price')->get();

        $modulesByPlan = DB::table('plan_modules as pm')
            ->join('modules as m', 'm.id', '=', 'pm.module_id')
            ->orderBy('m.name')
            ->get(['pm.plan_id', 'm.id', 'm.name', 'm.slug'])
            ->groupBy('plan_id');

        $plans->each(function ($plan) use ($modulesByPlan) {
            $plan->modules = $modulesByPlan->get($plan->id, collect())->values();
        });

        return response()->json(['plans' => $plans]);
    }

    /**
     * El panel que Aaron abre cada mañana.
     *
     * client_services y opportunities no llevan RLS (ver el script 012), asi
     * que estas consultas cruzan toda la cartera sin necesitar contexto de
     * empresa ni funciones SECURITY DEFINER.
     */
    public function stats()
    {
        // Ingreso recurrente mensual: los anuales se dividen entre 12 para
        // poder sumarlos con los mensuales. Los de pago unico no cuentan.
        $ingresoRecurrente = DB::table('client_services')
            ->where('status', 'activo')
            ->selectRaw("
                coalesce(sum(
                    case billing_period
                        when 'monthly' then price
                        when 'yearly' then price / 12
                        else 0
                    end
                ), 0) as total
            ")
            ->value('total');

        // Lo que hace ganar dinero: mantenimientos por cobrar y dominios por
        // renovar antes de que caduquen.
        $vencimientos = DB::table('client_services as cs')
            ->join('services as s', 's.id', '=', 'cs.service_id')
            ->join('companies as c', 'c.id', '=', 'cs.company_id')
            ->where('cs.status', 'activo')
            ->whereNotNull('cs.next_renewal_on')
            ->whereRaw("cs.next_renewal_on <= current_date + interval '30 days'")
            ->orderBy('cs.next_renewal_on')
            ->get([
                'cs.id', 'cs.next_renewal_on', 'cs.price', 'cs.billing_period',
                's.name as service_name',
                'c.id as company_id', 'c.name as company_name',
            ]);

        $oportunidades = DB::table('opportunities')
            ->whereIn('status', ['idea', 'propuesta'])
            ->selectRaw('count(*) as total, coalesce(sum(estimated_value), 0) as valor')
            ->first();

        return response()->json([
            'ingreso_recurrente_mensual' => round((float) $ingresoRecurrente, 2),
            'clientes_activos' => DB::table('companies')->where('is_active', true)->count(),
            'vencimientos' => $vencimientos,
            'vencidos' => $vencimientos->filter(
                fn ($v) => $v->next_renewal_on < now()->toDateString()
            )->count(),
            'oportunidades_abiertas' => (int) $oportunidades->total,
            'oportunidades_valor' => round((float) $oportunidades->valor, 2),
        ]);
    }
}
