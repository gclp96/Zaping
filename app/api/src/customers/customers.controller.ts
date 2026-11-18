import {
  Body,
  BadRequestException,
  ServiceUnavailableException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';

import { CustomersService } from './customers.service';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { RolesGuard } from '../auth/guards/roles.guards';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(@Request() req: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    return this.customersService.findAll(req.user.companyId);
  }

  /**
   * Authenticated postal assistance. The provider token never reaches the browser.
   * Manual entry remains available when POSTALKIT_API_KEY is not configured.
   */
  @Get('postal-lookup/:code')
  async lookupPostalCode(@Param('code') code: string) {
    if (!/^\d{5}$/.test(code)) {
      throw new BadRequestException('Código postal inválido');
    }
    const key = process.env.POSTALKIT_API_KEY;
    if (!key) {
      throw new ServiceUnavailableException('Consulta postal no configurada');
    }
    try {
      const response = await fetch(
        'https://api.postalkit.mx/v1/postal-codes/' + code,
        {
          headers: { Authorization: 'Bearer ' + key },
          signal: AbortSignal.timeout(4500),
        },
      );
      if (response.status === 404) return { code, settlements: [] };
      if (!response.ok) {
        throw new ServiceUnavailableException(
          'Consulta postal temporalmente no disponible',
        );
      }
      const body: unknown = await response.json();
      return this.customersService.normalizePostalLookup(code, body);
    } catch {
      throw new ServiceUnavailableException(
        'Consulta postal temporalmente no disponible',
      );
    }
  }

  @Get(':id/overview')
  getOverview(@Request() req: any, @Param('id') id: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    return this.customersService.getOverview(req.user.companyId, id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    return this.customersService.findOne(req.user.companyId, id);
  }

  @Post()
  create(@Request() req: any, @Body() dto: CreateCustomerDto) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    return this.customersService.create(req.user.companyId, dto);
  }

  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    return this.customersService.update(req.user.companyId, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    return this.customersService.remove(req.user.companyId, id);
  }
}
