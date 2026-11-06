-- ZFILES-03E2: receipt-native attachments, independent from supplier documents.
-- Metadata only: no R2 objects, byte ingest, worker, SQL release or download.
-- An INSERT is always PENDING_SCAN; update/delete impossible until separately audited migration.
BEGIN;

CREATE TYPE public."PurchaseReceiptAttachmentStatus" AS ENUM
  ('PENDING_SCAN', 'AVAILABLE', 'REJECTED', 'REMOVED');

CREATE TABLE public."PurchaseReceiptAttachment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "storageKey" VARCHAR(300) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "contentType" VARCHAR(32) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "status" public."PurchaseReceiptAttachmentStatus" NOT NULL DEFAULT 'PENDING_SCAN',
  "scanEngine" VARCHAR(80),
  "scannedAt" TIMESTAMP(3),
  "rejectionReason" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedById" TEXT,
  "removedAt" TIMESTAMP(3),
  CONSTRAINT "PRATT_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PRATT_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 10485760),
  CONSTRAINT "PRATT_mime_check" CHECK ("contentType" IN ('application/pdf', 'image/jpeg')),
  CONSTRAINT "PRATT_sha_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "PRATT_name_check" CHECK (
    length(btrim("originalName")) > 0
    AND "originalName" !~ '[/\\\\]'
    AND position(chr(10) in "originalName") = 0
    AND position(chr(13) in "originalName") = 0
  ),
  CONSTRAINT "PRATT_key_check" CHECK (
    "storageKey" = 'private/receipts/' || lower("companyId") || '/' ||
      lower("receiptId") || '/' || lower("id")
  ),
  CONSTRAINT "PRATT_pending_only_check" CHECK (
    ("status" = 'PENDING_SCAN' AND "scanEngine" IS NULL
      AND "scannedAt" IS NULL AND "rejectionReason" IS NULL
      AND "removedById" IS NULL AND "removedAt" IS NULL)
    OR
    ("status" = 'AVAILABLE' AND "scanEngine" IS NOT NULL
      AND "scannedAt" IS NOT NULL AND "rejectionReason" IS NULL
      AND "removedById" IS NULL AND "removedAt" IS NULL)
    OR
    ("status" = 'REJECTED' AND "scanEngine" IS NOT NULL
      AND "scannedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL
      AND "removedById" IS NULL AND "removedAt" IS NULL)
    OR
    ("status" = 'REMOVED' AND "scanEngine" IS NOT NULL
      AND "scannedAt" IS NOT NULL AND "removedById" IS NOT NULL
      AND "removedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "PRATT_company_storage_key"
  ON public."PurchaseReceiptAttachment" ("companyId", "storageKey");
CREATE INDEX "PRATT_company_receipt_status_created_idx"
  ON public."PurchaseReceiptAttachment" ("companyId", "receiptId", "status", "createdAt");

ALTER TABLE public."PurchaseReceiptAttachment" ADD CONSTRAINT "PRATT_company_fkey"
  FOREIGN KEY ("companyId") REFERENCES public."Company"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."PurchaseReceiptAttachment" ADD CONSTRAINT "PRATT_receipt_fkey"
  FOREIGN KEY ("receiptId", "companyId") REFERENCES public."PurchaseReceipt"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."PurchaseReceiptAttachment" ADD CONSTRAINT "PRATT_uploaded_by_fkey"
  FOREIGN KEY ("uploadedById", "companyId") REFERENCES public."User"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."PurchaseReceiptAttachment" ADD CONSTRAINT "PRATT_removed_by_fkey"
  FOREIGN KEY ("removedById", "companyId") REFERENCES public."User"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION public."guard_purchase_receipt_attachment_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND NEW."status" = 'PENDING_SCAN'
    AND NEW."scanEngine" IS NULL AND NEW."scannedAt" IS NULL
    AND NEW."rejectionReason" IS NULL
    AND NEW."removedAt" IS NULL AND NEW."removedById" IS NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Receipt attachment changes require verified promotion authority';
END;
$$;

CREATE TRIGGER "PRATT_immutable_scan_gate"
  BEFORE INSERT OR UPDATE OR DELETE ON public."PurchaseReceiptAttachment"
  FOR EACH ROW EXECUTE FUNCTION public."guard_purchase_receipt_attachment_mutation"();

REVOKE ALL ON public."PurchaseReceiptAttachment" FROM PUBLIC;
COMMIT;
