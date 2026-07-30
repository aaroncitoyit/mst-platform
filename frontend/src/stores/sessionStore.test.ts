import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionStore } from './sessionStore'
import type { CompanySummary, User } from '@/types/api'

const ACME: CompanySummary = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Acme',
  slug: 'acme',
  is_owner: false,
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: '99999999-9999-9999-9999-999999999999',
    name: 'Personal MTS',
    email: 'personal@macedotech.test',
    email_verified_at: null,
    is_active: true,
    is_platform_admin: false,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

beforeEach(() => {
  useSessionStore.getState().clearSession()
})

describe('sessionStore', () => {
  it('marca al personal de MTS al guardar el usuario', () => {
    useSessionStore.getState().setUser(user({ is_platform_admin: true }))

    expect(useSessionStore.getState().isPlatformAdmin).toBe(true)
  })

  it('no marca como personal de MTS a un usuario normal', () => {
    useSessionStore.getState().setUser(user())

    expect(useSessionStore.getState().isPlatformAdmin).toBe(false)
  })

  it('cambiar de empresa descarta roles y permisos de la anterior', () => {
    useSessionStore.setState({ roles: ['Administrador'], permissions: ['ver_reportes'] })

    useSessionStore.getState().setActiveCompany(ACME.id)

    // Si sobrevivieran, se mostrarian brevemente los permisos del tenant anterior
    expect(useSessionStore.getState().roles).toEqual([])
    expect(useSessionStore.getState().permissions).toEqual([])
  })

  it('entrar a dar soporte fija la empresa y deja rastro para la banda de aviso', () => {
    useSessionStore.getState().setUser(user({ is_platform_admin: true }))

    useSessionStore.getState().startImpersonation(ACME)

    const state = useSessionStore.getState()
    expect(state.impersonating).toEqual({ companyId: ACME.id, companyName: 'Acme' })
    expect(state.activeCompanyId).toBe(ACME.id)
    expect(state.companies).toEqual([ACME])
  })

  it('salir del soporte deja la empresa activa vacia', () => {
    useSessionStore.getState().setUser(user({ is_platform_admin: true }))
    useSessionStore.getState().startImpersonation(ACME)

    useSessionStore.getState().stopImpersonation()

    const state = useSessionStore.getState()
    expect(state.impersonating).toBeNull()
    expect(state.activeCompanyId).toBeNull()
    // Sigue siendo personal de MTS: solo ha salido del panel del cliente
    expect(state.isPlatformAdmin).toBe(true)
  })

  it('cerrar sesion limpia tambien el estado de soporte', () => {
    useSessionStore.getState().setUser(user({ is_platform_admin: true }))
    useSessionStore.getState().startImpersonation(ACME)

    useSessionStore.getState().clearSession()

    const state = useSessionStore.getState()
    expect(state.impersonating).toBeNull()
    expect(state.isPlatformAdmin).toBe(false)
    expect(state.token).toBeNull()
  })
})
