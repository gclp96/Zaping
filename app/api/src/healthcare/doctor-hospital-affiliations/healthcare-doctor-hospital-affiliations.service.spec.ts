import {
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { HealthcareMasterStatus } from '../common/dto/healthcare-master-list-query.dto';
import { HealthcareDoctorHospitalAffiliationsService } from './healthcare-doctor-hospital-affiliations.service';

type ModelMock = Record<
  'count' | 'findMany' | 'findFirst' | 'findUnique' | 'create' | 'updateMany',
  jest.Mock
>;

type PrismaMock = {
  healthcareDoctor: Pick<ModelMock, 'findFirst'>;
  healthcareHospital: Pick<ModelMock, 'findFirst'>;
  healthcareDoctorHospitalAffiliation: ModelMock;
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
};

function firstCallArgument<T>(mock: jest.Mock): T {
  const calls = mock.mock.calls as [T][];
  const firstCall = calls[0];

  if (!firstCall) {
    throw new Error('Expected mock to have been called');
  }

  return firstCall[0];
}

function knownPrismaError(code: string, target?: string[]) {
  return new Prisma.PrismaClientKnownRequestError('raw database detail', {
    code,
    clientVersion: '6.19.3',
    ...(target ? { meta: { target } } : {}),
  });
}

function expectStableCode(error: unknown, code: string): void {
  expect((error as HttpException).getResponse()).toMatchObject({ code });
}

const createdAt = new Date('2026-09-10T10:00:00.000Z');
const updatedAt = new Date('2026-09-10T11:00:00.000Z');
const compactDoctor = {
  id: 'doctor-a',
  firstName: 'José',
  lastName: 'Muñoz',
  specialty: 'Cardiología',
  isActive: true,
};
const compactHospital = {
  id: 'hospital-a',
  name: 'Hospital Central',
  city: 'Hermosillo',
  state: 'Sonora',
  isActive: true,
};
const affiliationRecord = {
  id: 'affiliation-a',
  companyId: 'company-a',
  doctorId: compactDoctor.id,
  hospitalId: compactHospital.id,
  isActive: true,
  notes: null,
  createdAt,
  updatedAt,
  doctor: compactDoctor,
  hospital: compactHospital,
  isPreferred: false,
};

const expectedActiveStatusWhere = {
  isActive: true,
  doctor: { is: { isActive: true } },
  hospital: { is: { isActive: true } },
};

const expectedInactiveStatusWhere = {
  OR: [
    { isActive: false },
    { doctor: { is: { isActive: false } } },
    { hospital: { is: { isActive: false } } },
  ],
};

type SetupModels = {
  doctor: Pick<ModelMock, 'findFirst'>;
  hospital: Pick<ModelMock, 'findFirst'>;
};

describe('HealthcareDoctorHospitalAffiliationsService', () => {
  let affiliation: ModelMock;
  let doctor: Pick<ModelMock, 'findFirst'>;
  let hospital: Pick<ModelMock, 'findFirst'>;
  let prisma: PrismaMock;
  let service: HealthcareDoctorHospitalAffiliationsService;

  beforeEach(() => {
    affiliation = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(affiliationRecord),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(affiliationRecord),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    doctor = {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'doctor-a', isActive: true }),
    };
    hospital = {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'hospital-a', isActive: true }),
    };
    prisma = {
      healthcareDoctor: doctor,
      healthcareHospital: hospital,
      healthcareDoctorHospitalAffiliation: affiliation,
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'doctor-a' }]),
      $transaction: jest
        .fn()
        .mockImplementation((callback: (transaction: PrismaMock) => unknown) =>
          callback(prisma),
        ),
    };
    service = new HealthcareDoctorHospitalAffiliationsService(
      prisma as unknown as PrismaService,
    );
  });

  it('sets a preferred hospital and clears the previous preference', async () => {
    affiliation.findFirst
      .mockResolvedValueOnce(affiliationRecord)
      .mockResolvedValueOnce(affiliationRecord)
      .mockResolvedValueOnce({
        ...affiliationRecord,
        isPreferred: true,
      });

    const result = await service.prefer('company-a', 'affiliation-a');

    expect(result.isPreferred).toBe(true);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);

    expect(affiliation.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        companyId: 'company-a',
        doctorId: 'doctor-a',
        isPreferred: true,
      },
      data: { isPreferred: false },
    });

    expect(affiliation.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'affiliation-a',
        companyId: 'company-a',
        doctorId: 'doctor-a',
        isActive: true,
      },
      data: { isPreferred: true },
    });
  });

  it('does not write when the affiliation is already preferred', async () => {
    affiliation.findFirst.mockResolvedValue({
      ...affiliationRecord,
      isPreferred: true,
    });

    const result = await service.prefer('company-a', 'affiliation-a');

    expect(result.isPreferred).toBe(true);
    expect(affiliation.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an inactive affiliation without changing preferences', async () => {
    affiliation.findFirst
      .mockResolvedValueOnce(affiliationRecord)
      .mockResolvedValueOnce({
        ...affiliationRecord,
        isActive: false,
      });

    await expect(
      service.prefer('company-a', 'affiliation-a'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(affiliation.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an affiliation belonging to another company', async () => {
    affiliation.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.prefer('company-b', 'affiliation-a'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(affiliation.updateMany).not.toHaveBeenCalled();
  });

  it('creates one normalized same-tenant link in a transaction', async () => {
    await expect(
      service.create('company-a', {
        doctorId: 'doctor-a',
        hospitalId: 'hospital-a',
        notes: '  Guardia nocturna  ',
      }),
    ).resolves.toEqual(affiliationRecord);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(doctor.findFirst).toHaveBeenCalledWith({
      where: { id: 'doctor-a', companyId: 'company-a' },
      select: { isActive: true },
    });
    expect(hospital.findFirst).toHaveBeenCalledWith({
      where: { id: 'hospital-a', companyId: 'company-a' },
      select: { isActive: true },
    });
    expect(affiliation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId_doctorId_hospitalId: {
            companyId: 'company-a',
            doctorId: 'doctor-a',
            hospitalId: 'hospital-a',
          },
        },
      }),
    );
    expect(affiliation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          companyId: 'company-a',
          doctorId: 'doctor-a',
          hospitalId: 'hospital-a',
          isActive: true,
          notes: 'Guardia nocturna',
        },
      }),
    );
    const selection = firstCallArgument<{ select: Record<string, unknown> }>(
      affiliation.create,
    ).select;
    expect(selection).not.toHaveProperty('searchKey');
  });

  it.each([
    ['missing Doctor', 'company-a', doctorNotFoundSetup, 'DOCTOR_NOT_FOUND'],
    ['foreign Doctor', 'company-b', doctorNotFoundSetup, 'DOCTOR_NOT_FOUND'],
    [
      'missing Hospital',
      'company-a',
      hospitalNotFoundSetup,
      'HOSPITAL_NOT_FOUND',
    ],
    [
      'foreign Hospital',
      'company-b',
      hospitalNotFoundSetup,
      'HOSPITAL_NOT_FOUND',
    ],
  ] as const)(
    'maps a %s ID to tenant-safe 404',
    async (_label, tenantId, setup, code) => {
      setup({ doctor, hospital });

      await service
        .create(tenantId, {
          doctorId: 'foreign-doctor',
          hospitalId: 'foreign-hospital',
        })
        .catch((error: unknown) => {
          expect(error).toBeInstanceOf(NotFoundException);
          expectStableCode(error, code);
        });

      expect(affiliation.create).not.toHaveBeenCalled();
    },
  );

  it('creates with omitted notes as null', async () => {
    await service.create('company-a', {
      doctorId: 'doctor-a',
      hospitalId: 'hospital-a',
    });

    const createArguments = firstCallArgument<{
      data: { notes: string | null };
    }>(affiliation.create);

    expect(createArguments.data.notes).toBeNull();
  });

  it.each([
    ['doctor', doctorInactiveSetup, 'DOCTOR_INACTIVE'],
    ['hospital', hospitalInactiveSetup, 'HOSPITAL_INACTIVE'],
  ] as const)(
    'rejects an inactive %s before creating the link',
    async (_label, setup, code) => {
      setup({ doctor, hospital });

      await service
        .create('company-a', {
          doctorId: 'doctor-a',
          hospitalId: 'hospital-a',
        })
        .catch((error: unknown) => {
          expect(error).toBeInstanceOf(ConflictException);
          expectStableCode(error, code);
        });

      expect(affiliation.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [true, 'AFFILIATION_ALREADY_ACTIVE'],
    [false, 'AFFILIATION_INACTIVE'],
  ])(
    'returns the stable conflict for an existing pair (%s)',
    async (isActive, code) => {
      affiliation.findUnique.mockResolvedValueOnce({
        id: 'affiliation-a',
        isActive,
        doctor: { isActive: true },
        hospital: { isActive: true },
      });

      await service
        .create('company-a', {
          doctorId: 'doctor-a',
          hospitalId: 'hospital-a',
        })
        .catch((error: unknown) => {
          expect(error).toBeInstanceOf(ConflictException);
          expectStableCode(error, code);
          expect((error as ConflictException).getResponse()).toMatchObject({
            details: { affiliationId: 'affiliation-a' },
          });
        });
      expect(affiliation.create).not.toHaveBeenCalled();
    },
  );

  it('does not expose an active pair as usable when an endpoint became inactive', async () => {
    affiliation.findUnique.mockResolvedValueOnce({
      id: 'affiliation-a',
      isActive: true,
      doctor: { isActive: true },
      hospital: { isActive: false },
    });

    await service
      .create('company-a', {
        doctorId: 'doctor-a',
        hospitalId: 'hospital-a',
      })
      .catch((error: unknown) => {
        expectStableCode(error, 'AFFILIATION_ENDPOINT_INACTIVE');
      });
  });

  it.each([
    [true, 'AFFILIATION_ALREADY_ACTIVE'],
    [false, 'AFFILIATION_INACTIVE'],
  ])(
    're-reads the winner after an exact pair P2002 race (%s)',
    async (isActive, code) => {
      affiliation.create.mockRejectedValueOnce(
        knownPrismaError('P2002', ['companyId', 'doctorId', 'hospitalId']),
      );
      affiliation.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'winner-id',
        isActive,
        doctor: { isActive: true },
        hospital: { isActive: true },
      });

      await service
        .create('company-a', {
          doctorId: 'doctor-a',
          hospitalId: 'hospital-a',
        })
        .catch((error: unknown) => {
          expectStableCode(error, code);
          expect((error as ConflictException).getResponse()).toMatchObject({
            details: { affiliationId: 'winner-id' },
          });
        });

      expect(affiliation.findUnique).toHaveBeenCalledTimes(2);
    },
  );

  it('does not classify an unrelated P2002 as an affiliation duplicate', async () => {
    affiliation.create.mockRejectedValueOnce(
      knownPrismaError('P2002', ['someOtherConstraintField']),
    );

    await service
      .create('company-a', {
        doctorId: 'doctor-a',
        hospitalId: 'hospital-a',
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(InternalServerErrorException);
        expectStableCode(error, 'HEALTHCARE_PERSISTENCE_ERROR');
      });
    expect(affiliation.findUnique).toHaveBeenCalledTimes(1);
  });

  it('maps a create P2003 race to RELATED_RESOURCE_CHANGED', async () => {
    affiliation.create.mockRejectedValueOnce(knownPrismaError('P2003'));

    await service
      .create('company-a', {
        doctorId: 'doctor-a',
        hospitalId: 'hospital-a',
      })
      .catch((error: unknown) => {
        expectStableCode(error, 'RELATED_RESOURCE_CHANGED');
      });
  });

  it('returns the current row without writing for an empty PATCH', async () => {
    await expect(
      service.update('company-a', 'affiliation-a', {}),
    ).resolves.toEqual(affiliationRecord);
    expect(affiliation.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    [true, '  Nueva nota  ', 'Nueva nota'],
    [false, null, null],
    [true, '   ', null],
  ] as const)(
    'updates notes without changing pair or lifecycle when isActive=%s and notes=%s',
    async (isActive, notes, expectedNotes) => {
      affiliation.findFirst
        .mockResolvedValueOnce({ ...affiliationRecord, isActive })
        .mockResolvedValueOnce({
          ...affiliationRecord,
          isActive,
          notes: null,
        });

      await service.update('company-a', 'affiliation-a', { notes });

      expect(affiliation.updateMany).toHaveBeenCalledWith({
        where: { id: 'affiliation-a', companyId: 'company-a' },
        data: { notes: expectedNotes },
      });
    },
  );

  it.each([
    ['missing', 'company-a', 'missing-affiliation'],
    ['foreign', 'company-b', 'foreign-affiliation'],
  ])('uses stable 404 for a %s PATCH ID', async (_label, tenantId, id) => {
    affiliation.findFirst.mockResolvedValue(null);

    await service
      .update(tenantId, id, { notes: null })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(NotFoundException);
        expectStableCode(error, 'AFFILIATION_NOT_FOUND');
      });
    expect(affiliation.updateMany).not.toHaveBeenCalled();
  });

  it('maps a lost PATCH race to RESOURCE_STATE_CHANGED after a tenant-scoped re-read', async () => {
    affiliation.updateMany.mockResolvedValueOnce({ count: 0 });
    affiliation.findFirst
      .mockResolvedValueOnce(affiliationRecord)
      .mockResolvedValueOnce(affiliationRecord);

    await service
      .update('company-a', 'affiliation-a', { notes: 'Actualizada' })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(ConflictException);
        expectStableCode(error, 'RESOURCE_STATE_CHANGED');
      });

    expect(affiliation.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 'affiliation-a', companyId: 'company-a' },
      select: { id: true },
    });
  });

  it('keeps a lost PATCH row indistinguishable from a foreign affiliation', async () => {
    affiliation.updateMany.mockResolvedValueOnce({ count: 0 });
    affiliation.findFirst
      .mockResolvedValueOnce(affiliationRecord)
      .mockResolvedValueOnce(null);

    await service
      .update('company-a', 'affiliation-a', { notes: 'Actualizada' })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(NotFoundException);
        expectStableCode(error, 'AFFILIATION_NOT_FOUND');
      });
  });

  it.each([
    ['P2003', 'RELATED_RESOURCE_CHANGED'],
    ['P2002', 'HEALTHCARE_PERSISTENCE_ERROR'],
  ])('maps PATCH %s to %s without raw details', async (prismaCode, code) => {
    affiliation.updateMany.mockRejectedValueOnce(knownPrismaError(prismaCode));

    await service
      .update('company-a', 'affiliation-a', { notes: 'Actualizada' })
      .catch((error: unknown) => {
        expectStableCode(error, code);
        expect(
          JSON.stringify((error as HttpException).getResponse()),
        ).not.toContain('raw database detail');
      });
  });

  it.each([
    ['deactivate', true, false],
    ['reactivate', false, true],
  ] as const)(
    '%s uses a tenant/state updateMany and returns the same row',
    async (methodName, initialState, targetState) => {
      affiliation.findFirst
        .mockResolvedValueOnce({
          ...affiliationRecord,
          isActive: initialState,
        })
        .mockResolvedValueOnce({
          ...affiliationRecord,
          isActive: targetState,
        });

      await expect(
        service[methodName]('company-a', 'affiliation-a'),
      ).resolves.toMatchObject({
        id: 'affiliation-a',
        isActive: targetState,
      });
      expect(affiliation.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'affiliation-a',
          companyId: 'company-a',
          isActive: initialState,
        },
        data: {
          isActive: targetState,
          ...(!targetState ? { isPreferred: false } : {}),
        },
      });
    },
  );

  it.each([
    ['deactivate', false],
    ['reactivate', true],
  ] as const)('keeps repeated %s idempotent', async (methodName, isActive) => {
    affiliation.findFirst.mockResolvedValueOnce({
      ...affiliationRecord,
      isActive,
    });

    await expect(
      service[methodName]('company-a', 'affiliation-a'),
    ).resolves.toMatchObject({ isActive });
    expect(affiliation.updateMany).not.toHaveBeenCalled();
  });

  it.each(['doctor', 'hospital'] as const)(
    'rejects reactivate when the %s endpoint is inactive',
    async (endpoint) => {
      affiliation.findFirst.mockResolvedValueOnce({
        ...affiliationRecord,
        isActive: false,
        [endpoint]: {
          ...affiliationRecord[endpoint],
          isActive: false,
        },
      });

      await service
        .reactivate('company-a', 'affiliation-a')
        .catch((error: unknown) => {
          expectStableCode(error, 'AFFILIATION_ENDPOINT_INACTIVE');
        });
      expect(affiliation.updateMany).not.toHaveBeenCalled();
    },
  );

  it('accepts a concurrently reached lifecycle target state', async () => {
    affiliation.updateMany.mockResolvedValueOnce({ count: 0 });
    affiliation.findFirst
      .mockResolvedValueOnce(affiliationRecord)
      .mockResolvedValueOnce({ ...affiliationRecord, isActive: false });

    await expect(
      service.deactivate('company-a', 'affiliation-a'),
    ).resolves.toMatchObject({ isActive: false });
  });

  it('maps a lost lifecycle race with an unexpected state to RESOURCE_STATE_CHANGED', async () => {
    affiliation.updateMany.mockResolvedValueOnce({ count: 0 });
    affiliation.findFirst.mockResolvedValue(affiliationRecord);

    await service
      .deactivate('company-a', 'affiliation-a')
      .catch((error: unknown) => {
        expectStableCode(error, 'RESOURCE_STATE_CHANGED');
      });
  });

  it.each([
    ['missing', 'company-a', 'missing-affiliation'],
    ['foreign', 'company-b', 'foreign-affiliation'],
  ])(
    'maps a %s lifecycle resource to AFFILIATION_NOT_FOUND',
    async (_label, tenantId, id) => {
      affiliation.findFirst.mockResolvedValueOnce(null);

      await service.deactivate(tenantId, id).catch((error: unknown) => {
        expectStableCode(error, 'AFFILIATION_NOT_FOUND');
      });
    },
  );

  it.each([
    [HealthcareMasterStatus.ACTIVE, expectedActiveStatusWhere],
    [HealthcareMasterStatus.INACTIVE, expectedInactiveStatusWhere],
    [HealthcareMasterStatus.ALL, {}],
  ])(
    'applies effective %s status to Doctor-to-Hospitals list',
    async (status, expectedStatusWhere) => {
      await service.findHospitalsForDoctor('company-a', 'doctor-a', { status });

      const where = firstCallArgument<{
        where: Prisma.HealthcareDoctorHospitalAffiliationWhereInput;
      }>(affiliation.findMany).where;
      expect(where).toMatchObject({
        companyId: 'company-a',
        doctorId: 'doctor-a',
        ...expectedStatusWhere,
      });
    },
  );

  it('lists Hospitals with normalized AND search, pagination and stable ordering', async () => {
    affiliation.count.mockResolvedValueOnce(26);
    affiliation.findMany.mockResolvedValueOnce([omitDoctor(affiliationRecord)]);

    const result = await service.findHospitalsForDoctor(
      'company-a',
      'doctor-a',
      {
        page: 2,
        pageSize: 25,
        status: HealthcareMasterStatus.ALL,
        search: '  Hóspital Central ',
      },
    );

    expect(doctor.findFirst).toHaveBeenCalledWith({
      where: { id: 'doctor-a', companyId: 'company-a' },
      select: { id: true },
    });
    expect(affiliation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 'company-a',
          doctorId: 'doctor-a',
          AND: [
            {
              hospital: {
                is: { searchKey: { contains: 'hospital' } },
              },
            },
            {
              hospital: {
                is: { searchKey: { contains: 'central' } },
              },
            },
          ],
        },
        orderBy: [
          { hospital: { name: 'asc' } },
          { hospital: { city: 'asc' } },
          { id: 'asc' },
        ],
        skip: 25,
        take: 25,
      }),
    );
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 25,
      totalItems: 26,
      totalPages: 2,
    });
    const selection = firstCallArgument<{ select: Record<string, unknown> }>(
      affiliation.findMany,
    ).select;
    expect(selection).not.toHaveProperty('doctor');
    expect(selection).not.toHaveProperty('searchKey');
    expect(affiliation.findMany).toHaveBeenCalledTimes(1);
  });

  it('lists Doctors using counterpart search and inverse stable ordering', async () => {
    await service.findDoctorsForHospital('company-a', 'hospital-a', {
      search: 'Muñoz cardio',
    });

    expect(hospital.findFirst).toHaveBeenCalledWith({
      where: { id: 'hospital-a', companyId: 'company-a' },
      select: { id: true },
    });
    const listArguments = firstCallArgument<{
      where: Prisma.HealthcareDoctorHospitalAffiliationWhereInput;
      orderBy: Prisma.HealthcareDoctorHospitalAffiliationOrderByWithRelationInput[];
    }>(affiliation.findMany);
    expect(listArguments.where).toMatchObject({
      companyId: 'company-a',
      hospitalId: 'hospital-a',
      AND: [
        {
          doctor: { is: { searchKey: { contains: 'munoz' } } },
        },
        {
          doctor: { is: { searchKey: { contains: 'cardio' } } },
        },
      ],
    });
    expect(listArguments.orderBy).toEqual([
      { doctor: { lastName: 'asc' } },
      { doctor: { firstName: 'asc' } },
      { id: 'asc' },
    ]);
  });

  it.each([
    ['missing Doctor', 'company-a', 'findHospitalsForDoctor'],
    ['foreign Doctor', 'company-b', 'findHospitalsForDoctor'],
    ['missing Hospital', 'company-a', 'findDoctorsForHospital'],
    ['foreign Hospital', 'company-b', 'findDoctorsForHospital'],
  ] as const)(
    'uses tenant-safe 404 when nested-list parent is %s',
    async (parent, tenantId, methodName) => {
      const isDoctor = parent.endsWith('Doctor');
      const parentModel = isDoctor ? doctor : hospital;
      parentModel.findFirst.mockResolvedValueOnce(null);

      await service[methodName](tenantId, 'parent-id', {}).catch(
        (error: unknown) => {
          expectStableCode(
            error,
            isDoctor ? 'DOCTOR_NOT_FOUND' : 'HOSPITAL_NOT_FOUND',
          );
        },
      );
      expect(affiliation.findMany).not.toHaveBeenCalled();
    },
  );
  it('rejects normalized-empty nested search before list queries', async () => {
    await expect(
      service.findHospitalsForDoctor('company-a', 'doctor-a', {
        search: '\u0301',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(affiliation.count).not.toHaveBeenCalled();
    expect(affiliation.findMany).not.toHaveBeenCalled();
  });
});

function doctorNotFoundSetup({ doctor }: SetupModels): void {
  doctor.findFirst.mockResolvedValueOnce(null);
}

function hospitalNotFoundSetup({ hospital }: SetupModels): void {
  hospital.findFirst.mockResolvedValueOnce(null);
}

function doctorInactiveSetup({ doctor }: SetupModels): void {
  doctor.findFirst.mockResolvedValueOnce({ isActive: false });
}

function hospitalInactiveSetup({ hospital }: SetupModels): void {
  hospital.findFirst.mockResolvedValueOnce({ isActive: false });
}

function omitDoctor(record: typeof affiliationRecord) {
  return {
    id: record.id,
    companyId: record.companyId,
    doctorId: record.doctorId,
    hospitalId: record.hospitalId,
    isActive: record.isActive,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    hospital: record.hospital,
  };
}
