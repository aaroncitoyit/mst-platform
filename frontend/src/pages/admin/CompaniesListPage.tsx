import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listCompanies } from '@/features/admin/api'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Table, type Column } from '@/components/ui/Table'
import { formatDate } from '@/lib/format'
import type { AdminCompanyRow } from '@/types/api'

/**
 * No hay columna de "Estado".
 *
 * companies.is_active habla de la relacion comercial (suspendido por impago),
 * no de MTS Platform, y ponerla al lado de la columna del panel invitaba a
 * confundir las dos cosas.
 *
 * Ademas, diez filas diciendo "Activo" no informan de nada: lo normal no se
 * muestra. Solo se marca la excepcion, y asi el ojo va directo a ella.
 */
const columns: Column<AdminCompanyRow>[] = [
  {
    key: 'name',
    header: 'Cliente',
    render: (row) => (
      <span className="flex flex-wrap items-center gap-2">
        <Link
          to={`/admin/companies/${row.id}`}
          className="font-semibold text-primary hover:underline"
        >
          {row.name}
        </Link>
        {!row.is_active && <Badge tone="danger">Suspendido</Badge>}
      </span>
    ),
  },
  {
    key: 'since',
    header: 'Cliente desde',
    render: (row) => <span className="text-slate-500">{formatDate(row.created_at)}</span>,
  },
  {
    key: 'panel',
    header: 'Panel',
    render: (row) =>
      row.plan_name ? (
        <Badge tone="primary">{row.plan_name}</Badge>
      ) : (
        <span className="text-sm text-slate-400">Sin panel</span>
      ),
  },
]

export function CompaniesListPage() {
  const [search, setSearch] = useState('')

  const { data, isPending, isError } = useQuery({
    queryKey: ['admin', 'companies', search],
    queryFn: () => listCompanies(search || undefined),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Clientes</h1>
        <Link to="/admin/companies/new">
          <Button>Nuevo cliente</Button>
        </Link>
      </div>

      <Card>
        <div className="mb-4 max-w-sm">
          <Input
            label="Buscar"
            placeholder="Nombre del cliente"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {isError && <p className="text-sm text-red-600">No se pudieron cargar los clientes.</p>}
        {isPending ? (
          <p className="text-sm text-slate-500">Cargando...</p>
        ) : (
          <Table
            columns={columns}
            rows={data ?? []}
            rowKey={(row) => row.id}
            emptyMessage={search ? 'Ningún cliente coincide.' : 'Todavía no tienes clientes.'}
          />
        )}
      </Card>
    </div>
  )
}
