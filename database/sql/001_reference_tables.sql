-- ==========================================
-- MTS Platform - Sprint 1
-- 001: Tablas de referencia (globales, sin company_id)
-- ==========================================

CREATE TABLE countries (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    iso_code    CHAR(2) NOT NULL UNIQUE,
    phone_code  VARCHAR(10),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE currencies (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    code        CHAR(3) NOT NULL UNIQUE,
    symbol      VARCHAR(5) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    price           NUMERIC(10,2) NOT NULL DEFAULT 0,
    billing_period  VARCHAR(20) NOT NULL DEFAULT 'monthly', -- monthly | yearly
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE modules (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         VARCHAR(100) NOT NULL,
    slug         VARCHAR(100) NOT NULL UNIQUE, -- cms | crm | erp | ai
    description  TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
