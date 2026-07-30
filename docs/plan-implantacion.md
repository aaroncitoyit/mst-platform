# Primera implantación: catálogo en MTS + web estática en Vercel + cotizador automático

> Especificación de la primera venta real. **Las funcionalidades no se construyen hasta que esté
> vendida** — con una excepción, el despliegue de MTS. Escrito el 25/07/2026.

## Context

Macedo Tech Solutions es una **agencia con plataforma propia**: vende webs, sistemas y
automatizaciones, y los implementa sobre MTS Platform cobrando implantación + cuota mensual. La
plataforma es la fábrica, no el producto.

El primer candidato es el cliente que ya paga mantenimiento. Su web está hecha en **TypeScript sin
framework**, alojada en **Vercel con dominio propio**, y **los productos se pintan en el navegador**
leyendo datos por JavaScript. Su cotizador arma un carrito que se manda por WhatsApp; hoy esas
solicitudes **se pierden en los WhatsApp personales de los asesores** y las cotizaciones se redactan
a mano.

**Decisiones confirmadas:** la web **se queda en Vercel** y migra a **Next.js** (descartado el plan
previo de React + Laravel: Vercel no ejecuta PHP) · el catálogo y los precios viven en **MTS** ·
lista de precios fija · el enlace de cotización es **solo de lectura** · WhatsApp sigue siendo el
canal.

### Estado real de la web hoy (verificado el 25/07/2026)

El cliente es **sublimartes21.com** — SublimArte 21, estampados y sublimación. Consultado el sitio:

- **`sitemap.xml` contiene una sola URL: la portada.** Ninguna página de producto.
- Está **generado a mano con una herramienta externa** (xml-sitemaps.com), con fecha de marzo: no se
  actualiza solo.
- La portada **devuelve prácticamente sólo el título**, sin contenido en el HTML — el síntoma de una
  página que se rellena con JavaScript.

**Conclusión: los productos no tienen URL propia, así que no existen para Google.** No es que
posicionen mal; es que no hay nada que posicionar salvo la portada. Para un negocio de estampados
—donde se busca "tazas personalizadas Lima", "polos sublimados"— eso es mucho tráfico que no está
llegando.

**Confirmado por Aaron con capturas: la URL no cambia nunca.** Inicio, catálogo, contacto y las
galerías de categoría ocurren todos en `sublimartes21.com/`; las categorías se abren como ventanas
modales. Google puede indexar **una sola página**.

### La estructura real del catálogo

De las capturas se ve que hay **dos niveles**:

- **Categorías de producto**: taza de colores, taza mágica, taza blanca, polos… Son lo que la gente
  busca (*"taza mágica personalizada"*, *"tazas personalizadas Lima"*).
