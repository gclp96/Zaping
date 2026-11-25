-- AlterTable
ALTER TABLE "HealthcareDoctor" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "HealthcareHospital" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "HealthcareCase" ADD COLUMN     "customerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_id_companyId_key" ON "Customer"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthcareDoctor_customerId_companyId_key" ON "HealthcareDoctor"("customerId", "companyId");

-- CreateIndex
CREATE INDEX "HealthcareHospital_companyId_customerId_idx" ON "HealthcareHospital"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "HealthcareCase_companyId_customerId_idx" ON "HealthcareCase"("companyId", "customerId");

-- AddForeignKey
ALTER TABLE "HealthcareDoctor" ADD CONSTRAINT "HealthcareDoctor_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "Customer"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HealthcareHospital" ADD CONSTRAINT "HealthcareHospital_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "Customer"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "HealthcareCase" ADD CONSTRAINT "HealthcareCase_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "Customer"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;
