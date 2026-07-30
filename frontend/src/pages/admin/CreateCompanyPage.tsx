import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { z } from 'zod'
import { createCompany, listPlans } from '@/features/admin/api'
import { applyApiErrors } from '@/lib/formErrors'
import { useToast } from '@/components/ui/toastContext'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

/**
 * Alta de cliente.
 *
 * Solo el nombre es obligatorio. El acceso a MTS Platform (plan + usuario) es
 * un extra plegado: la mayoría de clientes tienen una web y un mantenimiento,
 * y no entran a ningún panel. Obligar a inventarse un correo por cada uno
 * haría esto molesto de usar.
 */
const schema = z.object({
  company_name: z.string().min(1, 'El nombre del cliente es obligatorio').max(150),
  plan_id: z.string().optional(),
  owner_name: z.string().max(150).optional(),
  owner_email: z.union([z.literal(''), z.email('Correo no válido')]).optional(),
  owner_password: z
    .union([z.literal(''), z.string().min(8, 'Mínimo 8 caracteres')])
    .optional(),
})

type FormValues = z.infer<typeof schema>

export function CreateCompanyPage() {
  const navigate = useNavigate()
  const { notifySuccess, notifyError } = useToast()
  const [conAcceso, setConAcceso] = useState(false)
  const { data: plans } = useQuery({ queryKey: ['admin', 'plans'], queryFn: listPlans })

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    try {
      const company = await createCompany({
        company_name: values.company_name,
        // Si no se despliega la sección de acceso, no se manda nada de esto
        plan_id: conAcceso ? values.plan_id || null : null,
        owner_name: conAcceso ? values.owner_name || null : null,
        owner_email: conAcceso ? values.owner_email || null : null,
        owner_password: conAcceso ? values.owner_password || null : null,
      })
      notifySuccess('Cliente registrado')
      navigate(`/admin/companies/${company.id}`, { replace: true })
    } catch (error) {
      const message = applyApiErrors(error, setError)
      if (message) notifyError(message)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link to="/admin/companies" className="text-sm text-primary hover:underline">
          ← Clientes
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Nuevo cliente</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
        <Card>
          <Input
            label="Nombre del cliente"
            placeholder="Ferretería El Tornillo"
            error={errors.company_name?.message}
            {...register('company_name')}
          />
          <p className="mt-3 text-sm text-slate-500">
            Con esto basta. Los servicios que le vendes se añaden después, en su ficha.
          </p>
        </Card>

        <Card
          title="Acceso a MTS Platform"
          description="Solo si este cliente va a entrar a su propio panel. La mayoría no lo necesita."
          actions={
            <Button type="button" variant="secondary" onClick={() => setConAcceso((v) => !v)}>
              {conAcceso ? 'Quitar acceso' : 'Añadir acceso'}
            </Button>
          }
        >
          {conAcceso ? (
            <div className="flex flex-col gap-4">
              <Select
                label="Plan contratado"
                options={[
                  { value: '', label: 'Elige un plan...' },
                  ...(plans ?? []).map((plan) => ({
                    value: plan.id,
                    label: `${plan.name} — ${plan.modules.map((m) => m.slug.toUpperCase()).join(', ') || 'sin módulos'}`,
                  })),
                ]}
                {...register('plan_id')}
              />
              <Input
                label="Nombre del responsable"
                error={errors.owner_name?.message}
                {...register('owner_name')}
              />
              <Input
                label="Correo electrónico"
                type="email"
                error={errors.owner_email?.message}
                {...register('owner_email')}
              />
              <Input
                label="Contraseña provisional"
                type="text"
                autoComplete="off"
                error={errors.owner_password?.message}
                {...register('owner_password')}
              />
              <p className="text-sm text-slate-500">
                Se muestra en claro a propósito: tendrás que comunicársela al cliente.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sin acceso al panel.</p>
          )}
        </Card>

        <div className="flex justify-end gap-2">
          <Link to="/admin/companies">
            <Button variant="secondary" type="button">
              Cancelar
            </Button>
          </Link>
          <Button type="submit" loading={isSubmitting}>
            Registrar cliente
          </Button>
        </div>
      </form>
    </div>
  )
}
