#!/bin/sh
# ==========================================
# MTS Platform - Instalacion de la base de datos
#
# Equivalente a run_all.ps1 pero para un servidor: no necesita PowerShell ni
# Docker, solo psql. Sirve tanto para un VPS con PostgreSQL local como para una
# base gestionada (Railway, Render, Neon, RDS...).
#
# USO
#   export PGHOST=localhost PGPORT=5432 PGDATABASE=mts_platform PGUSER=postgres
#   export PGPASSWORD=...            # o usa un ~/.pgpass
#   ./database/sql/install.sh
#
# OPCIONES
#   --con-demo   Incluye la empresa de ejemplo "MTS Demo".
#                En produccion NO se pasa: por eso los datos de demo no llegan
#                nunca al servidor sin que alguien lo pida a proposito.
#   --forzar     Continua aunque la base ya tenga tablas (peligroso).
#
# La contrasena del rol de aplicacion se pide por consola, o se toma de
# MTS_APP_PASSWORD si esta definida. Nunca se escribe en un archivo del repo.
# ==========================================

set -eu

CON_DEMO=0
FORZAR=0

for arg in "$@"; do
    case "$arg" in
        --con-demo) CON_DEMO=1 ;;
        --forzar)   FORZAR=1 ;;
        -h|--help)  sed -n '2,30p' "$0"; exit 0 ;;
        *) echo "Opcion desconocida: $arg" >&2; exit 1 ;;
    esac
done

# Raiz del repositorio, a partir de donde esta este script
RAIZ=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$RAIZ"

: "${PGDATABASE:?Falta PGDATABASE. Exporta las variables de conexion antes de ejecutar.}"

rojo()  { printf '\033[31m%s\033[0m\n' "$1"; }
verde() { printf '\033[32m%s\033[0m\n' "$1"; }
info()  { printf '\033[36m%s\033[0m\n' "$1"; }

command -v psql >/dev/null 2>&1 || { rojo "No se encontro psql. Instala el cliente de PostgreSQL."; exit 1; }

psql -v ON_ERROR_STOP=1 -q -c 'SELECT 1' >/dev/null 2>&1 || {
    rojo "No se pudo conectar a $PGDATABASE en ${PGHOST:-localhost}:${PGPORT:-5432}."
    exit 1
}

