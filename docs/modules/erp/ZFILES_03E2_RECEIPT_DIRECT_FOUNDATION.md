# ZFILES-03E2 — receipt-native attachment metadata

**Goal:** an attachment to a goods receipt must NOT require a SupplierDocument (invoice, dispatch note or commercial note). The domain association is directly `PurchaseReceipt.id` + `Company.id`.

**Schema and SQL:** `PurchaseReceiptAttachment` with tenant-qualified foreign keys, uploader actor, immutable metadata, fixed planned destination `private/receipts/{companyId}/{receiptId}/{attachmentId}`, MIME PDF/JPEG, max 10 MiB and SHA-256. The database enforces `PENDING_SCAN` on every insert and rejects ALL UPDATE and DELETE operations. `AVAILABLE` cannot be forged by web/API/DB clients; any future promotion requires a separately audited worker and SQL authority. There is no object write or private read in this PR.

**QA-only read:** `GET /purchase-receipts/:id/attachments` accepts only JWT ADMIN/MANAGER and additionally rechecks active actor role and tenant-owned receipt. Requires BOTH server flags `ZFILES_DEPLOYMENT_SCOPE=qa` and `ZFILES_RECEIPT_ATTACHMENT_METADATA_QA_ENABLED=1`; default is HTTP 503. Response selects only ID, name, type, size, status and creation date, max five. It does not expose storage keys, hashes or URLs.

**Not included:** upload reservation or object bytes, PDF preview, ClamAV worker, signed scan attestation, private R2 copy, SQL AVAILABLE, role grants, retries or downloads. Existing SupplierDocumentAttachment data and PR #255 are NOT changed. The scanned path will reuse verified infrastructure once custody/reconciliation and role isolation pass their gates.

**Test boundaries:** isolated PostgreSQL CI only: receipt with zero SupplierDocuments, cross-tenant FKs, forged status rejected, immutability, canonical object destination and authenticated read scope. No real objects or credentials are used. **No manual migrations outside CI** until reviewed.
