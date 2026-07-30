<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Rules\PasswordPolicy;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

/**
 * Da de alta un administrador de plataforma (personal de Macedo Tech).
 *
 * La contrasena se pide por consola y nunca se escribe en un archivo
 * versionado, igual que hace run_all.ps1 con la contrasena del rol mts_app.
 */
class CrearAdminPlataforma extends Command
{
    protected $signature = 'mts:crear-admin';

    protected $description = 'Crea un administrador de plataforma para el back-office de MTS';

    public function handle(): int
    {
        $name = $this->ask('Nombre');
        $email = $this->ask('Correo electronico');
        $password = $this->secret('Contrasena (minimo 12, con letras y numeros)');
        $confirmation = $this->secret('Repite la contrasena');

        if ($password !== $confirmation) {
            $this->error('Las contrasenas no coinciden.');

            return self::FAILURE;
        }

        $validator = Validator::make(
            compact('name', 'email', 'password'),
            [
                'name' => ['required', 'string', 'max:150'],
                'email' => ['required', 'email', 'max:150', 'unique:users,email'],
                'password' => ['required', 'string', PasswordPolicy::paraPlataforma()],
            ],
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        // Sin fila en company_user a proposito: un administrador de plataforma
        // no pertenece a ninguna empresa.
        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make($password),
        ]);

        $user->forceFill(['is_platform_admin' => true])->save();

        $this->info("Administrador de plataforma creado: {$user->email}");
        $this->line('Ya puedes entrar con el en el back-office.');

        return self::SUCCESS;
    }
}
