import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getStats } from '@/features/admin/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatSoles, formatDate, diasHasta } from '@/lib/format'

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'danger'
}) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-1 text-3xl font-semibold ${tone === 'danger' ? 'text-red-600' : 'text-slate-900'}`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </Card>
  )
}

export function AdminHomePage() {
  const { data, isPending, isError } = useQuery({ queryKey: ['admin', 'stats'], queryFn: getStats })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Resumen</h1>
        <Link to="/admin/companies/new">
          <Button>Nuevo cliente</Button>
        </Link>
      </div>

      {isError && <p className="text-sm text-red-600">No se pudieron cargar los datos.</p>}
      {isPending && <p className="text-sm text-slate-500">Cargando...</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Ingreso recurrente mensual"
              value={formatSoles(data.ingreso_recurrente_mensual)}
              hint="Servicios activos, con los anuales prorrateados"
            />
            <Metric label="Clientes activos" value={String(data.clientes_activos)} />
            <Metric
              label="Oportunidades abiertas"
              value={String(data.oportunidades_abiertas)}
              hint={
                data.oportunidades_valor > 0
                  ? `${formatSoles(data.oportunidades_valor)} en juego`
                  : undefined
              }
            />
          </div>

          <Card
            title="Vencimientos próximos"
            description="Los siguientes 30 días. Es lo que se cobra o se pierde."
          >
            {data.vencimientos.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">
                Nada vence en los próximos 30 días.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100">
                {data.vencimientos.map((v) => {
                  const dias = diasHasta(v.next_renewal_on)
                  const vencido = dias < 0

                  return (
                    <li key={v.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Link
                          to={`/admin/companies/${v.company_id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {v.company_name}
                        </Link>
                        <p className="text-sm text-slate-500">
                          {v.service_name} · {formatSoles(v.price)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {vencido ? (
                          <Badge tone="danger">Vencido hace {Math.abs(dias)} d.</Badge>
                        ) : (
                          <Badge tone={dias <= 7 ? 'primary' : 'neutral'}>
                            {dias === 0 ? 'Vence hoy' : `En ${dias} d.`}
                          </Badge>
                        )}
                        <p className="mt-1 text-xs text-slate-400">
                          {formatDate(v.next_renewal_on)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
