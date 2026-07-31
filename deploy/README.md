# Despliegue

Infraestructura de MTS Platform en producción. Tres proveedores, y cada uno está
donde está por un motivo:

| Pieza | Dónde | Por qué ahí |
|---|---|---|
| Base de datos | **Neon** (PostgreSQL 16, AWS us-east-2 / Ohio) | RLS y funciones SQL propias; el esquema lo construye `database/sql/`, no las migraciones |
| API (Laravel) | **Google Cloud Run** | Contenedor, escala a cero, sin servidor que mantener |
| Fotos de producto | **Cloudflare R2** | El disco de Cloud Run es efímero; sin esto las fotos duran hasta el siguiente despliegue |
| Panel (React) | **Cloudflare Pages** | Estático; ya estás en Cloudflare por R2 y por el DNS |

> **El orden importa.** R2 antes que Cloud Run. Si se despliega primero y se
> importa el catálogo, las 51 imágenes van al disco efímero del contenedor y se
> pierden en el primer redespliegue. Configurando R2 antes, la importación se
> hace una sola vez.

## Empieza por aquí

```powershell
.\deploy\comprobar-requisitos.ps1
```

No cambia nada: mira las cuatro partes (tu equipo, Google, la configuración y
Neon) y dice qué falta y cómo arreglarlo. Existe porque el despliegue toca
cuatro proveedores, y descubrir a mitad que falta una credencial deja las cosas
a medias — la imagen subida y el servicio creado sin poder arrancar.

Vuelve a lanzarlo hasta que salga todo en verde. Entonces despliega.

---

## Orden completo, de cero

### 1. Cloudflare R2

1. Crear el bucket `mts-platform-media`, ubicación **ENAM**.
   **Storage class: Standard.** Con *Infrequent Access* el uso **no cuenta para
   el tramo gratuito** y se factura aparte.
2. **El versionado de objetos NO existe en R2.** No lo busques en el panel ni lo
   intentes por la API S3: `PutBucketVersioning` responde
   `501 NotImplemented` (comprobado el 30/07/2026). Lo que protege las fotos es
   otra cosa — ver *Qué protege las fotos de producto* más abajo.
3. Settings → Public access → **Allow Access via r2.dev**. Anota la URL
   `https://pub-XXXX.r2.dev`.

   > **Por qué r2.dev y no `img.sublimartes21.com`.** R2 solo admite dominios
   > personalizados de zonas que estén en la misma cuenta de Cloudflare, y el
   > DNS de `sublimartes21.com` está en NS1. Moverlo significa cambiar los
   > nameservers de una web en producción de un cliente — hay que inventariar
   > todos los registros (el correo incluido) y recrearlos antes. Es una tarea
   > aparte, no un paso del despliegue.
   >
   > **Cambiarlo después cuesta una línea.** La dirección pública vive solo en
   > `R2_URL`; nunca se guarda en `media.path`, se construye al vuelo con
   > `Storage::url()`. No hay que migrar ni un archivo.

4. Manage API tokens → crear un token con permiso de **lectura y escritura**
   sobre ese bucket. Con uno de solo lectura, la importación falla archivo a
   archivo y el catálogo queda a medias.
5. Rellenar en `backend/.env.neon`: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_ENDPOINT` (el privado, `<account-id>.r2.cloudflarestorage.com`) y
   `R2_URL` (el público, `pub-XXXX.r2.dev`).
6. Opcional pero recomendado: **+ Add Budget Alert** en el panel de R2, a 1 USD.

Comprobar que las claves funcionan antes de importar nada. Escribe y borra un
archivo diminuto en el bucket; si algo está mal, se sabe aquí:

```powershell
cd backend
php artisan mts:migrar-media --env=neon --simular
```

### 2. Instalar el esquema en Neon

```powershell
docker run --rm -v "${PWD}:/repo" `
  -e PGHOST=<host-directo-sin-pooler> `
  -e PGPORT=5432 -e PGDATABASE=neondb `
  -e PGUSER=neondb_owner -e PGPASSWORD="..." `
  -e PGSSLMODE=require -e MTS_APP_PASSWORD="..." `
  postgres:16-alpine sh /repo/database/sql/install.sh
```

Sin `--con-demo`. Tiene que terminar diciendo **12 tablas con RLS** y
**`mts_app` sin privilegios**. Después:

```powershell
cd backend
php artisan migrate --env=neon --force
php artisan mts:crear-admin --env=neon
```

**El host de Neon va sin `-pooler`.** El que ofrece el panel por defecto sí lo
lleva y es PgBouncer en modo transacción: como el contexto de empresa se fija
con `set_config(..., false)`, que vive en la sesión, la conexión vuelve al pool
con la empresa de una petición todavía puesta y la siguiente la hereda. Un
cliente vería datos de otro, de forma intermitente y sin ningún error.

