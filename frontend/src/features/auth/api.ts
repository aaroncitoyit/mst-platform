import { httpClient } from '@/lib/httpClient'
import type {
  LoginPayload,
  LoginResponse,
  MeResponse,
  RegisterPayload,
  RegisterResponse,
} from '@/types/api'

export async function register(payload: RegisterPayload) {
  const { data } = await httpClient.post<RegisterResponse>('/register', payload)
  return data
}

export async function login(payload: LoginPayload) {
  const { data } = await httpClient.post<LoginResponse>('/login', payload)
  return data
}

export async function logout() {
  // /logout va fuera de company.context: se puede cerrar sesion aunque la
  // empresa activa ya no sea valida.
  await httpClient.post('/logout')
}

/**
 * Datos del usuario en la empresa activa (roles + permisos).
 *
 * companyId permite forzar el header durante el arranque de sesion, cuando se
 * acaba de elegir una empresa y no se quiere depender del orden de escritura
 * del store.
 */
export async function me(companyId?: string) {
  const { data } = await httpClient.get<MeResponse>('/me', {
    headers: companyId ? { 'X-Company-Id': companyId } : undefined,
  })
  return data
}
