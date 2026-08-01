# Estado del proyecto y siguientes pasos

> Punto de retomada. Actualizado el 31/07/2026.
> Lee también [CLAUDE.md](../CLAUDE.md) (arquitectura y convenciones),
> [deploy/README.md](../deploy/README.md) (cómo se despliega, y en qué orden) y
> [plan-implantacion.md](plan-implantacion.md) (el plan de la primera venta).

---

## Dónde estamos

> **Producción EN VIVO desde el 31/07/2026**: API en
> `https://mts-api-5jur4znd5a-ul.a.run.app` (Cloud Run) y panel en
> `https://mst-panel.pages.dev` (Cloudflare Pages), ambos conectados a Neon y a R2.
> La base de producción está **vacía de datos de clientes** (0 empresas, 0 productos) a propósito:
> se cargan desde el back-office cuando toque (paso 6).

### Funciona y está verificado

- **Core multi-tenant** con RLS en 12 tablas. `mts_app` es `NOSUPERUSER NOBYPASSRLS` y hay tests que
  comprueban que un cliente no ve datos de otro.
- **Back-office (`/admin`)**: alta de clientes (solo el nombre), planes y módulos, suspensión real,
  entrar como cliente con registro en `audit_logs`.
- **Cartera**: servicios contratados, vencimientos, ingreso recurrente mensual, oportunidades, notas.
- **Catálogo real de SublimArte**: 14 productos con precios y 51 imágenes, importados de su web.
- **API pública** con claves por empresa (`X-MTS-Key`), probada contra fuga entre inquilinos.
- **Seguridad**: login limitado a 4 intentos/min, tokens con caducidad (12 h personal MTS / 7 días
  clientes), cabeceras de seguridad, CORS por `.env`, política de contraseñas en dos niveles.
- **Respaldos** con restauración probada de verdad (`database/backup.sh`).
- **48 tests de backend**, 20 de frontend.

### Es maqueta, NO son datos reales

- **Cotizaciones** y **Reporte mensual** en el panel del cliente usan datos de prueba
  (`frontend/src/features/quotes/mock.ts`). Marisol Quispe y el Colegio San Martín no existen.
- **Antes de enseñar el panel a un cliente**, o se ocultan esas pantallas o se avisa de que son un
  ejemplo. Que vea cifras de ventas inventadas sobre su negocio es la peor primera impresión posible.
- Ocultarlas son **3 líneas**: las rutas `/cotizaciones`, `/cotizaciones/:id` y `/reporte` en
  [`frontend/src/app/router.tsx`](../frontend/src/app/router.tsx) (y sus dos `import`). Toda la
  maqueta está encerrada en `features/quotes/api.ts`, así que al construir el backend de verdad
  **solo cambia ese archivo**.

### No existe todavía

- Tablas `quote_requests` / `quote_request_items` (el cotizador de verdad).
- Endpoint público para **recibir** cotizaciones (solo existe el de leer el catálogo).
- Middleware `EnsureModuleActive` (validar módulo contratado en el backend).
- Migración de la web de Rosa a Next.js.
- Auditoría de accesos (logins, intentos fallidos, suspensiones).

---

## Infraestructura

| Pieza | Estado |
|---|---|
| **Base de datos** | Neon, proyecto `mts-platform`, región AWS US East 2 |
| **Almacenamiento** | Cloudflare R2 — ✅ **funcionando y verificado de extremo a extremo** |
| **Aplicación** | Google Cloud Run — ✅ **desplegada** el 31/07/2026 en `https://mts-api-5jur4znd5a-ul.a.run.app` |
| **Panel de MTS** | Cloudflare Pages — ✅ **desplegado** el 31/07/2026 en `https://mst-panel.pages.dev` |
| **Respaldos** | Cloud Run Job + Cloud Scheduler — script listo, **sin programar** |
| **Web del cliente** | **Netlify**, React + Vite, sin migrar |

> **Ojo:** [plan-implantacion.md](plan-implantacion.md) está escrito entero suponiendo **Vercel**.
> La web de SublimArte está hoy en **Netlify** (comprobado el 30/07/2026: `Server: Netlify` y los
> nameservers en NS1). El razonamiento del plan no cambia — Netlify tampoco ejecuta PHP y también
> tiene funciones serverless para `/api/cotizar` — pero hay que decidir si la migración a Next.js
> se queda en Netlify o se mueve a Vercel, y corregir ese documento.

Render se descartó: `render.yaml` ya no está. Todo el despliegue vive en
[deploy/](../deploy/README.md).

