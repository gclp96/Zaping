-- Zaping Files V1. Tenant FKs and immutable audit events.
CREATE TYPE "ZapingFileScanStatus" AS ENUM ('NOT_SCANNED', 'PENDING_SCAN', 'CLEAN', 'INFECTED', 'SCAN_FAILED');
CREATE TYPE "ZapingFileEventType" AS ENUM ('UPLOADED', 'DOWNLOAD_REQUESTED', 'SOFT_DELETED');

CREATE TABLE "ZapingFile" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "objectKey" VARCHAR(350) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "contentType" VARCHAR(32) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "scanStatus" "ZapingFileScanStatus" NOT NULL DEFAULT 'NOT_SCANNED',
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedById" TEXT,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ZapingFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ZapingFile_positive_size" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760),
  CONSTRAINT "ZapingFile_supported_mime" CHECK ("contentType" IN ('application/pdf', 'image/jpeg')),
  CONSTRAINT "ZapingFile_sha256_hex" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ZapingFile_tenant_key" CHECK ("objectKey" LIKE ('tenants/' || "companyId" || '/purchase-receipts/%')),
  CONSTRAINT "ZapingFile_scanner_deferred" CHECK ("scanStatus" = 'NOT_SCANNED'::"ZapingFileScanStatus"),
  CONSTRAINT "ZapingFile_deletion_actor" CHECK (
    ("deletedAt" IS NULL AND "deletedById" IS NULL) OR
    ("deletedAt" IS NOT NULL AND "deletedById" IS NOT NULL)
  )
);

CREATE TABLE "ZapingFileReceiptLink" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZapingFileReceiptLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZapingFileEvent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "type" "ZapingFileEventType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZapingFileEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ZapingFile_id_companyId_key" ON "ZapingFile"("id", "companyId");
CREATE UNIQUE INDEX "ZapingFile_companyId_objectKey_key" ON "ZapingFile"("companyId", "objectKey");
CREATE INDEX "ZapingFile_companyId_deletedAt_createdAt_idx" ON "ZapingFile"("companyId", "deletedAt", "createdAt");
CREATE UNIQUE INDEX "ZapingFileReceiptLink_companyId_fileId_key" ON "ZapingFileReceiptLink"("companyId", "fileId");
CREATE INDEX "ZapingFileReceiptLink_companyId_receiptId_createdAt_idx" ON "ZapingFileReceiptLink"("companyId", "receiptId", "createdAt");
CREATE INDEX "ZapingFileEvent_companyId_fileId_createdAt_idx" ON "ZapingFileEvent"("companyId", "fileId", "createdAt");

ALTER TABLE "ZapingFile" ADD CONSTRAINT "ZapingFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ZapingFile" ADD CONSTRAINT "ZapingFile_uploadedById_companyId_fkey" FOREIGN KEY ("uploadedById", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ZapingFile" ADD CONSTRAINT "ZapingFile_deletedById_companyId_fkey" FOREIGN KEY ("deletedById", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ZapingFileReceiptLink" ADD CONSTRAINT "ZapingFileReceiptLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ZapingFileReceiptLink" ADD CONSTRAINT "ZapingFileReceiptLink_receiptId_companyId_fkey" FOREIGN KEY ("receiptId", "companyId") REFERENCES "PurchaseReceipt"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ZapingFileReceiptLink" ADD CONSTRAINT "ZapingFileReceiptLink_fileId_companyId_fkey" FOREIGN KEY ("fileId", "companyId") REFERENCES "ZapingFile"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ZapingFileEvent" ADD CONSTRAINT "ZapingFileEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ZapingFileEvent" ADD CONSTRAINT "ZapingFileEvent_fileId_companyId_fkey" FOREIGN KEY ("fileId", "companyId") REFERENCES "ZapingFile"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ZapingFileEvent" ADD CONSTRAINT "ZapingFileEvent_actorId_companyId_fkey" FOREIGN KEY ("actorId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Accepted objects are immutable except for one-way soft deletion.
CREATE FUNCTION "zaping_file_protect_metadata"() RETURNS trigger AS $$
BEGIN
  IF NEW."companyId" IS DISTINCT FROM OLD."companyId"
     OR NEW."objectKey" IS DISTINCT FROM OLD."objectKey"
     OR NEW."originalName" IS DISTINCT FROM OLD."originalName"
     OR NEW."contentType" IS DISTINCT FROM OLD."contentType"
     OR NEW."sizeBytes" IS DISTINCT FROM OLD."sizeBytes"
     OR NEW."sha256" IS DISTINCT FROM OLD."sha256"
     OR NEW."uploadedById" IS DISTINCT FROM OLD."uploadedById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."scanStatus" IS DISTINCT FROM OLD."scanStatus"
     OR (OLD."deletedAt" IS NOT NULL AND (
       NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt"
       OR NEW."deletedById" IS DISTINCT FROM OLD."deletedById"
     ))
  THEN
    RAISE EXCEPTION 'ZapingFile metadata is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ZapingFile_protect_metadata"
BEFORE UPDATE ON "ZapingFile"
FOR EACH ROW EXECUTE FUNCTION "zaping_file_protect_metadata"();
