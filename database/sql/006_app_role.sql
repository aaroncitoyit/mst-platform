-- ==========================================
-- MTS Platform - Sprint 1
-- 006: Rol de aplicacion (sin privilegios de superusuario)
--
-- mts_user (el usuario definido en .env) es superuser por defecto en la
-- imagen oficial de postgres, y los superusers ignoran RLS siempre.
-- Este rol nuevo es el que Laravel debe usar en su conexion (Sprint 2),
-- para que las politicas RLS de 005_rls_policies.sql se respeten de verdad.
--
-- La contrasena llega por variable (-v app_password=...), nunca escrita aqui:
-- el repositorio es publico.
-- ==========================================

-- Los roles son de ambito de CLUSTER, no de base de datos. Si en el mismo
-- servidor ya hay otra base de MTS, el rol ya existira y un CREATE ROLE pelado
-- fallaria. Por eso se crea solo si falta, y en ambos casos se fijan los
-- atributos: NOSUPERUSER y NOBYPASSRLS son lo que hace que RLS se le aplique de
-- verdad, y no pueden quedar al azar.
-- La contrasena pasa por una variable de sesion porque psql NO sustituye sus
-- variables (:'app_password') dentro de un bloque $$ ... $$. Es de sesion, asi
-- que desaparece al cerrar la conexion.
-- La salida se descarta: si no, psql imprimiria la contrasena en pantalla y
-- quedaria en el historial de la terminal o en los logs del despliegue.
\o /dev/null
SELECT set_config('mts.app_password', :'app_password', false);
\o

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mts_app') THEN
        -- El ALTER no menciona NOSUPERUSER ni NOBYPASSRLS a proposito.
        -- PostgreSQL exige ser superusuario para tocar esos atributos, AUNQUE
        -- sea para dejarlos como ya estan, y el rol administrador de una base
        -- gestionada (Neon, RDS, Railway) nunca es superusuario. Mencionarlos
        -- aqui rompia la instalacion en cualquier proveedor gestionado.
        -- La garantia sigue estando: el CREATE de abajo los fija al nacer, y la
        -- verificacion final de install.sh aborta si mts_app los tuviera.
        EXECUTE format('ALTER ROLE mts_app WITH LOGIN PASSWORD %L',
                       current_setting('mts.app_password'));
    ELSE
        EXECUTE format('CREATE ROLE mts_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L',
                       current_setting('mts.app_password'));
    END IF;
END $$;

-- El nombre de la base llega por variable (-v db_name=...) porque en el
-- servidor no tiene por que llamarse igual que en local.
GRANT CONNECT ON DATABASE :"db_name" TO mts_app;

-- CREATE, y no solo USAGE: desde PostgreSQL 15 el esquema public ya no concede
-- CREATE a todo el mundo, y las migraciones de Laravel corren como mts_app
-- (crean migrations, sessions, cache, jobs y personal_access_tokens). Sin esto,
-- "php artisan migrate --force" falla con "permission denied for schema public".
-- No debilita el aislamiento: mts_app sigue siendo NOSUPERUSER NOBYPASSRLS, que
-- es lo unico que decide si las politicas RLS se le aplican.
GRANT USAGE, CREATE ON SCHEMA public TO mts_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mts_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mts_app;

-- Para que las tablas que se creen despues (Sprint 2+) hereden los mismos permisos
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mts_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO mts_app;
