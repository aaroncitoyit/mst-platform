<#
==========================================
 Funciones compartidas por los scripts de despliegue.
 No se ejecuta suelto: los demas lo cargan con "dot sourcing".
==========================================
#>

function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Ok($texto)   { Write-Host "    OK   $texto" -ForegroundColor Green }
function Nota($texto) { Write-Host "    --   $texto" -ForegroundColor DarkGray }

<#
 Ejecuta un comando externo que PUEDE fallar sin que eso sea un problema
 (tipicamente "gcloud ... describe" para ver si un recurso ya existe).

 Existe por un motivo poco evidente de Windows PowerShell 5.1: al redirigir la
 salida de error de un ejecutable nativo (2>$null), cada linea se convierte en
 un ErrorRecord. Con $ErrorActionPreference = 'Stop' eso es un error terminante
 y ABORTA el script — justo en el caso normal, cuando gcloud informa de que el
 recurso todavia no existe y lo que toca es crearlo.

 Devuelve la salida del comando, o $null si termino con codigo distinto de 0.
#>
function Intentar([scriptblock]$bloque) {
    $previo = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $salida = & $bloque 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        return $salida
    } finally {
        $ErrorActionPreference = $previo
    }
}

# Igual que Intentar, pero solo interesa si funciono o no.
function Existe([scriptblock]$bloque) {
    $salida = Intentar $bloque
    return ($null -ne $salida)
}

<#
 Guarda un valor en Secret Manager, creando el secreto si no existia.

 Se escribe a un archivo temporal y no se pasa por tuberia porque PowerShell le
 anade BOM y salto de linea a lo que va por el pipe, y esos bytes de mas acaban
 DENTRO de la contrasena. El sintoma seria un "password authentication failed"
 con la contrasena correcta a la vista.
#>
function Guardar-Secreto($nombre, $valor, $proyecto, $cuenta) {
    if (-not (Existe { gcloud secrets describe $nombre --project $proyecto })) {
        gcloud secrets create $nombre --replication-policy automatic --project $proyecto | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el secreto '$nombre'." }
    }

    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        [System.IO.File]::WriteAllText($tmp, $valor, (New-Object System.Text.UTF8Encoding($false)))
        gcloud secrets versions add $nombre --data-file=$tmp --project $proyecto | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "No se pudo guardar el valor de '$nombre'." }
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }

    # Destruir las versiones anteriores. NO es limpieza cosmetica:
    #
    # El plan gratuito de Secret Manager son 6 VERSIONES ACTIVAS en total, y
    # aqui se guardan 5 secretos. Como este script esta pensado para relanzarse
    # (rotar una clave = volver a ejecutarlo), sin esto la segunda ejecucion
    # dejaria 10 versiones vivas y empezaria a facturar ~0,06 USD por version y
    # mes. Poco dinero, pero rompe el "todo a cero" y crece en cada relanzada.
    #
    # Y de paso: una credencial vieja que sigue accesible es una credencial que
    # sigue siendo un riesgo. El valor bueno vive en backend/.env.neon.
    $versiones = Intentar {
        gcloud secrets versions list $nombre --project $proyecto `
            --filter "state:ENABLED" --format "value(name)" --sort-by "~name"
    }

    $lista = @($versiones | Where-Object { $_ })

    if ($lista.Count -gt 1) {
        foreach ($vieja in $lista[1..($lista.Count - 1)]) {
            Intentar {
                gcloud secrets versions destroy $vieja --secret $nombre `
                    --project $proyecto --quiet
            } | Out-Null
        }
    }

    if ($cuenta) {
        Intentar {
            gcloud secrets add-iam-policy-binding $nombre `
                --member "serviceAccount:$cuenta" `
                --role "roles/secretmanager.secretAccessor" `
                --project $proyecto
        } | Out-Null
    }
}

# Lee un archivo .env a una tabla hash. Se usa para que el despliegue y tus
# comandos "artisan --env=neon" no puedan usar valores distintos.
function Leer-Env($ruta) {
    if (-not (Test-Path $ruta)) {
        throw "No se encontro $ruta. Copia backend/.env.example, rellena los valores reales y vuelve a lanzar."
    }

    $valores = @{}
    Get-Content $ruta | ForEach-Object {
        if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') {
            $valores[$matches[1]] = $matches[2].Trim().Trim('"')
        }
    }
    return $valores
}
