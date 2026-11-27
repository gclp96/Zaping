import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';

import { HealthcareDoctorHospitalAffiliationsController } from './healthcare-doctor-hospital-affiliations.controller';

const companyId = '11111111-1111-4111-8111-111111111111';
const doctorId = '22222222-2222-4222-8222-222222222222';
const hospitalId = '33333333-3333-4333-8333-333333333333';
const affiliationId = '44444444-4444-4444-8444-444444444444';
const request = {
  user: {
    id: '55555555-5555-4555-8555-555555555555',
    companyId,
  },
};

describe('HealthcareDoctorHospitalAffiliationsController', () => {
  const service = {
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    reactivate: jest.fn(),
    prefer: jest.fn(),
  };
  const controller = new HealthcareDoctorHospitalAffiliationsController(
    service as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers only the canonical affiliation mutation resource', () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        HealthcareDoctorHospitalAffiliationsController,
      ),
    ).toBe('healthcare/doctor-hospital-affiliations');
  });

  it('creates using authenticated companyId and endpoint UUIDs', async () => {
    const dto = { doctorId, hospitalId, notes: 'Guardia' };
    service.create.mockResolvedValue({ id: affiliationId });

    await controller.create(
      request as Parameters<
        HealthcareDoctorHospitalAffiliationsController['create']
      >[0],
      dto,
    );

    expect(service.create).toHaveBeenCalledWith(companyId, dto);
  });

  it('returns HTTP 201 from a successful create', () => {
    const handler = Object.getOwnPropertyDescriptor(
      HealthcareDoctorHospitalAffiliationsController.prototype,
      'create',
    )?.value as object;

    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.CREATED,
    );
  });

  it.each([
    ['update', { notes: null }],
    ['deactivate', undefined],
    ['reactivate', undefined],
  ] as const)(
    'passes authenticated tenant and affiliation ID through %s',
    async (methodName, dto) => {
      service[methodName].mockResolvedValue({ id: affiliationId });

      if (methodName === 'update') {
        await controller.update(
          request as Parameters<
            HealthcareDoctorHospitalAffiliationsController['update']
          >[0],
          affiliationId,
          dto,
        );
        expect(service.update).toHaveBeenCalledWith(
          companyId,
          affiliationId,
          dto,
        );
        return;
      }

      await controller[methodName](request as never, affiliationId);
      expect(service[methodName]).toHaveBeenCalledWith(
        companyId,
        affiliationId,
      );
    },
  );

  it.each(['update', 'deactivate', 'reactivate'] as const)(
    'validates %s affiliationId with ParseUUIDPipe',
    (methodName) => {
      const metadata = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        HealthcareDoctorHospitalAffiliationsController,
        methodName,
      ) as Record<string, { data?: string; pipes?: unknown[] }>;
      const idParam = Object.values(metadata).find(
        (value) => value.data === 'affiliationId',
      );

      expect(idParam?.pipes).toContain(ParseUUIDPipe);
    },
  );

  it.each(['deactivate', 'reactivate'] as const)(
    'returns HTTP 200 from the idempotent %s command',
    (methodName) => {
      const handler = Object.getOwnPropertyDescriptor(
        HealthcareDoctorHospitalAffiliationsController.prototype,
        methodName,
      )?.value as object;

      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
        HttpStatus.OK,
      );
    },
  );

  it('restricts prefer to ADMIN and MANAGER', () => {
    const handler = Object.getOwnPropertyDescriptor(
      HealthcareDoctorHospitalAffiliationsController.prototype,
      'prefer',
    )?.value as object;

    expect(Reflect.getMetadata('roles', handler)).toEqual(['ADMIN', 'MANAGER']);
  });
});
