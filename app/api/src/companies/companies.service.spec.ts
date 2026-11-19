import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from './companies.service';

describe('CompaniesService fiscal document settings', () => {
  const companyId = 'company-1';
  const data = {
    id: companyId,
    name: 'Emisor S.A. de C.V.',
    rfc: 'EMI010101AAA',
    fiscalAddress: 'Calle Uno 100, Hermosillo',
    placeOfIssue: 'Hermosillo, Sonora',
  };

  const company = {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  };
  const service = new CompaniesService({
    company,
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    company.findUnique.mockResolvedValue(data);
    company.updateMany.mockResolvedValue({ count: 1 });
  });

  it('loads issuer only by the authenticated company ID', async () => {
    await expect(service.findOwn(companyId)).resolves.toEqual(data);
    expect(company.findUnique).toHaveBeenCalledWith({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        tradeName: true,
        rfc: true,
        email: true,
        phone: true,
        fiscalAddress: true,
        placeOfIssue: true,
        timezone: true,
        currency: true,
      },
    });
  });

  it('updates only allowed fields under company scope', async () => {
    await expect(
      service.updateOwnCommercial(companyId, {
        fiscalAddress: 'Calle Uno 100, Hermosillo',
        placeOfIssue: 'Hermosillo, Sonora',
      }),
    ).resolves.toEqual(data);
    expect(company.updateMany).toHaveBeenCalledWith({
      where: { id: companyId },
      data: {
        fiscalAddress: 'Calle Uno 100, Hermosillo',
        placeOfIssue: 'Hermosillo, Sonora',
      },
    });
  });

  it('refuses an unknown company and does not leak other tenants', async () => {
    company.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updateOwnCommercial('unknown', {
        fiscalAddress: 'test',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(company.findUnique).not.toHaveBeenCalled();
  });
});
