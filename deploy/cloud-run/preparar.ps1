<#
==========================================
 MTS Platform - Preparacion del proyecto de Google Cloud

 Se ejecuta UNA SOLA VEZ por proyecto. Es idempotente: si algo ya existe, lo
 dice y sigue, asi que se puede volver a lanzar sin miedo (por ejemplo para
 rotar una clave).

 Hace tres cosas:
   1. Habilita las APIs de GCP que hacen falta
   2. Crea el repositorio de Artifact Registry donde vive la imagen
   3. Sube a Secret Manager los valores sensibles de backend/.env.neon

 USO
   .\deploy\cloud-run\preparar.ps1 -Proyecto mi-proyecto-gcp
==========================================
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Proyecto,

    # us-east5 es Columbus (Ohio), la region de Google mas cercana a AWS
    # us-east-2, donde esta la base de Neon. Cada peticion hace varias consultas,
    # y con la API en otra costa se pagan ~60 ms de ida y vuelta en cada una.
    # Si algun dia mueves la base, mueve esto con ella.
    [string]$Region = "us-east5",

    [string]$Repositorio = "mts",

    [string]$ArchivoEnv = "backend/.env.neon",

    # ID de la cuenta de facturacion, con la forma 0X0X0X-0X0X0X-0X0X0X.
    # Se saca con: gcloud billing accounts list
    #
    # Si se pasa, se crea un aviso de presupuesto. LEE EL COMENTARIO de mas
    # abajo antes de confiar en el: avisa, no corta.
    [string]$CuentaFacturacion = "",

    # En dolares. 1 esta puesto a proposito: con todo dentro del plan gratuito
    # la factura deberia ser 0,00, asi que cualquier cosa que se acerque a 1
    # dolar significa que algo se salio de lo previsto. Un presupuesto de 50 no
    # avisaria hasta que ya duele.
    [int]$PresupuestoDolares = 1
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\..\comun.ps1"

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    throw "No se encontro gcloud. Instala Google Cloud CLI: https://cloud.google.com/sdk/docs/install"
}

$env_valores = Leer-Env $ArchivoEnv

gcloud config set project $Proyecto | Out-Null

# ------------------------------------------
# 1. APIs
# ------------------------------------------
# Sin habilitarlas, los comandos siguientes fallan con un error de permisos que
# no dice en ningun momento que el problema real es este.
Paso "Habilitando las APIs necesarias (tarda un poco la primera vez)"

$apis = @(
    "run.googleapis.com",              # Cloud Run: la API y el Job de respaldo
    "artifactregistry.googleapis.com", # donde se guarda la imagen del contenedor
    "secretmanager.googleapis.com",    # contrasenas, fuera de las variables de entorno
    "cloudscheduler.googleapis.com"    # el cron que Cloud Run no tiene
)

gcloud services enable @apis --project $Proyecto
if ($LASTEXITCODE -ne 0) { throw "No se pudieron habilitar las APIs." }
Ok "APIs habilitadas"

# ------------------------------------------
# 2. Artifact Registry
# ------------------------------------------
Paso "Repositorio de imagenes"

if (Existe { gcloud artifacts repositories describe $Repositorio --location $Region --project $Proyecto }) {
    Nota "El repositorio '$Repositorio' ya existe"
} else {
    gcloud artifacts repositories create $Repositorio `
        --repository-format docker `
        --location $Region `
        --project $Proyecto `
        --description "Imagenes de MTS Platform"
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el repositorio." }
    Ok "Repositorio '$Repositorio' creado en $Region"
}

# Deja a Docker autenticado contra Artifact Registry, que es lo que permite el
# push de desplegar.ps1.
gcloud auth configure-docker "$Region-docker.pkg.dev" --quiet
Ok "Docker autenticado contra $Region-docker.pkg.dev"

# ------------------------------------------
# 3. Secretos
# ------------------------------------------
# Van a Secret Manager y NO a las variables de entorno del servicio: las
# variables de entorno se ven en claro en la consola de Cloud Run y en la salida
# de "gcloud run services describe", que es exactamente lo que no queremos de
# una contrasena de base de datos.
#
# Se leen de .env.neon en vez de pedirlos por teclado para que no haya dos
# verdades: si el despliegue usa un valor distinto del que usan tus comandos
# "artisan --env=neon", los sintomas son incomprensibles.
Paso "Secretos"

