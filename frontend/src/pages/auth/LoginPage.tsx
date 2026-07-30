import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/features/auth/useAuth'
import { useToast } from '@/components/ui/toastContext'
import { applyApiErrors } from '@/lib/formErrors'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuthLayout } from './AuthLayout'

// Mismas reglas que validate() en AuthController::login
const schema = z.object({
  email: z.email('Correo no válido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { signIn } = useAuth()
  const { notifyError } = useToast()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    try {
      await signIn(values)
    } catch (error) {
      const message = applyApiErrors(error, setError)
      if (message) notifyError(message)
    }
  }

  return (
    <AuthLayout
      title="Iniciar sesión"
      footer={
        // El alta de empresas la hace MTS desde el back-office, asi que no se
        // ofrece registro. La pantalla /register sigue existiendo por si algun
        // dia se reabre el autoservicio (config/mts.php en el backend).
        <>¿Necesitas una cuenta? Contacta con Macedo Tech Solutions.</>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
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
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
          Entrar
        </Button>
      </form>
    </AuthLayout>
  )
}
