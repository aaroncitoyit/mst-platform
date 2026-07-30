import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Eye, Inbox } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { useSessionStore } from '@/stores/sessionStore'
import { daysSinceViewed, isQuoteReady, listQuotes, quoteTotal } from '@/features/quotes/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatSoles } from '@/lib/format'
import type { Quote } from '@/types/api'

/** Cuántos días vista sin respuesta antes de considerarla "enfriándose". */
const DIAS_PARA_ENFRIARSE = 3

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </Card>
  )
}

function QuoteRow({ quote, nota }: { quote: Quote; nota?: string }) {
  const productos = quote.items.map((i) => i.product_name).join(', ')

  return (
    <li>
      <Link
        to={`/cotizaciones/${quote.id}`}
        className="flex items-center justify-between gap-4 py-3 transition hover:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {quote.contact_name ?? `Sin contacto · ${quote.reference}`}
          </p>
          <p className="truncate text-sm text-slate-500">{productos}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {nota && <Badge tone="danger">{nota}</Badge>}
          <ArrowRight className="size-4 text-slate-400" aria-hidden="true" />
        </div>
      </Link>
    </li>
  )
}

export function DashboardHomePage() {
  const { user } = useAuth()
  const activeCompanyId = useSessionStore((s) => s.activeCompanyId)

  const { data: quotes, isPending } = useQuery({
    queryKey: ['quotes', activeCompanyId],
    queryFn: listQuotes,
  })

  if (isPending) return <p className="text-sm text-slate-500">Cargando...</p>

  const todas = quotes ?? []

  // Lo urgente: llegó y todavía no tiene cantidades puestas
  const sinCotizar = todas.filter((q) => q.status === 'nueva' || !isQuoteReady(q))

  // Se enviaron, el cliente las abrió, y nadie ha marcado si se ganaron
  const enfriandose = todas.filter((q) => {
    const dias = daysSinceViewed(q)
    return dias !== null && dias >= DIAS_PARA_ENFRIARSE
  })

  // Números del mes en curso
  const inicioDeMes = new Date()
  inicioDeMes.setDate(1)
  inicioDeMes.setHours(0, 0, 0, 0)
  const delMes = todas.filter((q) => new Date(q.created_at) >= inicioDeMes)
  const ganadasDelMes = delMes.filter((q) => q.status === 'ganada')

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Hola, {user?.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {sinCotizar.length === 0 && enfriandose.length === 0
            ? 'Todo al día. No tienes nada pendiente.'
            : 'Esto es lo que necesita tu atención hoy.'}
        </p>
      </div>

      {/* Lo urgente primero: si abre esto entre dos cosas, tiene que ver qué hacer */}
      {sinCotizar.length > 0 && (
        <Card
          title={
            <span className="flex items-center gap-2">
              <Inbox className="size-4 text-primary" aria-hidden="true" />
              Cotizaciones sin responder ({sinCotizar.length})
            </span>
          }
          description="Llegaron de tu web y todavía no tienen cantidades."
        >
          <ul className="flex flex-col divide-y divide-slate-100">
            {sinCotizar.map((q) => (
              <QuoteRow key={q.id} quote={q} />
            ))}
          </ul>
        </Card>
      )}

      {enfriandose.length > 0 && (
        <Card
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />
              Se están enfriando ({enfriandose.length})
            </span>
          }
          description="Tu cliente abrió la cotización y todavía no sabes en qué quedó."
        >
          <ul className="flex flex-col divide-y divide-slate-100">
            {enfriandose.map((q) => (
              <QuoteRow key={q.id} quote={q} nota={`Vista hace ${daysSinceViewed(q)} d.`} />
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Cotizaciones este mes" value={String(delMes.length)} />
        <Metric
          label="Cerradas este mes"
          value={String(ganadasDelMes.length)}
          hint={
            delMes.length > 0
              ? `${Math.round((ganadasDelMes.length / delMes.length) * 100)}% de las que llegaron`
              : undefined
          }
        />
        <Metric
          label="Vendido este mes"
          value={formatSoles(ganadasDelMes.reduce((sum, q) => sum + quoteTotal(q), 0))}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            <Eye className="mr-1.5 inline size-4 text-slate-400" aria-hidden="true" />
            Ver todas las cotizaciones o mantener tu catálogo.
          </p>
          <div className="flex gap-2">
            <Link to="/cotizaciones">
              <Button variant="secondary">Cotizaciones</Button>
            </Link>
            <Link to="/productos">
              <Button variant="secondary">Productos</Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
