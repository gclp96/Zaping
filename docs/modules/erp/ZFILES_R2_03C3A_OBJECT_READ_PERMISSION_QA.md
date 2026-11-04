# ZFILES-R2-03C3A — Validación real de credencial Object Read de cuarentena (QA)

**Issue #233.** **PR Draft apilado sobre #232 → #230 → #228 → #225.** No merge, no activación de adjuntos.

## Objetivo

Comprobar que un token S3 de Cloudflare R2 restringido a `zaping-quarantine-qa` pueda ejecutar `HeadObject` y `GetObject` de un **único objeto sintético conocido**, verificando ETag condicionado, tamaño real y SHA-256 independiente. Después se intenta únicamente `HeadObject` sobre **un objeto sintético conocido y existente** de `zaping-private-qa`, con las MISMAS credenciales de cuarentena. Sólo un `403 AccessDenied` o `403 Forbidden` se acepta como evidencia de denegación de lectura del bucket privado.

Una respuesta `404/NoSuchKey`, `412`, timeout o error de endpoint **NO** es evidencia de permisos correctos: la prueba falla cerrada. Del mismo modo, una lectura positiva de cuarentena no demuestra que el token carece de permisos de escritura. La denegación de escritura se valida con la **política de permisos del token en el Dashboard de Cloudflare**, no con una operación destructiva.

## Revisión manual obligatoria antes de R2 real

1. Confirmar que ambos buckets QA `zaping-quarantine-qa` y `zaping-private-qa` existen, son privados, sin `r2.dev` ni dominio público, y pertenecen a la misma jurisdicción. No usar buckets reales.
2. Confirmar un objeto PDF **sintético** realmente existente en `zaping-quarantine-qa`, con ruta exacta `quarantine/<companyUUID>/<documentUUID>/<attachmentUUID>`, tamaño y SHA-256 comprobados desde una fuente local independiente. **No usar documentos de clientes**. El laboratorio de escritura #205/03A puede preparar el fixture; no reutilizar su token de lectura/escritura para 03C3A.
3. Confirmar otro objeto sintético **existente** en `zaping-private-qa`, con ruta `private/<companyUUID>/<documentUUID>/<attachmentUUID>` (laboratorio 02B). Sin un fixture privado conocido no ejecutar la prueba; una key que no existe produciría un falso diagnóstico.
4. Cloudflare Dashboard → R2 Object Storage → Manage API Tokens: crear token S3 **Object Read only** restringido **solo al bucket `zaping-quarantine-qa`**. No `Admin`, `all buckets`, `Object Read & Write` ni acceso a `zaping-private-qa`. Verificar en Dashboard el alcance **positivo y negativo** antes de marcar `R2_SCANNER_QA_READ_ONLY_CONFIRMED=1`. El token de private QA `R2_READ_*` y el de escritura `R2_QUARANTINE_WRITE_*` se conservan independientes.
5. Guardar S3 Access Key ID y Secret Access Key en un gestor local seguro. No pegarlos en chat, Issues, PR, GitHub Actions o archivos del repositorio. No usar configuración AWS por defecto; el cliente requiere credenciales explícitas.
6. Tener presente que Cloudflare documenta propagación eventual de permisos IAM (hasta aproximadamente un minuto). No marcar un token recién creado como seguro por fallos transitorios: verificar su política y prueba real una vez propagados los permisos.

## Ejecutar desde Windows con trabajo local aislado

En la rama 03C3A, carpeta `app/api`, ejecutar `npm ci`; luego preparar un PowerShell **local** con los valores sintéticos y credenciales introducidas interactivamente. No imprimir variables de credenciales.

