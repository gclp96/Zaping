-- UX-007C: delegated per-user purchasing cost authorization. Existing users retain no delegation.
ALTER TABLE "User" ADD COLUMN "canAdjustPurchaseUnitCost" BOOLEAN NOT NULL DEFAULT false;
