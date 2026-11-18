import { NotFoundException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthcareCaseStatus, UserRole } from '@prisma/client';

import {
  CreateHealthcareCaseInput,
  HealthcareCaseResponse,
  HealthcareCaseService,
} from './healthcare-case.service';
import { HealthcareCasesController } from './healthcare-cases.controller';

describe('HealthcareCasesController', () => {
  let controller: HealthcareCasesController;

  const companyId = '699baaae-2718-4d96-8683-8a2cf12bfe55';
  const userId = 'f6c503b4-82db-4e21-b2ce-f7cc9e13f021';
  const caseId = 'cca93237-878a-4467-ae17-b2514dff6819';

  const healthcareCaseServiceMock = {
    create: jest.fn<
      Promise<HealthcareCaseResponse>,
      [string, string, CreateHealthcareCaseInput]
    >(),
    update: jest.fn<
      Promise<HealthcareCaseResponse>,
      [string, string, unknown]
    >(),
    cancel: jest.fn<
      Promise<HealthcareCaseResponse>,
      [string, string, string, string]
    >(),
    findAll: jest.fn<Promise<HealthcareCaseResponse[]>, [string]>(),
    findUpcoming: jest.fn(),
    findOne: jest.fn<Promise<HealthcareCaseResponse>, [string, string]>(),
  };

  const request = {
    user: {
      id: userId,
      companyId,
      email: 'admin@insap.com',
      firstName: 'Admin',
      lastName: 'INSAP',
      role: UserRole.ADMIN,
    },
  };

  const healthcareCase: HealthcareCaseResponse = {
    id: caseId,
    companyId,
    doctorId: null,
    hospitalId: null,
    folio: 'CASE-000001',
    title: 'Cirugía programada',
    procedureDescription: null,
    status: HealthcareCaseStatus.DRAFT,
    scheduledStart: null,
    scheduledEnd: null,
    responsibleUserId: null,
    createdById: userId,
    cancelledAt: null,
    cancelledById: null,
    cancellationReason: null,
    createdAt: new Date('2026-08-24T10:00:00.000Z'),
    updatedAt: new Date('2026-08-24T10:00:00.000Z'),
    doctor: null,
    hospital: null,
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthcareCasesController],
      providers: [
        {
          provide: HealthcareCaseService,
          useValue: healthcareCaseServiceMock,
        },
      ],
    }).compile();

    controller = moduleRef.get<HealthcareCasesController>(
      HealthcareCasesController,
    );
  });

  const getRolesMetadata = (
    methodName: keyof HealthcareCasesController,
  ): UserRole[] | undefined => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HealthcareCasesController.prototype,
      methodName,
    );

    if (!descriptor?.value) {
      return undefined;
    }

    const method = descriptor.value as object;

    return Reflect.getMetadata('roles', method) as UserRole[] | undefined;
  };

  it('should use the healthcare/cases controller path', () => {
    expect(Reflect.getMetadata(PATH_METADATA, HealthcareCasesController)).toBe(
      'healthcare/cases',
    );
  });

  it('should create using the authenticated companyId', async () => {
    healthcareCaseServiceMock.create.mockResolvedValue(healthcareCase);

    await controller.create(request, {
      title: 'Cirugía programada',
    });

    expect(healthcareCaseServiceMock.create).toHaveBeenCalledWith(
      companyId,
      userId,
      expect.any(Object),
    );
  });

  it('should create using the authenticated user id as createdById', async () => {
    healthcareCaseServiceMock.create.mockResolvedValue(healthcareCase);

    await controller.create(request, {
      title: 'Cirugía programada',
    });

    expect(healthcareCaseServiceMock.create).toHaveBeenCalledWith(
      companyId,
      userId,
      expect.any(Object),
    );
  });

  it('should pass only approved mapped fields to create', async () => {
    healthcareCaseServiceMock.create.mockResolvedValue(healthcareCase);

    await controller.create(request, {
      title: 'Cirugía programada',
      procedureDescription: 'Preparación operacional',
      scheduledStart: '2026-09-01T10:00:00.000Z',
      scheduledEnd: '2026-09-01T11:00:00.000Z',
      responsibleUserId: '953a950f-b33a-4ff5-85ac-4ff35b8f3017',
      doctorId: 'c29155e1-cd97-4dda-b938-b6a73c0f86f6',
      hospitalId: 'e227970f-8327-40fb-aa73-a802c9fc8096',
      companyId: 'client-company-id',
      createdById: 'client-user-id',
      status: HealthcareCaseStatus.CANCELLED,
      doctor: { id: 'nested-doctor' },
      hospital: { id: 'nested-hospital' },
      affiliationId: 'client-affiliation-id',
    } as never);

    expect(healthcareCaseServiceMock.create).toHaveBeenCalledWith(
      companyId,
      userId,
      {
        title: 'Cirugía programada',
        procedureDescription: 'Preparación operacional',
        scheduledStart: new Date('2026-09-01T10:00:00.000Z'),
        scheduledEnd: new Date('2026-09-01T11:00:00.000Z'),
        responsibleUserId: '953a950f-b33a-4ff5-85ac-4ff35b8f3017',
        doctorId: 'c29155e1-cd97-4dda-b938-b6a73c0f86f6',
        hospitalId: 'e227970f-8327-40fb-aa73-a802c9fc8096',
      },
    );
  });

  it('should map scheduledStart ISO input to Date', async () => {
    healthcareCaseServiceMock.create.mockResolvedValue(healthcareCase);

    await controller.create(request, {
      title: 'Cirugía programada',
      scheduledStart: '2026-09-01T10:00:00.000Z',
    });

    expect(healthcareCaseServiceMock.create).toHaveBeenCalledWith(
      companyId,
      userId,
      expect.objectContaining({
        scheduledStart: new Date('2026-09-01T10:00:00.000Z'),
      }),
    );
  });

  it('should map scheduledEnd ISO input to Date when present', async () => {
    healthcareCaseServiceMock.create.mockResolvedValue(healthcareCase);

    await controller.create(request, {
      title: 'Cirugía programada',
      scheduledStart: '2026-09-01T10:00:00.000Z',
      scheduledEnd: '2026-09-01T11:00:00.000Z',
    });

    expect(healthcareCaseServiceMock.create).toHaveBeenCalledWith(
      companyId,
      userId,
      expect.objectContaining({
        scheduledEnd: new Date('2026-09-01T11:00:00.000Z'),
      }),
    );
  });

  it('should return create service result unchanged', async () => {
    healthcareCaseServiceMock.create.mockResolvedValue(healthcareCase);

    const result = await controller.create(request, {
      title: 'Cirugía programada',
    });

    expect(result).toBe(healthcareCase);
  });

  it('should propagate create service errors', async () => {
    const error = new Error('create failed');
    healthcareCaseServiceMock.create.mockRejectedValue(error);

    await expect(
      controller.create(request, {
        title: 'Cirugía programada',
      }),
    ).rejects.toBe(error);
  });

  it('should findAll using the authenticated companyId', async () => {
    healthcareCaseServiceMock.findAll.mockResolvedValue([healthcareCase]);

    await controller.findAll(request);

    expect(healthcareCaseServiceMock.findAll).toHaveBeenCalledWith(companyId);
  });

  it('should return findAll result unchanged', async () => {
    const cases = [healthcareCase];
    healthcareCaseServiceMock.findAll.mockResolvedValue(cases);

    const result = await controller.findAll(request);

    expect(result).toBe(cases);
  });

  it('reads the upcoming agenda only for the authenticated company', async () => {
    healthcareCaseServiceMock.findUpcoming.mockResolvedValue([]);

    const response = await controller.findUpcoming(request);

    expect(response).toEqual([]);
    expect(healthcareCaseServiceMock.findUpcoming).toHaveBeenCalledWith(
      companyId,
    );
    expect(getRolesMetadata('findUpcoming')).toEqual([
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.SALES,
      UserRole.WAREHOUSE,
    ]);
  });

  it('should findOne using companyId and caseId', async () => {
    healthcareCaseServiceMock.findOne.mockResolvedValue(healthcareCase);

    await controller.findOne(request, caseId);

    expect(healthcareCaseServiceMock.findOne).toHaveBeenCalledWith(
      companyId,
      caseId,
    );
  });

  it('should return findOne result unchanged', async () => {
    healthcareCaseServiceMock.findOne.mockResolvedValue(healthcareCase);

    const result = await controller.findOne(request, caseId);

    expect(result).toBe(healthcareCase);
  });

  it('should propagate findOne NotFound errors', async () => {
    const error = new NotFoundException('Caso no encontrado');
    healthcareCaseServiceMock.findOne.mockRejectedValue(error);

    await expect(controller.findOne(request, caseId)).rejects.toBe(error);
  });

  it('should update using authenticated companyId and caseId', async () => {
    healthcareCaseServiceMock.update.mockResolvedValue(healthcareCase);

    await controller.update(request, caseId, {
      title: 'Caso actualizado',
    });

    expect(healthcareCaseServiceMock.update).toHaveBeenCalledWith(
      companyId,
      caseId,
      expect.any(Object),
    );
  });

  it('should map update Date and null values before delegating', async () => {
    healthcareCaseServiceMock.update.mockResolvedValue(healthcareCase);

    await controller.update(request, caseId, {
      title: 'Caso actualizado',
      procedureDescription: null,
      scheduledStart: '2026-09-01T10:00:00.000Z',
      scheduledEnd: null,
      responsibleUserId: null,
      doctorId: null,
      hospitalId: null,
    });

    expect(healthcareCaseServiceMock.update).toHaveBeenCalledWith(
      companyId,
      caseId,
      {
        title: 'Caso actualizado',
        procedureDescription: null,
        scheduledStart: new Date('2026-09-01T10:00:00.000Z'),
        scheduledEnd: null,
        responsibleUserId: null,
        doctorId: null,
        hospitalId: null,
      },
    );
  });

  it('should preserve omitted update fields instead of converting them to null', async () => {
    healthcareCaseServiceMock.update.mockResolvedValue(healthcareCase);

    await controller.update(request, caseId, {
      title: 'Caso actualizado',
    });

    expect(healthcareCaseServiceMock.update).toHaveBeenCalledWith(
      companyId,
      caseId,
      {
        title: 'Caso actualizado',
      },
    );
  });

  it('should preserve explicit null separately from omitted relationship fields', async () => {
    healthcareCaseServiceMock.update.mockResolvedValue(healthcareCase);

    await controller.update(request, caseId, {
      doctorId: null,
    });

    expect(healthcareCaseServiceMock.update).toHaveBeenCalledWith(
      companyId,
      caseId,
      {
        doctorId: null,
      },
    );
    expect(
      healthcareCaseServiceMock.update.mock.calls[0][2],
    ).not.toHaveProperty('hospitalId');
  });

  it('should treat undefined relationship fields as omitted', async () => {
    healthcareCaseServiceMock.update.mockResolvedValue(healthcareCase);

    await controller.update(request, caseId, {
      doctorId: undefined,
      hospitalId: undefined,
    });

    expect(healthcareCaseServiceMock.update).toHaveBeenCalledWith(
      companyId,
      caseId,
      {},
    );
  });

  it('should map Doctor and Hospital UUID replacements unchanged', async () => {
    healthcareCaseServiceMock.update.mockResolvedValue(healthcareCase);
    const doctorId = 'c29155e1-cd97-4dda-b938-b6a73c0f86f6';
    const hospitalId = 'e227970f-8327-40fb-aa73-a802c9fc8096';

    await controller.update(request, caseId, { doctorId, hospitalId });

    expect(healthcareCaseServiceMock.update).toHaveBeenCalledWith(
      companyId,
      caseId,
      { doctorId, hospitalId },
    );
  });

  it('should return update service result unchanged', async () => {
    healthcareCaseServiceMock.update.mockResolvedValue(healthcareCase);

    const result = await controller.update(request, caseId, {
      title: 'Caso actualizado',
    });

    expect(result).toBe(healthcareCase);
  });

  it('should propagate update service errors', async () => {
    const error = new Error('update failed');
    healthcareCaseServiceMock.update.mockRejectedValue(error);

    await expect(
      controller.update(request, caseId, {
        title: 'Caso actualizado',
      }),
    ).rejects.toBe(error);
  });

  it('should cancel using companyId, caseId, and authenticated user id', async () => {
    healthcareCaseServiceMock.cancel.mockResolvedValue({
      ...healthcareCase,
      status: HealthcareCaseStatus.CANCELLED,
    });

    await controller.cancel(request, caseId, {
      cancellationReason: 'Cancelación operacional',
    });

    expect(healthcareCaseServiceMock.cancel).toHaveBeenCalledWith(
      companyId,
      caseId,
      userId,
      'Cancelación operacional',
    );
  });

  it('should return cancel service result unchanged', async () => {
    const cancelledCase = {
      ...healthcareCase,
      status: HealthcareCaseStatus.CANCELLED,
    };

    healthcareCaseServiceMock.cancel.mockResolvedValue(cancelledCase);

    const result = await controller.cancel(request, caseId, {
      cancellationReason: 'Cancelación operacional',
    });

    expect(result).toBe(cancelledCase);
  });

  it('should propagate cancel service errors', async () => {
    const error = new Error('cancel failed');
    healthcareCaseServiceMock.cancel.mockRejectedValue(error);

    await expect(
      controller.cancel(request, caseId, {
        cancellationReason: 'Cancelación operacional',
      }),
    ).rejects.toBe(error);
  });

  it('should not pass client companyId, createdById, or status to service input', async () => {
    healthcareCaseServiceMock.create.mockResolvedValue(healthcareCase);

    await controller.create(request, {
      title: 'Cirugía programada',
      companyId: 'client-company-id',
      createdById: 'client-user-id',
      status: HealthcareCaseStatus.CANCELLED,
      doctor: { id: 'nested-doctor' },
      hospital: { id: 'nested-hospital' },
      affiliationId: 'client-affiliation-id',
    } as never);

    const createInput = healthcareCaseServiceMock.create.mock.calls[0][2];

    expect(createInput).not.toHaveProperty('companyId');
    expect(createInput).not.toHaveProperty('createdById');
    expect(createInput).not.toHaveProperty('status');
    expect(createInput).not.toHaveProperty('doctor');
    expect(createInput).not.toHaveProperty('hospital');
    expect(createInput).not.toHaveProperty('affiliationId');
  });

  it('should allow ADMIN, MANAGER, and SALES to create cases', () => {
    expect(getRolesMetadata('create')).toEqual([
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.SALES,
    ]);
  });

  it('should allow ADMIN, MANAGER, SALES, and WAREHOUSE to list cases', () => {
    expect(getRolesMetadata('findAll')).toEqual([
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.SALES,
      UserRole.WAREHOUSE,
    ]);
  });

  it('should allow ADMIN, MANAGER, SALES, and WAREHOUSE to read one case', () => {
    expect(getRolesMetadata('findOne')).toEqual([
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.SALES,
      UserRole.WAREHOUSE,
    ]);
  });

  it('should allow ADMIN, MANAGER, and SALES to update cases', () => {
    expect(getRolesMetadata('update')).toEqual([
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.SALES,
    ]);
  });

  it('should allow ADMIN and MANAGER to cancel cases', () => {
    expect(getRolesMetadata('cancel')).toEqual([
      UserRole.ADMIN,
      UserRole.MANAGER,
    ]);
  });
});
