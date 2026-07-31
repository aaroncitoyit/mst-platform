#!/bin/sh
# ==========================================
# Arranque del contenedor en Google Cloud Run
# ==========================================

set -e

# Cloud Run asigna el puerto por la variable PORT y mata el contenedor si nadie
# escucha ahi dentro del plazo de arranque. El Caddyfile de FrankenPHP no lee
# PORT: lee SERVER_NAME, asi que se traduce una en la otra. Sin esta linea el
# servicio arranca sin errores y Cloud Run lo tumba por "no abre puerto".
export SERVER_NAME=":${PORT:-8080}"

# Las cachés se generan AL ARRANCAR, no al construir la imagen: en el build
# todavia no existen las variables de entorno ni los secretos de Cloud Run, asi
# que un config:cache en el Dockerfile congelaria valores vacios (empezando por
# DB_PASSWORD) y el contenedor arrancaria sin poder conectar a la base.
php artisan config:cache
php artisan route:cache
php artisan event:cache

# Las migraciones NO se ejecutan aqui a proposito, y en Cloud Run importa mas
# que en ningun sitio: cada instancia que arranca ejecutaria las suyas a la vez,
# y Cloud Run arranca instancias solo. Ademas, un despliegue que migra convierte
# cualquier error de esquema en caida del servicio. Se lanzan a mano:
#   php artisan migrate --env=neon --force

exec frankenphp run --config /etc/caddy/Caddyfile
