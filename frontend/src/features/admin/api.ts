import { httpClient } from '@/lib/httpClient'
import type {
  AdminCompanyDetail,
  AdminCompanyRow,
  AdminStats,
  BillingPeriod,
  ClientNote,
  ClientService,
  ClientServiceStatus,
  CompanySummary,
  CreateCompanyPayload,
  Opportunity,
  OpportunityStatus,
  Plan,
  Service,
  User,
} from '@/types/api'

/**
 * API del back-office de MTS.
 *
 * Todo lo de aqui va contra /api/admin/*, protegido por el middleware
 * platform.admin. Un usuario normal recibe 403.
 */

export async function adminMe() {
  const { data } = await httpClient.get<{ user: User }>('/admin/me')
  return data.user
}

export async function getStats() {
  const { data } = await httpClient.get<AdminStats>('/admin/stats')
  return data
}

export async function listPlans() {
  const { data } = await httpClient.get<{ plans: Plan[] }>('/admin/plans')
  return data.plans
}

export async function listCompanies(search?: string) {
  const { data } = await httpClient.get<{ companies: AdminCompanyRow[] }>('/admin/companies', {
    params: search ? { buscar: search } : undefined,
  })
  return data.companies
}

export async function getCompany(id: string) {
  const { data } = await httpClient.get<AdminCompanyDetail>(`/admin/companies/${id}`)
  return data
}

export async function createCompany(payload: CreateCompanyPayload) {
  const { data } = await httpClient.post<{ company: { id: string } }>('/admin/companies', payload)
  return data.company
}

export async function updateCompany(id: string, payload: { name?: string; is_active?: boolean }) {
  const { data } = await httpClient.patch<AdminCompanyDetail>(`/admin/companies/${id}`, payload)
  return data
}

export async function changePlan(id: string, planId: string) {
  const { data } = await httpClient.put<AdminCompanyDetail>(`/admin/companies/${id}/plan`, {
    plan_id: planId,
  })
  return data
}

/**
 * Deja constancia en audit_logs de que entras al panel de un cliente.
 * El acceso lo permite el backend por ser administrador de plataforma; esta
 * llamada existe para que quede registrado el momento de entrada.
 */
export async function impersonate(id: string) {
  const { data } = await httpClient.post<{ company: CompanySummary }>(
    `/admin/companies/${id}/impersonate`,
  )
  return data.company
}

/* ---------- Cartera: servicios, oportunidades y notas ---------- */

export async function listServices() {
  const { data } = await httpClient.get<{ services: Service[] }>('/admin/services')
  return data.services
}

export async function addClientService(
  companyId: string,
  payload: {
    service_id: string
    price: number
    billing_period: BillingPeriod
    started_on?: string | null
    next_renewal_on?: string | null
    notes?: string | null
  },
) {
  const { data } = await httpClient.post<{ client_service: ClientService }>(
    `/admin/companies/${companyId}/services`,
    payload,
  )
  return data.client_service
}

export async function updateClientService(
  id: string,
  payload: Partial<{
    price: number
    billing_period: BillingPeriod
    status: ClientServiceStatus
    next_renewal_on: string | null
    notes: string | null
  }>,
) {
  const { data } = await httpClient.patch<{ client_service: ClientService }>(
    `/admin/client-services/${id}`,
    payload,
  )
  return data.client_service
}

/** Adelanta la fecha de vencimiento un periodo (un mes o un año). */
export async function renewClientService(id: string) {
  const { data } = await httpClient.post<{ client_service: ClientService }>(
    `/admin/client-services/${id}/renew`,
  )
  return data.client_service
}

export async function deleteClientService(id: string) {
  await httpClient.delete(`/admin/client-services/${id}`)
}

export async function addOpportunity(
  companyId: string,
  payload: { title: string; description?: string | null; estimated_value?: number | null },
) {
  const { data } = await httpClient.post<{ opportunity: Opportunity }>(
    `/admin/companies/${companyId}/opportunities`,
    payload,
  )
  return data.opportunity
}

export async function updateOpportunity(id: string, payload: { status: OpportunityStatus }) {
  const { data } = await httpClient.patch<{ opportunity: Opportunity }>(
    `/admin/opportunities/${id}`,
    payload,
  )
  return data.opportunity
}

export async function deleteOpportunity(id: string) {
  await httpClient.delete(`/admin/opportunities/${id}`)
}

export async function addNote(companyId: string, body: string) {
  const { data } = await httpClient.post<{ note: ClientNote }>(
    `/admin/companies/${companyId}/notes`,
    { body },
  )
  return data.note
}

export async function deleteNote(id: string) {
  await httpClient.delete(`/admin/notes/${id}`)
}
