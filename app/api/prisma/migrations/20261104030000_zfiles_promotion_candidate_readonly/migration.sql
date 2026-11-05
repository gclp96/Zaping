-- ZFILES-R2-03D2A: read-only tenant-scoped promotion candidate.
-- This deliberately has NO release/update authority and NO runtime GRANT.
-- The promoter must independently verify Ed25519 before any R2 operations.
BEGIN;

CREATE FUNCTION public."read_zfiles_promotion_candidate"(
  p_job_id UUID,
  p_company_id TEXT
) RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET TimeZone = 'UTC'
AS $$
  SELECT jsonb_build_object(
    'jobId', j."id",
    'companyId', j."companyId",
    'documentId', j."documentId",
    'attachmentId', j."attachmentId",
    'requestNonce', j."requestNonce",
    'quarantineKey', j."quarantineKey",
    'contentSizeBytes', j."contentSizeBytes",
    'contentSha256', j."contentSha256",
    'originalName', a."originalName",
    'contentType', a."contentType",
    'jobStatus', j."status",
    'documentStatus', d."status",
    'attachmentStatus', a."status",
    'receipt', jsonb_build_object(
      'jobId', r."jobId",
      'companyId', r."companyId",
      'documentId', r."documentId",
      'attachmentId', r."attachmentId",
      'requestNonce', r."requestNonce",
      'verdict', r."verdict",
      'signedEnvelope', r."signedEnvelope"
    )
  )
  FROM public."SupplierAttachmentScanJob" j
  INNER JOIN public."SupplierDocumentAttachment" a
    ON a."id" = j."attachmentId" AND a."companyId" = j."companyId"
  INNER JOIN public."SupplierDocument" d
    ON d."id" = j."documentId" AND d."companyId" = j."companyId"
    AND d."id" = a."documentId"
  INNER JOIN public."SupplierAttachmentScanReceipt" r
    ON r."jobId" = j."id"
    AND r."companyId" = j."companyId"
    AND r."documentId" = j."documentId"
    AND r."attachmentId" = j."attachmentId"
    AND r."requestNonce" = j."requestNonce"
  WHERE j."id" = p_job_id
    AND j."companyId" = p_company_id
    AND p_job_id IS NOT NULL
    AND p_company_id IS NOT NULL
    AND j."status" = 'CONSUMED'
    AND j."consumedAt" IS NOT NULL
    AND j."issuedAt" <= j."consumedAt"
    AND j."consumedAt" < j."expiresAt"
    AND a."status" = 'PENDING_SCAN'
    AND a."removedAt" IS NULL
    AND d."status" = 'ACTIVE'
    AND r."verdict" = 'CLEAN_CANDIDATE'
    AND a."storageKey" = 'private/' || j."companyId" || '/'
                         || j."documentId" || '/' || j."attachmentId"
    AND j."quarantineKey" = 'quarantine/' || j."companyId" || '/'
                            || j."documentId" || '/' || j."attachmentId"
    AND a."sizeBytes" = j."contentSizeBytes"
    AND j."contentSizeBytes" BETWEEN 1 AND 10485760
    AND a."sha256" = j."contentSha256"
    AND j."contentSha256" ~ '^[0-9a-f]{64}$'
    AND a."contentType" IN ('application/pdf', 'image/jpeg')
    AND r."signedEnvelope"->'claims'->>'protocol' =
        'zaping-scan-evidence-v1'
    AND r."signedEnvelope"->'claims'->>'verdict' = 'CLEAN_CANDIDATE'
    AND r."signedEnvelope"->'claims'->>'companyId' = j."companyId"
    AND r."signedEnvelope"->'claims'->>'documentId' = j."documentId"
    AND r."signedEnvelope"->'claims'->>'attachmentId' = j."attachmentId"
    AND r."signedEnvelope"->'claims'->>'reservationId' = j."attachmentId"
    AND r."signedEnvelope"->'claims'->>'requestNonce' = j."requestNonce"::text
    AND r."signedEnvelope"->'claims'->>'quarantineKey' = j."quarantineKey"
    AND r."signedEnvelope"->'claims'->'contentSizeBytes' =
        to_jsonb(j."contentSizeBytes")
    AND r."signedEnvelope"->'claims'->>'contentSha256' = j."contentSha256"
    AND r."signedEnvelope"->'claims'->'bytesVerified' = 'true'::jsonb
  LIMIT 1
$$;

-- PostgreSQL's function EXECUTE default is PUBLIC unless explicitly revoked.
-- Dedicated, audit-reviewed EXECUTE is created in a later deployment gate,
-- never in this migration. CI may grant only inside disposable PostgreSQL.
REVOKE ALL ON FUNCTION public."read_zfiles_promotion_candidate"(UUID, TEXT)
  FROM PUBLIC;

COMMIT;
