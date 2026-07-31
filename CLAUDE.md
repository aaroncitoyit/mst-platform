# CLAUDE.md

Guía para trabajar en este repositorio. Léela antes de tocar código.

> **EMPIEZA POR AQUÍ:** [docs/estado-y-siguientes-pasos.md](docs/estado-y-siguientes-pasos.md) —
> qué funciona, qué es maqueta, qué falta, y los avisos que cuestan caro si se olvidan
> (Cloud Run no tiene cron, el pooler de Neon rompe el aislamiento, etc.).
>
> Para desplegar: [deploy/README.md](deploy/README.md) — el orden importa (R2 antes que
> Cloud Run) y ahí está explicado por qué.
>
> El plan de la primera venta, con las decisiones y sus motivos, está en
> [docs/plan-implantacion.md](docs/plan-implantacion.md).

## Qué es MTS Platform

Plataforma empresarial modular de Macedo Tech Solutions: un **Core** más módulos
(CMS, CRM, ERP, IA). Los módulos dependen del Core; **el Core nunca depende de un módulo**.

Stack: PostgreSQL 16 · Redis 7 · Laravel 12 (PHP 8.2, Sanctum, Spatie Permission) ·
React 18 + TypeScript + Vite · Docker Compose para la infraestructura local.

## Convenciones

- **Todo en español**: documentación, comentarios, nombres de roles y mensajes de la API.
  Los identificadores de código siguen las convenciones de cada framework (inglés en Laravel/React).
- Los archivos SQL y los comentarios del backend se escriben **sin tildes** (evita problemas de
  encoding al pasarlos por `psql` en Windows). La documentación `.md` sí lleva tildes.
- **Todas las PK son UUID** (`uuid_generate_v4()`), nunca enteros autoincrementales.
  Todo modelo Eloquent lleva `HasUuids` + `$incrementing = false` + `$keyType = 'string'`.
- Las marcas de tiempo son `TIMESTAMPTZ`, nunca `TIMESTAMP`.

## Lo más importante: el modelo multi-tenant

Una sola base PostgreSQL compartida. El aislamiento entre empresas se apoya en **dos capas**:

1. **Row Level Security (RLS) en PostgreSQL** — 11 tablas tienen `FORCE ROW LEVEL SECURITY` con la
   política `tenant_isolation` comparando `company_id = current_company_id()`: `subscriptions`,
   `company_modules`, `company_user`, `roles`, `model_has_roles`, `model_has_permissions`,
   `settings`, `media`, `audit_logs`, `notifications`, `products`.
2. El scope de aplicación en Laravel (Spatie Permission en modo *teams*).

`companies` y `users` **no** llevan RLS: son las tablas raíz. Un usuario puede pertenecer a varias
empresas, y su acceso se controla vía `company_user` en la capa de aplicación.

### `mts_user` vs `mts_app` — no confundirlos

`mts_user` (el `POSTGRES_USER` del `.env`) es **superusuario**, y los superusuarios de PostgreSQL
**ignoran RLS siempre**, sin importar las políticas. Por eso existe `mts_app`
(`NOSUPERUSER NOBYPASSRLS`), creado en `database/sql/006_app_role.sql`.

- **Laravel se conecta con `mts_app`** (ya configurado en `backend/.env`). Si alguien lo cambia a
  `mts_user`, el aislamiento multi-tenant deja de aplicarse en silencio.
- `mts_user` solo para tareas administrativas: aplicar los scripts SQL, pgAdmin.

### Back-office: cambiar de contexto, nunca saltarse RLS

El personal de MTS (`users.is_platform_admin`) gestiona las empresas desde `/api/admin/*`, protegido
por el middleware `platform.admin`. **No usa un rol de base de datos con `BYPASSRLS`**: se conecta
igual que todo el mundo con `mts_app` y *cambia el contexto* a la empresa sobre la que opera.

