# ==========================================
# MTS Platform - Backend (Laravel 12) para Render
#
# Render no tiene runtime de PHP: los servicios PHP van como contenedor.
#
# Se usa FrankenPHP y no nginx + php-fpm + supervisor porque es UN solo
# proceso. En un contenedor, tres procesos vigilados por supervisor significa
# que si php-fpm muere, el contenedor sigue "vivo" sirviendo errores 502 y
# Render no lo reinicia. Con un proceso, si se cae se cae el contenedor y la
# plataforma lo levanta sola.
# ==========================================

# PHP 8.5, la misma version con la que se resolvio composer.lock. No basta con
# el "php": "^8.2" de composer.json: el lock trae Symfony 8, que exige >= 8.4, y
# con una imagen 8.3 el "composer install" aborta. Si algun dia se regenera el
# lock con otra version de PHP, hay que mover esta linea con el.
FROM dunglas/frankenphp:1-php8.5-alpine

# pdo_pgsql es la unica imprescindible (Neon). gd va para el redimensionado de
# fotos de producto; opcache es lo que evita recompilar el codigo en cada
# peticion, y en un plan pequeno se nota.
RUN install-php-extensions \
    pdo_pgsql \
    opcache \
    intl \
    zip \
    gd

WORKDIR /app

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Las dependencias antes que el codigo: mientras composer.lock no cambie, Docker
# reutiliza esta capa y el despliegue no vuelve a descargar todo el vendor.
COPY composer.json composer.lock ./
RUN composer install \
    --no-dev \
    --no-scripts \
    --no-autoloader \
    --prefer-dist \
    --no-interaction

COPY . .

# --no-dev: en produccion no viajan ni faker ni phpunit.
RUN composer dump-autoload --optimize --no-dev --classmap-authoritative

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

ENTRYPOINT ["docker-entrypoint.sh"]
