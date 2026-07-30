<?php

namespace App\Rules;

use Illuminate\Validation\Rules\Password;

/**
 * Reglas de contrasena, en un solo sitio.
 *
 * Se distinguen dos niveles a proposito:
 *
 * - Personal de MTS: su cuenta da acceso a los datos de TODOS los clientes
 *   (Gate::before le concede todos los permisos en todas las empresas). Es el
 *   punto unico de fallo del sistema, y merece exigencia real.
 *
 * - Usuarios de cliente: la contrasena la genera Aaron al dar de alta y se la
 *   comunica al cliente. Exigirle simbolos raros solo consigue que acabe
 *   apuntada en un papel.
 */
class PasswordPolicy
{
    /** Para el personal de MTS: la cuenta que lo puede ver todo. */
    public static function paraPlataforma(): Password
    {
        return Password::min(12)
            ->letters()
            ->numbers()
            // Comprueba contra la lista publica de contrasenas filtradas.
            // Si el servicio no responde, la validacion pasa: no bloquea.
            ->uncompromised();
    }

    /** Para usuarios de cliente. */
    public static function paraCliente(): Password
    {
        return Password::min(10)->letters()->numbers();
    }
}
