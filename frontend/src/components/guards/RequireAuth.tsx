import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'

/**
 * Exige sesion iniciada. Es tambien el punto donde aterriza el usuario cuando
 * el interceptor de httpClient limpia el store tras un 401: al quedarse sin
 * token, este guard redirige con el router, sin recargar la pagina.
 */
export function RequireAuth() {
  const token = useSessionStore((s) => s.token)
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