```powershell
$ErrorActionPreference = 'Stop'
$env:RUN_ZFILES_R2_SCANNER_OBJECT_READ_QA = '1'
$env:R2_SCANNER_QA_READ_ONLY_CONFIRMED = '1'
$env:R2_ACCOUNT_ID = (Read-Host 'R2 QA Account ID').Trim().ToLowerInvariant()
$env:R2_JURISDICTION = 'default'
$env:R2_PRIVATE_BUCKET = 'zaping-private-qa'
$env:R2_QUARANTINE_BUCKET = 'zaping-quarantine-qa'

# Todos estos datos proceden de fixtures SINTÉTICOS ya comprobados.
$env:R2_QUARANTINE_SCAN_COMPANY_ID = Read-Host 'Company UUID sintético cuarentena'
$env:R2_QUARANTINE_SCAN_DOCUMENT_ID = Read-Host 'Document UUID sintético cuarentena'
$env:R2_QUARANTINE_SCAN_ATTACHMENT_ID = Read-Host 'Attachment UUID sintético cuarentena'
$env:R2_QUARANTINE_SCAN_SHA256 = Read-Host 'SHA-256 del PDF sintético'
$env:R2_QUARANTINE_SCAN_SIZE_BYTES = Read-Host 'Tamaño en bytes del PDF sintético'
$env:R2_SCANNER_QA_PRIVATE_FIXTURE_KEY = Read-Host 'Key privada sintética existente (private/...)'

$env:R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID = (
  [pscredential]::new('r2', (Read-Host 'Quarantine-only S3 Access Key ID' -AsSecureString))
).GetNetworkCredential().Password
$env:R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY = (
  [pscredential]::new('r2', (Read-Host 'Quarantine-only S3 Secret Access Key' -AsSecureString))
).GetNetworkCredential().Password

try {
  npm run test:e2e -- --runInBand test/zfiles-r2-scanner-object-read.qa.e2e-spec.ts
} finally {
  @(
    'RUN_ZFILES_R2_SCANNER_OBJECT_READ_QA',
    'R2_SCANNER_QA_READ_ONLY_CONFIRMED',
    'R2_ACCOUNT_ID',
    'R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID',
    'R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY',
    'R2_SCANNER_QA_PRIVATE_FIXTURE_KEY'
  ) | ForEach-Object {
    Remove-Item "Env:$_" -ErrorAction SilentlyContinue
  }
}
```

La prueba sólo llama `HeadObject` y `GetObject` sobre cuarentena, luego `HeadObject` sobre private QA, y jamás escribe. Los errores SDK y datos identificables no se imprimen desde el test. Si falla, revisar configuración local y la política del token, **sin publicar diagnósticos que contengan credenciales, URLs firmadas, claves de objetos o account IDs**.

## Diagnóstico seguro tras el primer FAIL real (04/11/2026)

La primera ejecución local con el token nuevo y los dos objetos ya localizados devolvió `ZFILES-R2-03C3A real QA NOT VERIFIED`, sin detallar etapa. **No acredita fallo del token ni éxito de ningún subcontrol**; el test ocultaba intencionadamente el error original. No hay que ampliar permisos ni recrear credenciales sin diagnosticar.

Se añadió clasificación de **solo etapa y código HTTP seguro** al test local:

- `Q_HEAD_HTTP_401/403/404/412/429` o `Q_HEAD_OTHER`: error de petición HEAD en cuarentena.
- `Q_HEAD_METADATA`: tamaño o ETag inesperado tras HEAD válido.
- `Q_GET_HTTP_*`, `Q_GET_METADATA`: error GET condicionado, tipo de cuerpo o longitud.
- `Q_BODY_VERIFICATION`: el cuerpo recibido no verifica SHA-256, tamaño o estructura de stream.
- `P_HEAD_HTTP_404` / `P_HEAD_OTHER`: denegación del bucket privado NO demostrada; una lectura permitida produce `P_HEAD_ALLOWED`. Sólo `P_HEAD` con 403 AccessDenied/Forbidden equivale a éxito de la etapa negativa.
- `SCOPE_INVALID`: manifest/rutas sintéticas no corresponden al contrato. `SETUP_OR_UNKNOWN`: error antes del comprobador de R2.

No se imprime el SDK Error crudo, HTTP response body, account ID, token, URL, key, SHA-256, ETag ni contenido del PDF. La clasificación no se confunde con PASS. En la segunda ejecución local, compartir sólo el texto `QA NOT VERIFIED [CODIGO]` o el PASS de Jest y **no** los prompts o variables.

