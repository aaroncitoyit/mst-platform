import { describe, expect, it } from 'vitest'
import { resolveActiveCompany } from './useAuth'
import type { CompanySummary } from '@/types/api'

function company(id: string, name = id): CompanySummary {
  return { id, name, slug: name.toLowerCase(), is_owner: false }
}

const ACME = company('11111111-1111-1111-1111-111111111111', 'Acme')
const GLOBEX = company('22222222-2222-2222-2222-222222222222', 'Globex')

describe('resolveActiveCompany', () => {
  it('elige sola la empresa cuando el usuario solo pertenece a una', () => {
    expect(resolveActiveCompany([ACME], null)).toBe(ACME.id)
  })

  it('no elige ninguna cuando el usuario pertenece a varias', () => {
    // Devolver null es lo que manda al usuario a /select-company
    expect(resolveActiveCompany([ACME, GLOBEX], null)).toBeNull()
  })

  it('respeta la empresa guardada si sigue en la lista', () => {
    expect(resolveActiveCompany([ACME, GLOBEX], GLOBEX.id)).toBe(GLOBEX.id)
  })

  it('descarta la empresa guardada si ya no esta en la lista', () => {
    // Caso real: al usuario le revocaron el acceso mientras no estaba. Con
    // varias empresas restantes toca volver a elegir.
    expect(resolveActiveCompany([ACME, GLOBEX], 'empresa-borrada')).toBeNull()
  })

  it('descarta la guardada pero elige la unica que queda', () => {
    expect(resolveActiveCompany([ACME], 'empresa-borrada')).toBe(ACME.id)
  })

  it('no elige nada si el usuario no pertenece a ninguna empresa', () => {
    expect(resolveActiveCompany([], null)).toBeNull()
    expect(resolveActiveCompany([], ACME.id)).toBeNull()
  })
})
