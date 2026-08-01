<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Cotizaciones del cliente.
 *
 * La web crea cotizaciones (POST /api/public/cotizaciones) y el asesor las
 * atiende desde el panel (cantidades, estado, enlace publico). La logica vive
 * aqui en un solo sitio: las dos caras (publica y panel) comparten la misma
 * forma de armar la respuesta y las mismas reglas (precio congelado, cantidad
 * nula hasta que el asesor la pone, token que solo se genera al completar).
 *
 * Todas las tablas de aqui llevan RLS, asi que el contexto que fija el
 * middleware ya limita cada consulta a su inquilino. El unico punto que cruza
 * esa frontera es mostrarPublica(), que usa la funcion SECURITY DEFINER
 * abrir_cotizacion_publica() porque aun no sabe de que empresa es el token.
 */
class QuoteService
{
    private const CARACTERES_REFERENCIA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    /**
     * Crea una cotizacion desde la web del cliente.
     *
     * Nunca se descarta una solicitud por un problema de datos: si un producto
     * no se encuentra o esta oculto, la linea se crea igualmente con lo que
     * mando la web y precio 0, en vez de perder la solicitud.
     *
     * @return array{id: string, reference: string}
     */
    public function crearDesdeWeb(string $companyId, array $items, ?string $source): array
    {
        return DB::transaction(function () use ($companyId, $items, $source) {
            $id = DB::table('quote_requests')->insertGetId([
                'company_id' => $companyId,
                'reference' => $this->generarReferencia(),
                'status' => 'nueva',
                'source' => $source,
            ], 'id');

            foreach ($items as $item) {
                $producto = $this->buscarProducto($companyId, $item);

                DB::table('quote_request_items')->insert([
                    'quote_request_id' => $id,
                    'product_id' => $producto?->id,
                    'sku' => $producto?->sku,
                    'product_name' => $producto?->name ?? $this->nombreDeUltimoRecurso($item),
                    'unit_price' => $producto?->price ?? 0,
                    'design_id' => $this->designValida($companyId, $item['design_id'] ?? null),
                ]);
            }

            return ['id' => $id, 'reference' => DB::table('quote_requests')->where('id', $id)->value('reference')];
        });
    }

    /** Cotizaciones de la empresa, de la mas reciente a la mas antigua. */
    public function listar(string $companyId): array
    {
        $quotes = DB::table('quote_requests')
            ->where('company_id', $companyId)
            ->orderByDesc('created_at')
            ->get();

        return $this->conItems($quotes);
    }

    public function mostrar(string $companyId, string $id): ?array
    {
        $quote = DB::table('quote_requests')
            ->where('id', $id)
            ->where('company_id', $companyId)
            ->first();

        if (! $quote) {
            return null;
        }

        return $this->conItems(collect([$quote]))[0];
    }

    /**
     * Pone las cantidades que escribe el asesor. En cuanto todas las lineas
     * tienen cantidad, la cotizacion pasa a "cotizada" y se genera su token.
     */
    public function ponerCantidades(string $companyId, string $id, array $quantities): ?array
    {
        $quote = DB::table('quote_requests')
            ->where('id', $id)
            ->where('company_id', $companyId)
            ->first();

        if (! $quote) {
            return null;
        }

        foreach ($quantities as $itemId => $cantidad) {
            $cantidad = ($cantidad === null || $cantidad === '' || (int) $cantidad < 1)
                ? null
                : (int) $cantidad;

            DB::table('quote_request_items')
                ->where('id', $itemId)
                ->where('quote_request_id', $id)
                ->update(['quantity' => $cantidad]);
        }

        $items = DB::table('quote_request_items')->where('quote_request_id', $id)->get();
        $completa = $items->isNotEmpty() && $items->every(fn ($i) => $i->quantity !== null);

        $cambios = ['updated_at' => now()];

        // Ganada o perdida no se tocan: una cotizacion cerrada no se reabre.
        if ($completa && in_array($quote->status, ['nueva', 'cotizada', 'vista'], true)) {
            $cambios['status'] = 'cotizada';

            // El token es la credencial del enlace; solo se genera aqui.
            if (! $quote->public_token) {
                $cambios['public_token'] = Str::random(40);
            }
        }

        DB::table('quote_requests')->where('id', $id)->update($cambios);

        return $this->mostrar($companyId, $id);
    }

    public function marcarEstado(string $companyId, string $id, string $status): ?array
    {
        $quote = DB::table('quote_requests')
            ->where('id', $id)
            ->where('company_id', $companyId)
            ->first();

        if (! $quote) {
            return null;
        }

        DB::table('quote_requests')->where('id', $id)->update([
            'status' => $status,
            'updated_at' => now(),
        ]);

        return $this->mostrar($companyId, $id);
    }

