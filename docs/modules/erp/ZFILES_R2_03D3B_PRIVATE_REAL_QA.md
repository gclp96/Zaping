# ZFILES-R2-03D3B — QA física local de copia privada y recuperación (sin SQL)

**Issue:** #237. **Base:** PR #247 (03D3A) → #243 (03D2B). **Estado:** laboratorio opt-in sin despliegue, sin CI real, sin rutas HTTP, sin AVAILABLE.

## Alcance y frontera de confianza

Este incremento ejecuta **S3 real** contra **dos buckets Cloudflare QA sintéticos**: `zaping-quarantine-qa` (HEAD+GET solamente con token Object Read) y `zaping-private-qa` (HEAD, PUT condicional y GET, con **otro token** Object Read & Write limitado al bucket privado). No toca documentos de clientes, PostgreSQL, PAC, ERP, ClamAV, endpoints ni descargas.

En el laboratorio se genera una **firma Ed25519 efímera de prueba** para ejercitar el núcleo `ZfilesVerifiedPrivateCopyCore`. **No demuestra que ClamAV escaneó el PDF**, que exista un job SQL CONSUMED ni que el receipt esté autorizado por el servicio real. NO reutilizar esa firma, identidad ni política fuera del laboratorio.

El PDF debe ser **sintético**, con copia original local rastreable cuyo SHA-256 y longitud se comprobó **sin obtener dichos valores exclusivamente del mismo objeto R2**. Si el PDF local se descargó desde R2 y no se conserva su procedencia independiente, esta prueba física aún puede ejecutar el cotejo, pero **no constituye evidencia independiente del origen**; deja el gate documental abierto.

## Modo explícito CREATE_ONCE

En la primera ejecución para un target privado aún ausente, con aprobación humana para crear **un solo objeto QA**:

1. Validar flags, bucket exacto, identidad S3 distinta, Company/Document/Attachment sintéticos y ruta del archivo local `quarantine_<company>_<document>_<attachment>.pdf`.
2. Validar bytes PDF, SHA-256/tamaño locales antes de abrir clientes S3.
3. `HeadObject` del target privado debe devolver 404; otro estado (incluido 403) bloquea. Esto es sólo preflight, **no prueba ausencia definitiva de escritura en vuelo**.
4. El núcleo comprueba firma de laboratorio, HEAD+GET cuarentena `IfMatch`, SHA/tamaño/magic bytes; realiza **un solo PUT** `IfNoneMatch: '*'` al bucket privado y verifica GET completo posterior.
5. Un segundo `PutObject` idéntico y condicional `IfNoneMatch: '*'` **debe rechazar 412**, comprobando protección create-once física. `409` por Bucket Lock **no equivale** al test de 412 (queda no verificado).
6. Simular intervalo anterior a COMMIT de PostgreSQL **sin abrir ninguna conexión DB**: `reconcileExistingVerifiedBytes` revalida firma, source HEAD+GET y private GET sin nueva escritura. Resultado de QA físico únicamente, nunca AVAILABLE.

**Atención:** CREATE_ONCE deja intencionadamente **un objeto sintético existente** en `zaping-private-qa` para probar recuperación. No lo borra ni sobrescribe; un operador documentará y decidirá su disposición. Si falla después del PUT, usar sólo el modo RECOVER_EXISTING, no repetir CREATE_ONCE ni generar otro objeto sin control.

## Modo explícito RECOVER_EXISTING

Exige el mismo fixture sintético y token privado acotado, **sin aprobación de escritura**, llama a `reconcileExistingVerifiedBytes`; no realiza PUT, COPY, DELETE ni LIST. Si el objeto está ausente, corrupto, no coincide con la evidencia o falla la lectura, **FAIL cerrado**; no se marca AVAILABLE.

## Preparación Cloudflare manual

Antes de usar cualquier token:

