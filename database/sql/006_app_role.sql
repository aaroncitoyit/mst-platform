-- ==========================================
-- MTS Platform - Sprint 1
-- 006: Rol de aplicacion (sin privilegios de superusuario)
--
-- mts_user (el usuario definido en .env) es superuser por defecto en la
-- imagen oficial de postgres, y los superusers ignoran RLS siempre.
-- Este rol nuevo es el que Laravel debe usar en su conexion (Sprint 2),
-- para que las politicas RLS de 005_rls_policies.sql se respeten de verdad.
--
-- Cambia 'change_me_app' por una contraseña real antes de usar en produccion.
-- ==========================================

CREATE ROLE mts_app WITH LOGIN PASSWORD :'app_password' NOSUPERUSER NOBYPASSRLS;

GRANT CONNECT ON DATABASE mts_platform TO mts_app;
GRANT USAGE ON SCHEMA public TO mts_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mts_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mts_app;

-- Para que las tablas que se creen despues (Sprint 2+) hereden los mismos permisos
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mts_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO mts_app;
