import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { Response } from 'express';

import { PurchasesService } from './purchases.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guards';

import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE)
  create(@Request() req: any, @Body() dto: CreatePurchaseDto) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    return this.purchasesService.create(req.user.companyId, dto, req.user.role);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE)
  findAll(@Request() req: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    return this.purchasesService.findAll(req.user.companyId);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  approve(@Request() req: any, @Param('id') id: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    return this.purchasesService.approve(req.user.companyId, id);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  cancel(@Request() req: any, @Param('id') id: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    return this.purchasesService.cancel(req.user.companyId, id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE)
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    return this.purchasesService.update(req.user.companyId, id, dto, req.user.role);
  }

  @Get(':id/inventory-movements')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE)
  findInventoryMovements(@Request() req: any, @Param('id') id: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    return this.purchasesService.findInventoryMovements(req.user.companyId, id);
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE)
  generatePDF(
    @Request() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    return this.purchasesService.generatePDF(req.user.companyId, id, res);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE)
  findOne(@Request() req: any, @Param('id') id: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    return this.purchasesService.findOne(req.user.companyId, id);
  }
}
