-- ==========================================
-- MTS Platform - Sprint 1
-- 002: companies (raiz multi-tenant), subscriptions, company_modules
-- ==========================================

CREATE TABLE companies (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         VARCHAR(150) NOT NULL,
    slug         VARCHAR(150) NOT NULL UNIQUE,
    country_id   UUID REFERENCES countries(id),
    currency_id  UUID REFERENCES currencies(id),
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_id     UUID NOT NULL REFERENCES plans(id),
    status      VARCHAR(20) NOT NULL DEFAULT 'active', -- active | cancelled | past_due
    starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_company ON subscriptions(company_id);

CREATE TABLE company_modules (
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    module_id     UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    activated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, module_id)
);
