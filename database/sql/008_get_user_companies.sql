-- ==========================================
-- MTS Platform - Sprint 2
-- 008: Funcion para listar las empresas de un usuario durante el login
-- ==========================================

CREATE OR REPLACE FUNCTION get_user_companies(p_user_id UUID)
RETURNS TABLE(id UUID, name VARCHAR, slug VARCHAR, is_owner BOOLEAN)
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT c.id, c.name, c.slug, cu.is_owner
    FROM company_user cu
    JOIN companies c ON c.id = cu.company_id
    WHERE cu.user_id = p_user_id;
$$ LANGUAGE sql;

GRANT EXECUTE ON FUNCTION get_user_companies(UUID) TO mts_app;