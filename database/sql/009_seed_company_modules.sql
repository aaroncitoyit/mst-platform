-- ==========================================
-- MTS Platform - Sprint 3
-- 009: Activa los modulos en las empresas que ya existen
--
-- Las empresas creadas antes de este sprint (incluida la demo mts-demo) no
-- tienen ninguna fila en company_modules, asi que el menu lateral del frontend
-- les saldria vacio. Este script las pone al dia.
--
-- Nota de diseño: todavia no existe una tabla plan_modules que relacione plans
-- con modules, asi que por ahora toda empresa recibe todos los modulos activos.
-- Cuando exista esa relacion, esto debe derivarse del plan contratado.
--
-- Se ejecuta como mts_user (superusuario), que ignora RLS y por tanto ve todas
-- las empresas. No intentes correrlo con mts_app.
-- ==========================================

INSERT INTO company_modules (company_id, module_id)
SELECT c.id, m.id
FROM companies c
CROSS JOIN modules m
WHERE m.is_active = true
ON CONFLICT (company_id, module_id) DO NOTHING;
