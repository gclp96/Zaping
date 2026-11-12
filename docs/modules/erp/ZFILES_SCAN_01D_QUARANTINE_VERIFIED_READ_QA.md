# ZFILES-SCAN-01D — Lectura verificada de cuarentena (QA offline)

**Estado:** propuesta para revisión local; no hay escaneo real de un objeto R2 en este incremento.
**Base auditada:** `qa/integration` en `521bbef093bb7d4a4f3f34f75bf3eb621a0c977b`.
**Origen selectivo:** PR histórico #215, sin cherry-pick del stack antiguo.

## Decisión

Se agrega un helper **sin credenciales, sin rutas HTTP y sin proveedor NestJS** para probar el contrato de lectura de un único objeto de `zaping-quarantine-qa`.

La identidad `companyId` + propietario (`SUPPLIER_DOCUMENT` o `PURCHASE_RECEIPT`) + `attachmentId`, tamaño, SHA-256 y ETag **deben proceder de un manifiesto sintético QA independiente**. No se debe aceptar el manifiesto desde el navegador ni desde los metadatos R2 sin verificar.

1. Construir exclusivamente la clave `quarantine/<company>/<owner>/<attachment>` con el contrato ZFILES-OWN-01.
2. Consultar `readiness.check()` antes de la lectura. La política de versión, firmas, reloj y procedencia del probe debe configurarse fuera de este helper.
3. Ejecutar **un solo** `GetObject` con `IfMatch: <ETag-fuerte-esperado>` contra el bucket de cuarentena QA, nunca `ListObjects`, `PutObject`, `CopyObject` o `DeleteObject`.
4. Exigir `ContentLength` y ETag exactos; contar bytes del stream (1–10 MiB) y calcular SHA-256; rechazar truncamiento, exceso o corrupción antes de escanear.
5. Solo después pasar esos mismos bytes a ClamAV INSTREAM y repetir `readiness.check()`, rechazando cambios de motor, revisión, fecha de base o política.
6. Retornar únicamente `CLAMD_OK_UNATTESTED` o `MALWARE_DETECTED`. No persistir, promover, descargar ni emitir evidencia firmada. Borrar buffers temporales en memoria en la medida que Node lo permite.

## Seguridad y limitaciones

- Cloudflare R2 implementa `GetObject` con `If-Match`, pero el ETag es un control de concurrencia, **no** un hash criptográfico de contenido. El SHA-256 independiente sigue siendo obligatorio.
- Fijar el objeto durante el GET **no garantiza** su inmutabilidad después del escaneo; todavía existe riesgo TOCTOU entre lectura, evaluación y eventual promoción. La promoción necesitará un gate separado con relectura exacta y control de concurrencia.
- No se ha verificado el alcance real de un token Cloudflare. Para una futura prueba con R2 real se requiere **un token nuevo `Object Read only` limitado exclusivamente a `zaping-quarantine-qa`**, acompañado de pruebas negativas de permiso; no reutilizar tokens de escritura ni credenciales de producción.
- La configuración del bucket o un UUID en la clave **no sustituyen** autorización multiempresa, identidad de worker, firma de job o nonce anti-replay.
- No activar este helper en endpoint ni servicio productivo. No configurar R2 ni crear `.env` para esta fase.
- Este slice reutiliza los *tipos* de lectura R2, pero usa exclusivamente un cliente S3 simulado en Jest; el próximo gate requerirá un QA real aislado y autorización.

## DoD local

- Pruebas negativas para key inválida, MIME indirectamente restringido por manifiesto, size/header/cuerpo y SHA, ETag, servicio R2, readiness inestable, y ausencia de promoción.
- `npm test -- --runInBand zfiles-quarantine-verified-read-qa.spec.ts`, `npm run typecheck`, `npm run lint:check`, `git diff --check`.
- No tocar `main`, `zaping_dev`, `zaping_qa`, volumen o backup Docker local, secretos, R2 real ni `output/`/`tmp/`.
- No commit/push sin revisión del diferencial.

## Referencias

- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/api/s3/conditional-operations/
- https://developers.cloudflare.com/r2/api/tokens/
- https://github.com/gclp96/Zaping/pull/215
