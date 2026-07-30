export function FullScreenLoader({ message = 'Cargando...' }: { message?: string }) {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-3">
      <span
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-3 border-primary border-t-transparent"
      />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  )
}
