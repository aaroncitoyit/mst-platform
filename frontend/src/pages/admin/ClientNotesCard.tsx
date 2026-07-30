import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { addNote, deleteNote } from '@/features/admin/api'
import { useToast } from '@/components/ui/toastContext'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/format'
import type { ClientNote } from '@/types/api'

export function ClientNotesCard({
  companyId,
  notes,
}: {
  companyId: string
  notes: ClientNote[]
}) {
  const queryClient = useQueryClient()
  const { notifyError } = useToast()
  const [body, setBody] = useState('')

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }

  const addMutation = useMutation({
    mutationFn: () => addNote(companyId, body),
    onSuccess: () => {
      setBody('')
      invalidate()
    },
    onError: () => notifyError('No se pudo guardar la nota'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteNote,
    onSuccess: invalidate,
    onError: () => notifyError('No se pudo eliminar la nota'),
  })

  return (
    <Card
      title="Historial"
      description="Qué se habló y cuándo. Dentro de seis meses lo agradecerás."
    >
      <div className="flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          placeholder="Llamada del 25/07: le interesa la tienda, pide propuesta para agosto."
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary-soft"
        />
        <div className="flex justify-end">
          <Button
            disabled={!body.trim()}
            loading={addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            Añadir nota
          </Button>
        </div>
      </div>

      {notes.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-slate-100 border-t border-slate-100">
          {notes.map((note) => (
            <li key={note.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm whitespace-pre-wrap text-slate-800">{note.body}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatDate(note.created_at)}
                  {note.author_name && ` · ${note.author_name}`}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => deleteMutation.mutate(note.id)}
                aria-label="Eliminar nota"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
