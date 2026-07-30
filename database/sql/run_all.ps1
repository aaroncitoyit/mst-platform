# ==========================================
# MTS Platform - Ejecuta todo el Core (tablas + RLS) en orden
# Uso: desde la raiz del proyecto -> .\database\sql\run_all.ps1
# ==========================================

$files = @(
    "database\sql\001_reference_tables.sql",
    "database\sql\002_companies_and_tenancy.sql",
    "database\sql\003_users_roles_permissions.sql",
    "database\sql\004_support_tables.sql",
    "database\sql\005_rls_policies.sql",
    "database\seeders\001_seed_core.sql",
    "database\sql\007_spatie_compatibility.sql",
    "database\seeders\002_seed_demo_company.sql",
    "database\sql\008_get_user_companies.sql",
    "database\sql\009_seed_company_modules.sql",
    "database\sql\010_platform_and_plans.sql",
    "database\seeders\003_seed_plans.sql",
    "database\sql\011_migrate_existing_companies.sql",
    "database\sql\012_services_and_clients.sql",
    "database\seeders\004_seed_services.sql",
    "database\sql\013_products.sql",
    "database\sql\014_company_api_keys.sql"
)

foreach ($file in $files) {
    Write-Host "Ejecutando $file ..." -ForegroundColor Cyan
    Get-Content $file | docker compose exec -T postgres psql -U mts_user -d mts_platform -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR ejecutando $file. Deteniendo." -ForegroundColor Red
        exit 1
    }
}

# 006_app_role.sql se ejecuta aparte porque requiere una contrasena via variable,
# en vez de tenerla escrita en el archivo (el repo es publico).
Write-Host "Ejecutando database\sql\006_app_role.sql ..." -ForegroundColor Cyan
$appPassword = Read-Host "Contrasena para el rol mts_app" -AsSecureString
$plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($appPassword))
Get-Content database\sql\006_app_role.sql | docker compose exec -T postgres psql -U mts_user -d mts_platform -v app_password="$plainPassword" -v db_name=mts_platform -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR ejecutando 006_app_role.sql. Deteniendo." -ForegroundColor Red
    exit 1
}

Write-Host "Core del Sprint 1-2 aplicado correctamente." -ForegroundColor Green