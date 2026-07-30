import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { useToast } from '@/components/ui/toastContext'
import { Badge } from '@/components/ui/Badge'
import { AuthLayout } from './AuthLayout'

/**
 * Solo aparece cuando el usuario pertenece a varias empresas y todavia no ha
 * elegido una. La lista llega de /api/my-companies durante el arranque de
 * sesion (SessionBootstrap) o de la respuesta del login.
 */
export function SelectCompanyPage() {
  const { companies, activeCompanyId, switchCompany } = useAuth()
  const { notifyError } = useToast()
  const [pendingId, setPendingId] = useState<string | null>(null)

  // Con empresa ya elegida no hay nada que hacer aqui
  if (activeCompanyId) return <Navigate to="/dashboard" replace />

  async function onSelect(companyId: string) {
    setPendingId(companyId)
    try {
      await switchCompany(companyId)
    } catch {
      notifyError('No se pudo seleccionar la empresa')
      setPendingId(null)
    }
  }

  return (
    <AuthLayout title="Elige una empresa" subtitle="Perteneces a más de una empresa.">
      {companies.length === 0 ? (
        <p className="text-sm text-slate-500">
          Tu usuario no pertenece a ninguna empresa. Contacta con el administrador.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {companies.map((company) => (
            <li key={company.id}>
              <button
                type="button"
                onClick={() => onSelect(company.id)}
                disabled={pendingId !== null}
                className="flex w-full items-center gap-3 rounded-md border border-slate-200 px-4 py-3 text-left transition hover:border-primary hover:bg-primary-soft disabled:opacity-60"
              >
                <Building2 className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {company.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{company.slug}</span>
                </span>
                {company.is_owner && <Badge tone="primary">Dueño</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </AuthLayout>
  )
}