- `companies`, `users`, `plans`, `modules`: sin RLS, se consultan directamente.
- Cualquier operación sobre una empresa concreta: llamar antes a
  `CompanyProvisioner::setCompanyContext($id)`. **Si se olvida, las consultas a `subscriptions`,
  `company_modules` o `company_user` devuelven cero filas en silencio** — no dan error.
- Consultas agregadas entre empresas: `admin_list_companies()`, que es `SECURITY DEFINER`.
  **Es la única función del sistema que cruza empresas.** No comprueba quién la llama: la
  autorización vive entera en el middleware `platform.admin`. Antes de crear una segunda función así,
  piensa si de verdad la necesitas.

Un administrador de plataforma puede entrar al panel de cualquier cliente para dar soporte
conservando su propia identidad (así la auditoría registra quién actuó de verdad, y no parece que lo
hiciera el cliente). `Gate::before` le concede todos los permisos, y la entrada queda escrita en
`audit_logs`. En el frontend se muestra una banda de aviso permanente; el estado de impersonación se
persiste a propósito, para que un refresco de página no deje al administrador tocando datos de un
cliente sin el aviso.

### La cartera de Macedo Tech NO lleva RLS, y es a propósito

`services`, `client_services`, `opportunities` y `client_notes` (script `012`) tienen `company_id`
pero **no llevan `tenant_isolation`**. Rompen la regla general, y el motivo importa:

> En las tablas del Core, `company_id` significa *"de qué inquilino son estos datos"*.
> En estas, significa *"sobre qué cliente trata esta ficha"*. **El dueño de la fila es siempre
> Macedo Tech**, no el cliente: son los apuntes internos de Aaron sobre su cartera.

Si se les añadiera RLS "por coherencia", el panel dejaría de poder preguntar "todos los vencimientos
de este mes" y **devolvería cero filas en silencio**, sin ningún error. Su única protección es el
middleware `platform.admin`, igual que `admin_list_companies()`.

**El primer usuario de MTS Platform es Aaron, no sus clientes.** El back-office (`/admin`) es la
aplicación principal; el panel de cliente (`/dashboard`) es para la fase de producto, más adelante.

`products` **sí** lleva RLS, aunque esté cerca de las anteriores en el esquema: es el catálogo del
cliente, dato suyo. La diferencia está en de quién es la fila, no en qué tabla es.

## El slug de un producto se congela

`products.slug` es la dirección web del producto y **se genera una sola vez, al crearlo**
(`generar_slug_producto()`, script `013`). **Renombrar un producto NO cambia su slug**: si cambiara,
cada corrección de una errata devolvería un 404 y tiraría a la basura el posicionamiento que esa
página tuviera en Google.

Cambiar la dirección debe ser una acción explícita que además deje una redirección. Nunca un efecto
secundario de editar el nombre. Por eso `ProductController::update()` no acepta `slug`.

Ocultar o borrar un producto tampoco puede devolver 404: la URL redirige al catálogo y el producto
sale del sitemap.

`meta_title` y `meta_description` se generan solos del nombre: **el cliente no tiene por qué saber
qué es SEO** para publicar un producto.

### El header `X-Company-Id`

**Toda llamada autenticada debe enviar el header `X-Company-Id`.** El middleware
`EnsureCompanyContext` (alias `company.context`) valida que el usuario pertenezca a esa empresa y
solo entonces fija el contexto RLS de la sesión de PostgreSQL.

Excepción deliberada: `GET /api/my-companies` va solo con `auth:sanctum`, **fuera** de
`company.context`. Es lo que permite al frontend arrancar cuando aún no hay empresa activa (al
refrescar la página, o cuando el usuario pertenece a varias empresas y todavía no ha elegido).

### Cuidado al fijar el contexto: `SET` sí, `SET LOCAL` no

El contexto se fija con `set_config('app.current_company_id', ?, false)` — parametrizado, nunca
interpolando el UUID en el string SQL.

