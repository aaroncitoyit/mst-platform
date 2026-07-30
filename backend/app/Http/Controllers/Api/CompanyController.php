<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CompanyController extends Controller
{
    /**
     * Empresas a las que pertenece el usuario autenticado.
     *
     * Este endpoint va a proposito FUERA del middleware company.context: es el
     * unico que el frontend puede llamar cuando todavia no hay empresa activa
     * (al refrescar la pagina, o cuando el usuario pertenece a varias empresas
     * y aun no ha elegido una). get_user_companies es SECURITY DEFINER, asi que
     * funciona sin contexto RLS.
     */
    public function mine(Request $request)
    {
        $companies = DB::select('select * from get_user_companies(?::uuid)', [$request->user()->id]);

        return response()->json(['companies' => $companies]);
    }

    /**
     * Datos de la empresa activa y los modulos que tiene contratados.
     * Alimenta el menu lateral dinamico y la pantalla de configuracion.
     */
    public function current(Request $request)
    {
        $companyId = $request->header('X-Company-Id');

        $company = DB::table('companies')->where('id', $companyId)->first();

        // company_modules ya esta filtrada por RLS con el contexto que fijo el
        // middleware; el where explicito es solo defensa en profundidad.
        $modules = DB::table('company_modules as cm')
            ->join('modules as m', 'm.id', '=', 'cm.module_id')
            ->where('cm.company_id', $companyId)
            ->where('cm.is_active', true)
            ->where('m.is_active', true)
            ->orderBy('m.name')
            ->get(['m.id', 'm.name', 'm.slug', 'm.description']);

        return response()->json([
            'company' => $company,
            'modules' => $modules,
        ]);
    }
}
