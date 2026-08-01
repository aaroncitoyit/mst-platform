import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { httpClient } from '@/lib/httpClient'
import { formatDate, formatSoles } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'
import { quoteTotal } from '@/features/quotes/api'
import type { Quote } from '@/types/api'

/**
 * Página pública de una cotización: la abre el cliente final desde el enlace
 * que le manda el asesor. Va FUERA de RequireAuth a propósito: quien llega aquí
 * no es un usuario del panel, es quien tiene el enlace. El token ES la
 * credencial: si se sabe la URL, se puede ver la cotización.
 */

const ESTADO: Record<Quote['status'], { label: string; tone: 'neutral' | 'primary' | 'success' | 'danger' }> = {
  nueva: { label: 'En preparación', tone: 'neutral' },
  cotizada: { label: 'Lista para enviar', tone: 'primary' },
  enviada: { label: 'Enviada', tone: 'primary' },
  vista: { label: 'Vista', tone: 'primary' },
  ganada: { label: 'Aceptada', tone: 'success' },
  perdida: { label: 'Descartada', tone: 'danger' },
}

export function PublicQuotePage() {
  const { token = '' } = useParams()

  // La URL es /c/{reference}-{token}: la referencia es para humanos, el token
  // es lo que abre la cotización.
  const publicToken = token.includes('-') ? token.slice(token.indexOf('-') + 1) : token

  const { data: quote, isPending, isError } = useQuery({
    queryKey: ['public-quote', publicToken],
    queryFn: async () => {
      const { data } = await httpClient.get<{ quote: Quote }>(`/public/cotizaciones/${publicToken}`)
      return data.quote
    },
    // El enlace puede estar ya caducado o no existir: no reintentar.
    retry: false,
  })

  if (isPending) {
    return (
      <PublicShell>
        <p className="text-sm text-slate-500">Cargando cotización...</p>
      </PublicShell>
    )
  }

  if (isError || !quote) {
    return (
      <PublicShell>
        <h1 className="text-lg font-semibold text-slate-900">Cotización no encontrada</h1>
        <p className="mt-2 text-sm text-slate-600">
          Revisa que el enlace esté completo o pide que te lo reenvíen.
        </p>
      </PublicShell>
    )
  }

  const estado = ESTADO[quote.status]
  const total = quoteTotal(quote)

  return (
    <PublicShell>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-slate-900">Tu cotización</h1>
        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-600">
          {quote.reference}
        </span>
        <Badge tone={estado.tone}>{estado.label}</Badge>
      </div>

      <p className="mt-1 text-sm text-slate-500">
        Emitida el {formatDate(quote.created_at)}
        {quote.contact_name && ` para ${quote.contact_name}`}
      </p>

      <ul className="mt-6 flex flex-col divide-y divide-slate-100">
        {quote.items.map((item) => {
          const subtotal = (item.quantity ?? 0) * Number(item.unit_price)
          return (
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
                  {formatSoles(item.unit_price)} × {item.quantity ?? 0}
                </p>
              </div>

              <p className="shrink-0 text-right font-semibold text-slate-900">
                {formatSoles(subtotal)}
              </p>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center justify-between border-t border-slate-200 pt-4">
        <span className="font-semibold text-slate-600">Total</span>
        <span className="text-xl font-semibold text-slate-900">{formatSoles(total)}</span>
      </div>
    </PublicShell>
  )
}

/** Márgenes y aire propio de una página que no vive dentro del panel. */
function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-10">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">{children}</div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Cotización generada con MTS Platform por Macedo Tech Solutions
        </p>
      </div>
    </div>
  )
}
