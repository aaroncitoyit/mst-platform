<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Que el hosting sirva HTTPS no basta: sin esto Laravel seguiria
        // generando enlaces http:// en correos y en el enlace publico de las
        // cotizaciones, y el navegador los bloquearia como contenido mixto.
        if ($this->app->environment('production')) {
            URL::forceScheme('https');
        }

        // Un administrador de plataforma que entra a una empresa para dar
        // soporte no tiene roles alli, asi que Spatie le negaria todo. Este es
        // el idioma estandar de Laravel para concederle cualquier permiso.
        //
        // Devolver null (y no false) cuando no es administrador es importante:
        // asi la comprobacion sigue su curso normal por Spatie.
        Gate::before(function (User $user) {
            return $user->is_platform_admin ? true : null;
        });
    }
}
