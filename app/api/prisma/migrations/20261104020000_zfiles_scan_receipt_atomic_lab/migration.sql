-- ZFILES-R2-03C2B2: signed scan receipt + one-use nonce transaction.
-- ADDITIVE and DENY BY DEFAULT. No runtime GRANT, no AVAILABLE transition.
-- Ed25519 must already have been verified in the isolated TypeScript gateway;
-- PostgreSQL validates scope and replay, NOT the cryptographic signature.
BEGIN;

CREATE TABLE "SupplierAttachmentScanReceipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "jobId" UUID NOT NULL,
  "companyId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "requestNonce" UUID NOT NULL,
  "verdict" VARCHAR(24) NOT NULL,
  "signedEnvelope" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZSASR_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ZSASR_job_unique" UNIQUE ("jobId"),
  CONSTRAINT "ZSASR_nonce_unique" UNIQUE ("requestNonce"),
  CONSTRAINT "ZSASR_attachment_unique" UNIQUE ("companyId", "attachmentId"),
  CONSTRAINT "ZSASR_verdict_check"
    CHECK ("verdict" IN ('CLEAN_CANDIDATE', 'MALWARE_DETECTED')),
  CONSTRAINT "ZSASR_envelope_check"
    CHECK (jsonb_typeof("signedEnvelope") = 'object'
       AND octet_length("signedEnvelope"::text) <= 16384),
  CONSTRAINT "ZSASR_job_fk" FOREIGN KEY ("jobId")
    REFERENCES "SupplierAttachmentScanJob" ("id")
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX "ZSASR_company_document_idx"
  ON "SupplierAttachmentScanReceipt" ("companyId", "documentId", "createdAt");

-- The receipt is immutable after insertion. This database guard validates
-- job scope and signed-envelope SHAPE only; it cannot validate Ed25519.
CREATE FUNCTION "guard_zfiles_scan_receipt"()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
SET TimeZone = 'UTC' AS $$
DECLARE
  j RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Scan receipts are immutable';
  END IF;

  SELECT x.* INTO j
  FROM public."SupplierAttachmentScanJob" x
  JOIN public."SupplierDocumentAttachment" a
    ON a."id" = x."attachmentId"
   AND a."companyId" = x."companyId"
  JOIN public."SupplierDocument" d
    ON d."id" = x."documentId"
   AND d."companyId" = x."companyId"
  WHERE x."id" = NEW."jobId"
    AND x."companyId" = NEW."companyId"
    AND x."documentId" = NEW."documentId"
    AND x."attachmentId" = NEW."attachmentId"
    AND x."requestNonce" = NEW."requestNonce"
    AND x."status" = 'ISSUED'
    AND x."expiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')
    AND a."status" = 'PENDING_SCAN'
    AND d."status" = 'ACTIVE'
    AND a."storageKey" =
      'private/' || x."companyId" || '/' ||
      x."documentId" || '/' || x."attachmentId"
    AND a."sizeBytes" = x."contentSizeBytes"
    AND a."sha256" = x."contentSha256";

  IF NOT FOUND OR
    jsonb_typeof(NEW."signedEnvelope") IS DISTINCT FROM 'object' OR
    jsonb_typeof(NEW."signedEnvelope"->'claims') IS DISTINCT FROM 'object' OR
    jsonb_typeof(NEW."signedEnvelope"->'signature') IS DISTINCT FROM 'string' OR
    jsonb_typeof(NEW."signedEnvelope"->'keyId') IS DISTINCT FROM 'string' OR
    (NEW."signedEnvelope"->>'signature' ~ '^[A-Za-z0-9_-]{86}$') IS DISTINCT FROM TRUE OR
    (NEW."signedEnvelope"->>'keyId' ~ '^[a-z0-9][a-z0-9._-]{0,63}$') IS DISTINCT FROM TRUE OR
    NEW."signedEnvelope"->'claims'->>'protocol' IS DISTINCT FROM
       'zaping-scan-evidence-v1' OR
    NEW."signedEnvelope"->'claims'->>'companyId' IS DISTINCT FROM j."companyId" OR
    NEW."signedEnvelope"->'claims'->>'documentId' IS DISTINCT FROM j."documentId" OR
    NEW."signedEnvelope"->'claims'->>'attachmentId' IS DISTINCT FROM j."attachmentId" OR
    NEW."signedEnvelope"->'claims'->>'reservationId' IS DISTINCT FROM j."attachmentId" OR
    NEW."signedEnvelope"->'claims'->>'requestNonce' IS DISTINCT FROM j."requestNonce"::text OR
    NEW."signedEnvelope"->'claims'->>'quarantineKey' IS DISTINCT FROM j."quarantineKey" OR
    NEW."signedEnvelope"->'claims'->'contentSizeBytes' IS DISTINCT FROM
      to_jsonb(j."contentSizeBytes") OR
    NEW."signedEnvelope"->'claims'->>'contentSha256' IS DISTINCT FROM j."contentSha256" OR
    NEW."signedEnvelope"->'claims'->'bytesVerified' IS DISTINCT FROM 'true'::jsonb OR
    NEW."signedEnvelope"->'claims'->>'verdict' IS DISTINCT FROM NEW."verdict"
  THEN
    RAISE EXCEPTION 'Scan receipt does not match an active pending challenge';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ZSASR_insert_only_scoped"
