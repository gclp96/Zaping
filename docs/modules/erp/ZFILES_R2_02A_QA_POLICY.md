# ZFILES-R2-02A — Contrato seguro de Cloudflare R2 QA

**Issue:** #199. **Dependencia:** PR #198 (ZFILES-R2-01).  
**Estado:** candidato Draft, sin conexión real ni credenciales; no habilita uploads ni descargas.

## Arquitectura y separación

`requireZfilesR2QaFixture` solo valida datos de una prueba de lectura futura. **No hace solicitudes HTTP/S3**, no accede a PostgreSQL, no lee env secrets ni toca `SupplierDocumentAttachment`.

El validador acepta:
- Opt-in local explícito `RUN_CLOUDFLARE_R2_QA_SMOKE=1`; rechaza `CI=true` o `GITHUB_ACTIONS=true`.
- Account ID hexadecimal de 32 caracteres y `R2_JURISDICTION` permitido (`default`, `eu`, `us`, `fedramp`, `fedramp-high`).
- Buckets exactos `zaping-private-qa` y `zaping-quarantine-qa`.
- Clave del objeto `private/<companyUUID>/<documentUUID>/<attachmentUUID>` con Company exacta.
- Hash SHA-256 minúsculo de 64 caracteres y tamaño de **1 a 10 MiB**.
- Endpoint canónico derivado exclusivamente del Account ID/jurisdicción, con `region=auto`. Nunca aceptar una URL de endpoint arbitraria.

Ninguna validación de cadenas demuestra permisos reales: **el token y la privacidad de los buckets se verifican manualmente**. Los tokens de objetos requieren API compatible con S3; no usar REST de administración como sustituto.

## Preparación de Cloudflare, solo QA

1. Activar R2 en la cuenta de Cloudflare si aún no está habilitado, revisando primero los términos de facturación. Elegir almacenamiento **Standard**.
2. Crear `zaping-private-qa` y `zaping-quarantine-qa` como buckets privados, misma jurisdicción si se pretende usar un solo cliente. No activar `r2.dev` ni dominios personalizados. Confirmar públicamente inaccesibles.
3. Crear un **R2 API Token**, tipo `Object Read only`, restringido únicamente a `zaping-private-qa`. No dar permisos de administración, escritura ni acceso al bucket de cuarentena. Este paso se efectúa en Cloudflare Dashboard por un propietario de la cuenta.
4. Almacenar Access Key ID y Secret Access Key fuera de GitHub, logs, capturas, terminal compartida y chats. El secreto se muestra una vez. **No crear GitHub Actions secrets para R2 en esta fase.**
5. Generar el archivo sintético desde la raíz del repositorio en PowerShell:
   ```powershell
   powershell -NoProfile -File scripts/r2/zfiles-create-qa-fixture.ps1
   ```
   El script no accede a Cloudflare. Entrega archivo local, clave destino, Company, SHA-256 y tamaño.
6. En el Dashboard de R2, subir **solo este archivo sintético** al bucket privado QA con la clave exacta indicada. No cargar documentos reales; no crear filas de adjuntos ni marcar `AVAILABLE`.
7. En la siguiente etapa 02B, incorporar el SDK oficial `@aws-sdk/client-s3` con lockfile generado por npm, cliente estrictamente de lectura, `ListObjectsV2` y `GetObject` con validación exacta de tamaño/SHA-256, y ensayo manual autorizado.
8. Retirar el objeto sintético conforme a política de retención aprobada; la tarea de limpieza no forma parte de un endpoint público.

## Validaciones de este PR

`app/api/src/config/zfiles-r2-qa-policy.spec.ts` prueba configuración válida, endpoint `default/eu/us` y rechazos de producción, permisos en CI, cruce de Company, claves de cuarentena, traversal, URL, tamaño, hash y jurisdicción incorrectos.

- Pruebas ejecutadas automáticamente por el job API de CI, sin tráfico R2.
- No migraciones SQL, cambios en `main`, cambios de UI ni modificación del flag `NEXT_PUBLIC_ZAPING_FILES_RECEIPTS_UI`.
- Si el CI falla, conservar Draft. Documentar PASS únicamente cuando GitHub lo confirme.
- Al estar apilado sobre PR #198 todavía Draft, **no fusionar este PR antes de resolver y fusionar #198 con autorización humana**.

## Fuentes oficiales

- https://developers.cloudflare.com/r2/api/tokens/
- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/buckets/public-buckets/
- https://developers.cloudflare.com/r2/pricing/
