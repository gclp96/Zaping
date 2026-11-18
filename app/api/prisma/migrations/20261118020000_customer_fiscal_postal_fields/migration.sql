-- UX-005D extension: fiscal identity and structured Mexican mailing address.
-- Additive only: do not infer the legal name or overwrite historical free-text address.
ALTER TABLE "Customer"
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "neighborhood" TEXT,
  ADD COLUMN "municipality" TEXT;

CREATE INDEX "Customer_companyId_postalCode_idx"
  ON "Customer"("companyId", "postalCode");