**Neon**: usuario `neondb_owner`, base `neondb`, rama `production`. Host
`ep-restless-waterfall-axw8i43e.c-4.us-east-2.aws.neon.tech` — **verificado
conectando** el 30/07/2026. (Este documento decía antes `cascada`; era un error
de transcripción.)

> El DNS de Neon es comodín: **cualquier** nombre bajo ese dominio resuelve. Un
> host equivocado no da "host desconocido", da un error de **autenticación**, que
> manda a buscar el problema en la contraseña. Para comprobar un host hay que
> conectar de verdad.

**Usar la conexión directa, NO la que lleva `-pooler`** (ver más abajo).

---

## Siguientes pasos, en orden

### 1. Cloudflare R2 — antes de desplegar

El orden importa: si se despliega primero y se importa el catálogo, las imágenes van al disco
efímero de Cloud Run y **se pierden en el primer redespliegue**. Configurando R2 antes, la
importación se hace una sola vez.

- Crear bucket (`mts-platform-media`) y hacerlo **público**.

  > **El bucket tiene que ser PÚBLICO.** Si se hace privado, Laravel tendría que servir las imágenes
  > con `temporaryUrl()`, que genera una firma y una caducidad **distintas en cada llamada**: el
  > navegador las ve como URLs nuevas y **no puede cachear ninguna**. Cada visita a la web sería una
  > lectura más en R2, y ahí es donde se agotan los 10M gratuitos. Son fotos de catálogo pensadas
  > para verse en público: no hay nada que proteger.
  >
  > El código ya está preparado: `ProductController` y `PublicCatalogController` usan
  > `Storage::disk()->url()`, que da URLs estables. **No cambiarlo a `temporaryUrl()`.**

**Ya está hecho el lado del código** (30/07/2026):

- ✅ `composer require league/flysystem-aws-s3-v3`
- ✅ Disco `r2` en `config/filesystems.php`, e interruptor `MTS_MEDIA_DISK` (`public` en local,
  `r2` en producción). El disco de cada archivo se sigue guardando en `media.disk`, así que las
  filas antiguas no se rompen.
- ✅ `Cache-Control: public, max-age=31536000, immutable` puesto en `options` **del disco**, no en
  cada llamada: así no hay forma de olvidarlo al escribir código nuevo.
  > Consecuencia de `immutable`: para **cambiar** una foto hay que subirla con **otro nombre**.
  > Reusar el mismo deja a los visitantes viendo la antigua hasta un año.
- ✅ `ImportarCatalogo` ya no escribe en `public` fijo, y dice a qué disco escribe antes de empezar.
- ✅ Comando nuevo `mts:migrar-media`: copia entre discos, **verifica tamaño a tamaño** y solo
  entonces actualiza `media.disk`. No borra el origen, para poder volver atrás.
  > **Ojo: para arrancar producción NO hace falta migrar nada.** Las 51 imágenes están en tu base
  > **de desarrollo**; Neon está limpia. En producción el catálogo se importa de cero y, con
  > `MTS_MEDIA_DISK=r2`, las imágenes van directas a R2. El comando sirve aquí solo como prueba de
  > credenciales, con `--simular`.
- ✅ Decidido: **`pub-XXXX.r2.dev` por ahora**, no `img.sublimartes21.com`.
  > El DNS de `sublimartes21.com` está en **NS1, no en Cloudflare** (comprobado el 30/07/2026), y
  > R2 solo admite dominios personalizados de zonas de la propia cuenta. Conectarlo obligaría a
  > mover los nameservers de la web **en producción** de un cliente que paga: hay que inventariar
  > todos los registros, el correo incluido, y recrearlos antes. Tarea aparte.
  >
  > Cambiar a un dominio propio después es **editar `R2_URL` y nada más**: la dirección pública
  > nunca se guarda en `media.path`. `mts:comprobar-produccion` lo recuerda con un aviso mientras
  > se siga usando r2.dev.
  >
  > **Lo que cuesta usar `r2.dev`:** Cloudflare no le aplica caché de CDN ni Access, y lo limita en
  > velocidad. Es decir, **cada primera carga de cada visitante es una operación clase B contra R2**
  > (a ~15 imágenes por visita, los 10M mensuales dan para unas 660.000 visitas). Conectar un
  > dominio propio activa la caché y esas lecturas dejan de llegar a R2. Es una razón de **coste**,
  > no solo de SEO.

