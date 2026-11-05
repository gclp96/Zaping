-- ZFILES-R2-03D2B: auditable, narrowly scoped transactional SQL release.
-- Not an R2/verifier: SQL cannot validate Ed25519 or object bytes.
-- NO runtime GRANTs, route, credentials or automatic deployment.
BEGIN;

CREATE TABLE public."SupplierAttachmentPromotionAudit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "jobId" UUID NOT NULL,
  "scanReceiptId" UUID NOT NULL,
  "companyId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "privateKey" VARCHAR(300) NOT NULL,
  "bytesSha256" VARCHAR(64) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "scanKeyId" VARCHAR(64) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZSAPA_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ZSAPA_job_unique" UNIQUE ("jobId"),
  CONSTRAINT "ZSAPA_receipt_unique" UNIQUE ("scanReceiptId"),
  CONSTRAINT "ZSAPA_attachment_unique" UNIQUE ("companyId", "attachmentId"),
  CONSTRAINT "ZSAPA_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 10485760),
  CONSTRAINT "ZSAPA_sha_check" CHECK ("bytesSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ZSAPA_key_check" CHECK (
    "privateKey" = 'private/' || "companyId" || '/' ||
      "documentId" || '/' || "attachmentId"
  ),
  CONSTRAINT "ZSAPA_job_fk" FOREIGN KEY ("jobId")
    REFERENCES public."SupplierAttachmentScanJob"("id")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "ZSAPA_receipt_fk" FOREIGN KEY ("scanReceiptId")
    REFERENCES public."SupplierAttachmentScanReceipt"("id")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "ZSAPA_attachment_company_fk" FOREIGN KEY ("attachmentId", "companyId")
    REFERENCES public."SupplierDocumentAttachment"("id", "companyId")
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX "ZSAPA_company_document_recorded_idx"
  ON public."SupplierAttachmentPromotionAudit"
  ("companyId", "documentId", "recordedAt");

-- Event is append-only. A release succeeds only when the event and state
-- transition COMMIT together; a rollback leaves neither behind.
CREATE FUNCTION public."guard_zfiles_promotion_audit"()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Promotion audit is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ZSAPA_immutable"
  BEFORE UPDATE OR DELETE ON public."SupplierAttachmentPromotionAudit"
  FOR EACH ROW EXECUTE FUNCTION public."guard_zfiles_promotion_audit"();

-- Preserve the original deny-all behavior except ONE transition. An
-- UPDATE must originate from the dedicated release function's transaction,
-- be linked to its append-only audit row and alter only the scan fields.
-- A caller-provided custom GUC alone is never sufficient: without the
-- matching audit INSERT right and role-scoped function it cannot pass.
CREATE OR REPLACE FUNCTION public."guard_supplier_document_attachment_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
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

  IF TG_OP = 'UPDATE'
     AND OLD."status" = 'PENDING_SCAN'
     AND NEW."status" = 'AVAILABLE'
     AND NEW."scanEngine" = 'ZAPING_R2_CLAMAV_VERIFIED_V1'
     AND NEW."scannedAt" IS NOT NULL
     AND (to_jsonb(NEW) - 'status' - 'scanEngine' - 'scannedAt')
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - 'status' - 'scanEngine' - 'scannedAt')
     AND EXISTS (
       SELECT 1
       FROM public."SupplierAttachmentPromotionAudit" a
       WHERE a."companyId" = OLD."companyId"
         AND a."documentId" = OLD."documentId"
         AND a."attachmentId" = OLD."id"
         AND a."jobId"::text =
           pg_catalog.current_setting('zfiles.release_job_id', true)
         AND a."bytesSha256" = OLD."sha256"
         AND a."sizeBytes" = OLD."sizeBytes"
         AND a."privateKey" = OLD."storageKey"
     )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Attachment mutation denied';
END;
$$;

