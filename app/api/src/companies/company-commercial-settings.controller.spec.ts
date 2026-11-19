import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CompaniesService } from './companies.service';
import { CompanyCommercialSettingsController } from './company-commercial-settings.controller';

describe('CompanyCommercialSettingsController', () => {
  const companyId = 'company-a';
  const findOwn = jest.fn();
  const updateOwnCommercial = jest.fn();
  const controller = new CompanyCommercialSettingsController({
    findOwn,
    updateOwnCommercial,
  } as unknown as CompaniesService);

  beforeEach(() => jest.clearAllMocks());

  it('requires auth + roles and restricts updates to ADMIN', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CompanyCommercialSettingsController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
    const get = Object.getOwnPropertyDescriptor(
      CompanyCommercialSettingsController.prototype,
      'findOwn',
    )?.value as object;
    const patch = Object.getOwnPropertyDescriptor(
      CompanyCommercialSettingsController.prototype,
      'updateOwnCommercial',
    )?.value as object;
    expect(Reflect.getMetadata('roles', get)).toEqual([
      UserRole.ADMIN,
      UserRole.MANAGER,
    ]);
    expect(Reflect.getMetadata('roles', patch)).toEqual([UserRole.ADMIN]);
  });

  it('uses the authenticated tenant and never accepts a company ID in body', () => {
    const req = { user: { companyId } } as AuthenticatedRequest;
    const dto = { fiscalAddress: 'Calle fiscal 1' };
    void controller.updateOwnCommercial(req, dto);
    expect(updateOwnCommercial).toHaveBeenCalledWith(companyId, dto);
  });
});