**Hecho en Cloudflare el 30/07/2026:**

- ✅ Bucket `mts-platform-media`, **Eastern North America (ENAM)**, storage class **Standard**.
- ✅ *Public Development URL* activada (el antiguo "r2.dev subdomain").
- ✅ Token de cuenta `mts-platform-backend`: **Object Read & Write**, acotado a ese bucket, sin
  caducidad y **sin filtro de IP** (Cloud Run no tiene IP de salida fija: un filtro daría 403
  intermitentes según qué instancia atendiera la petición).
- ✅ Los cuatro valores `R2_*` en `backend/.env.neon`, que no está en el repositorio.

**Verificado de extremo a extremo**, no solo configurado:

| Prueba | Resultado |
|---|---|
| Escritura en el bucket | OK |
| Lectura pública desde internet | HTTP 200 |
| Cabecera `Cache-Control` | `public, max-age=31536000, immutable` |
| Borrado | 404 después |

**R2 no tiene versionado de objetos. Punto.**

Se intentó y quedó demostrado el 30/07/2026, con un token *Admin Read & Write*:

```
HTTP 501 · NotImplemented · "PutBucketVersioning not implemented"
```

No está escondido en el panel: **no existe**. `GetBucketVersioning` sí responde (`Suspended`), pero
es un stub que devuelve el valor por defecto — no significa que se pueda activar.

> Varias versiones anteriores de este documento decían "activar el versionado" como si fuera un
> paso pendiente. **No lo es: es imposible.** No pierdas tiempo buscándolo.

### Entonces, ¿qué protege las fotos?

1. **El origen.** Vienen de archivos que siguen existiendo fuera de R2 (`D:/Web/SublimArte/public`
   y los originales del cliente). Si el bucket se vaciara, se reimportan con
   `mts:importar-catalogo`: 2,2 MB y un comando.
2. **Lo irreemplazable sí está respaldado.** La base de datos la vuelca `backup.sh` a diario y
   verificado. Una foto se vuelve a subir; un vencimiento perdido, no.
3. **`Bucket Lock Rules`**, si se quiere una red extra: es la inmutabilidad que R2 sí ofrece.
   ⚠️ **Acótala al prefijo `productos/`.** Si se bloquea el bucket entero, `backup.sh` no podrá
   rotar los volcados de más de 14 días y el bucket crecerá hasta salirse del plan gratuito.

**Lo que NO es protección:** que estén "en la nube". Un borrado por error en R2 es definitivo.

> `R2_ENDPOINT` (privado, `.r2.cloudflarestorage.com`) y `R2_URL` (público,
> `img.sublimartes21.com`) son cosas distintas. Poner el primero donde va el segundo deja el
> catálogo entero con las imágenes rotas, con un 401 que solo ve el navegador.
> `mts:comprobar-produccion` ahora lo detecta.

Comprobar antes de mover nada: `php artisan mts:migrar-media --env=neon --simular`

### 2. Instalar el esquema en Neon — ✅ YA HECHO

Comprobado el 30/07/2026 conectando a la base:

| Comprobación | Resultado |
|---|---|
| Tablas en `public` | 34 |
| Tablas con RLS | **12** ✅ |
| `mts_app` privilegiado | **no** ✅ |
| Migraciones de Laravel | 4 aplicadas |
| Usuarios | 1 (el admin de plataforma) |
| Empresas | 0 — limpia, sin basura de desarrollo |

**No vuelvas a lanzar `install.sh`.** Está hecho y la base está en el estado que se quería.

<details>
<summary>El comando, por si algún día hay que rehacerlo desde cero</summary>

```powershell
docker run --rm -v "${PWD}:/repo" `
  -e PGHOST=ep-restless-waterfall-axw8i43e.c-4.us-east-2.aws.neon.tech `
  -e PGPORT=5432 -e PGDATABASE=neondb `
  -e PGUSER=neondb_owner -e PGPASSWORD="..." `
  -e PGSSLMODE=require -e MTS_APP_PASSWORD="..." `
  postgres:16-alpine sh /repo/database/sql/install.sh
```

Sin `--con-demo`. Debe terminar diciendo **12 tablas con RLS** y **`mts_app` sin privilegios**.
Luego, desde `backend/`: `php artisan migrate --force` y `php artisan mts:crear-admin`.
</details>

### 3. Desplegar en Cloud Run — ✅ HECHO el 31/07/2026

Proyecto GCP `mts-platform-macedo`, región us-east5, servicio `mts-api`.
URL: `https://mts-api-5jur4znd5a-ul.a.run.app` (`/up` responde 200).

