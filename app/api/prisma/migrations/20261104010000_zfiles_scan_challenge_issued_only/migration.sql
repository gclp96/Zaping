-- ZFILES-R2-03C2A: additive scan-challenge ledger ONLY.
-- Runtime privileges are deliberately DENIED; no evidence acceptance or
-- PENDING_SCAN -> AVAILABLE transition is implemented.
BEGIN;

CREATE TYPE "SupplierAttachmentScanJobStatus" AS ENUM
  ('ISSUED', 'CONSUMED', 'EXPIRED');

-- Composite FK anchors a challenge to one existing attachment and Company.
CREATE UNIQUE INDEX "ZSATT_id_company_key"
  ON "SupplierDocumentAttachment" ("id", "companyId");

CREATE TABLE "SupplierAttachmentScanJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "requestNonce" UUID NOT NULL DEFAULT gen_random_uuid(),
  "quarantineKey" VARCHAR(300) NOT NULL,
  "contentSizeBytes" INTEGER NOT NULL,
  "contentSha256" VARCHAR(64) NOT NULL,
  "status" "SupplierAttachmentScanJobStatus" NOT NULL DEFAULT 'ISSUED',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "SupplierAttachmentScanJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ZSASJ_size_check"
    CHECK ("contentSizeBytes" BETWEEN 1 AND 10485760),
  CONSTRAINT "ZSASJ_sha_check"
    CHECK ("contentSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ZSASJ_key_check"
    CHECK ("quarantineKey" =
      'quarantine/' || "companyId" || '/' || "documentId" || '/' || "attachmentId"),
  CONSTRAINT "ZSASJ_ttl_check"
    CHECK ("expiresAt" >= "issuedAt" + INTERVAL '60 seconds'
       AND "expiresAt" <= "issuedAt" + INTERVAL '300 seconds'),
  CONSTRAINT "ZSASJ_state_check"
    CHECK (("status" <> 'CONSUMED' AND "consumedAt" IS NULL)
       OR ("status" = 'CONSUMED' AND "consumedAt" IS NOT NULL))
);

CREATE UNIQUE INDEX "ZSASJ_nonce_key"
  ON "SupplierAttachmentScanJob" ("requestNonce");
CREATE UNIQUE INDEX "ZSASJ_one_issued_attachment"
  ON "SupplierAttachmentScanJob" ("companyId", "attachmentId")
  WHERE "status" = 'ISSUED';
CREATE INDEX "ZSASJ_company_attachment_status_expires_idx"
  ON "SupplierAttachmentScanJob"
    ("companyId", "attachmentId", "status", "expiresAt");

ALTER TABLE "SupplierAttachmentScanJob"
  ADD CONSTRAINT "ZSASJ_attachment_company_fkey"
  FOREIGN KEY ("attachmentId", "companyId")
  REFERENCES "SupplierDocumentAttachment" ("id", "companyId")
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE "SupplierAttachmentScanJob"
  ADD CONSTRAINT "ZSASJ_document_company_fkey"
  FOREIGN KEY ("documentId", "companyId")
  REFERENCES "SupplierDocument" ("id", "companyId")
  ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE FUNCTION "guard_zfiles_scan_challenge"()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Scan challenges cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'ISSUED'
       OR NEW."consumedAt" IS NOT NULL
       OR NOT EXISTS (
          SELECT 1
          FROM "SupplierDocumentAttachment" a
          JOIN "SupplierDocument" d
            ON d."id" = a."documentId"
           AND d."companyId" = a."companyId"
          WHERE a."id" = NEW."attachmentId"
            AND a."companyId" = NEW."companyId"
            AND d."id" = NEW."documentId"
            AND d."status" = 'ACTIVE'
            AND a."status" = 'PENDING_SCAN'
            AND a."storageKey" =
                'private/' || a."companyId" || '/' ||
                a."documentId" || '/' || a."id"
            AND a."sizeBytes" = NEW."contentSizeBytes"
            AND a."sha256" = NEW."contentSha256"
        )
    THEN
      RAISE EXCEPTION 'Scan challenge requires pending company-scoped metadata';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'status' - 'consumedAt')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'consumedAt')
     OR OLD."status" <> 'ISSUED'
     OR NEW."status" <> 'EXPIRED'
     OR NEW."consumedAt" IS NOT NULL
     OR clock_timestamp() < OLD."expiresAt"
  THEN
    RAISE EXCEPTION 'Scan challenge is immutable; consumption disabled';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ZSASJ_immutable_issued_only"
