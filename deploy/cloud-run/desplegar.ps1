<#
==========================================
 MTS Platform - Despliegue de la API en Cloud Run

 Construye la imagen, la sube a Artifact Registry y actualiza el servicio.
 Se puede lanzar tantas veces como haga falta.

 Requiere haber ejecutado antes preparar.ps1 (una sola vez por proyecto).

 USO
   .\deploy\cloud-run\desplegar.ps1 -Proyecto mi-proyecto-gcp
   .\deploy\cloud-run\desplegar.ps1 -Proyecto mi-proyecto-gcp -Origenes "https://panel.pages.dev,https://sublimartes21.com"
==========================================
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Proyecto,

    [string]$Region = "us-east5",
    [string]$Repositorio = "mts",
    [string]$Servicio = "mts-api",
    [string]$ArchivoEnv = "backend/.env.neon",

    # Dominios exactos que pueden llamar a la API. Si se omite, se toma
    # CORS_ORIGENES de .env.neon.
    [string]$Origenes = "",

    # Etiqueta de la imagen. Por defecto la fecha y el commit, para poder
    # senalar sin dudas que version esta corriendo cuando algo falle.
    [string]$Etiqueta = "",

    # Cuantas imagenes conservar en Artifact Registry.
    #
    # Ojo con los numeros, porque enganan: "docker images" dice 380 MB, pero
    # Artifact Registry cobra por bytes COMPRIMIDOS y ahi son ~78 MB (medido el
    # 30/07/2026). Con 0,5 GB de plan gratuito caben varias, y ademas las capas
    # comunes se deduplican entre imagenes con la misma base.
    #
    # Asi que esto no evita una factura inminente: evita el crecimiento sin fin
    # a lo largo de meses de despliegues. Conservar 3 permite volver a una
    # version anterior — Cloud Run apunta al digest, y si se borra la imagen esa
    # revision ya no puede arrancar.
    [int]$ImagenesAConservar = 3
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\..\comun.ps1"

foreach ($cmd in @("gcloud", "docker")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "No se encontro '$cmd' en el PATH."
    }
}

$env_valores = Leer-Env $ArchivoEnv

if ([string]::IsNullOrWhiteSpace($Origenes)) {
    $Origenes = $env_valores["CORS_ORIGENES"]
}
if ([string]::IsNullOrWhiteSpace($Origenes)) {
    throw "Falta CORS_ORIGENES. Sin el, el panel no puede llamar a la API y mts:comprobar-produccion falla."
}

if ([string]::IsNullOrWhiteSpace($Etiqueta)) {
    $commit = Intentar { git rev-parse --short HEAD }
    if (-not $commit) { $commit = "local" }
    $Etiqueta = (Get-Date -Format "yyyyMMdd-HHmm") + "-" + $commit
}

$imagen = "$Region-docker.pkg.dev/$Proyecto/$Repositorio/${Servicio}:$Etiqueta"

# ------------------------------------------
# Comprobaciones que evitan desplegar algo roto
# ------------------------------------------
Paso "Comprobando la configuracion antes de construir"

# El host de Neon con "-pooler" es PgBouncer en modo transaction. El contexto de
# empresa se fija con set_config(..., false), que vive en la SESION: la conexion
# vuelve al pool con la empresa de una peticion todavia puesta y la siguiente la
# hereda. Un cliente veria datos de otro, de forma intermitente y sin ningun
# error en los logs. Se para el despliegue aqui.
if ($env_valores["DB_HOST"] -like "*-pooler*") {
    throw "DB_HOST apunta al pooler de Neon. Usa el endpoint DIRECTO (sin '-pooler') o el aislamiento entre clientes deja de funcionar."
}

# mts_app es NOSUPERUSER NOBYPASSRLS. Con el rol dueno de la base, las politicas
# RLS no se aplican y cada cliente veria los datos de los demas.
if ($env_valores["DB_USERNAME"] -ne "mts_app") {
    throw "DB_USERNAME es '$($env_valores["DB_USERNAME"])'. Tiene que ser mts_app: los roles con privilegios ignoran RLS."
}