- `preparar.ps1` hecho: APIs, repositorio `mts` en Artifact Registry y los 4 secretos
  en Secret Manager. Aviso de gasto a 0,50/0,90/1,00 en la moneda de la cuenta (PEN).
- `desplegar.ps1` hecho: imagen `20260731-1301-283a4b3` construida en local y subida.
- `mts:comprobar-produccion --env=neon` → **todo lo crítico en verde** (1 aviso: r2.dev,
  deliberado hasta conectar dominio propio).
- Dos correcciones en el camino: el aviso de gasto se crea **sin moneda explícita**
  (la cuenta factura en PEN y `1USD` daba `INVALID_ARGUMENT`), y `ComprobarProduccion`
  mira `config('app.env')` y no `app()->environment()` (el `--env=neon` de consola
  sobreescribe el nombre de entorno y la comprobación fallaba en falso).
- `.env.neon` quedó con la `APP_URL` real.

Pendiente en esta pieza: nada crítico. Al redesplegar, basta:

```powershell
.\deploy\cloud-run\desplegar.ps1 -Proyecto mts-platform-macedo
```

`desplegar.ps1` se **niega a desplegar** si `DB_HOST` lleva `-pooler`, si `DB_USERNAME` no es
`mts_app` o si `MTS_MEDIA_DISK` no es `r2`.

Después de cada despliegue: `php artisan mts:comprobar-produccion --env=neon`.

### 4. El panel de React en Cloudflare Pages — ✅ HECHO el 31/07/2026

Proyecto **`mst-panel`** (así, con "st", no "mts") en `https://mst-panel.pages.dev`.
Conectado a Git (build automático en cada push a `main`): framework Vite, root `frontend`,
`npm ci && npm run build`, salida `dist`, `_redirects` ya versionado.

- `VITE_API_URL=https://mts-api-5jur4znd5a-ul.a.run.app/api` (**con el `/api`**) y
  `VITE_APP_NAME=MTS Platform`, puestos como variables de entorno del build en el panel.
- `CORS_ORIGENES` de la API actualizado a `https://mst-panel.pages.dev` y API redesplegada.
  Verificado: el preflight devuelve `Access-Control-Allow-Origin: https://mst-panel.pages.dev`.

> El `/api` al final de `VITE_API_URL` es lo que se olvida (todas las llamadas dan 404 sin él),
> y el dominio del panel tiene que estar en `CORS_ORIGENES` (si no, el navegador bloquea y la
> consola habla de CORS sin decir que el origen no está en la lista).

La web pública de SublimArte NO va aquí: es otra cosa (hoy Netlify, Next.js más adelante).

### 5. Programar los respaldos — ⏳ PENDIENTE

Con el proyecto ya creado, el comando queda:

```powershell
.\deploy\respaldo\programar.ps1 -Proyecto mts-platform-macedo -ClaveDueno "..."
```

Crea el Cloud Run Job, lo programa con Cloud Scheduler a las 03:00 de Lima **y lo ejecuta una vez
para comprobarlo** — un respaldo sin probar no es un respaldo.

> **La clave es la de `neondb_owner`, no la de `mts_app`.** `pg_dump` hace `SET row_security = off`,
> y con las 12 tablas en `FORCE ROW LEVEL SECURITY` PostgreSQL corta con *"query would be affected
> by row-level security policy"* si el rol no puede saltarse RLS. Con `mts_app` el respaldo no
> fallaría a medias: no existiría.

### 6. Volver a cargar los datos reales — ⏳ PENDIENTE

Verificado el 31/07/2026 en Neon: **0 empresas, 0 productos, 0 imágenes** (solo el admin de
plataforma). No copiar la base local: tiene basura de desarrollo. Registrar los clientes desde el
back-office e importar el catálogo:

```powershell
php artisan mts:importar-catalogo <slug-empresa> `
  "D:/Web/SublimArte/public/data/data.json" --assets="D:/Web/SublimArte/public" --env=neon
