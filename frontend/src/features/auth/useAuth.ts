import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'
import type { CompanySummary, LoginPayload, RegisterPayload } from '@/types/api'
import * as authApi from './api'

/**
 * Decide que empresa debe quedar activa a partir de la lista real del backend
 * y de la que hubiera guardada en localStorage.
 *
 * - Si la guardada sigue en la lista, se respeta.
 * - Si ya no esta (le revocaron el acceso), se descarta.
 * - Con una sola empresa, se elige sola.
 * - Con varias y ninguna valida, devuelve null: toca elegir en /select-company.
 *
 * Se exporta aparte de useAuth porque es la regla de negocio del arranque de
 * sesion y conviene poder probarla sin montar React.
 */
export function resolveActiveCompany(
  companies: CompanySummary[],
  persistedId: string | null,
): string | null {
  if (persistedId && companies.some((company) => company.id === persistedId)) {
    return persistedId
  }
  if (companies.length === 1) {
    return companies[0].id
  }
  return null
}

export function useAuth() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const user = useSessionStore((s) => s.user)
  const companies = useSessionStore((s) => s.companies)
  const activeCompanyId = useSessionStore((s) => s.activeCompanyId)
  const roles = useSessionStore((s) => s.roles)
  const permissions = useSessionStore((s) => s.permissions)
  const token = useSessionStore((s) => s.token)
  const isPlatformAdmin = useSessionStore((s) => s.isPlatformAdmin)
  const impersonating = useSessionStore((s) => s.impersonating)

  const activeCompany = companies.find((company) => company.id === activeCompanyId) ?? null

  /** Fija la empresa activa y recarga el perfil (roles y permisos) para ella. */
  async function activateCompany(companyId: string) {
    const store = useSessionStore.getState()
    store.setActiveCompany(companyId)

    // La cache de React Query es por empresa: nunca debe sobrevivir a un cambio
    // de empresa, o se mostrarian datos del tenant anterior.
    queryClient.clear()

    const profile = await authApi.me(companyId)
    useSessionStore.getState().setProfile(profile)
  }

  async function signIn(payload: LoginPayload) {
    const result = await authApi.login(payload)

    const store = useSessionStore.getState()
    store.setToken(result.token)
    store.setUser(result.user)

    // El personal de MTS no tiene empresas: va directo al back-office
    if (result.user.is_platform_admin) {
      navigate('/admin', { replace: true })
      return
    }

    store.setCompanies(result.companies)

    const target = resolveActiveCompany(result.companies, null)

    if (target) {
      await activateCompany(target)
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/select-company', { replace: true })
    }
  }

  async function signUp(payload: RegisterPayload) {
    const result = await authApi.register(payload)

    // register devuelve la empresa recien creada, no la lista de empresas:
    // quien registra es siempre el dueño de una unica empresa.
    const summary: CompanySummary = {
      id: result.company.id,
      name: result.company.name,
      slug: result.company.slug,
      is_owner: true,
    }

    const store = useSessionStore.getState()
    store.setToken(result.token)
    store.setUser(result.user)
    store.setCompanies([summary])

    await activateCompany(summary.id)
    navigate('/dashboard', { replace: true })
  }

  /** Cambio de empresa desde el CompanySwitcher. No hay endpoint: es local. */
  async function switchCompany(companyId: string) {
    await activateCompany(companyId)
    navigate('/dashboard', { replace: true })
  }

  /**
   * Entra al panel de un cliente para dar soporte, conservando la identidad
   * del administrador. La llamada que deja constancia en audit_logs la hace
   * quien invoca esto (features/admin/api.ts), antes de llegar aqui.
   */
  async function enterCompanyAsAdmin(company: CompanySummary) {
    queryClient.clear()
    useSessionStore.getState().startImpersonation(company)

    const profile = await authApi.me(company.id)
    useSessionStore.getState().setProfile(profile)

    navigate('/dashboard', { replace: true })
  }

  function exitImpersonation() {
    queryClient.clear()
    useSessionStore.getState().stopImpersonation()
    navigate('/admin', { replace: true })
  }

  async function signOut() {
    try {
      await authApi.logout()
    } catch {
      // Si el token ya no vale, da igual: la sesion local se limpia abajo.
    }
    useSessionStore.getState().clearSession()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return {
    token,
    user,
    companies,
    activeCompanyId,
    activeCompany,
    roles,
    permissions,
    isPlatformAdmin,
    impersonating,
    isAuthenticated: !!token,
    hasPermission: (permission: string) => permissions.includes(permission),
    signIn,
    signUp,
    switchCompany,
    enterCompanyAsAdmin,
    exitImpersonation,
    signOut,
  }
}
