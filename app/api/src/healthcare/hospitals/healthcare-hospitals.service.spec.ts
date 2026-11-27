import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { HealthcareMasterStatus } from '../common/dto/healthcare-master-list-query.dto';
import { HealthcareHospitalsService } from './healthcare-hospitals.service';

type HospitalModelMock = {
  count: jest.Mock;
  findMany: jest.Mock;
  findFirst: jest.Mock;
  create: jest.Mock;
  updateMany: jest.Mock;
};

function firstCallArgument<T>(mock: jest.Mock): T {
  const calls = mock.mock.calls as [T][];
  const firstCall = calls[0];

  if (!firstCall) {
    throw new Error('Expected mock to have been called');
  }

  return firstCall[0];
}

const createdAt = new Date('2026-09-10T10:00:00.000Z');
const updatedAt = new Date('2026-09-10T11:00:00.000Z');

const hospitalRecord = {
  id: 'hospital-1',
  companyId: 'company-a',
  name: 'Hospital San José',
  city: 'Hermosillo',
  state: 'Sonora',
  address: null,
  phone: null,
  email: null,
  contactName: null,
  notes: null,
  isActive: true,
  createdAt,
  updatedAt,
  affiliations: [
    { isActive: true, doctor: { isActive: true } },
    { isActive: true, doctor: { isActive: false } },
  ],
};

const duplicateCandidate = {
  id: 'hospital-2',
  name: 'Hospital San Jose',
  city: 'Hermosillo',
  state: 'Sonora',
  address: null,
  isActive: false,
};

