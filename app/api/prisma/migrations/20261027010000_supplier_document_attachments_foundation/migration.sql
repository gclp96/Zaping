-- ZFILES-R2-01: metadata only; no object storage, upload, download, or scan promotion.
-- No upload or download access is enabled by this migration.
CREATE TYPE "SupplierDocumentAttachmentStatus" AS ENUM (
  'PENDING_SCAN', 'AVAILABLE', 'REJECTED', 'REMOVED'
);

CREATE TABLE "SupplierDocumentAttachment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "storageKey" VARCHAR(300) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "contentType" VARCHAR(32) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "status" "SupplierDocumentAttachmentStatus" NOT NULL DEFAULT 'PENDING_SCAN',
  "scanEngine" VARCHAR(80),
  "scannedAt" TIMESTAMP(3),
  "rejectionReason" VARCHAR(1000),
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedById" TEXT,
  "removedAt" TIMESTAMP(3),
  CONSTRAINT "SupplierDocumentAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierDocumentAttachment_size_check"
    CHECK ("sizeBytes" BETWEEN 1 AND 10485760),
  CONSTRAINT "SupplierDocumentAttachment_mime_check"
    CHECK ("contentType" IN ('application/pdf', 'image/jpeg')),
  CONSTRAINT "SupplierDocumentAttachment_sha256_check"
    CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "SupplierDocumentAttachment_name_check"
    CHECK (length(btrim("originalName")) > 0
      AND "originalName" !~ '[/\\\\]'
      AND position(chr(10) in "originalName") = 0
      AND position(chr(13) in "originalName") = 0),
  CONSTRAINT "SupplierDocumentAttachment_state_check"
    CHECK (
      ("status" = 'PENDING_SCAN' AND "scannedAt" IS NULL
        AND "scanEngine" IS NULL AND "rejectionReason" IS NULL
        AND "removedAt" IS NULL AND "removedById" IS NULL)
      OR
      ("status" = 'AVAILABLE' AND "scannedAt" IS NOT NULL
        AND "scanEngine" IS NOT NULL AND length(btrim("scanEngine")) > 0
        AND "rejectionReason" IS NULL
        AND "removedAt" IS NULL AND "removedById" IS NULL)
      OR
      ("status" = 'REJECTED' AND "scannedAt" IS NOT NULL
        AND "scanEngine" IS NOT NULL AND length(btrim("scanEngine")) > 0
        AND "rejectionReason" IS NOT NULL AND length(btrim("rejectionReason")) > 0
        AND "removedAt" IS NULL AND "removedById" IS NULL)
      OR
      ("status" = 'REMOVED' AND "scannedAt" IS NOT NULL
        AND "scanEngine" IS NOT NULL AND length(btrim("scanEngine")) > 0
        AND "removedAt" IS NOT NULL AND "removedById" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "SupplierDocumentAttachment_companyId_storageKey_key"
  ON "SupplierDocumentAttachment" ("companyId", "storageKey");
CREATE INDEX "SupplierDocumentAttachment_companyId_documentId_status_createdAt_idx"
  ON "SupplierDocumentAttachment" ("companyId", "documentId", "status", "createdAt");

ALTER TABLE "SupplierDocumentAttachment" ADD CONSTRAINT "SDATT_company_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "SupplierDocumentAttachment" ADD CONSTRAINT "SDATT_document_fkey"
  FOREIGN KEY ("documentId", "companyId") REFERENCES "SupplierDocument"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "SupplierDocumentAttachment" ADD CONSTRAINT "SDATT_uploaded_by_fkey"
  FOREIGN KEY ("uploadedById", "companyId") REFERENCES "User"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "SupplierDocumentAttachment" ADD CONSTRAINT "SDATT_removed_by_fkey"
  FOREIGN KEY ("removedById", "companyId") REFERENCES "User"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- IMPORTANT: no trusted worker/attestation/gateway is installed in this slice.
-- Deny every UPDATE and DELETE, including spoofed scan fields and AVAILABLE.
-- A later reviewed migration must add narrowly authorized promotion.
CREATE FUNCTION "guard_supplier_document_attachment_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'PENDING_SCAN'
      OR NEW."scanEngine" IS NOT NULL
      OR NEW."scannedAt" IS NOT NULL
      OR NEW."rejectionReason" IS NOT NULL
      OR NEW."removedById" IS NOT NULL
      OR NEW."removedAt" IS NOT NULL
    THEN
      RAISE EXCEPTION 'Attachment insertion must remain pending scan';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Attachment mutations are closed until verified scanner and promoter authorization exists';
END;
$$;

CREATE TRIGGER "SDATT_immutable_and_scan_gate"
BEFORE INSERT OR UPDATE OR DELETE ON "SupplierDocumentAttachment"
FOR EACH ROW EXECUTE FUNCTION "guard_supplier_document_attachment_mutation"();
