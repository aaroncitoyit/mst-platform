import axios from 'axios'
import { useSessionStore } from '@/stores/sessionStore'

/**
 * Cliente HTTP unico de la aplicacion.
 *
 * NUNCA uses fetch ni otra instancia de axios en un componente: este cliente es
 * lo que garantiza que Authorization y X-Company-Id viajen siempre, y que los
 * 401 se traten igual en toda la app.
 */
export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { Accept: 'application/json' },
})

httpClient.interceptors.request.use((config) => {
  const { token, activeCompanyId } = useSessionStore.getState()

  // Se usa la API de AxiosHeaders (set/get) en vez de acceso por corchetes:
  // get() compara sin distinguir mayusculas, asi que no se duplica ni se pisa
  // una cabecera fijada con otra combinacion de mayusculas.
  if (token) config.headers.set('Authorization', `Bearer ${token}`)

  // Solo se envia si no viene ya fijada a mano. El arranque de sesion necesita
  // poder pedir /api/me para una empresa concreta antes de que el store se
  // asiente (ver features/auth/api.ts).
  if (activeCompanyId && !config.headers.get('X-Company-Id')) {
    config.headers.set('X-Company-Id', activeCompanyId)
  }

  return config
})

httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status

    // 401: el token ya no vale. Se limpia la sesion y el guard RequireAuth se
    // encarga de redirigir con el router. No se usa window.location.href para
    // no tirar abajo la SPA (y para que el interceptor sea testeable).
    if (status === 401) {
      useSessionStore.getState().clearSession()
    }

    // 403 NO redirige: se propaga para que React Query lo maneje y se muestre
    // un Toast. Un redirect duro sacaria al usuario de la pagina por culpa de
    // una query de fondo. La pantalla /403 se usa desde RequirePermission.
    return Promise.reject(error)
  },
)
