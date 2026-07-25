-- ==========================================
-- MTS Platform - Sprint 2
-- 007: Adaptar roles/permisos a Spatie Permission (modo "teams")
--
-- Cambio de enfoque: en vez de un catalogo global de roles (company_id NULL),
-- cada empresa recibe su propia copia de los roles base al crearse.
-- Esto encaja de forma nativa con la funcion "teams" de Spatie.
-- ==========================================

-- Los roles globales (company_id NULL) ya no aplican bajo este enfoque
DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE company_id IS NULL);
DELETE FROM roles WHERE company_id IS NULL;

-- A partir de ahora, todo rol pertenece a una empresa
ALTER TABLE roles ALTER COLUMN company_id SET NOT NULL;

-- Spatie espera "role_has_permissions" como nombre de tabla por defecto
ALTER TABLE role_permissions RENAME TO role_has_permissions;

-- model_has_roles debe ser polimorfico (model_type + model_id), no user_id fijo,
-- y llevar el team_foreign_key (company_id) que exige el modo teams de Spatie
DROP TABLE model_has_roles;
CREATE TABLE model_has_roles (
    role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    model_type  VARCHAR(255) NOT NULL,
    model_id    UUID NOT NULL,
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    PRIMARY KEY (company_id, role_id, model_id, model_type)
);
CREATE INDEX idx_model_has_roles_model ON model_has_roles(model_id, model_type);

-- Tabla para permisos asignados directamente a un usuario (sin pasar por un rol)
CREATE TABLE model_has_permissions (
    permission_id  UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    model_type     VARCHAR(255) NOT NULL,
    model_id       UUID NOT NULL,
    company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    PRIMARY KEY (company_id, permission_id, model_id, model_type)
);
CREATE INDEX idx_model_has_permissions_model ON model_has_permissions(model_id, model_type);

-- RLS para las tablas nuevas
ALTER TABLE model_has_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_has_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON model_has_roles
    USING (company_id = current_company_id());

ALTER TABLE model_has_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_has_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON model_has_permissions
    USING (company_id = current_company_id());

-- Funcion reutilizable: clona los roles base para una empresa nueva.
-- Se debe llamar cada vez que se registre una empresa (desde Laravel, en el
-- proceso de alta de compania), y tambien la usamos aqui para el seeder demo.
CREATE OR REPLACE FUNCTION seed_default_roles(p_company_id UUID) RETURNS void AS $$
DECLARE
    admin_role_id UUID;
BEGIN
    INSERT INTO roles (company_id, name, is_system) VALUES
        (p_company_id, 'Administrador', true),
        (p_company_id, 'Supervisor', true),
        (p_company_id, 'Vendedor', true),
        (p_company_id, 'Empleado', true);

    SELECT id INTO admin_role_id
    FROM roles
    WHERE company_id = p_company_id AND name = 'Administrador';

    INSERT INTO role_has_permissions (role_id, permission_id)
    SELECT admin_role_id, id FROM permissions;
END;
$$ LANGUAGE plpgsql;
