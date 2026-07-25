-- ==========================================
-- MTS Platform - Sprint 1
-- Datos iniciales del Core
-- ==========================================

-- Monedas
INSERT INTO currencies (name, code, symbol) VALUES
    ('Sol peruano', 'PEN', 'S/'),
    ('Dolar estadounidense', 'USD', '$');

-- Paises (ejemplo minimo, se amplia segun necesidad)
INSERT INTO countries (name, iso_code, phone_code) VALUES
    ('Peru', 'PE', '+51'),
    ('Estados Unidos', 'US', '+1');

-- Modulos del ecosistema
INSERT INTO modules (name, slug, description) VALUES
    ('MTS CMS', 'cms', 'Gestion de sitios web administrables'),
    ('MTS CRM', 'crm', 'Gestion comercial: clientes, leads, oportunidades'),
    ('MTS ERP', 'erp', 'Gestion empresarial: inventario, compras, ventas'),
    ('MTS AI', 'ai', 'Inteligencia artificial transversal');

-- Plan inicial de ejemplo
INSERT INTO plans (name, slug, price, billing_period) VALUES
    ('Starter', 'starter', 0, 'monthly');

-- Roles base globales (company_id NULL = catalogo MTS, protegidos con is_system)
INSERT INTO roles (company_id, name, is_system) VALUES
    (NULL, 'Administrador', true),
    (NULL, 'Supervisor', true),
    (NULL, 'Vendedor', true),
    (NULL, 'Empleado', true);

-- Permisos base del Core (no ligados a un modulo especifico)
INSERT INTO permissions (name, module_id) VALUES
    ('crear_usuario', NULL),
    ('editar_usuario', NULL),
    ('eliminar_usuario', NULL),
    ('ver_reportes', NULL),
    ('gestionar_configuracion', NULL);

-- El rol Administrador global obtiene todos los permisos del Core
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Administrador' AND r.company_id IS NULL;
