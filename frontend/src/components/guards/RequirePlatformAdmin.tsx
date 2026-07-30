import { Navigate, Outlet } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'

/**
 * Restringe el back-office al personal de Macedo Tech.
 *
 * Es solo una capa de experiencia de usuario: la barrera real es el middleware
 * platform.admin del backend, que responde 403 en /api/admin/*.
 */
export function RequirePlatformAdmin() {
  const isPlatformAdmin = useSessionStore((s) => s.isPlatformAdmin)

  if (!isPlatformAdmin) {
    return <Navigate to="/403" replace />
  }

  return <Outlet />
}
