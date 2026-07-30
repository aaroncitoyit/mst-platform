import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, RefreshCw, Trash2 } from 'lucide-react'
import {
  addClientService,
  deleteClientService,
  listServices,
  renewClientService,
} from '@/features/admin/api'
import { useToast } from '@/components/ui/toastContext'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { diasHasta, formatDate, formatPeriodo, formatSoles } from '@/lib/format'
import type { BillingPeriod, ClientService } from '@/types/api'

function Vencimiento({ service }: { service: ClientService }) {
  if (service.billing_period === 'one_time') {
    return <span className="text-sm text-slate-400">No vence</span>
  }
  if (!service.next_renewal_on) {
    return <span className="text-sm text-slate-400">Sin fecha</span>
  }

  const dias = diasHasta(service.next_renewal_on)

  return (
    <div className="flex flex-col items-end gap-1">
      {dias < 0 ? (
        <Badge tone="danger">Vencido hace {Math.abs(dias)} d.</Badge>
      ) : dias <= 30 ? (
        <Badge tone="primary">{dias === 0 ? 'Vence hoy' : `En ${dias} d.`}</Badge>
      ) : (
        <span className="text-sm text-slate-500">En {dias} d.</span>
      )}
      <span className="text-xs text-slate-400">{formatDate(service.next_renewal_on)}</span>
    </div>
  )
}

export function ClientServicesCard({
  companyId,
  services,
}: {
  companyId: string
  services: ClientService[]
}) {
  const queryClient = useQueryClient()
  const { notifySuccess, notifyError } = useToast()
  const [abierto, setAbierto] = useState(false)
  const [serviceId, setServiceId] = useState('')
  const [price, setPrice] = useState('')
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const [renewalOn, setRenewalOn] = useState('')

  const { data: catalogo } = useQuery({ queryKey: ['admin', 'services'], queryFn: listServices })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }

  const addMutation = useMutation({
    mutationFn: () =>
      addClientService(companyId, {
        service_id: serviceId,
        price: Number(price || 0),
        billing_period: period,
        next_renewal_on: period === 'one_time' ? null : renewalOn || null,
      }),
    onSuccess: () => {
      notifySuccess('Servicio añadido')
      setAbierto(false)
      setServiceId('')
      setPrice('')
      setRenewalOn('')
      invalidate()
    },
    onError: () => notifyError('No se pudo añadir el servicio'),
  })

  const renewMutation = useMutation({
    mutationFn: renewClientService,
    onSuccess: (s) => {
      notifySuccess(`Renovado hasta ${formatDate(s.next_renewal_on)}`)
      invalidate()
    },
    onError: () => notifyError('No se pudo renovar'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteClientService,
    onSuccess: () => {
      notifySuccess('Servicio eliminado')
      invalidate()
    },
    onError: () => notifyError('No se pudo eliminar'),
  })

  /** Al elegir un servicio del catálogo se precargan su precio y periodicidad. */
  function onElegirServicio(id: string) {
    setServiceId(id)
    const elegido = catalogo?.find((s) => s.id === id)
    if (elegido) {
      setPrice(String(Number(elegido.default_price)))
      setPeriod(elegido.default_billing_period)
    }
  }

  return (
    <Card
      title="Servicios contratados"
      description="Lo que le vendes a este cliente y cuándo toca cobrarlo."
      actions={
        <Button variant="secondary" onClick={() => setAbierto(true)}>
          Añadir servicio
        </Button>
      }
    >
      {services.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">
          Todavía no tiene servicios. Añade lo que le hayas vendido.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {services.map((service) => (
            <li key={service.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold text-slate-900">
                  {service.service_name}
                  {service.status !== 'activo' && <Badge>{service.status}</Badge>}
                </p>
                <p className="text-sm text-slate-500">
                  {formatSoles(service.price)} {formatPeriodo(service.billing_period)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <Vencimiento service={service} />

                {service.billing_period !== 'one_time' && service.status === 'activo' && (
                  <Button
                    variant="secondary"
                    onClick={() => renewMutation.mutate(service.id)}
                    loading={renewMutation.isPending && renewMutation.variables === service.id}
                    title="Adelanta la fecha un periodo"
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    Renovar
                  </Button>
                )}

                <Button
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(service.id)}
                  aria-label={`Eliminar ${service.service_name}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={abierto}
        title="Añadir servicio"
        onClose={() => setAbierto(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!serviceId}
              loading={addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Añadir
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Servicio"
            value={serviceId}
            onChange={(event) => onElegirServicio(event.target.value)}
            options={[
              { value: '', label: 'Elige un servicio...' },
              ...(catalogo ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <Input
            label="Precio acordado (S/)"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <Select
            label="Periodicidad"
            value={period}
            onChange={(event) => setPeriod(event.target.value as BillingPeriod)}
            options={[
              { value: 'monthly', label: 'Mensual' },
              { value: 'yearly', label: 'Anual' },
              { value: 'one_time', label: 'Pago único' },
            ]}
          />
          {period !== 'one_time' && (
            <div>
              <Input
                label="Próximo vencimiento"
                type="date"
                value={renewalOn}
                onChange={(event) => setRenewalOn(event.target.value)}
              />
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
                <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
                Es la fecha que aparecerá en tus avisos del panel.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </Card>
  )
}
