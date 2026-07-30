import { useAuth } from '@/features/auth/useAuth'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

/**
 * Perfil del usuario del cliente.
 *
 * Muestra el ROL (legible: "Administrador", "Vendedor") pero NO la lista de
 * permisos: `gestionar_configuracion` o `crear_usuario` son identificadores
 * internos y en la cara del cliente solo parecen un error. Los permisos siguen
 * usandose para decidir que ve cada uno, simplemente no se le ensenan.
 */
export function ProfilePage() {
  const { user, roles, activeCompany } = useAuth()

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">Mi perfil</h1>

      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="font-semibold text-slate-600">Nombre</dt>
          <dd className="text-slate-800">{user?.name}</dd>

          <dt className="font-semibold text-slate-600">Correo</dt>
          <dd className="text-slate-800">{user?.email}</dd>

          <dt className="font-semibold text-slate-600">Empresa</dt>
          <dd className="text-slate-800">{activeCompany?.name ?? '—'}</dd>

          <dt className="font-semibold text-slate-600">Tu rol</dt>
          <dd>
            {roles.length === 0 ? (
              <span className="text-slate-500">Sin rol asignado</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <Badge key={role} tone="primary">
                    {role}
                  </Badge>
                ))}
              </div>
            )}
          </dd>
        </dl>
      </Card>

      <Card>
        <p className="text-sm text-slate-500">
          Para cambiar tu contraseña o los datos de tu empresa, contacta con Macedo Tech Solutions.
        </p>
      </Card>
    </div>
  )
}
