# ZFILES-R2-03D2B — Liberación PostgreSQL transaccional y auditable

**Issue:** #237. **Base:** PR #241 (03D2A) → #239 (03D1) → #234 (03C3A). **Estado:** Draft técnico no habilitado; `main` intacta por este incremento.

## Objetivo y definición de listo

Crear una operación SQL específica que transforme **un solo adjunto** de `PENDING_SCAN` a `AVAILABLE` y registre **un evento de promoción inmutable en la misma transacción**. Sólo puede invocarse tras verificar de manera independiente la evidencia Ed25519, los bytes de R2 cuarentena, la escritura condicional privada y el read-back SHA-256 privado.

Precondiciones:
- Identidad de promotor **aislada** de HTTP, uploader y scanner; ningún argumento puede proceder del usuario.
- Lector restringido 03D2A devuelve candidato consumido de la empresa correcta.
- El núcleo 03D1 revalida firma, versión de scanner, freshness y SHA256/tamaño del origen y destino.
- Identidad SQL propietaria `NOLOGIN` con únicamente los SELECT/INSERT/UPDATE mínimos, y rol ejecutor `NOINHERIT` con únicamente EXECUTE. **Sin GRANTs productivos en este PR**.
- Seguir bloqueado si 03C3A no pasó QA local real y la auditoría de tokens R2; el CI no demuestra Cloudflare real.

## Contrato

`commit_zfiles_verified_private_release(jobId, companyId, privateKey, verifiedSha256, verifiedSize)` — `SECURITY DEFINER`, `search_path` restringido, sin EXECUTE público.

1. Resuelve el attachment desde el job (no desde el caller), bloquea attachment y job, mantiene el documento bloqueado para revalidar su estado y selecciona el receipt inmutable.
2. Exige **CONSUMED**, nonce usado antes de la expiración, documento `ACTIVE`, adjunto no eliminado, receipt `CLEAN_CANDIDATE`, igualdad exacta de empresa, documento, attachment, claves derivadas, hash y tamaño.
3. Revalida la estructura del signed envelope persistido. **PostgreSQL no puede verificar Ed25519 ni leer R2**; la autorización criptográfica reside exclusivamente en el proceso promotor aislado, que entrega mediciones posteriores al read-back.
4. Inserta `SupplierAttachmentPromotionAudit` (identidad job/receipt, Company, objeto privado, SHA/bytes, keyId y fecha) y ejecuta `PENDING_SCAN → AVAILABLE` bajo el trigger de protección en **una transacción**. Un rollback revierte ambos.
5. Replay de exactamente el mismo job/hash/bytes devuelve éxito idempotente sin duplicar auditoría; un cross-tenant, malware, hash falso o estado distinto devuelve falso. Una caída posterior al PUT pero anterior al commit deja `PENDING_SCAN`, nunca libera. El objeto huérfano requiere reconciliación 03D3.
6. No permitir `REJECTED`, `REMOVED`, DELETE, descargas, presigned URLs, API o configuración R2 aquí.

## Riesgos y límites de confianza

La función SQL **confía** en que el ejecutor dedicado sólo la llama tras una medición R2 auténtica. Los parámetros no son pruebas de posesión de bytes. Conceder EXECUTE a la API o a un actor general permitiría falsificar la liberación usando hash y tamaño almacenados: **prohibido**. Los GRANTs se modelan únicamente en PostgreSQL desechable durante las pruebas y requieren revisión de seguridad humana antes de despliegue.

No hay transacción distribuida entre R2 y PostgreSQL. Las políticas de tokens de R2 deben impedir overwrites y deletes; `IfNoneMatch: '*'` protege la creación, pero no el objeto contra escrituras posteriores por otras identidades. No activar Bucket Lock sin revisar políticas de retención. El estado AVAILABLE de QA no implica autorización de descarga: no existe ruta expuesta en este incremento.

El trigger original permanece deny-by-default para todos los cambios salvo una transición exacta con evento auditado en la misma transacción y contexto de job. Un operador con privilegios de administrador de DB siempre está fuera del aislamiento de rol mínimo.

## Criterios de aceptación / pruebas

- [ ] E2E PostgreSQL 16 en `zaping_test` efímero: contrato positivo, unique audit, replay.
- [ ] Probar dos conexiones físicas simultáneas; exactamente un evento de promoción.
- [ ] Probar malware, Company incorrecta, job no consumido, sha/tamaño/clave alterados y mutaciones manuales.
- [ ] Probar roles SQL con solo EXECUTE, sin SELECT ni UPDATE directo; otra identidad sin EXECUTE debe fallar.
- [ ] Validar trigger ante estados `REJECTED/REMOVED`, auditoría inmutable y rollback.
- [ ] CI API/Web/upgrade histórico/lint/typecheck/build en HEAD exacto.
- [ ] Revisión independiente de función SECURITY DEFINER y privilegios antes de cualquier GRANT/merge.

## Definition of Done

Código, contrato Prisma, pruebas, CI y revisión de seguridad aprobados. Mantener el PR en Draft y feature flag OFF. 03D3 aún debe implementar reconciliación, credenciales reales de QA segregadas y comprobar R2 físico; 03E integra UI/REST en recepciones sólo tras esos gates.
