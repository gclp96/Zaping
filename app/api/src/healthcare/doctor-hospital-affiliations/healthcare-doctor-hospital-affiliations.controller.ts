import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guards';
import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import { CreateHealthcareDoctorHospitalAffiliationDto } from './dto/create-healthcare-doctor-hospital-affiliation.dto';
import { UpdateHealthcareDoctorHospitalAffiliationDto } from './dto/update-healthcare-doctor-hospital-affiliation.dto';
import { HealthcareDoctorHospitalAffiliationsService } from './healthcare-doctor-hospital-affiliations.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('healthcare/doctor-hospital-affiliations')
export class HealthcareDoctorHospitalAffiliationsController {
  constructor(
    private readonly healthcareDoctorHospitalAffiliationsService: HealthcareDoctorHospitalAffiliationsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateHealthcareDoctorHospitalAffiliationDto,
  ) {
    return this.healthcareDoctorHospitalAffiliationsService.create(
      request.user.companyId,
      dto,
    );
  }

  @Patch(':affiliationId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('affiliationId', ParseUUIDPipe) affiliationId: string,
    @Body() dto: UpdateHealthcareDoctorHospitalAffiliationDto,
  ) {
    return this.healthcareDoctorHospitalAffiliationsService.update(
      request.user.companyId,
      affiliationId,
      dto,
    );
  }

  @Post(':affiliationId/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  deactivate(
    @Req() request: AuthenticatedRequest,
    @Param('affiliationId', ParseUUIDPipe) affiliationId: string,
  ) {
    return this.healthcareDoctorHospitalAffiliationsService.deactivate(
      request.user.companyId,
      affiliationId,
    );
  }

  @Post(':affiliationId/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  reactivate(
    @Req() request: AuthenticatedRequest,
    @Param('affiliationId', ParseUUIDPipe) affiliationId: string,
  ) {
    return this.healthcareDoctorHospitalAffiliationsService.reactivate(
      request.user.companyId,
      affiliationId,
    );
  }

  @Post(':affiliationId/prefer')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  prefer(
    @Req() request: AuthenticatedRequest,
    @Param('affiliationId', ParseUUIDPipe) affiliationId: string,
  ) {
    return this.healthcareDoctorHospitalAffiliationsService.prefer(
      request.user.companyId,
      affiliationId,
    );
  }
}
