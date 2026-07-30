-- ==========================================
-- MTS Platform - Back-office
-- 011: Pone al dia las empresas creadas antes de que existieran los planes
--
-- Hasta ahora el alta activaba TODOS los modulos y no creaba ninguna
-- suscripcion. Este script le asigna a cada empresa sin suscripcion el plan
-- Empresarial, que es el que incluye los 4 modulos: asi nadie pierde acceso
-- a nada de lo que ya tenia.
--
-- Se ejecuta como mts_user (superusuario), que ignora RLS y por tanto ve
-- todas las empresas. No intentes correrlo con mts_app.
-- ==========================================

INSERT INTO subscriptions (company_id, plan_id, status)
SELECT c.id, p.id, 'active'
FROM companies c
CROSS JOIN plans p
WHERE p.slug = 'empresarial'
  AND NOT EXISTS (
      SELECT 1 FROM subscriptions s WHERE s.company_id = c.id
  );

-- Alinea los modulos con el plan recien asignado. Para estas empresas no
-- cambia nada (ya tenian los 4), pero deja el estado coherente con
-- plan_modules, que es lo que a partir de ahora manda.
DO $$
DECLARE
    company RECORD;
BEGIN
    FOR company IN
        SELECT s.company_id, s.plan_id
        FROM subscriptions s
        WHERE s.status = 'active'
    LOOP
        PERFORM sync_company_modules(company.company_id, company.plan_id);
    END LOOP;
END $$;
