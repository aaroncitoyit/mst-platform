import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'
import { daysSinceViewed, isQuoteReady, listQuotes, quoteTotal } from '@/features/quotes/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatSoles } from '@/lib/format'
import type { Quote, QuoteStatus } from '@/types/api'

const ESTADOS: Record<QuoteStatus, { texto: string; tono: 'neutral' | 'primary' | 'success' | 'danger' }> = {
  nueva: { texto: 'Nueva', tono: 'primary' },
  cotizada: { texto: 'Lista para enviar', tono: 'primary' },
  enviada: { texto: 'Enviada', tono: 'neutral' },
  vista: { texto: 'Vista', tono: 'neutral' },
  ganada: { texto: 'Ganada', tono: 'success' },
  perdida: { texto: 'Perdida', tono: 'danger' },
}

const FILTROS = [
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'todas', label: 'Todas' },
  { key: 'ganada', label: 'Ganadas' },
  { key: 'perdida', label: 'Perdidas' },
] as const

type Filtro = (typeof FILTROS)[number]['key']

function coincide(quote: Quote, filtro: Filtro): boolean {
  if (filtro === 'todas') return true
  if (filtro === 'pendientes') return !['ganada', 'perdida'].includes(quote.status)
  return quote.status === filtro
}

export function QuotesInboxPage() {
  const activeCompanyId = useSessionStore((s) => s.activeCompanyId)
  const [filtro, setFiltro] = useState<Filtro>('pendientes')

  const { data, isPending } = useQuery({
    queryKey: ['quotes', activeCompanyId],
    queryFn: listQuotes,
  })

  const cotizaciones = (data ?? []).filter((q) => coincide(q, filtro))

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Cotizaciones</h1>
        <p className="mt-1 text-sm text-slate-500">
          Todo lo que entra por tu web queda aquí, con el producto y el diseño que le interesó.
        </p>
      </div>

      <div className="flex gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFiltro(f.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              filtro === f.key
                ? 'bg-primary text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        {isPending ? (
          <p className="text-sm text-slate-500">Cargando...</p>
        ) : cotizaciones.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            No hay cotizaciones en este filtro.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {cotizaciones.map((quote) => {
              const dias = daysSinceViewed(quote)
              const lista = isQuoteReady(quote)

              return (
                <li key={quote.id}>
                  <Link
                    to={`/cotizaciones/${quote.id}`}
                    className="flex items-center justify-between gap-4 py-3.5 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold text-slate-900">
                        {quote.contact_name ?? 'Sin contacto todavía'}
                        <span className="font-mono text-xs font-normal text-slate-400">
                          {quote.reference}
                        </span>
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {quote.items.map((i) => `${i.quantity ?? '?'}× ${i.product_name}`).join(' · ')}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3 text-right">
                      <div>
                        {lista ? (
                          <p className="text-sm font-semibold text-slate-900">
                            {formatSoles(quoteTotal(quote))}
                          </p>
                        ) : (
                          <p className="text-sm text-amber-600">Falta cantidad</p>
                        )}
                        <p className="text-xs text-slate-400">{formatDate(quote.created_at)}</p>
                      </div>
                      {dias !== null && dias >= 3 ? (
                        <Badge tone="danger">Vista hace {dias} d.</Badge>
                      ) : (
                        <Badge tone={ESTADOS[quote.status].tono}>
                          {ESTADOS[quote.status].texto}
                        </Badge>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