BEFORE INSERT OR UPDATE OR DELETE ON "SupplierAttachmentScanJob"
FOR EACH ROW EXECUTE FUNCTION "guard_zfiles_scan_challenge"();

-- SECURITY INVOKER + no EXECUTE grant: this is callable only by migration
-- owner during disposable QA. A future issuer must verify authenticated
-- Company context BEFORE receiving any EXECUTE permission.
CREATE FUNCTION "issue_zfiles_scan_challenge"(
  p_company_id TEXT,
  p_attachment_id TEXT,
  p_ttl_seconds INTEGER DEFAULT 120
)
RETURNS TABLE (
  "jobId" UUID, "requestNonce" UUID,
  "issuedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3)
)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE
  item RECORD;
  issued RECORD;
  issued_now TIMESTAMP(3);
BEGIN
  IF p_ttl_seconds IS NULL OR p_ttl_seconds NOT BETWEEN 60 AND 300 THEN
    RAISE EXCEPTION 'Invalid scan challenge TTL';
  END IF;

  -- Serialize on the attachment, not a caller-provided lock key.
  SELECT a."id", a."companyId", a."documentId",
         a."sizeBytes", a."sha256"
    INTO item
  FROM "SupplierDocumentAttachment" a
  JOIN "SupplierDocument" d
    ON d."id" = a."documentId"
   AND d."companyId" = a."companyId"
  WHERE a."companyId" = p_company_id
    AND a."id" = p_attachment_id
    AND a."status" = 'PENDING_SCAN'
    AND d."status" = 'ACTIVE'
    AND a."storageKey" =
      'private/' || a."companyId" || '/' || a."documentId" || '/' || a."id"
  FOR UPDATE OF a;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending scan metadata not found for company';
  END IF;

  UPDATE "SupplierAttachmentScanJob" j
  SET "status" = 'EXPIRED'
  WHERE j."companyId" = item."companyId"
    AND j."attachmentId" = item."id"
    AND j."status" = 'ISSUED'
    AND j."expiresAt" <= clock_timestamp();

  IF EXISTS (
    SELECT 1 FROM "SupplierAttachmentScanJob" j
    WHERE j."companyId" = item."companyId"
      AND j."attachmentId" = item."id"
      AND j."status" = 'ISSUED'
  ) THEN
    RAISE EXCEPTION 'An active scan challenge already exists';
  END IF;

  issued_now := clock_timestamp();
  INSERT INTO "SupplierAttachmentScanJob" AS new_job (
    "companyId", "documentId", "attachmentId", "quarantineKey",
    "contentSizeBytes", "contentSha256", "issuedAt", "expiresAt"
  )
  VALUES (
    item."companyId", item."documentId", item."id",
    'quarantine/' || item."companyId" || '/' ||
       item."documentId" || '/' || item."id",
    item."sizeBytes", item."sha256", issued_now,
    issued_now + make_interval(secs => p_ttl_seconds)
  )
  RETURNING new_job."id", new_job."requestNonce",
            new_job."issuedAt", new_job."expiresAt" INTO issued;

  RETURN QUERY SELECT issued."id", issued."requestNonce",
                      issued."issuedAt", issued."expiresAt";
END;
$$;

REVOKE ALL ON TABLE "SupplierAttachmentScanJob" FROM PUBLIC;
REVOKE ALL ON FUNCTION "issue_zfiles_scan_challenge"(TEXT, TEXT, INTEGER)
  FROM PUBLIC;
-- Existing SupplierDocumentAttachment mutation-denial trigger is untouched.
-- No trigger permits CONSUMED, AVAILABLE, REJECTED or REMOVED.
COMMIT;
