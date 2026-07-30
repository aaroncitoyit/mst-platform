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
#   --dias N         Cuantos dias conservar. Por defecto 14
#
# EN EL SERVIDOR, programarlo a diario:
#   0 3 * * *  cd /ruta/mts-platform && ./database/backup.sh >> /var/log/mts-backup.log 2>&1
#
# AVISO IMPORTANTE: un respaldo que vive en el mismo servidor que los datos NO
# es un respaldo. Si el disco muere, se van los dos. Cuando esto este en
# produccion, hay que copiar la carpeta a otro sitio (S3, R2, otro servidor).
# ==========================================

set -eu

DESTINO="./backups"
DIAS=14

while [ $# -gt 0 ]; do
    case "$1" in
        --destino) DESTINO="$2"; shift 2 ;;
        --dias)    DIAS="$2"; shift 2 ;;
        -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
        *) echo "Opcion desconocida: $1" >&2; exit 1 ;;
    esac
done

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
    echo "  Si ya se sirven desde almacenamiento de objetos (R2, S3, Supabase),"
    echo "  este script NO las respalda. Protegelas alli:"
    echo "    - activa el versionado del bucket (cubre borrados y sobrescrituras)"
    echo "    - o sincronizalas a otro sitio con rclone"
    echo "  La base de datos SI queda respaldada, que es lo irreemplazable:"
    echo "  las fotos se pueden volver a subir, una cotizacion perdida no."
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
# Rotacion
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
