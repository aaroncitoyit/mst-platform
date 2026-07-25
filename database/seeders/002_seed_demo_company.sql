-- ==========================================
-- MTS Platform - Sprint 2
-- Empresa demo para desarrollo/pruebas, con sus roles base ya clonados
-- ==========================================

DO $$
DECLARE
    new_company_id UUID;
BEGIN
    INSERT INTO companies (name, slug, country_id, currency_id)
    SELECT 'MTS Demo', 'mts-demo', c.id, cur.id
    FROM countries c, currencies cur
    WHERE c.iso_code = 'PE' AND cur.code = 'PEN'
    RETURNING id INTO new_company_id;

    PERFORM seed_default_roles(new_company_id);
END $$;
