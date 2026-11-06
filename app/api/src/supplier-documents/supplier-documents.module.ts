import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupplierDocumentsController } from './supplier-documents.controller';
import { SupplierDocumentsService } from './supplier-documents.service';
import { SupplierDocumentReconciliationService } from './supplier-document-reconciliation.service';
import { SupplierReceiptVarianceService } from './supplier-receipt-variance.service';
import { ReceiptDocumentLinksService } from './receipt-document-links.service';
import { SupplierAttachmentUploadReservationsController } from './supplier-attachment-upload-reservations.controller';
import { SupplierAttachmentUploadReservationsService } from './supplier-attachment-upload-reservations.service';
import { SupplierAttachmentQaBinaryUploadService } from './supplier-attachment-qa-binary-upload.service';
import {
  QuarantineUploadWriterPort,
  createQaQuarantineWriter,
} from './zfiles-qa-quarantine-writer';

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
    SupplierAttachmentQaBinaryUploadService,
    {
      provide: QuarantineUploadWriterPort,
      useFactory: createQaQuarantineWriter,
    },
  ],
})
export class SupplierDocumentsModule {}
