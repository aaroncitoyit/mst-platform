import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Printer, TrendingDown, TrendingUp } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { useAuth } from '@/features/auth/useAuth'
import { getMonthlyReport, listReportMonths, variation, type ReportMetric } from '@/features/reports/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { formatSoles } from '@/lib/format'

function nombreDeMes(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('es-PE', {
    month: 'long',
    year: 'numeric',
  })
}

function Comparacion({ metric }: { metric: ReportMetric }) {
  const pct = variation(metric)

  if (pct === null) {
    return <span className="text-sm text-slate-400">sin mes anterior con el que comparar</span>
  }

  if (pct === 0) {
    return <span className="text-sm text-slate-500">igual que el mes pasado</span>
  }

  const sube = pct > 0
  const Icono = sube ? TrendingUp : TrendingDown

  return (
    <span
      className={`flex items-center gap-1 text-sm font-semibold ${
        sube ? 'text-emerald-600' : 'text-red-600'
      }`}
    >
      <Icono className="size-4" aria-hidden="true" />
      {sube ? '+' : ''}
      {pct}% vs. mes pasado
    </span>
  )
}

function Numero({
  label,
  value,
  metric,
}: {
  label: string
  value: string
  metric: ReportMetric
}) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
      <div className="mt-1">
        <Comparacion metric={metric} />
      </div>
    </Card>
  )
}

/** Sección sin fuente de datos todavía. Se dice, no se rellena con algo verosímil. */
function PendienteDeConfigurar({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card title={title}>
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
        <p className="text-sm text-slate-600">{children}</p>
      </div>
    </Card>
  )
}

export function MonthlyReportPage() {
  const activeCompanyId = useSessionStore((s) => s.activeCompanyId)
  const { activeCompany } = useAuth()
  const [mes, setMes] = useState<string | null>(null)

  const { data: meses } = useQuery({
    queryKey: ['report-months', activeCompanyId],
    queryFn: listReportMonths,
  })

  const mesElegido = mes ?? meses?.[0] ?? null

  const { data: reporte, isPending } = useQuery({
    queryKey: ['report', activeCompanyId, mesElegido],
    queryFn: () => getMonthlyReport(mesElegido!),
    enabled: !!mesElegido,
  })

  if (!meses || meses.length === 0) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <h1 className="text-xl font-semibold text-slate-900">Reporte mensual</h1>
        <Card>
          <p className="text-sm text-slate-500">
            Todavía no hay actividad que reportar. En cuanto empiecen a llegar cotizaciones, aquí
            verás el resumen de cada mes.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reporte mensual</h1>
          <p className="mt-1 text-sm text-slate-500">{activeCompany?.name}</p>
        </div>

        <div className="flex items-end gap-2 print:hidden">
          <div className="w-48">
            <Select
              label="Mes"
              value={mesElegido ?? ''}
              onChange={(e) => setMes(e.target.value)}
              options={meses.map((m) => ({ value: m, label: nombreDeMes(m) }))}
            />
          </div>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden="true" />
            Imprimir
          </Button>
        </div>
      </div>

      {isPending || !reporte ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <>
          <h2 className="text-lg font-semibold capitalize text-slate-800">
            {nombreDeMes(mesElegido!)}
          </h2>

          {/* Lo que el sistema sabe de verdad */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Numero
              label="Cotizaciones recibidas"
              value={String(reporte.received.value)}
              metric={reporte.received}
            />
            <Numero
              label="Cerradas"
              value={String(reporte.won.value)}
              metric={reporte.won}
            />
            <Numero
              label="Vendido"
              value={formatSoles(reporte.revenue.value)}
              metric={reporte.revenue}
            />
          </div>

          <Card title="Tu negocio este mes">
            <dl className="grid gap-3 text-sm sm:grid-cols-[16rem_1fr]">
              <dt className="font-semibold text-slate-600">Producto más solicitado</dt>
              <dd className="text-slate-800">
                {reporte.topProduct
                  ? `${reporte.topProduct.name} · pedido ${reporte.topProduct.times} ${reporte.topProduct.times === 1 ? 'vez' : 'veces'}`
                  : '—'}
              </dd>

              <dt className="font-semibold text-slate-600">Tasa de cierre</dt>
              <dd className="text-slate-800">
                {reporte.received.value > 0
                  ? `${Math.round((reporte.won.value / reporte.received.value) * 100)}% de las que llegaron`
                  : '—'}
              </dd>

              <dt className="font-semibold text-slate-600">Siguen sin respuesta</dt>
              <dd className={reporte.pending > 0 ? 'font-semibold text-amber-600' : 'text-slate-800'}>
                {reporte.pending}
              </dd>
            </dl>
          </Card>

          {/* Lo que todavia no tiene de donde salir. Se dice claramente. */}
          <PendienteDeConfigurar title="Visibilidad en Google">
            Pendiente de conectar Google Search Console. Cuando esté, aquí verás cuántas visitas
            recibió tu web, desde qué búsquedas llegaron y cómo van posicionando tus productos.
          </PendienteDeConfigurar>

          <PendienteDeConfigurar title="Mantenimiento del mes">
            Pendiente de configurar el monitoreo. Cuando esté, aquí verás el tiempo que tu web
            estuvo disponible, los respaldos realizados, las actualizaciones de seguridad aplicadas
            y la comprobación de que tus cotizaciones siguen llegando.
          </PendienteDeConfigurar>

          <p className="text-sm text-slate-400">
            Reporte generado por MTS Platform · Macedo Tech Solutions
          </p>
        </>
      )}
    </div>
  )
}
