<#
==========================================
 MTS Platform - Respaldo diario de la base de datos

 Cloud Run NO tiene cron. Los contenedores se levantan bajo demanda y se
 apagan: no hay ningun proceso vivo que ejecute un crontab. Por eso el respaldo
 se monta con dos piezas:

   - un Cloud Run Job  (el contenedor que hace pg_dump y lo sube a R2)
   - un Cloud Scheduler (el reloj que lo arranca cada dia)

 Idempotente: se puede volver a lanzar para actualizar la imagen o el horario.

 USO
   .\deploy\respaldo\programar.ps1 -Proyecto mi-proyecto-gcp -ClaveDueno "..."

 EL RESPALDO VA A CLOUDFLARE R2, NO A GOOGLE. A proposito: un respaldo que vive
 en el mismo proveedor que los datos no protege del caso "se pierde la cuenta".
 Los datos estan en Neon, la copia en Cloudflare.
==========================================
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Proyecto,

    # ATENCION: la contrasena de neondb_owner, NO la de mts_app.
    #
    # Las 12 tablas protegidas tienen FORCE ROW LEVEL SECURITY, que aplica las
    # politicas incluso al dueno de la tabla. pg_dump ejecuta "SET row_security
    # = off", y si el rol no puede saltarse RLS, PostgreSQL corta con
    # "query would be affected by row-level security policy for table ...".
    # Con mts_app (NOSUPERUSER NOBYPASSRLS) el respaldo no fallaria a medias:
    # no existiria. neondb_owner hereda BYPASSRLS de neon_superuser.
    [Parameter(Mandatory = $true)]
    [string]$ClaveDueno,

    [string]$Region = "us-east5",
    [string]$Repositorio = "mts",
    [string]$Job = "mts-respaldo",
    [string]$ArchivoEnv = "backend/.env.neon",

    # 03:00 hora de Lima. De madrugada y con la zona horaria puesta: con UTC a
    # secas, el horario se desplaza y acaba corriendo a media tarde.
    [string]$Horario = "0 3 * * *",
    [string]$ZonaHoraria = "America/Lima",

    [int]$Dias = 14
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\..\comun.ps1"

foreach ($cmd in @("gcloud", "docker")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "No se encontro '$cmd' en el PATH."
    }
}

$env_valores = Leer-Env $ArchivoEnv

foreach ($clave in @("DB_HOST", "DB_DATABASE", "R2_BUCKET", "R2_ENDPOINT")) {
    if ([string]::IsNullOrWhiteSpace($env_valores[$clave])) {
        throw "Falta $clave en $ArchivoEnv."
    }
}

# Si el respaldo apuntara al pooler, pg_dump veria una conexion distinta en cada
# sentencia y el volcado podria salir inconsistente.
if ($env_valores["DB_HOST"] -like "*-pooler*") {
    throw "DB_HOST apunta al pooler de Neon. Usa el endpoint DIRECTO (sin '-pooler')."
}

$numero = gcloud projects describe $Proyecto --format "value(projectNumber)"
if ($LASTEXITCODE -ne 0) { throw "No se pudo leer el proyecto '$Proyecto'." }
$cuenta = "$numero-compute@developer.gserviceaccount.com"

# ------------------------------------------
# 1. Secreto con la contrasena del dueno
# ------------------------------------------
Paso "Secreto de neondb_owner"

$nombreSecreto = "mts-db-owner-password"
Guardar-Secreto $nombreSecreto $ClaveDueno $Proyecto $cuenta
Ok "$nombreSecreto guardado"

# ------------------------------------------
# 2. Imagen del Job
# ------------------------------------------
Paso "Construyendo la imagen del respaldo"

$etiqueta = Get-Date -Format "yyyyMMdd-HHmm"
$imagen = "$Region-docker.pkg.dev/$Proyecto/$Repositorio/${Job}:$etiqueta"

# El contexto es la raiz del repositorio: el Dockerfile copia database/backup.sh.
docker build -f deploy/respaldo/Dockerfile -t $imagen .
if ($LASTEXITCODE -ne 0) { throw "Fallo el docker build." }

docker push $imagen
if ($LASTEXITCODE -ne 0) { throw "Fallo el docker push. Si es un 401, lanza preparar.ps1 otra vez." }
Ok $imagen

# ------------------------------------------
# 3. Cloud Run Job
# ------------------------------------------
Paso "Creando o actualizando el Job"

