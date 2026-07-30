import type { ReactNode } from 'react'

type Tone = 'neutral' | 'primary' | 'success' | 'danger'

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-emerald-100 text-emerald-800',
  danger: 'bg-red-100 text-red-700',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}
