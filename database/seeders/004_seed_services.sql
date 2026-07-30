-- ==========================================
-- MTS Platform - Catalogo de servicios de Macedo Tech
--
-- OJO: los PRECIOS son un marcador de posicion (0.00). Solo Aaron sabe cuanto
-- cobra por cada cosa. Ajustalos con:
--   UPDATE services SET default_price = 150.00 WHERE slug = 'mantenimiento-mensual';
--
-- Son solo precios de REFERENCIA: el precio acordado con cada cliente se
-- guarda en client_services y puede ser distinto.
-- ==========================================

INSERT INTO services (name, slug, description, default_price, default_billing_period) VALUES
    ('Diseño y desarrollo web', 'diseno-web',
     'Creacion del sitio web. Trabajo puntual.',
     0, 'one_time'),

    ('Mantenimiento mensual', 'mantenimiento-mensual',
     'Cambios, respaldos y actualizaciones del sitio. Cuota recurrente.',
     0, 'monthly'),

    ('Hosting', 'hosting',
     'Alojamiento del sitio. Si vence, el sitio se cae.',
     0, 'yearly'),

    ('Dominio', 'dominio',
     'Registro y renovacion del dominio. Si vence, se pierde.',
     0, 'yearly'),

    ('Acceso a MTS Platform', 'acceso-mts-platform',
     'Acceso al panel con los modulos contratados. Es el puente hacia la fase de producto: '
     'el cliente que contrate esto si entra a su propio panel.',
     0, 'monthly')
ON CONFLICT (slug) DO NOTHING;
