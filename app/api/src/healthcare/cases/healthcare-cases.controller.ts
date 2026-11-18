import {
  Body,
  Controller,
  Get,
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

import { CancelHealthcareCaseDto } from './dto/cancel-healthcare-case.dto';
import { CreateHealthcareCaseDto } from './dto/create-healthcare-case.dto';
import { UpdateHealthcareCaseDto } from './dto/update-healthcare-case.dto';
import {
  CreateHealthcareCaseInput,
  HealthcareCaseService,
  UpdateHealthcareCaseInput,
} from './healthcare-case.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('healthcare/cases')
export class HealthcareCasesController {
  constructor(private readonly healthcareCaseService: HealthcareCaseService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateHealthcareCaseDto,
  ) {
    return this.healthcareCaseService.create(
      request.user.companyId,
      request.user.id,
      this.toCreateInput(dto),
    );
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES, UserRole.WAREHOUSE)
  findAll(@Req() request: AuthenticatedRequest) {
    return this.healthcareCaseService.findAll(request.user.companyId);
  }

  @Patch(':caseId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: UpdateHealthcareCaseDto,
  ) {
    return this.healthcareCaseService.update(
      request.user.companyId,
      caseId,
      this.toUpdateInput(dto),
    );
  }

  @Post(':caseId/cancel')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CancelHealthcareCaseDto,
  ) {
    return this.healthcareCaseService.cancel(
      request.user.companyId,
      caseId,
      request.user.id,
      dto.cancellationReason,
    );
  }

  @Get('agenda')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES, UserRole.WAREHOUSE)
  findUpcoming(@Req() request: AuthenticatedRequest) {
    return this.healthcareCaseService.findUpcoming(request.user.companyId);
  }

  @Get(':caseId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES, UserRole.WAREHOUSE)
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ) {
    return this.healthcareCaseService.findOne(request.user.companyId, caseId);
  }

  private toCreateInput(
    dto: CreateHealthcareCaseDto,
  ): CreateHealthcareCaseInput {
    return {
      title: dto.title,
      procedureDescription: dto.procedureDescription,
      scheduledStart: this.toOptionalDate(dto.scheduledStart),
      scheduledEnd: this.toOptionalDate(dto.scheduledEnd),
      responsibleUserId: dto.responsibleUserId,
      doctorId: dto.doctorId,
      hospitalId: dto.hospitalId,
    };
  }

  private toUpdateInput(
    dto: UpdateHealthcareCaseDto,
  ): UpdateHealthcareCaseInput {
    const input: UpdateHealthcareCaseInput = {};

    if (this.hasOwn(dto, 'title')) {
      input.title = dto.title;
    }

    if (this.hasOwn(dto, 'procedureDescription')) {
      input.procedureDescription = dto.procedureDescription;
    }

    if (this.hasOwn(dto, 'scheduledStart')) {
      input.scheduledStart = this.toOptionalDate(dto.scheduledStart);
    }

    if (this.hasOwn(dto, 'scheduledEnd')) {
      input.scheduledEnd = this.toOptionalDate(dto.scheduledEnd);
    }

    if (this.hasOwn(dto, 'responsibleUserId')) {
      input.responsibleUserId = dto.responsibleUserId;
    }

    if (this.hasDefinedOwn(dto, 'doctorId')) {
      input.doctorId = dto.doctorId;
    }

    if (this.hasDefinedOwn(dto, 'hospitalId')) {
      input.hospitalId = dto.hospitalId;
    }

    return input;
  }

  private toOptionalDate(value?: string | null) {
    if (value === undefined || value === null) {
      return value;
    }

    return new Date(value);
  }

  private hasOwn<T extends object>(
    object: T,
    key: PropertyKey,
  ): key is keyof T {
    return Boolean(Object.prototype.hasOwnProperty.call(object, key));
  }

  private hasDefinedOwn<T extends object, K extends keyof T>(
    object: T,
    key: K,
  ): object is T & Record<K, Exclude<T[K], undefined>> {
    return this.hasOwn(object, key) && object[key] !== undefined;
  }
}
