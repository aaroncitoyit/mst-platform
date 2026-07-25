# MTS Platform

Plataforma empresarial modular (Core + CMS + CRM + ERP + IA) desarrollada por Macedo Tech Solutions.

## Estado actual: Sprint 0 - Entorno de desarrollo

Este repositorio contiene la base de infraestructura del proyecto. La base de datos,
el backend (Laravel) y el frontend (React) se irán agregando en los siguientes sprints.

## Requisitos

- Docker y Docker Compose
- Git

## Arranque rápido

```bash
# 1. Copiar variables de entorno
cp .env.example .env

# 2. (opcional) Editar .env y cambiar contraseñas por defecto

# 3. Levantar los servicios
docker compose up -d

# 4. Verificar que todo esté saludable
docker compose ps
```

## Servicios y puertos

| Servicio   | Propósito                     | URL / Puerto                      |
|------------|--------------------------------|------------------------------------|
| PostgreSQL | Base de datos principal        | localhost:5432                     |
| Redis      | Caché y colas                  | localhost:6379                     |
| pgAdmin    | Administración de PostgreSQL   | http://localhost:5050              |
| Mailpit    | Correos de prueba (SMTP + UI)  | SMTP: localhost:1025 · UI: http://localhost:8025 |

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
├── backend/                # Laravel (Sprint 2)
├── frontend/                # React (Sprint 3)
├── database/
│   ├── docs/                 # Documentación del modelo de datos
│   ├── sql/                  # Scripts SQL versionados
│   ├── migrations/           # Migraciones
│   └── seeders/              # Datos iniciales
├── docker/
│   ├── postgres/init/        # Scripts de inicialización de PostgreSQL
│   └── pgadmin/               # Configuración de pgAdmin
├── docs/                     # Documentación general del proyecto
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

## Sprint 1 — Base de datos del Core

Los scripts SQL están en `database/sql/` (numerados, se ejecutan en orden) y los
datos iniciales en `database/seeders/`.

### Aplicar todo de una vez (PowerShell, Windows)

```powershell
.\database\sql\run_all.ps1
```

### Aplicar manualmente, archivo por archivo

```powershell
Get-Content database\sql\001_reference_tables.sql | docker compose exec -T postgres psql -U mts_user -d mts_platform
Get-Content database\sql\002_companies_and_tenancy.sql | docker compose exec -T postgres psql -U mts_user -d mts_platform
Get-Content database\sql\003_users_roles_permissions.sql | docker compose exec -T postgres psql -U mts_user -d mts_platform
Get-Content database\sql\004_support_tables.sql | docker compose exec -T postgres psql -U mts_user -d mts_platform
Get-Content database\sql\005_rls_policies.sql | docker compose exec -T postgres psql -U mts_user -d mts_platform
Get-Content database\sql\006_app_role.sql | docker compose exec -T postgres psql -U mts_user -d mts_platform
Get-Content database\seeders\001_seed_core.sql | docker compose exec -T postgres psql -U mts_user -d mts_platform
```

### Verificar

```powershell
docker compose exec postgres psql -U mts_user -d mts_platform -c "\dt"
docker compose exec postgres psql -U mts_user -d mts_platform -c "SELECT name, is_system FROM roles;"
```

Deberías ver 15 tablas y los 4 roles base (`Administrador`, `Supervisor`, `Vendedor`, `Empleado`).

**Importante — usuario de la aplicación:** `mts_user` es superusuario de PostgreSQL
(por defecto en la imagen oficial) y los superusuarios **ignoran las políticas RLS**
siempre. El script `006_app_role.sql` crea el rol `mts_app`, que es el que Laravel
debe usar en su conexión (Sprint 2) para que el aislamiento multi-tenant por
`company_id` realmente se aplique. Usa `mts_user` solo para tareas administrativas
(migraciones, pgAdmin).

## Roadmap

1. **Sprint 0** — Entorno de desarrollo (este sprint).
2. **Sprint 1** — Base de datos: arquitectura, ERD, schemas, SQL, datos iniciales.
3. **Sprint 2** — Backend (Laravel).
4. **Sprint 3** — Frontend (React).
5. **Sprint 4** — MTS CMS.
6. **Sprint 5** — MTS CRM.