Algunos comentarios de los scripts SQL recomiendan `SET LOCAL`. **No lo apliques tal cual**: fuera de
una transacción explícita, `SET LOCAL` se descarta al terminar la sentencia y el contexto RLS se
perdería, rompiendo el aislamiento en vez de reforzarlo. Con PHP-FPM cada petición abre su propia
conexión, así que `SET` (el tercer parámetro `false` de `set_config`) es lo correcto hoy.

> **Deuda conocida:** si algún día se adopta Laravel Octane o un pool de conexiones persistentes,
> esto se convierte en una fuga de contexto entre peticiones (la empresa de una petición se filtra a
> la siguiente). Habría que envolver cada petición en una transacción y pasar a `SET LOCAL`.

## Altas: solo el nombre es obligatorio

El alta **no se hace por autoservicio**: `config/mts.php` tiene `self_registration` en `false` y
`POST /api/register` responde 403. Los clientes se dan de alta desde el back-office. La pantalla de
registro del frontend sigue existiendo por si algún día se reabre.

**Dar de alta un cliente requiere solo su nombre.** El plan de MTS Platform y el usuario que accede
al panel son **opcionales**: la mayoría de clientes de Macedo Tech solo tienen una web y un
mantenimiento, no usan la plataforma y no entran a ningún panel. Obligar a inventarse un correo y una
contraseña por cada cliente haría la herramienta molesta de usar, y una herramienta molesta no se usa.

Toda la secuencia de alta vive en **`App\Services\CompanyProvisioner`**, en un solo sitio a
propósito: el orden importa (hay que fijar el contexto RLS antes de tocar tablas protegidas) y
duplicarla es pedir un fallo de aislamiento. No repliques ese flujo en un controlador.

Los roles base se siembran **siempre**, aunque el cliente no acceda al panel: son cuatro filas y
evitan un caso especial el día que sí contrate acceso.

`plan_modules` relaciona planes con módulos. Al dar de alta o cambiar de plan se llama a
`sync_company_modules()`, que activa los módulos incluidos y **desactiva** (no borra, para conservar
el histórico) los que ya no lo estén.

## Suspender corta el acceso de verdad

`users.is_active` y `companies.is_active` se comprueban en cada petición, no solo en el login:
`EnsureActiveUser` para el usuario y `EnsureCompanyContext` para la empresa. Es lo que hace que
suspender a un cliente moroso surta efecto **aunque tenga la sesión abierta**, porque los tokens de
Sanctum ya emitidos siguen existiendo. El personal de MTS sí puede entrar a una empresa suspendida,
para diagnosticar.

> Cuidado con `User::create()`: `is_active` e `is_platform_admin` tienen valor por defecto en la
> base de datos, y un modelo recién creado los tendría en `null` si no estuvieran declarados en
> `$attributes` del modelo. Un `null` ahí se interpreta como usuario desactivado y devuelve 403.

## Roles y permisos: cada empresa clona los suyos

`database/sql/007_spatie_compatibility.sql` cambió el enfoque original y **conviene tenerlo presente
porque parte de la documentación del Sprint 1 todavía describe el modelo viejo**:

- ~~Catálogo global de roles con `roles.company_id = NULL`~~ → descartado. `company_id` es `NOT NULL`.
- Ahora **cada empresa recibe su propia copia** de los 4 roles base (`Administrador`, `Supervisor`,
  `Vendedor`, `Empleado`) al crearse, vía la función SQL `seed_default_roles(company_id)`.
- Esto encaja de forma nativa con el modo *teams* de Spatie (`team_foreign_key = company_id`,
  `'teams' => true` en `config/permission.php`).

Al crear una empresa hay que fijar el contexto **antes** de tocar cualquier tabla con RLS, y llamar a
`setPermissionsTeamId()` para que Spatie escriba el `company_id` correcto. Ver `AuthController::register()`.

## Funciones SQL reutilizables

Antes de escribir una consulta nueva, revisa si ya existe:

- `current_company_id()` — `docker/postgres/init/01-init.sql`. La usan todas las políticas RLS.
- `seed_default_roles(uuid)` — `007`. Clona los roles base para una empresa nueva.
- `get_user_companies(uuid)` — `008`. Lista las empresas de un usuario. Es `SECURITY DEFINER`, así
  que **funciona sin contexto de empresa**: por eso sirve para el login y para el arranque del front.