# ------------------------------------------
# Guardia: no reinstalar encima de datos
# ------------------------------------------
YA_INSTALADA=$(psql -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='companies'")
if [ "$YA_INSTALADA" != "0" ] && [ "$FORZAR" -eq 0 ]; then
    rojo "La base $PGDATABASE ya tiene el esquema instalado."
    echo "Este script es para una instalacion nueva. Si sabes lo que haces, usa --forzar."
    exit 1
fi

# ------------------------------------------
# Orden de aplicacion
# ------------------------------------------
# 01-init.sql se incluye a proposito: en local lo aplica Docker solo al crear el
# contenedor, pero en un servidor hay que ejecutarlo a mano o no existiran las
# extensiones ni current_company_id(), del que dependen TODAS las politicas RLS.
ARCHIVOS="
docker/postgres/init/01-init.sql
database/sql/001_reference_tables.sql
database/sql/002_companies_and_tenancy.sql
database/sql/003_users_roles_permissions.sql
database/sql/004_support_tables.sql
database/sql/005_rls_policies.sql
database/seeders/001_seed_core.sql
database/sql/007_spatie_compatibility.sql
database/sql/008_get_user_companies.sql
database/sql/009_seed_company_modules.sql
database/sql/010_platform_and_plans.sql
database/seeders/003_seed_plans.sql
database/sql/011_migrate_existing_companies.sql
database/sql/012_services_and_clients.sql
database/seeders/004_seed_services.sql
database/sql/013_products.sql
database/sql/014_company_api_keys.sql
"

# ------------------------------------------
# El rol de aplicacion tiene que existir antes que los scripts
# ------------------------------------------
# Los scripts 008, 010, 012, 013 y 014 hacen GRANT ... TO mts_app, pero el 006
# -que es quien lo crea- va al final a proposito. En local eso nunca falla
# porque los roles son de ambito de CLUSTER: mts_app sobrevive a un DROP
# DATABASE y ya existia de una instalacion anterior. En un servidor nuevo no
# existe y el 008 aborta.
#
# Se crea aqui vacio: NOLOGIN y sin contrasena, asi que todavia no da acceso a
# nada. El 006 le pone al final la contrasena, el LOGIN y los permisos.
EXISTE_ROL=$(psql -tAc "SELECT count(*) FROM pg_roles WHERE rolname = 'mts_app'")
if [ "$EXISTE_ROL" = "0" ]; then
    info "Creando el rol mts_app (todavia sin acceso) ..."
    psql -v ON_ERROR_STOP=1 -q -c "CREATE ROLE mts_app NOLOGIN NOSUPERUSER NOBYPASSRLS"
fi

info "Instalando el esquema en $PGDATABASE ..."
for archivo in $ARCHIVOS; do
    printf '  %s\n' "$archivo"
    psql -v ON_ERROR_STOP=1 -q -f "$archivo"

    # La empresa de ejemplo va justo despues del 007, que es donde la coloca
    # run_all.ps1: necesita que seed_default_roles() ya exista.
    if [ "$archivo" = "database/sql/007_spatie_compatibility.sql" ] && [ "$CON_DEMO" -eq 1 ]; then
        printf '  %s  (--con-demo)\n' "database/seeders/002_seed_demo_company.sql"
        psql -v ON_ERROR_STOP=1 -q -f database/seeders/002_seed_demo_company.sql
    fi
done

# ------------------------------------------
# Rol de aplicacion
# ------------------------------------------
# Va al final porque su GRANT ON ALL TABLES debe cubrir todo lo creado arriba.
if [ -z "${MTS_APP_PASSWORD:-}" ]; then
    printf 'Contrasena para el rol mts_app: '
    stty -echo 2>/dev/null || true
    read -r MTS_APP_PASSWORD
    stty echo 2>/dev/null || true
    printf '\n'
fi

[ -n "$MTS_APP_PASSWORD" ] || { rojo "La contrasena no puede estar vacia."; exit 1; }

info "Creando el rol de aplicacion mts_app ..."
psql -v ON_ERROR_STOP=1 -q \
     -v app_password="$MTS_APP_PASSWORD" \
     -v db_name="$PGDATABASE" \
     -f database/sql/006_app_role.sql

# ------------------------------------------
# Verificacion: lo que hace que el aislamiento sea real
# ------------------------------------------
info "Comprobando el aislamiento multi-tenant ..."

ES_SUPER=$(psql -tAc "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='mts_app'")
if [ "$ES_SUPER" != "f" ]; then
    rojo "PELIGRO: mts_app es superusuario o tiene BYPASSRLS."
    echo "Con ese rol, las politicas RLS NO se aplican y un cliente podria ver datos de otro."
    exit 1
fi

TABLAS=$(psql -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
CON_RLS=$(psql -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity")

echo "  tablas creadas          : $TABLAS"
echo "  tablas con RLS activo   : $CON_RLS  (deben ser 12)"
echo "  mts_app sin privilegios : correcto"

[ "$CON_RLS" -eq 12 ] || rojo "AVISO: se esperaban 12 tablas con RLS. Revisa 005, 007 y 013 antes de seguir."

verde ""
verde "Base de datos lista."
echo ""
echo "Siguiente paso, desde backend/ y con su .env apuntando a esta base:"
echo "  php artisan migrate --force     # tablas propias de Laravel"
echo "  php artisan mts:crear-admin     # tu usuario del back-office"
echo ""
if [ "$CON_DEMO" -eq 0 ]; then
    echo "Sin datos de demo. Para incluirlos en un entorno de pruebas: --con-demo"
fi
