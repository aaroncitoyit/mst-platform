-- ==========================================
-- MTS Platform - Catalogo de productos del cliente
-- 013: products
--
-- Un "producto" es una CATEGORIA vendible (Tazas de color, Llaveros, Polos
-- sublimados), no un diseño concreto. Los diseños son sus imagenes, en la tabla
-- media que ya existe desde el Sprint 1.
--
-- ESTA TABLA SI LLEVA RLS: son datos del inquilino, no apuntes de Macedo Tech.
-- Ojo con no confundirla con client_services u opportunities, que llevan
-- company_id pero NO llevan RLS porque son la cartera interna de Macedo Tech.
-- Ver CLAUDE.md.
-- ==========================================

CREATE TABLE products (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    -- Codigo interno del cliente. Opcional: muchos negocios pequeños no usan.
    sku               VARCHAR(60),

    -- LA DIRECCION WEB. Se genera una vez al crear el producto y NO cambia
    -- nunca sola: renombrar el producto no la toca. Cambiarla es una accion
    -- explicita que ademas debe dejar una redireccion, porque un 404 es la
    -- unica forma de perder de golpe el posicionamiento de una pagina.
    slug              VARCHAR(150) NOT NULL,

    name              VARCHAR(150) NOT NULL,
    description       TEXT,
    price             NUMERIC(10,2) NOT NULL DEFAULT 0,

    -- SEO. Se rellenan solos a partir del nombre y la descripcion, pero el
    -- cliente puede afinarlos. Nunca deben quedar vacios.
    meta_title        VARCHAR(200),
    meta_description  VARCHAR(300),

    -- Oculto = fuera del catalogo y del sitemap, y su URL redirige.
    -- No se borra la fila: si vuelve a mostrarlo, recupera su misma direccion.
    is_active         BOOLEAN NOT NULL DEFAULT true,
    position          INTEGER NOT NULL DEFAULT 0,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (company_id, slug)
);

CREATE INDEX idx_products_company ON products(company_id);
-- El catalogo publico solo pide los activos, ordenados
CREATE INDEX idx_products_publico ON products(company_id, position) WHERE is_active;
-- El SKU es opcional, pero si existe no puede repetirse dentro de una empresa
CREATE UNIQUE INDEX idx_products_sku ON products(company_id, sku) WHERE sku IS NOT NULL;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
    USING (company_id = current_company_id());

-- ------------------------------------------
-- Texto alternativo de las imagenes
-- ------------------------------------------
-- media ya existe (Sprint 1) y sirve tal cual para las galerias de diseños:
-- varias filas por producto via model_type/model_id. Solo le falta el texto
-- alternativo, que es accesibilidad y SEO a la vez.
ALTER TABLE media ADD COLUMN IF NOT EXISTS alt_text VARCHAR(200);

-- Orden dentro de la galeria, y cual es la imagen principal (position = 0)
ALTER TABLE media ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_media_modelo_orden
    ON media(model_type, model_id, position);

-- ------------------------------------------
-- Generador de slug
-- ------------------------------------------
-- Se usa SOLO al crear el producto. Convierte "Tazas de color" en
-- "tazas-de-color", quita tildes y, si ya existe en esa empresa, añade un
-- sufijo numerico en vez de fallar.
CREATE OR REPLACE FUNCTION generar_slug_producto(p_company_id UUID, p_nombre TEXT)
RETURNS VARCHAR AS $$
DECLARE
    base       TEXT;
    candidato  TEXT;
    sufijo     INTEGER := 1;
BEGIN
    -- unaccent no esta disponible por defecto, asi que se traducen las vocales
    -- acentuadas y la eñe a mano: es lo unico que aparece en español.
    base := lower(translate(p_nombre,
                            'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ',
                            'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN'));
    base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
    base := trim(both '-' from base);

    IF base = '' THEN
        base := 'producto';
    END IF;

    candidato := base;

    WHILE EXISTS (
        SELECT 1 FROM products
        WHERE company_id = p_company_id AND slug = candidato
    ) LOOP
        sufijo := sufijo + 1;
        candidato := base || '-' || sufijo;
    END LOOP;

    RETURN candidato;
END;
$$ LANGUAGE plpgsql;

GRANT SELECT, INSERT, UPDATE, DELETE ON products TO mts_app;
GRANT EXECUTE ON FUNCTION generar_slug_producto(UUID, TEXT) TO mts_app;