- `admin_list_companies()` — `010`. Listado del back-office. `SECURITY DEFINER`, la única que cruza
  empresas. Solo desde rutas con `platform.admin`.
- `sync_company_modules(uuid, uuid)` — `010`. Alinea los módulos de una empresa con los de su plan.

## Vencimientos: la columna que hace ganar dinero

`client_services.next_renewal_on` es lo que alimenta los avisos del panel. Los mantenimientos que se
olvidan de cobrar y los dominios que caducan sin avisar son pérdida directa, así que esa columna es
el corazón funcional de la herramienta.

- En los servicios de **pago único** queda a `NULL` y no vence nunca; el controlador la fuerza a
  `NULL` aunque llegue una fecha.
- "Marcar como renovado" avanza **un periodo**, no salta al futuro: si un mantenimiento llevaba tres
  meses sin cobrar, renovarlo una vez lo deja aún vencido — que es lo que refleja la realidad.
- Se usa `addMonthNoOverflow()`, no `addMonth()`: un vencimiento del 31 de enero debe caer el 28 de
  febrero, no el 3 de marzo.

**No hay registro de cobros.** El sistema dice qué vence y cuándo; si ya se cobró o no, lo lleva Aaron.
Fue una decisión explícita para no duplicar el modelo de datos.

## Producción: dónde vive cada cosa

| Pieza | Dónde | Por qué ahí |
|---|---|---|
| Base de datos | **Neon** (PostgreSQL, AWS us-east-2) | RLS y funciones SQL propias |
| API (Laravel) | **Google Cloud Run** (`us-east5`, Ohio) | Contenedor FrankenPHP, escala a cero |
| Fotos de producto | **Cloudflare R2** | El disco de Cloud Run es efímero |
| Panel (React) | **Cloudflare Pages** | Estático |
| Respaldos | **Cloud Run Job + Cloud Scheduler** → R2 | Cloud Run no tiene cron |

Los scripts y el orden de despliegue están en [deploy/README.md](deploy/README.md).
Render se descartó; ya no hay `render.yaml`.

### Todo tiene que caber en los planes gratuitos

**Restricción vigente hasta que las empresas clientes den ingresos.** Antes de proponer un servicio,
una instancia mínima o una retención más larga, mira contra qué límite gratuito juega.

Nada está hoy cerca de su límite: el catálogo entero ocupa 2,2 MB de los 10 GB de R2, y la imagen
del contenedor son 78 MB comprimidos contra 0,5 GB de Artifact Registry.

> **Al medir una imagen, usa el tamaño comprimido.** `docker images` informa **sin comprimir**
> (380 MB), pero lo que se almacena y factura son ~78 MB, y las capas comunes se deduplican.
> Comparar la cifra sin comprimir contra la cuota lleva a conclusiones alarmistas y falsas.

Aun así, todo lo que acumula lleva rotación, porque lo que crece en silencio se descubre tarde:
`desplegar.ps1` conserva 3 imágenes y `backup.sh` rota los respaldos a 14 días avisando si falla.

