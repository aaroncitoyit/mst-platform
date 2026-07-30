-- ==========================================
-- MTS Platform - Back-office
-- 010: Administradores de plataforma y relacion plan <-> modulos
-- ==========================================

-- ------------------------------------------
-- Administradores de plataforma (personal de MTS)
-- ------------------------------------------
-- Un booleano y no una tabla aparte: siendo un solo operador no hay
-- granularidad que modelar. Cuando haya personal con roles distintos
-- (soporte vs. comercial), migrar a una tabla platform_admins es trivial.
--
-- Un administrador de plataforma NO pertenece a ninguna empresa: no tiene
-- filas en company_user. Su acceso a los datos de un cliente se hace fijando
-- el contexto de esa empresa, nunca saltandose RLS.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_platform_admin
    ON users(is_platform_admin) WHERE is_platform_admin = true;

-- ------------------------------------------
-- Que modulos incluye cada plan
-- ------------------------------------------
-- Sin RLS: es catalogo global, igual que plans y modules.
-- Es la pieza que faltaba para que el alta de una empresa active solo los
-- modulos contratados en vez de todos.

CREATE TABLE IF NOT EXISTS plan_modules (
    plan_id    UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    module_id  UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, module_id)
);

-- ------------------------------------------
-- Listado de empresas para el back-office
-- ------------------------------------------
-- ATENCION: esta es la UNICA funcion del sistema que cruza empresas.
--
-- Es SECURITY DEFINER porque subscriptions y company_modules llevan RLS y
-- filtran por la empresa del contexto: sin esto, un listado global devolveria
-- cero filas. La autorizacion NO vive aqui, vive en Laravel (middleware
-- platform.admin). Cualquier sitio que llame a esta funcion sin comprobar
-- antes que quien pregunta es administrador de plataforma es un agujero.
--
-- Si algun dia hace falta otra consulta global, revisa si de verdad la
-- necesitas antes de crear una segunda funcion de este tipo.

CREATE OR REPLACE FUNCTION admin_list_companies()
RETURNS TABLE (
    id                  UUID,
    name                VARCHAR,
    slug                VARCHAR,
    is_active           BOOLEAN,
    created_at          TIMESTAMPTZ,
    plan_name           VARCHAR,
    plan_slug           VARCHAR,
    subscription_status VARCHAR,
    modules_count       BIGINT,
    users_count         BIGINT
)
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        c.id,
        c.name,
        c.slug,
        c.is_active,
        c.created_at,
        p.name AS plan_name,
        p.slug AS plan_slug,
        s.status AS subscription_status,
        (SELECT count(*) FROM company_modules cm
          WHERE cm.company_id = c.id AND cm.is_active) AS modules_count,
        (SELECT count(*) FROM company_user cu
          WHERE cu.company_id = c.id) AS users_count
    FROM companies c
    -- La suscripcion vigente: la mas reciente que este activa
    LEFT JOIN LATERAL (
        SELECT sub.plan_id, sub.status
        FROM subscriptions sub
        WHERE sub.company_id = c.id
        ORDER BY (sub.status = 'active') DESC, sub.created_at DESC
        LIMIT 1
    ) s ON true
    LEFT JOIN plans p ON p.id = s.plan_id
    ORDER BY c.created_at DESC;
$$ LANGUAGE sql;

GRANT EXECUTE ON FUNCTION admin_list_companies() TO mts_app;

-- ------------------------------------------
-- Modulos de una empresa segun su plan
-- ------------------------------------------
-- Reemplaza los modulos activos de una empresa por los que incluye el plan
-- indicado. Se usa al dar de alta y al cambiar de plan.
--
-- No es SECURITY DEFINER: opera sobre una sola empresa, asi que funciona con
-- el contexto RLS ya fijado, que es como debe ser.

CREATE OR REPLACE FUNCTION sync_company_modules(p_company_id UUID, p_plan_id UUID)
RETURNS void AS $$
BEGIN
    -- Desactiva lo que el plan nuevo ya no incluye, en vez de borrarlo:
    -- asi no se pierde el historico de activated_at.
    UPDATE company_modules
    SET is_active = false
    WHERE company_id = p_company_id
      AND module_id NOT IN (SELECT module_id FROM plan_modules WHERE plan_id = p_plan_id);

    -- Activa (o reactiva) lo que si incluye
    INSERT INTO company_modules (company_id, module_id, is_active)
    SELECT p_company_id, pm.module_id, true
    FROM plan_modules pm
    JOIN modules m ON m.id = pm.module_id AND m.is_active
    WHERE pm.plan_id = p_plan_id
    ON CONFLICT (company_id, module_id)
    DO UPDATE SET is_active = true;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION sync_company_modules(UUID, UUID) TO mts_app;
