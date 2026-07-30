import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Images, Pencil } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'
import { listProducts, saveProduct, toggleProductActive } from '@/features/catalog/api'
import { useToast } from '@/components/ui/toastContext'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { formatSoles } from '@/lib/format'
import type { CatalogProduct } from '@/types/api'

export function ProductsPage() {
  const activeCompanyId = useSessionStore((s) => s.activeCompanyId)
  const queryClient = useQueryClient()
  const { notifySuccess, notifyError } = useToast()

  const [editando, setEditando] = useState<CatalogProduct | null>(null)
  const [viendoDisenos, setViendoDisenos] = useState<CatalogProduct | null>(null)
  const [precio, setPrecio] = useState('')
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const { data, isPending } = useQuery({
    queryKey: ['products', activeCompanyId],
    queryFn: listProducts,
  })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  function abrirEdicion(producto: CatalogProduct) {
    setEditando(producto)
    setNombre(producto.name)
    setPrecio(String(Number(producto.price)))
    setDescripcion(producto.description ?? '')
  }

  const guardar = useMutation({
    mutationFn: () =>
      saveProduct(editando!.id, {
        name: nombre,
        price: Number(precio).toFixed(2),
        description: descripcion || null,
      }),
    onSuccess: () => {
      notifySuccess('Producto actualizado. Tu web se actualiza en unos minutos.')
      setEditando(null)
      invalidate()
    },
    onError: () => notifyError('No se pudo guardar'),
  })

  const alternar = useMutation({
    mutationFn: toggleProductActive,
    onSuccess: (p) => {
      notifySuccess(p.is_active ? 'Producto visible en tu web' : 'Producto oculto de tu web')
      invalidate()
    },
    onError: () => notifyError('No se pudo cambiar'),
  })

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Productos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Lo que aparece en tu web y los precios con los que se calculan las cotizaciones. Los cambios
          se publican solos.
        </p>
      </div>

      {isPending ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-4">
          {data?.map((producto) => (
            <Card key={producto.id}>
              <div className="flex flex-wrap items-start gap-4">
                {producto.designs[0] ? (
                  <img
                    src={producto.designs[0].url}
                    alt={producto.designs[0].alt}
                    className="size-20 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="size-20 shrink-0 rounded-md bg-slate-100" aria-hidden="true" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                    {producto.name}
                    {!producto.is_active && <Badge>Oculto en la web</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">{producto.description}</p>
                  <p className="mt-2 text-sm">
                    <span className="font-semibold text-slate-900">
                      {formatSoles(producto.price)}
                    </span>
                    <span className="text-slate-500"> por unidad</span>
                    <span className="ml-3 font-mono text-xs text-slate-400">{producto.sku}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Dirección en tu web: /catalogo/{producto.slug}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  <Button variant="secondary" onClick={() => abrirEdicion(producto)}>
                    <Pencil className="size-4" aria-hidden="true" />
                    Editar
                  </Button>
                  <Button variant="ghost" onClick={() => setViendoDisenos(producto)}>
                    <Images className="size-4" aria-hidden="true" />
                    {producto.designs.length} diseños
                  </Button>
                  <Button
                    variant="ghost"
                    loading={alternar.isPending && alternar.variables === producto.id}
                    onClick={() => alternar.mutate(producto.id)}
                  >
                    {producto.is_active ? 'Ocultar' : 'Mostrar'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={editando !== null}
        title={`Editar ${editando?.name ?? ''}`}
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button loading={guardar.isPending} onClick={() => guardar.mutate()}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Input
            label="Precio por unidad (S/)"
            type="number"
            min="0"
            step="0.01"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">Descripción</label>
            <textarea
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            />
            <p className="text-sm text-slate-500">
              Este texto sale en tu web y es lo que lee Google. Descríbelo como lo buscaría un cliente.
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={viendoDisenos !== null}
        title={`Diseños de ${viendoDisenos?.name ?? ''}`}
        onClose={() => setViendoDisenos(null)}
        footer={
          <Button variant="secondary" onClick={() => setViendoDisenos(null)}>
            Cerrar
          </Button>
        }
      >
        {viendoDisenos?.designs.length === 0 ? (
          <p className="text-sm text-slate-500">
            Este producto todavía no tiene diseños de ejemplo en tu web.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {viendoDisenos?.designs.map((d) => (
              <li key={d.id} className="flex flex-col gap-1.5">
                <img src={d.url} alt={d.alt} className="aspect-square w-full rounded-md object-cover" />
                <span className="text-xs text-slate-600">{d.label}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  )
}
