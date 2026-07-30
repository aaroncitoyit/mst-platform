import type { ReactNode } from 'react'

type AuthLayoutProps = {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-lg font-semibold text-primary">MTS Platform</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 mb-5 text-sm text-slate-500">{subtitle}</p>}
          <div className={subtitle ? '' : 'mt-5'}>{children}</div>
        </div>

        {footer && <p className="mt-4 text-center text-sm text-slate-500">{footer}</p>}
      </div>
    </div>
  )
}
