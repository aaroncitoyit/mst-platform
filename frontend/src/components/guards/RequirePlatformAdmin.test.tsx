import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RequirePlatformAdmin } from './RequirePlatformAdmin'
import { useSessionStore } from '@/stores/sessionStore'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequirePlatformAdmin />}>
          <Route path="/admin" element={<p>Back-office</p>} />
        </Route>
        <Route path="/403" element={<p>Sin acceso</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useSessionStore.getState().clearSession()
})

describe('RequirePlatformAdmin', () => {
  it('deja pasar al personal de MTS', () => {
    useSessionStore.setState({ isPlatformAdmin: true })

    renderAt('/admin')

    expect(screen.getByText('Back-office')).toBeInTheDocument()
  })

  it('desvia a /403 a un usuario normal', () => {
    useSessionStore.setState({ isPlatformAdmin: false })

    renderAt('/admin')

    expect(screen.getByText('Sin acceso')).toBeInTheDocument()
    expect(screen.queryByText('Back-office')).not.toBeInTheDocument()
  })
})
