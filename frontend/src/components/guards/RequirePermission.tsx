import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSessionStore } from '@/stores/sessionStore'

type RequirePermissionProps = {
  permission: string
  children: ReactNode
  /**
   * Por defecto el contenido simplemente no se renderiza (caso tipico: ocultar
   * un boton). Con redirect se manda a /403, para envolver paginas enteras.
   */
  redirect?: boolean
}

/**
 * Oculta o bloquea partes de la UI segun los permisos del usuario en la
 * empresa activa.
 *
 * OJO: esto es SOLO una capa de UX. La seguridad real vive en el backend
 * (Spatie Permission + RLS). El frontend nunca debe ser la unica barrera.
 */
export function RequirePermission({ permission, children, redirect = false }: RequirePermissionProps) {
  const permissions = useSessionStore((s) => s.permissions)

  if (!permissions.includes(permission)) {
    return redirect ? <Navigate to="/403" replace /> : null
  }

  return <>{children}</>
}
