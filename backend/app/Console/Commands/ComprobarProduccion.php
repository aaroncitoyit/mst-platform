<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Comprueba que el despliegue es seguro ANTES de que entre un cliente.
 *
 * Cada una de estas comprobaciones corresponde a un fallo real y frecuente al
 * desplegar. No son teoricas: son las que se olvidan.
 *
 * Uso en el servidor, despues de desplegar:
 *   php artisan mts:comprobar-produccion
 */
class ComprobarProduccion extends Command
{
    protected $signature = 'mts:comprobar-produccion';

    protected $description = 'Verifica que la configuracion del servidor es segura';

    private int $fallos = 0;

    private int $avisos = 0;

    public function handle(): int
    {
        $this->info('Comprobando la configuracion...');
        $this->newLine();

        // Lo mas caro de olvidar: con debug activo, CUALQUIER error muestra la
        // traza completa — rutas, consultas SQL y a veces variables de entorno.
        $this->critico(
            'APP_DEBUG desactivado',
            config('app.debug') === false,
            'Con debug activo, cualquier error expone rutas, consultas y credenciales.',
        );

        $this->critico(
            'APP_ENV en produccion',
            app()->environment('production'),
            'Fuera de "production" no se fuerza HTTPS ni se aplica HSTS. Ahora: '.app()->environment(),
        );

        $this->critico(
            'APP_KEY definida',
            ! empty(config('app.key')),
            'Sin ella no se pueden descifrar los datos cifrados ni firmar sesiones.',
        );

        $this->critico(
            'APP_URL con https',
            str_starts_with((string) config('app.url'), 'https://'),
            'Con http, los enlaces de cotizacion se generan inseguros y el navegador los bloquea.',
        );

        // El corazon del aislamiento entre clientes. Si Laravel se conecta con
        // el superusuario, RLS deja de aplicarse EN SILENCIO y cada cliente ve
        // los datos de los demas.
        $rol = DB::selectOne('select current_user as usuario, rolsuper or rolbypassrls as privilegiado
                              from pg_roles where rolname = current_user');

        $this->critico(
            "Laravel conecta como rol sin privilegios ({$rol->usuario})",
            ! $rol->privilegiado,
            'Ese rol IGNORA las politicas RLS: los clientes verian datos ajenos.',
        );

        $this->critico(
            'Registro publico cerrado',
            config('mts.self_registration') === false,
            'Con el abierto, cualquiera en internet puede crear una empresa.',
        );

        $origenes = config('cors.allowed_origins', []);
        $this->critico(
            'CORS restringido',
            ! in_array('*', $origenes, true) && $origenes !== [],
            'Define CORS_ORIGENES en el .env con los dominios reales.',
        );

        // ------------------------------------------
        // Almacenamiento de las fotos de producto
        // ------------------------------------------
        // Se mira el disco que se usa DE VERDAD (config mts.media_disk), no el
        // disco 'public'. Comprobar 'public' daba un aviso permanente aunque
        // todo estuviera bien en R2, y un aviso que salta sin motivo acaba
        // ignorandose — que es como se cuelan los que si importan.
        $disco = config('mts.media_disk');
        $driver = config("filesystems.disks.{$disco}.driver");

        $this->critico(
            "Disco de archivos no efimero ({$disco})",
            $driver !== null && $driver !== 'local',
            'Cloud Run tiene disco efimero: con un disco local, las fotos de producto '
            .'desaparecen en el primer redespliegue. Pon MTS_MEDIA_DISK=r2.',
        );

        // Sin URL publica, Storage::url() devuelve el endpoint privado de R2
        // (....r2.cloudflarestorage.com), que responde 401 al navegador: el
        // catalogo saldria con TODAS las imagenes rotas. Falla en silencio
        // porque la peticion sale bien desde el backend.
        if ($driver === 's3') {
            $url = (string) config("filesystems.disks.{$disco}.url");

            $this->critico(
                'Direccion publica de los archivos configurada',
                str_starts_with($url, 'https://')
                    && ! str_contains($url, 'r2.cloudflarestorage.com'),
                'Define R2_URL con la direccion PUBLICA del bucket (pub-XXXX.r2.dev o tu '
                .'propio dominio). El endpoint de la API S3 no sirve: es privado.',
            );

            // Aviso y no fallo: r2.dev funciona y sirve para empezar. Pero
            // Cloudflare lo limita y no lo recomienda para produccion, y es de
            // esas cosas provisionales que se quedan para siempre si nadie las
            // nombra en voz alta cada vez.
            $this->aviso(
                'Dominio propio para las imagenes',
                ! str_contains($url, '.r2.dev'),
                'Estas sirviendo desde r2.dev, el dominio de desarrollo de R2. Cloudflare lo '
                .'limita. Cuando puedas, conecta un dominio propio al bucket y cambia R2_URL: '
                .'no hay que migrar ningun archivo.',
            );
        }

        // Avisos: no bloquean, pero conviene saberlos
        // Solo tiene sentido si las fotos se sirven desde el disco local.
        // file_exists y no is_link: en Windows los enlaces simbolicos creados
        // por Git Bash no los reconoce is_link(), y el aviso saltaria en falso.
        if ($driver === 'local') {
            $this->aviso(
                'Enlace de storage creado',
                file_exists(public_path('storage')),
                'Sin el, las fotos de producto no se sirven. Ejecuta: php artisan storage:link',
            );
        }

        $sinRls = DB::selectOne("select count(*) as n from pg_tables
                                 where schemaname = 'public'
                                   and tablename in ('products','quote_requests','company_api_keys')
                                   and not rowsecurity");

        $this->critico(
            'Tablas de cliente con RLS activo',
            (int) $sinRls->n === 0,
            'Alguna tabla con datos de cliente perdio su politica. Revisa tras una restauracion.',
        );

        $this->newLine();

        if ($this->fallos > 0) {
            $this->error("{$this->fallos} comprobacion(es) CRITICA(s) fallida(s). No metas clientes hasta arreglarlo.");

            return self::FAILURE;
        }

        if ($this->avisos > 0) {
            $this->warn("Todo lo critico esta bien. {$this->avisos} aviso(s) por revisar.");

            return self::SUCCESS;
        }

        $this->info('Todo correcto.');

        return self::SUCCESS;
    }

    private function critico(string $texto, bool $ok, string $porque): void
    {
        if ($ok) {
            $this->line("  <fg=green>OK</>    {$texto}");

            return;
        }

        $this->fallos++;
        $this->line("  <fg=red>FALLA</> {$texto}");
        $this->line("        <fg=gray>{$porque}</>");
    }

    private function aviso(string $texto, bool $ok, string $porque): void
    {
        if ($ok) {
            $this->line("  <fg=green>OK</>    {$texto}");

            return;
        }

        $this->avisos++;
        $this->line("  <fg=yellow>AVISO</> {$texto}");
        $this->line("        <fg=gray>{$porque}</>");
    }
}
