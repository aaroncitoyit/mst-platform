# Documentación del proyecto MTS Platform

## 1. Visión general del proyecto

MTS Platform es una plataforma empresarial modular en desarrollo que incluye infraestructura, base de datos, backend Laravel y front-end React. El proyecto está organizado en sprints y en esta versión contiene:

- `docker-compose.yml`: Define los servicios de infraestructura.
- `database/`: Scripts SQL, migraciones y seeders para inicializar la base de datos.
- `backend/`: Aplicación Laravel con autenticación y contexto multi-tenant.
- `frontend/`: Cliente web en React con autenticación, selección de empresa y panel administrativo.

El objetivo es construir un sistema multi-tenant donde cada empresa tenga datos aislados en la misma base PostgreSQL.

---

## 2. Arquitectura principal

### 2.1 Componentes

- PostgreSQL: Base de datos central.
- Redis: Caché y colas.
- pgAdmin: Administración de PostgreSQL.
- Mailpit: Captura correos de prueba.
- Laravel Backend: API REST y autenticación.
- Frontend React: consume la API.

### 2.2 Flujo de despliegue

1. Copiar `.env.example` a `.env` y rellenar los valores vacíos (`DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`).
2. Ejecutar `docker compose up -d`.
3. Inicializar la base de datos con `database/sql/run_all.ps1`.
4. Arrancar el backend (`php artisan serve`) y el frontend (`npm run dev`).

> `DB_PORT` aparece en dos sitios: el `.env` de la raíz (puerto que publica Docker) y `backend/.env`
> (puerto al que se conecta Laravel). Deben coincidir.

---

## 3. Servicios de Docker

El archivo `docker-compose.yml` define estos servicios:

- `postgres`:
  - Imagen: `postgres:16-alpine`
  - Usuario/contraseña desde `.env`
  - Volumen: `postgres_data`
  - Init scripts en `./docker/postgres/init`
- `redis`:
  - Imagen: `redis:7-alpine`
  - Volumen: `redis_data`
- `pgadmin`:
  - Imagen: `dpage/pgadmin4:8`
  - Configuración de servidor en `docker/pgadmin/servers.json`
  - Puerto `5050`
- `mailpit`:
  - Imagen: `axllent/mailpit:latest`
  - SMTP puerto `1025`, UI puerto `8025`

---

## 4. Modelo de datos principal

18 tablas del Core, todas con PK de tipo UUID y marcas de tiempo `TIMESTAMPTZ`.

### 4.1 Tablas de referencia (globales, sin `company_id`)

- `countries`
- `currencies`
- `plans`
- `modules`
- `permissions`

### 4.2 Tablas multi-tenant

- `companies`
- `subscriptions`
- `company_modules`

### 4.3 Tablas de usuarios y permisos

- `users`
- `company_user`
- `roles`
- `role_has_permissions`
- `model_has_roles`
- `model_has_permissions`

### 4.4 Tablas de soporte

- `settings`
- `media`
- `audit_logs`
- `notifications`

### 4.5 Cambio de enfoque en los roles (script `007`)

El diseño inicial del Sprint 1 preveía un catálogo global de roles (`roles.company_id = NULL`).
El script `007_spatie_compatibility.sql` lo descartó:

- `roles.company_id` pasó a ser `NOT NULL`: todo rol pertenece a una empresa.
- Cada empresa recibe **su propia copia** de los 4 roles base al crearse (`Administrador`,
  `Supervisor`, `Vendedor`, `Empleado`), mediante la función `seed_default_roles(company_id)`.
- `role_permissions` se renombró a `role_has_permissions` y `model_has_roles` pasó a ser polimórfica,
  ambos por compatibilidad con el modo *teams* de Spatie Permission
  (`team_foreign_key = company_id`, `'teams' => true` en `config/permission.php`).

---

## 5. Lógica multi-tenant y RLS

El sistema utiliza Row Level Security (RLS) para garantizar que las tablas con `company_id` solo muestren datos de la empresa actual. El rol `mts_app` es el rol de aplicación que usa Laravel, porque los superusuarios de PostgreSQL (como `mts_user`) ignoran RLS siempre.

### 5.1 Función de helper RLS

- Archivo: `docker/postgres/init/01-init.sql`
- Función: `current_company_id()`
- Uso: devuelve el valor de `app.current_company_id` en la sesión de PostgreSQL.

