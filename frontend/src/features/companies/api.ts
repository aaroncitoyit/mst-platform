import { httpClient } from '@/lib/httpClient'
import type { CurrentCompanyResponse, MyCompaniesResponse } from '@/types/api'

/**
 * Empresas del usuario. Este endpoint va fuera de company.context en el
 * backend, asi que es el unico que se puede llamar sin empresa activa: es lo
 * que permite arrancar la app tras un refresco de pagina.
 */
export async function listMyCompanies() {
  const { data } = await httpClient.get<MyCompaniesResponse>('/my-companies')
  return data.companies
}

/** Empresa activa y sus modulos contratados. Alimenta el menu lateral. */
export async function getCurrentCompany(companyId?: string) {
  const { data } = await httpClient.get<CurrentCompanyResponse>('/company', {
    headers: companyId ? { 'X-Company-Id': companyId } : undefined,
  })
  return data
}