`--min-instances 0` en Cloud Run también es parte de esto: ponerlo a 1 factura cada hora del mes.
Los números están en [deploy/README.md](deploy/README.md#costes-no-salirse-del-plan-gratuito).

### Las tres cosas que rompen el aislamiento en producción

Las tres fallan **en silencio**: la API sigue respondiendo 200 y nada aparece en los registros.

1. **El host de Neon con `-pooler`.** Es PgBouncer en modo transacción, y varias peticiones
   comparten conexión. Como el contexto se fija con `set_config(..., false)` — de sesión —, la
   conexión vuelve al pool con la empresa de una petición todavía puesta y la siguiente la hereda.
   **Usar siempre el endpoint directo.** `desplegar.ps1` se niega a desplegar si detecta `-pooler`.
2. **El modo worker de FrankenPHP, o Laravel Octane.** Misma fuga, por el mismo motivo: el proceso
   vive entre peticiones. Es tentador para quitarse el arranque de Laravel en cada llamada. No se
   activa. Si algún día hace falta, hay que envolver cada petición en una transacción y pasar a
   `SET LOCAL` antes.
3. **Conectar con un rol privilegiado.** `mts_app` es `NOSUPERUSER NOBYPASSRLS`; con
   `neondb_owner` las políticas dejan de aplicarse. `desplegar.ps1` también lo comprueba.

### El disco de las fotos: `MTS_MEDIA_DISK`, no `FILESYSTEM_DISK`

`config('mts.media_disk')` decide dónde se guardan las fotos de producto: `public` en local, `r2` en
producción. Va aparte de `FILESYSTEM_DISK` a propósito, que es el disco por defecto de *todo*
Laravel, incluidos archivos internos que no tienen por qué salir a internet.

- Cada fila de `media` guarda **su** disco en la columna `disk`, así que cambiar la variable no
  rompe las filas antiguas: se siguen sirviendo desde donde están hasta migrarlas con
  `php artisan mts:migrar-media`.
- El disco `r2` lleva `'visibility' => 'private'` y no es un descuido: Laravel pone `public` por
  defecto en todo disco S3, y eso manda `ACL: public-read` en cada subida. **R2 no tiene ACLs por
  objeto** y rechaza la petición. Lo público lo decide el dominio conectado al bucket.
- `R2_ENDPOINT` (privado, `.r2.cloudflarestorage.com`) y `R2_URL` (público, hoy `pub-XXXX.r2.dev`)
  son cosas distintas. Poner el primero donde va el segundo deja el catálogo entero con las
  imágenes rotas, y responde 401 solo al navegador.
- La dirección pública vive **solo** en `R2_URL`, nunca en `media.path`: pasar de `r2.dev` a un
  dominio propio es editar una línea, sin migrar archivos. `sublimartes21.com` no está en
  Cloudflare (su DNS es NS1), y R2 solo admite dominios de zonas de la propia cuenta.

### El respaldo NO puede correr como `mts_app`

`pg_dump` ejecuta `SET row_security = off`. Si el rol no puede saltarse RLS, PostgreSQL corta con
*"query would be affected by row-level security policy"* — porque las 12 tablas protegidas llevan
`FORCE ROW LEVEL SECURITY`, que aplica las políticas **incluso al dueño de la tabla**.

El Job de respaldo se conecta por eso como `neondb_owner`, que hereda `BYPASSRLS` de
`neon_superuser`. Es la única pieza del sistema que se conecta con un rol privilegiado, y solo
para volcar.

## Comandos

### Infraestructura y base de datos

```powershell
docker compose up -d
.\database\sql\run_all.ps1          # aplica todos los scripts en orden
docker compose exec postgres psql -U mts_user -d mts_platform -c "\dt"
```

Los scripts de `database/sql/` están numerados y **se ejecutan en orden**. `006_app_role.sql` va
aparte y al final, porque pide la contraseña por variable (el repo es público) y porque su
`GRANT ON ALL TABLES` debe cubrir también las tablas creadas en `007`.

El puerto de PostgreSQL en el host sale de `DB_PORT` del `.env` de la raíz (actualmente **5432**).
Ojo: `backend/.env` tiene su propio `DB_PORT` y **los dos tienen que coincidir**, porque el de la raíz
decide el puerto publicado por Docker y el del backend decide a dónde se conecta Laravel. Si no
coinciden, el síntoma es `SQLSTATE[08006] ... Connection refused`.

### Backend

```powershell
cd backend
php artisan serve
php artisan mts:crear-admin      # da de alta personal de MTS para el back-office
php artisan test

# Contra produccion (usa backend/.env.neon, que no esta en el repositorio)
php artisan mts:comprobar-produccion --env=neon
php artisan mts:migrar-media --env=neon --simular   # mueve archivos entre discos
```

**Los tests necesitan su propia base de datos.** Las líneas de sqlite de `phpunit.xml` están
comentadas a propósito (el esquema lo construyen los scripts SQL, no las migraciones, y RLS es de
PostgreSQL), así que sin `backend/.env.testing` los tests correrían contra la base de desarrollo.
Crear la base con `.\database\sql\setup_test_db.ps1`. Se conecta como **`mts_app`**: con `mts_user`
los tests de aislamiento pasarían sin probar nada, porque los superusuarios ignoran RLS.

Las migraciones nativas de Laravel están **adaptadas**: la de `users` fue editada para crear solo
`password_reset_tokens` y `sessions`, porque `users` la crea el SQL a mano con PK UUID. Si añades una
migración que se relacione con `users`, usa `uuid`/`uuidMorphs`, nunca `id()`/`morphs()`.

### Frontend

```powershell
cd frontend
npm run dev
npm run test
```

## Convenciones del frontend

- **Nunca uses `fetch` ni una instancia de Axios propia en un componente.** Todo pasa por
  `src/lib/httpClient.ts`, que es lo que garantiza que `Authorization` y `X-Company-Id` viajen
  siempre y que los 401 se manejen igual en todas partes.
- **`activeCompanyId` entra en la queryKey de toda query de negocio.** Al cambiar de empresa se hace
  `queryClient.clear()`; incluir el id en la key es la defensa en profundidad para que nunca se sirva
  caché de la empresa anterior.
- `components/ui/` es agnóstico de negocio: no importa nada de `features/`.
- Las rutas de módulo (`/cms`, `/crm`, `/erp`, `/ai`) se registran **solo si el módulo está activo**
  para la empresa. Un módulo no contratado da 404, no 403 — no se filtra que exista.
- `RequirePermission` es **solo UX** (ocultar lo que el usuario no puede usar). La seguridad real vive
  en el backend: Spatie Permission + RLS. El frontend nunca es la única barrera.
- Tailwind v4, configuración CSS-first: el color institucional y la tipografía se declaran con
  `@theme` en `src/index.css`. **No hay `tailwind.config.ts`.**

## Deuda técnica conocida

- **No hay middleware que valide el módulo contratado en el backend.** El frontend oculta las rutas
  de módulos no contratados, pero eso es solo UX. Hoy no existe ningún endpoint de módulo que
  proteger, así que sería código muerto; **añádelo el primer día del Sprint 4**, antes de escribir el
  primer endpoint del CMS o del CRM.
- **Los planes no tienen precio.** El catálogo (`Starter`, `Profesional`, `Empresarial`) define qué
  módulos incluye cada uno, pero los precios están a 0 pendientes de decisión comercial. Se editan
  por SQL; no hay pantalla de gestión de planes.
- **Nada cambia `subscriptions.status`.** Queda preparado (`active`, `past_due`, `cancelled`) pero la
  suspensión se hace hoy con `companies.is_active`. El control fino es del sprint de facturación.
- **El reporte mensual no existe.** Ni el comando, ni el `Schedule::`, ni los datos: lo que se ve en
  el panel es la maqueta de `frontend/src/features/quotes/mock.ts`. Parte de la documentación habla
  de "el programador mensual" como si estuviera construido y solo le faltara un cron; no es así.
  Cuando se construya, en Cloud Run tendrá que dispararlo Cloud Scheduler, igual que el respaldo.
- **`mts:migrar-media` no borra el origen.** Es deliberado (permite volver atrás), pero deja las
  fotos duplicadas hasta que alguien limpie a mano la carpeta local.
- La política RLS de `roles` sigue diciendo `company_id IS NULL OR ...`, residuo del enfoque anterior
  al `007`, que puso esa columna `NOT NULL`. Inofensivo pero engañoso.
- El identificador de personal de MTS es un booleano (`users.is_platform_admin`): no hay roles
  distintos entre el personal. Cuando los haya (soporte vs. comercial), migrar a una tabla
  `platform_admins` con rol.