BEFORE INSERT OR UPDATE OR DELETE ON "SupplierAttachmentScanReceipt"
FOR EACH ROW EXECUTE FUNCTION "guard_zfiles_scan_receipt"();

-- Replace the 03C2A guard without weakening its original ISSUE and EXPIRE
-- rules. CONSUMED is accepted ONLY if the receipt already exists and matches.
CREATE OR REPLACE FUNCTION "guard_zfiles_scan_challenge"()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public
SET TimeZone = 'UTC' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Scan challenges cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'ISSUED' OR NEW."consumedAt" IS NOT NULL
       OR EXISTS (
          SELECT 1 FROM public."SupplierAttachmentScanReceipt" r
          WHERE r."companyId" = NEW."companyId"
            AND r."attachmentId" = NEW."attachmentId"
       )
       OR NOT EXISTS (
          SELECT 1
          FROM public."SupplierDocumentAttachment" a
          JOIN public."SupplierDocument" d
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
  THEN
    RAISE EXCEPTION 'Scan challenge is immutable';
  END IF;

  IF NEW."status" = 'EXPIRED'
     AND NEW."consumedAt" IS NULL
     AND (clock_timestamp() AT TIME ZONE 'UTC') >= OLD."expiresAt"
  THEN
    RETURN NEW;
  END IF;

  IF NEW."status" = 'CONSUMED'
     AND NEW."consumedAt" IS NOT NULL
     AND NEW."consumedAt" >= OLD."issuedAt"
     AND NEW."consumedAt" < OLD."expiresAt"
     AND (clock_timestamp() AT TIME ZONE 'UTC') < OLD."expiresAt"
     AND EXISTS (
       SELECT 1 FROM public."SupplierAttachmentScanReceipt" r
       WHERE r."jobId" = OLD."id"
         AND r."companyId" = OLD."companyId"
         AND r."documentId" = OLD."documentId"
         AND r."attachmentId" = OLD."attachmentId"
         AND r."requestNonce" = OLD."requestNonce"
     )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Scan challenge transition not authorized';
END;
$$;

-- Data read through a narrow function, not SELECT granted on the job table.
-- Only a future isolated verifier may be allowed to call this.
CREATE FUNCTION "read_zfiles_scan_challenge"(p_job_id UUID)
RETURNS TABLE (
  "jobId" UUID, "companyId" TEXT, "documentId" TEXT,
  "attachmentId" TEXT, "requestNonce" UUID, "quarantineKey" VARCHAR(300),
  "contentSizeBytes" INTEGER, "contentSha256" VARCHAR(64),
  "status" TEXT, "issuedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3)
)
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
SET TimeZone = 'UTC' AS $$
  SELECT j."id", j."companyId", j."documentId", j."attachmentId",
         j."requestNonce", j."quarantineKey", j."contentSizeBytes",
         j."contentSha256", j."status"::text, j."issuedAt", j."expiresAt"
  FROM public."SupplierAttachmentScanJob" j
  WHERE j."id" = p_job_id;
$$;

-- Called only by the dedicated verifier *after* Ed25519 validation in Node.
-- This transaction atomically stores the immutable signed envelope and
-- consumes the nonce. SQL cannot validate the signature itself.
CREATE FUNCTION "commit_zfiles_verified_scan"(
  p_job_id UUID,
  p_company_id TEXT,
  p_request_nonce UUID,
  p_signed_envelope JSONB
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
SET TimeZone = 'UTC' AS $$
DECLARE
  item RECORD;
  inserted_count INTEGER;
  updated_count INTEGER;
  now_utc TIMESTAMP(3);
BEGIN
  now_utc := clock_timestamp() AT TIME ZONE 'UTC';

  -- Serializes replay attempts, including separate physical DB connections.
  SELECT j.* INTO item
  FROM public."SupplierAttachmentScanJob" j
  JOIN public."SupplierDocumentAttachment" a
    ON a."id" = j."attachmentId"
   AND a."companyId" = j."companyId"
  JOIN public."SupplierDocument" d
    ON d."id" = j."documentId"
   AND d."companyId" = j."companyId"
  WHERE j."id" = p_job_id
    AND j."companyId" = p_company_id
    AND j."requestNonce" = p_request_nonce
    AND j."status" = 'ISSUED'
    AND j."issuedAt" <= now_utc
    AND j."expiresAt" > now_utc
    AND a."status" = 'PENDING_SCAN'
    AND d."status" = 'ACTIVE'
    AND a."storageKey" =
      'private/' || j."companyId" || '/' ||
      j."documentId" || '/' || j."attachmentId"
    AND a."sizeBytes" = j."contentSizeBytes"
    AND a."sha256" = j."contentSha256"
  FOR UPDATE OF j;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  -- Signature is cryptographically verified outside SQL. Reject malformed
  -- and inconsistent metadata here; never treat this as signature validation.
  IF p_signed_envelope IS NULL OR
     jsonb_typeof(p_signed_envelope) IS DISTINCT FROM 'object' OR
     jsonb_typeof(p_signed_envelope->'claims') IS DISTINCT FROM 'object' OR
     p_signed_envelope->'claims'->>'companyId' IS DISTINCT FROM item."companyId" OR
     p_signed_envelope->'claims'->>'documentId' IS DISTINCT FROM item."documentId" OR
     p_signed_envelope->'claims'->>'attachmentId' IS DISTINCT FROM item."attachmentId" OR
     p_signed_envelope->'claims'->>'requestNonce' IS DISTINCT FROM item."requestNonce"::text OR
     p_signed_envelope->'claims'->>'quarantineKey' IS DISTINCT FROM item."quarantineKey" OR
     p_signed_envelope->'claims'->'contentSizeBytes' IS DISTINCT FROM to_jsonb(item."contentSizeBytes") OR
     p_signed_envelope->'claims'->>'contentSha256' IS DISTINCT FROM item."contentSha256" OR
     p_signed_envelope->'claims'->'bytesVerified' IS DISTINCT FROM 'true'::jsonb OR
     p_signed_envelope->'claims'->>'verdict' NOT IN
       ('CLEAN_CANDIDATE', 'MALWARE_DETECTED')
  THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public."SupplierAttachmentScanReceipt" (
    "jobId", "companyId", "documentId", "attachmentId",
    "requestNonce", "verdict", "signedEnvelope"
  ) VALUES (
    item."id", item."companyId", item."documentId",
    item."attachmentId", item."requestNonce",
    p_signed_envelope->'claims'->>'verdict', p_signed_envelope
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count <> 1 THEN
    RETURN FALSE;
  END IF;

  -- The challenge guard requires the just-inserted receipt and rejects all
  -- other field changes. Failure aborts the whole transaction.
  now_utc := clock_timestamp() AT TIME ZONE 'UTC';
  IF now_utc >= item."expiresAt" THEN
    RAISE EXCEPTION 'Scan challenge expired during commit';
  END IF;
  UPDATE public."SupplierAttachmentScanJob" j
    SET "status" = 'CONSUMED', "consumedAt" = now_utc
    WHERE j."id" = item."id" AND j."status" = 'ISSUED';
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 1 THEN
    RAISE EXCEPTION 'Scan challenge could not be consumed';
  END IF;
  RETURN TRUE;
END;
$$;

-- Explicitly block public and all existing runtime identities until an
-- audited deployment independently creates a dedicated verifier role.
REVOKE ALL ON TABLE "SupplierAttachmentScanReceipt" FROM PUBLIC;
REVOKE ALL ON FUNCTION "read_zfiles_scan_challenge"(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION "commit_zfiles_verified_scan"(UUID, TEXT, UUID, JSONB) FROM PUBLIC;

-- Existing SupplierDocumentAttachment state-transition deny-all remains intact.
COMMIT;
