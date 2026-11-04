# ZFILES-R2-03C1 — Evidencia verificable Ed25519 y coordinación del escaneo (laboratorio)

**Issue:** #224 · **PR base:** #220 (03B5) · **Estado:** Implementación de laboratorio, no desplegada.

## Contexto y decisión

03A/03B1–03B5 han probado aisladamente acceso R2 QA, integridad de lectura, ClamAV real, actualización FreshClam y política UTC. El flujo operativo de carga y descarga sigue **deshabilitado**. Se aprovecharán selectivamente contratos del prototipo histórico de worker/evidencia, sin traer sus proveedores productivos ni sus migraciones.

03C1 añade **evidencia de transporte firmada con Ed25519**, verificada mediante una clave pública fijada y vinculada a identidad de adjunto, nonce, SHA-256/tamaño, objeto de cuarentena, revisión de firmas y versión del worker. La firma acredita que **quien posee la clave privada** firmó los datos; por sí misma no demuestra que un job haya sido autorizado ni que el archivo esté limpio o pueda publicarse.

## Separación de responsabilidades

- *Scanner verificado* (adaptador inyectado): devuelve veredicto únicamente tras verificar longitud y SHA-256 de los **bytes recuperados**, de acuerdo con el contrato de 03B3. El adaptador de laboratorio puede ser un mock, por lo que este PR no demuestra R2 real.
- *Readiness* (adaptador inyectado): check PING/VERSION, motor permitido y firma temporal antes y después, siguiendo 03B4.
- *Worker laboratorio*: toma identidad de job sintético con nonce, deriva internamente la clave del objeto, verifica continuidad temporal de los probes y emite firma Ed25519 sólo al terminar satisfactoriamente. Resultado antivirus sin hallazgo se traduce a **CLEAN_CANDIDATE**, no a AVAILABLE.
- *Verificador puro*: exige envelope exacto, firma correcta, clave pública fijada a keyId/worker/build, coincidencia estricta con el job esperado y ventanas de tiempo. No crea autorizaciones.
- *Base de datos*: sin integración aún. El trigger actual sigue denegando UPDATE/DELETE de SupplierDocumentAttachment; la evidencia no puede cambiar estados.

## Invariantes

1. Identidad Company/Document/Attachment no procede de un cuerpo HTTP; en 03C1 es fixture. Job/nonce deberán ser emitidos y consumidos una sola vez **atómicamente** por una futura tabla controlada con rol SQL mínimo.
2. El material a firmar tiene campos enumerados en orden fijo y prefijo de dominio; no se firman objetos arbitrarios ni se aceptan campos desconocidos.
3. SHA-256 es de 64 hex minúsculos; tamaño 1–10 MiB; clave derivada `quarantine/<company>/<document>/<attachment>`.
4. Fallos de lectura, tamaño, hash, engine, versión de base, reloj, nonce, firma o post-readiness abortan **sin evidencia de limpieza** y sin mensajes internos sensibles.
5. Firma de worker no implica autoridad: la cuenta de uploader jamás tendrá clave privada de escáner, y el servicio promotor deberá verificar evidencia y bytes nuevamente.
6. Ninguna función añadida realiza llamadas S3, escribe PostgreSQL, inicia trabajos ni se registra en NestJS. El test usa Ed25519 in-memory y bytes sintéticos o mocks.

## Gates después de 03C1

- **03C2**: jobs/nonce de un solo uso, rol scanner PostgreSQL no-owner con permisos positivos mínimos, estado/ledger y auditoría; evitar duplicados, carreras y replay.
- **03C3**: token nuevo Object Read restringido a `zaping-quarantine-qa`, confirmado contra Cloudflare; prueba QA de permisos positivos y negativos. No introducir credenciales en CI/GitHub/chat.
- **03D**: versionado/inmutabilidad del objeto, verificación byte-a-byte en origen y destino, promoción con privilegio independiente, estados permitidos y recuperación de fallos.
- **03E**: API autenticada, cuotas atómicas, lista, carga/descarga segura, UI Next.js y E2E multiempresa.

**Prohibido:** AVAILABLE, REJECTED, download, presigned URLs, HTTP endpoints, producción, claves privadas persistentes, migrations/SQL, cambios de R2 o merges automáticos. El PR permanece Draft hasta revisión.

**Referencias locales:** ZFILES_R2_03B3_QUARANTINE_SCAN_QA.md; ZFILES_R2_03B4_CLAMAV_READINESS_LAB.md; ZFILES_R2_03B5_FRESHCLAM_LIVE_QA.md.
