-- UX-005D: structured customer location (non-destructive).
-- Existing Customer.type and address values are not rewritten or inferred.
ALTER TABLE "Customer"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "countryCode" TEXT;

CREATE INDEX "Customer_companyId_state_city_idx"
  ON "Customer"("companyId", "state", "city");
