# MTS Platform

Plataforma empresarial modular (Core + CMS + CRM + ERP + IA) desarrollada por Macedo Tech Solutions.

## Estado actual: back-office de MTS

El Core está completo de punta a punta, y ya existe el panel desde el que Macedo Tech opera el
negocio: dar de alta clientes, asignarles plan, activar sus módulos, suspenderlos y entrar a su panel
para dar soporte. Las pantallas propias de cada módulo (CMS, CRM, ERP) se construyen después.

| Sprint | Alcance | Estado |
|--------|---------|--------|
| 0 | Entorno de desarrollo (Docker) | Completo |
| 1 | Base de datos del Core: ERD, schemas, SQL, RLS, datos iniciales | Completo |
| 2 | Backend Laravel: autenticación y contexto de empresa | Completo |
| 3 | Frontend React: auth, shell del panel, menú por módulos | Completo |
| — | Back-office: empresas, planes y módulos, suspensión, soporte | Completo |
| 4 | MTS CMS | Pendiente |
| 5 | MTS CRM | Pendiente |

> **Aún no se puede dar acceso a un cliente:** todo corre en local, sin servidor ni dominio. El
> despliegue es el siguiente bloqueante real.

## Requisitos

- Docker y Docker Compose
- PHP 8.2+ y Composer (backend)
- Node.js 20+ y npm (frontend)
- Git

## Arranque rápido

```bash
# 1. Copiar variables de entorno
cp .env.example .env

# 2. Rellenar en .env los valores vacíos: DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD
#    (el archivo se entrega sin valores por defecto a propósito)

# 3. Levantar los servicios
docker compose up -d

# 4. Verificar que todo esté saludable
docker compose ps
```

> **Importante:** `DB_PORT` del `.env` de la raíz decide el puerto que Docker publica, y
> `DB_PORT` de `backend/.env` decide a dónde se conecta Laravel. **Los dos deben coincidir.**
> Si no, el síntoma es `SQLSTATE[08006] ... Connection refused`.

## Servicios y puertos

| Servicio   | Propósito                     | URL / Puerto                      |
|------------|--------------------------------|------------------------------------|
| PostgreSQL | Base de datos principal        | localhost:`DB_PORT` (5432 por defecto) |
| Redis      | Caché y colas                  | localhost:6379                     |
| pgAdmin    | Administración de PostgreSQL   | http://localhost:5050              |
| Mailpit    | Correos de prueba (SMTP + UI)  | SMTP: localhost:1025 · UI: http://localhost:8025 |
| Laravel    | API REST (`php artisan serve`) | http://127.0.0.1:8000              |
| Vite       | Frontend React (`npm run dev`) | http://localhost:5173              |

pgAdmin ya viene con el servidor "MTS Platform (local)" preconfigurado
(ver `docker/pgadmin/servers.json`). Al ingresar solo pedirá la contraseña
de PostgreSQL definida en `.env` (`DB_PASSWORD`).

## Verificar conectividad a PostgreSQL

```bash
docker compose exec postgres psql -U mts_user -d mts_platform -c "SELECT version();"
```

## Detener el entorno

```bash
# Detener contenedores (conserva los datos)
docker compose down

# Detener y borrar también los volúmenes (borra los datos)
docker compose down -v
```

## Estructura del proyecto

```
mts-platform/
├── backend/                  # Laravel 12 (API REST)
│   ├── app/Http/Controllers/Api/
│   ├── app/Http/Middleware/EnsureCompanyContext.php
│   └── app/Models/
├── frontend/                 # React 19 + TypeScript + Vite + Tailwind v4
│   └── src/
│       ├── app/               # App, router, providers
│       ├── components/        # layout, ui, guards
│       ├── features/          # auth, companies
│       ├── lib/               # httpClient, queryClient
│       └── stores/            # sessionStore
├── database/
│   ├── docs/                 # Documentación del modelo de datos
│   ├── sql/                  # Scripts SQL versionados
│   ├── migrations/           # Migraciones
│   └── seeders/              # Datos iniciales
├── docker/
│   ├── postgres/init/        # Scripts de inicialización de PostgreSQL
│   └── pgadmin/               # Configuración de pgAdmin
├── docs/                     # Documentación general y diagramas
├── CLAUDE.md                 # Guía de arquitectura y convenciones
├── docker-compose.yml
├── .env.example
└── README.md
```

