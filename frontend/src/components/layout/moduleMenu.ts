import { FileText, Package, Settings2, Sparkles, type LucideIcon } from 'lucide-react'

export type ModuleMenuEntry = {
  label: string
  path: string
  icon: LucideIcon
}

/**
 * Traduce el slug de un modulo (columna modules.slug en la base de datos) a su
 * entrada de menu y su ruta.
 *
 * IMPORTANTE: la etiqueta es el TRABAJO del cliente, no el nombre comercial del
 * modulo. Al dueño de una imprenta no le dice nada "CMS" ni "CRM"; le dicen algo
 * "Productos" y "Cotizaciones". Las siglas son el empaquetado con el que Macedo
 * Tech vende, y no tienen por que aparecer en la cara del cliente.
 *
 * Un modulo que no este aqui simplemente no aparece en el menu ni registra
 * ruta: el mapa es la lista blanca de lo que el frontend sabe renderizar.
 */
export const MODULE_MENU_MAP: Record<string, ModuleMenuEntry> = {
  cms: { label: 'Productos', path: '/productos', icon: Package },
  crm: { label: 'Cotizaciones', path: '/cotizaciones', icon: FileText },
  erp: { label: 'Inventario', path: '/inventario', icon: Settings2 },
  ai: { label: 'Asistente', path: '/asistente', icon: Sparkles },
}
