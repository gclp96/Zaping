-- Product units are optional; never invent a unit for existing catalog items.
ALTER TABLE "Product" ADD COLUMN "unitOfMeasure" TEXT;

-- PurchaseItem.price remains the effective unit cost used by receiving/inventory.
-- listUnitCost is the undiscounted negotiated cost; discountPercent is explicit.
ALTER TABLE "PurchaseItem" ADD COLUMN "listUnitCost" DOUBLE PRECISION;
ALTER TABLE "PurchaseItem" ADD COLUMN "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
