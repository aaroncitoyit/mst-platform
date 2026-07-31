<#
==========================================
 MTS Platform - ¿Está todo listo para desplegar?

 Se lanza ANTES de preparar.ps1. Comprueba de una vez todo lo que el despliegue
 va a necesitar y dice exactamente qué falta y cómo arreglarlo.

 Existe porque el despliegue toca cuatro sitios distintos (Google, Cloudflare,
 Neon y tu equipo) y descubrir a mitad que falta una credencial deja las cosas
 a medias: la imagen subida, el servicio creado y sin arrancar. Es más barato
 preguntarlo todo antes.

 No cambia nada. Solo mira.

 USO
   .\deploy\comprobar-requisitos.ps1
   .\deploy\comprobar-requisitos.ps1 -Proyecto mi-proyecto-gcp
==========================================
#>

param(
    [string]$Proyecto = "",
    [string]$ArchivoEnv = "backend/.env.neon"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\comun.ps1"

$fallos = 0

function Bien($texto) {
    Write-Host "  OK    " -ForegroundColor Green -NoNewline
    Write-Host $texto
}

function Falta($texto, $arreglo) {
    $script:fallos++
    Write-Host "  FALTA " -ForegroundColor Red -NoNewline
    Write-Host $texto
    foreach ($linea in @($arreglo)) {
        Write-Host "        $linea" -ForegroundColor DarkGray
    }
}

function Aviso($texto, $nota) {
    Write-Host "  AVISO " -ForegroundColor Yellow -NoNewline
    Write-Host $texto
    Write-Host "        $nota" -ForegroundColor DarkGray
}

Write-Host "`nComprobando lo necesario para desplegar..." -ForegroundColor Cyan

# ------------------------------------------
Write-Host "`nTu equipo" -ForegroundColor White
# ------------------------------------------

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue

if ($gcloud) {
    Bien "gcloud disponible"
} else {
    # Puede estar instalado pero no visible: el instalador anade la ruta al PATH
    # del usuario, y las terminales ya abiertas conservan el PATH viejo.
    $ruta = Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
    if (Test-Path $ruta) {
        Falta "gcloud esta instalado pero no en el PATH de esta terminal" `
              @("Cierra esta ventana y abre otra nueva. El instalador ya lo anadio al PATH.")
    } else {
        Falta "gcloud no esta instalado" `
              @("winget install --id Google.CloudSDK --exact")
    }
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Falta "Docker no esta instalado" @("Hace falta para construir la imagen del contenedor.")
} elseif ($null -eq (Intentar { docker info })) {
    Falta "Docker esta instalado pero el servicio no responde" `
          @("Abre Docker Desktop y espera a que arranque.")
} else {
    Bien "Docker funcionando"
}

# ------------------------------------------
Write-Host "`nGoogle Cloud" -ForegroundColor White
# ------------------------------------------

if (-not $gcloud) {
    Aviso "Comprobaciones de Google omitidas" "Sin gcloud no se pueden hacer."
} else {
    $cuentas = Intentar { gcloud auth list --filter "status:ACTIVE" --format "value(account)" }

    if (-not $cuentas) {
        Falta "No has iniciado sesion en Google Cloud" `
              @("gcloud auth login", "Abre el navegador. No lo puedo hacer yo por ti.")
    } else {
        Bien "Sesion iniciada como $cuentas"
    }

    if ([string]::IsNullOrWhiteSpace($Proyecto)) {
        $Proyecto = Intentar { gcloud config get-value project }
    }

    if ([string]::IsNullOrWhiteSpace($Proyecto) -or $Proyecto -eq "(unset)") {
        # El ID de proyecto es unico en TODO Google Cloud, no solo en tu cuenta:
        # "mts-platform" a secas suele estar cogido y el error no lo explica.
        Falta "No hay ningun proyecto de Google Cloud seleccionado" `
              @("gcloud projects create mts-platform-macedo --name='MTS Platform'",
                "gcloud config set project mts-platform-macedo",
                "(el ID es unico en todo Google, no solo en tu cuenta:",
                " si esta cogido, anadele algo al final)",
                "O elige uno existente:  gcloud projects list")
    } else {
        Bien "Proyecto: $Proyecto"

        # Sin facturacion vinculada, "gcloud services enable" falla con un error
        # de permisos que no menciona la facturacion por ningun lado.
        $facturacion = Intentar {
            gcloud billing projects describe $Proyecto --format "value(billingEnabled)"
        }

        if ($facturacion -eq "True") {
            Bien "Facturacion vinculada (con el plan gratuito no deberia cobrar nada)"
        } elseif ($null -eq $facturacion) {
            Aviso "No se pudo comprobar la facturacion" "Puede faltar permiso. Miralo en la consola de Google."
        } else {
            Falta "El proyecto no tiene cuenta de facturacion vinculada" `
                  @("Cloud Run la exige aunque no llegues a pagar nada.",
                    "gcloud billing accounts list",
                    "gcloud billing projects link $Proyecto --billing-account=0X0X0X-0X0X0X-0X0X0X")
        }
    }
}

# ------------------------------------------
Write-Host "`nConfiguracion ($ArchivoEnv)" -ForegroundColor White
# ------------------------------------------

if (-not (Test-Path $ArchivoEnv)) {
    Falta "No existe $ArchivoEnv" `
          @("Es el archivo del que los scripts leen la configuracion de produccion.",
            "No esta en el repositorio a proposito: lleva credenciales.")
} else {
    $env_valores = Leer-Env $ArchivoEnv

    # Cada clave con el motivo por el que hace falta, para que un hueco no se
    # rellene con cualquier cosa solo para que el script deje de quejarse.
    $obligatorias = [ordered]@{
        "APP_KEY"              = "sin ella Laravel no puede descifrar nada"
        "DB_HOST"              = "el endpoint directo de Neon"
        "DB_DATABASE"          = "la base de Neon"
        "DB_PASSWORD"          = "la contrasena de mts_app"
        "CORS_ORIGENES"        = "los dominios que pueden llamar a la API"
        "R2_ACCESS_KEY_ID"     = "token de R2, del panel de Cloudflare"
        "R2_SECRET_ACCESS_KEY" = "token de R2, del panel de Cloudflare"
        "R2_BUCKET"            = "nombre del bucket"
        "R2_ENDPOINT"          = "endpoint privado, https://<id-cuenta>.r2.cloudflarestorage.com"
        "R2_URL"               = "direccion publica, https://pub-XXXX.r2.dev"
    }

    $vacias = @()
    foreach ($clave in $obligatorias.Keys) {
        if ([string]::IsNullOrWhiteSpace($env_valores[$clave])) {
            $vacias += "$clave  ($($obligatorias[$clave]))"
        }
    }

    if ($vacias.Count -eq 0) {
        Bien "Las 10 variables necesarias estan rellenas"
    } else {
        Falta "Faltan $($vacias.Count) variables por rellenar:" $vacias
    }

    # Las tres que rompen el aislamiento entre clientes en silencio.
    if ($env_valores["DB_HOST"] -like "*-pooler*") {
        Falta "DB_HOST apunta al pooler de Neon" `
              @("El contexto de empresa se filtraria de una peticion a otra:",
                "un cliente veria datos de otro, sin ningun error.",
                "Usa el endpoint SIN '-pooler'.")
    } elseif ($env_valores["DB_HOST"]) {
        Bien "DB_HOST es el endpoint directo (sin pooler)"
    }

    if ($env_valores["DB_USERNAME"] -eq "mts_app") {
        Bien "DB_USERNAME es mts_app (NOSUPERUSER, se le aplica RLS)"
    } else {
        Falta "DB_USERNAME es '$($env_valores["DB_USERNAME"])'" `
              @("Tiene que ser mts_app: los roles privilegiados ignoran RLS.")
    }

    if ($env_valores["MTS_MEDIA_DISK"] -eq "r2") {
        Bien "MTS_MEDIA_DISK es r2 (el disco de Cloud Run es efimero)"
    } else {
        Falta "MTS_MEDIA_DISK es '$($env_valores["MTS_MEDIA_DISK"])'" `
              @("En Cloud Run tiene que ser r2, o las fotos desapareceran",
                "en el primer redespliegue.")
    }

    if ($env_valores["R2_URL"] -like "*r2.cloudflarestorage.com*") {
        Falta "R2_URL tiene el endpoint privado" `
              @("Ese responde 401 al navegador: el catalogo saldria con todas",
                "las imagenes rotas. Pon el dominio conectado al bucket.")
    }

    # ------------------------------------------
    # Neon
    # ------------------------------------------
    Write-Host "`nBase de datos (Neon)" -ForegroundColor White

    if (-not $docker -or [string]::IsNullOrWhiteSpace($env_valores["DB_PASSWORD"])) {
        Aviso "Conexion a Neon no comprobada" "Hace falta Docker y DB_PASSWORD."
    } else {
        $cadena = "host=$($env_valores["DB_HOST"]) port=5432 dbname=$($env_valores["DB_DATABASE"]) user=$($env_valores["DB_USERNAME"]) sslmode=require"

        $tablas = Intentar {
            docker run --rm -e PGPASSWORD="$($env_valores["DB_PASSWORD"])" -e PGCONNECT_TIMEOUT=15 `
                postgres:16-alpine psql $cadena -At -c `
                "select count(*) from pg_tables where schemaname='public' and rowsecurity"
        }

        if ($null -eq $tablas) {
            Falta "No se pudo conectar a Neon" `
                  @("Revisa DB_HOST y DB_PASSWORD.",
                    "OJO: el DNS de Neon es comodin, asi que un host equivocado",
                    "no da 'host desconocido' sino un error de autenticacion.")
        } elseif ("$tablas".Trim() -eq "12") {
            Bien "Neon responde y tiene las 12 tablas con RLS"
        } else {
            Falta "Neon responde pero tiene $tablas tablas con RLS, no 12" `
                  @("El esquema esta incompleto. Revisa database/sql/install.sh.")
        }
    }
}

# ------------------------------------------
Write-Host ""
# ------------------------------------------

if ($fallos -eq 0) {
    Write-Host "Todo listo. Puedes desplegar:" -ForegroundColor Green
    Write-Host "  .\deploy\cloud-run\preparar.ps1  -Proyecto $Proyecto -CuentaFacturacion <id>"
    Write-Host "  .\deploy\cloud-run\desplegar.ps1 -Proyecto $Proyecto"
    Write-Host ""
    exit 0
}

Write-Host "$fallos cosa(s) por resolver antes de desplegar." -ForegroundColor Red
Write-Host "Vuelve a lanzar esto cuando las tengas.`n"
exit 1
