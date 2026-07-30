import type { CatalogProduct, Quote } from '@/types/api'

/**
 * DATOS DE PRUEBA — BORRAR CUANDO EXISTA EL BACKEND.
 *
 * Sirven para diseñar y enseñar el panel del cliente sin haber tocado todavía
 * la base de datos. Las tablas products, quote_requests y quote_request_items
 * no existen aun (ver el plan de la primera implantacion).
 *
ARCHIVO TEMPORAL: solo lo usan las cotizaciones. El catalogo YA va contra la
 * API real; estos datos de producto siguen aqui solo porque las cotizaciones de
 * prueba referencian sus imagenes.
 *
 * Los datos imitan el catalogo real de sublimartes21.com para que el panel
 * pueda usarse como demo de venta.
 *
 * Cuando el backend este listo, solo cambian los api.ts de estas features: los
 * tipos y las pantallas se quedan igual.
 */

/** Imágenes de relleno: un SVG en data URI, sin dependencias externas. */
function placeholder(text: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <rect width="400" height="400" fill="${bg}"/>
    <text x="50%" y="50%" fill="#ffffff" font-family="sans-serif" font-size="26"
          text-anchor="middle" dominant-baseline="middle">${text}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const MOCK_PRODUCTS: CatalogProduct[] = [
  {
    id: 'p1',
    sku: 'TAZA-COLOR',
    slug: 'taza-de-colores',
    name: 'Taza de colores',
    description:
      'Taza cerámica de 11 oz con interior y asa de color. Ideal para regalos personalizados.',
    price: '18.00',
    is_active: true,
    meta_title: 'Tazas de colores personalizadas | SublimArte 21',
    meta_description:
      'Tazas de cerámica con interior de color, personalizadas con tu diseño. Sublimación profesional.',
    designs: [
      { id: 'd1', url: placeholder('Mejor doctora', '#be185d'), alt: 'Taza rosa con diseño para doctora', label: 'La mejor doctora' },
      { id: 'd2', url: placeholder('Mejor ingeniero', '#1d4ed8'), alt: 'Taza azul con diseño para ingeniero', label: 'El mejor ingeniero' },
      { id: 'd3', url: placeholder('Flores', '#db2777'), alt: 'Taza con diseño floral acuarela', label: 'Flores acuarela' },
    ],
  },
  {
    id: 'p2',
    sku: 'TAZA-MAGICA',
    slug: 'taza-magica',
    name: 'Taza mágica',
    description: 'Taza negra que revela el diseño al contacto con líquido caliente.',
    price: '25.00',
    is_active: true,
    meta_title: 'Tazas mágicas personalizadas | SublimArte 21',
    meta_description: 'Taza mágica que revela tu foto con el calor. Sublimación profesional.',
    designs: [
      { id: 'd4', url: placeholder('Foto pareja', '#0f172a'), alt: 'Taza mágica revelando una foto de pareja', label: 'Foto pareja' },
      { id: 'd5', url: placeholder('Foto familia', '#334155'), alt: 'Taza mágica revelando una foto familiar', label: 'Foto familia' },
    ],
  },
  {
    id: 'p3',
    sku: 'TAZA-BLANCA',
    slug: 'taza-blanca',
    name: 'Taza blanca',
    description: 'Taza cerámica blanca de 11 oz. La opción más económica para pedidos grandes.',
    price: '14.00',
    is_active: true,
    meta_title: 'Tazas blancas personalizadas | SublimArte 21',
    meta_description: 'Tazas blancas de cerámica personalizadas con tu diseño o logo.',
    designs: [
      { id: 'd6', url: placeholder('Logo empresa', '#0891b2'), alt: 'Taza blanca con logo corporativo', label: 'Logo de empresa' },
    ],
  },
  {
    id: 'p4',
    sku: 'POLO-ALG',
    slug: 'polo-algodon',
    name: 'Polo de algodón',
    description: 'Polo de algodón peinado 20/1, sublimable. Tallas S a XXL.',
    price: '32.00',
    is_active: true,
    meta_title: 'Polos personalizados sublimados | SublimArte 21',
    meta_description: 'Polos de algodón personalizados con tu diseño. Pedidos para empresas y eventos.',
    designs: [
      { id: 'd7', url: placeholder('Polo evento', '#15803d'), alt: 'Polo blanco con diseño de evento', label: 'Diseño de evento' },
    ],
  },
  {
    id: 'p5',
    sku: 'GORRA',
    slug: 'gorra-bordada',
    name: 'Gorra',
    description: 'Gorra de algodón con visera curva, apta para bordado y transfer.',
    price: '28.00',
    is_active: false,
    meta_title: null,
    meta_description: null,
    designs: [],
  },
]

/** Devuelve una fecha ISO desplazada en días respecto a hoy. */
function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export const MOCK_QUOTES: Quote[] = [
  {
    id: 'q1',
    reference: 'A7K2',
    status: 'nueva',
    source: '/catalogo/taza-de-colores',
    created_at: daysAgo(0),
    viewed_at: null,
    contact_name: null,
    contact_phone: null,
    public_url: null,
    items: [
      {
        id: 'i1',
        product_id: 'p1',
        sku: 'TAZA-COLOR',
        product_name: 'Taza de colores',
        quantity: null,
        unit_price: '18.00',
        design: MOCK_PRODUCTS[0].designs[0],
      },
      {
        id: 'i2',
        product_id: 'p4',
        sku: 'POLO-ALG',
        product_name: 'Polo de algodón',
        quantity: null,
        unit_price: '32.00',
        design: MOCK_PRODUCTS[3].designs[0],
      },
    ],
  },
  {
    id: 'q2',
    reference: 'M4TP',
    status: 'nueva',
    source: '/catalogo/taza-magica',
    created_at: daysAgo(1),
    viewed_at: null,
    contact_name: null,
    contact_phone: null,
    public_url: null,
    items: [
      {
        id: 'i3',
        product_id: 'p2',
        sku: 'TAZA-MAGICA',
        product_name: 'Taza mágica',
        quantity: null,
        unit_price: '25.00',
        design: MOCK_PRODUCTS[1].designs[0],
      },
    ],
  },
  {
    id: 'q3',
    reference: 'R9XW',
    status: 'vista',
    source: '/catalogo/taza-blanca',
    created_at: daysAgo(9),
    viewed_at: daysAgo(6),
    contact_name: 'Marisol Quispe',
    contact_phone: '999 888 777',
    public_url: 'https://app.macedotech.pe/c/r9xw-8f2a41bd9c',
    items: [
      {
        id: 'i4',
        product_id: 'p3',
        sku: 'TAZA-BLANCA',
        product_name: 'Taza blanca',
        quantity: 50,
        unit_price: '14.00',
        design: MOCK_PRODUCTS[2].designs[0],
      },
    ],
  },
  {
    id: 'q4',
    reference: 'K2WD',
    status: 'enviada',
    source: '/catalogo/polo-algodon',
    created_at: daysAgo(3),
    viewed_at: null,
    contact_name: 'Colegio San Martín',
    contact_phone: '987 654 321',
    public_url: 'https://app.macedotech.pe/c/k2wd-1c7b93e4aa',
    items: [
      {
        id: 'i5',
        product_id: 'p4',
        sku: 'POLO-ALG',
        product_name: 'Polo de algodón',
        quantity: 40,
        unit_price: '32.00',
        design: MOCK_PRODUCTS[3].designs[0],
      },
      {
        id: 'i6',
        product_id: 'p5',
        sku: 'GORRA',
        product_name: 'Gorra',
        quantity: 40,
        unit_price: '28.00',
        design: null,
      },
    ],
  },
  {
    id: 'q5',
    reference: 'B3HN',
    status: 'ganada',
    source: '/catalogo/taza-de-colores',
    created_at: daysAgo(22),
    viewed_at: daysAgo(20),
    contact_name: 'Clínica Vida',
    contact_phone: '981 222 333',
    public_url: 'https://app.macedotech.pe/c/b3hn-55ad0f7e12',
    items: [
      {
        id: 'i7',
        product_id: 'p1',
        sku: 'TAZA-COLOR',
        product_name: 'Taza de colores',
        quantity: 30,
        unit_price: '18.00',
        design: MOCK_PRODUCTS[0].designs[0],
      },
    ],
  },
  {
    id: 'q6',
    reference: 'T8QR',
    status: 'perdida',
    source: '/catalogo/taza-magica',
    created_at: daysAgo(26),
    viewed_at: daysAgo(25),
    contact_name: 'Luis Fernández',
    contact_phone: '955 111 000',
    public_url: 'https://app.macedotech.pe/c/t8qr-90bb2ce371',
    items: [
      {
        id: 'i8',
        product_id: 'p2',
        sku: 'TAZA-MAGICA',
        product_name: 'Taza mágica',
        quantity: 2,
        unit_price: '25.00',
        design: MOCK_PRODUCTS[1].designs[1],
      },
    ],
  },
]
