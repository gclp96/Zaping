# ZFILES-03E1 — Reservas y conciliación de cuarentena

**Base:** main al 05/11/2026. Selección del código #151–#153, sin fusionar las ramas antiguas.

## API QA, desactivada por defecto
`POST /supplier-documents/:id/attachments/reservations` exige JWT, ADMIN/MANAGER, actor activo, empresa y documento ACTIVE. Requiere simultáneamente `ZFILES_DEPLOYMENT_SCOPE=qa` y `ZFILES_QA_RESERVATIONS_ENABLED=1`, `Idempotency-Key` de 8–128 caracteres y JSON `{ originalName, contentType, sizeBytes, sha256 }`. PDF/JPEG máximo 10 MiB. Responde sólo ID, estado RESERVED, tamaño y fecha; nunca claves, bucket, SHA ni credenciales.

Las reservas usan bloqueo PostgreSQL por SupplierDocument, cuotas concurrentes de 10 adjuntos y 100 MiB totales, e idempotencia de request key.

## Preparado internamente, NO activo
`CloudflareR2QuarantineWriter` valida bytes y hace PUT create-once `IfNoneMatch: '*'`. `CloudflareR2QuarantineVerifier` comprueba lectura íntegra con SHA-256 y límites; debe usar otra identidad R2. `SupplierAttachmentUploadReconciliationService` registra `PENDING_SCAN` y auditoría sólo tras la verificación de cuarentena, o conserva cuota en `RECONCILE_REQUIRED` si falta prueba. No está registrado en API ni invocable por HTTP. Jamás marca `AVAILABLE`.

## Pendiente obligatorio
Se incluye `PUT /supplier-documents/:id/attachments/reservations/:reservationId/content` de bytes PDF/JPEG sin multipart, `Content-Length` obligatorio y limite de 10 MiB, SHA-256/formatos verificados contra la reserva y `IfNoneMatch: '*'`. Requiere también `ZFILES_QA_BINARY_UPLOAD_ENABLED=1` y credenciales privadas de servidor de escritura **sólo a `zaping-quarantine-qa`**. Sin esos secretos, el port de escritura rechaza en forma segura. **PUT confirmado no equivale a REGISTERED ni AVAILABLE**: la conciliación permanece fuera de la API y el scanner real sigue pendiente; tampoco existen credenciales R2 en el repositorio ni promoción segura activa. Mantener desactivado en producción. Validar las migraciones y roles SQL en PostgreSQL desechable; 03D3B private recovery 404 sigue abierto. Después integrar upload streaming y worker real tras revisión independiente.

CI ejecuta dos E2E PostgreSQL contra `ci@localhost:5432/zaping_test`, además de API/Web/Agents/Historical. La rama queda Draft hasta aprobación de seguridad.

## QA reservation status — retry/recovery observation

`GET /supplier-documents/:id/attachments/reservations/:reservationId` is a **read-only, owner-scoped** query for the operator who created the reservation. It uses the same QA-only environment gates as the reservation POST, verifies that the actor is active and ADMIN/MANAGER, and requires the ACTIVE SupplierDocument to belong to the authenticated company. The only returned properties are `id`, `status`, `sizeBytes`, `createdAt`; it does not disclose object keys, hashes, JWTs or scanner evidence. A REGISTERED reservation means quarantine verification, **not** an antivirus-clear or AVAILABLE file. This endpoint does not release quota, retry PUT, run reconciliation or grant download access.

## Safe quota recovery (never-started uploads only)

A one-way nullable `writeAttemptedAt` fence is committed under the same `SupplierDocument` row lock used for reservations, **after** HTTP bytes validate but **before** any Cloudflare R2 `PutObject`. If the claimant wins, no future cancellation is permitted, even if the PUT later times out or fails: an in-flight/uncertain object must remain reserved for explicit reconciliation.

QA-only `POST /supplier-documents/:id/attachments/reservations/:reservationId/cancel` requires the authenticated reservation creator, active ADMIN/MANAGER user, ACTIVE document and a reservation still `RESERVED` with `writeAttemptedAt IS NULL`. A single transaction records immutable `CANCELLED_BEFORE_WRITE` audit evidence, then transitions to `RELEASED_VERIFIED_EMPTY`; the SQL trigger refuses quota-release transitions without the corresponding event. The same lock serializes cancellation against any write-intent claim. Idempotent repeats return the terminal status. The client never supplies an R2 object key, SQL authority token or claimed scanner verdict.

**Meaning:** `RELEASED_VERIFIED_EMPTY` is an internal protocol claim that the *authorized backend writer never began a PUT*. It is NOT based on a single R2 HEAD 404, which cannot exclude a delayed in-flight PUT. Direct writes using independent leaked/privileged bucket credentials lie outside this protocol; bucket IAM and runtime SQL privileges remain explicit deployment gates. No automatic timeout-based release, no storage deletion and no attempt to release `RECONCILE_REQUIRED` or write-started reservations are implemented. This change is still QA-only, Draft, and not permission to enable production uploads.
