import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ToastContext, type ToastTone } from './toastContext'

type Toast = { id: number; tone: ToastTone; message: string }

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId++
    setToasts((current) => [...current, { id, tone, message }])
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 5000)
  }, [])

  const value = useMemo(
    () => ({
      notifySuccess: (message: string) => push('success', message),
      notifyError: (message: string) => push('error', message),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`rounded-md px-4 py-3 text-sm shadow-lg ${
              toast.tone === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
