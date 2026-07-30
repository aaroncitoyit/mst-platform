/**
 * Tipos que reflejan las respuestas del backend Laravel.
 * Mantener en sincronia con app/Http/Controllers/Api/.
 */

export type User = {
  id: string
  name: string
  email: string
  email_verified_at: string | null
  is_active: boolean
  /** Personal de Macedo Tech: accede al back-office, no pertenece a ninguna empresa */
  is_platform_admin: boolean
  created_at: string
  updated_at: string
}

/** Fila devuelta por la funcion SQL get_user_companies() */
export type CompanySummary = {
  id: string
  name: string
  slug: string
  is_owner: boolean
}

export type Company = {
  id: string
  name: string
  slug: string
  country_id: string | null
  currency_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Module = {
  id: string
  name: string
  /** cms | crm | erp | ai */
  slug: string
  description: string | null
}

export type RegisterPayload = {
  company_name: string
  name: string
  email: string
  password: string
}

export type LoginPayload = {
  email: string
  password: string
}

export type RegisterResponse = {
  user: User
  company: Company
  token: string
}

export type LoginResponse = {
  user: User
  companies: CompanySummary[]
  token: string
}

export type MeResponse = {
  user: User
  company: Company | null
  roles: string[]
  permissions: string[]
}

export type MyCompaniesResponse = {
  companies: CompanySummary[]
}

export type CurrentCompanyResponse = {
  company: Company | null
  modules: Module[]
}

/* ---------- Back-office de MTS ---------- */

export type Plan = {
  id: string
  name: string
  slug: string
  price: string
  billing_period: string
  is_active: boolean
  modules: Module[]
}

/** Fila del listado de empresas del back-office (funcion admin_list_companies) */
export type AdminCompanyRow = {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
  plan_name: string | null
  plan_slug: string | null
  subscription_status: string | null
  modules_count: number
  users_count: number
}

export type AdminSubscription = {
  id: string
  status: string
  starts_at: string
  ends_at: string | null
  plan_id: string
  plan_name: string
  plan_slug: string
  price: string
}

export type AdminCompanyModule = Pick<Module, 'id' | 'name' | 'slug'> & {
  is_active: boolean
}

export type AdminCompanyUser = {
  id: string
  name: string
  email: string
  is_active: boolean
  is_owner: boolean
}

export type AdminCompanyDetail = {
  company: Company
  /** Cartera: lo que de verdad importa hoy */
  services: ClientService[]
  opportunities: Opportunity[]
  notes: ClientNote[]
  /** MTS Platform: solo para los clientes que contraten acceso al panel */
  subscription: AdminSubscription | null
  modules: AdminCompanyModule[]
  users: AdminCompanyUser[]
}

/* ---------- Catálogo y cotizaciones (panel del cliente) ---------- */

/**
 * Un producto es una CATEGORÍA vendible (taza de color, taza mágica, polo),
 * no un diseño concreto. Los diseños son sus imágenes.
 */
export type CatalogProduct = {
  id: string
  sku: string
  slug: string
  name: string
  description: string | null
  /** Precio unitario de referencia. Lo usa el cotizador. */
  price: string
  is_active: boolean
  /** Galería de diseños de ejemplo */
  designs: ProductDesign[]
  meta_title: string | null
  meta_description: string | null
}

export type ProductDesign = {
  id: string
  /** URL de la imagen */
  url: string
  /** Texto alternativo: accesibilidad y SEO */
  alt: string
  /** Nombre con el que el cliente lo reconoce: "La mejor doctora" */
  label: string
}

export type QuoteStatus = 'nueva' | 'cotizada' | 'enviada' | 'vista' | 'ganada' | 'perdida'

export type QuoteItem = {
  id: string
  product_id: string
  sku: string
  product_name: string
  /** Nula al llegar de la web: la pone el asesor */
  quantity: number | null
  /** Congelado al crear la cotización, para que no cambie si sube el precio */
  unit_price: string
  /** Qué diseño le interesó, del botón "ME INTERESA ESTE" */
  design: ProductDesign | null
}

export type Quote = {
  id: string
  /** Código corto para dictar por teléfono. No da acceso a nada. */
  reference: string
  status: QuoteStatus
  /** De qué página del sitio llegó */
  source: string | null
  created_at: string
  /** Cuándo abrió el cliente el enlace público */
  viewed_at: string | null
  contact_name: string | null
  contact_phone: string | null
  items: QuoteItem[]
  /** Enlace público de solo lectura */
  public_url: string | null
}

/* ---------- Cartera de clientes de Macedo Tech ---------- */

export type BillingPeriod = 'monthly' | 'yearly' | 'one_time'
export type ClientServiceStatus = 'activo' | 'pausado' | 'terminado'
export type OpportunityStatus = 'idea' | 'propuesta' | 'ganada' | 'perdida'

/** Catálogo de lo que vende Macedo Tech */
export type Service = {
  id: string
  name: string
  slug: string
  description: string | null
  default_price: string
  default_billing_period: BillingPeriod
  is_active: boolean
}

/** Lo que un cliente concreto tiene contratado */
export type ClientService = {
  id: string
  service_id: string
  service_name: string
  service_slug: string
  price: string
  billing_period: BillingPeriod
  status: ClientServiceStatus
  started_on: string | null
  /** null en los de pago único: no vencen nunca */
  next_renewal_on: string | null
  notes: string | null
}

export type Opportunity = {
  id: string
  company_id: string
  title: string
  description: string | null
  estimated_value: string | null
  status: OpportunityStatus
  created_at: string
}

export type ClientNote = {
  id: string
  body: string
  created_at: string
  author_name: string | null
}

export type Renewal = {
  id: string
  next_renewal_on: string
  price: string
  billing_period: BillingPeriod
  service_name: string
  company_id: string
  company_name: string
}

export type AdminStats = {
  ingreso_recurrente_mensual: number
  clientes_activos: number
  vencimientos: Renewal[]
  vencidos: number
  oportunidades_abiertas: number
  oportunidades_valor: number
}

/**
 * Solo company_name es obligatorio: la mayoría de clientes no usan MTS
 * Platform, así que ni tienen plan ni entran a ningún panel.
 */
export type CreateCompanyPayload = {
  company_name: string
  plan_id?: string | null
  owner_name?: string | null
  owner_email?: string | null
  owner_password?: string | null
}
