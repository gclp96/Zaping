import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Readable } from 'node:stream';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { ReserveSupplierAttachmentDto } from './dto/reserve-supplier-attachment.dto';
import { SupplierAttachmentUploadReservationsService } from './supplier-attachment-upload-reservations.service';
import { SupplierAttachmentQaBinaryUploadService } from './supplier-attachment-qa-binary-upload.service';

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
    private readonly uploads: SupplierAttachmentQaBinaryUploadService,
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
  @Get(':id/attachments/reservations/:reservationId')
  status(
    @Req() req: AuthenticatedRequest,
    @Param('id') documentId: string,
    @Param('reservationId') reservationId: string,
  ) {
    if (
      process.env.ZFILES_QA_RESERVATIONS_ENABLED !== '1' ||
      process.env.ZFILES_DEPLOYMENT_SCOPE !== 'qa'
    ) {
      throw new ServiceUnavailableException(
        'Consulta de reservas no habilitada',
      );
    }
    return this.reservations.status(
      req.user.companyId,
      documentId,
      req.user.id,
      reservationId,
    );
  }

  @Post(':id/attachments/reservations/:reservationId/cancel')
  @HttpCode(200)
  cancelBeforeWrite(
    @Req() req: AuthenticatedRequest,
    @Param('id') documentId: string,
    @Param('reservationId') reservationId: string,
  ) {
    if (
      process.env.ZFILES_QA_RESERVATIONS_ENABLED !== '1' ||
      process.env.ZFILES_DEPLOYMENT_SCOPE !== 'qa'
    ) {
      throw new ServiceUnavailableException(
        'Cancelación de reservas no habilitada',
      );
    }
    return this.reservations.cancelBeforeWrite({
      companyId: req.user.companyId,
      documentId,
      actorId: req.user.id,
      reservationId,
    });
  }

  @Put(':id/attachments/reservations/:reservationId/content')
  @HttpCode(202)
  receiveBytes(
    @Req() req: AuthenticatedRequest,
    @Param('id') documentId: string,
    @Param('reservationId') reservationId: string,
    @Headers('content-length') declaredLength: string | undefined,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-encoding') contentEncoding: string | undefined,
    @Headers('transfer-encoding') transferEncoding: string | undefined,
  ) {
    if (
      process.env.ZFILES_QA_RESERVATIONS_ENABLED !== '1' ||
      process.env.ZFILES_QA_BINARY_UPLOAD_ENABLED !== '1' ||
      process.env.ZFILES_DEPLOYMENT_SCOPE !== 'qa'
    ) {
      throw new ServiceUnavailableException('Carga de archivos no habilitada');
    }
    return this.uploads.receive({
      companyId: req.user.companyId,
      actorId: req.user.id,
      documentId,
      reservationId,
      declaredLength,
      contentType,
      contentEncoding,
      transferEncoding,
      source: req as unknown as Readable,
    });
  }
}