### 5.2 Políticas RLS

10 tablas activan `FORCE ROW LEVEL SECURITY` con la política:

```sql
CREATE POLICY tenant_isolation ON <tabla>
    USING (company_id = current_company_id());
```

Son: `subscriptions`, `company_modules`, `company_user`, `roles`, `model_has_roles`,
`model_has_permissions`, `settings`, `media`, `audit_logs`, `notifications`.

`companies` y `users` no llevan RLS por ser las tablas raíz: una empresa no tiene `company_id` de sí
misma, y un usuario puede pertenecer a varias empresas. Su control de acceso se hace vía
`company_user` en la capa de aplicación.

### 5.3 Cómo se fija el contexto

Laravel ejecuta, antes de tocar cualquier tabla con RLS:

```php
DB::statement("select set_config('app.current_company_id', ?, false)", [$companyId]);
```

El tercer argumento (`is_local`) es `false` a propósito. Con `SET LOCAL` (es decir, `true`), fuera de
una transacción explícita el valor se descartaría al terminar la sentencia y el contexto RLS se
perdería. Con PHP-FPM cada petición abre su propia conexión, así que este enfoque es correcto; si en
el futuro se adopta Octane o un pool de conexiones persistentes, habrá que envolver cada petición en
una transacción y pasar a `SET LOCAL`.

---

## 6. Backend Laravel

### 6.1 Rutas

| Método | Ruta | Middleware |
|--------|------|------------|
| POST | `/api/register` | — |
| POST | `/api/login` | — |
| POST | `/api/logout` | `auth:sanctum` |
| GET | `/api/my-companies` | `auth:sanctum` |
| GET | `/api/me` | `auth:sanctum` + `company.context` |
| GET | `/api/company` | `auth:sanctum` + `company.context` |

### 6.2 Autenticación

El backend usa Sanctum para tokens API y Spatie Permission (modo *teams*) para roles y permisos.
Como `users.id` es UUID, la tabla `personal_access_tokens` usa `uuidMorphs` y no `morphs`.

### 6.3 Contexto de empresa

El middleware `EnsureCompanyContext` exige el header `X-Company-Id`, valida que el usuario pertenezca
a la empresa (vía `get_user_companies`) y fija el contexto RLS antes de ejecutar la petición.

Dos rutas quedan deliberadamente fuera de ese middleware:

- **`/api/my-companies`**: es la única que se puede llamar sin empresa activa, y por eso es la que
  permite al frontend arrancar tras un refresco de página o cuando el usuario aún no ha elegido
  empresa. Funciona porque `get_user_companies` es `SECURITY DEFINER`.
- **`/api/logout`**: si a un usuario le revocan el acceso a la empresa que tenía seleccionada, debe
  poder revocar su token igualmente.

### 6.4 Respuestas relevantes

- `/api/me` devuelve `user`, `company` (la activa), `roles` y `permissions`. Los permisos son los que
  consume el control de acceso de la interfaz.
- `/api/company` devuelve la empresa activa y sus módulos contratados (join de `company_modules` con
  `modules`). Es lo que alimenta el menú lateral dinámico.

### 6.5 Controladores y modelos

- `App\Http\Controllers\Api\AuthController`
- `App\Http\Controllers\Api\CompanyController`
- `App\Http\Middleware\EnsureCompanyContext`
- `App\Models\User`, `Company`, `Role`, `Permission`

---

## 7. Cómo funciona el sistema

### 7.1 Registro

1. Un usuario se registra con datos de empresa.
2. Se crea la empresa y se fija `app.current_company_id`.
3. Se clonan los roles base de esa empresa con `seed_default_roles()`.
4. Se activan sus módulos en `company_modules`.
5. Se crea el usuario y se agrega a `company_user` con `is_owner = true`.
6. Se le asigna el rol `Administrador` y se devuelve un token.

> Los módulos activados **no** derivan todavía del plan contratado: no existe una tabla
> `plan_modules` que relacione `plans` con `modules`, así que por ahora toda empresa nueva recibe
> todos los módulos activos. Pendiente para el sprint de facturación, junto con la creación de la
> fila en `subscriptions`.

### 7.2 Inicio de sesión