-- Trust boundary: ONLY an isolated Node promoter that has revalidated
-- Ed25519 AND R2 source/private bytes may submit these measured values.
-- SQL rechecks scope/state/claims under row locks; it does NOT measure R2.
CREATE FUNCTION public."commit_zfiles_verified_private_release"(
  p_job_id UUID,
  p_company_id TEXT,
  p_private_key TEXT,
  p_verified_sha256 TEXT,
  p_verified_size INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET TimeZone = 'UTC'
AS $$
DECLARE
  v_job RECORD;
  v_attachment RECORD;
  v_receipt RECORD;
  v_document_status TEXT;
  v_job_attachment_id TEXT;
  v_updated INTEGER;
  v_now TIMESTAMP(3);
BEGIN
  IF p_job_id IS NULL OR p_company_id IS NULL
     OR p_private_key IS NULL OR p_verified_sha256 IS NULL
     OR p_verified_size IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Lock ordering starts with the attachment, also used by challenge issuer.
  SELECT j."attachmentId" INTO v_job_attachment_id
  FROM public."SupplierAttachmentScanJob" j
  WHERE j."id" = p_job_id AND j."companyId" = p_company_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT a.* INTO v_attachment
  FROM public."SupplierDocumentAttachment" a
  WHERE a."id" = v_job_attachment_id AND a."companyId" = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT j.* INTO v_job
  FROM public."SupplierAttachmentScanJob" j
  WHERE j."id" = p_job_id AND j."companyId" = p_company_id
    AND j."attachmentId" = v_attachment."id"
  FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT d."status"::text INTO v_document_status
  FROM public."SupplierDocument" d
  WHERE d."id" = v_job."documentId"
    AND d."companyId" = v_job."companyId"
    AND d."id" = v_attachment."documentId"
  FOR SHARE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT r.* INTO v_receipt
  FROM public."SupplierAttachmentScanReceipt" r
  WHERE r."jobId" = v_job."id"
    AND r."companyId" = v_job."companyId"
    AND r."documentId" = v_job."documentId"
    AND r."attachmentId" = v_job."attachmentId"
    AND r."requestNonce" = v_job."requestNonce";
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Recheck AFTER locks. The signed JSONB is only a structural check;
  -- signature validity and scan policy are enforced by the isolated worker.
  IF v_job."status" <> 'CONSUMED'
     OR v_job."consumedAt" IS NULL
     OR v_job."consumedAt" < v_job."issuedAt"
     OR v_job."consumedAt" >= v_job."expiresAt"
     OR v_document_status <> 'ACTIVE'
     OR v_attachment."removedAt" IS NOT NULL
     OR v_receipt."verdict" <> 'CLEAN_CANDIDATE'
     OR p_private_key <> v_attachment."storageKey"
     OR p_private_key <> 'private/' || v_job."companyId" || '/' ||
          v_job."documentId" || '/' || v_job."attachmentId"
     OR v_job."quarantineKey" <> 'quarantine/' || v_job."companyId" ||
          '/' || v_job."documentId" || '/' || v_job."attachmentId"
     OR p_verified_sha256 <> v_job."contentSha256"
     OR p_verified_sha256 <> v_attachment."sha256"
     OR p_verified_sha256 !~ '^[0-9a-f]{64}$'
     OR p_verified_size <> v_job."contentSizeBytes"
     OR p_verified_size <> v_attachment."sizeBytes"
     OR p_verified_size NOT BETWEEN 1 AND 10485760
     OR v_attachment."contentType" NOT IN ('application/pdf','image/jpeg')
     OR v_receipt."signedEnvelope"->'claims'->>'protocol' <>
          'zaping-scan-evidence-v1'
     OR v_receipt."signedEnvelope"->'claims'->>'verdict' <>
          'CLEAN_CANDIDATE'
     OR v_receipt."signedEnvelope"->'claims'->>'companyId' <>
          v_job."companyId"
     OR v_receipt."signedEnvelope"->'claims'->>'documentId' <>
          v_job."documentId"
     OR v_receipt."signedEnvelope"->'claims'->>'attachmentId' <>
          v_job."attachmentId"
     OR v_receipt."signedEnvelope"->'claims'->>'requestNonce' <>
          v_job."requestNonce"::text
     OR v_receipt."signedEnvelope"->'claims'->>'quarantineKey' <>
          v_job."quarantineKey"
     OR v_receipt."signedEnvelope"->'claims'->'contentSizeBytes'
          IS DISTINCT FROM to_jsonb(v_job."contentSizeBytes")
     OR v_receipt."signedEnvelope"->'claims'->>'contentSha256' <>
          v_job."contentSha256"
     OR v_receipt."signedEnvelope"->'claims'->'bytesVerified'
          IS DISTINCT FROM 'true'::jsonb
     OR v_receipt."signedEnvelope"->>'keyId' IS NULL
  THEN
    RETURN FALSE;
  END IF;

  -- A repeat is idempotent only for EXACTLY the same committed job and
  -- measured bytes. This does not replace future R2 reconciliation.
  IF v_attachment."status" = 'AVAILABLE' THEN
    RETURN EXISTS (
      SELECT 1 FROM public."SupplierAttachmentPromotionAudit" a
      WHERE a."jobId" = v_job."id"
        AND a."scanReceiptId" = v_receipt."id"
        AND a."companyId" = v_job."companyId"
        AND a."attachmentId" = v_job."attachmentId"
        AND a."privateKey" = p_private_key
        AND a."bytesSha256" = p_verified_sha256
        AND a."sizeBytes" = p_verified_size
    );
  END IF;
  IF v_attachment."status" <> 'PENDING_SCAN' THEN RETURN FALSE; END IF;

  v_now := clock_timestamp() AT TIME ZONE 'UTC';
  INSERT INTO public."SupplierAttachmentPromotionAudit" (
    "jobId", "scanReceiptId", "companyId", "documentId",
    "attachmentId", "privateKey", "bytesSha256", "sizeBytes",
    "scanKeyId", "recordedAt"
  ) VALUES (
    v_job."id", v_receipt."id", v_job."companyId", v_job."documentId",
    v_job."attachmentId", p_private_key, p_verified_sha256,
    p_verified_size, v_receipt."signedEnvelope"->>'keyId', v_now
  );

  -- Transaction-local and bound to the audit row. Reset at transaction end.
  PERFORM pg_catalog.set_config('zfiles.release_job_id', v_job."id"::text, true);
  UPDATE public."SupplierDocumentAttachment" a
  SET "status" = 'AVAILABLE',
      "scannedAt" = v_now,
      "scanEngine" = 'ZAPING_R2_CLAMAV_VERIFIED_V1'
  WHERE a."id" = v_attachment."id"
    AND a."companyId" = p_company_id
    AND a."status" = 'PENDING_SCAN';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'ZFILES release transaction rolled back';
  END IF;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON TABLE public."SupplierAttachmentPromotionAudit" FROM PUBLIC;
REVOKE ALL ON FUNCTION public."commit_zfiles_verified_private_release"(
  UUID, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC;
COMMIT;
