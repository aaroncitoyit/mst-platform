<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AuthController extends Controller
{
   public function register(Request $request)
    {
        $data = $request->validate([
            'company_name' => ['required', 'string', 'max:150'],
            'name' => ['required', 'string', 'max:150'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $result = DB::transaction(function () use ($data) {
            $company = Company::create([
                'name' => $data['company_name'],
                'slug' => Str::slug($data['company_name']).'-'.Str::random(6),
            ]);

            // Activa el contexto de empresa ANTES de tocar cualquier tabla con RLS
            DB::statement("SET app.current_company_id = '{$company->id}'");
            app(\Spatie\Permission\PermissionRegistrar::class)->setPermissionsTeamId($company->id);

            // Ahora si podemos sembrar los roles base de esta empresa
            DB::select('select seed_default_roles(?::uuid)', [$company->id]);

            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => Hash::make($data['password']),
            ]);

            DB::table('company_user')->insert([
                'company_id' => $company->id,
                'user_id' => $user->id,
                'is_owner' => true,
            ]);

            $adminRole = Role::where('company_id', $company->id)->where('name', 'Administrador')->first();
            $user->assignRole($adminRole);

            return ['company' => $company, 'user' => $user];
        });

        $token = $result['user']->createToken('api-token')->plainTextToken;

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

        $companies = DB::select('select * from get_user_companies(?::uuid)', [$user->id]);

        $token = $user->createToken('api-token')->plainTextToken;

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
        return response()->json([
            'user' => $request->user(),
            'roles' => $request->user()->getRoleNames(),
        ]);
    }
}