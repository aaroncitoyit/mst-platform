#!/bin/sh
# ==========================================
# MTS Platform - Respaldo de la base de datos y las imagenes
#
# Respalda DOS cosas, porque perder cualquiera de las dos es igual de grave:
#   - la base de datos (clientes, productos, cotizaciones, cartera)
#   - los archivos subidos (fotos de producto), que NO estan en la base
#
# USO (desde la raiz del proyecto)
#   export PGHOST=... PGPORT=5432 PGDATABASE=mts_platform PGUSER=... PGPASSWORD=...
#   ./database/backup.sh
#
# OPCIONES
#   --destino RUTA   Donde guardar. Por defecto ./backups
#   --dias N         Cuantos dias conservar EN LOCAL. Por defecto 14
#   --remoto         Ademas, sube el volcado a Cloudflare R2 (ver abajo)
#
# COMO SE PROGRAMA EN PRODUCCION
#   Cloud Run NO tiene cron: los contenedores se levantan bajo demanda y se
#   apagan, asi que no hay ningun proceso vivo que ejecute un crontab. Este
#   script corre como Cloud Run Job, disparado por Cloud Scheduler.
#   Se monta con deploy/respaldo/programar.ps1.
#
# AVISO IMPORTANTE: un respaldo que vive en el mismo sitio que los datos NO es
# un respaldo. Por eso existe --remoto: copia el volcado a R2, que es otro
# proveedor distinto de Neon. Si la copia se quedara dentro de Neon, un problema
# con la cuenta se llevaria por delante los datos y el respaldo a la vez.
# ==========================================

set -eu

DESTINO="./backups"
DIAS=14
REMOTO=0

while [ $# -gt 0 ]; do
    case "$1" in
        --destino) DESTINO="$2"; shift 2 ;;
        --dias)    DIAS="$2"; shift 2 ;;
        --remoto)  REMOTO=1; shift ;;
        -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
        *) echo "Opcion desconocida: $1" >&2; exit 1 ;;
    esac
done

# Se comprueba ANTES de volcar nada: descubrir que falta una variable despues
# de dos minutos de pg_dump es tirar el trabajo y, en un Job programado, no
# enterarse hasta que haga falta restaurar.
if [ "$REMOTO" -eq 1 ]; then
    : "${R2_BUCKET:?Falta R2_BUCKET. Con --remoto hacen falta las variables de R2.}"
    command -v rclone >/dev/null 2>&1 || { echo "No se encontro rclone." >&2; exit 1; }
fi

RAIZ=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$RAIZ"

: "${PGDATABASE:?Falta PGDATABASE. Exporta las variables de conexion antes de ejecutar.}"

command -v pg_dump >/dev/null 2>&1 || { echo "No se encontro pg_dump." >&2; exit 1; }

mkdir -p "$DESTINO"

MARCA=$(date +%Y%m%d-%H%M%S)
ARCHIVO_BD="$DESTINO/mts-bd-$MARCA.dump"
ARCHIVO_IMG="$DESTINO/mts-imagenes-$MARCA.tar.gz"

# ------------------------------------------
# Base de datos
# ------------------------------------------
# Formato custom (-Fc): comprimido y restaurable con pg_restore de forma
# selectiva (una tabla suelta, por ejemplo). Un .sql plano solo se puede
# restaurar entero.
echo "Respaldando la base $PGDATABASE ..."
pg_dump -Fc -f "$ARCHIVO_BD"

# ------------------------------------------
# Imagenes
# ------------------------------------------
# Las fotos de producto NO estan en la base: solo se guarda su ruta. Sin este
# paso, restaurar la base dejaria un catalogo con todas las imagenes rotas.
IMAGENES="backend/storage/app/public"

# CUIDADO CON EL FALLO SILENCIOSO: el dia que las imagenes se muden a
# almacenamiento de objetos (R2, S3, Supabase), esta carpeta quedara vacia y un
# tar a secas seguiria creando un archivo y diciendo "correcto" — respaldando
# nada, todos los dias, sin que nadie se entere hasta que haga falta restaurar.
# Por eso se cuenta lo que hay antes de empaquetar.
if [ -d "$IMAGENES" ]; then
    CUANTAS=$(find "$IMAGENES" -type f ! -name '.gitignore' 2>/dev/null | wc -l)
else
    CUANTAS=0
fi

if [ "$CUANTAS" -gt 0 ]; then
    echo "Respaldando $CUANTAS imagenes ..."
    tar -czf "$ARCHIVO_IMG" -C "$IMAGENES" .
else
    echo ""
    echo "AVISO: no hay imagenes en $IMAGENES."
    echo "  Es lo esperado en produccion: desde la mudanza a Cloudflare R2"
    echo "  (MTS_MEDIA_DISK=r2) las fotos ya no estan en disco, y este script"
    echo "  NO las respalda."
    echo ""
    echo "  Y R2 NO TIENE VERSIONADO: PutBucketVersioning responde 501, y en el"
    echo "  panel no existe la opcion. No lo busques. Un borrado en el bucket"
    echo "  es definitivo."
    echo ""
    echo "  No es grave, y el motivo importa: las fotos vienen de archivos que"
    echo "  siguen existiendo fuera de R2, y reimportarlas es un comando"
    echo "  (mts:importar-catalogo). La base de datos SI queda respaldada, que"
    echo "  es lo irreemplazable: una cotizacion perdida no se vuelve a subir."
    echo ""