## Principios arquitectónicos del proyecto

- **Orden de construcción:** primero infraestructura, luego base de datos, luego software.
- **Core independiente:** los módulos (CMS, CRM, ERP...) dependen del Core; el Core no depende de ningún módulo.
- **Multi-tenant:** una sola base PostgreSQL compartida, aislamiento por `company_id` reforzado con
  políticas Row Level Security (RLS) además del scope de aplicación en Laravel. Clientes grandes podrán
  migrar a una base de datos independiente en una fase posterior sin cambiar el modelo de datos.

## Base de datos

Los scripts SQL están en `database/sql/` (numerados, se ejecutan en orden) y los
datos iniciales en `database/seeders/`.

### Aplicar todo de una vez (PowerShell, Windows)

```powershell
.\database\sql\run_all.ps1
```

El script es la **fuente de verdad** del orden de ejecución:

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
11. `010_platform_and_plans.sql` — administradores de plataforma y `plan_modules`
12. `database/seeders/003_seed_plans.sql` — catálogo de planes
13. `011_migrate_existing_companies.sql`
14. `006_app_role.sql` — **al final**, y aparte

`006_app_role.sql` va el último por dos razones: pide la contraseña por variable en vez de
tenerla escrita en el archivo (el repo es público), y su `GRANT ON ALL TABLES` debe cubrir
también las tablas que crea el `007`.

### Instalar en un servidor (Linux)

`run_all.ps1` es para desarrollo: necesita PowerShell y Docker. En un servidor se usa
`install.sh`, que solo necesita `psql` y sirve igual para un VPS que para una base gestionada.

```bash
export PGHOST=... PGPORT=5432 PGDATABASE=mts_platform PGUSER=... PGPASSWORD=...
./database/sql/install.sh
```

**Los datos de demo no se instalan salvo que se pidan.** La empresa de ejemplo `MTS Demo` solo se
crea con `--con-demo`, así que en producción nunca aparece sin que alguien lo decida.

El script se niega a correr sobre una base que ya tenga el esquema, pide la contraseña de `mts_app`
por consola (o la toma de `MTS_APP_PASSWORD`) y, al terminar, **comprueba que `mts_app` no sea
superusuario ni tenga `BYPASSRLS`** — que es lo único que hace que el aislamiento entre clientes sea
real. Si esa comprobación falla, aborta.

Después quedan dos pasos desde `backend/`:

```bash
php artisan migrate --force     # tablas propias de Laravel
php artisan mts:crear-admin     # tu usuario del back-office
```

### Verificar

```powershell
docker compose exec postgres psql -U mts_user -d mts_platform -c "\dt"
docker compose exec postgres psql -U mts_user -d mts_platform -c "SELECT name, is_system FROM roles LIMIT 4;"
```

Deberías ver **19 tablas del Core** (propiedad de `mts_user`) más las de Laravel (propiedad de
`mts_app`: `migrations`, `sessions`, `personal_access_tokens`, `cache`, `jobs`...), y los 4 roles
base por empresa: `Administrador`, `Supervisor`, `Vendedor`, `Empleado`.

De esas 19, **10 llevan RLS**: `subscriptions`, `company_modules`, `company_user`, `roles`,
`model_has_roles`, `model_has_permissions`, `settings`, `media`, `audit_logs`, `notifications`.
`companies` y `users` no lo llevan por ser las tablas raíz.

**Importante — usuario de la aplicación:** `mts_user` es superusuario de PostgreSQL
(por defecto en la imagen oficial) y los superusuarios **ignoran las políticas RLS**
siempre. El script `006_app_role.sql` crea el rol `mts_app`, que es el que Laravel
usa en su conexión, para que el aislamiento multi-tenant por `company_id` realmente
se aplique. Usa `mts_user` solo para tareas administrativas (migraciones, pgAdmin).

> **Nota sobre roles:** el `007` cambió el enfoque original. Ya **no** existe un catálogo global de
> roles con `company_id = NULL`: cada empresa recibe su propia copia de los 4 roles base al crearse,
> vía la función `seed_default_roles(company_id)`. Es lo que encaja con el modo *teams* de Spatie.

