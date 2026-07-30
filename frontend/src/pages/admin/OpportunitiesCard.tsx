import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { addOpportunity, deleteOpportunity, updateOpportunity } from '@/features/admin/api'
import { useToast } from '@/components/ui/toastContext'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { formatSoles } from '@/lib/format'
import type { Opportunity, OpportunityStatus } from '@/types/api'

const TONOS: Record<OpportunityStatus, 'neutral' | 'primary' | 'success' | 'danger'> = {
  idea: 'neutral',
  propuesta: 'primary',
  ganada: 'success',
  perdida: 'danger',
}

export function OpportunitiesCard({
  companyId,
  opportunities,
}: {
  companyId: string
  opportunities: Opportunity[]
}) {
  const queryClient = useQueryClient()
  const { notifySuccess, notifyError } = useToast()
  const [abierto, setAbierto] = useState(false)
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }

  const addMutation = useMutation({
    mutationFn: () =>
      addOpportunity(companyId, {
        title,
        estimated_value: value ? Number(value) : null,
      }),
    onSuccess: () => {
      notifySuccess('Oportunidad apuntada')
      setAbierto(false)
      setTitle('')
      setValue('')
      invalidate()
    },
    onError: () => notifyError('No se pudo guardar'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OpportunityStatus }) =>
      updateOpportunity(id, { status }),
    onSuccess: (o) => {
      // Ganar una oportunidad es el momento en que una idea se vuelve ingreso:
      // conviene recordar que hay que reflejarlo como servicio contratado.
      notifySuccess(
        o.status === 'ganada'
          ? 'Ganada. Añádela ahora como servicio contratado para que cuente en tus ingresos.'
          : 'Oportunidad actualizada',
      )
      invalidate()
    },
    onError: () => notifyError('No se pudo actualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteOpportunity,
    onSuccess: () => {
      notifySuccess('Oportunidad eliminada')
      invalidate()
    },
    onError: () => notifyError('No se pudo eliminar'),
  })

  return (
    <Card
      title="Qué más puedo ofrecerle"
      description="Apunta la idea cuando se te ocurra, antes de que se te olvide."
      actions={
        <Button variant="secondary" onClick={() => setAbierto(true)}>
          Apuntar idea
        </Button>
      }
    >
      {opportunities.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">Sin oportunidades apuntadas.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {opportunities.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{o.title}</p>
                {o.estimated_value && (
                  <p className="text-sm text-slate-500">{formatSoles(o.estimated_value)}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={TONOS[o.status]}>{o.status}</Badge>
                <select
                  value={o.status}
                  onChange={(event) =>
                    statusMutation.mutate({
                      id: o.id,
                      status: event.target.value as OpportunityStatus,
                    })
                  }
                  aria-label={`Estado de ${o.title}`}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-primary"
                >
                  <option value="idea">Idea</option>
                  <option value="propuesta">Propuesta enviada</option>
                  <option value="ganada">Ganada</option>
                  <option value="perdida">Perdida</option>
                </select>
                <Button
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(o.id)}
                  aria-label={`Eliminar ${o.title}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={abierto}
        title="Apuntar una oportunidad"
        onClose={() => setAbierto(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!title.trim()}
              loading={addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Qué le podrías ofrecer"
            placeholder="Le vendría bien una tienda online"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Input
            label="Valor estimado (S/), opcional"
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
      </Modal>
    </Card>
  )
}
