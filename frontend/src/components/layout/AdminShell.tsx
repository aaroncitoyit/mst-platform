import { NavLink, Outlet } from 'react-router-dom'
import { Building2, LayoutDashboard, LogOut, Package } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/components/ui/Button'

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition ${
    isActive ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
  }`

/**
 * Shell del back-office de MTS.
 *
 * Deliberadamente oscuro y distinto del AppShell del cliente: lo peor que
 * puede pasar operando varias empresas es no saber si estas en el panel de
 * MTS o en el de un cliente.
 */
export function AdminShell() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900">
        <div className="flex h-14 items-center border-b border-white/10 px-5">
          <span className="text-sm font-semibold text-white">MTS · Back-office</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          <NavLink to="/admin" end className={linkClasses}>
            <LayoutDashboard className="size-4" aria-hidden="true" />
            Resumen
          </NavLink>
          <NavLink to="/admin/companies" className={linkClasses}>
            <Building2 className="size-4" aria-hidden="true" />
            Clientes
          </NavLink>
          <NavLink to="/admin/plans" className={linkClasses}>
            <Package className="size-4" aria-hidden="true" />
            Planes
          </NavLink>
        </nav>

        <div className="border-t border-white/10 p-3">
          <p className="px-3 pb-2 text-xs text-slate-400">{user?.email}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Salir
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}

/**
 * Banda de aviso que se muestra dentro del panel de un cliente cuando quien
 * mira es personal de MTS. Es lo que evita tocar datos de un cliente creyendo
 * que estas en tu propio panel.
 */
export function ImpersonationBanner() {
  const { impersonating, exitImpersonation } = useAuth()

  if (!impersonating) return null

  return (
    <div className="flex items-center justify-between gap-4 bg-amber-400 px-5 py-2 text-sm text-amber-950">
      <span>
        Estás viendo <strong>{impersonating.companyName}</strong> como administrador de MTS. Todo lo
        que hagas afecta a datos reales del cliente.
      </span>
      <Button variant="secondary" onClick={exitImpersonation} className="shrink-0">
        Salir del soporte
      </Button>
    </div>
  )
}
