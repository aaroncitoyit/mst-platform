import type { Quote, QuoteStatus } from '@/types/api'
import { MOCK_QUOTES } from './mock'

/**
 * Cotizaciones que llegan de la web del cliente.
 *
 * TEMPORAL: trabaja contra datos en memoria porque las tablas `quote_requests`
 * y `quote_request_items` todavía no existen. Las firmas son las de la API real,
 * así que al construir el backend **solo cambia este archivo**.
 */

let cotizaciones: Quote[] = structuredClone(MOCK_QUOTES)

function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export function listQuotes() {
  return delay(structuredClone(cotizaciones))
}

export async function getQuote(id: string) {
  const found = cotizaciones.find((q) => q.id === id)
  if (!found) throw new Error('Cotización no encontrada')
  return delay(structuredClone(found))
}

/**
 * Guarda las cantidades que pone el asesor. En cuanto todas las líneas tienen
 * cantidad, la cotización pasa a "cotizada" y se genera su enlace público.
 */
export async function saveQuantities(id: string, quantities: Record<string, number | null>) {
  cotizaciones = cotizaciones.map((q) => {
    if (q.id !== id) return q

    const items = q.items.map((item) =>
      item.id in quantities ? { ...item, quantity: quantities[item.id] } : item,
    )

    const completa = items.every((item) => item.quantity !== null && item.quantity > 0)

    return {
      ...q,
      items,
      status: completa && q.status === 'nueva' ? 'cotizada' : q.status,
      public_url:
        completa && !q.public_url
          ? `https://app.macedotech.pe/c/${q.reference.toLowerCase()}-${Math.random().toString(16).slice(2, 12)}`
          : q.public_url,
    }
  })

  return getQuote(id)
}

export async function markQuoteStatus(id: string, status: QuoteStatus) {
  cotizaciones = cotizaciones.map((q) => (q.id === id ? { ...q, status } : q))
  return getQuote(id)
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
