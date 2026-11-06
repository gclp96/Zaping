import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { ReserveSupplierAttachmentDto } from './dto/reserve-supplier-attachment.dto';
import { SupplierAttachmentUploadReservationsService } from './supplier-attachment-upload-reservations.service';

/**
 * First staged HTTP boundary. Never accepts bytes, object keys, URLs or
 * scanner verdicts. The database must additionally verify tenant and role.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@Controller('supplier-documents')
export class SupplierAttachmentUploadReservationsController {
  constructor(
    private readonly reservations: SupplierAttachmentUploadReservationsService,
  ) {}

  @Post(':id/attachments/reservations')
  reserve(
    @Req() req: AuthenticatedRequest,
    @Param('id') documentId: string,
    @Headers('idempotency-key') requestKey: string | undefined,
    @Body() body: ReserveSupplierAttachmentDto,
  ) {
    if (
      process.env.ZFILES_QA_RESERVATIONS_ENABLED !== '1' ||
      process.env.ZFILES_DEPLOYMENT_SCOPE !== 'qa'
    ) {
      throw new ServiceUnavailableException(
        'Reservas de adjuntos no habilitadas',
      );
    }
    return this.reservations.reserve({
      companyId: req.user.companyId,
      documentId,
      actorId: req.user.id,
      requestKey: requestKey ?? '',
      metadata: {
        originalName: body.originalName,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        sha256: body.sha256,
      },
    });
  }
}
