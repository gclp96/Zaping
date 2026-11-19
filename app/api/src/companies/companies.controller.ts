import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guards';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CompaniesService } from './companies.service';
import { UpdateCompanyCommercialDto } from './dto/update-company-commercial.dto';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('me')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findOwn(@Req() req: AuthenticatedRequest) {
    return this.companiesService.findOwn(req.user.companyId);
  }

  @Patch('me')
  @Roles(UserRole.ADMIN)
  updateOwnCommercial(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateCompanyCommercialDto,
  ) {
    return this.companiesService.updateOwnCommercial(req.user.companyId, dto);
  }
}