- Ambos buckets QA deben existir, ser privados, sin publicación web ni dominios. Ningún bucket real.
- Token A `Object Read only`, limitado **únicamente a `zaping-quarantine-qa`**; se probó HEAD/GET+SHA y HEAD privado 403 en 03C3A. Revisar visualmente política y ausencia de escritura en Dashboard.
- Token B **distinto** `Object Read & Write` limitado **únicamente a `zaping-private-qa`**. Este permiso incluye potencialmente **overwrite y DELETE**: adecuado sólo para laboratorio QA, **insuficiente** como política de custodia inmutable de producción. No reutilizarlo para uploader, API ni scanner.
- No usar token de administrador, `all buckets`, AWS credentials por defecto, token de cuarentena de escritura ni el antiguo token privado de lectura. Registrar las restricciones en una evidencia **sin secretos**.
- No activar Bucket Lock ni cambiar lifecycle/retención sin revisión formal; no hacer limpieza automática.
- S3 credentials nunca se copian a chat, PR, CI ni ficheros. El Secret Access Key sólo se entrega al crear el token; si se perdió, rotar/generar uno nuevo con el mismo scope.

## Ejecución local Windows / PowerShell

Desde worktree aislado de la rama de PR 03D3B, `app/api`, ejecutar `npm ci`. No modificar `main` ni resetear el worktree principal. **No ejecutar CREATE_ONCE** hasta haber confirmado en el Dashboard ambos permisos y el origen sintético, y que el target derivado aún no pertenece a un archivo de cliente.

```powershell
$ErrorActionPreference = 'Stop'
$env:RUN_ZFILES_R2_03D3B_REAL_QA = '1'
$env:R2_PROMOTER_QA_SYNTHETIC_ONLY_CONFIRMED = '1'
$env:R2_SCANNER_QA_READ_ONLY_CONFIRMED = '1'
$env:R2_PROMOTER_QA_PRIVATE_SCOPE_CONFIRMED = '1'
$env:R2_PRIVATE_BUCKET = 'zaping-private-qa'
$env:R2_QUARANTINE_BUCKET = 'zaping-quarantine-qa'
$env:R2_JURISDICTION = 'default'

# MODE: CREATE_ONCE (escritura sintética aprobada) o RECOVER_EXISTING (solo lectura).
$env:R2_PROMOTER_QA_MODE = (Read-Host 'Modo CREATE_ONCE o RECOVER_EXISTING').Trim()
if ($env:R2_PROMOTER_QA_MODE -eq 'CREATE_ONCE') {
    $confirm = Read-Host 'Confirmar escritura de UN objeto QA sintetico: escribir CREATE_ONCE'
    if ($confirm -ne 'CREATE_ONCE') { throw 'QA CREATE_ONCE no autorizado' }
    $env:R2_PROMOTER_QA_CREATE_ONCE_APPROVED = '1'
}

$env:R2_ACCOUNT_ID = (Read-Host 'R2 QA account ID').Trim().ToLowerInvariant()
$env:R2_QUARANTINE_SCAN_COMPANY_ID = (Read-Host 'Company UUID sintetico').Trim().ToLowerInvariant()
$env:R2_QUARANTINE_SCAN_DOCUMENT_ID = (Read-Host 'Document UUID sintetico').Trim().ToLowerInvariant()
$env:R2_QUARANTINE_SCAN_ATTACHMENT_ID = (Read-Host 'Attachment UUID sintetico').Trim().ToLowerInvariant()
$env:R2_PROMOTER_QA_LOCAL_ORIGINAL_PDF = (Read-Host 'Ruta completa PDF ORIGINAL sintetico').Trim()
$env:R2_QUARANTINE_SCAN_SHA256 = (
    Get-FileHash -LiteralPath $env:R2_PROMOTER_QA_LOCAL_ORIGINAL_PDF -Algorithm SHA256
).Hash.ToLowerInvariant()
$env:R2_QUARANTINE_SCAN_SIZE_BYTES = [string](
    Get-Item -LiteralPath $env:R2_PROMOTER_QA_LOCAL_ORIGINAL_PDF
).Length

function Get-HiddenR2Credential([string]$label) {
    return ([pscredential]::new(
        'r2',
        (Read-Host $label -AsSecureString)
    )).GetNetworkCredential().Password
}
$env:R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID = Get-HiddenR2Credential 'Quarantine READ Access Key ID'
$env:R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY = Get-HiddenR2Credential 'Quarantine READ Secret Access Key'
$env:R2_PROMOTER_QA_PRIVATE_ACCESS_KEY_ID = Get-HiddenR2Credential 'Private QA READ WRITE Access Key ID'
$env:R2_PROMOTER_QA_PRIVATE_SECRET_ACCESS_KEY = Get-HiddenR2Credential 'Private QA READ WRITE Secret Access Key'

try {
    npm run test:e2e -- --runInBand test/zfiles-r2-private-write-real.qa.e2e-spec.ts
} finally {
    @(
      'RUN_ZFILES_R2_03D3B_REAL_QA',
      'R2_PROMOTER_QA_SYNTHETIC_ONLY_CONFIRMED',
      'R2_SCANNER_QA_READ_ONLY_CONFIRMED',
      'R2_PROMOTER_QA_PRIVATE_SCOPE_CONFIRMED',
      'R2_PROMOTER_QA_CREATE_ONCE_APPROVED',
      'R2_PROMOTER_QA_MODE',
      'R2_ACCOUNT_ID',
      'R2_PRIVATE_BUCKET',
      'R2_QUARANTINE_BUCKET',
      'R2_JURISDICTION',
      'R2_QUARANTINE_SCAN_COMPANY_ID',
      'R2_QUARANTINE_SCAN_DOCUMENT_ID',
      'R2_QUARANTINE_SCAN_ATTACHMENT_ID',
      'R2_QUARANTINE_SCAN_SHA256',
      'R2_QUARANTINE_SCAN_SIZE_BYTES',
      'R2_PROMOTER_QA_LOCAL_ORIGINAL_PDF',
      'R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID',
      'R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY',
      'R2_PROMOTER_QA_PRIVATE_ACCESS_KEY_ID',
      'R2_PROMOTER_QA_PRIVATE_SECRET_ACCESS_KEY'
    ) | ForEach-Object {
      Remove-Item "Env:$_" -ErrorAction SilentlyContinue
    }
}
```

