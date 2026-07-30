import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { queryClient } from '@/lib/queryClient'
import { ToastProvider } from '@/components/ui/Toast'
import { SessionBootstrap } from '@/features/auth/SessionBootstrap'

/**
 * El orden importa:
 * - BrowserRouter va por fuera porque useAuth navega con el router.
 * - SessionBootstrap va por dentro de QueryClientProvider y ToastProvider, y
 *   por encima del router de rutas, para que nada se renderice hasta que la
 *   sesion este resuelta.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <SessionBootstrap>{children}</SessionBootstrap>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
