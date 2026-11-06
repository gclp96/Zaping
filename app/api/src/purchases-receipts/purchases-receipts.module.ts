import { InventoryPhysicalAuthorityModule } from '../inventory/physical/inventory-physical-authority.module';
import { ReceiptPhysicalIntegrationService } from '../inventory/physical/receipt-physical-integration.service';
import { Module } from '@nestjs/common';

import { EquipmentModule } from '../equipment/equipment.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PurchaseReceiptsController } from './purchases-receipts.controller';
import { PurchaseReceiptsService } from './purchases-receipts.service';
import { PurchaseReceiptAttachmentsController } from './purchase-receipt-attachments.controller';
import { PurchaseReceiptAttachmentsService } from './purchase-receipt-attachments.service';

@Module({
  imports: [InventoryPhysicalAuthorityModule, PrismaModule, EquipmentModule],
  controllers: [
    PurchaseReceiptsController,
    PurchaseReceiptAttachmentsController,
  ],
  providers: [
    ReceiptPhysicalIntegrationService,
    PurchaseReceiptsService,
    PurchaseReceiptAttachmentsService,
  ],
  exports: [PurchaseReceiptsService],
})
export class PurchaseReceiptsModule {}
