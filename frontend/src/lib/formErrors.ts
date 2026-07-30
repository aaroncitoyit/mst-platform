import axios from 'axios'
import type { UseFormSetError, FieldValues, Path } from 'react-hook-form'

type LaravelValidationError = {
  message: string
  errors?: Record<string, string[]>
}

/**
 * Traduce un error de axios a errores de campo de react-hook-form.
 *
 * Laravel devuelve 422 con { message, errors: { campo: [mensajes] } } cuando
 * falla validate(). Todo lo demas (401, 500, red caida) se devuelve como texto
 * para mostrarlo en un Toast.
 *
 * @returns el mensaje general si no se pudo mapear a campos, o null si si se pudo.
 */
export function applyApiErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (!axios.isAxiosError(error)) {
    return 'Ocurrió un error inesperado'
  }

  if (!error.response) {
    return 'No se pudo conectar con el servidor'
  }

  const data = error.response.data as LaravelValidationError | undefined

  if (error.response.status === 422 && data?.errors) {
    for (const [field, messages] of Object.entries(data.errors)) {
      setError(field as Path<T>, { type: 'server', message: messages[0] })
    }
    return null
  }

  return data?.message ?? 'Ocurrió un error inesperado'
}
