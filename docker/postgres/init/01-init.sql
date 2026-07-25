-- ==========================================
-- MTS Platform - Inicialización de PostgreSQL
-- Se ejecuta automáticamente al crear el contenedor
-- ==========================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------
-- Helper para RLS multi-tenant (Sprint 1)
-- ------------------------------------------
-- Laravel debe ejecutar, dentro de cada transacción:
--   SET LOCAL app.current_company_id = '<uuid-de-la-empresa>';
--
-- Esta función se usa dentro de las políticas RLS de cada tabla
-- del Core para comparar contra la columna company_id.
-- Se crea aquí para que ya exista cuando se apliquen las
-- migraciones del Sprint 1.

CREATE OR REPLACE FUNCTION current_company_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- Nota: las tablas y sus políticas (CREATE POLICY ... USING (company_id = current_company_id()))
-- se crearán en el Sprint 1 junto con el ERD del Core.
