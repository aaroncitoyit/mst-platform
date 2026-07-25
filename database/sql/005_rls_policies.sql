-- ==========================================
-- MTS Platform - Sprint 1
-- 005: Politicas RLS (Row Level Security)
--
-- Laravel debe ejecutar, dentro de cada transaccion, antes de cualquier query:
--   SET LOCAL app.current_company_id = '<uuid-de-la-empresa>';
--
-- IMPORTANTE: los "superusers" de PostgreSQL siempre ignoran RLS, sin importar
-- estas politicas. El usuario mts_user (creado via POSTGRES_USER en Docker) es
-- superuser por defecto. Para que RLS realmente se aplique, la aplicacion
-- Laravel debe conectarse con un rol SIN privilegios de superusuario
-- (ver 006_app_role.sql). Usa mts_user solo para tareas administrativas
-- (migraciones, pgAdmin), nunca como conexion de la app en produccion.
-- ==========================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscriptions
    USING (company_id = current_company_id());

ALTER TABLE company_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_modules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON company_modules
    USING (company_id = current_company_id());

ALTER TABLE company_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_user FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON company_user
    USING (company_id = current_company_id());

-- roles: permite ver los globales (company_id NULL) + los propios de la empresa
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON roles
    USING (company_id IS NULL OR company_id = current_company_id());

ALTER TABLE model_has_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_has_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON model_has_roles
    USING (company_id = current_company_id());

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON settings
    USING (company_id = current_company_id());

ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE media FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON media
    USING (company_id = current_company_id());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
    USING (company_id = current_company_id());

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
    USING (company_id = current_company_id());

-- Nota: "companies" y "users" NO llevan RLS por company_id porque son las
-- tablas raiz (una empresa no tiene company_id de si misma, y un usuario
-- puede pertenecer a varias empresas). Su control de acceso se hace via
-- company_user en la capa de aplicacion.
