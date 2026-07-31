# ==========================================
# MTS Platform - Backend (Laravel 12) para Google Cloud Run
#
# Cloud Run solo sabe ejecutar contenedores: no hay runtime de PHP que elegir.
#
# Se usa FrankenPHP y no nginx + php-fpm + supervisor porque es UN solo
# proceso. En un contenedor, tres procesos vigilados por supervisor significa
# que si php-fpm muere, el contenedor sigue "vivo" sirviendo errores 502 y la
# plataforma no lo reinicia. Con un proceso, si se cae se cae el contenedor y
# Cloud Run levanta otro solo.
#
# EN MODO CLASICO, NO EN MODO WORKER. Es tentador activar el worker de
# FrankenPHP (o Laravel Octane) para quitarse el arranque de Laravel en cada
# peticion, y romperia el aislamiento entre clientes: el contexto de empresa se
# fija con set_config('app.current_company_id', ?, false), que vive en la SESION
# de PostgreSQL. Con el proceso vivo entre peticiones, la empresa de una
# peticion se hereda en la siguiente. Sin error, de forma intermitente, y un
# cliente viendo datos de otro. Ver CLAUDE.md, "SET si, SET LOCAL no".
#
# ------------------------------------------
# Por que dos etapas
# ------------------------------------------
# El peso de la imagen NO es un problema de factura: Artifact Registry cobra por
# bytes comprimidos, y ahi esto ocupa mucho menos de lo que dice "docker images".
# Importa por el ARRANQUE EN FRIO: con --min-instances 0, Cloud Run descarga la
# imagen antes de atender la primera peticion, y eso se nota en el primer clic
# del dia.
#
# La etapa de construccion se queda con composer, ext-zip y todo lo que solo
# hace falta para instalar dependencias. A la imagen final solo viaja el
# resultado.
# ==========================================

# PHP 8.5, la misma version con la que se resolvio composer.lock. No basta con
# el "php": "^8.2" de composer.json: el lock trae Symfony 8, que exige >= 8.4, y
# con una imagen 8.3 el "composer install" aborta. Si algun dia se regenera el
# lock con otra version de PHP, hay que mover las DOS lineas FROM con el.
FROM dunglas/frankenphp:1-php8.5-alpine AS dependencias

# zip solo aqui: composer lo necesita para extraer los paquetes .dist. En la
# imagen final no pinta nada, y ninguna dependencia lo exige en tiempo de
# ejecucion.
RUN install-php-extensions zip

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Las dependencias antes que el codigo: mientras composer.lock no cambie, Docker
# reutiliza esta capa y el despliegue no vuelve a descargar todo el vendor.
COPY composer.json composer.lock ./
RUN composer install \
    --no-dev \
    --no-scripts \
    --no-autoloader \
    --prefer-dist \
    --no-interaction

# ------------------------------------------
# Poda del SDK de AWS
# ------------------------------------------
# aws/aws-sdk-php ocupa 46 MB, y 41 de ellos son src/data: las definiciones de
# la API de 426 servicios de Amazon. Aqui se usa UNO, S3, y solo para hablar con
# Cloudflare R2.
#
# Se conserva 'sts' aunque no se use hoy: es lo que necesitaria la cadena de
# credenciales si algun dia se pasara de claves fijas a roles, y pesa poco.
#
# Solo se borran DIRECTORIOS. Los archivos sueltos de esa carpeta
# (endpoints.json.php, partitions.json.php, manifest.json.php...) los carga el
# SDK siempre, y sin ellos no arranca.
RUN cd vendor/aws/aws-sdk-php/src/data \
    && for servicio in */; do \
        case "${servicio%/}" in \
            s3|sts) ;; \
            *) rm -rf "$servicio" ;; \
        esac; \
    done

COPY . .

# --no-dev: en produccion no viajan ni faker ni phpunit.
RUN composer dump-autoload --optimize --no-dev --classmap-authoritative


# ==========================================
# Imagen final
# ==========================================
FROM dunglas/frankenphp:1-php8.5-alpine

# Solo lo imprescindible en ejecucion:
#   pdo_pgsql - hablar con Neon. Sin esto no arranca nada.
#   opcache   - evita recompilar el codigo en cada peticion; en un plan pequeno
#               se nota mucho.
#
# NO se instalan intl, zip ni gd. Se comprobo el 30/07/2026: ninguna linea del
# codigo las usa y ninguna dependencia las exige (de intl se encargan los
# paquetes symfony/polyfill-intl-*, que existen justo para eso). gd estaba
# "para redimensionar fotos de producto", pero no hay ni una linea que
# redimensione nada. Si algun dia se anade ese redimensionado, gd vuelve aqui.
RUN install-php-extensions \
    pdo_pgsql \
    opcache

WORKDIR /app

# Ya con las dependencias instaladas, podadas y el autoload optimizado.
# Composer y ext-zip se quedan en la etapa anterior.
COPY --from=dependencias /app /app

# opcache en modo produccion: no comprueba si los archivos cambiaron, porque en
# un contenedor no cambian nunca. Un redespliegue es una imagen nueva.
RUN { \
    echo 'opcache.enable=1'; \
    echo 'opcache.validate_timestamps=0'; \
    echo 'opcache.memory_consumption=128'; \
    echo 'opcache.max_accelerated_files=20000'; \
    } > /usr/local/etc/php/conf.d/opcache.ini

RUN chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R ug+rw storage bootstrap/cache

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Cloud Run inyecta PORT y espera que el contenedor escuche ahi. 8080 es el
# valor que pone por defecto; el entrypoint lo respeta si viene otro.
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["docker-entrypoint.sh"]
