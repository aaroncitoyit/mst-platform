-- ==========================================
-- MTS Platform - Cartera de clientes de Macedo Tech
-- 012: Servicios contratados, oportunidades y notas
--
-- ATENCION - ESTAS TABLAS NO LLEVAN RLS, Y ES A PROPOSITO.
--
-- Rompen la regla que rige en el resto del sistema ("toda tabla con company_id
-- lleva la politica tenant_isolation"), porque company_id aqui significa otra
-- cosa:
--
--   En las tablas del Core, company_id = "de que inquilino son estos datos".
--   En estas,               company_id = "sobre que cliente trata esta ficha".
--
-- El dueño de la fila es SIEMPRE Macedo Tech, no el cliente. Son los apuntes
-- internos de Aaron sobre su cartera: cuanto le cobra a cada uno, que le vence
-- y que mas puede ofrecerle. El cliente no deberia verlos nunca.
--
-- Si se les pusiera RLS, el panel no podria preguntar "todos los vencimientos
-- de este mes" sin otra funcion SECURITY DEFINER, y peor: al olvidar fijar el
-- contexto devolveria cero filas EN SILENCIO, sin ningun error.
--
-- Su unica proteccion es el middleware platform.admin de las rutas /api/admin/*,
-- el mismo modelo de confianza que admin_list_companies().
-- ==========================================

-- ------------------------------------------
-- Catalogo de lo que vende Macedo Tech
-- ------------------------------------------
CREATE TABLE services (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    VARCHAR(150) NOT NULL,
    slug                    VARCHAR(150) NOT NULL UNIQUE,
    description             TEXT,
    -- Precio de referencia. El acordado con cada cliente vive en client_services
    -- y puede ser distinto.
    default_price           NUMERIC(10,2) NOT NULL DEFAULT 0,
    default_billing_period  VARCHAR(20) NOT NULL DEFAULT 'monthly', -- monthly | yearly | one_time
    is_active               BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------
-- Que tiene contratado cada cliente
-- ------------------------------------------
CREATE TABLE client_services (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    service_id       UUID NOT NULL REFERENCES services(id),
    -- Precio realmente acordado con este cliente
    price            NUMERIC(10,2) NOT NULL DEFAULT 0,
    billing_period   VARCHAR(20) NOT NULL DEFAULT 'monthly', -- monthly | yearly | one_time
    status           VARCHAR(20) NOT NULL DEFAULT 'activo',  -- activo | pausado | terminado
    started_on       DATE,
    -- La columna que hace ganar dinero: los mantenimientos que se olvidan de
    -- cobrar y los dominios que caducan sin avisar son perdida directa.
    -- NULL en los servicios de pago unico: no vencen nunca.
    next_renewal_on  DATE,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_services_company ON client_services(company_id);
-- Indice para la consulta del panel: "que vence en los proximos 30 dias"
CREATE INDEX idx_client_services_renewal
    ON client_services(next_renewal_on)
    WHERE status = 'activo' AND next_renewal_on IS NOT NULL;

-- ------------------------------------------
-- Que mas le puedo ofrecer a cada cliente
-- ------------------------------------------
CREATE TABLE opportunities (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title            VARCHAR(200) NOT NULL,
    description      TEXT,
    estimated_value  NUMERIC(10,2),
    status           VARCHAR(20) NOT NULL DEFAULT 'idea', -- idea | propuesta | ganada | perdida
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_opportunities_company ON opportunities(company_id);
CREATE INDEX idx_opportunities_abiertas ON opportunities(status) WHERE status IN ('idea', 'propuesta');

-- ------------------------------------------
-- Historial de contacto con el cliente
-- ------------------------------------------
CREATE TABLE client_notes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id),
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_notes_company ON client_notes(company_id, created_at DESC);

-- ------------------------------------------
-- Permisos para el rol de la aplicacion
-- ------------------------------------------
-- 006_app_role.sql ya dejo configurados los privilegios por defecto para las
-- tablas futuras, pero se conceden aqui de forma explicita por si este script
-- se aplica sobre una base donde aquel corrio antes.
GRANT SELECT, INSERT, UPDATE, DELETE ON services, client_services, opportunities, client_notes TO mts_app;