- **Diseños dentro de cada categoría**: una galería de ejemplos ("la mejor doctora", "el mejor
  ingeniero", flores…), cada uno con un botón **"ME INTERESA ESTE"**.

**Solo las categorías necesitan página propia** — unas 10-20 URLs, no cientos:

```
/catalogo/taza-de-colores
/catalogo/taza-magica
/catalogo/polos
```

Los diseños viven dentro de la página de su categoría, como galería. No necesitan URL.

Eso encaja directo en el modelo de datos: **la categoría es el `product`** (con su SKU, slug y
precio) y **los diseños son sus imágenes** en la tabla `media`, que ya existe y admite varias por
registro.

### Aprovechar "ME INTERESA ESTE"

Ese botón está en cada diseño concreto. Si la cotización registra **qué diseño** despertó el interés,
al asesor le llega:

> **Taza de color** ×1 — *diseño: "Aquí toma la mejor doctora"*

en vez de sólo "1 taza de color". Se ahorra la pregunta *"¿cuál te gustó?"* en cada conversación —
tiempo ahorrado a diario, que es lo que de verdad sostiene la cuota mensual.

Implica añadir a `quote_request_items` una referencia opcional a la imagen de `media` elegida.

### Esto reordena el argumento de venta

Deja de ser *"te conecto las cotizaciones"* y pasa a ser:

> *"Hoy tus productos no aparecen en Google porque no tienen página propia. Te los convierto en
> páginas reales, los gestionas tú desde un panel, y además las cotizaciones dejan de perderse en el
> WhatsApp de tus asesores."*

Es más fácil de vender y es **medible**: instalar Search Console antes de migrar y enseñar el gráfico
a los dos meses. Ese gráfico es después el argumento para vender al siguiente cliente.

### Corrección sobre el "CMS"

Durante varias sesiones se desaconsejó el módulo CMS entendiéndolo como *constructor y hosting de
sitios*. Era una lectura equivocada. Lo que se quiere es un **CMS headless**: que el cliente gestione
sus productos **desde MTS** y la web los lea. El sitio se queda en Vercel y no se hospeda nada.

---

## La convergencia que ordena todo

```
products (en MTS)
   ├── nombre, descripción, imagen, slug  →  los usa LA WEB para mostrar y posicionar
   └── precio                             →  lo usa EL COTIZADOR para calcular
```

**Una sola tabla, dos usos.** El "CMS" y el "cotizador" no son dos módulos: son el mismo dato bien
colocado. Y resuelve la cuota mensual de raíz — el cliente entra a MTS cada semana a mantener su
catálogo, y nadie cuestiona pagar por algo que usa cada semana.

Además **reduce el soporte**: "súbeme este producto" o "cámbiame este precio" dejan de ser una
llamada a Aaron y pasan a hacerlas el cliente.

---

## Arquitectura

```
   Empresa cliente ──> Panel MTS: productos, precios, cotizaciones
                              │
              ┌───────────────┴────────────────────────────┐
              │   MTS Platform (servidor de Macedo Tech)   │
              │    GET  /api/public/catalogo                │
              │    POST /api/public/cotizaciones            │
              │    GET  /c/{token}                          │
              └───────┬──────────────────────┬─────────────┘
                      │                      │
       (1) en BUILD   │                      │  (2) al COTIZAR
                      │                      │
              ┌───────┴──────────┐   ┌───────┴──────────────┐
              │ Vercel reconstruye│   │ /api/cotizar         │
              │ el sitio estático │   │ (función serverless, │
              │                   │   │  guarda la clave)    │
              └───────┬───────────┘   └───────┬──────────────┘
                      │                       │
              ┌───────┴───────────────────────┴──────────────┐
              │  Next.js en el dominio del cliente            │
              │  Páginas de producto: HTML estático           │
              └───────────────────┬──────────────────────────┘
                                  │
                        Visitante ─┴─> WhatsApp
```

**MTS solo se toca en dos momentos**, y ninguno ocurre mientras un visitante navega:

1. **En el build**, Next.js pide el catálogo y hornea las páginas.
2. **Al cotizar**, la función serverless llama a MTS.

### Por qué esto es más robusto que un servidor propio

La web **ni siquiera llama a MTS para mostrarse**: el catálogo está horneado en el HTML y servido
desde el CDN de Vercel. Si el servidor de Macedo Tech se cae, el sitio del cliente sigue perfecto. No
es "tiene caché por si acaso" — es que no depende de Aaron en absoluto.

Y el SEO deja de ser un riesgo: HTML estático es lo que mejor posiciona.

### El precio de esto

Los cambios de catálogo tardan **un par de minutos** en verse (lo que dura la reconstrucción). Para
productos es irrelevante, pero **hay que avisar al cliente** para que no crea que falló.

Los precios no aparecen en la web, así que un cambio de precio no requiere reconstruir nada: es
instantáneo al cotizar, porque MTS calcula en vivo.

---

## El flujo de la cotización, paso a paso

**WhatsApp y MTS no se conectan entre sí.** WhatsApp nunca sabrá que MTS existe. Lo que se conecta es
**el botón** con los dos caminos.

**La web no tiene carrito ni cantidades**, y no se le añaden: sería fricción en un negocio donde la
conversación por WhatsApp es inevitable (hay que decir qué texto va impreso, para cuándo, cuántas).

Lo único que cambia en la web es que **"ME INTERESA ESTE" acumula en vez de abrir WhatsApp al
instante**, y **"COTIZAR AHORA"** manda la lista entera. Sin formularios, sin campos: los mismos
clics que hoy — de hecho menos, porque hoy quien quiere tres productos manda tres mensajes.

Esto importa porque los pedidos de **empresas y eventos** (los grandes) mezclan varios productos. Sin
acumular, MTS registraría solo el primer clic y el asesor tendría que reconstruir el pedido a mano:
justo el trabajo que se le quiere quitar.

| # | Qué pasa | Dónde |
|---|---|---|
| 1 | El visitante marca uno o varios "ME INTERESA ESTE" y pulsa "COTIZAR AHORA" | Navegador |
| 2 | Llama a `/api/cotizar` (mismo dominio) con la lista de productos y diseños | Vercel |
| 3 | La función serverless llama a MTS con la clave | Vercel → MTS |
| 4 | MTS crea la solicitud y **trae el precio unitario de cada producto** | MTS |
| 5 | Devuelve `referencia` y `enlace` | MTS → Vercel |
| 6 | **Recién ahora** se abre WhatsApp con la lista + `Ref: A7K2` | Navegador |
| 7 | En el panel aparece la solicitud con productos, diseños y precios unitarios | MTS |
| 8 | El asesor **pone las cantidades**, revisa y envía el enlace por WhatsApp | Humano |

El mensaje de WhatsApp queda así:

```
Hola, me interesan estos productos:

• Taza de color — diseño "La mejor doctora"
• Taza mágica — diseño "Foto pareja"
• Polo blanco

Ref: A7K2
```

### La regla de oro

**Si MTS falla o tarda, WhatsApp se abre igual.** Tiempo de espera de 1-2 s y `try/catch` alrededor
del registro. Perder el registro molesta; perder la cotización le cuesta dinero al cliente.

### Qué queda automático y qué no

| Momento | ¿Automático? |
|---|---|
| Se registra la solicitud, con **qué productos y qué diseños** | **Sí** |
| Los precios unitarios se traen del catálogo | **Sí** ← el asesor no los busca |
| Se ponen las cantidades | No: las pregunta el asesor por WhatsApp |
| Se calculan totales y se genera el documento | **Sí**, en cuanto hay cantidades |
| Se genera el enlace público | **Sí** |
| Se envía por WhatsApp | No: lo pega el asesor |
| Se sabe si el cliente lo abrió, y cuándo | **Sí** |
| Avisos de seguimiento | **Sí** |
| Ganada o perdida | No: lo marca el asesor |

> **Sé honesto al vender esto.** No es "la cotización se arma sola": es *"llega con los productos, los
> diseños y los precios ya puestos; pones las cantidades y la mandas"*. Sigue siendo la diferencia
> entre redactar una cotización desde cero y completar un campo, pero prometer de más se paga caro al
> tercer mes.

**El punto débil:** al ser el enlace solo de lectura, MTS no sabe por sí mismo si se ganó. Si nadie lo
marca, el dato de "cuánto cerraste este mes" queda vacío. La mitigación no es insistir, es
**preguntar en el momento justo**: cuando una cotización lleva días vista sin marcar, MTS muestra
*"¿Qué pasó con A7K2?"* con dos botones. Un clic como respuesta a un aviso sí se hace.

---

## El reporte mensual: lo que sostiene la cuota

Con el catálogo en manos del cliente, *"te cambio los textos"* deja de ser el trabajo mensual. Y el
trabajo que queda —que el sistema esté vivo, que las cotizaciones no se rompan, los respaldos— **es
invisible**. El trabajo invisible no se paga: al tercer mes el cliente cancela aunque todo haya
funcionado.

**El reporte mensual es lo que hace visible ese trabajo.** No es un extra: es lo que justifica la
cuota mes tras mes sin que Aaron tenga que argumentarlo.

### Qué lleva

1. **Los números de su negocio** — cotizaciones recibidas, cerradas, vendido, producto más
   solicitado, tasa de cierre, y **comparación con el mes anterior**. Es lo más valioso y no cuesta
   nada: el sistema ya tiene esos datos. No es "trabajo que hiciste", es información que el cliente
   **no tendría sin ti**.
2. **Visibilidad en Google** — visitas, búsquedas que la traen, posición de sus productos.
3. **Mantenimiento del mes** — disponibilidad, respaldos hechos, actualizaciones aplicadas, y la
   comprobación de que **las cotizaciones siguen llegando** (esa tubería se rompe en silencio).
4. **Cambios realizados** fuera del catálogo: textos, fotos del local, teléfono, horarios, secciones.

### La regla: no se inventan métricas

**Solo se calcula lo que el sistema sabe.** Los bloques 2 y 3 no tienen fuente de datos todavía —no
hay Search Console conectado ni monitoreo—, así que aparecen **marcados como pendientes de
configurar**, explicando qué mostrarán cuando existan.

Rellenarlos con un "99,9% de disponibilidad" verosímil sería fabricar un dato, y en cuanto se le
enseña a un cliente eso es una mentira. Un reporte a medias es creíble; uno inventado destruye la
confianza el día que se descubre.

### Estado

Construido en el frontend con datos de prueba: `features/reports/api.ts` y
`pages/reports/MonthlyReportPage.tsx`, con selector de mes, comparación mensual y estilos de
impresión (el cliente lo guardará como PDF). Viaja con el módulo de cotizaciones: sin ellas no habría
nada que reportar.

### Cómo se envía: generado solo, enviado con un clic

**Decidido:** el día 1 de cada mes MTS genera el reporte de todos los clientes, **le llega primero a
Aaron**, y él lo envía. Un clic por cliente al mes.

El motivo no es desconfiar del cálculo, es que **un mes malo no puede llegar solo y sin contexto**. Si
un cliente recibió 2 cotizaciones y cerró 0, ese reporte le está diciendo que el servicio no le
sirve. Con el clic de por medio, Aaron lo ve antes y decide si va tal cual o con una frase: *"este mes
bajaron las cotizaciones, propongo hacer X"*. Los clientes no se van por malos números; se van cuando
sienten que nadie está mirando.

**Dónde se aprueba:** una sola pantalla en el back-office con **todos los reportes pendientes** y un
botón de enviar en cada fila. No navegando cliente por cliente — así diez clientes son diez clics, no
diez navegaciones.

### Diseñarlo para poder cambiar de opinión

Aaron ha dicho que si más adelante lo quiere totalmente automático, se cambia. Para que eso sea un
interruptor y no una reescritura, **generar y enviar tienen que ser dos pasos separados**:

```
Programador (día 1) ──> genera el reporte ──> queda "pendiente de enviar"
                                                      │
                            ┌─────────────────────────┴──────────────────┐
                            │                                            │
                   Aaron pulsa enviar                      Se envía solo (si se activa)
```

El envío automático pasa a ser una opción en `config/mts.php`, igual que
`self_registration`: si algún día se pone en true, el paso de aprobación se salta y nada más cambia.
Es el mismo patrón que ya existe en el proyecto para el registro público.

### Lo que falta para que sea automático de verdad

| Pieza | Estado |
|---|---|
| Cálculo del reporte | Hecho (en el navegador, con datos de prueba) |
| Datos reales | Faltan las tablas de cotizaciones |
| Programador mensual | Laravel lo trae, pero **necesita un cron en el servidor** → falta desplegar |
| Servicio de correo | Falta uno real. Hoy solo Mailpit, que es de desarrollo |
| Plantilla del correo | Por hacer |
| Pantalla de aprobación en el back-office | Por hacer |

Es la tercera cosa que se bloquea por no tener MTS desplegado, junto con la integración con la web y
el enlace público de cotizaciones.

---

## Arquitectura de SEO del catálogo

El cliente da de alta sus propios productos. Cada alta genera una página nueva que Google tiene que
encontrar, y cada edición puede romper una que ya posicionaba. Estas reglas evitan eso.

### El principio

**El cliente no debe saber qué es SEO.** Escribe nombre, descripción, precio y sube una foto. Todo lo
demás —dirección, metadatos, sitemap, datos estructurados— lo genera el sistema. Si para publicar un
producto hay que entender qué es un slug, se hará mal.

### El slug es el contrato, y se congela

> **La dirección se genera UNA vez, al crear el producto, y no cambia nunca sola.**

Renombrar un producto **no** cambia su URL. Queda algo desfasada pero funciona y conserva lo que esa
página ganó. Cambiar la dirección es una **acción explícita** que además **genera la redirección** de
la vieja a la nueva — nunca un efecto secundario de editar el nombre.

Sin esta regla, corregir una falta de ortografía en un nombre tira a la basura el posicionamiento de
esa página.

### Qué pasa con cada acción del cliente

| Acción | Dirección | Sitemap | Efecto |
|---|---|---|---|
| Crea un producto | Se genera del nombre; sufijo si colisiona | Entra | Se indexa tras reconstruir |
| Renombra | **No cambia** | Sigue | Conserva posición |
| Cambia precio o descripción | No cambia | Sigue | Se actualiza |
| Sube o cambia fotos | No cambia | Sigue | Se actualiza |
| Oculta | **Redirige al catálogo** | Sale | Deja de aparecer, sin 404 |
| Vuelve a mostrar | Recupera la suya | Vuelve | Se reindexa |
| Borra | **Redirige al catálogo** | Sale | Sin 404 |

**Nunca hay un 404.** Ocultar o borrar redirige. Un 404 es la única forma de perder posicionamiento
de golpe.

### Reparto de responsabilidades

**MTS guarda:** `slug` (congelado, `UNIQUE (company_id, slug)`), nombre, descripción, precio,
`meta_title` y `meta_description` **generados automáticamente pero editables**, e imágenes con texto
alternativo (que también se genera del nombre si el cliente no escribe uno).

**La web genera en cada reconstrucción:** la página estática de cada producto activo, el
`sitemap.xml`, los datos estructurados **con precio incluido** —los precios de este cliente son
públicos, así que se puede aspirar a resultados enriquecidos— y las redirecciones de lo oculto o
borrado.

### Imágenes

El cliente sube desde el móvil: llegan fotos de 4-5 MB. **MTS las redimensiona al subirlas.** Si no,
se come el almacenamiento y la web carga lenta, lo que penaliza en buscadores.

---

## Qué se construye en MTS

### Datos (`database/sql/012_catalogo_y_cotizaciones.sql`)

- **`products`** — en este cliente, un `product` es una **categoría** (taza de colores, taza mágica,
  polos), no un diseño concreto. Campos: `company_id`, `sku`, **`slug`**, nombre, descripción, precio,
  activo, orden y SEO (`meta_title`, `meta_description`, con valor por defecto generado). **Con RLS**:
  son datos del inquilino. `UNIQUE (company_id, sku)` y `UNIQUE (company_id, slug)`.
- **`company_api_keys`** — `company_id`, nombre, **hash** de la clave, **URL del deploy hook de
  Vercel**, `last_used_at`, `revoked_at`. Con RLS.
- **`quote_requests`** — referencia corta, token del enlace, origen, estado
  (`nueva` · `cotizada` · `enviada` · `vista` · `ganada` · `perdida`), contacto, `viewed_at`.
- **`quote_request_items`** — SKU, nombre, **cantidad (nula al llegar**, la pone el asesor**)**,
  **precio unitario congelado** (para que una cotización ya emitida no cambie si mañana sube el
  precio) y **referencia al diseño elegido** (`media_id`, del botón "ME INTERESA ESTE").

Las imágenes reutilizan la tabla **`media`** que ya existe (Sprint 1), añadiéndole **texto
alternativo** — que es accesibilidad y SEO.

> **La distinción de RLS.** `products` y `quote_requests` **sí** llevan RLS: son datos del cliente.
> `client_services` y `opportunities` **no**: son apuntes de Macedo Tech sobre su cartera. Está en
> `CLAUDE.md`; conviene no mezclarlo.

### Los dos códigos, que no deben ser el mismo

- **`A7K2`** — 4 caracteres, sin `0`/`O` ni `1`/`I`/`L`. Va en el WhatsApp para que un humano lo
  dicte. **No da acceso a nada.**
- **Token del enlace** — largo y aleatorio: **quien lo tenga ve la cotización con precios**. Ahí el
  token *es* la credencial. Usar el corto permitiría adivinar cotizaciones ajenas.

### Backend

- Middleware **`ResolveCompanyFromApiKey`**: busca por hash y **fija el contexto RLS** con
  [CompanyProvisioner::setCompanyContext()](backend/app/Services/CompanyProvisioner.php) — mismo
  patrón que [EnsureCompanyContext.php](backend/app/Http/Middleware/EnsureCompanyContext.php).
- **`EnsureModuleActive`** (alias `module:crm`): la deuda aplazada por no haber ningún endpoint de
  módulo que proteger. Aquí llega el primero.
- Rutas públicas con `throttle`: `GET /api/public/catalogo`, `POST /api/public/cotizaciones`,
  `GET /c/{token}` (marca `viewed_at` al abrirse; **debe verse bien en móvil**, que es donde la
  abrirá el cliente final).
- **Disparar el deploy hook** cuando cambie el catálogo, **con espera de un minuto**: si el cliente
  edita diez productos seguidos, se reconstruye **una vez**, no diez. Sin eso se agotan los minutos de
  build de Vercel.

### Panel del cliente

- **Productos**: alta, edición, precio, imagen, activar/desactivar. Es la pantalla a la que entra cada
  semana.
- **Cotizaciones**: bandeja, detalle, copiar enlace, PDF, marcar resultado.
- Sustituye el `ModulePlaceholderPage` de `/crm`. En el menú: **"Productos"** y **"Cotizaciones"**,
  nunca "CRM" ni "Módulos contratados" — son etiquetas comerciales de Aaron, no el trabajo del cliente.

### Back-office

Generar y revocar claves de API y configurar el deploy hook desde
[CompanyDetailPage.tsx](frontend/src/pages/admin/CompanyDetailPage.tsx), mostrando la clave en claro
**una sola vez**.

---

## Qué se hace en la web (Next.js) — proyecto aparte

> **Ojo con el tamaño de esto.** La web actual es TypeScript **sin framework**, así que migrar a
> Next.js implica adoptar también **React**. No es un cambio de herramienta, es aprender un modelo de
> trabajo nuevo. A 20 h/semana, contar entre **2 y 4 semanas solo de curva de aprendizaje**, más el
> tiempo de rehacer el sitio.
>
> Es una inversión sensata para una agencia — una sola herramienta para todos los clientes futuros,
> mucho ecosistema y documentación — pero **hay que presupuestarla**, no darla por incluida. Es
> perfectamente posible que la migración de la web acabe costando más horas que todo el trabajo en
> MTS.

- **Migrar a Next.js**, manteniendo dominio y despliegue en Vercel.
- **Generación estática** de las páginas de producto, pidiendo el catálogo a MTS **en el build**.
- **`/api/cotizar`** como función serverless: guarda `MTS_API_KEY` en las variables de entorno de
  Vercel, nunca en el navegador.
- **SEO**: ruta `/productos/[slug]`, metadatos por producto (title, description, Open Graph),
  **JSON-LD** de `schema.org/Product` (sin precio: no es tienda) y **`sitemap.xml` generado del
  catálogo**, que sustituye al actual — hecho a mano con una herramienta externa y con una sola URL.
- **Redirecciones**: en este caso hay poco que redirigir, porque hoy no existen URLs de producto. Es
  una ventaja de migrar ahora y no dentro de un año con cien páginas ya posicionadas.
- **Imágenes**: se traen en el build y las optimiza Next. Si MTS está caído durante un build, **el
  build falla y sigue vivo el despliegue anterior** — que es el fallo correcto.
- **Medir antes de migrar**: anotar en Search Console qué páginas reciben visitas y desde qué
  búsquedas, y comparar después. Como el punto de partida es un sitio que pinta con JavaScript, lo
  esperable es que los números **mejoren** — y poder demostrarlo es un argumento de venta para el
  siguiente cliente.

> **Revisar el plan de Vercel.** El gratuito es para proyectos personales; la web de un cliente que
> factura debería estar en uno de pago según sus términos. Es el tipo de detalle que aparece en el
> peor momento.

---

## Orden y estimación

El catálogo va **antes** que el cotizador: sin precios en MTS no hay nada que calcular.

| # | Trabajo (en MTS) | Horas |
|---|---|---|
| 1 | `products` con slug y SEO + panel + imágenes | 23 |
| 2 | `GET /api/public/catalogo` + deploy hook con espera | 15 |
| 3 | Claves de API + `EnsureModuleActive` | 10 |
| 4 | `POST /api/public/cotizaciones` + armado automático + códigos | 25 |
| 5 | Enlace público `/c/{token}` + PDF | 15 |
| 6 | Bandeja de cotizaciones en el panel | 20 |
| 7 | Avisos de seguimiento | 10 |
| 8 | Tests | 15 |

**≈ 133 h en MTS, es decir 6-8 semanas** a 20 h/semana.

**Fuera de esa cifra**, y hay que decirlo al presupuestar: **el despliegue de MTS** y **la migración
de la web a Next.js**. Van juntos aunque se cobren separados — sin la web migrada, el catálogo en MTS
no sirve de nada.

---

## Lo que no entra

- **Botón de aceptar en el enlace público.** Se decidió solo lectura; si se ve que nadie marca
  resultados, se reconsidera con datos.
- **Leer WhatsApp (API de Meta).** Exige verificación, plantillas aprobadas, coste por conversación
  y — lo decisivo — **el número deja de funcionar en la app normal**. Inasumible para una empresa que
  vive en el WhatsApp del móvil.
- **Más tipos de contenido que productos.** La trampa de los CMS es modelar páginas, secciones y
  bloques. El cliente necesita productos; empieza y termina ahí.
- **Facturación electrónica (SUNAT)** y **control de cobros.**

---

## Despliegue de MTS: la única excepción a la regla

Nada se construye sin implantación pagada, **salvo el despliegue**: hace falta para cualquier venta,
no es específico de ningún cliente, y sin él no se puede ni enseñar una demo.

Servidor con **PHP y PostgreSQL**, dominio y **HTTPS** — obligatorio, porque la función serverless de
Vercel y el enlace público van sobre HTTPS.

---

## Verificación

1. Dar de alta un producto en MTS con foto y precio → tras la reconstrucción aparece en la web.
2. **Ver el código fuente de la página del producto con JavaScript desactivado** → nombre,
   descripción y JSON-LD tienen que estar ahí. Si no, el SEO está roto.
3. `sitemap.xml` incluye el producto nuevo.
4. Pedir una URL antigua → redirige, no da 404.
5. **Apagar MTS y navegar la web** → funciona entera, es estática.
6. Marcar **tres** productos con "ME INTERESA ESTE" y pulsar "COTIZAR AHORA" → WhatsApp se abre con
   **los tres**, sus diseños y `Ref: A7K2`; en el panel aparece la solicitud con los tres productos y
   sus precios unitarios.
7. Poner cantidades en el panel → los totales se calculan solos.
7. **Apagar MTS y repetir** → WhatsApp se abre igual, sin error visible ni espera perceptible.
8. Abrir el enlace desde un móvil → se ve bien y queda registrada la apertura.
9. Subir el precio de un producto → las cotizaciones ya emitidas **no cambian**.
10. Un SKU sin precio → la cotización se crea igual, con la línea marcada "sin precio". **Nunca se
    descarta una solicitud por un problema de datos.**
11. Editar diez productos seguidos → **una sola reconstrucción**, no diez.
12. **Aislamiento:** catálogo y cotizaciones del cliente A no aparecen con la clave de B (ampliando
    [RlsIsolationTest.php](backend/tests/Feature/RlsIsolationTest.php)).
