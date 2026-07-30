import { httpClient } from '@/lib/httpClient'
import type { CatalogProduct } from '@/types/api'

/**
 * Catálogo de productos del cliente.
 *
 * Ya va contra la API real: la tabla `products` existe y lleva RLS, así que el
 * contexto de empresa que fija el middleware limita todo a su inquilino.
 */

export async function listProducts() {
  const { data } = await httpClient.get<{ products: CatalogProduct[] }>('/products')
  return data.products
}

export async function getProduct(id: string) {
  const products = await listProducts()
  const found = products.find((p) => p.id === id)
  if (!found) throw new Error('Producto no encontrado')
  return found
}

/**
 * Editar un producto.
 *
 * El `slug` no se manda nunca: renombrar un producto NO cambia su dirección
 * web, o cada corrección de una errata tiraría el posicionamiento de esa
 * página. Cambiar la dirección será una acción aparte, con su redirección.
 */
export async function saveProduct(id: string, cambios: Partial<CatalogProduct>) {
  const { data } = await httpClient.patch<{ products: CatalogProduct[] }>(
    `/products/${id}`,
    {
      name: cambios.name,
      description: cambios.description,
      price: cambios.price !== undefined ? Number(cambios.price) : undefined,
      is_active: cambios.is_active,
    },
  )
  return data.products.find((p) => p.id === id)!
}

export async function toggleProductActive(id: string) {
  const producto = await getProduct(id)
  return saveProduct(id, { is_active: !producto.is_active })
}
