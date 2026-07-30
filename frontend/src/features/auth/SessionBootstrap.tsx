import { useEffect, useState, type ReactNode } from 'react'
import { useSessionStore } from '@/stores/sessionStore'
import { listMyCompanies } from '@/features/companies/api'
import { adminMe } from '@/features/admin/api'
import { me } from './api'
import { resolveActiveCompany } from './useAuth'
import { FullScreenLoader } from '@/components/ui/FullScreenLoader'

/**
 * Rehidrata la sesion al arrancar la aplicacion.
 *
 * De localStorage solo vienen el token, la empresa activa y el estado de
 * impersonacion; todo lo demas se pide al backend. El orden importa: /api/me
 * exige el header X-Company-Id, asi que primero hay que saber que empresas
 * tiene el usuario y cual sigue siendo valida. Para eso existe
 * /api/my-companies, que va fuera de company.context.
 *
 * Hasta que esto termina se muestra un cargador: si se renderizara el router
 * antes, se veria un parpadeo a /login en cada refresco de pagina.
 */
export function SessionBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function bootstrapPlatformAdmin(impersonatingCompanyId: string | null) {
      const { setUser, setProfile, stopImpersonation } = useSessionStore.getState()

      const admin = await adminMe()
      if (cancelled) return
      setUser(admin)

      // Si venia dando soporte a una empresa, se recupera ese estado para que
      // la banda de aviso vuelva a aparecer junto con el panel del cliente.
      if (impersonatingCompanyId) {
        try {
          const profile = await me(impersonatingCompanyId)
          if (!cancelled) setProfile(profile)
        } catch {
          // La empresa ya no existe o no es accesible: se sale del soporte
          if (!cancelled) stopImpersonation()
        }
      }
    }

    async function bootstrapTenantUser(activeCompanyId: string | null) {
      const { setCompanies, setActiveCompany, setProfile } = useSessionStore.getState()

      const companies = await listMyCompanies()
      if (cancelled) return
      setCompanies(companies)

      const target = resolveActiveCompany(companies, activeCompanyId)

      // Descarta la empresa guardada si ya no aparece en la lista: es el caso
      // de un usuario al que le retiraron el acceso mientras no estaba.
      if (target !== activeCompanyId) setActiveCompany(target)

      if (target) {
        const profile = await me(target)
        if (!cancelled) setProfile(profile)
      }
    }

    async function bootstrap() {
      const { token, activeCompanyId, impersonating, clearSession } = useSessionStore.getState()

      if (!token) {
        setReady(true)
        return
      }

      try {
        // No se sabe todavia si el token es de personal de MTS o de un cliente.
        // /api/admin/me responde 403 para los clientes, y ese 403 es la señal.
        try {
          await bootstrapPlatformAdmin(impersonating?.companyId ?? null)
        } catch (error) {
          const status = (error as { response?: { status?: number } })?.response?.status
          if (status !== 403) throw error
          await bootstrapTenantUser(activeCompanyId)
        }
      } catch {
        // Un 401 ya limpio el store desde el interceptor; cualquier otro fallo
        // deja la sesion en un estado incierto, asi que se cierra y se vuelve
        // a empezar en /login.
        if (!cancelled) clearSession()
      } finally {
        if (!cancelled) setReady(true)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) return <FullScreenLoader />

  return <>{children}</>
}
