#!/bin/sh
# ==========================================
# Arranque del contenedor en Render
# ==========================================

set -e

# Render asigna el puerto por la variable PORT y espera que el servicio escuche
# ahi. El Caddyfile de FrankenPHP lee SERVER_NAME, asi que se traduce una en la
# otra. Sin esto el servicio arranca bien y Render lo mata por "no abre puerto".
export SERVER_NAME=":${PORT:-8080}"

# Las cachés se generan AL ARRANCAR, no al construir la imagen: en el build
# todavia no existen las variables de entorno de Render, asi que un
# config:cache en el Dockerfile congelaria valores vacios (empezando por
# DB_PASSWORD) y el contenedor arrancaria sin poder conectar a la base.
php artisan config:cache
php artisan route:cache
php artisan event:cache

# Las migraciones NO se ejecutan aqui a proposito. Con varias instancias, cada
# una lanzaria las suyas a la vez; y un despliegue que migra solo convierte
# cualquier error de esquema en caida del servicio. Se lanzan a mano:
#   php artisan migrate --env=neon --force

exec frankenphp run --config /etc/caddy/Caddyfile
