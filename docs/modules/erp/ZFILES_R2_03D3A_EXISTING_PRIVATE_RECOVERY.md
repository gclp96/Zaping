# ZFILES-R2-03D3A — Recuperación explícita de objeto privado existente (núcleo aislado)

**Issue:** #237. **Base apilada:** PR #243 (03D2B). **Estado:** Draft, no desplegado, no merge, sin providers HTTP/Nest ni tokens reales.

## Objetivo de este incremento

Cuando un `PutObject IfNoneMatch: '*'` terminó con resultado incierto, devolvió 412 o R2 confirmó el objeto pero falló la transacción SQL, **no repetir escritura ni declarar AVAILABLE basándonos en metadata o en el error anterior**. Facilitar un camino explícito que vuelve a comprobar los bytes de R2 desde cero y, sólo si todo coincide con evidencia firmada fresca, invoca exactamente la misma función SQL protegida de 03D2B.

## Código y límites

- `ZfilesVerifiedPrivateCopyCore.reconcileExistingVerifiedBytes(candidate)`: reutiliza la verificación de candidato `CONSUMED`/Company/Document/Attachment/nonce/receipt, firma Ed25519, trusted keys/política/frescura, estado `PENDING_SCAN`, HEAD y GET condicional del objeto de cuarentena, hash y longitud completa del origen e inspección de PDF/JPEG.
- La ruta de recuperación **no ejecuta PUT/COPY/DELETE/LIST** en ningún bucket. Ejecuta GET del objeto privado canónico, comprueba todos sus bytes con SHA-256 y tamaño contra receipt, y vuelve a validar la firma/política/frescura después del GET.
- `ZfilesPrivateReleaseCoordinator.recoverExisting(jobId, companyId)`: exige de nuevo candidato restringido por SQL de 03D2A. Sólo tras verificación física `PRIVATE_BYTES_VERIFIED_UNRELEASED` invoca 03D2B; ninguna evidencia obtenida de caller/HTTP.
- `stageVerifiedBytes` conserva el flujo normal de PUT condicional y read-back, con revalidación de freshness al final.
- Fallo de R2/SQL, 404, bytes distintos, malware, receipt inválido, evidencia vencida y tenant distinto: fallar cerrado; no auto-retry en PR. No logs de SDK, nombres de bucket/keys privadas ni credenciales en errores.

## Condiciones de seguridad que todavía **no** resuelve

1. **TOCTOU/custodia:** entre el GET privado verificado y el commit SQL, otro token puede sobrescribir o eliminar el objeto. Permisos y política R2 (Bucket Lock/prefijo, si se aprueba) requieren auditoría humana de infraestructura. La prueba de un HEAD/GET previo NO equivale a inmutabilidad.
2. **No hay transacción distribuida:** 03D3A no provee una cola, leasing, job de recuperación ni bitácora persistente de intentos. No ejecuta un worker real, ni credenciales Cloudflare QA, ni proceso de reconciliación automático.
3. **Retry y vencimiento:** si la firma/DB antivirus pierde frescura antes del intento de recuperación, el proceso debe requerir reescaneo; nunca ampliar ventana o reutilizar receipt caducado.
4. **Permisos:** la función SQL 03D2B debe recibir EXECUTE sólo del proceso promotor aislado, nunca API, uploader o scanner. El PR no agrega GRANT productivo ni modifica RBAC.
5. **Evidencia 03C3A:** hubo PASS real HEAD+GET cuarentena SHA/bytes y HEAD privado 403; sigue pendiente verificación independiente de política de token Object Read-only en Dashboard y procedencia del fixture original.

## Pruebas del incremento

- Flujo positivo de recuperación sin PUT: Q_HEAD → Q_GET → P_GET, firma y bytes exactos.
- Fallo con destino privado faltante, alterado o fuente alterada; ninguna escritura.
- Rechazo malware, firma adulterada antes de tocar R2.
- Rechazo evidencia que venció **durante** read-back.
- Coordinador sólo invoca función de commit SQL tras resultado de verificación exacto; sin candidato, sin solicitud R2 ni SQL; error normalizado sin secretos.
- Conservación de E2E PostgreSQL y CI API/Web/upgrade histórico del PR #243.

## Definition of Done 03D3A

- [ ] API unit tests y lint/typecheck/build PASS sobre HEAD exacto.
- [ ] PostgreSQL CI E2E (heredado) PASS.
- [ ] Revisión de código independiente de ruta `existing` y su acceso sólo desde worker aislado.
- [ ] Mantener Draft y feature flags deshabilitadas.

**03D3B pendiente:** ejecución local QA **real** con credenciales de promotor segregadas y objetos sintéticos; conflict 412/409/timeout, actual GET privado, carrera/borrado, crash tras PUT, fallo DB/reintento y bitácora de reconciliación, más política de custodia. **No fusionar ni desplegar** hasta gates de seguridad y R2 físico.
