import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { HealthcareMasterStatus } from '../common/dto/healthcare-master-list-query.dto';
import {
  affiliationAlreadyActiveException,
  affiliationEndpointInactiveException,
  affiliationInactiveException,
  affiliationNotFoundException,
  doctorInactiveException,
  doctorNotFoundException,
  healthcarePersistenceException,
  hospitalInactiveException,
  hospitalNotFoundException,
  relatedResourceChangedException,
  resourceStateChangedException,
} from '../common/healthcare-errors';
import {
  getHealthcareSearchTerms,
  normalizeHealthcareOptionalText,
} from '../common/healthcare-normalization';
import { CreateHealthcareDoctorHospitalAffiliationDto } from './dto/create-healthcare-doctor-hospital-affiliation.dto';
import { UpdateHealthcareDoctorHospitalAffiliationDto } from './dto/update-healthcare-doctor-hospital-affiliation.dto';

const affiliationCoreSelect = {
  id: true,
  companyId: true,
  doctorId: true,
  hospitalId: true,
  isActive: true,
  isPreferred: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HealthcareDoctorHospitalAffiliationSelect;

const compactDoctorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  specialty: true,
  isActive: true,
} satisfies Prisma.HealthcareDoctorSelect;

const compactHospitalSelect = {
  id: true,
  name: true,
  city: true,
  state: true,
  isActive: true,
} satisfies Prisma.HealthcareHospitalSelect;

const affiliationSelect = {
  ...affiliationCoreSelect,
  doctor: {
    select: compactDoctorSelect,
  },
  hospital: {
    select: compactHospitalSelect,
  },
} satisfies Prisma.HealthcareDoctorHospitalAffiliationSelect;

const affiliationStateSelect = {
  id: true,
  isActive: true,
  doctor: {
    select: {
      isActive: true,
    },
  },
  hospital: {
    select: {
      isActive: true,
    },
  },
} satisfies Prisma.HealthcareDoctorHospitalAffiliationSelect;

const affiliatedHospitalSelect = {
  ...affiliationCoreSelect,
  hospital: {
    select: compactHospitalSelect,
  },
} satisfies Prisma.HealthcareDoctorHospitalAffiliationSelect;

const affiliatedDoctorSelect = {
  ...affiliationCoreSelect,
  doctor: {
    select: compactDoctorSelect,
  },
} satisfies Prisma.HealthcareDoctorHospitalAffiliationSelect;

const affiliationPairUniqueFields = [
  'companyId',
  'doctorId',
  'hospitalId',
] as const;

type AffiliationRecord = Prisma.HealthcareDoctorHospitalAffiliationGetPayload<{
  select: typeof affiliationSelect;
}>;

type AffiliationStateRecord =
  Prisma.HealthcareDoctorHospitalAffiliationGetPayload<{
    select: typeof affiliationStateSelect;
  }>;

type HealthcareListQuery = {
  page?: number;
  pageSize?: number;
  status?: HealthcareMasterStatus;
  search?: string;
};