    /**
     * Abre el enlace publico: marca viewed_at la primera vez y devuelve la
     * cotizacion de solo lectura.
     */
    public function mostrarPublica(string $token): ?array
    {
        // SECURITY DEFINER: aun no sabemos de que empresa es el token y la
        // tabla lleva RLS. La funcion tambien marca viewed_at y sube a 'vista'.
        $quote = DB::selectOne('select * from abrir_cotizacion_publica(?)', [$token]);

        if (! $quote) {
            return null;
        }

        app(CompanyProvisioner::class)->setCompanyContext($quote->company_id);

        return $this->conItems(collect([$quote]))[0];
    }

    /* ---------- Construccion de la respuesta ---------- */

    /** @param  iterable<int, object>  $quotes */
    private function conItems(iterable $quotes): array
    {
        $quotes = collect($quotes);
        $ids = $quotes->pluck('id');

        $items = DB::table('quote_request_items')
            ->whereIn('quote_request_id', $ids)
            ->orderBy('created_at')
            ->get()
            ->groupBy('quote_request_id');

        $designIds = $items->flatten()->pluck('design_id')->filter()->unique();

        $designs = collect();
        if ($designIds->isNotEmpty()) {
            // media lleva RLS: solo se ven los disenos de esta empresa.
            $designs = DB::table('media')->whereIn('id', $designIds)->get()->keyBy('id');
        }

        return $quotes
            ->map(function ($q) use ($items, $designs) {
                $q->items = ($items->get($q->id) ?? collect())
                    ->map(fn ($i) => $this->itemToArray($i, $designs->get($i->design_id)))
                    ->values();

                return $this->quoteToArray($q);
            })
            ->values()
            ->all();
    }

    private function quoteToArray(object $q): array
    {
        return [
            'id' => $q->id,
            'reference' => $q->reference,
            'status' => $q->status,
            'source' => $q->source,
            'created_at' => $q->created_at ? Carbon::parse($q->created_at)->toIso8601String() : null,
            'viewed_at' => $q->viewed_at ? Carbon::parse($q->viewed_at)->toIso8601String() : null,
            'contact_name' => $q->contact_name,
            'contact_phone' => $q->contact_phone,
            'public_token' => $q->public_token,
            'items' => $q->items,
        ];
    }

    private function itemToArray(object $item, ?object $design): array
    {
        return [
            'id' => $item->id,
            'product_id' => $item->product_id,
            'sku' => $item->sku,
            'product_name' => $item->product_name,
            'quantity' => $item->quantity !== null ? (int) $item->quantity : null,
            'unit_price' => (string) $item->unit_price,
            'design' => $design ? [
                'id' => $design->id,
                'url' => Storage::disk($design->disk)->url($design->path),
                'alt' => $design->alt_text ?? '',
                'label' => $design->alt_text ?? '',
            ] : null,
        ];
    }

    /* ---------- Ayudantes ---------- */

    /** El producto del catalogo (activo) por id o slug. Null si no existe. */
    private function buscarProducto(string $companyId, array $item): ?object
    {
        $query = DB::table('products')
            ->where('company_id', $companyId)
            ->where('is_active', true);

        if (! empty($item['product_id'])) {
            $producto = (clone $query)->where('id', $item['product_id'])->first();
        } elseif (! empty($item['slug'])) {
            $producto = (clone $query)->where('slug', $item['slug'])->first();
        } else {
            $producto = null;
        }

        return $producto;
    }

    /** El diseño (imagen de media) existe y pertenece a la empresa. */
    private function designValida(string $companyId, ?string $designId): ?string
    {
        if (! $designId || ! Str::isUuid($designId)) {
            return null;
        }

        $existe = DB::table('media')
            ->where('id', $designId)
            ->where('company_id', $companyId)
            ->exists();

        return $existe ? $designId : null;
    }

    private function nombreDeUltimoRecurso(array $item): string
    {
        return $item['slug'] ?? $item['product_id'] ?? 'Producto';
    }

    /** Codigo corto para dictar: 4 caracteres sin 0/O ni 1/I/L. */
    private function generarReferencia(): string
    {
        do {
            $ref = '';
            for ($i = 0; $i < 4; $i++) {
                $ref .= self::CARACTERES_REFERENCIA[random_int(0, strlen(self::CARACTERES_REFERENCIA) - 1)];
            }
        } while (DB::table('quote_requests')->where('reference', $ref)->exists());

        return $ref;
    }
}
