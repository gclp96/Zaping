-- Record who originally prepared each order; never infer a historical creator.
ALTER TABLE "Purchase" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "createdByDisplayName" TEXT;

CREATE INDEX "Purchase_createdByUserId_idx" ON "Purchase"("createdByUserId");

ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