@Injectable()
export class HealthcareDoctorHospitalAffiliationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: string,
    dto: CreateHealthcareDoctorHospitalAffiliationDto,
  ): Promise<AffiliationRecord> {
    const notes = normalizeHealthcareOptionalText(dto.notes) ?? null;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.assertActiveDoctor(transaction, companyId, dto.doctorId);
        await this.assertActiveHospital(transaction, companyId, dto.hospitalId);

        const existing = await this.findPair(
          transaction,
          companyId,
          dto.doctorId,
          dto.hospitalId,
        );

        if (existing) {
          this.throwPairConflict(existing);
        }

        return transaction.healthcareDoctorHospitalAffiliation.create({
          data: {
            companyId,
            doctorId: dto.doctorId,
            hospitalId: dto.hospitalId,
            isActive: true,
            notes,
          },
          select: affiliationSelect,
        });
      });
    } catch (error) {
      if (this.isAffiliationPairUniqueViolation(error)) {
        const winner = await this.findPair(
          this.prisma,
          companyId,
          dto.doctorId,
          dto.hospitalId,
        );

        if (winner) {
          this.throwPairConflict(winner);
        }
      }

      this.rethrowWriteError(error);
    }
  }

  async update(
    companyId: string,
    affiliationId: string,
    dto: UpdateHealthcareDoctorHospitalAffiliationDto,
  ): Promise<AffiliationRecord> {
    const current = await this.findRecord(
      this.prisma,
      companyId,
      affiliationId,
    );

    if (!this.hasDefinedOwn(dto, 'notes')) {
      return current;
    }

    let result: { count: number };

    try {
      result = await this.prisma.healthcareDoctorHospitalAffiliation.updateMany(
        {
          where: {
            id: affiliationId,
            companyId,
          },
          data: {
            notes: normalizeHealthcareOptionalText(dto.notes) ?? null,
          },
        },
      );
    } catch (error) {
      this.rethrowWriteError(error);
    }

    if (result.count !== 1) {
      await this.resolveLostUpdate(companyId, affiliationId);
    }

    return this.findRecord(this.prisma, companyId, affiliationId);
  }

  deactivate(companyId: string, affiliationId: string) {
    return this.setActiveState(companyId, affiliationId, false);
  }

  reactivate(companyId: string, affiliationId: string) {
    return this.setActiveState(companyId, affiliationId, true);
  }

  async prefer(
    companyId: string,
    affiliationId: string,
  ): Promise<AffiliationRecord> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const initial = await this.findRecord(
          transaction,
          companyId,
          affiliationId,
        );

        // Serializa cambios de preferencia del mismo médico.
        await transaction.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "HealthcareDoctor"
        WHERE "id" = ${initial.doctorId}
          AND "companyId" = ${companyId}
        FOR UPDATE
      `;

        // Impide desactivar el hospital mientras se decide su preferencia.
        await transaction.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "HealthcareHospital"
        WHERE "id" = ${initial.hospitalId}
          AND "companyId" = ${companyId}
        FOR SHARE
      `;

        // Releer después de adquirir el bloqueo.
        const current = await this.findRecord(
          transaction,
          companyId,
          affiliationId,
        );

        if (!current.isActive) {
          throw affiliationInactiveException(current.id);
        }

        if (!current.doctor.isActive || !current.hospital.isActive) {
          throw affiliationEndpointInactiveException();
        }

        if (current.isPreferred) {
          return current;
        }

        await transaction.healthcareDoctorHospitalAffiliation.updateMany({
          where: {
            companyId,
            doctorId: current.doctorId,
            isPreferred: true,
          },
          data: { isPreferred: false },
        });

        const result =
          await transaction.healthcareDoctorHospitalAffiliation.updateMany({
            where: {
              id: affiliationId,
              companyId,
              doctorId: current.doctorId,
              isActive: true,
            },
            data: { isPreferred: true },
          });

        if (result.count !== 1) {
          throw resourceStateChangedException();
        }

        return this.findRecord(transaction, companyId, affiliationId);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw resourceStateChangedException();
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        this.rethrowWriteError(error);
      }

      throw error;
    }
  }

  async findHospitalsForDoctor(
    companyId: string,
    doctorId: string,
    query: HealthcareListQuery,
  ) {
    await this.assertDoctorExists(companyId, doctorId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = this.buildListWhere(
      companyId,
      query,
      { doctorId },
      'hospital',
    );
    const [totalItems, items] = await Promise.all([
      this.prisma.healthcareDoctorHospitalAffiliation.count({ where }),
      this.prisma.healthcareDoctorHospitalAffiliation.findMany({
        where,
        select: affiliatedHospitalSelect,
        orderBy: [
          { hospital: { name: 'asc' } },
          { hospital: { city: 'asc' } },
          { id: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return this.paginate(items, page, pageSize, totalItems);
  }

  async findDoctorsForHospital(
    companyId: string,
    hospitalId: string,
    query: HealthcareListQuery,
  ) {
    await this.assertHospitalExists(companyId, hospitalId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = this.buildListWhere(
      companyId,
      query,
      { hospitalId },
      'doctor',
    );
    const [totalItems, items] = await Promise.all([
      this.prisma.healthcareDoctorHospitalAffiliation.count({ where }),
      this.prisma.healthcareDoctorHospitalAffiliation.findMany({
        where,
        select: affiliatedDoctorSelect,
        orderBy: [
          { doctor: { lastName: 'asc' } },
          { doctor: { firstName: 'asc' } },
          { id: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return this.paginate(items, page, pageSize, totalItems);
  }

  private async setActiveState(
    companyId: string,
    affiliationId: string,
    targetState: boolean,
  ): Promise<AffiliationRecord> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await this.findRecord(
          transaction,
          companyId,
          affiliationId,
        );

        if (
          targetState &&
          (!current.doctor.isActive || !current.hospital.isActive)
        ) {
          throw affiliationEndpointInactiveException();
        }

        if (current.isActive === targetState) {
          return current;
        }

        const result =
          await transaction.healthcareDoctorHospitalAffiliation.updateMany({
            where: {
              id: affiliationId,
              companyId,
              isActive: !targetState,
            },
            data: {
              isActive: targetState,
              ...(!targetState ? { isPreferred: false } : {}),
            },
          });

        if (result.count === 1) {
          const updated = await this.findRecord(
            transaction,
            companyId,
            affiliationId,
          );

          if (
            targetState &&
            (!updated.doctor.isActive || !updated.hospital.isActive)
          ) {
            throw affiliationEndpointInactiveException();
          }

          return updated;
        }

        const latest = await this.findRecord(
          transaction,
          companyId,
          affiliationId,
        );

        if (latest.isActive === targetState) {
          if (
            targetState &&
            (!latest.doctor.isActive || !latest.hospital.isActive)
          ) {
            throw affiliationEndpointInactiveException();
          }

          return latest;
        }

        throw resourceStateChangedException();
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        this.rethrowWriteError(error);
      }

      throw error;
    }
  }

  private buildListWhere(
    companyId: string,
    query: HealthcareListQuery,
    parent: { doctorId: string } | { hospitalId: string },
    counterpart: 'doctor' | 'hospital',
  ): Prisma.HealthcareDoctorHospitalAffiliationWhereInput {
    const status = query.status ?? HealthcareMasterStatus.ACTIVE;
    const where: Prisma.HealthcareDoctorHospitalAffiliationWhereInput = {
      companyId,
      ...parent,
    };

    if (status === HealthcareMasterStatus.ACTIVE) {
      where.isActive = true;
      where.doctor = { is: { isActive: true } };
      where.hospital = { is: { isActive: true } };
    } else if (status === HealthcareMasterStatus.INACTIVE) {
      where.OR = [
        { isActive: false },
        { doctor: { is: { isActive: false } } },
        { hospital: { is: { isActive: false } } },
      ];
    }

    if (query.search !== undefined) {
      const terms = getHealthcareSearchTerms(query.search);

      if (terms.length === 0) {
        throw new BadRequestException(
          'search must contain at least one searchable character',
        );
      }

      where.AND = terms.map((term) => ({
        [counterpart]: {
          is: {
            searchKey: {
              contains: term,
            },
          },
        },
      }));
    }

    return where;
  }

  private findPair(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    doctorId: string,
    hospitalId: string,
  ): Promise<AffiliationStateRecord | null> {
    return client.healthcareDoctorHospitalAffiliation.findUnique({
      where: {
        companyId_doctorId_hospitalId: {
          companyId,
          doctorId,
          hospitalId,
        },
      },
      select: affiliationStateSelect,
    });
  }

  private async findRecord(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    affiliationId: string,
  ): Promise<AffiliationRecord> {
    const affiliation =
      await client.healthcareDoctorHospitalAffiliation.findFirst({
        where: {
          id: affiliationId,
          companyId,
        },
        select: affiliationSelect,
      });

    if (!affiliation) {
      throw affiliationNotFoundException();
    }

    return affiliation;
  }

  private async assertActiveDoctor(
    transaction: Prisma.TransactionClient,
    companyId: string,
    doctorId: string,
  ): Promise<void> {
    const doctor = await transaction.healthcareDoctor.findFirst({
      where: { id: doctorId, companyId },
      select: { isActive: true },
    });

    if (!doctor) {
      throw doctorNotFoundException();
    }

    if (!doctor.isActive) {
      throw doctorInactiveException();
    }
  }

  private async assertActiveHospital(
    transaction: Prisma.TransactionClient,
    companyId: string,
    hospitalId: string,
  ): Promise<void> {
    const hospital = await transaction.healthcareHospital.findFirst({
      where: { id: hospitalId, companyId },
      select: { isActive: true },
    });

    if (!hospital) {
      throw hospitalNotFoundException();
    }

    if (!hospital.isActive) {
      throw hospitalInactiveException();
    }
  }

  private async assertDoctorExists(
    companyId: string,
    doctorId: string,
  ): Promise<void> {
    const doctor = await this.prisma.healthcareDoctor.findFirst({
      where: { id: doctorId, companyId },
      select: { id: true },
    });

    if (!doctor) {
      throw doctorNotFoundException();
    }
  }

  private async assertHospitalExists(
    companyId: string,
    hospitalId: string,
  ): Promise<void> {
    const hospital = await this.prisma.healthcareHospital.findFirst({
      where: { id: hospitalId, companyId },
      select: { id: true },
    });

    if (!hospital) {
      throw hospitalNotFoundException();
    }
  }

  private async resolveLostUpdate(
    companyId: string,
    affiliationId: string,
  ): Promise<never> {
    const affiliation =
      await this.prisma.healthcareDoctorHospitalAffiliation.findFirst({
        where: { id: affiliationId, companyId },
        select: { id: true },
      });

    if (!affiliation) {
      throw affiliationNotFoundException();
    }

    throw resourceStateChangedException();
  }

  private throwPairConflict(pair: AffiliationStateRecord): never {
    if (!pair.isActive) {
      throw affiliationInactiveException(pair.id);
    }

    if (!pair.doctor.isActive || !pair.hospital.isActive) {
      throw affiliationEndpointInactiveException();
    }

    throw affiliationAlreadyActiveException(pair.id);
  }

  private isAffiliationPairUniqueViolation(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;

    return (
      Array.isArray(target) &&
      target.length === affiliationPairUniqueFields.length &&
      affiliationPairUniqueFields.every((field) => target.includes(field))
    );
  }

  private rethrowWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        throw relatedResourceChangedException();
      }

      throw healthcarePersistenceException();
    }

    throw error;
  }

  private hasDefinedOwn<T extends object, K extends keyof T>(
    object: T,
    key: K,
  ): object is T & Record<K, Exclude<T[K], undefined>> {
    return this.hasOwn(object, key) && object[key] !== undefined;
  }

  private hasOwn<T extends object>(
    object: T,
    key: PropertyKey,
  ): key is keyof T {
    return Boolean(Object.prototype.hasOwnProperty.call(object, key));
  }

  private paginate<T>(
    items: T[],
    page: number,
    pageSize: number,
    totalItems: number,
  ) {
    return {
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }
}
