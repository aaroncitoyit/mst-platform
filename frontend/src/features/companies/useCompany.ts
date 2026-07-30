import { useQuery } from '@tanstack/react-query'
import { useSessionStore } from '@/stores/sessionStore'
import { getCurrentCompany } from './api'

/**
 * Empresa activa y sus modulos contratados.
 *
 * activeCompanyId forma parte de la queryKey a proposito: aunque al cambiar de
 * empresa se hace queryClient.clear(), incluir el id es la defensa en
 * profundidad que garantiza que nunca se sirva cache del tenant anterior.
 */
export function useCompany() {
  const activeCompanyId = useSessionStore((s) => s.activeCompanyId)

  return useQuery({
    queryKey: ['company', activeCompanyId],
    queryFn: () => getCurrentCompany(activeCompanyId ?? undefined),
    enabled: !!activeCompanyId,
  })
}