```

Con `MTS_MEDIA_DISK=r2` en `.env.neon`, las imágenes van directas a R2. El comando dice a qué
disco escribe antes de empezar; si dice `public`, párate.

### 7. Y después

- **Pendiente rápido**: ocultar la maqueta de cotizaciones/reporte antes de enseñar el panel a un
  cliente (3 líneas en `frontend/src/app/router.tsx`).
- Migrar la web a Next.js (decidir Netlify vs Vercel y corregir `plan-implantacion.md`).
- Construir el cotizador de verdad (`quote_requests`), el middleware `EnsureModuleActive` y la
  auditoría de accesos.
- Conectar un dominio propio al bucket de R2 (`R2_URL`) cuando se pueda mover el DNS de
  `sublimartes21.com`: activa la caché de CDN y quita el límite de `r2.dev`.

---

## Avisos que cuestan caro si se olvidan

**Cloud Run no tiene cron.** Los contenedores se levantan bajo demanda y se apagan: no hay proceso
persistente. Esto afectaba a dos cosas:

- **`backup.sh`** — ✅ resuelto. Ahora corre como Cloud Run Job disparado por Cloud Scheduler
  (`deploy/respaldo/`), y sube el volcado a R2 con `--remoto`.
- **El reporte mensual** — no es un problema de cron: **no existe**. Comprobado el 30/07/2026, no
  hay ni un `Schedule::` en el repositorio y `routes/console.php` es el de serie. El reporte que se
  ve en el panel es la maqueta de `frontend/src/features/quotes/mock.ts`. No hay nada que
  programar hasta que se construya, y cuando se construya nacerá ya sabiendo que necesita un
  Cloud Scheduler. **No lo pongas en la lista de despliegue: es trabajo de producto, no de
  infraestructura.**

**El pooler de Neon en modo transacción rompe el aislamiento.** El contexto de empresa se fija con
`set_config(..., false)`, que vive en la **sesión**. Con un pooler en modo transacción, varias
peticiones comparten conexión y ese valor puede filtrarse de una a otra: un cliente vería datos de
otro, de forma intermitente. **Usar la conexión directa.** `desplegar.ps1` ya corta el despliegue
si detecta `-pooler`.

**No actives el modo worker de FrankenPHP ni Laravel Octane.** Es la misma fuga que el pooler y por
el mismo motivo: el proceso vive entre peticiones, y la empresa de una se hereda en la siguiente.
Es tentador porque quita el arranque de Laravel en cada llamada. El `Dockerfile` lo avisa.

**Las conexiones a Neon están contadas.** Sin pooler, cada petición abre la suya:
`max-instances × concurrency` es el techo. Los valores de `desplegar.ps1` (3 × 20 = 60) están
puestos para no pasarse. Subirlos no da un error claro, da timeouts intermitentes.

**Con las imágenes en R2, `backup.sh` NO las respalda** y avisa de ello. Y **R2 no tiene versionado**
(501 `NotImplemented`), así que no hay red bajo ellas: un borrado en el bucket es definitivo.

No es grave, y conviene tener claro por qué: las fotos vienen de archivos que siguen existiendo
fuera de R2, y reimportarlas es un comando. **La base de datos es lo irreemplazable**, y esa sí se
respalda a diario y verificada. Si quieres red extra, `Bucket Lock Rules` acotado al prefijo
`productos/` — nunca al bucket entero, o rompes la rotación de respaldos.

**Un respaldo en el mismo proveedor que los datos no es un respaldo.** Por eso el Job vuelca a
Cloudflare R2 y no a GCS del mismo proyecto ni a la propia Neon.

**Un respaldo que nunca se ha restaurado es una suposición.** `programar.ps1` ejecuta el Job una vez
al montarlo, pero eso solo prueba que el archivo se crea y se sube. Restaura uno de verdad alguna vez.

**Neon exige contraseñas fuertes en los roles.** Si `MTS_APP_PASSWORD` es débil, `install.sh` falla
al final, después de haber creado todas las tablas.

**No vender "respaldos incluidos" hasta que existan en el servidor.** Hoy solo están probados en
local.

---

## Pendiente y no es técnico: los precios

**Precios puestos el 31/07/2026** para los 4 servicios que bloqueaban la primera venta (diseño,
dominio, hosting, mantenimiento). Siguen a 0,00 a propósito: el servicio *Acceso a MTS Platform*
(hasta que alguien contrate el panel) y los 3 planes (hoy no cobran nada; la decisión de ponerles
precio de etiqueta está tomada, ver más abajo).

### Solo hacen falta 4 números para vender

De las 8 filas sin precio, no todas pesan igual:

| Servicio (`services`) | Cobro | Qué es | ¿Bloquea? |
|---|---|---|---|
| Diseño y desarrollo web | pago único | El proyecto | **Sí** |
| Dominio | anual | Se repercute; hay coste real del registrador | **Sí** |
| Hosting | anual | Igual, coste real repercutido | **Sí** |
| Mantenimiento mensual | mensual | **El ingreso recurrente.** El corazón del negocio | **Sí** |
| Acceso a MTS Platform | mensual | El puente a la fase de producto | No, hasta que alguien contrate el panel |

Los cuatro primeros son lo que se le vende a un cliente de agencia normal, que es la mayoría de la
cartera: web + dominio + hosting + mantenimiento.

### `plans.price` no cobra nada, y conviene saberlo

Los 3 planes (`Starter` CMS · `Profesional` CMS+CRM · `Empresarial` CMS+CRM+ERP+AI) están a 0,00,
y **da igual por ahora**: `plans.price` no se suma ni se factura en ningún sitio. Solo se usa para
ordenar la lista (`orderBy('price')` en `PlatformController`) y como etiqueta de nivel.

**✅ Decidido el 31/07/2026: ponerles precio de etiqueta igualmente** — el panel mostraba
"Precio sin definir" (un aviso alarmante para enseñar a alguien), y aunque el precio no se cobre,
una etiqueta con número queda más profesional. **Faltan los 3 números** (Starter, Profesional,
Empresarial): hasta que se rellenen, la pantalla sigue con el aviso.

Eso además deshace un solapamiento que parece un problema y no lo es: el servicio *"Acceso a MTS
Platform"* (mensual) y el precio del plan (mensual) parecen cobrar dos veces lo mismo. **No lo
hacen.** Se cobra por el servicio; los planes son la etiqueta de qué incluye cada nivel.

### El precio del catálogo NO es vinculante

`services.default_price` es solo el valor que **se autorrellena** al contratar. El número real vive
en `client_services.price`, por cliente, y es ese el que alimenta el ingreso recurrente y los avisos
de vencimiento del panel.

Traducido: **equivocarse sale barato.** Si a un cliente se le cobra distinto, se cambia en su ficha.
No se está fijando una tarifa para siempre, se está evitando teclear lo mismo cada vez. No hay
motivo para bloquearse buscando el número perfecto.

> Buen punto de partida: **lo que ya le cobras hoy** al cliente de mantenimiento. Ese número existe
> aunque no esté escrito en ninguna parte.

### El SQL, listo para rellenar

Se editan por SQL porque no hay pantalla de gestión de precios (deuda conocida). **Ya aplicado en
Neon el 31/07/2026.** Por si hay que rehacerlo:

```sql
-- Los 4 que bloquean la primera venta (ya aplicados)
update services set default_price = 2500.00 where slug = 'diseno-web';            -- pago unico
update services set default_price = 80.00 where slug = 'dominio';                 -- anual
update services set default_price = 450.00 where slug = 'hosting';                -- anual
update services set default_price = 350.00 where slug = 'mantenimiento-mensual';  -- mensual

