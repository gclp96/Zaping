# ZFILES-R2-03B3 — Laboratorio de lectura exclusiva y SHA-256

**Issue:** #213. **Base:** PR #212 (apilado sobre #210). **Estado:** Draft; no desplegado.

## Objetivo y contrato

Leer exactamente un objeto **sintético** de `zaping-quarantine-qa`, recalcular longitud y SHA-256 sobre los bytes recuperados y pasar esos mismos bytes al adaptador `ClamAvInstreamScanner` de 03B1/03B2. El resultado **solo** puede ser `CLAMD_OK_UNATTESTED` o `MALWARE_DETECTED`; no hay autorización de `AVAILABLE`, descargas ni firma de evidencia.

La identidad `Company/document/attachment`, el tamaño y el hash deben proceder de un manifiesto QA independiente, previamente comprobado. El laboratorio deriva la key `quarantine/<company>/<document>/<attachment>` con UUID estrictos, nunca de una URL o nombre cargado por usuario. **No** existe todavía verificación criptográfica de la identidad del job, protección de replay, bloqueo de versión de objeto ni autorización operativa de tenants.

## Límites

- Nueva identidad R2 `Object Read` **únicamente** para `zaping-quarantine-qa`; no reutilizar credencial `R2_QUARANTINE_WRITE_*` de 03A ni `R2_READ_*` de private QA. Configurarla fuera de GitHub y verificar manualmente el alcance efectivo y denegaciones ante otro bucket/escritura. La configuración del cliente **no prueba** los privilegios del token.
- Sólo `GetObject` sobre la key exacta; sin `ListObjectsV2`, `PutObject`, `DeleteObject`, `CopyObject`, presigned URLs ni movimientos entre buckets.
- Longitud 1–10 MiB, cabecera `ContentLength` exacta, contador real y SHA-256; abortar ante mismatch o errores, destruir stream y sobrescribir buffers temporales en memoria best-effort.
- Antes y después del escaneo, inyectar un comprobador de readiness que valide `PING`, `VERSION` y política explícita de antigüedad de firmas; el laboratorio verifica consistencia de engine, database revision, fecha y versión de política. **El adaptador de readiness efectivo todavía NO está cableado; la inyección puede ser simulada**. Esto tampoco comprueba procedencia criptográfica de las firmas.
- Ejecución únicamente con opt-in local `RUN_ZFILES_R2_QUARANTINE_SCAN_QA=1` y buckets QA. Rechazar `CI=true` y `GITHUB_ACTIONS=true`; pruebas Jest sin R2 ni ClamAV reales.
- Sin endpoints, Jobs productivos, Prisma/SQL, permisos de roles en PostgreSQL, cambios de estado, audit trails ni adjuntos reales.

## Riesgos abiertos (bloqueantes)

1. El flujo usa `GetObject` sin fijar `VersionId`/inmutabilidad de objeto: otra escritura concurrente entre escaneo y promoción sería un TOCTOU. La promoción necesitará relectura exacta y control de concurrencia/versionado.
2. La validación de key y entorno es de **laboratorio**, no una credencial/autorización de trabajo. No existe aún job firmado, nonce consumible ni aislamiento SQL positivo de un rol scanner no-owner.
3. `PING/VERSION` no demuestran por sí mismos `freshclam` exitoso, procedencia de bases ni cadena de suministro. Política real y pruebas E2E pendientes.
4. No correr este helper desde rutas API, contenedor compartido con ERP, o usuarios finales.

## DoD de este PR

- Revisión del diff y pruebas adversariales offline: cambio de bytes/longitud, fallo R2, caída de scanner, readiness inestable, configuración insegura; garantizar que nunca aparece `AVAILABLE`.
- CI API/Web/Historical sobre mismo commit; mantener PR Draft.
- Validación real QA con token Object Read único será un siguiente gate con aprobación humana.
- Integración de readiness real, job/evidencia firmados y permisos PostgreSQL positivos mínimos siguen pendientes: ninguna afirmación de seguridad productiva.
