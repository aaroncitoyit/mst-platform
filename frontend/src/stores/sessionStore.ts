import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CompanySummary, MeResponse, User } from '@/types/api'

/** Empresa en la que un administrador de MTS esta dando soporte */
export type Impersonation = {
  companyId: string
  companyName: string
}

type SessionState = {
  token: string | null
  user: User | null
  companies: CompanySummary[]
  activeCompanyId: string | null
  /** Roles del usuario EN LA EMPRESA ACTIVA */
  roles: string[]
  /** Permisos del usuario en la empresa activa. Solo para UX. */
  permissions: string[]
  /** Personal de Macedo Tech: entra al back-office, no a un panel de cliente */
  isPlatformAdmin: boolean
  impersonating: Impersonation | null

  setToken: (token: string | null) => void
  setUser: (user: User | null) => void
  setCompanies: (companies: CompanySummary[]) => void
  setActiveCompany: (companyId: string | null) => void
  /** Vuelca la respuesta de /api/me en el store */
  setProfile: (me: MeResponse) => void
  startImpersonation: (company: CompanySummary) => void
  stopImpersonation: () => void
  clearSession: () => void
  hasPermission: (permission: string) => boolean
}

const empty = {
  token: null,
  user: null,
  companies: [],
  activeCompanyId: null,
  roles: [],
  permissions: [],
  isPlatformAdmin: false,
  impersonating: null,
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      ...empty,

      setToken: (token) => set({ token }),
      setUser: (user) => set({ user, isPlatformAdmin: !!user?.is_platform_admin }),
      setCompanies: (companies) => set({ companies }),

      // Cambiar de empresa invalida roles y permisos: son distintos en cada una
      // y se recargan desde /api/me. Dejarlos vivos aqui mostraria brevemente
      // los permisos de la empresa anterior.
      setActiveCompany: (activeCompanyId) => set({ activeCompanyId, roles: [], permissions: [] }),

      setProfile: (me) =>
        set({
          user: me.user,
          roles: me.roles,
          permissions: me.permissions,
          isPlatformAdmin: !!me.user?.is_platform_admin,
        }),

      startImpersonation: (company) =>
        set({
          impersonating: { companyId: company.id, companyName: company.name },
          activeCompanyId: company.id,
          companies: [company],
          roles: [],
          permissions: [],
        }),

      stopImpersonation: () =>
        set({
          impersonating: null,
          activeCompanyId: null,
          companies: [],
          roles: [],
          permissions: [],
        }),

      clearSession: () => set({ ...empty }),

      hasPermission: (permission) => get().permissions.includes(permission),
    }),
    {
      name: 'mts-session',
      /**
       * Solo se persisten el token, la empresa activa y el estado de
       * impersonacion. La lista de empresas, los roles y los permisos se
       * rehidratan desde la API en cada arranque: si a alguien le revocan el
       * acceso a una empresa, no debe seguir viendo datos obsoletos guardados
       * en localStorage.
       *
       * `impersonating` SI se persiste, y a proposito: si al refrescar la
       * pagina se perdiera, un administrador de MTS seguiria con la empresa
       * activa puesta pero sin la banda de aviso, tocando datos de un cliente
       * sin saberlo. Es justo el fallo que la banda evita.
       */
      partialize: (state) => ({
        token: state.token,
        activeCompanyId: state.activeCompanyId,
        impersonating: state.impersonating,
      }),
    },
  ),
)