**Sólo reportar** la última línea PASS de Jest o `ZFILES-R2-03D3B real QA NOT VERIFIED [ETAPA]`. No compartir capturas de prompts que revelen cuenta, credenciales, nombres de objetos, rutas locales ni hashes. Las excepciones SDK están saneadas en códigos `CONFIG`, `SOURCE`, `CLIENTS`, `PRECHECK`, `TARGET_ALREADY_EXISTS`, `STAGE`, `DUPLICATE`, `DUPLICATE_ACCEPTED`, `RECOVERY`.

## Gates / no sustituye 03D3 completo

- [ ] CI API/Web/Historical upgrade y Jest de validación local OFFLINE, sobre HEAD exacto.
- [ ] Token A/B scope revisado visualmente en Dashboard, sin permisos extra.
- [ ] CREATE_ONCE en Cloudflare QA real con SHA/read-back y 412 de PUT duplicado; fijar evidencia del nuevo objeto sintético.
- [ ] RECOVER_EXISTING en otra ejecución local, sin PUT.
- [ ] Procedencia original del PDF rastreable; no inferir independencia de archivo descargado de R2.
- [ ] Condiciones 409 Bucket Lock, 403, timeout/caída antes o después de PUT, fuente/destino corruptos, concurrencia entre promotores y fallo SQL real: **todavía pendientes** de otras suites QA y mecanismos de recovery controlados.
- [ ] Revisión humana independiente de tokens, custodia (anti-overwrite/delete) y funciones `SECURITY DEFINER` antes de merge/despliegue.
- [ ] Sin ejecución de workers reales, sin R2 producción, sin migraciones, sin AVAILABLE, sin URLs firmadas/descargas.

Fuentes: https://developers.cloudflare.com/r2/api/s3/extensions/ · https://developers.cloudflare.com/r2/reference/consistency/ · https://developers.cloudflare.com/r2/api/tokens/
