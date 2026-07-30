import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Check, Copy, ExternalLink, X } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { getQuote, markQuoteStatus, saveQuantities } from '@/features/quotes/api'
import { useToast } from '@/components/ui/toastContext'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDate, formatSoles } from '@/lib/format'

export function QuoteDetailPage() {
  const { id = '' } = useParams()
  const activeCompanyId = useSessionStore((s) => s.activeCompanyId)
  const queryClient = useQueryClient()
  const { notifySuccess, notifyError } = useToast()

  const { data: quote, isPending } = useQuery({
    queryKey: ['quote', activeCompanyId, id],
    queryFn: () => getQuote(id),
  })

  /** Cantidades en edición. Se calcula el total en vivo, sin guardar. */
  const [cantidades, setCantidades] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!quote) return
    setCantidades(
      Object.fromEntries(quote.items.map((i) => [i.id, i.quantity !== null ? String(i.quantity) : ''])),
    )
  }, [quote])

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['quote'] })
    void queryClient.invalidateQueries({ queryKey: ['quotes'] })
  }

  const guardar = useMutation({
    mutationFn: () =>
      saveQuantities(
        id,
        Object.fromEntries(
          Object.entries(cantidades).map(([itemId, valor]) => [
            itemId,
            valor === '' ? null : Number(valor),
          ]),
        ),
      ),
    onSuccess: (actualizada) => {
      notifySuccess(
        actualizada.public_url
          ? 'Cotización lista. Ya puedes copiar el enlace y enviarlo.'
          : 'Cantidades guardadas.',
      )
      invalidate()
    },
    onError: () => notifyError('No se pudo guardar'),
  })

  const marcar = useMutation({
    mutationFn: (estado: 'ganada' | 'perdida') => markQuoteStatus(id, estado),
    onSuccess: (_, estado) => {
      notifySuccess(estado === 'ganada' ? 'Marcada como ganada' : 'Marcada como perdida')
      invalidate()
    },
    onError: () => notifyError('No se pudo actualizar'),
  })

  if (isPending) return <p className="text-sm text-slate-500">Cargando...</p>
  if (!quote) return <p className="text-sm text-red-600">No se encontró la cotización.</p>

  // Total en vivo con lo que hay escrito, no con lo guardado
  const totalEnVivo = quote.items.reduce((sum, item) => {
    const cant = Number(cantidades[item.id] || 0)
    return sum + cant * Number(item.unit_price)
  }, 0)

  const completa = quote.items.every((item) => Number(cantidades[item.id] || 0) > 0)
  const cerrada = quote.status === 'ganada' || quote.status === 'perdida'

  // Arrow function y no declaración: las declaraciones se elevan y TypeScript
  // analiza su cuerpo sin saber que arriba ya se comprobó que quote existe.
  const copiarEnlace = async () => {
    if (!quote.public_url) return
    await navigator.clipboard.writeText(quote.public_url)
    notifySuccess('Enlace copiado. Pégalo en el WhatsApp del cliente.')
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link to="/cotizaciones" className="text-sm text-primary hover:underline">
          ← Cotizaciones
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">
            {quote.contact_name ?? 'Sin contacto todavía'}
          </h1>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-600">
            {quote.reference}
          </span>
          {quote.status === 'ganada' && <Badge tone="success">Ganada</Badge>}
          {quote.status === 'perdida' && <Badge tone="danger">Perdida</Badge>}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Llegó el {formatDate(quote.created_at)}
          {quote.source && ` desde ${quote.source}`}
          {quote.viewed_at && ` · la abrió el ${formatDate(quote.viewed_at)}`}
        </p>
      </div>

      {!quote.contact_name && (
        <Card>
          <p className="text-sm text-slate-600">
            Este pedido llegó por WhatsApp con la referencia{' '}
            <strong className="font-mono">{quote.reference}</strong>. Busca ese código en tu chat para
            saber quién es.
          </p>
        </Card>
      )}

      <Card
        title="Qué pidió"
        description="Los precios vienen de tu catálogo. Solo tienes que poner las cantidades."
      >
        <ul className="flex flex-col divide-y divide-slate-100">
          {quote.items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 py-4">
              {item.design ? (
                <img
                  src={item.design.url}
                  alt={item.design.alt}
                  className="size-16 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="size-16 shrink-0 rounded-md bg-slate-100" aria-hidden="true" />
              )}

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{item.product_name}</p>
                {item.design && (
                  <p className="text-sm text-slate-500">Diseño: {item.design.label}</p>
                )}
                <p className="text-sm text-slate-500">
                  {formatSoles(item.unit_price)} por unidad
                </p>
              </div>

              <div className="w-28 shrink-0">
                <label className="block text-xs font-semibold text-slate-500">Cantidad</label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  disabled={cerrada}
                  value={cantidades[item.id] ?? ''}
                  onChange={(e) =>
                    setCantidades((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:bg-slate-50"
                />
              </div>

              <p className="w-24 shrink-0 text-right font-semibold text-slate-900">
                {formatSoles(Number(cantidades[item.id] || 0) * Number(item.unit_price))}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
          <span className="font-semibold text-slate-600">Total</span>
          <span className="text-xl font-semibold text-slate-900">{formatSoles(totalEnVivo)}</span>
        </div>

        {!cerrada && (
          <div className="mt-4 flex justify-end">
            <Button loading={guardar.isPending} onClick={() => guardar.mutate()}>
              Guardar cantidades
            </Button>
          </div>
        )}
      </Card>

      {quote.public_url ? (
        <Card
          title="Enviar al cliente"
          description="Copia el enlace y pégalo en el WhatsApp donde te escribió."
        >
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {quote.public_url}
            </code>
            <Button variant="secondary" onClick={() => void copiarEnlace()}>
              <Copy className="size-4" aria-hidden="true" />
              Copiar
            </Button>
            <a href={quote.public_url} target="_blank" rel="noreferrer">
              <Button variant="ghost">
                <ExternalLink className="size-4" aria-hidden="true" />
                Ver
              </Button>
            </a>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">
            En cuanto pongas las cantidades y guardes, se genera el enlace para enviarle la
            cotización.
          </p>
        </Card>
      )}

      {/* La pregunta en el momento justo: dos botones, no un formulario */}
      {completa && !cerrada && (
        <Card title={`¿Qué pasó con ${quote.reference}?`}>
          <div className="flex gap-2">
            <Button loading={marcar.isPending} onClick={() => marcar.mutate('ganada')}>
              <Check className="size-4" aria-hidden="true" />
              La gané
            </Button>
            <Button
              variant="secondary"
              loading={marcar.isPending}
              onClick={() => marcar.mutate('perdida')}
            >
              <X className="size-4" aria-hidden="true" />
              Se perdió
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
