<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\PublicCatalogController;
use App\Http\Controllers\Api\Admin\ApiKeyController;
use App\Http\Controllers\Api\Admin\ClientNoteController;
use App\Http\Controllers\Api\Admin\ClientServiceController;
use App\Http\Controllers\Api\Admin\CompanyAdminController;
use App\Http\Controllers\Api\Admin\OpportunityController;
use App\Http\Controllers\Api\Admin\PlatformController;

Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:10,1');

// 4 intentos por minuto y por IP. Sin esto, cualquiera puede probar
// contrasenas sin freno contra la cuenta del back-office, que da acceso a los
// datos de TODOS los clientes.
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:4,1');

// ------------------------------------------
// API publica: la consume la web del cliente
// ------------------------------------------
// Sin usuario logueado. Se identifica con X-MTS-Key, que es una clave de SITIO
// (viaja en el navegador o en el servidor de la web) y por tanto NO es un
// secreto: estas rutas solo pueden leer el catalogo publicado.
// El throttle es obligatorio: es lo unico abierto a internet.
Route::middleware(['api.key', 'throttle:60,1'])
    ->prefix('public')
    ->group(function () {
        Route::get('/catalogo', [PublicCatalogController::class, 'index']);
    });

// Autenticado, pero SIN contexto de empresa: lo que el frontend necesita para
// arrancar cuando todavia no hay empresa activa.
Route::middleware(['auth:sanctum', 'user.active'])->group(function () {
    Route::get('/my-companies', [CompanyController::class, 'mine']);
    // Cerrar sesion no debe exigir empresa activa: si al usuario le revocaron el
    // acceso a la empresa que tenia seleccionada, igual debe poder revocar su token.
    Route::post('/logout', [AuthController::class, 'logout']);
});

// Autenticado y con empresa activa (header X-Company-Id obligatorio)
Route::middleware(['auth:sanctum', 'user.active', 'company.context'])->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/company', [CompanyController::class, 'current']);

    // Catalogo que gestiona el propio cliente
    Route::get('/products', [ProductController::class, 'index']);
    Route::patch('/products/{id}', [ProductController::class, 'update']);
});

// Back-office de MTS. platform.admin es la unica barrera que protege
// admin_list_companies(), que cruza todas las empresas.
Route::middleware(['auth:sanctum', 'user.active', 'platform.admin'])
    ->prefix('admin')
    ->group(function () {
        Route::get('/me', [PlatformController::class, 'me']);
        Route::get('/stats', [PlatformController::class, 'stats']);
        Route::get('/plans', [PlatformController::class, 'plans']);

        Route::get('/companies', [CompanyAdminController::class, 'index']);
        Route::post('/companies', [CompanyAdminController::class, 'store']);
        Route::get('/companies/{id}', [CompanyAdminController::class, 'show']);
        Route::patch('/companies/{id}', [CompanyAdminController::class, 'update']);
        Route::put('/companies/{id}/plan', [CompanyAdminController::class, 'changePlan']);
        Route::post('/companies/{id}/impersonate', [CompanyAdminController::class, 'impersonate']);

        // Cartera: servicios contratados, oportunidades e historial
        Route::get('/services', [ClientServiceController::class, 'catalog']);
        Route::post('/companies/{id}/services', [ClientServiceController::class, 'store']);
        Route::patch('/client-services/{id}', [ClientServiceController::class, 'update']);
        Route::post('/client-services/{id}/renew', [ClientServiceController::class, 'renew']);
        Route::delete('/client-services/{id}', [ClientServiceController::class, 'destroy']);

        Route::post('/companies/{id}/opportunities', [OpportunityController::class, 'store']);
        Route::patch('/opportunities/{id}', [OpportunityController::class, 'update']);
        Route::delete('/opportunities/{id}', [OpportunityController::class, 'destroy']);

        // Claves con las que la web del cliente habla con MTS
        Route::get('/companies/{id}/api-keys', [ApiKeyController::class, 'index']);
        Route::post('/companies/{id}/api-keys', [ApiKeyController::class, 'store']);
        Route::delete('/companies/{id}/api-keys/{key}', [ApiKeyController::class, 'revoke']);

        Route::post('/companies/{id}/notes', [ClientNoteController::class, 'store']);
        Route::delete('/notes/{id}', [ClientNoteController::class, 'destroy']);
    });
