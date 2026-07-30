import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'error'

export type ToastContextValue = {
  notifySuccess: (message: string) => void
  notifyError: (message: string) => void
}

/**
 * El contexto vive aparte del componente para no mezclar exportaciones de
 * componentes y de hooks en el mismo archivo: eso rompe el fast refresh de Vite.
 */
export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast debe usarse dentro de ToastProvider')
  return context
}
