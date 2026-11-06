# Zaping Files — Authorization-only read foundation (integration)

This integration reconstructs safe pieces of historical PR #146 on top of the current ERP. It does **not** enable actual PDF/JPEG downloads.

## Runtime controls
- NestJS routes `GET /supplier-documents/:id/attachments` and `GET /supplier-documents/:id/attachments/:attachmentId/download` are guarded by JWT, role ADMIN/MANAGER, tenant-scoped document and attachment ID, status AVAILABLE, removedAt=null, and active parent document.
- Both endpoints reject by default with HTTP 503. QA-only opt-in is `ZFILES_ATTACHMENTS_READ_QA_ENABLED=1`. Never enable this flag for customers until the real worker and R2 storage boundaries have passed independent review.
- `PrivateAttachmentObjectStore` is bound exclusively to an unconfigured, fail-closed adapter. Even if the feature flag is ON, no private bucket bytes can be read.
- The verified download path first rejects any DB `storageKey` other than `private/{companyId}/{documentId}/{attachmentId}`. This is the same canonical destination invariant required by the SQL release boundary; even an incorrectly labeled AVAILABLE row must not cause a quarantine or cross-tenant read. The service then buffers up to 10 MiB, rehashes before returning a response, strips unsafe filename characters, forces attachment disposition, disables caching and sets secure response headers.
- No SQL migration, new R2 permission, upload route, signed URL, scanner bypass or AVAILABLE promotion is included.

## Follow-up required
Link the real private R2 read-only adapter only after ClamAV/FreshClam real evidence, signed receipt, transactional release, object custody, QA tests and security review. Add attachment status listing for PENDING_SCAN/REJECTED to the full Purchase Receipts MVP (issue #251), separately from downloadable items.

Do not merge historical #145 or #146 wholesale: current main already contains a revised SupplierDocumentAttachment foundation. This integration only reuses reviewed pieces, preserving current schema and service code.
