CREATE UNIQUE INDEX "Purchase_id_companyId_key" ON "Purchase"("id", "companyId");

CREATE TABLE "PurchaseCostAudit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productDisplayName" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorDisplayName" TEXT NOT NULL,
    "actorRole" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT clock_timestamp(),
    "reason" VARCHAR(500) NOT NULL,
    "previousGrossUnitCost" DECIMAL(20,4) NOT NULL,
    "newGrossUnitCost" DECIMAL(20,4) NOT NULL,
    "previousDiscountPercent" DECIMAL(5,2) NOT NULL,
    "newDiscountPercent" DECIMAL(5,2) NOT NULL,
    "previousNetUnitCost" DECIMAL(20,4) NOT NULL,
    "newNetUnitCost" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "PurchaseCostAudit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchaseCostAudit_purchaseId_companyId_fkey"
        FOREIGN KEY ("purchaseId", "companyId") REFERENCES "Purchase"("id", "companyId")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "PurchaseCostAudit_companyId_purchaseId_createdAt_id_idx"
    ON "PurchaseCostAudit"("companyId", "purchaseId", "createdAt", "id");
