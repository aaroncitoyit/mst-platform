import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ChevronDown, LogIn } from 'lucide-react'
import { changePlan, getCompany, impersonate, listPlans, updateCompany } from '@/features/admin/api'
import { useAuth } from '@/features/auth/useAuth'
import { useToast } from '@/components/ui/toastContext'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Table, type Column } from '@/components/ui/Table'
import { ClientServicesCard } from './ClientServicesCard'
import { OpportunitiesCard } from './OpportunitiesCard'
import { ClientNotesCard } from './ClientNotesCard'
import type { AdminCompanyModule, AdminCompanyUser } from '@/types/api'

const moduleColumns: Column<AdminCompanyModule>[] = [
  { key: 'name', header: 'Módulo', render: (m) => <span className="font-semibold">{m.name}</span> },
  {
    key: 'state',
    header: 'Estado',
    render: (m) => (m.is_active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>),
  },
]

const userColumns: Column<AdminCompanyUser>[] = [
  { key: 'name', header: 'Usuario', render: (u) => <span className="font-semibold">{u.name}</span> },
  { key: 'email', header: 'Correo', render: (u) => u.email },
  {
    key: 'role',
    header: '',
    render: (u) => (u.is_owner ? <Badge tone="primary">Dueño</Badge> : null),
  },
]

export function CompanyDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const { notifySuccess, notifyError } = useToast()
  const { enterCompanyAsAdmin } = useAuth()
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [verPlataforma, setVerPlataforma] = useState(false)
  const [planId, setPlanId] = useState('')

  const { data, isPending, isError } = useQuery({
    queryKey: ['admin', 'company', id],
    queryFn: () => getCompany(id),
  })
  const { data: plans } = useQuery({ queryKey: ['admin', 'plans'], queryFn: listPlans })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }

  const suspendMutation = useMutation({
    mutationFn: (isActive: boolean) => updateCompany(id, { is_active: isActive }),
    onSuccess: (_, isActive) => {
      notifySuccess(isActive ? 'Cliente reactivado' : 'Cliente suspendido')
      setConfirmSuspend(false)
      invalidate()
    },
    onError: () => notifyError('No se pudo cambiar el estado'),
  })

  const planMutation = useMutation({
    mutationFn: (newPlanId: string) => changePlan(id, newPlanId),
    onSuccess: () => {
      notifySuccess('Plan actualizado; los módulos se han recalculado')
      invalidate()
    },
    onError: () => notifyError('No se pudo cambiar el plan'),
  })

  async function onEnterAsClient() {
    try {
      const company = await impersonate(id)
      await enterCompanyAsAdmin(company)
    } catch {
      notifyError('No se pudo entrar al panel del cliente')
    }
  }

  if (isPending) return <p className="text-sm text-slate-500">Cargando...</p>
  if (isError || !data) return <p className="text-sm text-red-600">No se pudo cargar el cliente.</p>

  const { company, services, opportunities, notes, subscription, modules, users } = data
  const tieneAcceso = subscription !== null || users.length > 0

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link to="/admin/companies" className="text-sm text-primary hover:underline">
          ← Clientes
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{company.name}</h1>
            {!company.is_active && <Badge tone="danger">Suspendido</Badge>}
          </div>
          <div className="flex gap-2">
            {tieneAcceso && (
              <Button variant="secondary" onClick={() => void onEnterAsClient()}>
                <LogIn className="size-4" aria-hidden="true" />
                Entrar como cliente
              </Button>
            )}
            <Button
              variant={company.is_active ? 'danger' : 'primary'}
              onClick={() =>
                company.is_active ? setConfirmSuspend(true) : suspendMutation.mutate(true)
              }
              loading={suspendMutation.isPending}
            >
              {company.is_active ? 'Suspender' : 'Reactivar'}
            </Button>
          </div>
        </div>
      </div>

      {/* Lo que importa hoy: la cartera */}
      <ClientServicesCard companyId={id} services={services} />
      <OpportunitiesCard companyId={id} opportunities={opportunities} />
      <ClientNotesCard companyId={id} notes={notes} />

      {/* MTS Platform en segundo plano: de momento casi ningún cliente entra al panel */}
      <div>
        <button
          type="button"
          onClick={() => setVerPlataforma((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800"
        >
          <ChevronDown
            className={`size-4 transition ${verPlataforma ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
          Acceso a MTS Platform
          {!tieneAcceso && <span className="font-normal text-slate-400">· sin contratar</span>}
        </button>

        {verPlataforma && (
          <div className="mt-4 flex flex-col gap-4">
            <Card title="Suscripción">
              <div className="flex flex-col gap-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
                  <dt className="font-semibold text-slate-600">Plan actual</dt>
                  <dd className="text-slate-800">{subscription?.plan_name ?? 'Sin plan'}</dd>
                  <dt className="font-semibold text-slate-600">Identificador</dt>
                  <dd className="font-mono text-xs text-slate-500">{company.slug}</dd>
                </dl>

                <div className="flex items-end gap-3 border-t border-slate-100 pt-4">
                  <div className="min-w-64">
                    <Select
                      label="Cambiar de plan"
                      value={planId}
                      onChange={(event) => setPlanId(event.target.value)}
                      options={[
                        { value: '', label: 'Elige un plan...' },
                        ...(plans ?? []).map((plan) => ({
                          value: plan.id,
                          label: `${plan.name} — ${plan.modules.map((m) => m.slug.toUpperCase()).join(', ') || 'sin módulos'}`,
                        })),
                      ]}
                    />
                  </div>
                  <Button
                    disabled={!planId || planId === subscription?.plan_id}
                    loading={planMutation.isPending}
                    onClick={() => planMutation.mutate(planId)}
                  >
                    Aplicar
                  </Button>
                </div>
              </div>
            </Card>

            <Card title="Módulos">
              <Table
                columns={moduleColumns}
                rows={modules}
                rowKey={(m) => m.id}
                emptyMessage="Sin módulos activos."
              />
            </Card>

            <Card title="Usuarios del panel">
              <Table
                columns={userColumns}
                rows={users}
                rowKey={(u) => u.id}
                emptyMessage="Este cliente no tiene usuarios: no entra al panel."
              />
            </Card>
          </div>
        )}
      </div>

      <Modal
        open={confirmSuspend}
        title={`Suspender ${company.name}`}
        onClose={() => setConfirmSuspend(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSuspend(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={suspendMutation.isPending}
              onClick={() => suspendMutation.mutate(false)}
            >
              Suspender
            </Button>
          </>
        }
      >
        <p>
          Si tiene usuarios del panel, dejarán de poder entrar de inmediato aunque tengan la sesión
          abierta. Los datos no se borran y puedes reactivarlo cuando quieras.
        </p>
      </Modal>
    </div>
  )
}
