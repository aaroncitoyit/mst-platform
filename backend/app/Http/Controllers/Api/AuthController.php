<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\CompanyProvisioner;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    /**
     * Caducidad de los tokens, en minutos.
     *
     * Un token robado sirve hasta que caduca, asi que la duracion se reparte
     * segun lo que se pueda perder:
     *
     * - Personal de MTS: 12 horas. Su cuenta ve los datos de TODOS los clientes
     *   y ademas puede entrar a cualquier panel. Volver a entrar una vez al dia
     *   es un precio pequeño por acotar ese riesgo.
     * - Usuarios de cliente: 7 dias. Rosa entra una vez por semana a mantener
     *   su catalogo; pedirle la contrasena cada dia solo conseguiria que la
     *   apunte en un papel al lado del ordenador.
     *
     * Sanctum no tiene refresco de tokens: al caducar hay que volver a entrar.
     */
    private const CADUCIDAD_PLATAFORMA = 60 * 12;

    private const CADUCIDAD_CLIENTE = 60 * 24 * 7;

    public function __construct(private CompanyProvisioner $provisioner)
    {
    }

    /** Emite un token con la caducidad que corresponde a quien lo pide. */
    private function emitirToken(User $user): string
    {
        $minutos = $user->is_platform_admin
            ? self::CADUCIDAD_PLATAFORMA
            : self::CADUCIDAD_CLIENTE;

        return $user->createToken('api-token', ['*'], now()->addMinutes($minutos))->plainTextToken;
    }

    /**
     * Registro por autoservicio.
     *
     * Desactivado por defecto: el alta de empresas se hace desde el back-office
     * (config/mts.php). El endpoint y la pantalla del frontend se mantienen por
     * si algun dia se quiere abrir el autoservicio.
     */
    public function register(Request $request)
    {
        if (! config('mts.self_registration')) {
            return response()->json([
                'message' => 'El registro esta cerrado. Contacta con Macedo Tech Solutions.',
            ], 403);
        }

        $data = $request->validate([
            'company_name' => ['required', 'string', 'max:150'],
            'name' => ['required', 'string', 'max:150'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $plan = DB::table('plans')
            ->where('slug', config('mts.default_plan'))
            ->where('is_active', true)
            ->first();

        if (! $plan) {
            return response()->json(['message' => 'No hay un plan por defecto configurado.'], 500);
        }

        $result = $this->provisioner->provision($data['company_name'], $plan->id, [
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
        ]);

        $token = $this->emitirToken($result['user']);

        return response()->json([
            'user' => $result['user'],
            'company' => $result['company'],
            'token' => $token,
        ], 201);
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Credenciales invalidas'], 401);
        }

        // Un usuario desactivado desde el back-office no entra
        if (! $user->is_active) {
            return response()->json(['message' => 'Tu usuario esta desactivado.'], 403);
        }

        // ------------------------------------------------------------------
        // PUNTO DE ENGANCHE DEL SEGUNDO FACTOR
        // ------------------------------------------------------------------
        // Hoy se entra solo con contrasena. Cuando se añada un segundo factor,
        // va exactamente AQUI: despues de validar la contrasena (para no
        // revelar si el correo existe) y antes de emitir el token.
        //
        // El contrato con el frontend ya esta decidido: si falta el codigo se
        // responde 422 con { requiere_codigo: true }, NUNCA 401. La diferencia
        // importa: 401 significa "credenciales malas" y 422 significa "la
        // contrasena era correcta, ahora dame el codigo". El frontend necesita
        // distinguirlo para pedir el codigo en vez de dar un error confuso.
        //
        // El mecanismo de entrega (app de autenticacion, codigo por WhatsApp o
        // por correo) queda detras de ese punto y se puede cambiar sin tocar
        // nada mas del login.
        //
        // Nota tecnica para cuando se retome: un codigo enviado por SMS o
        // WhatsApp es MAS DEBIL que el de una app de autenticacion, por el robo
        // de SIM y la intercepcion de mensajes. El de la app no viaja por
        // ningun sitio: se calcula en el telefono.
        // ------------------------------------------------------------------

        // Los administradores de plataforma no pertenecen a ninguna empresa
        $companies = $user->is_platform_admin
            ? []
            : DB::select('select * from get_user_companies(?::uuid)', [$user->id]);

        $token = $this->emitirToken($user);

        return response()->json([
            'user' => $user,
            'companies' => $companies,
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Sesion cerrada']);
    }

    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'user' => $user,
            // Empresa activa, para que el frontend no dependa de la lista completa
            'company' => DB::table('companies')->where('id', $request->header('X-Company-Id'))->first(),
            'roles' => $user->getRoleNames(),
            // Los permisos alimentan el control de acceso de la UI (solo UX:
            // la seguridad real vive en Spatie Permission + RLS).
            // Un administrador de plataforma que entra a dar soporte no tiene
            // roles en la empresa, asi que se le dan todos los permisos para
            // que la interfaz del cliente le funcione entera.
            'permissions' => $user->is_platform_admin
                ? DB::table('permissions')->pluck('name')
                : $user->getAllPermissions()->pluck('name'),
        ]);
    }
}