fi

# ------------------------------------------
# Comprobacion: un respaldo que no se verifica no es un respaldo
# ------------------------------------------
TAMANO=$(wc -c < "$ARCHIVO_BD")

if [ "$TAMANO" -lt 10000 ]; then
    echo "ERROR: el respaldo pesa $TAMANO bytes. Demasiado poco: algo fallo." >&2
    exit 1
fi

# pg_restore -l lista el contenido sin restaurar nada. Si el archivo esta
# corrupto, falla aqui y no dentro de seis meses cuando haga falta de verdad.
pg_restore -l "$ARCHIVO_BD" > /dev/null || {
    echo "ERROR: el archivo de respaldo esta corrupto." >&2
    exit 1
}

# ------------------------------------------
# Copia fuera del proveedor
# ------------------------------------------
# Se sube DESPUES de verificar: subir un archivo corrupto y rotar el bueno del
# dia anterior es peor que no tener respaldo, porque encima da confianza.
#
# rclone se configura entero por variables de entorno (RCLONE_CONFIG_R2_*), sin
# archivo de configuracion: en un Cloud Run Job no hay disco donde dejarlo, y
# los secretos llegan de Secret Manager.
if [ "$REMOTO" -eq 1 ]; then
    PREFIJO="${R2_PREFIJO_RESPALDOS:-respaldos}"
    echo "Subiendo a R2 ($R2_BUCKET/$PREFIJO) ..."

    rclone copy "$ARCHIVO_BD" "r2:$R2_BUCKET/$PREFIJO/"

    # Comprobar que llego, y con el mismo tamano. Un "rclone copy" que termina
    # con codigo 0 sobre credenciales de solo lectura seria el fallo silencioso
    # que este script existe para evitar.
    NOMBRE=$(basename "$ARCHIVO_BD")
    TAMANO_REMOTO=$(rclone size --json "r2:$R2_BUCKET/$PREFIJO/$NOMBRE" 2>/dev/null \
        | sed -n 's/.*"bytes":[[:space:]]*\([0-9]*\).*/\1/p')

    if [ "${TAMANO_REMOTO:-0}" != "$TAMANO" ]; then
        echo "ERROR: en R2 hay ${TAMANO_REMOTO:-0} bytes y en local $TAMANO. La copia remota NO es valida." >&2
        exit 1
    fi

    echo "  verificado en remoto: $NOMBRE ($TAMANO bytes)"

    # Rotacion remota. Se hace aqui y no con una regla de ciclo de vida del
    # bucket porque esa regla borraria tambien las fotos de producto, que estan
    # en el mismo bucket y no caducan nunca.
    #
    # Si falla NO se aborta (el respaldo ya esta hecho y verificado, que es lo
    # importante), pero se avisa a gritos: un fallo silencioso aqui hace crecer
    # el bucket todos los dias hasta salirse del plan gratuito de R2, y no se
    # notaria hasta que llegue una factura.
    if ! rclone delete "r2:$R2_BUCKET/$PREFIJO/" --min-age "${DIAS}d" --include 'mts-bd-*.dump'; then
        echo "" >&2
        echo "AVISO: fallo la rotacion remota. Los respaldos viejos NO se han borrado." >&2
        echo "  El respaldo de hoy SI esta guardado y verificado." >&2
        echo "  Si esto se repite, el bucket crece sin limite. Revisa a mano." >&2
        echo "" >&2
    fi

    # Se cuenta lo que queda: es la forma de que el crecimiento se vea en el
    # registro de cada ejecucion, en vez de descubrirlo en la factura.
    GUARDADOS=$(rclone lsf "r2:$R2_BUCKET/$PREFIJO/" --include 'mts-bd-*.dump' 2>/dev/null | wc -l)
    OCUPADO=$(rclone size --json "r2:$R2_BUCKET/$PREFIJO/" 2>/dev/null \
        | sed -n 's/.*"bytes":[[:space:]]*\([0-9]*\).*/\1/p')

    echo "  respaldos en R2: ${GUARDADOS:-?} archivos, ${OCUPADO:-?} bytes (conservando $DIAS dias)"
fi

# ------------------------------------------
# Rotacion local
# ------------------------------------------
find "$DESTINO" -name 'mts-bd-*.dump' -mtime "+$DIAS" -delete 2>/dev/null || true
find "$DESTINO" -name 'mts-imagenes-*.tar.gz' -mtime "+$DIAS" -delete 2>/dev/null || true

echo ""
echo "Respaldo correcto:"
ls -lh "$ARCHIVO_BD" 2>/dev/null | awk '{print "  " $9 "  " $5}'
[ -f "$ARCHIVO_IMG" ] && ls -lh "$ARCHIVO_IMG" | awk '{print "  " $9 "  " $5}'
echo ""
echo "Se conservan $DIAS dias. Para restaurar:"
echo "  pg_restore -d mts_platform --clean --if-exists $ARCHIVO_BD"