Para actualizar el worktree detached en Windows sin modificar el repositorio base:
```powershell
git -C C:\dev\zaping-r2-03c3a fetch origin feat/zfiles-r2-03c3a-object-read-qa-20261104
git -C C:\dev\zaping-r2-03c3a switch --detach FETCH_HEAD
```
No usar `reset --hard` ni modificar tokens; después ejecutar de nuevo el bloque local de prueba, que solicitará credenciales ocultas y limpiará variables al terminar.

## Ajuste de interpretación de HEAD 403 (04/11/2026)

La ejecución real con el token Object Read de cuarentena obtuvo `P_HEAD_HTTP_403`. Esto confirma que el HEAD+GET anterior sobre cuarentena y el chequeo de bytes/SHA-256 se completaron; el HEAD privado devolvió 403, pero la prueba lo rechazó por exigir además un nombre de error `AccessDenied` o `Forbidden`. La operación S3 `HeadObject` devuelve errores HTTP genéricos, sin cuerpo para identificar el tipo S3; el SDK puede reportar `UnknownError` con `$metadata.httpStatusCode === 403`. Referencia: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/HeadObjectCommand/

La política 03C3A ahora acepta **HTTP 403 en la operación HEAD de objeto privado exacto** sin exigir un nombre de excepción S3, siempre **después** del HEAD+GET autenticado en cuarentena y validación estricta de bytes SHA-256. Los fixtures son sintéticos, el objeto privado fue comprobado como existente por el propietario y la política del token se revisó en Cloudflare Dashboard. `401`, `404`, otros errores HTTP/red y lectura privada exitosa siguen siendo bloqueo. No se modifica el token ni se añade PUT/DELETE/COPY/LIST.

Esta corrección de interpretación requiere PASS del CI sobre el SHA actualizado y una nueva ejecución local para registrar el resultado. No equivale a autorización de promoción, AVAILABLE o descarga.

## Criterios de aceptación

| Gate | Evidencia | Estado |
|---|---|---|
| QA estático/fixtures | Jest adversarial con S3 simulado: comando exacto, ETag, hash, bucket privado 403 y errores no concluyentes | Pendiente CI |
| CI API / Web / PostgreSQL | HEAD de rama y PR, sin credenciales reales | Pendiente CI |
| Cloudflare scope read positivo | HEAD + GET sobre PDF sintético, SHA-256 y tamaño exactos | **Pendiente prueba local** |
| Cloudflare scope privado negativo | HEAD privado sintético existente devuelve 403 por credencial cuarentena | **Pendiente prueba local** |
| Sin privilegios de escritura | Revisión independiente de token **Object Read only**, bucket único, en Dashboard | **Pendiente revisión humana** |
| Cloudflare real integrado con ClamAV/worker | No incluido en 03C3A | Bloqueado |
| VERSION/TOCTOU, promotor, AVAILABLE, descargas | No incluido | Bloqueado |

## Riesgos y límites

- HEAD con ETag + GET `If-Match` limita ciertas carreras durante esta lectura, pero **no atesta versión immutable** ni soluciona TOCTOU entre escaneo y promoción. ETag no es SHA-256; se computa SHA-256 del cuerpo en la prueba.
- Token `Object Read only` permite lectura y **listado** de objetos según Cloudflare, aunque nuestro código no invoca List. Para un futuro scanner de producción valorar credenciales temporales restringidas a acciones `GetObject`/`HeadObject` y un job autenticado.
- Los privilegios positivos y negativos se prueban sólo contra los buckets seleccionados; no constituyen una auditoría universal de todos los recursos del Account. La declaración de escritura prohibida procede de la política Cloudflare revisada, no de una prueba S3 de PUT.
- No se registra proveedor NestJS, API, job real, rol SQL operativo, documento cliente, firma de escaneo, CopyObject, DeleteObject, actualización de estado, AVAILABLE ni descarga. El PR permanece en Draft.

## Fuentes

- https://developers.cloudflare.com/r2/api/tokens/
- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/reference/consistency/
- https://developers.cloudflare.com/r2/api/s3/temporary-credentials/
