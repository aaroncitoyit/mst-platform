<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Servicios que Macedo Tech tiene contratados con cada cliente.
 *
 * Ojo: client_services NO lleva RLS (ver el script 012). Son apuntes internos
 * sobre la cartera, no datos del inquilino, asi que no hace falta fijar el
 * contexto de empresa para consultarlos. Su proteccion es el middleware
 * platform.admin de la ruta.
 */
class ClientServiceController extends Controller
{
    private const PERIODOS = ['monthly', 'yearly', 'one_time'];

    private const ESTADOS = ['activo', 'pausado', 'terminado'];

    /** Catalogo de lo que vende Macedo Tech. */
    public function catalog()
    {
        return response()->json([
            'services' => DB::table('services')->where('is_active', true)->orderBy('name')->get(),
        ]);
    }

    /** Contrata un servicio a un cliente. */
    public function store(Request $request, string $companyId)
    {
        $data = $request->validate([
            'service_id' => ['required', 'uuid', Rule::exists('services', 'id')],
            'price' => ['required', 'numeric', 'min:0'],
            'billing_period' => ['required', Rule::in(self::PERIODOS)],
            'started_on' => ['nullable', 'date'],
            'next_renewal_on' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        if (! DB::table('companies')->where('id', $companyId)->exists()) {
            return response()->json(['message' => 'El cliente no existe'], 404);
        }

        // Los servicios de pago unico no vencen nunca
        if ($data['billing_period'] === 'one_time') {
            $data['next_renewal_on'] = null;
        }

        $id = DB::table('client_services')->insertGetId(
            $data + ['company_id' => $companyId],
            'id',
        );

        return response()->json(['client_service' => $this->find($id)], 201);
    }

    public function update(Request $request, string $id)
    {
        $data = $request->validate([
            'price' => ['sometimes', 'numeric', 'min:0'],
            'billing_period' => ['sometimes', Rule::in(self::PERIODOS)],
            'status' => ['sometimes', Rule::in(self::ESTADOS)],
            'started_on' => ['sometimes', 'nullable', 'date'],
            'next_renewal_on' => ['sometimes', 'nullable', 'date'],
            'notes' => ['sometimes', 'nullable', 'string'],
        ]);

        if (! $this->find($id)) {
            return response()->json(['message' => 'El servicio contratado no existe'], 404);
        }

        if ($data === []) {
            return response()->json(['message' => 'No hay nada que actualizar'], 422);
        }

        if (($data['billing_period'] ?? null) === 'one_time') {
            $data['next_renewal_on'] = null;
        }

        DB::table('client_services')->where('id', $id)->update($data + ['updated_at' => now()]);

        return response()->json(['client_service' => $this->find($id)]);
    }

    /**
     * Marca un servicio como renovado y adelanta la fecha un periodo.
     *
     * Avanza UN periodo, no salta hasta el futuro: si un mantenimiento llevaba
     * tres meses sin cobrar, renovarlo una vez lo deja aun vencido, que es
     * justo lo que refleja la realidad.
     */
    public function renew(string $id)
    {
        $service = $this->find($id);

        if (! $service) {
            return response()->json(['message' => 'El servicio contratado no existe'], 404);
        }

        if ($service->billing_period === 'one_time') {
            return response()->json(['message' => 'Un servicio de pago unico no se renueva'], 422);
        }

        // Si nunca tuvo fecha, se cuenta desde hoy
        $desde = $service->next_renewal_on ? Carbon::parse($service->next_renewal_on) : Carbon::today();

        // addMonthNoOverflow evita que un vencimiento del 31 de enero salte al
        // 3 de marzo: lo deja en el ultimo dia de febrero.
        $siguiente = $service->billing_period === 'monthly'
            ? $desde->copy()->addMonthNoOverflow()
            : $desde->copy()->addYear();

        DB::table('client_services')->where('id', $id)->update([
            'next_renewal_on' => $siguiente->toDateString(),
            'updated_at' => now(),
        ]);

        return response()->json(['client_service' => $this->find($id)]);
    }

    public function destroy(string $id)
    {
        if (! $this->find($id)) {
            return response()->json(['message' => 'El servicio contratado no existe'], 404);
        }

        DB::table('client_services')->where('id', $id)->delete();

        return response()->json(['message' => 'Servicio eliminado']);
    }

    private function find(string $id)
    {
        return DB::table('client_services as cs')
            ->join('services as s', 's.id', '=', 'cs.service_id')
            ->where('cs.id', $id)
            ->first([
                'cs.id', 'cs.company_id', 'cs.service_id', 'cs.price', 'cs.billing_period',
                'cs.status', 'cs.started_on', 'cs.next_renewal_on', 'cs.notes',
                's.name as service_name', 's.slug as service_slug',
            ]);
    }
}
