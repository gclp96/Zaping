# ZFILES-R2-03D1 — Copia privada verificada, todavía sin liberación

**Issue:** #237 · **Dependencia:** #234 Draft → #232 → #230 → #228 → #225 y 03B. **Estado:** código de núcleo aislado, no conectado a NestJS ni a R2 real.

## Entregable técnico

`ZfilesVerifiedPrivateCopyCore.stageVerifiedBytes(candidate)` acepta un registro tipado `TrustedPromotionCandidate` de confianza (contrato aún NO implementado) y un par de clientes S3 inyectados. En 03D1 la validación y las pruebas se hacen con clientes simulados sin red:

1. Valida IDs Company/Document/Attachment, job `CONSUMED`, documento `ACTIVE`, attachment `PENDING_SCAN`, tamaño SHA-256, coincidencia exacta job/nonce/receipt y clave `quarantine/<Company>/<Document>/<Attachment>`.
2. Revalida criptográficamente el envelope Ed25519 completo del receipt mediante el verificador 03C1: clave pública confiable, worker/build y política permitidos, frescura de evidencia y firmas, hash/size/tenant/nonce; sólo `CLEAN_CANDIDATE` puede continuar. **La mera presencia de un receipt NO es confianza.**
3. `HeadObject` cuarentena, `GetObject` con `IfMatch` del ETag; recorre el stream, limita bytes a la longitud del receipt (máximo 10 MiB), calcula SHA-256 real y rechaza cualquier diferencia.
4. Inspecciona los mismos bytes para comprobar PDF/JPEG, MIME y extensión original declarada. No transforma ni desinfecta el archivo.
5. Deriva la clave privada sin aceptar rutas del cliente. `PutObject` con `IfNoneMatch: '*'` (create-only, sin overwrites), luego `GetObject` del destino y vuelve a calcular SHA-256/tamaño real. El ETag no es el SHA-256.
6. Devuelve solamente `PRIVATE_BYTES_VERIFIED_UNRELEASED`, sin evento SQL, estado AVAILABLE, URL de descarga ni botón de usuario. Errores se normalizan y los Buffers temporales se ponen a cero al salir.

En caso de 412/objeto existente no lo pisa. Si PUT tuvo éxito pero GET/read-back falla, puede quedar un objeto privado **huérfano**, deliberadamente sin borrar: el reconciliador separado será obligatorio antes de cerrar 03D. Un reintento nunca sobrescribe objetos existentes.

## Seguridad que 03D1 **no** demuestra todavía

- **Origen confiable del input**: el tipo `TrustedPromotionCandidate` NO autentica ni garantiza transacción SQL. 03D2 debe cargarlo con SQL de Company/Attachment/Job/Receipt autorizado, garantizar status CONSUMED y snapshot coherente, revisar revocación/rotación de keyIds, caducidades y lock de liberación. Nadie puede pasarle un objeto arbitrario de HTTP.
- **Acceso R2 real**: no hay token ni S3 client configurado; las pruebas Jest son mocks. El promotor deberá usar identidad independiente para GET cuarentena y otra para PUT-if-absent + GET privado, con prueba negativa de acceso cruzado y revisión de políticas en Cloudflare.
- **Atomicidad R2/DB**: no existe transacción distribuida. Reconciliación e idempotencia se implementarán en 03D2/03D3; no inferir éxito de un timeout. `IfNoneMatch: '*'` evita sobrescrituras en R2 pero no reemplaza control de versiones/reteneción/custodia.
- **Protección entre escaneo y promoción**: el SHA-256 comparado con el envelope garantiza equivalencia de bytes leídos, pero no evita por sí solo sobrescrituras posteriores en el bucket privado. Necesitamos impedir overwrite/delete mediante token/política y, tras reconfirmación, gate transaccional al actualizar estado. No activar Bucket Lock automático sin revisar retención, ciclo de vida y recuperación.
- **Semántica de tiempo**: `verifyScanEvidence` aplica frescura `maxEvidenceAgeMs`; documentos con receipt antiguo pueden requerir reescaneo, nunca bypass.
- **Disponibilidad de usuario**: no hay endpoints, upload, descarga ni UI. Feature flag no se enciende.

## QA de código (CI)

Nueve pruebas offline: caso CLEAN y read-back; firma adulterada; malware firmado; job ISSUED/Company/attachment inválidos; fuente alterada; HEAD tamaño inválido; destino existente 412; destino alterado después del PUT; MIME/extensión falsos. Todas deben ser evaluadas por API tests, typecheck, lint y CI Web/PostgreSQL histórico en HEAD exacto. No se debe declarar que existe promoción operativa.

## Gates siguientes

1. Cerrar #234: CI PASS, repetir R2 real local HEAD+GET cuarentena SHA256 y 403 private, registrar prueba; mantener Draft sin merge hasta revisión.
2. 03D2: adaptador SQL aislado de lectura de receipt con privileges positivos mínimos, estado de promoción y transacción final que **autorice AVAILABLE sólo tras revalidación**; pruebas PostgreSQL real y roles.
3. 03D3: worker R2 real de QA con tokens separados, bucket privado create-once, reconciliación ante crash/timeout, auditoría, pruebas TOCTOU y errores físicos. No utilizar credenciales de producción ni datos reales.
4. 03E #238: API + UI en recepciones, QA E2E, feature flag OFF por defecto, control de rol y Company.

**Fuentes R2 para política/QA:** [R2 S3 extensions](https://developers.cloudflare.com/r2/api/s3/extensions/), [consistencia](https://developers.cloudflare.com/r2/reference/consistency/), [retención Bucket Locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/).

**Prohibiciones en 03D1:** no `GRANT`, SQL, migración, Nest module/provider, HTTP, R2 real, `AVAILABLE`, `REJECTED`, descargas, URLs firmadas, CopyObject, DeleteObject, merge o despliegue.
