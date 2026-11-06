-- B3d3: only verified quarantine objects may be registered PENDING_SCAN.
-- No mutation of stored bytes, no scanner override, and no automatic quota release.
ALTER TABLE "SupplierAttachmentUploadReservation"
  ADD CONSTRAINT "SAR_id_company_key" UNIQUE ("id", "companyId");

CREATE TYPE "SupplierAttachmentReconcileAction" AS ENUM
  ('NEEDS_REVIEW', 'QUARANTINE_VERIFIED');

CREATE TABLE "SupplierAttachmentReconcileEvent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "action" "SupplierAttachmentReconcileAction" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierAttachmentReconcileEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SARE_company_reservation_created_idx"
  ON "SupplierAttachmentReconcileEvent" ("companyId", "reservationId", "createdAt");

ALTER TABLE "SupplierAttachmentReconcileEvent" ADD CONSTRAINT "SARE_company_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "SupplierAttachmentReconcileEvent" ADD CONSTRAINT "SARE_reservation_fkey"
  FOREIGN KEY ("reservationId", "companyId")
  REFERENCES "SupplierAttachmentUploadReservation"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_supplier_attachment_reconcile_event"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Upload reconciliation events are append-only';
END;
$$;
CREATE TRIGGER "SARE_append_only"
BEFORE UPDATE OR DELETE ON "SupplierAttachmentReconcileEvent"
FOR EACH ROW EXECUTE FUNCTION "guard_supplier_attachment_reconcile_event"();

-- Replace the deliberately immutable B3d2 guard with narrowly permitted,
-- traceable status transitions. Immutable identity, size, hash, bucket key and
-- actor never change. A REGISTERED state requires a corresponding PENDING_SCAN
-- attachment with exactly the same ID and metadata, and a deterministic private
-- key that cannot be downloaded unless a real scanner later marks AVAILABLE.
CREATE OR REPLACE FUNCTION "guard_supplier_attachment_reservation"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Upload reservations cannot be deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'RESERVED' THEN
      RAISE EXCEPTION 'Upload attempts must start RESERVED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."companyId" IS DISTINCT FROM NEW."companyId"
    OR OLD."documentId" IS DISTINCT FROM NEW."documentId"
    OR OLD."createdById" IS DISTINCT FROM NEW."createdById"
    OR OLD."requestKey" IS DISTINCT FROM NEW."requestKey"
    OR OLD."quarantineKey" IS DISTINCT FROM NEW."quarantineKey"
    OR OLD."originalName" IS DISTINCT FROM NEW."originalName"
    OR OLD."contentType" IS DISTINCT FROM NEW."contentType"
    OR OLD."sizeBytes" IS DISTINCT FROM NEW."sizeBytes"
    OR OLD."sha256" IS DISTINCT FROM NEW."sha256"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
  THEN
    RAISE EXCEPTION 'Immutable upload reservation metadata';
  END IF;

  IF OLD."status" = 'RESERVED'
    AND NEW."status" = 'RECONCILE_REQUIRED'
  THEN
    RETURN NEW;
  END IF;

  IF OLD."status" IN ('RESERVED','RECONCILE_REQUIRED')
    AND NEW."status" = 'REGISTERED'
    AND EXISTS (
      SELECT 1 FROM "SupplierDocumentAttachment" a
      WHERE a."id" = NEW."id"
        AND a."companyId" = NEW."companyId"
        AND a."documentId" = NEW."documentId"
        AND a."uploadedById" = NEW."createdById"
        AND a."originalName" = NEW."originalName"
        AND a."contentType" = NEW."contentType"
        AND a."sizeBytes" = NEW."sizeBytes"
        AND a."sha256" = NEW."sha256"
        AND a."storageKey" = replace(NEW."quarantineKey", 'quarantine/', 'private/')
        AND a."status" = 'PENDING_SCAN'
        AND a."scannedAt" IS NULL
    )
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid upload reservation transition';
END;
$$;