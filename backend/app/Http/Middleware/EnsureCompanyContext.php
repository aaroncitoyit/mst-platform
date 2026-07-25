<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;
use Symfony\Component\HttpFoundation\Response;

class EnsureCompanyContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $companyId = $request->header('X-Company-Id');

        if (! $companyId) {
            return response()->json(['message' => 'Falta el header X-Company-Id'], 400);
        }

        $companies = DB::select('select * from get_user_companies(?::uuid)', [$request->user()->id]);
        $belongs = collect($companies)->contains(fn ($c) => $c->id === $companyId);

        if (! $belongs) {
            return response()->json(['message' => 'No perteneces a esta empresa'], 403);
        }

        DB::statement("SET app.current_company_id = '{$companyId}'");
        app(PermissionRegistrar::class)->setPermissionsTeamId($companyId);

        return $next($request);
    }
}