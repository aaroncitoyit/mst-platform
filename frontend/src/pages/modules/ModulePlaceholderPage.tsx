import { Card } from '@/components/ui/Card'

/**
 * Marcador de posicion para las rutas de modulo.
 *
 * Las pantallas propias de CRM, CMS y ERP estan fuera del alcance del Sprint 3
 * (seccion 12 de la especificacion): se construyen en los Sprints 4 y 5. Esta
 * pagina solo confirma que la ruta se registro porque la empresa tiene el
 * modulo contratado.
 */
export function ModulePlaceholderPage({ label }: { label: string }) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">{label}</h1>
      <Card>
        <p className="text-sm text-slate-500">
          Este módulo está activo para tu empresa. Sus pantallas se construirán en un sprint
          posterior.
        </p>
      </Card>
    </div>
  )
}
