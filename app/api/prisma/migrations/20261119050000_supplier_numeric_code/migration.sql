-- New supplier codes are allocated under a per-company row lock.
-- Existing codes remain unchanged; duplicates must be reconciled if found.
CREATE UNIQUE INDEX "Supplier_companyId_supplierCode_key"
  ON "Supplier"("companyId", "supplierCode");