-- Cuando alguien contrate el panel
update services set default_price = 0.00 where slug = 'acceso-mts-platform';    -- mensual

-- Planes: pendiente rellenar los numeros (decision tomada el 31/07/2026,
-- son etiqueta, no se cobran). Hoy siguen a 0.00.
update plans set price = 0.00 where slug = 'starter';
update plans set price = 0.00 where slug = 'profesional';
update plans set price = 0.00 where slug = 'empresarial';

select name, default_price, default_billing_period from services order by name;
```

### Decisiones comerciales

**✅ Decidido el 30/07/2026: precio DESGLOSADO, no cuota única.**

Cada servicio se le presenta al cliente con su precio: dominio S/X al año, hosting S/Y al año,
mantenimiento S/Z al mes. Encaja con lo construido: **cada uno es una fila de `client_services` con
su propio `next_renewal_on`**, así que el dominio avisa antes de caducar aunque el mantenimiento
esté al día. Con una cuota única agrupada, esa alarma por servicio se pierde.

> Si algún día se pasa a "todo incluido", **hay que registrar el dominio igualmente a S/ 0,00**.
> El aviso de caducidad seguiría funcionando y el ingreso recurrente no se duplicaría. Un dominio
> que caduca sin avisar se pierde, y recuperarlo puede ser imposible.

**✅ Decidido el 31/07/2026: implantación en DOS PARTES — 50% de inicial y 50% al finalizar.**

El sistema no guarda registro de cobros (decisión explícita: si ya se cobró o no, lo lleva Aaron),
así que el 50/50 no se modela en ninguna tabla: es la forma de pago que se acuerda con el cliente y
se gestiona fuera de la herramienta.
