import { useQuery } from '@tanstack/react-query'
import { listPlans } from '@/features/admin/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export function PlansPage() {
  const { data, isPending, isError } = useQuery({ queryKey: ['admin', 'plans'], queryFn: listPlans })

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Planes</h1>
        <p className="mt-1 text-sm text-slate-500">
          El catálogo se gestiona por SQL en esta versión. Los precios están sin definir: ajústalos
          antes de vender.
        </p>
      </div>

      {isError && <p className="text-sm text-red-600">No se pudieron cargar los planes.</p>}
      {isPending && <p className="text-sm text-slate-500">Cargando...</p>}

      <div className="flex flex-col gap-4">
        {data?.map((plan) => (
          <Card
            key={plan.id}
            title={plan.name}
            actions={
              Number(plan.price) === 0 ? (
                <Badge tone="danger">Precio sin definir</Badge>
              ) : (
                <span className="text-sm font-semibold text-slate-900">
                  S/ {plan.price} / {plan.billing_period === 'monthly' ? 'mes' : 'año'}
                </span>
              )
            }
          >
            <div className="flex flex-wrap gap-2">
              {plan.modules.length === 0 ? (
                <span className="text-sm text-slate-500">Sin módulos incluidos</span>
              ) : (
                plan.modules.map((module) => (
                  <Badge key={module.id} tone="primary">
                    {module.name}
                  </Badge>
                ))
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
