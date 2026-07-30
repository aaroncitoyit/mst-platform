-- ==========================================
-- MTS Platform - Claves de API
-- 014: company_api_keys
--
-- Es la forma de que la web de un cliente se identifique ante MTS SIN usuario
-- logueado. La clave sustituye al usuario como manera de saber de que inquilino
-- viene la peticion; el aislamiento no cambia: el middleware fija el mismo
-- contexto RLS que fijaria EnsureCompanyContext.
--
-- La clave se guarda HASHEADA. Se muestra en claro una sola vez, al crearla.
-- Se usa SHA-256 y no bcrypt a proposito: bcrypt genera un hash distinto cada
-- vez, asi que no se puede buscar por el. Aqui hace falta poder localizar la
-- fila a partir de la clave que llega en la cabecera.
-- ==========================================

CREATE TABLE company_api_keys (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    -- Para que el cliente reconozca cual es sin verla entera: "mts_live_a1b2..."
    name          VARCHAR(100) NOT NULL,
    key_prefix    VARCHAR(20) NOT NULL,
    key_hash      CHAR(64) NOT NULL UNIQUE,

    -- Dominios autorizados, separados por comas. NULL = cualquiera.
    -- Es una barrera debil (la cabecera Origin la pone el navegador y se puede
    -- falsificar), pero acota el abuso casual. Lo que de verdad limita el daño
    -- es que esta clave SOLO puede leer el catalogo y crear cotizaciones.
    allowed_origins TEXT,

    last_used_at  TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_company ON company_api_keys(company_id);
-- La busqueda de cada peticion publica: por hash y sin revocar
CREATE INDEX idx_api_keys_vigentes ON company_api_keys(key_hash) WHERE revoked_at IS NULL;

ALTER TABLE company_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON company_api_keys
    USING (company_id = current_company_id());

-- ------------------------------------------
-- Resolver una clave sin contexto de empresa
-- ------------------------------------------
-- Problema del huevo y la gallina: para fijar el contexto hay que saber de que
-- empresa es la clave, pero la tabla lleva RLS y sin contexto no devuelve nada.
--
-- Igual que get_user_companies() en el login, esta funcion es SECURITY DEFINER.
-- Solo devuelve el company_id de una clave vigente: no expone ningun dato.
CREATE OR REPLACE FUNCTION resolver_api_key(p_hash CHAR(64))
RETURNS UUID
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE company_api_keys
    SET last_used_at = now()
    WHERE key_hash = p_hash
      AND revoked_at IS NULL
    RETURNING company_id;
$$ LANGUAGE sql;

GRANT SELECT, INSERT, UPDATE, DELETE ON company_api_keys TO mts_app;
GRANT EXECUTE ON FUNCTION resolver_api_key(CHAR) TO mts_app;
