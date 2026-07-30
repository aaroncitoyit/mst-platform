import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '@/features/auth/useAuth'
import { useToast } from '@/components/ui/toastContext'
import { applyApiErrors } from '@/lib/formErrors'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from './AuthLayout'

// Mismas reglas que validate() en AuthController::register
const schema = z.object({
  company_name: z.string().min(1, 'El nombre de la empresa es obligatorio').max(150),
  name: z.string().min(1, 'Tu nombre es obligatorio').max(150),
  email: z.email('Correo no válido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
})

type FormValues = z.infer<typeof schema>

export function RegisterPage() {
  const { signUp } = useAuth()
  const { notifyError } = useToast()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    try {
      await signUp(values)
    } catch (error) {
      const message = applyApiErrors(error, setError)
      if (message) notifyError(message)
    }
  }

  return (
    <AuthLayout
      title="Registra tu empresa"
      subtitle="Crearemos la empresa y tu usuario como administrador."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Input
          label="Nombre de la empresa"
          autoComplete="organization"
          error={errors.company_name?.message}
          {...register('company_name')}
        />
        <Input
          label="Tu nombre"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <Input
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
          Crear cuenta
        </Button>
      </form>
    </AuthLayout>
  )
}