## Backend (Laravel)

```bash
cd backend
composer install
cp .env.example .env && php artisan key:generate   # solo la primera vez
php artisan mts:crear-admin                        # personal de MTS para el back-office
php artisan serve
```

### Pruebas

Los tests necesitan **su propia base de datos**: las líneas de sqlite de `phpunit.xml` están
comentadas a propósito (el esquema lo construyen los scripts SQL, no las migraciones, y RLS es de
PostgreSQL), así que sin esto correrían contra la base de desarrollo.

```powershell
.\database\sql\setup_test_db.ps1     # crea mts_platform_test
cd backend; php artisan test
```

Se conecta como `mts_app` y no como `mts_user`: con un superusuario, los tests de aislamiento
multi-tenant pasarían sin probar nada.

### API

| Método | Ruta | Middleware | Descripción |
|--------|------|------------|-------------|
| POST | `/api/register` | — | Autoservicio, **cerrado por defecto** (responde 403) |
| POST | `/api/login` | — | Devuelve token y las empresas del usuario |
| POST | `/api/logout` | `auth:sanctum` | Revoca el token actual |
| GET | `/api/my-companies` | `auth:sanctum` | Empresas del usuario |
| GET | `/api/me` | `auth:sanctum` + `company.context` | Usuario, empresa activa, roles y permisos |
| GET | `/api/company` | `auth:sanctum` + `company.context` | Empresa activa y módulos contratados |

Back-office, todo bajo `auth:sanctum` + `user.active` + `platform.admin`:

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/admin/me` | Datos del administrador de plataforma |
| GET | `/api/admin/stats` | Contadores del panel |
| GET | `/api/admin/plans` | Catálogo de planes con sus módulos |
| GET | `/api/admin/companies` | Listado de empresas (con búsqueda) |
| POST | `/api/admin/companies` | Alta: empresa + dueño + plan |
| GET | `/api/admin/companies/{id}` | Detalle: suscripción, módulos, usuarios |
| PATCH | `/api/admin/companies/{id}` | Renombrar, suspender o reactivar |
| PUT | `/api/admin/companies/{id}/plan` | Cambiar plan y recalcular módulos |
| POST | `/api/admin/companies/{id}/impersonate` | Registrar la entrada al panel del cliente |

**Toda ruta bajo `company.context` exige el header `X-Company-Id`.** El middleware
`EnsureCompanyContext` valida que el usuario pertenezca a esa empresa y solo entonces fija el
contexto RLS de la sesión de PostgreSQL.

`/api/my-companies` y `/api/logout` van a propósito **fuera** de `company.context`: el primero es lo
que permite al frontend arrancar cuando aún no hay empresa activa (al refrescar la página, o cuando
el usuario pertenece a varias); el segundo, poder cerrar sesión aunque te hayan revocado el acceso a
la empresa que tenías seleccionada.

## Frontend (React)

```bash
cd frontend
npm install
cp .env.example .env      # VITE_API_URL apunta a http://127.0.0.1:8000/api
npm run dev
npm run test
npm run build
```

Stack: React 19 + TypeScript + Vite + Tailwind v4 (configuración CSS-first, **sin**
`tailwind.config.ts`) + React Router + TanStack Query + Zustand + React Hook Form con Zod.

Puntos a respetar al desarrollar (detalle completo en [CLAUDE.md](CLAUDE.md)):

- Todas las llamadas pasan por `src/lib/httpClient.ts`; nunca `fetch` ni otra instancia de axios.
- `activeCompanyId` entra en la queryKey de toda query de negocio, y al cambiar de empresa se limpia
  la caché de React Query.
- Las rutas de módulo (`/cms`, `/crm`, `/erp`, `/ai`) solo se registran si la empresa tiene ese
  módulo contratado. Un módulo no contratado da 404, no 403.
- `RequirePermission` es solo UX: la seguridad real vive en el backend (Spatie Permission + RLS).

## Documentación

- [CLAUDE.md](CLAUDE.md) — arquitectura, convenciones y deuda técnica conocida.
- [docs/system-overview.md](docs/system-overview.md) — descripción funcional del sistema.
- `docs/diagrams/` — ERD y flujo del sistema en Mermaid (`.mmd`) y PNG.