### 3. Cloud Run

```powershell
.\deploy\cloud-run\preparar.ps1  -Proyecto mi-proyecto-gcp   # una sola vez
.\deploy\cloud-run\desplegar.ps1 -Proyecto mi-proyecto-gcp
```

`desplegar.ps1` deja `APP_URL` puesta sola: la URL solo existe después del
primer despliegue, así que despliega, la lee y vuelve a aplicarla.

Hace falta tener instalado [Google Cloud CLI](https://cloud.google.com/sdk/docs/install).

Después, la comprobación que decide si pueden entrar clientes. Se lanza desde tu
equipo contra la base de producción, así que comprueba lo mismo que vería la API:

```powershell
cd backend
php artisan mts:comprobar-produccion --env=neon
```

Nada de crítico puede quedar en rojo.

### 4. Panel de React (Cloudflare Pages)

Ver [cloudflare-pages.md](cloudflare-pages.md).

### 5. Respaldos programados

```powershell
.\deploy\respaldo\programar.ps1 -Proyecto mi-proyecto-gcp
```

**Cloud Run no tiene cron.** Los contenedores se levantan bajo demanda y se
apagan: no hay ningún proceso vivo que ejecute un crontab. Por eso el respaldo
es un Cloud Run Job disparado por Cloud Scheduler, y no una línea en
`/etc/crontab` como decía el comentario original de `backup.sh`.

### 6. Cargar los datos reales

No copies la base local: tiene basura de desarrollo. Da de alta los clientes
desde el back-office y luego:

```powershell
cd backend
php artisan mts:importar-catalogo <slug-empresa> `
  "D:/Web/SublimArte/public/data/data.json" `
  --assets="D:/Web/SublimArte/public" --env=neon
```

Con `MTS_MEDIA_DISK=r2` en `.env.neon`, las imágenes van directas a R2. El
comando dice a qué disco escribe antes de empezar; si dice `public`, párate.

---

## `mts:migrar-media`: cuándo hace falta y cuándo no

**Para poner en marcha producción, NO hace falta.** Las 51 imágenes de SublimArte
están en tu base **de desarrollo**; Neon está limpia (0 empresas). En producción
el catálogo se importa de cero con `mts:importar-catalogo`, y con
`MTS_MEDIA_DISK=r2` las imágenes van directas a R2. No hay nada que migrar.

Sirve para dos cosas:

**1. Comprobar que las credenciales de R2 funcionan**, antes de importar nada:

```powershell
cd backend
php artisan mts:migrar-media --env=neon --simular
```

Escribe y borra un archivo diminuto en el bucket. Si las claves están mal, lo
dice aquí y no archivo a archivo con la importación ya empezada.

**2. Mover archivos entre discos** cuando ya existen filas en `media` — por
ejemplo tu base local, o el día que se cambie de proveedor:

```powershell
php artisan mts:migrar-media          # local: public -> r2
php artisan mts:migrar-media --env=neon
```

Copia y **verifica tamaño a tamaño**, y solo entonces actualiza `media.disk`.
**No borra el origen**: mientras los archivos estén en los dos sitios, volver
atrás es cambiar una variable de entorno. Borra la carpeta local a mano cuando
hayas visto el catálogo bien.

---

## Costes: no salirse del plan gratuito

**Restricción vigente: nada puede facturar hasta que las empresas den ingresos.**
Los números, medidos el 30/07/2026:

| Servicio | Límite gratuito | Uso real previsto | Margen |
|---|---|---|---|
| **R2** almacenamiento | 10 GB | catálogo 2,2 MB + respaldos ~14 × unos MB | enorme |
| **R2** clase A (escritura) | 1M/mes | 51 subidas + ~30 respaldos | enorme |
| **R2** clase B (lectura) | 10M/mes | ~15 imágenes por visita, **sin caché de CDN** en `r2.dev` | ~660.000 visitas/mes |
| **Cloud Run** | 2M peticiones/mes | un back-office que usa una persona | enorme |
| **Cloud Scheduler** | 3 tareas/mes | 1 (el respaldo) | de sobra |
| **Secret Manager** | **6 versiones activas** | 5 secretos × 1 versión | **justo** ⚠️ |
| **Cloud Build** | 2.500 min/mes | **0** — se construye en local | no se usa |
| **Artifact Registry** | 0,5 GB | ~78 MB por imagen, se conservan 3 | holgado |

### Cuidado al leer el tamaño de una imagen

`docker images` dice **380 MB**, pero eso es **sin comprimir**. Artifact Registry
cobra por bytes comprimidos, y ahí la imagen son **78 MB** (medido el 30/07/2026
con `docker save | gzip`). Además, las capas comunes se **deduplican** entre
imágenes que comparten la misma base, así que tres despliegues seguidos no
ocupan tres veces eso.

Comparar los 380 MB contra la cuota lleva a conclusiones alarmistas y falsas.

`desplegar.ps1` borra igualmente las imágenes viejas y conserva las 3 más
recientes. No por urgencia de factura, sino porque a lo largo de meses de
despliegues es crecimiento sin fin en un sitio donde nadie mira. Tres permite
volver atrás: Cloud Run apunta al *digest*, y si se borra la imagen esa revisión
ya no puede arrancar.

### Por qué la imagen es pequeña, y qué no tocar

El `Dockerfile` es de **dos etapas** y eso no es cosmético — pasó de 117 a 78 MB
comprimidos. Dos decisiones lo explican:

- **Poda del SDK de AWS.** `aws/aws-sdk-php` trae las definiciones de la API de
  **426 servicios de Amazon** (41 MB) y aquí se usa **uno**: S3, y solo para
  hablar con R2. La etapa de construcción borra el resto, conservando `s3` y
  `sts`. Solo directorios: los archivos sueltos de `src/data`
  (`endpoints.json.php`, `partitions.json.php`…) los carga el SDK siempre.
- **Sin `intl`, `zip` ni `gd` en la imagen final.** Comprobado: ninguna línea del
  código las usa y ninguna dependencia las exige — de `intl` se encargan los
  `symfony/polyfill-intl-*`. `zip` vive solo en la etapa de construcción, que es
  donde composer lo necesita para extraer los paquetes.

> Si algún día se añade redimensionado de imágenes, **`gd` vuelve** a la etapa
> final. Y si se usa otro servicio de AWS, hay que añadirlo a la poda.

### Lo que protege las lecturas de R2 — y lo que NO, con `r2.dev`

Las operaciones clase B son las únicas que escalan con las visitas.

Lo que sí protege hoy: **`Cache-Control: public, max-age=31536000, immutable`**, en
`options` del disco. Hace que el **navegador** guarde cada imagen un año, así que
un visitante que vuelve no genera ni una lectura.

**Lo que NO hay todavía: caché de CDN.** El propio panel de Cloudflare lo avisa
sobre la Public Development URL:

> *"This URL is rate-limited and not recommended for production. Cloudflare
> features like Access and **Caching** are unavailable."*

Con `r2.dev`, **cada primera carga de cada visitante llega a R2**. A ~15 imágenes
por visita, los 10M mensuales dan para unas **660.000 visitas al mes** — sigue
sobrando muchísimo para el catálogo de un cliente, pero ya no es "prácticamente
infinito", y el margen deja de crecer con el tráfico repetido.

**Conectar un dominio propio arregla las dos cosas a la vez**: activa la caché de
Cloudflare (las lecturas dejan de llegar a R2) y quita el límite de velocidad de
`r2.dev`. Es la razón de coste para hacerlo, además del SEO. Y cuesta **cambiar
`R2_URL`**, nada más.

Lo que las dispararía: cambiar a `temporaryUrl()`. Cada llamada generaría una URL
distinta, el navegador no podría cachear ninguna y **cada visita pasaría a ser una
lectura facturable**. Está avisado en `PublicCatalogController`. No lo cambies.

### Secret Manager: 6 versiones, y guardamos 5

El plan gratuito no cuenta secretos, cuenta **versiones activas**: 6 en total.
Aquí hay 5 secretos, así que solo cabe **una versión de cada uno**.

`preparar.ps1` está pensado para relanzarse (rotar una clave = volver a
ejecutarlo), y cada ejecución añade una versión nueva. Por eso **destruye las
anteriores** al terminar: sin eso, la segunda ejecución dejaría 10 versiones
vivas y empezaría a facturar ~0,06 USD por versión y mes.

Efecto secundario deseable: una credencial vieja que sigue siendo accesible es
una credencial que sigue siendo un riesgo. El valor bueno vive en
`backend/.env.neon`, que es la única fuente de verdad.

> **Si añades un sexto secreto, te sales del gratuito.** No es grave (céntimos),
> pero deja de ser cero. Piénsalo antes de meter uno nuevo "por si acaso".

### Cloud Build no se usa, y es a propósito

Se construye la imagen **en local** con Docker y se sube ya hecha. Es lo que
permite que `desplegar.ps1` haga sus comprobaciones antes de construir nada.

Conectar el repositorio de GitHub a Cloud Run (*"Conecta un repositorio"* en la
consola) haría lo contrario: build en la nube en cada push, despliegue automático
de cada commit, sin las guardas de `-pooler`/`mts_app`/`r2`, y sin rotación de
imágenes en Artifact Registry.

### Lo que crece en silencio

Dos cosas acumulan si nadie mira, y las dos avisan ahora:

- **Respaldos en R2** — `backup.sh` rota a los 14 días. Si la rotación falla ya
  **no se lo traga**: avisa, y en cada ejecución informa de cuántos hay guardados y
  cuánto ocupan.
- **Imágenes del registro** — las limpia `desplegar.ps1`, como se explica arriba.

### No existe ningún tope duro. En ningún proveedor.

Conviene saberlo antes de meter la tarjeta: **ni Cloudflare ni Google Cloud
permiten decir "no me cobres de más".** Lo que hay son avisos, que llegan
*después* de gastar. Neon es la excepción: en plan gratuito suspende en vez de
facturar.

Lo que sí acota el gasto de verdad en este montaje:

- **`--max-instances 3`** en Cloud Run. Es el único tope real que tienes: por
  muchas peticiones que lleguen, no se levantan más de 3 contenedores. Sin él,
  un bot podría escalar a decenas de instancias.
- **El egreso de R2 es gratis.** Que alguien se descargue las fotos en bucle no
  cuesta ancho de banda; como mucho, operaciones de clase B, y esas las absorbe
  la caché de Cloudflare.
- **`--min-instances 0`.** Sin peticiones, no hay contenedor, no hay factura.

Y el aviso, que se monta con `preparar.ps1 -CuentaFacturacion <id>`: correo al
superar 0,50 USD. Con todo dentro del plan gratuito la factura debería ser 0,00,
así que medio dólar ya significa que algo se salió de lo previsto.

> Un presupuesto de Google **avisa, no corta**. Se malinterpreta constantemente.
> Sirve para enterarte en horas en vez de a fin de mes; no es una red de seguridad.

### Lo que sí costaría dinero

- `--min-instances 1` en Cloud Run. Quita los arranques en frío y **se paga cada
  hora del mes**. Está en 0 a propósito.
- Subir `--max-instances` o `--concurrency` sin mirar Neon.

## Qué protege las fotos de producto

**No el versionado: R2 no lo tiene.** `PutBucketVersioning` devuelve
`501 NotImplemented`, y en el panel del bucket no existe la opción. Comprobado el
30/07/2026 — no es que esté escondido, es que no está.

Lo que hay, por orden de utilidad:

**1. El origen.** Las fotos vienen de archivos que siguen existiendo fuera de R2
(`D:/Web/SublimArte/public` y los originales del cliente). Si el bucket se
vaciara, se vuelven a importar con `mts:importar-catalogo`. Son 2,2 MB y un
comando. **Esta es la razón de fondo por la que esto no es una emergencia.**

**2. Lo que sí es irreemplazable está respaldado.** La base de datos —clientes,
cartera, vencimientos, cotizaciones— la vuelca `backup.sh` a diario y verificado.
Una foto perdida se vuelve a subir; un vencimiento perdido no se recupera.

**3. `Bucket Lock Rules`**, si se quiere una red extra. Es la función de
inmutabilidad que R2 sí tiene: impide sobrescribir y borrar durante un periodo.

> ⚠️ **Acótala por prefijo o rompes los respaldos.** Si se bloquea el bucket
> entero, `backup.sh` no podrá borrar los volcados de más de 14 días y el bucket
> crecerá sin límite hasta salirse del plan gratuito. Bloquea `productos/`, nunca
> `respaldos/`.

**Lo que NO cuenta como protección:** que las fotos estén "en la nube". R2 no
guarda copias que puedas recuperar tú; un borrado por error es definitivo.

## Lo que cuesta caro olvidar

- **No actives el modo worker de FrankenPHP ni Laravel Octane.** Rompe el
  aislamiento entre clientes: el contexto de empresa vive en la sesión de
  PostgreSQL y se heredaría entre peticiones. Ver `CLAUDE.md`.
- **Las conexiones a Neon están contadas.** `max-instances × concurrency` es el
  techo de conexiones simultáneas, porque no hay pooler. Los valores de
  `desplegar.ps1` están puestos para no pasarse; si los subes, mira antes el
  límite de tu plan de Neon.
- **`--allow-unauthenticated` es correcto aquí**: es una API pública y quien
  autoriza es Sanctum, no IAM. La API pública de catálogo va con `X-MTS-Key`.
- **Un respaldo dentro del mismo proveedor no es un respaldo.** Por eso el Job
  sube a R2 (Cloudflare) y no a Neon ni a GCS del mismo proyecto.
