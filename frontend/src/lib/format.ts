/** Formato de moneda, fechas y periodicidades. Todo en soles y en español. */

export function formatSoles(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0)
  return `S/ ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  // Las fechas llegan como YYYY-MM-DD; se parsean por partes para evitar que
  // el navegador las interprete como UTC y las muestre con un día de menos.
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Días desde hoy hasta la fecha. Negativo si ya pasó. */
export function diasHasta(value: string): number {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  const objetivo = new Date(year, month - 1, day)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  objetivo.setHours(0, 0, 0, 0)
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86_400_000)
}

export const PERIODOS: Record<string, string> = {
  monthly: 'al mes',
  yearly: 'al año',
  one_time: 'pago único',
}

export function formatPeriodo(period: string): string {
  return PERIODOS[period] ?? period
}