1. `POST /api/login` devuelve el token y las empresas del usuario.
2. Con una sola empresa, el frontend la selecciona automáticamente.
3. Con varias, el usuario elige en la pantalla de selección de empresa.
4. En adelante, toda llamada autenticada envía el header `X-Company-Id`.

### 7.3 Arranque de la aplicación (rehidratación de sesión)

Del almacenamiento local solo se conservan el token y la empresa activa; lo demás se pide al backend:

1. Sin token, se va a la pantalla de acceso.
2. Con token, se pide `GET /api/my-companies` (no requiere empresa activa).
3. Si la empresa guardada sigue en la lista, se respeta y se pide `GET /api/me`.
4. Si ya no está (le revocaron el acceso), se descarta y se vuelve a elegir.
5. Con una sola empresa, se selecciona sola.

---

## 8. Inicialización de la base de datos

El script `database/sql/run_all.ps1` ejecuta los archivos en orden y al final pide la contraseña para
crear el rol `mts_app`. Es la fuente de verdad del orden de ejecución.

### Archivos ejecutados

1. `001_reference_tables.sql`
2. `002_companies_and_tenancy.sql`
3. `003_users_roles_permissions.sql`
4. `004_support_tables.sql`
5. `005_rls_policies.sql`
6. `database/seeders/001_seed_core.sql`
7. `007_spatie_compatibility.sql`
8. `database/seeders/002_seed_demo_company.sql`
9. `008_get_user_companies.sql`
10. `009_seed_company_modules.sql`
11. `006_app_role.sql` — aparte y al final: pide la contraseña por variable, y su
    `GRANT ON ALL TABLES` debe cubrir las tablas que crea el `007`.

---

## 9. Frontend React

Stack: React 19 + TypeScript + Vite + Tailwind v4 (configuración CSS-first, sin
`tailwind.config.ts`) + React Router + TanStack Query + Zustand + React Hook Form con Zod.

### 9.1 Organización

- `src/app/`: componente raíz, router y providers.
- `src/pages/`: pantallas (acceso, registro, selección de empresa, panel, configuración, errores).
- `src/features/`: lógica de dominio de `auth` y `companies`.
- `src/components/`: `layout` (shell, menú lateral, barra superior), `ui` (componentes base
  agnósticos de negocio) y `guards`.
- `src/lib/`: cliente HTTP y cliente de consultas.
- `src/stores/`: estado de sesión.

### 9.2 Reglas de diseño

- Todas las llamadas pasan por el cliente HTTP único, que inyecta `Authorization` y `X-Company-Id` y
  unifica el tratamiento de los errores 401.
- Un 401 limpia la sesión y el guard de autenticación redirige con el router. Un 403 **no** redirige:
  se propaga para mostrarlo como aviso, porque un redirect duro sacaría al usuario de la página por
  culpa de una petición de fondo.
- El identificador de empresa activa forma parte de la clave de toda consulta de negocio, y al
  cambiar de empresa se limpia la caché: nunca se sirven datos del inquilino anterior.
- El menú lateral no está fijado en código: se construye con los módulos que devuelve
  `GET /api/company`. Las rutas de un módulo solo se registran si la empresa lo tiene contratado, y
  un módulo no contratado responde 404 (no 403), para no revelar que existe.
- El control de acceso por permisos en la interfaz es solo una capa de experiencia de usuario. La
  seguridad real vive en el backend: Spatie Permission y RLS.

---

## 10. Estado actual y roadmap

- Sprint 0: infraestructura lista.
- Sprint 1: modelo de datos y políticas RLS.
- Sprint 2: backend Laravel con autenticación y contexto de empresa.
- Sprint 3: Core del frontend (autenticación, shell del panel, menú por módulos).
- Sprint 4: MTS CMS.
- Sprint 5: MTS CRM.

---

## 11. Notas importantes

- `mts_user` es superusuario de PostgreSQL y no debe usarse como conexión de la aplicación.
- `mts_app` es el rol que usa Laravel para que se respete RLS.
- Los roles ya no tienen catálogo global: cada empresa tiene su propia copia (ver 4.5).
- No existe todavía la relación entre planes y módulos (ver 7.1).
- No hay ninguna prueba automatizada que verifique el aislamiento RLS a nivel de base de datos, que
  es la propiedad central del sistema. Hoy solo se comprueba a mano contra la API.