describe('HealthcareHospitalsService', () => {
  let hospital: HospitalModelMock;
  let clearPreferences: jest.Mock;
  let transaction: jest.Mock;
  let service: HealthcareHospitalsService;

  beforeEach(() => {
    hospital = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(hospitalRecord),
      create: jest.fn().mockResolvedValue(hospitalRecord),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    clearPreferences = jest.fn().mockResolvedValue({ count: 1 });
    const transactionClient = {
      healthcareHospital: hospital,
      healthcareDoctorHospitalAffiliation: { updateMany: clearPreferences },
    };
    transaction = jest.fn(
      async (
        callback: (client: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    );
    service = new HealthcareHospitalsService({
      healthcareHospital: hospital,
      $transaction: transaction,
    } as unknown as PrismaService);
  });

  it('creates a normalized Hospital with a server-controlled searchKey', async () => {
    const result = await service.create('company-a', {
      name: ' Hospital   San José ',
      city: ' HERMOSILLO ',
      state: ' Sonora ',
      address: '   ',
      phone: ' +52   662 ',
      email: ' CONTACTO@HOSPITAL.MX ',
      contactName: ' Ana   Pérez ',
      notes: '   ',
    });

    expect(result).toMatchObject({
      outcome: 'CREATED',
      data: {
        id: 'hospital-1',
        affiliationSummary: { active: 1, total: 2 },
      },
    });
    expect(hospital.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          companyId: 'company-a',
          name: 'Hospital San José',
          city: 'HERMOSILLO',
          state: 'Sonora',
          address: null,
          phone: '+52 662',
          email: 'contacto@hospital.mx',
          contactName: 'Ana Pérez',
          notes: null,
          searchKey: 'hospital san jose\u001Fhermosillo\u001Fsonora',
        },
      }),
    );
    const createSelection = firstCallArgument<{
      select: Record<string, unknown>;
    }>(hospital.create).select;
    expect(createSelection).not.toHaveProperty('searchKey');
  });

  it('returns same-tenant duplicate candidates without writing', async () => {
    hospital.findMany.mockResolvedValueOnce([duplicateCandidate]);

    const result = await service.create('company-a', {
      name: 'Hospital San José',
      city: 'Hermosillo',
      state: 'Sonora',
    });

    expect(result).toEqual({
      outcome: 'DUPLICATE_REVIEW_REQUIRED',
      resourceType: 'HOSPITAL',
      candidates: [duplicateCandidate],
    });
    expect(hospital.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 'company-a',
          searchKey: 'hospital san jose\u001Fhermosillo\u001Fsonora',
        },
      }),
    );
    expect(hospital.create).not.toHaveBeenCalled();
  });

  it('permits an explicitly confirmed duplicate create', async () => {
    hospital.findMany.mockResolvedValueOnce([duplicateCandidate]);

    await expect(
      service.create('company-a', {
        name: 'Hospital San José',
        city: 'Hermosillo',
        state: 'Sonora',
        confirmPossibleDuplicate: true,
      }),
    ).resolves.toMatchObject({ outcome: 'CREATED' });
    expect(hospital.create).toHaveBeenCalledTimes(1);
  });

  it('rejects required blank input at the Service boundary', async () => {
    await expect(
      service.create('company-a', {
        name: ' ',
        city: 'Hermosillo',
        state: 'Sonora',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(hospital.findMany).not.toHaveBeenCalled();
    expect(hospital.create).not.toHaveBeenCalled();
  });

  it('lists ACTIVE Hospitals with pagination and deterministic ordering', async () => {
    hospital.count.mockResolvedValueOnce(51);
    hospital.findMany.mockResolvedValueOnce([hospitalRecord]);

    const result = await service.findAll('company-a', {
      page: 2,
      pageSize: 25,
      status: HealthcareMasterStatus.ACTIVE,
    });

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 25,
      totalItems: 51,
      totalPages: 3,
    });
    expect(hospital.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-a', isActive: true },
        orderBy: [{ name: 'asc' }, { city: 'asc' }, { id: 'asc' }],
        skip: 25,
        take: 25,
      }),
    );
    const listSelection = firstCallArgument<{
      select: Record<string, unknown>;
    }>(hospital.findMany).select;
    expect(listSelection).not.toHaveProperty('notes');
    expect(listSelection).not.toHaveProperty('searchKey');
  });

  it('applies search plus exact case-insensitive city/state filters', async () => {
    await service.findAll('company-a', {
      search: '  MÉRIDA\u001F\u001F   YUCATÁN ',
      city: ' Mérida ',
      state: ' YUCATÁN ',
    });

    expect(hospital.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 'company-a',
          isActive: true,
          AND: [
            { searchKey: { contains: 'merida' } },
            { searchKey: { contains: 'yucatan' } },
          ],
          city: { equals: 'Mérida', mode: 'insensitive' },
          state: { equals: 'YUCATÁN', mode: 'insensitive' },
        },
      }),
    );
  });

  it('rejects normalized-empty search before constructing a Prisma query', async () => {
    await expect(
      service.findAll('company-a', { search: '\u001F' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(hospital.count).not.toHaveBeenCalled();
    expect(hospital.findMany).not.toHaveBeenCalled();
  });

  it.each([
    [HealthcareMasterStatus.ACTIVE, true],
    [HealthcareMasterStatus.INACTIVE, false],
    [HealthcareMasterStatus.ALL, undefined],
  ])('applies the %s status filter', async (status, isActive) => {
    await service.findAll('company-a', { status });

    const where = firstCallArgument<{ where: Record<string, unknown> }>(
      hospital.findMany,
    ).where;
    expect(where.isActive).toBe(isActive);
  });

  it('returns tenant-scoped detail without searchKey and with affiliation counts', async () => {
    const result = await service.findOne('company-a', 'hospital-1');

    expect(hospital.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'hospital-1', companyId: 'company-a' },
      }),
    );
    expect(result).not.toHaveProperty('searchKey');
    expect(result.affiliationSummary).toEqual({ active: 1, total: 2 });
  });

  it('uses indistinguishable stable 404 for missing and foreign IDs', async () => {
    hospital.findFirst.mockResolvedValue(null);

    for (const [companyId, hospitalId] of [
      ['company-a', 'missing-id'],
      ['company-b', 'hospital-1'],
    ]) {
      await service.findOne(companyId, hospitalId).catch((error: unknown) => {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toMatchObject({
          code: 'HOSPITAL_NOT_FOUND',
          message: 'Hospital no encontrado',
        });
      });
    }
  });

  it('returns the current Hospital without a write for an empty PATCH', async () => {
    await expect(
      service.update('company-a', 'hospital-1', {}),
    ).resolves.toMatchObject({
      outcome: 'UPDATED',
      data: { id: 'hospital-1' },
    });
    expect(hospital.updateMany).not.toHaveBeenCalled();
    expect(hospital.findMany).not.toHaveBeenCalled();
  });

  it('clears nullable fields and preserves omitted identity fields', async () => {
    hospital.findFirst
      .mockResolvedValueOnce(hospitalRecord)
      .mockResolvedValueOnce({
        ...hospitalRecord,
        address: null,
        email: null,
        contactName: null,
      });

    await service.update('company-a', 'hospital-1', {
      address: null,
      email: null,
      contactName: null,
    });

    expect(hospital.updateMany).toHaveBeenCalledWith({
      where: { id: 'hospital-1', companyId: 'company-a' },
      data: { address: null, email: null, contactName: null },
    });
    expect(hospital.findMany).not.toHaveBeenCalled();
  });

  it('requires review for identity updates and excludes the current Hospital', async () => {
    hospital.findMany.mockResolvedValueOnce([duplicateCandidate]);

    const result = await service.update('company-a', 'hospital-1', {
      city: ' Mérida ',
    });

    expect(result).toMatchObject({
      outcome: 'DUPLICATE_REVIEW_REQUIRED',
      candidates: [duplicateCandidate],
    });
    expect(hospital.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 'company-a',
          searchKey: 'hospital san jose\u001Fmerida\u001Fsonora',
          NOT: { id: 'hospital-1' },
        },
      }),
    );
    expect(hospital.updateMany).not.toHaveBeenCalled();
  });

  it('writes confirmed identity update with final complete searchKey', async () => {
    hospital.findMany.mockResolvedValueOnce([duplicateCandidate]);
    hospital.findFirst
      .mockResolvedValueOnce(hospitalRecord)
      .mockResolvedValueOnce({ ...hospitalRecord, city: 'Mérida' });

    await service.update('company-a', 'hospital-1', {
      city: ' Mérida ',
      confirmPossibleDuplicate: true,
    });

    expect(hospital.updateMany).toHaveBeenCalledWith({
      where: { id: 'hospital-1', companyId: 'company-a' },
      data: {
        city: 'Mérida',
        searchKey: 'hospital san jose\u001Fmerida\u001Fsonora',
      },
    });
  });

  it('maps a lost PATCH race to RESOURCE_STATE_CHANGED after a tenant-scoped re-read', async () => {
    hospital.updateMany.mockResolvedValueOnce({ count: 0 });
    hospital.findFirst
      .mockResolvedValueOnce(hospitalRecord)
      .mockResolvedValueOnce(hospitalRecord);

    await service
      .update('company-a', 'hospital-1', { phone: '+52 662 123' })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          code: 'RESOURCE_STATE_CHANGED',
        });
      });

    expect(hospital.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 'hospital-1', companyId: 'company-a' },
      select: { id: true },
    });
  });

  it('keeps a lost PATCH row indistinguishable from a foreign Hospital', async () => {
    hospital.updateMany.mockResolvedValueOnce({ count: 0 });
    hospital.findFirst
      .mockResolvedValueOnce(hospitalRecord)
      .mockResolvedValueOnce(null);

    await service
      .update('company-a', 'hospital-1', { phone: '+52 662 123' })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toMatchObject({
          code: 'HOSPITAL_NOT_FOUND',
        });
      });
  });

  it('clears only the matching tenant preferences on effective deactivation', async () => {
    const inactive = { ...hospitalRecord, isActive: false };
    hospital.findFirst
      .mockResolvedValueOnce(hospitalRecord)
      .mockResolvedValue(inactive);

    await expect(
      service.deactivate('company-a', 'hospital-1'),
    ).resolves.toMatchObject({
      isActive: false,
    });
    await expect(
      service.deactivate('company-a', 'hospital-1'),
    ).resolves.toMatchObject({
      isActive: false,
    });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(hospital.updateMany).toHaveBeenCalledTimes(1);
    expect(hospital.updateMany).toHaveBeenCalledWith({
      where: { id: 'hospital-1', companyId: 'company-a', isActive: true },
      data: { isActive: false },
    });
    expect(clearPreferences).toHaveBeenCalledTimes(1);
    expect(clearPreferences).toHaveBeenCalledWith({
      where: {
        companyId: 'company-a',
        hospitalId: 'hospital-1',
        isPreferred: true,
      },
      data: { isPreferred: false },
    });
    expect(hospital.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      clearPreferences.mock.invocationCallOrder[0],
    );
  });

  it('reactivates idempotently without restoring preferences', async () => {
    hospital.findFirst.mockResolvedValueOnce({
      ...hospitalRecord,
      isActive: false,
    });

    await expect(
      service.reactivate('company-a', 'hospital-1'),
    ).resolves.toMatchObject({
      isActive: true,
    });
    await expect(
      service.reactivate('company-a', 'hospital-1'),
    ).resolves.toMatchObject({
      isActive: true,
    });
    expect(hospital.updateMany).toHaveBeenCalledTimes(1);
    expect(clearPreferences).not.toHaveBeenCalled();
  });

  it('rejects a deactivation in a different tenant before any write', async () => {
    hospital.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.deactivate('company-b', 'hospital-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(hospital.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'hospital-1', companyId: 'company-b' },
      }),
    );
    expect(hospital.updateMany).not.toHaveBeenCalled();
    expect(clearPreferences).not.toHaveBeenCalled();
  });

  it('rejects the transaction when preference cleanup fails', async () => {
    clearPreferences.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('raw cleanup error', {
        code: 'P2010',
        clientVersion: '6.19.3',
      }),
    );

    await expect(
      service.deactivate('company-a', 'hospital-1'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(hospital.updateMany).toHaveBeenCalledTimes(1);
    expect(clearPreferences).toHaveBeenCalledTimes(1);
    expect(hospital.findFirst).toHaveBeenCalledTimes(1);
  });

  it('accepts a concurrently reached lifecycle target state', async () => {
    hospital.updateMany.mockResolvedValueOnce({ count: 0 });
    hospital.findFirst
      .mockResolvedValueOnce(hospitalRecord)
      .mockResolvedValueOnce({ ...hospitalRecord, isActive: false });

    await expect(
      service.deactivate('company-a', 'hospital-1'),
    ).resolves.toMatchObject({ isActive: false });
    expect(clearPreferences).not.toHaveBeenCalled();
  });

  it('maps an unresolved lifecycle race to RESOURCE_STATE_CHANGED', async () => {
    hospital.updateMany.mockResolvedValueOnce({ count: 0 });
    hospital.findFirst.mockResolvedValue(hospitalRecord);

    await service
      .deactivate('company-a', 'hospital-1')
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          code: 'RESOURCE_STATE_CHANGED',
        });
      });
  });

  it('maps known Prisma write errors without exposing their raw message', async () => {
    hospital.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('raw constraint detail', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    await service
      .create('company-a', {
        name: 'Hospital San José',
        city: 'Hermosillo',
        state: 'Sonora',
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(InternalServerErrorException);
        expect((error as InternalServerErrorException).getResponse()).toEqual({
          statusCode: 500,
          error: 'Internal Server Error',
          code: 'HEALTHCARE_PERSISTENCE_ERROR',
          message: 'No fue posible completar la operación',
        });
      });
  });
});