# Cloud Run tiene disco efimero: con un disco local, las fotos de producto
# desaparecen en el primer redespliegue.
if ($env_valores["MTS_MEDIA_DISK"] -ne "r2") {
    throw "MTS_MEDIA_DISK es '$($env_valores["MTS_MEDIA_DISK"])'. En Cloud Run tiene que ser r2."
}

Ok "Base de datos, rol y disco de archivos correctos"

# ------------------------------------------
# Imagen
# ------------------------------------------
Paso "Construyendo la imagen"
docker build -t $imagen ./backend
if ($LASTEXITCODE -ne 0) { throw "Fallo el docker build." }
Ok $imagen

Paso "Subiendo a Artifact Registry"
docker push $imagen
if ($LASTEXITCODE -ne 0) { throw "Fallo el docker push. Si es un 401, lanza preparar.ps1 otra vez." }
Ok "Imagen subida"

# ------------------------------------------
# Despliegue
# ------------------------------------------
Paso "Desplegando en Cloud Run"

# APP_URL tiene que ser la URL publica del servicio, y esa URL no existe hasta
# despues del primer despliegue. Si el servicio ya existe se lee ahora, para
# que entre en el mismo despliegue y no haga falta una revision extra.
$url = Intentar {
    gcloud run services describe $Servicio --project $Proyecto --region $Region --format "value(status.url)"
}

# Variables NO sensibles. Las contrasenas van por --set-secrets, mas abajo.
$variables = @(
    "APP_NAME=MTS Platform",
    "APP_ENV=production",
    "APP_DEBUG=false",
    "APP_LOCALE=es",
    "APP_FALLBACK_LOCALE=es",
    "LOG_CHANNEL=stack",
    "LOG_STACK=stderr",          # los logs de Cloud Run se leen de la salida estandar
    "LOG_LEVEL=error",
    "DB_CONNECTION=pgsql",
    "DB_HOST=$($env_valores["DB_HOST"])",
    "DB_PORT=5432",
    "DB_DATABASE=$($env_valores["DB_DATABASE"])",
    "DB_USERNAME=mts_app",
    "DB_SSLMODE=require",        # con 'prefer', si falla el TLS la conexion sigue en claro sin avisar
    "SESSION_DRIVER=database",   # sin Redis: cache, colas y sesiones van a la propia base
    "CACHE_STORE=database",
    "QUEUE_CONNECTION=database",
    "MAIL_MAILER=log",
    "MTS_SELF_REGISTRATION=false",
    "MTS_DEFAULT_PLAN=starter",
    "MTS_MEDIA_DISK=r2",
    "R2_BUCKET=$($env_valores["R2_BUCKET"])",
    "R2_ENDPOINT=$($env_valores["R2_ENDPOINT"])",
    "R2_URL=$($env_valores["R2_URL"])",
    "CORS_ORIGENES=$Origenes"
)

if (-not [string]::IsNullOrWhiteSpace($url)) {
    $variables += "APP_URL=$url"
}

# Delimitador propio (^##^). El de por defecto es la coma, y CORS_ORIGENES
# lleva comas dentro: sin esto, "https://a.com,https://b.com" se partiria en dos
# variables y la segunda se llamaria "https://b.com".
$variablesArg = "^##^" + ($variables -join "##")

$secretos = @(
    "APP_KEY=mts-app-key:latest",
    "DB_PASSWORD=mts-db-password:latest",
    "R2_ACCESS_KEY_ID=mts-r2-access-key:latest",
    "R2_SECRET_ACCESS_KEY=mts-r2-secret-key:latest"
) -join ","

gcloud run deploy $Servicio `
    --image $imagen `
    --project $Proyecto `
    --region $Region `
    --platform managed `
    --port 8080 `
    --memory 512Mi `
    --cpu 1 `
    --timeout 60 `
    --min-instances 0 `
    --max-instances 3 `
    --concurrency 20 `
    --allow-unauthenticated `
    --set-env-vars $variablesArg `
    --set-secrets $secretos

