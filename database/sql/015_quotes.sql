-- ==========================================
-- MTS Platform - Cotizaciones del cliente
-- 015: quote_requests y quote_request_items
--
-- Es la pieza que conecta la web del cliente con su panel: el visitante marca
-- "ME INTERESA ESTE", la web llama a POST /api/public/cotizaciones, y aqui se
-- registra que pidio (producto + diseno) con el precio congelado en el momento.
-- El asesor pone las cantidades en el panel, se genera el enlace publico, y el
-- cliente final lo abre en /c/{token}.
--
-- AMBAS TABLAS LLEVAN RLS: son datos del inquilino, no apuntes de Macedo Tech.
-- Ver CLAUDE.md.
-- ==========================================

-- La referencia es un codigo corto para DICTAR por telefono: A7K2. No da
-- acceso a nada. El token del enlace publico si es la credencial: largo y
-- aleatorio, y quien lo tiene ve la cotizacion con sus precios.
CREATE TABLE quote_requests (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    reference     VARCHAR(4) NOT NULL UNIQUE,
    -- Enlace publico de solo lectura. Se genera cuando el asesor completa las
    -- cantidades; NULL mientras la cotizacion sigue en manos del asesor.
    public_token  VARCHAR(64),

    -- nueva -> cotizada (cantidades puestas) -> enviada -> vista -> ganada/perdida
    status        VARCHAR(10) NOT NULL DEFAULT 'nueva'
                  CHECK (status IN ('nueva','cotizada','enviada','vista','ganada','perdida')),

    -- De que pagina de la web llego
    source        VARCHAR(255),

    -- Se rellenan si el asesor lo sabe; la mayoria de las veces llegan vacios
    -- porque quien escribe es el visitante en el WhatsApp, no aqui.
    contact_name  VARCHAR(150),
    contact_phone VARCHAR(30),

    -- Cuando abrio el cliente el enlace publico por primera vez
    viewed_at     TIMESTAMPTZ,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quote_requests_company ON quote_requests(company_id, created_at DESC);
-- El token solo existe cuando el enlace ya se genero
CREATE UNIQUE INDEX idx_quote_requests_token ON quote_requests(public_token) WHERE public_token IS NOT NULL;

CREATE TABLE quote_request_items (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_request_id UUID NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,

    -- Producto que pidio. Si el cliente lo borra luego, la linea se queda:
    -- el historial de la cotizacion no se reescribe (ON DELETE SET NULL).
    product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
    sku              VARCHAR(60),

    -- Nombre congelado: aunque el producto cambie de nombre, la cotizacion
    -- dice lo que pidio el visitante.
    product_name     VARCHAR(150) NOT NULL,

    -- Nula al llegar de la web: la pone el asesor en el panel.
    quantity         INTEGER CHECK (quantity IS NULL OR quantity > 0),

    -- Congelado al crear la cotizacion: si mañana sube el precio, una
    -- cotizacion ya emitida no cambia.
    unit_price       NUMERIC(10,2) NOT NULL DEFAULT 0,

    -- El diseno que despertó el interes ("ME INTERESA ESTE"), de la tabla media
    design_id        UUID REFERENCES media(id) ON DELETE SET NULL,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quote_items_request ON quote_request_items(quote_request_id);

-- ------------------------------------------
-- RLS: datos del inquilino
-- ------------------------------------------
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON quote_requests
    USING (company_id = current_company_id());

ALTER TABLE quote_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_request_items FORCE ROW LEVEL SECURITY;
-- El subselect lee quote_requests con su propio RLS activo, asi que solo ve las
-- lineas de cotizaciones de la empresa actual.
CREATE POLICY tenant_isolation ON quote_request_items
    USING (quote_request_id IN (SELECT id FROM quote_requests));

-- ------------------------------------------
-- Abrir una cotizacion por su token publico
-- ------------------------------------------
-- Problema del huevo y la gallina: para fijar el contexto hay que saber de que
-- empresa es la cotizacion, pero quote_requests lleva RLS y sin contexto no
-- devuelve nada. Igual que resolver_api_key() y get_user_companies(), esta
-- funcion es SECURITY DEFINER.
--
-- Marca viewed_at la primera vez y sube a 'vista' si estaba lista o enviada.
-- Solo existe el token cuando el asesor ya completo las cantidades, asi que el
-- estado 'nueva' nunca llega por aqui.
CREATE OR REPLACE FUNCTION abrir_cotizacion_publica(p_token VARCHAR)
RETURNS SETOF quote_requests
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE quote_requests
    SET viewed_at = COALESCE(viewed_at, now()),
        status = CASE
            WHEN status IN ('cotizada','enviada') THEN 'vista'
            ELSE status
        END,
        updated_at = now()
    WHERE public_token = p_token
    RETURNING *;
$$ LANGUAGE sql;

GRANT SELECT, INSERT, UPDATE, DELETE ON quote_requests TO mts_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON quote_request_items TO mts_app;
GRANT EXECUTE ON FUNCTION abrir_cotizacion_publica(VARCHAR) TO mts_app;
