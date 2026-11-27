import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { HealthcareMasterStatus } from '../common/dto/healthcare-master-list-query.dto';
import { buildHealthcareSearchKey } from '../common/healthcare-normalization';
import { HealthcareDoctorsService } from './healthcare-doctors.service';

type DoctorModelMock = {
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

const doctorRecord = {
  id: 'doctor-1',
  companyId: 'company-a',
  firstName: 'José',
  lastName: 'Muñoz',
  specialty: 'Cardiología',
  phone: null,
  email: null,
  notes: null,
  isActive: true,
  createdAt,
  updatedAt,
  affiliations: [
    { isActive: true, hospital: { isActive: true } },
    { isActive: false, hospital: { isActive: true } },
  ],
};

const duplicateCandidate = {
  id: 'doctor-2',
  firstName: 'Jose',
  lastName: 'Munoz',
  specialty: 'Cardiologia',
  phone: null,
  email: null,
  isActive: false,
};

describe('HealthcareDoctorsService', () => {
  let doctor: DoctorModelMock;
  let clearPreferences: jest.Mock;
  let transaction: jest.Mock;
  let service: HealthcareDoctorsService;

  beforeEach(() => {
    doctor = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(doctorRecord),
      create: jest.fn().mockResolvedValue(doctorRecord),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    clearPreferences = jest.fn().mockResolvedValue({ count: 1 });
    const transactionClient = {
      healthcareDoctor: doctor,
      healthcareDoctorHospitalAffiliation: { updateMany: clearPreferences },
    };
    transaction = jest.fn(
      async (
        callback: (client: typeof transactionClient) => Promise<unknown>,
      ) => callback(transactionClient),
    );
    service = new HealthcareDoctorsService({
      healthcareDoctor: doctor,
      $transaction: transaction,
    } as unknown as PrismaService);
  });

  it('creates a normalized Doctor and derives searchKey server-side', async () => {
    const result = await service.create('company-a', {
      firstName: '  José ',
      lastName: ' Muñoz ',
      specialty: ' CARDIOLOGÍA ',
      phone: '  +52  662 ',
      email: ' MEDICO@EXAMPLE.COM ',
      notes: '   ',
    });

    expect(result).toMatchObject({
      outcome: 'CREATED',
      data: {
        id: 'doctor-1',
        affiliationSummary: { active: 1, total: 2 },
      },
    });
    expect(doctor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          companyId: 'company-a',
          firstName: 'José',
          lastName: 'Muñoz',
          specialty: 'CARDIOLOGÍA',
          phone: '+52 662',
          email: 'medico@example.com',
          notes: null,
          searchKey: buildHealthcareSearchKey(['José', 'Muñoz', 'CARDIOLOGÍA']),
        },
      }),
    );
    const createSelection = firstCallArgument<{
      select: Record<string, unknown>;
    }>(doctor.create).select;
    expect(createSelection).not.toHaveProperty('searchKey');
  });

  it('returns duplicate review without writing and scopes candidates to tenant', async () => {
    doctor.findMany.mockResolvedValueOnce([duplicateCandidate]);

    const result = await service.create('company-a', {
      firstName: 'José',
      lastName: 'Muñoz',
      specialty: 'Cardiología',
    });

    expect(result).toEqual({
      outcome: 'DUPLICATE_REVIEW_REQUIRED',
      resourceType: 'DOCTOR',
      candidates: [duplicateCandidate],
    });
    expect(doctor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 'company-a',
          searchKey: 'jose\u001Fmunoz\u001Fcardiologia',
        },
      }),
    );
    expect(doctor.create).not.toHaveBeenCalled();
  });

  it('permits an explicitly confirmed duplicate create', async () => {
    doctor.findMany.mockResolvedValueOnce([duplicateCandidate]);

    await expect(
      service.create('company-a', {
        firstName: 'José',
        lastName: 'Muñoz',
        specialty: 'Cardiología',
        confirmPossibleDuplicate: true,
      }),
    ).resolves.toMatchObject({ outcome: 'CREATED' });
    expect(doctor.create).toHaveBeenCalledTimes(1);
  });

  it('rejects required blank input at the Service boundary', async () => {
    await expect(
      service.create('company-a', {
        firstName: ' ',
        lastName: 'Muñoz',
        specialty: 'Cardiología',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(doctor.findMany).not.toHaveBeenCalled();
    expect(doctor.create).not.toHaveBeenCalled();
  });

  it('lists ACTIVE Doctors with pagination and deterministic ordering', async () => {
    doctor.count.mockResolvedValueOnce(26);
    doctor.findMany.mockResolvedValueOnce([doctorRecord]);

    const result = await service.findAll('company-a', {});

    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 25,
      totalItems: 26,
      totalPages: 2,
    });
    expect(doctor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-a', isActive: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 25,
      }),
    );
    const listSelection = firstCallArgument<{
      select: Record<string, unknown>;
    }>(doctor.findMany).select;
    expect(listSelection).not.toHaveProperty('notes');
    expect(listSelection).not.toHaveProperty('searchKey');
  });

  it.each([
    [HealthcareMasterStatus.ACTIVE, true],
    [HealthcareMasterStatus.INACTIVE, false],
    [HealthcareMasterStatus.ALL, undefined],
  ])('applies the %s status filter', async (status, isActive) => {
    await service.findAll('company-a', { status });

    const where = firstCallArgument<{ where: Record<string, unknown> }>(
      doctor.findMany,
    ).where;
    expect(where.isActive).toBe(isActive);
  });

  it('normalizes search terms and applies page bounds to the query', async () => {
    await service.findAll('company-a', {
      page: 3,
      pageSize: 10,
      search: '  José\u001F\u001F   CARDIOLOGÍA ',
    });

    expect(doctor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 'company-a',
          isActive: true,
          AND: [
            { searchKey: { contains: 'jose' } },
            { searchKey: { contains: 'cardiologia' } },
          ],
        },
        skip: 20,
        take: 10,
      }),
    );
  });

  it('rejects normalized-empty search before constructing a Prisma query', async () => {
    await expect(
      service.findAll('company-a', { search: '\u0301' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(doctor.count).not.toHaveBeenCalled();
    expect(doctor.findMany).not.toHaveBeenCalled();
  });

  it('returns tenant-scoped detail without searchKey and with affiliation counts', async () => {
    const result = await service.findOne('company-a', 'doctor-1');

    expect(doctor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doctor-1', companyId: 'company-a' },
      }),
    );
    expect(result).not.toHaveProperty('searchKey');
    expect(result.affiliationSummary).toEqual({ active: 1, total: 2 });
  });

  it('uses indistinguishable stable 404 for missing and foreign IDs', async () => {
    doctor.findFirst.mockResolvedValue(null);

    for (const [companyId, doctorId] of [
      ['company-a', 'missing-id'],
      ['company-b', 'doctor-1'],
    ]) {
      await service.findOne(companyId, doctorId).catch((error: unknown) => {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toMatchObject({
          code: 'DOCTOR_NOT_FOUND',
          message: 'Doctor no encontrado',
        });
      });
    }
  });

  it('returns the current Doctor without a write for an empty PATCH', async () => {
    await expect(
      service.update('company-a', 'doctor-1', {}),
    ).resolves.toMatchObject({ outcome: 'UPDATED', data: { id: 'doctor-1' } });
    expect(doctor.updateMany).not.toHaveBeenCalled();
    expect(doctor.findMany).not.toHaveBeenCalled();
  });

  it('clears nullable fields and preserves omitted identity fields', async () => {
    doctor.findFirst.mockResolvedValueOnce(doctorRecord).mockResolvedValueOnce({
      ...doctorRecord,
      phone: null,
      email: null,
      notes: null,
    });

    await service.update('company-a', 'doctor-1', {
      phone: null,
      email: null,
      notes: null,
    });

    expect(doctor.updateMany).toHaveBeenCalledWith({
      where: { id: 'doctor-1', companyId: 'company-a' },
      data: { phone: null, email: null, notes: null },
    });
    expect(doctor.findMany).not.toHaveBeenCalled();
  });

  it('recalculates searchKey and requires review for an identity update', async () => {
    doctor.findMany.mockResolvedValueOnce([duplicateCandidate]);

    const result = await service.update('company-a', 'doctor-1', {
      specialty: '  Cardiología   Pediátrica ',
    });

    expect(result).toMatchObject({
      outcome: 'DUPLICATE_REVIEW_REQUIRED',
      candidates: [duplicateCandidate],
    });
    expect(doctor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 'company-a',
          searchKey: 'jose\u001Fmunoz\u001Fcardiologia pediatrica',
          NOT: { id: 'doctor-1' },
        },
      }),
    );
    expect(doctor.updateMany).not.toHaveBeenCalled();
  });

  it('writes a confirmed identity update with the final complete searchKey', async () => {
    doctor.findMany.mockResolvedValueOnce([duplicateCandidate]);
    doctor.findFirst.mockResolvedValueOnce(doctorRecord).mockResolvedValueOnce({
      ...doctorRecord,
      firstName: 'Juan',
    });

    await service.update('company-a', 'doctor-1', {
      firstName: ' Juan ',
      confirmPossibleDuplicate: true,
    });

    expect(doctor.updateMany).toHaveBeenCalledWith({
      where: { id: 'doctor-1', companyId: 'company-a' },
      data: {
        firstName: 'Juan',
        searchKey: 'juan\u001Fmunoz\u001Fcardiologia',
      },
    });
  });

  it('maps a lost PATCH race to RESOURCE_STATE_CHANGED after a tenant-scoped re-read', async () => {
    doctor.updateMany.mockResolvedValueOnce({ count: 0 });
    doctor.findFirst
      .mockResolvedValueOnce(doctorRecord)
      .mockResolvedValueOnce(doctorRecord);

    await service
      .update('company-a', 'doctor-1', { phone: '+52 662 123' })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          code: 'RESOURCE_STATE_CHANGED',
        });
      });

    expect(doctor.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 'doctor-1', companyId: 'company-a' },
      select: { id: true },
    });
  });

  it('keeps a lost PATCH row indistinguishable from a foreign Doctor', async () => {
    doctor.updateMany.mockResolvedValueOnce({ count: 0 });
    doctor.findFirst
      .mockResolvedValueOnce(doctorRecord)
      .mockResolvedValueOnce(null);

    await service
      .update('company-a', 'doctor-1', { phone: '+52 662 123' })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toMatchObject({
          code: 'DOCTOR_NOT_FOUND',
        });
      });
  });

  it('clears only the matching tenant preferences on effective deactivation', async () => {
    const inactive = { ...doctorRecord, isActive: false };
    doctor.findFirst
      .mockResolvedValueOnce(doctorRecord)
      .mockResolvedValue(inactive);

    await expect(
      service.deactivate('company-a', 'doctor-1'),
    ).resolves.toMatchObject({
      isActive: false,
    });
    await expect(
      service.deactivate('company-a', 'doctor-1'),
    ).resolves.toMatchObject({
      isActive: false,
    });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(doctor.updateMany).toHaveBeenCalledTimes(1);
    expect(doctor.updateMany).toHaveBeenCalledWith({
      where: { id: 'doctor-1', companyId: 'company-a', isActive: true },
      data: { isActive: false },
    });
    expect(clearPreferences).toHaveBeenCalledTimes(1);
    expect(clearPreferences).toHaveBeenCalledWith({
      where: {
        companyId: 'company-a',
        doctorId: 'doctor-1',
        isPreferred: true,
      },
      data: { isPreferred: false },
    });
    expect(doctor.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      clearPreferences.mock.invocationCallOrder[0],
    );
  });

  it('reactivates idempotently without restoring preferences', async () => {
    doctor.findFirst.mockResolvedValueOnce({
      ...doctorRecord,
      isActive: false,
    });

    await expect(
      service.reactivate('company-a', 'doctor-1'),
    ).resolves.toMatchObject({
      isActive: true,
    });
    await expect(
      service.reactivate('company-a', 'doctor-1'),
    ).resolves.toMatchObject({
      isActive: true,
    });
    expect(doctor.updateMany).toHaveBeenCalledTimes(1);
    expect(clearPreferences).not.toHaveBeenCalled();
  });

  it('rejects a deactivation in a different tenant before any write', async () => {
    doctor.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.deactivate('company-b', 'doctor-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(doctor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doctor-1', companyId: 'company-b' },
      }),
    );
    expect(doctor.updateMany).not.toHaveBeenCalled();
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
      service.deactivate('company-a', 'doctor-1'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(doctor.updateMany).toHaveBeenCalledTimes(1);
    expect(clearPreferences).toHaveBeenCalledTimes(1);
    expect(doctor.findFirst).toHaveBeenCalledTimes(1);
  });

  it('accepts a concurrently reached lifecycle target state', async () => {
    doctor.updateMany.mockResolvedValueOnce({ count: 0 });
    doctor.findFirst.mockResolvedValueOnce(doctorRecord).mockResolvedValueOnce({
      ...doctorRecord,
      isActive: false,
    });

    await expect(
      service.deactivate('company-a', 'doctor-1'),
    ).resolves.toMatchObject({ isActive: false });
    expect(clearPreferences).not.toHaveBeenCalled();
  });

  it('maps an unresolved lifecycle race to RESOURCE_STATE_CHANGED', async () => {
    doctor.updateMany.mockResolvedValueOnce({ count: 0 });
    doctor.findFirst.mockResolvedValue(doctorRecord);

    await service
      .deactivate('company-a', 'doctor-1')
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          code: 'RESOURCE_STATE_CHANGED',
        });
      });
  });

  it('maps known Prisma write errors without exposing their raw message', async () => {
    doctor.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('raw constraint detail', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    await service
      .create('company-a', {
        firstName: 'José',
        lastName: 'Muñoz',
        specialty: 'Cardiología',
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
