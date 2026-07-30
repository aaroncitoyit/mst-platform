import { NavLink } from 'react-router-dom'
import { FileBarChart, LayoutDashboard, User } from 'lucide-react'
import { useCompany } from '@/features/companies/useCompany'
import { MODULE_MENU_MAP } from './moduleMenu'

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition ${
    isActive ? 'bg-primary-soft text-primary' : 'text-slate-600 hover:bg-slate-100'
  }`

/**
 * Menu del panel del cliente.
 *
 * Sin cabeceras de seccion y sin la ficha de "Empresa": los datos de la empresa,
 * su plan y sus modulos contratados son la vista ADMINISTRATIVA que necesita
 * Macedo Tech, y ya viven en el back-office. Al cliente no le aportan nada y le
 * ensenan vocabulario comercial que no es suyo.
 *
 * Regla general de esta pantalla: solo entra lo que el cliente USA para
 * trabajar.
 */
export function Sidebar() {
  const { data } = useCompany()

  // El menu no esta hardcodeado: sale de los modulos que la empresa tiene
  // contratados en company_modules.
  const moduleEntries = (data?.modules ?? [])
    .map((module) => MODULE_MENU_MAP[module.slug])
    .filter(Boolean)

  // El reporte se alimenta de las cotizaciones. Sin ese modulo no tendria nada
  // que reportar, y un reporte permanentemente vacio es peor que no tenerlo.
  const tieneReporte = (data?.modules ?? []).some((m) => m.slug === 'crm')

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-14 items-center border-b border-slate-200 px-5">
        <span className="text-sm font-semibold text-primary">MTS Platform</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        <NavLink to="/dashboard" className={linkClasses}>
          <LayoutDashboard className="size-4" aria-hidden="true" />
          Inicio
        </NavLink>

        {moduleEntries.map((entry) => (
          <NavLink key={entry.path} to={entry.path} className={linkClasses}>
            <entry.icon className="size-4" aria-hidden="true" />
            {entry.label}
          </NavLink>
        ))}

        {tieneReporte && (
          <NavLink to="/reporte" className={linkClasses}>
            <FileBarChart className="size-4" aria-hidden="true" />
            Reporte mensual
          </NavLink>
        )}
      </nav>

      {/* Abajo y separado: no es trabajo diario */}
      <div className="border-t border-slate-200 p-3">
        <NavLink to="/settings/profile" className={linkClasses}>
          <User className="size-4" aria-hidden="true" />
          Mi perfil
        </NavLink>
      </div>
    </aside>
  )
}
