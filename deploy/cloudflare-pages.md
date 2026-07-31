# Panel de MTS en Cloudflare Pages

El panel de React (`/admin` y `/dashboard`) es un sitio estático: no necesita
servidor. Va a Cloudflare Pages porque ya estás en Cloudflare por R2 y por el
DNS de `sublimartes21.com`, así que es una cuenta menos que mantener.

## Configuración

Cloudflare → Workers & Pages → Create → Pages → Connect to Git → este repositorio.

| Ajuste | Valor |
|---|---|
| Framework preset | Vite |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Root directory | `frontend` |

Variables de entorno (Settings → Environment variables):

| Variable | Valor |
|---|---|
| `VITE_API_URL` | `https://<tu-servicio>.run.app/api` |
| `VITE_APP_NAME` | `MTS Platform` |

> **En Vite, las variables `VITE_*` se incrustan EN EL BUILD, no se leen al
> ejecutar.** Cambiar `VITE_API_URL` no surte efecto hasta que se reconstruye el
> sitio; no basta con reiniciarlo. Si el panel sigue llamando a la URL antigua
> después de cambiarla, es esto.

## Las dos cosas que fallan si se olvidan

**1. El `/api` del final de `VITE_API_URL`.** `httpClient.ts` usa esa variable
como `baseURL` tal cual y las rutas se piden como `/login`, no `/api/login`. Sin
el sufijo, todas las llamadas dan 404 y el síntoma parece un problema de CORS.

**2. El dominio de Pages tiene que estar en `CORS_ORIGENES` de la API.** Si no,
el navegador bloquea cada petición y la consola habla de CORS sin decir que el
origen simplemente no está en la lista. Se añade redesplegando la API:

```powershell
.\deploy\cloud-run\desplegar.ps1 -Proyecto mi-proyecto-gcp `
  -Origenes "https://mts-panel.pages.dev,https://panel.macedotech.com"
```

Dominios **exactos** y separados por comas, con `https://` y sin barra final.
Cada rama de vista previa de Pages tiene su propio subdominio, así que las
vistas previas no podrán llamar a la API salvo que añadas también su origen —
lo cual es correcto: no interesa que una rama cualquiera hable con producción.

## Enrutado

[`frontend/public/_redirects`](../frontend/public/_redirects) hace que cualquier
ruta sirva `index.html` con código 200. Sin él, recargar la página estando en
`/admin/empresas` da un 404 del CDN.

## Lo que NO va aquí

La web pública de SublimArte. Esa es otra cosa (Vercel hoy, Next.js más
adelante) y consume la API pública de catálogo con `X-MTS-Key`. Este sitio es
solo el panel.
