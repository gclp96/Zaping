import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Delete,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guards';
import {
  CreateSupplierDocumentDto,
  CreateSupplierDocumentExceptionDto,
  ListSupplierDocumentsQueryDto,
} from './dto/create-supplier-document.dto';
import { SupplierDocumentsService } from './supplier-documents.service';
import { SupplierDocumentReconciliationService } from './supplier-document-reconciliation.service';
import { SupplierReceiptVarianceService } from './supplier-receipt-variance.service';
import { ReceiptDocumentLinksService } from './receipt-document-links.service';
import { SupplierDocumentAttachmentsService } from './supplier-document-attachments.service';
import { safeAttachmentDisposition } from './supplier-document-attachment-download';
import {
  CreateReceiptDocumentLinkDto,
  RemoveReceiptDocumentLinkDto,
} from './dto/receipt-document-link.dto';
import {
  ConfirmSupplierDocumentBasisDto,
  CreateSupplierDocumentAllocationDto,
  ReviseSupplierDocumentAllocationDto,
  CorrectSupplierDocumentBasisDto,
  CancelSupplierDocumentDto,
  ApproveReceiptVarianceDto,
} from './dto/supplier-document-reconciliation.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@Controller('supplier-documents')
export class SupplierDocumentsController {
  constructor(
    private readonly documents: SupplierDocumentsService,
    private readonly reconciliation: SupplierDocumentReconciliationService,
    private readonly variance: SupplierReceiptVarianceService,
    private readonly receiptLinks: ReceiptDocumentLinksService,
    private readonly attachments: SupplierDocumentAttachmentsService,
  ) {}

  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListSupplierDocumentsQueryDto,
  ) {
    return this.documents.list(req.user.companyId, query);
  }

  @Get('receipts/:receiptId/links')
  listReceiptLinks(
    @Req() req: AuthenticatedRequest,
    @Param('receiptId') receiptId: string,
  ) {
    return this.receiptLinks.list(req.user.companyId, receiptId);
  }

  @Post('receipts/:receiptId/links')
  createReceiptLink(
    @Req() req: AuthenticatedRequest,
    @Param('receiptId') receiptId: string,
    @Body() dto: CreateReceiptDocumentLinkDto,
  ) {
    return this.receiptLinks.link(
      req.user.companyId,
      req.user.id,
      receiptId,
      dto.documentId,
    );
  }

  @Delete('receipts/:receiptId/links/:documentId')
  removeReceiptLink(
    @Req() req: AuthenticatedRequest,
    @Param('receiptId') receiptId: string,
    @Param('documentId') documentId: string,
    @Body() dto: RemoveReceiptDocumentLinkDto,
  ) {
    return this.receiptLinks.unlink(
      req.user.companyId,
      req.user.id,
      receiptId,
      documentId,
      dto.reason,
    );
  }

  @Get(':id/attachments')
  listAvailableAttachments(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    this.requireAttachmentsReadEnabled();
    return this.attachments.listAvailable(req.user.companyId, id);
  }

  @Get(':id/attachments/:attachmentId/download')
  async downloadAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.requireAttachmentsReadEnabled();
    const file = await this.attachments.verifiedDownload(
      req.user.companyId,
      id,
      attachmentId,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', 'sandbox');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    return new StreamableFile(file.bytes, {
      type: file.contentType,
      disposition: safeAttachmentDisposition(
        file.originalName,
        file.contentType,
      ),
      length: file.bytes.length,
    });
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.documents.detail(req.user.companyId, id);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateSupplierDocumentDto,
  ) {
    return this.documents.create(
      req.user.companyId,
      req.user.id,
      this.requireKey(key),
      dto,
    );
  }

  @Post(':id/confirm-basis')
  confirmBasis(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ConfirmSupplierDocumentBasisDto,
  ) {
    return this.reconciliation.confirmBasis(
      req.user.companyId,
      req.user.id,
      this.requireKey(key),
      id,
      dto,
    );
  }

  @Get(':id/allocations')
  listAllocations(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.reconciliation.allocations(req.user.companyId, id);
  }

  @Post(':id/allocations')
  allocate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateSupplierDocumentAllocationDto,
  ) {
    return this.reconciliation.createAllocation(
      req.user.companyId,
      req.user.id,
      this.requireKey(key),
      id,
      dto,
    );
  }

  @Post(':id/allocations/revise')
  reviseAllocation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ReviseSupplierDocumentAllocationDto,
  ) {
    return this.reconciliation.reviseAllocation(
      req.user.companyId,
      req.user.id,
      this.requireKey(key),
      id,
      dto,
    );
  }

  @Post(':id/correct-basis')
  correctBasis(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CorrectSupplierDocumentBasisDto,
  ) {
    return this.reconciliation.correctBasis(
      req.user.companyId,
      req.user.id,
      this.requireKey(key),
      id,
      dto,
    );
  }

  @Post(':id/cancel')
  cancelDocument(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CancelSupplierDocumentDto,
  ) {
    return this.reconciliation.cancelDocument(
      req.user.companyId,
      req.user.id,
      this.requireKey(key),
      id,
      dto,
    );
  }

  @Get('receipts/:receiptId/reconciliation')
  receiptReconciliation(
    @Req() req: AuthenticatedRequest,
    @Param('receiptId') receiptId: string,
  ) {
    return this.variance.overview(req.user.companyId, receiptId);
  }

  @Post('receipts/:receiptId/approve-variance')
  approveVariance(
    @Req() req: AuthenticatedRequest,
    @Param('receiptId') receiptId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ApproveReceiptVarianceDto,
  ) {
    return this.variance.approve(
      req.user.companyId,
      req.user.id,
      this.requireKey(key),
      receiptId,
      dto,
    );
  }

  @Post('exceptions')
  createException(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateSupplierDocumentExceptionDto,
  ) {
    return this.documents.createException(
      req.user.companyId,
      req.user.id,
      this.requireKey(key),
      dto,
    );
  }

  private requireAttachmentsReadEnabled(): void {
    if (process.env.ZFILES_ATTACHMENTS_READ_QA_ENABLED !== '1') {
      throw new ServiceUnavailableException('Adjuntos no habilitados');
    }
  }

  private requireKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length > 128) {
      throw new BadRequestException('Se requiere Idempotency-Key válida');
    }
    return key;
  }
}
