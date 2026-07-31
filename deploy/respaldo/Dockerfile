# ==========================================
# MTS Platform - Imagen del Cloud Run Job de respaldo
#
# Cloud Run no tiene cron: no hay ningun proceso vivo entre peticiones que
# pueda ejecutar un crontab. El respaldo es por tanto un Job, que Cloud
# Scheduler arranca una vez al dia.
#
# El contexto de construccion es la RAIZ del repositorio, no esta carpeta,
# porque el script que se copia vive en database/. Lo hace programar.ps1.
# ==========================================

# La version tiene que ser IGUAL O MAYOR que la del servidor de Neon: pg_dump
# se niega a volcar una base mas nueva que el ("server version mismatch") y el
# Job fallaria todas las noches. Si subes Neon de version, sube esto tambien.
ARG VERSION_PG=16
FROM postgres:${VERSION_PG}-alpine

# rclone y no aws-cli: es un binario suelto, se configura entero por variables
# de entorno (sin archivo de configuracion que dejar en un disco que no existe)
# y trae la rotacion incorporada con --min-age.
RUN apk add --no-cache rclone

WORKDIR /app

COPY database/backup.sh /app/database/backup.sh
RUN chmod +x /app/database/backup.sh

# /tmp porque el sistema de archivos de Cloud Run es de solo lectura salvo ahi,
# y ademas vive en memoria: por eso el Job pide 1Gi y no 512Mi. El volcado se
# sube a R2 y el contenedor se destruye; nada persiste aqui, que es justo lo que
# se quiere de un respaldo.
# Las opciones van en CMD y no dentro del ENTRYPOINT: el --args de
# "gcloud run jobs deploy" sustituye a CMD, pero se ANADE a un ENTRYPOINT que ya
# lleve argumentos. Con todo junto, cada opcion aparecia dos veces.
ENTRYPOINT ["/app/database/backup.sh"]
CMD ["--remoto", "--destino", "/tmp/respaldos"]
