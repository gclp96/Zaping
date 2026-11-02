# ZFILES-R2-03A — Escritura de cuarentena QA sin liberar archivos

**Issue #205 · Estado: PR Draft / sin merge.**

## Propósito

Probar **solo desde un equipo local autorizado** que un PDF 100% sintético puede crearse como objeto privado nuevo en \`zaping-quarantine-qa\` y releerse para cotejar tamaño y SHA-256. **No** es una subida operativa, API HTTP, registro real de documentos, antivirus ni promoción a \`AVAILABLE\`.

### Flujo técnico

1. Rechazar por defecto salvo \`RUN_ZFILES_R2_QUARANTINE_QA_WRITE=1\`; rechazar en \`CI=true\` o \`GITHUB_ACTIONS=true\`.
2. Verificar account ID hexadecimal de 32 caracteres, jurisdicción \`default|eu|us|fedramp\` y nombres de buckets exactos \`zaping-private-qa\` / \`zaping-quarantine-qa\`.
3. Crear cliente S3 **no registrado en NestJS**, región \`auto\`, credenciales explícitas, sin cadena ambiental de AWS, \`maxAttempts=1\` y \`requestChecksumCalculation=WHEN_REQUIRED\`.
4. Generar internamente un PDF pequeño con marcador y UUID artificial, validar firma/extensión/MIME/tamaño/sha256 mediante el inspector ya incluido en \`main\`.
5. Generar key completamente nueva \`quarantine/<companyUUID>/<documentUUID>/<attachmentUUID>\` (no acepta filenames externos ni key suministrada por cliente).
6. \`PutObject\` único hacia \`zaping-quarantine-qa\`, cabecera atómica \`If-None-Match: *\`, \`ContentMD5\`, tipo \`application/pdf\`. No usar ACL, URL pública ni auto-create bucket.
7. \`GetObject\` desde esa misma cuarentena, cotejando estrictamente tamaño y SHA-256 por streaming; cerrar la conexión. **Nunca** \`CopyObject\`, \`DeleteObject\` ni \`AVAILABLE\`.

Cloudflare R2 documenta que la condición \`If-None-Match: *\` se evalúa atómicamente y retorna 412 si la key ya existe. **Si un PUT devuelve error incierto, no asumir que falló**; el objeto podría haberse escrito. No reintentar automáticamente con la misma key.

## Credenciales necesarias (solo cuando se apruebe el PR)

El token anterior \`Object Read only\` corresponde **únicamente a \`zaping-private-qa\`**. No cambiarlo ni ampliarlo.

Para esta **prueba de escritura aislada**, crear **otro token** con \`Object Read & Write\`, restringido **exclusivamente** a \`zaping-quarantine-qa\`, y guardar las dos credenciales S3 en un gestor local seguro. Rechazar permisos \`Admin\`, \`all buckets\` o acceso al bucket privado. El permiso de Cloudflare \`Object Read & Write\` también habilita otras operaciones dentro del bucket (incluida eliminación); no es un rol de solo escritura: **nunca usar este token como credencial de uploader en producción**.

No compartir tokens, Account ID, capturas de credenciales ni mensajes completos del SDK por chat o GitHub. Ningún secreto en \`.env\` bajo control de versiones ni en Actions.

## Ejecución manual Windows (una vez aprobado)

Crear worktree separado de la rama PR; ejecutar \`npm ci\` en \`app/api\`. Luego en PowerShell:

\`\`\`powershell
$env:RUN_ZFILES_R2_QUARANTINE_QA_WRITE = '1'
$env:R2_PRIVATE_BUCKET = 'zaping-private-qa'
$env:R2_QUARANTINE_BUCKET = 'zaping-quarantine-qa'
$env:R2_JURISDICTION = 'default'
$env:R2_ACCOUNT_ID = (Read-Host 'R2 QA Account ID').Trim().ToLowerInvariant()

$env:R2_QUARANTINE_WRITE_ACCESS_KEY_ID = (
  [pscredential]::new(
    'r2',
    (Read-Host 'Quarantine QA S3 Access Key ID' -AsSecureString)
  )
).GetNetworkCredential().Password

$env:R2_QUARANTINE_WRITE_SECRET_ACCESS_KEY = (
  [pscredential]::new(
    'r2',
    (Read-Host 'Quarantine QA S3 Secret Access Key' -AsSecureString)
  )
).GetNetworkCredential().Password

try {
  npm run test:e2e -- --runInBand test/zfiles-r2-quarantine-qa.e2e-spec.ts
} finally {
  Remove-Item Env:\R2_QUARANTINE_WRITE_ACCESS_KEY_ID -ErrorAction SilentlyContinue
  Remove-Item Env:\R2_QUARANTINE_WRITE_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:\R2_ACCOUNT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:\RUN_ZFILES_R2_QUARANTINE_QA_WRITE -ErrorAction SilentlyContinue
}
\`\`\`

Tras PASS verificar desde Cloudflare Dashboard que **un objeto sintético nuevo** apareció bajo \`quarantine/\` sin dominios públicos. No borrar ni mover nada automáticamente; la limpieza requiere una tarea separada revisada.

## Criterios y límites

- Pruebas unitarias aisladas demuestran bucket/key exactos, **Put único** \`IfNoneMatch='*'\`, \`ContentMD5\`, **Get** de la misma key, SHA256 y rechazo de bytes adulterados, de \`CI=true\` y de bucket incorrecto.
- Suite real opt-in omitida en CI. CI deberá pasar API/Web/Historical 3/3 con tests sintéticos/mock; no declararla prueba real hasta ejecutarla con token local QA.
- Sin SQL ni nuevas transiciones a \`AVAILABLE\`. El trigger del modelo \`SupplierDocumentAttachment\` sigue bloqueando todas las mutaciones.
- La etiqueta *safe* corresponde solo al aislamiento de laboratorio y al flujo create-once. No prueba malware, PDF complejo, firmas criptográficas de escáner ni autorización positiva SQL.
- En fases 03B–03D diseñar reserva/cuota concurrente, upload HTTP autenticado, scanner ClamAV en contenedor aislado, atestación, ledger verificable, roles no-owner con permisos positivos mínimos y promoción exact-byte de quarantine→private; cada paso necesita QA especializado.

## Referencias

- https://developers.cloudflare.com/r2/api/s3/extensions/
- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/api/tokens/
