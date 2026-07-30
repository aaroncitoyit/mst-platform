import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { httpClient } from './httpClient'
import { useSessionStore } from '@/stores/sessionStore'

const TOKEN = 'token-de-prueba'
const COMPANY_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-2222-2222-222222222222'

const originalAdapter = httpClient.defaults.adapter

/** Ultima config que llego al adaptador, para inspeccionar las cabeceras. */
let sentConfig: InternalAxiosRequestConfig | null = null

/** Adaptador falso: no hay red, solo se captura la peticion y se decide el status. */
function fakeAdapter(status: number) {
  return async (config: InternalAxiosRequestConfig) => {
    sentConfig = config

    if (status >= 400) {
      throw new AxiosError('fallo simulado', 'ERR_BAD_REQUEST', config, null, {
        status,
        statusText: '',
        data: { message: 'fallo simulado' },
        headers: new AxiosHeaders(),
        config,
      })
    }

    return {
      data: {},
      status,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      config,
    }
  }
}

beforeEach(() => {
  sentConfig = null
  useSessionStore.setState({
    token: TOKEN,
    activeCompanyId: COMPANY_ID,
    user: null,
    companies: [],
    roles: [],
    permissions: [],
  })
})

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter
})

describe('httpClient - interceptor de peticion', () => {
  it('inyecta Authorization y X-Company-Id desde el store', async () => {
    httpClient.defaults.adapter = fakeAdapter(200)

    await httpClient.get('/me')

    expect(sentConfig?.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`)
    expect(sentConfig?.headers.get('X-Company-Id')).toBe(COMPANY_ID)
  })

  it('no pisa un X-Company-Id fijado a mano en la llamada', async () => {
    // Es lo que hace SessionBootstrap: pedir /me para una empresa concreta
    // sin depender de lo que haya en el store en ese instante.
    httpClient.defaults.adapter = fakeAdapter(200)

    await httpClient.get('/me', { headers: { 'X-Company-Id': OTHER_COMPANY_ID } })

    expect(sentConfig?.headers.get('X-Company-Id')).toBe(OTHER_COMPANY_ID)
  })

  it('no envia cabeceras de sesion cuando no hay sesion', async () => {
    useSessionStore.setState({ token: null, activeCompanyId: null })
    httpClient.defaults.adapter = fakeAdapter(200)

    await httpClient.post('/login', {})

    expect(sentConfig?.headers.get('Authorization')).toBeFalsy()
    expect(sentConfig?.headers.get('X-Company-Id')).toBeFalsy()
  })
})

describe('httpClient - interceptor de respuesta', () => {
  it('limpia la sesion ante un 401', async () => {
    httpClient.defaults.adapter = fakeAdapter(401)

    await expect(httpClient.get('/me')).rejects.toThrow()

    // Sin token, el guard RequireAuth es quien redirige a /login
    expect(useSessionStore.getState().token).toBeNull()
    expect(useSessionStore.getState().activeCompanyId).toBeNull()
  })

  it('propaga el 403 sin tocar la sesion', async () => {
    // Un 403 no debe cerrar sesion ni redirigir: se propaga para que React
    // Query lo maneje y se muestre un Toast.
    httpClient.defaults.adapter = fakeAdapter(403)

    await expect(httpClient.get('/company')).rejects.toMatchObject({
      response: { status: 403 },
    })

    expect(useSessionStore.getState().token).toBe(TOKEN)
    expect(useSessionStore.getState().activeCompanyId).toBe(COMPANY_ID)
  })

  it('propaga un 500 sin tocar la sesion', async () => {
    httpClient.defaults.adapter = fakeAdapter(500)

    await expect(httpClient.get('/company')).rejects.toThrow()

    expect(useSessionStore.getState().token).toBe(TOKEN)
  })
})
