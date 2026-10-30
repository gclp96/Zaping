-- UX-PDOC-01A: additive, nonmonetary document links.
-- Never infer associations from legacy free-text type/folio values.
CREATE UNIQUE INDEX "PurchaseReceipt_id_companyId_key"
  ON "PurchaseReceipt" ("id", "companyId");

CREATE TABLE "PurchaseReceiptSupplierDocumentLink" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedById" TEXT,
  "removedAt" TIMESTAMP(3),
  "reason" VARCHAR(1000),
  CONSTRAINT "PurchaseReceiptSupplierDocumentLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PRSDL_removed_state_check" CHECK (
    ("removedAt" IS NULL AND "removedById" IS NULL AND "reason" IS NULL)
    OR
    ("removedAt" IS NOT NULL AND "removedById" IS NOT NULL
      AND "reason" IS NOT NULL AND length(btrim("reason")) >= 10)
  )
);

-- This partial uniqueness preserves each historical removed link on relink.
CREATE UNIQUE INDEX "PRSDL_active_pair_key"
  ON "PurchaseReceiptSupplierDocumentLink" ("companyId", "receiptId", "documentId")
  WHERE "removedAt" IS NULL;
CREATE INDEX "PRSDL_company_receipt_document_idx"
  ON "PurchaseReceiptSupplierDocumentLink" ("companyId", "receiptId", "documentId");
CREATE INDEX "PRSDL_company_document_idx"
  ON "PurchaseReceiptSupplierDocumentLink" ("companyId", "documentId");

ALTER TABLE "PurchaseReceiptSupplierDocumentLink" ADD CONSTRAINT "PRSDL_company_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PurchaseReceiptSupplierDocumentLink" ADD CONSTRAINT "PRSDL_purchase_fkey"
  FOREIGN KEY ("purchaseId", "companyId", "supplierId") REFERENCES "Purchase"("id", "companyId", "supplierId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PurchaseReceiptSupplierDocumentLink" ADD CONSTRAINT "PRSDL_receipt_fkey"
  FOREIGN KEY ("receiptId", "companyId", "purchaseId") REFERENCES "PurchaseReceipt"("id", "companyId", "purchaseId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PurchaseReceiptSupplierDocumentLink" ADD CONSTRAINT "PRSDL_document_fkey"
  FOREIGN KEY ("documentId", "companyId", "supplierId") REFERENCES "SupplierDocument"("id", "companyId", "supplierId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PurchaseReceiptSupplierDocumentLink" ADD CONSTRAINT "PRSDL_created_by_fkey"
  FOREIGN KEY ("createdById", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PurchaseReceiptSupplierDocumentLink" ADD CONSTRAINT "PRSDL_removed_by_fkey"
  FOREIGN KEY ("removedById", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- The records must remain auditable even if a privileged client bypasses NestJS.
CREATE FUNCTION "reject_receipt_document_link_history_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."removedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Historical receipt document links are immutable';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
    OR NEW."purchaseId" IS DISTINCT FROM OLD."purchaseId"
    OR NEW."supplierId" IS DISTINCT FROM OLD."supplierId"
    OR NEW."receiptId" IS DISTINCT FROM OLD."receiptId"
    OR NEW."documentId" IS DISTINCT FROM OLD."documentId"
    OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR NEW."removedAt" IS NULL THEN
    RAISE EXCEPTION 'Only closing an active receipt document link is allowed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PRSDL_append_only_history"
BEFORE UPDATE ON "PurchaseReceiptSupplierDocumentLink"
FOR EACH ROW EXECUTE FUNCTION "reject_receipt_document_link_history_mutation"();

CREATE FUNCTION "reject_receipt_document_link_delete"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Receipt document links cannot be deleted'; END;
$$;
CREATE TRIGGER "PRSDL_no_delete"
BEFORE DELETE ON "PurchaseReceiptSupplierDocumentLink"
FOR EACH ROW EXECUTE FUNCTION "reject_receipt_document_link_delete"();
