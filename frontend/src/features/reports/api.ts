import { listQuotes, quoteTotal } from '@/features/quotes/api'
import type { Quote } from '@/types/api'

/**
 * Reporte mensual que el cliente recibe.
 *
 * Es lo que hace visible el trabajo invisible: sin esto, un cliente que gestiona
 * sus propios productos no percibe por que paga una cuota cada mes.
 *
 * PRINCIPIO: aqui solo se calcula lo que el sistema SABE. Nada de inventar
 * metricas. Si un dato no tiene fuente (disponibilidad, visitas de Google), no
 * se rellena con un numero verosimil: se marca como pendiente de configurar.
 * Un reporte con datos fabricados es una mentira en cuanto se le ensena a un
 * cliente.
 */

export type ReportMetric = {
  /** Valor del mes que se reporta */
  value: number
  /** Mismo valor el mes anterior, para comparar */
  previous: number
}

export type MonthlyReport = {
  /** Primer dia del mes reportado, en ISO */
  month: string
  received: ReportMetric
  won: ReportMetric
  revenue: ReportMetric
  /** Producto mas solicitado del mes, por cantidad de veces pedido */
  topProduct: { name: string; times: number } | null
  /** Cotizaciones que siguen sin respuesta al cerrar el mes */
  pending: number
}

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** Primer día del mes anterior al indicado. */
function previousMonthKey(key: string): string {
  const [year, month] = key.split('-').map(Number)
  const d = new Date(year, month - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function resumen(quotes: Quote[], key: string) {
  const delMes = quotes.filter((q) => monthKey(q.created_at) === key)
  const ganadas = delMes.filter((q) => q.status === 'ganada')

  return {
    received: delMes.length,
    won: ganadas.length,
    revenue: ganadas.reduce((sum, q) => sum + quoteTotal(q), 0),
    pending: delMes.filter((q) => !['ganada', 'perdida'].includes(q.status)).length,
    quotes: delMes,
  }
}

/** Lista de meses con actividad, del más reciente al más antiguo. */
export async function listReportMonths(): Promise<string[]> {
  const quotes = await listQuotes()
  const keys = [...new Set(quotes.map((q) => monthKey(q.created_at)))]
  return keys.sort().reverse()
}

export async function getMonthlyReport(key: string): Promise<MonthlyReport> {
  const quotes = await listQuotes()

  const actual = resumen(quotes, key)
  const anterior = resumen(quotes, previousMonthKey(key))

  // Producto mas solicitado: cuantas veces aparece en las cotizaciones del mes
  const conteo = new Map<string, number>()
  for (const quote of actual.quotes) {
    for (const item of quote.items) {
      conteo.set(item.product_name, (conteo.get(item.product_name) ?? 0) + 1)
    }
  }
  const top = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]

  return {
    month: `${key}-01`,
    received: { value: actual.received, previous: anterior.received },
    won: { value: actual.won, previous: anterior.won },
    revenue: { value: actual.revenue, previous: anterior.revenue },
    topProduct: top ? { name: top[0], times: top[1] } : null,
    pending: actual.pending,
  }
}

/** Variación porcentual respecto al mes anterior. Null si no había con qué comparar. */
export function variation(metric: ReportMetric): number | null {
  if (metric.previous === 0) return null
  return Math.round(((metric.value - metric.previous) / metric.previous) * 100)
}
