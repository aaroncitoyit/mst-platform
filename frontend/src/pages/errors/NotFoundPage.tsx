import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-4xl font-semibold text-primary">404</p>
      <h1 className="text-lg font-semibold text-slate-900">Página no encontrada</h1>
      <p className="max-w-md text-sm text-slate-500">
        La dirección no existe, o corresponde a un módulo que tu empresa no tiene contratado.
      </p>
      <Link to="/dashboard" className="mt-2 text-sm font-semibold text-primary hover:underline">
        Volver al inicio
      </Link>
    </div>
  )
}
