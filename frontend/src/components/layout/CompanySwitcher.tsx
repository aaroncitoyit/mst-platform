import { useEffect, useRef, useState } from 'react'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { useToast } from '@/components/ui/toastContext'

/**
 * Cambia la empresa activa sin cerrar sesion.
 *
 * No hay endpoint para esto: el cambio es local (nuevo X-Company-Id) y lo unico
 * que hace falta es limpiar la cache de React Query y recargar /api/me con la
 * nueva empresa. De eso se encarga useAuth().switchCompany.
 */
export function CompanySwitcher() {
  const { companies, activeCompany, switchCompany } = useAuth()
  const { notifyError } = useToast()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Con una sola empresa no hay nada que elegir
  if (companies.length <= 1) {
    return (
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Building2 className="size-4 text-slate-400" aria-hidden="true" />
        {activeCompany?.name ?? '—'}
      </span>
    )
  }

  async function onSelect(companyId: string) {
    setOpen(false)
    setPending(true)
    try {
      await switchCompany(companyId)
    } catch {
      notifyError('No se pudo cambiar de empresa')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
      >
        <Building2 className="size-4 text-slate-400" aria-hidden="true" />
        {activeCompany?.name ?? 'Seleccionar empresa'}
        <ChevronDown className="size-4 text-slate-400" aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {companies.map((company) => (
            <li key={company.id}>
              <button
                type="button"
                role="option"
                aria-selected={company.id === activeCompany?.id}
                onClick={() => onSelect(company.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="truncate">{company.name}</span>
                {company.id === activeCompany?.id && (
                  <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
