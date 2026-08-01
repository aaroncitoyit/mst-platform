import { Navigate, Route, Routes } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'
import { useCompany } from '@/features/companies/useCompany'
import { MODULE_MENU_MAP } from '@/components/layout/moduleMenu'
import { RequireAuth } from '@/components/guards/RequireAuth'
import { RequireCompany } from '@/components/guards/RequireCompany'
import { RequirePlatformAdmin } from '@/components/guards/RequirePlatformAdmin'
import { AppShell } from '@/components/layout/AppShell'
import { AdminShell } from '@/components/layout/AdminShell'
import { FullScreenLoader } from '@/components/ui/FullScreenLoader'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { SelectCompanyPage } from '@/pages/auth/SelectCompanyPage'
import { DashboardHomePage } from '@/pages/dashboard/DashboardHomePage'
import { ProfilePage } from '@/pages/settings/ProfilePage'
import { ModulePlaceholderPage } from '@/pages/modules/ModulePlaceholderPage'
import { ProductsPage } from '@/pages/catalog/ProductsPage'
import { QuotesInboxPage } from '@/pages/quotes/QuotesInboxPage'
import { QuoteDetailPage } from '@/pages/quotes/QuoteDetailPage'
import { MonthlyReportPage } from '@/pages/reports/MonthlyReportPage'
import { PublicQuotePage } from '@/pages/public/PublicQuotePage'
import { AdminHomePage } from '@/pages/admin/AdminHomePage'
import { CompaniesListPage } from '@/pages/admin/CompaniesListPage'
import { CreateCompanyPage } from '@/pages/admin/CreateCompanyPage'
import { CompanyDetailPage } from '@/pages/admin/CompanyDetailPage'
import { PlansPage } from '@/pages/admin/PlansPage'
import { ForbiddenPage } from '@/pages/errors/ForbiddenPage'
import { NotFoundPage } from '@/pages/errors/NotFoundPage'

export function AppRouter() {
  const activeCompanyId = useSessionStore((s) => s.activeCompanyId)
  const isPlatformAdmin = useSessionStore((s) => s.isPlatformAdmin)
  const { data, isPending } = useCompany()

  // Con empresa activa hay que esperar a saber que modulos tiene contratados
  // antes de montar las rutas: si no, entrar directo a /crm mostraria un 404
  // momentaneo antes de que la ruta exista.
  if (activeCompanyId && isPending) {
    return <FullScreenLoader />
  }

  // Pantallas reales por modulo. Las que no estan aqui todavia caen en el
  // marcador de posicion.
  const MODULE_ROUTES: Record<string, React.ReactNode> = {
    cms: (
      <Route key="cms" path="/productos/*" element={<ProductsPage />} />
    ),
    crm: (
      // El reporte se alimenta de las cotizaciones, asi que viaja con el mismo
      // modulo: sin cotizaciones no habria nada que reportar.
      <Route key="crm">
        <Route path="/cotizaciones" element={<QuotesInboxPage />} />
        <Route path="/cotizaciones/:id" element={<QuoteDetailPage />} />
        <Route path="/reporte" element={<MonthlyReportPage />} />
      </Route>
    ),
  }

  // Las rutas de modulo solo existen si la empresa tiene el modulo contratado.
  // Un modulo no contratado cae en el catch-all y da 404, no 403: asi no se
  // filtra que ese modulo exista.
  const moduleRoutes = (data?.modules ?? [])
    .map((module) => ({ slug: module.slug, entry: MODULE_MENU_MAP[module.slug] }))
    .filter((item) => item.entry)
    .map(({ slug, entry }) =>
      MODULE_ROUTES[slug] ?? (
        <Route
          key={slug}
          path={`${entry.path}/*`}
          element={<ModulePlaceholderPage label={entry.label} />}
        />
      ),
    )

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      {/* Cotización pública: la abre el cliente final desde el enlace del
          WhatsApp. Sin login a propósito: el token del enlace es la credencial. */}
      <Route path="/c/:token" element={<PublicQuotePage />} />

      <Route element={<RequireAuth />}>
        {/* La raiz lleva a cada uno a su sitio: el personal de MTS al
            back-office, el cliente a su panel. */}
        <Route
          path="/"
          element={<Navigate to={isPlatformAdmin ? '/admin' : '/dashboard'} replace />}
        />

        {/* Back-office de MTS */}
        <Route element={<RequirePlatformAdmin />}>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<AdminHomePage />} />
            <Route path="companies" element={<CompaniesListPage />} />
            <Route path="companies/new" element={<CreateCompanyPage />} />
            <Route path="companies/:id" element={<CompanyDetailPage />} />
            <Route path="plans" element={<PlansPage />} />
          </Route>
        </Route>

        {/* Panel del cliente */}
        <Route path="/select-company" element={<SelectCompanyPage />} />

        <Route element={<RequireCompany />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardHomePage />} />
            <Route path="/settings/profile" element={<ProfilePage />} />
            {/* Sin /settings/company: los datos de la empresa, su plan y sus
                modulos son la vista administrativa de Macedo Tech y viven en el
                back-office, no en el panel del cliente. */}
            {moduleRoutes}
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
