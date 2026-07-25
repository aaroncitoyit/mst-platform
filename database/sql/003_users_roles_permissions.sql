-- ==========================================
-- MTS Platform - Sprint 1
-- 003: users, company_user, roles/permissions (modelo hibrido)
-- ==========================================

CREATE TABLE users (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name               VARCHAR(150) NOT NULL,
    email              VARCHAR(150) NOT NULL UNIQUE,
    password           VARCHAR(255) NOT NULL,
    email_verified_at  TIMESTAMPTZ,
    is_active          BOOLEAN NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un usuario puede pertenecer a mas de una empresa (ej. consultores de MTS)
CREATE TABLE company_user (
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_owner    BOOLEAN NOT NULL DEFAULT false,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, user_id)
);
CREATE INDEX idx_company_user_user ON company_user(user_id);

-- roles.company_id NULL = rol global del catalogo MTS
-- roles.company_id = 'uuid' = rol personalizado de esa empresa (fase enterprise)
CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    guard_name  VARCHAR(50) NOT NULL DEFAULT 'web',
    is_system   BOOLEAN NOT NULL DEFAULT false, -- protege los roles base de MTS
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, name, guard_name)
);
CREATE INDEX idx_roles_company ON roles(company_id);

CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    guard_name  VARCHAR(50) NOT NULL DEFAULT 'web',
    module_id   UUID REFERENCES modules(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name, guard_name)
);

CREATE TABLE role_permissions (
    role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id  UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Un mismo usuario puede tener roles distintos en distintas empresas
CREATE TABLE model_has_roles (
    role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, user_id, company_id)
);
CREATE INDEX idx_model_has_roles_user_company ON model_has_roles(user_id, company_id);
