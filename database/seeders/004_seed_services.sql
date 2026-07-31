-- ==========================================
-- MTS Platform - Catalogo de servicios de Macedo Tech
--
-- PRECIOS DECIDIDOS el 31/07/2026 (ya aplicados en produccion/Neon):
--   diseno-web 2500, dominio 80, hosting 450, mantenimiento-mensual 350.
-- La implantacion se cobra en DOS PARTES: 50% inicial y 50% al finalizar
-- (no se modela en ninguna tabla: no hay registro de cobros).
-- Ajustalos con:
--   UPDATE services SET default_price = 150.00 WHERE slug = 'mantenimiento-mensual';
--
-- Son solo precios de REFERENCIA: el precio acordado con cada cliente se
-- guarda en client_services y puede ser distinto.
-- ==========================================

INSERT INTO services (name, slug, description, default_price, default_billing_period) VALUES
    ('Diseño y desarrollo web', 'diseno-web',
     'Creacion del sitio web. Trabajo puntual. Se cobra en dos partes: 50% de inicial y 50% al finalizar.',
     2500, 'one_time'),

    ('Mantenimiento mensual', 'mantenimiento-mensual',
     'Cambios, respaldos y actualizaciones del sitio. Cuota recurrente.',
     350, 'monthly'),

    ('Hosting', 'hosting',
     'Alojamiento del sitio. Si vence, el sitio se cae.',
     450, 'yearly'),

    ('Dominio', 'dominio',
     'Registro y renovacion del dominio. Si vence, se pierde.',
     80, 'yearly'),

    ('Acceso a MTS Platform', 'acceso-mts-platform',
     'Acceso al panel con los modulos contratados. Es el puente hacia la fase de producto: '
     'el cliente que contrate esto si entra a su propio panel.',
     0, 'monthly')
ON CONFLICT (slug) DO NOTHING;
