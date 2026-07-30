-- ==========================================
-- MTS Platform - Back-office
-- Catalogo de planes y los modulos que incluye cada uno
--
-- OJO: los PRECIOS son un marcador de posicion (0.00). Definir la oferta
-- comercial es una decision de negocio, no tecnica. Ajustalos antes de
-- vender nada, con:
--   UPDATE plans SET price = 149.00 WHERE slug = 'profesional';
-- ==========================================

-- Starter ya existe desde el seeder 001; los otros dos son nuevos.
INSERT INTO plans (name, slug, price, billing_period) VALUES
    ('Profesional', 'profesional', 0, 'monthly'),
    ('Empresarial', 'empresarial', 0, 'monthly')
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------
-- Que modulos incluye cada plan
-- ------------------------------------------
-- Starter      -> CMS
-- Profesional  -> CMS + CRM
-- Empresarial  -> CMS + CRM + ERP + IA

INSERT INTO plan_modules (plan_id, module_id)
SELECT p.id, m.id
FROM plans p
JOIN modules m ON m.slug = ANY (
    CASE p.slug
        WHEN 'starter'     THEN ARRAY['cms']
        WHEN 'profesional' THEN ARRAY['cms', 'crm']
        WHEN 'empresarial' THEN ARRAY['cms', 'crm', 'erp', 'ai']
        ELSE ARRAY[]::text[]
    END
)
ON CONFLICT (plan_id, module_id) DO NOTHING;
