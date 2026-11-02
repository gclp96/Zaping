# ZFILES-R2-02B — Lectura S3 de Cloudflare R2 QA

**Issue:** #201 · **Base apilada:** PR #200 · **Estado:** implementación solo read-only, sin Cloudflare real.

## Alcance y controles

- SDK oficial `@aws-sdk/client-s3` fijado a `3.1157.0` en `package.json` y `package-lock.json`. El lock conserva versiones de NestJS y override `multer` ya presentes en `main`; `npm ci` de CI confirma reproducibilidad.
- `createZfilesR2QaReadClient` obtiene configuración solo después del guard puro `requireZfilesR2QaFixture`, con región `auto`, endpoint derivado de cuenta/jurisdicción, `forcePathStyle`, `maxAttempts=2` y credenciales S3 **explícitas** (sin AWS credential chain).
- Sin registro en módulos NestJS ni rutas HTTP. El test local solo usa `ListObjectsV2` con `MaxKeys=1`, `Prefix` de la **clave sintética exacta**, seguido por `GetObject` del mismo objeto privado QA.
- Verificación streaming por tamaño estricto y SHA-256, cortando lecturas excesivas, liberando body y cliente al terminar. No almacena contenido en memoria como archivo completo, base de datos, logs ni URL pública.
- `RUN_CLOUDFLARE_R2_QA_SMOKE=1` es obligatorio en una **máquina local**, nunca GitHub Actions (`CI=true` y `GITHUB_ACTIONS=true` rechazados); la prueba está omitida por defecto.
- No existe upload, copia a privado, `AVAILABLE`, descarga de usuarios, provisión de objetos ni endpoint de aplicaciones. Una lectura de fixture sintética no sustituye escaneo antimalware.

## Aprovisionamiento manual Cloudflare R2

1. En <https://dash.cloudflare.com/> ir a R2 Object Storage. Revisar términos y habilitar R2 si aún no está habilitado.
2. Crear dos buckets **Standard** separados: `zaping-private-qa` y `zaping-quarantine-qa`. Elegir jurisdicción `default` (o configurar la jurisdicción real de ambos) y **no habilitar** `r2.dev` ni custom domain. Confirmar que ambos están privados.
3. En Manage R2 API Tokens, crear token S3 `Object Read only` restringido *únicamente* a `zaping-private-qa`. Nunca crear uno `Admin`, `Object Read & Write` o `all buckets` para este smoke.
4. Guardar Access Key ID y Secret Access Key en un gestor local de secretos. **No pegar credenciales en ChatGPT/GitHub, no crear Actions secrets y no subir documentos de clientes.**
5. En la raíz del repo, generar un archivo artificial:
   ```powershell
   powershell -NoProfile -File scripts/r2/zfiles-create-qa-fixture.ps1
   ```
6. En el Dashboard, subir *manualmente* ese único archivo al bucket privado QA con la ruta **exacta** `private/<companyUUID>/<documentUUID>/<attachmentUUID>` indicada por el script. Si el Dashboard cambia la clave, corregir la ruta, no el validador. No crear fila de adjunto ni declarar `AVAILABLE`.

## Primera prueba real en Windows, solo con QA aprovisionado

En PowerShell, dentro de `C:\dev\zaping\app\api` y con la rama aprobada para QA:

```powershell
npm ci
$env:RUN_CLOUDFLARE_R2_QA_SMOKE = '1'
$env:R2_ACCOUNT_ID = Read-Host 'Cloudflare account ID (32 hex)'
$env:R2_JURISDICTION = 'default'
$env:R2_PRIVATE_BUCKET = 'zaping-private-qa'
$env:R2_QUARANTINE_BUCKET = 'zaping-quarantine-qa'
$env:R2_READ_ACCESS_KEY_ID = Read-Host 'R2 QA Object Read access key ID'
$secret = Read-Host 'R2 QA Object Read secret access key' -AsSecureString
$env:R2_READ_SECRET_ACCESS_KEY = (
  [pscredential]::new('r2', $secret)
).GetNetworkCredential().Password
Remove-Variable secret

# Copiar aquí únicamente los valores NO secretos entregados por el generador
$env:R2_QA_FIXTURE_COMPANY_ID = '<UUID sintético del script>'
$env:R2_QA_FIXTURE_OBJECT_KEY = '<ruta private/... del script>'
$env:R2_QA_FIXTURE_SHA256 = '<SHA256 del script>'
$env:R2_QA_FIXTURE_SIZE_BYTES = '<tamaño del script>'

npm run test:e2e -- --runInBand test/zfiles-r2-qa-readonly.e2e-spec.ts

Remove-Item Env:\R2_READ_ACCESS_KEY_ID -ErrorAction SilentlyContinue
Remove-Item Env:\R2_READ_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\RUN_CLOUDFLARE_R2_QA_SMOKE -ErrorAction SilentlyContinue
```

No ejecutar estos comandos hasta haber creado el token acotado y verificado la privacidad de ambos buckets. No compartir capturas de consola con secretos.

## QA y limitaciones

La suite unitaria usa exclusivamente mocks/datos sintéticos; prueba comando `ListObjectsV2`, `GetObject`, scope QA, rechazo de falta de objeto, longitudes y SHA-256. El E2E R2 real **no se ejecuta en CI**, porque requiere aprovisionamiento y credenciales QA de propiedad del usuario.

El token con permisos por bucket solo funciona vía **S3 API**, no REST administrativa. Cloudflare usa región `auto`; para jurisdicción EU/US/FedRAMP, el endpoint debe incorporar esa jurisdicción. Para este piloto preferir `default` hasta verificar la configuración Cloudflare en Dashboard.

**Criterio de entrega:** API/Web/Historical 3/3 PASS, revision del diff, no secretos, PR Draft; no merge ni deploy sin autorización.

## Fuentes oficiales

- <https://developers.cloudflare.com/r2/api/tokens/>
- <https://developers.cloudflare.com/r2/api/s3/api/>
- <https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/>
- <https://developers.cloudflare.com/r2/reference/data-location/>