$variables = @(
    "PGHOST=$($env_valores["DB_HOST"])",
    "PGPORT=5432",
    "PGDATABASE=$($env_valores["DB_DATABASE"])",
    "PGUSER=neondb_owner",
    # require, no prefer: con prefer, si falla la negociacion TLS libpq se
    # conecta en claro sin avisar, y por ahi viaja la base entera.
    "PGSSLMODE=require",

    "R2_BUCKET=$($env_valores["R2_BUCKET"])",
    "R2_PREFIJO_RESPALDOS=respaldos",

    # rclone se configura por variables RCLONE_CONFIG_<REMOTO>_<OPCION>. El
    # remoto se llama "r2", que es como lo invoca backup.sh.
    "RCLONE_CONFIG_R2_TYPE=s3",
    "RCLONE_CONFIG_R2_PROVIDER=Cloudflare",
    "RCLONE_CONFIG_R2_REGION=auto",
    "RCLONE_CONFIG_R2_ENDPOINT=$($env_valores["R2_ENDPOINT"])",
    # El token de R2 tiene permiso sobre el bucket, no sobre la cuenta: sin esto
    # rclone intentaria comprobar que el bucket existe, recibiria un 403 y
    # fallaria antes de subir nada.
    "RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true"
)
$variablesArg = "^##^" + ($variables -join "##")

$secretos = @(
    "PGPASSWORD=$nombreSecreto:latest",
    "RCLONE_CONFIG_R2_ACCESS_KEY_ID=mts-r2-access-key:latest",
    "RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=mts-r2-secret-key:latest"
) -join ","

# --max-retries 1: si el respaldo falla, se reintenta una vez y se para. Un Job
# que reintenta sin fin oculta el fallo detras de "sigue ejecutandose".
# --memory 1Gi: el volcado se escribe en /tmp, que en Cloud Run es memoria.
gcloud run jobs deploy $Job `
    --image $imagen `
    --project $Proyecto `
    --region $Region `
    --memory 1Gi `
    --cpu 1 `
    --task-timeout 900 `
    --max-retries 1 `
    --args="--remoto,--destino,/tmp/respaldos,--dias,$Dias" `
    --set-env-vars $variablesArg `
    --set-secrets $secretos

if ($LASTEXITCODE -ne 0) { throw "Fallo la creacion del Job." }
Ok "Job '$Job' listo"

# ------------------------------------------
# 4. Cloud Scheduler
# ------------------------------------------
Paso "Programando la ejecucion diaria"

# El Scheduler llama a la API de Cloud Run para arrancar el Job, asi que su
# cuenta de servicio necesita permiso de invocacion sobre el.
Intentar {
    gcloud run jobs add-iam-policy-binding $Job `
        --member "serviceAccount:$cuenta" `
        --role "roles/run.invoker" `
        --region $Region --project $Proyecto
} | Out-Null

$uri = "https://$Region-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$Proyecto/jobs/${Job}:run"
$tarea = "$Job-diario"

# create la primera vez, update las siguientes: asi el script se puede relanzar
# para cambiar el horario sin borrar nada antes.
$accion = "create"
if (Existe { gcloud scheduler jobs describe $tarea --location $Region --project $Proyecto }) {
    $accion = "update"
}

gcloud scheduler jobs $accion http $tarea `
    --location $Region `
    --project $Proyecto `
    --schedule $Horario `
    --time-zone $ZonaHoraria `
    --uri $uri `
    --http-method POST `
    --oauth-service-account-email $cuenta

if ($LASTEXITCODE -ne 0) { throw "Fallo la programacion." }
Ok "Programado: $Horario ($ZonaHoraria)"

# ------------------------------------------
# 5. Probarlo AHORA
# ------------------------------------------
# Un respaldo que no se ha probado no es un respaldo. Si se deja para manana,
# el primer aviso de que algo va mal llega el dia que haga falta restaurar.
Paso "Ejecutando el respaldo una vez para comprobarlo"

gcloud run jobs execute $Job --region $Region --project $Proyecto --wait

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nEl respaldo de prueba FALLO. Mira los registros:" -ForegroundColor Red
    Write-Host "  gcloud run jobs executions list --job $Job --region $Region --project $Proyecto"
    throw "Respaldo de prueba fallido."
}

Write-Host "`nRespaldo programado y probado." -ForegroundColor Green
Write-Host ""
Write-Host "Comprueba que el archivo esta de verdad en R2:" -ForegroundColor Yellow
Write-Host "  panel de Cloudflare -> R2 -> $($env_valores["R2_BUCKET"]) -> respaldos/"
Write-Host ""
Write-Host "Y prueba a restaurarlo alguna vez. Un respaldo que nunca se ha"
Write-Host "restaurado es una suposicion, no una copia de seguridad:"
Write-Host "  pg_restore -d mts_platform --clean --if-exists mts-bd-....dump"
Write-Host ""
