import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupplierDocumentsController } from './supplier-documents.controller';
import { SupplierDocumentsService } from './supplier-documents.service';
import { SupplierDocumentReconciliationService } from './supplier-document-reconciliation.service';
import { SupplierReceiptVarianceService } from './supplier-receipt-variance.service';
import { ReceiptDocumentLinksService } from './receipt-document-links.service';
import { SupplierDocumentAttachmentsService } from './supplier-document-attachments.service';
import {
  PrivateAttachmentObjectStore,
  UnconfiguredPrivateAttachmentStore,
} from './private-attachment-object-store';

@Module({
  imports: [PrismaModule],
  controllers: [SupplierDocumentsController],
  providers: [
    SupplierDocumentsService,
    SupplierDocumentReconciliationService,
    SupplierReceiptVarianceService,
    ReceiptDocumentLinksService,
    SupplierDocumentAttachmentsService,
    {
      provide: PrivateAttachmentObjectStore,
      useClass: UnconfiguredPrivateAttachmentStore,
    },
  ],
})
export class SupplierDocumentsModule {}
