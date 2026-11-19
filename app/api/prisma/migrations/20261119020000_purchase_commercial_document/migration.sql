-- UX-007D: optional fiscal fields and historically reproducible purchase commercial data.
-- Existing purchases remain valid. Confirmed legacy purchases may have no snapshot.
ALTER TABLE "Company"
  ADD COLUMN "fiscalAddress" TEXT,
  ADD COLUMN "placeOfIssue" TEXT;

ALTER TABLE "Supplier"
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "rfc" TEXT,
  ADD COLUMN "fiscalAddress" TEXT,
  ADD COLUMN "supplierCode" TEXT;

ALTER TABLE "Purchase"
  ADD COLUMN "paymentTerms" TEXT,
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "paymentDueDate" DATE,
  ADD COLUMN "expectedDeliveryDate" DATE,
  ADD COLUMN "buyerName" TEXT,
  ADD COLUMN "commercialSnapshot" JSONB;
