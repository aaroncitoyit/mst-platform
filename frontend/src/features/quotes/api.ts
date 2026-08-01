import type { Quote, QuoteStatus } from '@/types/api'
import { httpClient } from '@/lib/httpClient'

/**
 * Cotizaciones del cliente: lo que llega de la web al panel.
 *
 * El backend (quote_requests + quote_request_items, script 015) ya existe.
 * Estas llamadas van autenticadas: httpClient inyecta el token y el
 * X-Company-Id, y el middleware company.context limita cada respuesta a la
 * empresa activa. El enlace público no se guarda en la base: se construye aquí
 * desde el token, porque el dominio cambia entre local y producción.
 */

/** La URL pública es /c/{reference}-{token}, la misma que abre el visitante. */
function enlacePublico(q: Quote): string | null {
  if (!q.public_token) return null
  return `${window.location.origin}/c/${q.reference.toLowerCase()}-${q.public_token}`
}

function conEnlace(q: Quote): Quote {
  return { ...q, public_url: enlacePublico(q) }
}

type QuoteResponse = { quote: Quote }

export async function listQuotes(): Promise<Quote[]> {
  const { data } = await httpClient.get<{ quotes: Quote[] }>('/quotes')
  return data.quotes.map(conEnlace)
}

export async function getQuote(id: string): Promise<Quote> {
  const { data } = await httpClient.get<QuoteResponse>(`/quotes/${id}`)
  return conEnlace(data.quote)
}

/**
 * Guarda las cantidades que pone el asesor. En cuanto todas las líneas tienen
 * cantidad, el backend pasa la cotización a "cotizada" y genera su token.
 */
export async function saveQuantities(id: string, quantities: Record<string, number | null>): Promise<Quote> {
  const { data } = await httpClient.patch<QuoteResponse>(`/quotes/${id}/items`, { quantities })
  return conEnlace(data.quote)
}

export async function markQuoteStatus(id: string, status: QuoteStatus): Promise<Quote> {
  const { data } = await httpClient.patch<QuoteResponse>(`/quotes/${id}/status`, { status })
  return conEnlace(data.quote)
}

/* ---------- Cálculos ---------- */

/** Total de una cotización. Ignora las líneas sin cantidad. */
export function quoteTotal(quote: Quote): number {
  return quote.items.reduce(
    (sum, item) => sum + (item.quantity ?? 0) * Number(item.unit_price),
    0,
  )
}

/** Una cotización está lista para enviar cuando todas sus líneas tienen cantidad. */
export function isQuoteReady(quote: Quote): boolean {
  return quote.items.every((item) => item.quantity !== null && item.quantity > 0)
}

/** Días que lleva vista sin marcar resultado. Null si no aplica. */
export function daysSinceViewed(quote: Quote): number | null {
  if (!quote.viewed_at || quote.status === 'ganada' || quote.status === 'perdida') return null
  const visto = new Date(quote.viewed_at)
  visto.setHours(0, 0, 0, 0)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.round((hoy.getTime() - visto.getTime()) / 86_400_000)
}