if ($LASTEXITCODE -ne 0) { throw "Fallo el despliegue." }

# --concurrency 20 y --max-instances 3 NO son arbitrarios: 20 x 3 = 60
# conexiones simultaneas como techo. No hay pooler (a proposito), asi que cada
# peticion abre su conexion contra Neon. Si subes cualquiera de los dos numeros,
# mira antes el limite de conexiones de tu plan de Neon: pasarse no da un error
# claro, da timeouts intermitentes.
#
# --allow-unauthenticated es correcto: es una API publica. Quien autoriza es
# Sanctum (y X-MTS-Key en la API de catalogo), no IAM de Google.
#
# --min-instances 0 significa arranque en frio en la primera peticion tras un
# rato parado. Para un back-office que usa una persona, es el compromiso bueno:
# lo contrario se paga cada hora del mes.

Ok "Servicio desplegado"

# ------------------------------------------
# APP_URL en el primer despliegue
# ------------------------------------------
# Si el servicio no existia, arriba no habia URL que poner. Se aplica ahora, en
# una segunda revision. Solo pasa una vez en la vida del servicio.
#
# Se hace aqui y no se deja como paso manual porque olvidarlo no rompe nada de
# forma visible: la API responde igual. Lo que falla son los enlaces que Laravel
# genera (el enlace publico de cotizacion), y eso se descubre tarde y mal.
$urlFinal = gcloud run services describe $Servicio `
    --project $Proyecto --region $Region --format "value(status.url)"

if ([string]::IsNullOrWhiteSpace($urlFinal)) {
    throw "No se pudo leer la URL del servicio."
}

if ([string]::IsNullOrWhiteSpace($url)) {
    Paso "Primer despliegue: fijando APP_URL"
    gcloud run services update $Servicio `
        --project $Proyecto --region $Region `
        --update-env-vars "APP_URL=$urlFinal" | Out-Null
    Ok "APP_URL = $urlFinal"
}

# ------------------------------------------
# Limpieza de imagenes antiguas
# ------------------------------------------
# Cada despliegue sube una imagen nueva con etiqueta propia, y ninguna se borra
# sola. Son ~78 MB comprimidos cada una: no es urgente, pero a lo largo de
# meses de despliegues es crecimiento sin fin en un sitio donde nadie mira.
Paso "Limpiando imagenes antiguas del registro"

$ruta = "$Region-docker.pkg.dev/$Proyecto/$Repositorio/$Servicio"

$digests = Intentar {
    gcloud artifacts docker images list $ruta `
        --sort-by "~CREATE_TIME" --format "value(version)" --project $Proyecto
}

$lista = @($digests | Where-Object { $_ })

if ($lista.Count -le $ImagenesAConservar) {
    Nota "$($lista.Count) imagenes almacenadas; nada que limpiar"
} else {
    # Se ordenan de mas nueva a mas vieja, asi que la recien desplegada es la
    # primera y nunca entra en el borrado.
    $sobran = $lista[$ImagenesAConservar..($lista.Count - 1)]
    $borradas = 0

    foreach ($digest in $sobran) {
        $r = Intentar {
            gcloud artifacts docker images delete "$ruta@$digest" `
                --delete-tags --quiet --project $Proyecto
        }
        if ($null -ne $r) { $borradas++ }
    }

    Ok "$borradas imagenes borradas; se conservan las $ImagenesAConservar mas recientes"
}

Write-Host "`nAPI desplegada en $urlFinal" -ForegroundColor Green
Write-Host ""
Write-Host "Comprueba que es seguro meter clientes:" -ForegroundColor Yellow
Write-Host "  cd backend; php artisan mts:comprobar-produccion --env=neon"
Write-Host ""
Write-Host "Acuerdate de poner esta URL en el panel de React (VITE_API_URL)"
Write-Host "y de anadir el dominio del panel a CORS_ORIGENES."
Write-Host ""
