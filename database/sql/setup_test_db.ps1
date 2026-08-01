# ==========================================
# MTS Platform - Crea (o recrea) la base de datos de pruebas
# Uso: desde la raiz del proyecto -> .\database\sql\setup_test_db.ps1
#
# POR QUE EXISTE: las lineas de sqlite de phpunit.xml estan comentadas, asi que
# sin esto `php artisan test` correria contra la base de DESARROLLO y cualquier
# test que toque datos trabajaria sobre datos reales.
#
# Los tests se conectan como mts_app (NOSUPERUSER NOBYPASSRLS), no como
# mts_user. Es imprescindible: mts_user es superusuario e ignora RLS siempre,
# asi que un test de aislamiento ejecutado con el pasaria sin probar nada.
# ==========================================

$testDb = "mts_platform_test"

# PowerShell 5.1 lee por defecto en ANSI y pipea a procesos nativos en ASCII:
# los acentos de los SQL (la eñe del translate de 013) llegaban a psql como '?'
# y el slug quedaba roto. Hay que leer UTF-8 y emitir UTF-8 por el pipe. El
# pipe lee $OutputEncoding del ambito GLOBAL: asignarlo en el ambito local del
# script no surte efecto (quirk de PS 5.1).
$global:OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Write-Host "Recreando la base $testDb ..." -ForegroundColor Cyan
docker compose exec -T postgres psql -U mts_user -d postgres -c "DROP DATABASE IF EXISTS $testDb;"
docker compose exec -T postgres psql -U mts_user -d postgres -c "CREATE DATABASE $testDb;"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR creando la base de pruebas." -ForegroundColor Red
    exit 1
}

# Extensiones y el helper current_company_id(), que en la base de desarrollo
# aplica automaticamente el init de Docker pero aqui hay que ejecutar a mano.
$files = @(
    "docker\postgres\init\01-init.sql",
    "database\sql\001_reference_tables.sql",
    "database\sql\002_companies_and_tenancy.sql",
    "database\sql\003_users_roles_permissions.sql",
    "database\sql\004_support_tables.sql",
    "database\sql\005_rls_policies.sql",
    "database\seeders\001_seed_core.sql",
    "database\sql\007_spatie_compatibility.sql",
    "database\sql\008_get_user_companies.sql",
    "database\sql\010_platform_and_plans.sql",
    "database\seeders\003_seed_plans.sql",
    "database\sql\012_services_and_clients.sql",
    "database\seeders\004_seed_services.sql",
    "database\sql\013_products.sql",
    "database\sql\014_company_api_keys.sql",
    "database\sql\015_quotes.sql"
)

foreach ($file in $files) {
    Write-Host "  $file" -ForegroundColor DarkGray
    Get-Content -Encoding UTF8 $file | docker compose exec -T postgres psql -U mts_user -d $testDb -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR ejecutando $file." -ForegroundColor Red
        exit 1
    }
}

# Permisos para el rol de aplicacion. No se reutiliza 006_app_role.sql porque
# aquel crea el rol (que ya existe: los roles son de ambito de cluster) y
# concede sobre la base de desarrollo.
#
# Va ANTES de las migraciones porque desde PostgreSQL 15 el esquema public ya
# no concede CREATE a todo el mundo, y las migraciones corren como mts_app.
# Darle CREATE aqui es aceptable: es una base de pruebas, y no afecta a lo que
# se esta probando (mts_app sigue siendo NOSUPERUSER NOBYPASSRLS, que es lo que
# hace que las politicas RLS se le apliquen).
Write-Host "Concediendo permisos a mts_app ..." -ForegroundColor Cyan
$grants = @"
GRANT CONNECT ON DATABASE $testDb TO mts_app;
GRANT USAGE, CREATE ON SCHEMA public TO mts_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mts_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mts_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mts_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO mts_app;
"@
$grants | docker compose exec -T postgres psql -U mts_user -d $testDb -v ON_ERROR_STOP=1 -q
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR concediendo permisos." -ForegroundColor Red
    exit 1
}

# Tablas propias de Laravel (sessions, personal_access_tokens, cache, jobs).
# Se crean con las migraciones, apuntando a la base de pruebas.
Write-Host "Aplicando migraciones de Laravel ..." -ForegroundColor Cyan
Push-Location backend
php artisan migrate --env=testing --force
$migrateResult = $LASTEXITCODE
Pop-Location
if ($migrateResult -ne 0) {
    Write-Host "ERROR aplicando las migraciones." -ForegroundColor Red
    exit 1
}

Write-Host "Base de pruebas lista. Ya puedes ejecutar: cd backend; php artisan test" -ForegroundColor Green
