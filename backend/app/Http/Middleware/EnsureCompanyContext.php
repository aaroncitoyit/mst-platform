<?php

namespace App\Http\Middleware;

use App\Services\CompanyProvisioner;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class EnsureCompanyContext
{
    public function __construct(private CompanyProvisioner $provisioner)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $companyId = $request->header('X-Company-Id');

        if (! $companyId) {
            return response()->json(['message' => 'Falta el header X-Company-Id'], 400);
        }

        $user = $request->user();

        // Un administrador de plataforma puede entrar a cualquier empresa para
        // dar soporte, conservando su propia identidad (asi la auditoria
        // registra quien actuo de verdad). Sigue fijando el contexto RLS igual
        // que cualquier otro: no se salta el aislamiento, solo la comprobacion
        // de pertenencia.
        if (! $user->is_platform_admin) {
            $companies = DB::select('select * from get_user_companies(?::uuid)', [$user->id]);
            $belongs = collect($companies)->contains(fn ($c) => $c->id === $companyId);

            if (! $belongs) {
                return response()->json(['message' => 'No perteneces a esta empresa'], 403);
            }
        }

        $company = DB::table('companies')->where('id', $companyId)->first();

        if (! $company) {
            return response()->json(['message' => 'La empresa no existe'], 404);
        }

        // Empresa suspendida desde el back-office (por ejemplo, por impago).
        // El personal de MTS si puede entrar, para poder diagnosticar.
        if (! $company->is_active && ! $user->is_platform_admin) {
            return response()->json([
                'message' => 'Esta empresa esta suspendida. Contacta con Macedo Tech Solutions.',
            ], 403);
        }

        $this->provisioner->setCompanyContext($companyId);

        return $next($request);
    }
}
