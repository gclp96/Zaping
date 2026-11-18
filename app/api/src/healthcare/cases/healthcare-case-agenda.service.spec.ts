import { HealthcareCaseStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { HealthcareEquipmentAssignmentsService } from '../equipment-assignments/healthcare-equipment-assignments.service';

import { HealthcareCaseFolioService } from './healthcare-case-folio.service';
import { HealthcareCaseService } from './healthcare-case.service';

describe('HealthcareCaseService upcoming agenda', () => {
  const now = new Date('2026-11-18T12:00:00.000Z');
  const findMany = jest.fn();
  const service = new HealthcareCaseService(
    { healthcareCase: { findMany } } as unknown as PrismaService,
    {} as HealthcareCaseFolioService,
    {} as HealthcareEquipmentAssignmentsService,
    {} as never,
  );

  beforeEach(() => {
    findMany.mockReset();
  });

  it('limits the query to five scheduled future cases from one company', async () => {
    findMany.mockResolvedValue([]);

    await expect(service.findUpcoming('company-a', now)).resolves.toEqual([]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-a',
        status: HealthcareCaseStatus.SCHEDULED,
        scheduledStart: {
          gte: now,
          lt: new Date('2026-11-25T12:00:00.000Z'),
        },
      },
      select: {
        id: true,
        folio: true,
        title: true,
        scheduledStart: true,
        scheduledEnd: true,
        healthcareHospital: { select: { name: true } },
      },
      orderBy: [{ scheduledStart: 'asc' }, { id: 'asc' }],
      take: 5,
    });
  });

  it('maps minimal agenda fields and safely handles missing optional relations', async () => {
    findMany.mockResolvedValue([
      {
        id: 'case-1',
        folio: 'HC-000001',
        title: 'Cirugía programada',
        scheduledStart: new Date('2026-11-19T18:30:00.000Z'),
        scheduledEnd: new Date('2026-11-19T20:30:00.000Z'),
        healthcareHospital: { name: 'Hospital de prueba' },
      },
      {
        id: 'case-2',
        folio: 'HC-000002',
        title: 'Procedimiento programado',
        scheduledStart: new Date('2026-11-20T18:30:00.000Z'),
        scheduledEnd: null,
        healthcareHospital: null,
      },
    ]);

    await expect(service.findUpcoming('company-a', now)).resolves.toEqual([
      {
        id: 'case-1',
        folio: 'HC-000001',
        title: 'Cirugía programada',
        scheduledStart: '2026-11-19T18:30:00.000Z',
        scheduledEnd: '2026-11-19T20:30:00.000Z',
        hospitalName: 'Hospital de prueba',
      },
      {
        id: 'case-2',
        folio: 'HC-000002',
        title: 'Procedimiento programado',
        scheduledStart: '2026-11-20T18:30:00.000Z',
        scheduledEnd: null,
        hospitalName: null,
      },
    ]);
  });

  it('does not expose a record without a start date, even if the DB mock violates filters', async () => {
    findMany.mockResolvedValue([
      {
        id: 'incomplete',
        folio: 'HC-000003',
        title: 'No programado',
        scheduledStart: null,
        scheduledEnd: null,
        healthcareHospital: null,
      },
    ]);

    await expect(service.findUpcoming('company-a', now)).resolves.toEqual([]);
  });
});
