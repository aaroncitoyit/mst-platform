import { LogOut } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/components/ui/Button'
import { CompanySwitcher } from './CompanySwitcher'

export function Topbar() {
  const { user, signOut } = useAuth()

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-4 border-b border-slate-200 bg-white px-5">
      <CompanySwitcher />

      <span className="hidden text-sm text-slate-500 sm:inline" title={user?.email}>
        {user?.name}
      </span>

      <Button variant="ghost" onClick={() => void signOut()}>
        <LogOut className="size-4" aria-hidden="true" />
        Salir
      </Button>
    </header>
  )
}
