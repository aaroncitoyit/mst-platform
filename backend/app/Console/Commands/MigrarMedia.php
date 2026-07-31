<?php

namespace App\Console\Commands;

use App\Services\CompanyProvisioner;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Muda los archivos ya subidos de un disco a otro (tipicamente public -> r2).
 *
 * Existe por un motivo concreto: las imagenes importadas antes de configurar R2
 * viven en backend/storage/app/public. En Cloud Run ese directorio es efimero,
 * asi que el primer redespliegue las borraria y el catalogo saldria con todas
 * las fotos rotas.
 *
 * NO BORRA EL ORIGEN. Copiar es reversible; borrar no. Mientras los archivos
 * sigan en las dos partes, volver atras es cambiar una variable de entorno.
 * Cuando R2 este confirmado, la carpeta local se borra a mano.
 *
 * Uso:
 *   php artisan mts:migrar-media --simular      # dice que haria, sin tocar nada
 *   php artisan mts:migrar-media
 */
class MigrarMedia extends Command
{
    protected $signature = 'mts:migrar-media
                            {--desde=public : Disco de origen}
                            {--hasta=r2 : Disco de destino}
                            {--empresa= : Migrar solo una empresa (UUID o slug)}
                            {--simular : No copia nada, solo informa}';

    protected $description = 'Copia los archivos de media de un disco a otro y actualiza las filas';

