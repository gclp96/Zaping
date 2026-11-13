import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { FILE_MAX_BYTES, IncomingFile } from './file-validation';
import { ZapingFilesService } from './zaping-files.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE)
@Controller('purchase-receipts/:receiptId/files')
export class ZapingFilesController {
  constructor(private readonly files: ZapingFilesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthenticatedRequest, @Param('receiptId') receiptId: string) {
    return this.files.list(req.user.companyId, receiptId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_MAX_BYTES, files: 1 } }))
  upload(
    @Req() req: AuthenticatedRequest,
    @Param('receiptId') receiptId: string,
    @UploadedFile() file: IncomingFile | undefined,
  ) {
    return this.files.upload(req.user.companyId, req.user.id, receiptId, file);
  }

  @Get(':fileId/download')
  async download(
    @Req() req: AuthenticatedRequest,
    @Param('receiptId') receiptId: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const result = await this.files.download(
      req.user.companyId,
      req.user.id,
      receiptId,
      fileId,
    );
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="document"; filename*=UTF-8' + "''" + encodeURIComponent(result.name));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(result.bytes);
  }

  @Delete(':fileId')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('receiptId') receiptId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.files.remove(req.user.companyId, req.user.id, receiptId, fileId);
  }
}
