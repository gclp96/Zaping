import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupplierDocumentsController } from './supplier-documents.controller';
import { SupplierDocumentsService } from './supplier-documents.service';
import { SupplierDocumentReconciliationService } from './supplier-document-reconciliation.service';
import { SupplierReceiptVarianceService } from './supplier-receipt-variance.service';
import { ReceiptDocumentLinksService } from './receipt-document-links.service';
import { SupplierAttachmentUploadReservationsController } from './supplier-attachment-upload-reservations.controller';
import { SupplierAttachmentUploadReservationsService } from './supplier-attachment-upload-reservations.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    SupplierDocumentsController,
    SupplierAttachmentUploadReservationsController,
  ],
  providers: [
    SupplierDocumentsService,
    SupplierDocumentReconciliationService,
    SupplierReceiptVarianceService,
    ReceiptDocumentLinksService,
    SupplierAttachmentUploadReservationsService,
  ],
})
export class SupplierDocumentsModule {}