    public function handle(CompanyProvisioner $provisioner): int
    {
        $desde = (string) $this->option('desde');
        $hasta = (string) $this->option('hasta');
        $simular = (bool) $this->option('simular');

        if ($desde === $hasta) {
            $this->error('El origen y el destino son el mismo disco.');

            return self::FAILURE;
        }

        foreach ([$desde, $hasta] as $disco) {
            if (! config("filesystems.disks.{$disco}")) {
                $this->error("No existe el disco '{$disco}' en config/filesystems.php.");

                return self::FAILURE;
            }
        }

        // Se comprueba que el destino ACEPTA escrituras antes de recorrer nada.
        // Sin esto, unas credenciales de R2 mal puestas se descubren archivo a
        // archivo, con la migracion ya empezada y a medias.
        //
        // Se hace TAMBIEN con --simular, y es a proposito: saber si las claves
        // funcionan es justo lo que se le pide a un ensayo. Un --simular que
        // dijera "todo bien" sin haber tocado R2 daria una confianza falsa.
        // Escribe y borra un archivo diminuto; no deja rastro.
        if (! $this->destinoEscribible($hasta)) {
            return self::FAILURE;
        }

        $empresas = $this->empresas();

        if ($empresas === []) {
            // Se distinguen los dos casos: escribir mal un slug es un error del
            // que hay que avisar, pero una base recien instalada sin empresas
            // todavia no lo es. Confundirlos manda a buscar un fallo que no
            // existe.
            if ($this->option('empresa')) {
                $this->error("No existe ninguna empresa '{$this->option('empresa')}'.");

                return self::FAILURE;
            }

            $this->warn('No hay ninguna empresa dada de alta: no hay archivos que migrar.');
            $this->line('  Si esperabas encontrar el catalogo aqui, comprueba que apuntas a la');
            $this->line('  base correcta (--env=neon usa produccion; sin el, la de desarrollo).');

            return self::SUCCESS;
        }

        $this->info("Migrando media de '{$desde}' a '{$hasta}'".($simular ? ' (SIMULACION)' : '').'...');
        $this->newLine();

        $copiados = 0;
        $perdidos = 0;
        $fallidos = 0;

        foreach ($empresas as $empresa) {
            // media lleva RLS. Sin fijar el contexto, el SELECT devuelve cero
            // filas SIN dar error, y el comando terminaria diciendo que no
            // habia nada que migrar. Por eso se recorre empresa por empresa:
            // no hay ninguna funcion que cruce empresas sobre media, ni debe
            // haberla solo para esto.
            $provisioner->setCompanyContext($empresa->id);

            $filas = DB::table('media')
                ->where('disk', $desde)
                ->orderBy('created_at')
                ->get();

            if ($filas->isEmpty()) {
                continue;
            }

            $this->line("<options=bold>{$empresa->name}</> ({$filas->count()} archivos)");

            foreach ($filas as $fila) {
                $resultado = $this->migrarArchivo($fila, $desde, $hasta, $simular);

                match ($resultado) {
                    'copiado' => $copiados++,
                    'perdido' => $perdidos++,
                    default => $fallidos++,
                };
            }

            $this->newLine();
        }

        $this->resumen($copiados, $perdidos, $fallidos, $simular, $desde);

        return $fallidos > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Copia un archivo y, solo si la copia se verifica, actualiza su fila.
     *
     * @return string 'copiado' | 'perdido' | 'fallido' | 'simulado'
     */
    private function migrarArchivo(object $fila, string $desde, string $hasta, bool $simular): string
    {
        $ruta = $fila->path;

        if (! Storage::disk($desde)->exists($ruta)) {
            // La fila apunta a un archivo que ya no esta. NO se actualiza: si
            // se marcara como migrada, el problema quedaria enterrado y la
            // imagen rota se descubriria en la web del cliente.
            $this->line("  <fg=yellow>FALTA</>  {$ruta}");

            return 'perdido';
        }

        if ($simular) {
            $this->line("  <fg=gray>copiaria</> {$ruta}");

            return 'simulado';
        }

        try {
            // Por flujo y no leyendo el archivo entero en memoria: son fotos de
            // producto sin redimensionar y el contenedor de Cloud Run va justo
            // de RAM.
            $origen = Storage::disk($desde)->readStream($ruta);

            if ($origen === null) {
                throw new \RuntimeException('no se pudo abrir el origen');
            }

            Storage::disk($hasta)->writeStream($ruta, $origen);

            if (is_resource($origen)) {
                fclose($origen);
            }

            // Verificar, no confiar. Una escritura que "no lanza excepcion" no
            // es una escritura correcta: se comprueba que el archivo esta en el
            // destino y que pesa lo mismo. Copiar 51 fotos truncadas y borrar
            // el origen despues es la forma de perder el catalogo entero.
            $tamanoOrigen = Storage::disk($desde)->size($ruta);
            $tamanoDestino = Storage::disk($hasta)->size($ruta);

            if ($tamanoDestino !== $tamanoOrigen) {
                $this->line("  <fg=red>FALLA</>  {$ruta} — copiado {$tamanoDestino} de {$tamanoOrigen} bytes");

                return 'fallido';
            }
        } catch (\Throwable $e) {
            $this->line("  <fg=red>FALLA</>  {$ruta} — {$e->getMessage()}");

            return 'fallido';
        }

        // El disco se actualiza al final y solo tras verificar: hasta esta
        // linea, la fila sigue apuntando al origen y la web sigue funcionando.
        DB::table('media')
            ->where('id', $fila->id)
            ->update([
                'disk' => $hasta,
                // Se aprovecha que ya se conoce: la importacion nunca rellenaba
                // esta columna, y sin ella no hay forma de comprobar despues
                // que lo que hay en R2 es lo que habia aqui.
                'size_bytes' => $tamanoOrigen,
            ]);

        $this->line("  <fg=green>OK</>     {$ruta}");

        return 'copiado';
    }

    /**
     * Escribe y borra un archivo de prueba en el destino.
     */
    private function destinoEscribible(string $hasta): bool
    {
        $prueba = '.mts-comprobacion-de-escritura';

        try {
            Storage::disk($hasta)->put($prueba, 'ok');
            Storage::disk($hasta)->delete($prueba);

            // Se dice en voz alta: con --simular esta suele ser la unica razon
            // de lanzar el comando, y un silencio no distingue "las claves van
            // bien" de "ni lo he intentado".
            $this->line("  <fg=green>OK</>     escritura en el disco '{$hasta}' verificada");

            return true;
        } catch (\Throwable $e) {
            $this->error("No se puede escribir en el disco '{$hasta}': {$e->getMessage()}");
            $this->line('  Revisa R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET y R2_ENDPOINT.');

            return false;
        }
    }

    /**
     * Empresas a recorrer. companies no lleva RLS, asi que se consulta directa.
     *
     * @return list<object>
     */
    private function empresas(): array
    {
        $filtro = $this->option('empresa');

        $consulta = DB::table('companies')->select('id', 'name')->orderBy('name');

        if ($filtro) {
            // Comparar un slug contra una columna UUID hace que PostgreSQL
            // falle en vez de no encontrar nada.
            $esUuid = (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $filtro);

            $consulta->where($esUuid ? 'id' : 'slug', $filtro);
        }

        return $consulta->get()->all();
    }

    private function resumen(int $copiados, int $perdidos, int $fallidos, bool $simular, string $desde): void
    {
        if ($simular) {
            $this->info('Simulacion terminada. No se ha copiado ni modificado nada.');

            return;
        }

        if ($copiados === 0 && $perdidos === 0 && $fallidos === 0) {
            $this->info("No habia nada en el disco '{$desde}': nada que migrar.");

            return;
        }

        $this->info("{$copiados} archivos copiados y verificados.");

        if ($perdidos > 0) {
            $this->warn("{$perdidos} filas apuntan a archivos que ya no existen. Sus imagenes ya estaban rotas.");
        }

        if ($fallidos > 0) {
            $this->error("{$fallidos} fallaron. Sus filas NO se tocaron: se siguen sirviendo desde '{$desde}'.");
            $this->line('  Puedes volver a lanzar el comando: solo reintentara lo que quedo pendiente.');

            return;
        }

        $this->newLine();
        $this->line("Los archivos siguen tambien en '{$desde}'. No se borran a proposito:");
        $this->line('  es lo que permite volver atras si algo sale mal. Borralos a mano');
        $this->line('  cuando hayas comprobado que el catalogo se ve bien en produccion.');
    }
}
