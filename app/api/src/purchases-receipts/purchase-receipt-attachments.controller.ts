import {
  Controller,
  Get,
  Header,
  Param,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guards';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { PurchaseReceiptAttachmentsService } from './purchase-receipt-attachments.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@Controller('purchase-receipts')
export class PurchaseReceiptAttachmentsController {
  constructor(
    private readonly attachments: PurchaseReceiptAttachmentsService,
  ) {}

  @Get(':id/attachments')
  @Header('Cache-Control', 'private, no-store')
  list(@Req() req: AuthenticatedRequest, @Param('id') receiptId: string) {
    if (
      process.env.ZFILES_DEPLOYMENT_SCOPE !== 'qa' ||
      process.env.ZFILES_RECEIPT_ATTACHMENT_METADATA_QA_ENABLED !== '1'
    ) {
      throw new ServiceUnavailableException(
        'Adjuntos de recepción no habilitados',
      );
    }
    return this.attachments.list(req.user.companyId, req.user.id, receiptId);
  }
}