$numero = gcloud projects describe $Proyecto --format "value(projectNumber)"
if ($LASTEXITCODE -ne 0) { throw "No se pudo leer el proyecto '$Proyecto'." }
$cuenta = "$numero-compute@developer.gserviceaccount.com"

# Nombre del secreto en GCP => variable de .env.neon
$secretos = [ordered]@{
    "mts-app-key"       = "APP_KEY"
    "mts-db-password"   = "DB_PASSWORD"
    "mts-r2-access-key" = "R2_ACCESS_KEY_ID"
    "mts-r2-secret-key" = "R2_SECRET_ACCESS_KEY"
}

foreach ($nombre in $secretos.Keys) {
    $clave = $secretos[$nombre]
    $valor = $env_valores[$clave]

    if ([string]::IsNullOrWhiteSpace($valor)) {
        Write-Host "    AVISO $clave esta vacia en $ArchivoEnv. Se salta '$nombre'." -ForegroundColor Yellow
        continue
    }

    # Siempre una version nueva: rotar una clave es volver a lanzar este script.
    Guardar-Secreto $nombre $valor $Proyecto $cuenta
    Ok "'$nombre' guardado desde $clave"
}

Ok "$cuenta puede leerlos"

# ------------------------------------------
# 4. Aviso de gasto
# ------------------------------------------
# ATENCION, Y ESTO SE MALINTERPRETA MUCHO: un presupuesto de Google Cloud
# **NO corta el gasto**. Solo manda un correo al pasar un umbral. No existe
# ningun tope duro: si algo se dispara, se sigue facturando mientras llega el
# aviso. Sirve para enterarte en horas en vez de a fin de mes, que ya es
# muchisimo, pero no es una red de seguridad.
#
# El tope real de este despliegue es --max-instances 3 en desplegar.ps1: limita
# cuanto puede llegar a consumir Cloud Run aunque le lluevan peticiones.
Paso "Aviso de gasto"

if ([string]::IsNullOrWhiteSpace($CuentaFacturacion)) {
    Write-Host "    AVISO Sin -CuentaFacturacion no se crea ningun aviso de gasto." -ForegroundColor Yellow
    Write-Host "          Con la tarjeta puesta y sin aviso, un error se descubre en la factura."
    Write-Host "          Saca el ID con:  gcloud billing accounts list"
    Write-Host "          Y vuelve a lanzar:  .\deploy\cloud-run\preparar.ps1 -Proyecto $Proyecto -CuentaFacturacion 0X0X0X-0X0X0X-0X0X0X"
} else {
    Intentar { gcloud services enable billingbudgets.googleapis.com --project $Proyecto } | Out-Null

    $nombrePresupuesto = "mts-aviso-gasto"

    $existente = Intentar {
        gcloud billing budgets list --billing-account $CuentaFacturacion `
            --filter "displayName=$nombrePresupuesto" --format "value(name)"
    }

    if ($existente) {
        Nota "El aviso '$nombrePresupuesto' ya existe"
    } else {
        # Umbrales al 50%, 90% y 100%. Con un presupuesto de 1 dolar, el primer
        # correo llega en cuanto se acumulan 50 centimos: antes de que nada
        # importe, que es justo el momento util para enterarse.
        gcloud billing budgets create `
            --billing-account $CuentaFacturacion `
            --display-name $nombrePresupuesto `
            --budget-amount "${PresupuestoDolares}USD" `
            --threshold-rule=percent=0.5 `
            --threshold-rule=percent=0.9 `
            --threshold-rule=percent=1.0

        if ($LASTEXITCODE -ne 0) {
            Write-Host "    AVISO No se pudo crear el aviso de gasto. Crealo a mano en la consola." -ForegroundColor Yellow
        } else {
            Ok "Aviso creado: correo al superar 0,50 / 0,90 / 1,00 USD"
        }
    }

    Write-Host "    NOTA  Un presupuesto AVISA, no corta el gasto. No existe tope duro en GCP." -ForegroundColor DarkGray
}

Write-Host "`nProyecto preparado." -ForegroundColor Green
Write-Host "Siguiente: .\deploy\cloud-run\desplegar.ps1 -Proyecto $Proyecto`n"
