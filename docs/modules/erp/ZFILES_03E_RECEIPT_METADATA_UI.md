# ZFILES-03E — Read-only QA metadata on Purchase Receipts

## Scope
- Existing receipt view already contains a **local-only** PDF/JPEG selection prototype. This PR does not modify it or send any File bytes.
- For each validated, ACTIVE supplier document linked to a receipt, the management-only UI may additionally request the read-only attachment list endpoint proposed in PR #253.
- The client flag `NEXT_PUBLIC_ZFILES_RECEIPT_ATTACHMENTS_QA_ENABLED=1` is **OFF by default**. With the flag absent, the component is invisible and makes **no API request**.
- The server endpoint remains separately gated by `ZFILES_ATTACHMENTS_READ_QA_ENABLED` and JWT/role/company checks. Turning on only the client flag cannot bypass the backend.
- The response contract is an array of at most 10 records, containing only `id`, `originalName`, `contentType`, `sizeBytes` and `createdAt`. Unknown fields, including internal storage keys or hashes, cause the UI to reject the payload.
- This view shows **only AVAILABLE metadata**, not PENDING_SCAN or REJECTED files. No download button or claim of a real ClamAV clearance is shown.

## Release conditions
Do not enable the client flag until PR #253 has been independently security-reviewed, integrated, and its server flag approved for QA. The production environment must not set either flag. Real upload, scan, promotion, status listing, download and cross-tenant E2E remain tracked in issue #251.

## Tests
Disabled/zero API requests; safe metadata rendering; URL encoding; malformed or internal-key payloads rejected; errors sanitized. The parent component's existing management-role and company-reset tests remain mandatory.
