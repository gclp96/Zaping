-- UX-PDOC-01B3d2: append-only upload reservation ledger, not an attachment.
-- All records start RESERVED; no automatic expiration or fabricated scan state.
CREATE TYPE "SupplierAttachmentUploadReservationStatus" AS ENUM (
  'RESERVED', 'RECONCILE_REQUIRED', 'REGISTERED', 'RELEASED_VERIFIED_EMPTY'
);

CREATE TABLE "SupplierAttachmentUploadReservation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "requestKey" VARCHAR(128) NOT NULL,
  "quarantineKey" VARCHAR(300) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "contentType" VARCHAR(32) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "status" "SupplierAttachmentUploadReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierAttachmentUploadReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SAR_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 10485760),
  CONSTRAINT "SAR_mime_check" CHECK ("contentType" IN ('application/pdf','image/jpeg')),
  CONSTRAINT "SAR_hash_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "SAR_request_key_check" CHECK (length("requestKey") BETWEEN 8 AND 128),
  CONSTRAINT "SAR_name_check" CHECK (
    length(btrim("originalName")) > 0
    AND "originalName" !~ '[/\\\\]'
    AND position(chr(10) in "originalName") = 0
    AND position(chr(13) in "originalName") = 0
  ),
  CONSTRAINT "SAR_quarantine_key_check" CHECK (
    "quarantineKey" ~ '^quarantine/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part("quarantineKey", '/', 2) = lower("companyId")
    AND split_part("quarantineKey", '/', 3) = lower("documentId")
    AND split_part("quarantineKey", '/', 4) = lower("id")
  )
);

CREATE UNIQUE INDEX "SAR_company_document_request_key"
  ON "SupplierAttachmentUploadReservation" ("companyId", "documentId", "requestKey");
CREATE UNIQUE INDEX "SAR_company_quarantine_key"
  ON "SupplierAttachmentUploadReservation" ("companyId", "quarantineKey");
CREATE INDEX "SAR_company_document_status_created"
  ON "SupplierAttachmentUploadReservation" ("companyId", "documentId", "status", "createdAt");

ALTER TABLE "SupplierAttachmentUploadReservation" ADD CONSTRAINT "SAR_company_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "SupplierAttachmentUploadReservation" ADD CONSTRAINT "SAR_document_fkey"
  FOREIGN KEY ("documentId", "companyId") REFERENCES "SupplierDocument"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "SupplierAttachmentUploadReservation" ADD CONSTRAINT "SAR_actor_fkey"
  FOREIGN KEY ("createdById", "companyId") REFERENCES "User"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Reservation metadata is an immutable, append-only ledger in B3d2.
-- A future migration must introduce *audited*, scanner-aware transitions
-- after implementing reconciliation of ambiguous R2/DB writes.
CREATE FUNCTION "guard_supplier_attachment_reservation"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Upload reservations cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Upload reservation transitions require reconciliation workflow';
  END IF;
  IF NEW."status" <> 'RESERVED' THEN
    RAISE EXCEPTION 'Upload attempts must start RESERVED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "SAR_guard_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "SupplierAttachmentUploadReservation"
FOR EACH ROW EXECUTE FUNCTION "guard_supplier_attachment_reservation"();
