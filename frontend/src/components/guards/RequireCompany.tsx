import { Navigate, Outlet } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'

/**
 * Exige empresa activa, ademas de sesion.
 *
 * Va aparte de RequireAuth porque /select-company es justo la pantalla a la que
 * se llega con sesion pero sin empresa elegida: si un unico guard exigiera
 * ambas cosas, esa ruta se redirigiria a si misma en bucle.
 *
 * Sin empresa activa no se puede llamar a ningun endpoint bajo company.context,
 * que es casi toda la API.
 */
export function RequireCompany() {
  const activeCompanyId = useSessionStore((s) => s.activeCompanyId)

  if (!activeCompanyId) {
    return <Navigate to="/select-company" replace />
  }

  return <Outlet />
}
