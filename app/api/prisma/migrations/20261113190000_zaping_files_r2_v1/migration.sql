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
  CONSTRAINT "ZapingFile_positive_size" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760)
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
