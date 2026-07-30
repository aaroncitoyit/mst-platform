import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'

export function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <ShieldAlert className="size-10 text-primary" aria-hidden="true" />
      <p className="text-4xl font-semibold text-primary">403</p>
      <h1 className="text-lg font-semibold text-slate-900">No tienes acceso</h1>
      <p className="max-w-md text-sm text-slate-500">
        Tu rol en esta empresa no incluye el permiso necesario para ver esta página.
      </p>
      <Link to="/dashboard" className="mt-2 text-sm font-semibold text-primary hover:underline">
        Volver al inicio
      </Link>
    </div>
  )
}
