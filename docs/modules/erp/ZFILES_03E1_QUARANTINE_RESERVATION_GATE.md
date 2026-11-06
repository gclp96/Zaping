# ZFILES-03E1 — Reservas y conciliación de cuarentena

**Base:** main al 05/11/2026. Selección del código #151–#153, sin fusionar las ramas antiguas.

## API QA, desactivada por defecto
`POST /supplier-documents/:id/attachments/reservations` exige JWT, ADMIN/MANAGER, actor activo, empresa y documento ACTIVE. Requiere simultáneamente `ZFILES_DEPLOYMENT_SCOPE=qa` y `ZFILES_QA_RESERVATIONS_ENABLED=1`, `Idempotency-Key` de 8–128 caracteres y JSON `{ originalName, contentType, sizeBytes, sha256 }`. PDF/JPEG máximo 10 MiB. Responde sólo ID, estado RESERVED, tamaño y fecha; nunca claves, bucket, SHA ni credenciales.

Las reservas usan bloqueo PostgreSQL por SupplierDocument, cuotas concurrentes de 10 adjuntos y 100 MiB totales, e idempotencia de request key.

## Preparado internamente, NO activo
`CloudflareR2QuarantineWriter` valida bytes y hace PUT create-once `IfNoneMatch: '*'`. `CloudflareR2QuarantineVerifier` comprueba lectura íntegra con SHA-256 y límites; debe usar otra identidad R2. `SupplierAttachmentUploadReconciliationService` registra `PENDING_SCAN` y auditoría sólo tras la verificación de cuarentena, o conserva cuota en `RECONCILE_REQUIRED` si falta prueba. No está registrado en API ni invocable por HTTP. Jamás marca `AVAILABLE`.

## Pendiente obligatorio
No existe PUT de bytes HTTP, credenciales R2 en NestJS, scanner de producción, ni promoción segura activa. Mantener desactivado en producción. Validar las migraciones y roles SQL en PostgreSQL desechable; 03D3B private recovery 404 sigue abierto. Después integrar upload streaming y worker real tras revisión independiente.

CI ejecuta dos E2E PostgreSQL contra `ci@localhost:5432/zaping_test`, además de API/Web/Agents/Historical. La rama queda Draft hasta aprobación de seguridad.
