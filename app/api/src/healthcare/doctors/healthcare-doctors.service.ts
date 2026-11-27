import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { HealthcareMasterStatus } from '../common/dto/healthcare-master-list-query.dto';
import {
  doctorNotFoundException,
  healthcarePersistenceException,
  relatedResourceChangedException,
  resourceStateChangedException,
} from '../common/healthcare-errors';
import {
  buildHealthcareSearchKey,
  getHealthcareSearchTerms,
  normalizeHealthcareDisplayText,
  normalizeHealthcareEmail,
  normalizeHealthcareOptionalDisplayText,
  normalizeHealthcareOptionalText,
} from '../common/healthcare-normalization';
import { CreateHealthcareDoctorDto } from './dto/create-healthcare-doctor.dto';
import { UpdateHealthcareDoctorDto } from './dto/update-healthcare-doctor.dto';

const doctorListSelect = {
  id: true,
  companyId: true,
  firstName: true,
  lastName: true,
  specialty: true,
  phone: true,
  email: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HealthcareDoctorSelect;

const doctorCandidateSelect = {
  id: true,
  firstName: true,
  lastName: true,
  specialty: true,
  phone: true,
  email: true,
  isActive: true,
} satisfies Prisma.HealthcareDoctorSelect;

const doctorDetailSelect = {
  ...doctorListSelect,
  notes: true,
  affiliations: {
    select: {
      isActive: true,
      hospital: {
        select: {
          isActive: true,
        },
      },
    },
  },
} satisfies Prisma.HealthcareDoctorSelect;

type DoctorListItem = Prisma.HealthcareDoctorGetPayload<{
  select: typeof doctorListSelect;
}>;

type DoctorCandidate = Prisma.HealthcareDoctorGetPayload<{
  select: typeof doctorCandidateSelect;
}>;

type DoctorDetailRecord = Prisma.HealthcareDoctorGetPayload<{
  select: typeof doctorDetailSelect;
}>;

type NormalizedDoctorInput = {
  firstName: string;
  lastName: string;
  specialty: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  searchKey: string;
};

export type HealthcareDoctorDetail = DoctorListItem & {
  notes: string | null;
  affiliationSummary: {
    active: number;
    total: number;
  };
};

export type HealthcareDoctorMutationResult =
  | {
      outcome: 'DUPLICATE_REVIEW_REQUIRED';
      resourceType: 'DOCTOR';
      candidates: DoctorCandidate[];
    }
  | {
      outcome: 'CREATED' | 'UPDATED';
      data: HealthcareDoctorDetail;
    };

@Injectable()
export class HealthcareDoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    query: {
      page?: number;
      pageSize?: number;
      status?: HealthcareMasterStatus;
      search?: string;
    },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const status = query.status ?? HealthcareMasterStatus.ACTIVE;
    const where: Prisma.HealthcareDoctorWhereInput = { companyId };

    if (status !== HealthcareMasterStatus.ALL) {
      where.isActive = status === HealthcareMasterStatus.ACTIVE;
    }

    if (query.search !== undefined) {
      const terms = getHealthcareSearchTerms(query.search);

      if (terms.length === 0) {
        throw new BadRequestException(
          'search must contain at least one searchable character',
        );
      }

      where.AND = terms.map((term) => ({
        searchKey: {
          contains: term,
        },
      }));
    }

    const [totalItems, items] = await Promise.all([
      this.prisma.healthcareDoctor.count({ where }),
      this.prisma.healthcareDoctor.findMany({
        where,
        select: doctorListSelect,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

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

  async findOne(
    companyId: string,
    doctorId: string,
  ): Promise<HealthcareDoctorDetail> {
    return this.mapDetail(await this.findRecord(companyId, doctorId));
  }

  async create(
    companyId: string,
    dto: CreateHealthcareDoctorDto,
  ): Promise<HealthcareDoctorMutationResult> {
    const input = this.normalizeCreateInput(dto);
    const candidates = await this.findDuplicateCandidates(
      companyId,
      input.searchKey,
    );

    if (candidates.length > 0 && dto.confirmPossibleDuplicate !== true) {
      return {
        outcome: 'DUPLICATE_REVIEW_REQUIRED',
        resourceType: 'DOCTOR',
        candidates,
      };
    }

    try {
      const doctor = await this.prisma.healthcareDoctor.create({
        data: {
          companyId,
          firstName: input.firstName,
          lastName: input.lastName,
          specialty: input.specialty,
          phone: input.phone,
          email: input.email,
          notes: input.notes,
          searchKey: input.searchKey,
        },
        select: doctorDetailSelect,
      });

      return {
        outcome: 'CREATED',
        data: this.mapDetail(doctor),
      };
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async update(
    companyId: string,
    doctorId: string,
    dto: UpdateHealthcareDoctorDto,
  ): Promise<HealthcareDoctorMutationResult> {
    const current = await this.findRecord(companyId, doctorId);
    const hasEditableField = this.hasAnyDefined(dto, [
      'firstName',
      'lastName',
      'specialty',
      'phone',
      'email',
      'notes',
    ]);

    if (!hasEditableField) {
      return {
        outcome: 'UPDATED',
        data: this.mapDetail(current),
      };
    }

    const firstName = this.hasDefinedOwn(dto, 'firstName')
      ? this.normalizeRequired(dto.firstName, 'El nombre es obligatorio')
      : current.firstName;
    const lastName = this.hasDefinedOwn(dto, 'lastName')
      ? this.normalizeRequired(dto.lastName, 'El apellido es obligatorio')
      : current.lastName;
    const specialty = this.hasDefinedOwn(dto, 'specialty')
      ? this.normalizeRequired(dto.specialty, 'La especialidad es obligatoria')
      : current.specialty;
    const identityChanged =
      firstName !== current.firstName ||
      lastName !== current.lastName ||
      specialty !== current.specialty;
    const searchKey = identityChanged
      ? buildHealthcareSearchKey([firstName, lastName, specialty])
      : undefined;

    if (searchKey !== undefined) {
      const candidates = await this.findDuplicateCandidates(
        companyId,
        searchKey,
        doctorId,
      );

      if (candidates.length > 0 && dto.confirmPossibleDuplicate !== true) {
        return {
          outcome: 'DUPLICATE_REVIEW_REQUIRED',
          resourceType: 'DOCTOR',
          candidates,
        };
      }
    }

    const data: Prisma.HealthcareDoctorUpdateManyMutationInput = {};

    if (this.hasDefinedOwn(dto, 'firstName')) {
      data.firstName = firstName;
    }
    if (this.hasDefinedOwn(dto, 'lastName')) {
      data.lastName = lastName;
    }
    if (this.hasDefinedOwn(dto, 'specialty')) {
      data.specialty = specialty;
    }
    if (this.hasDefinedOwn(dto, 'phone')) {
      data.phone = normalizeHealthcareOptionalDisplayText(dto.phone) ?? null;
    }
    if (this.hasDefinedOwn(dto, 'email')) {
      data.email = normalizeHealthcareEmail(dto.email) ?? null;
    }
    if (this.hasDefinedOwn(dto, 'notes')) {
      data.notes = normalizeHealthcareOptionalText(dto.notes) ?? null;
    }
    if (searchKey !== undefined) {
      data.searchKey = searchKey;
    }

    let updateResult: { count: number };

    try {
      updateResult = await this.prisma.healthcareDoctor.updateMany({
        where: {
          id: doctorId,
          companyId,
        },
        data,
      });
    } catch (error) {
      this.rethrowWriteError(error);
    }

    if (updateResult.count !== 1) {
      await this.resolveLostUpdate(companyId, doctorId);
    }

    return {
      outcome: 'UPDATED',
      data: this.mapDetail(await this.findRecord(companyId, doctorId)),
    };
  }

  deactivate(companyId: string, doctorId: string) {
    return this.setActiveState(companyId, doctorId, false);
  }

  reactivate(companyId: string, doctorId: string) {
    return this.setActiveState(companyId, doctorId, true);
  }

  private async setActiveState(
    companyId: string,
    doctorId: string,
    targetState: boolean,
  ): Promise<HealthcareDoctorDetail> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const current = await this.findRecord(
            companyId,
            doctorId,
            transaction,
          );

          if (current.isActive === targetState) {
            return this.mapDetail(current);
          }

          // Lock the parent before touching affiliations, matching prefer() lock order.
          const result = await transaction.healthcareDoctor.updateMany({
            where: { id: doctorId, companyId, isActive: !targetState },
            data: { isActive: targetState },
          });

          if (result.count === 1 && !targetState) {
            await transaction.healthcareDoctorHospitalAffiliation.updateMany({
              where: { companyId, doctorId, isPreferred: true },
              data: { isPreferred: false },
            });
          }

          const latest = await this.findRecord(
            companyId,
            doctorId,
            transaction,
          );
          if (result.count === 1 || latest.isActive === targetState) {
            return this.mapDetail(latest);
          }

          throw resourceStateChangedException();
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  private normalizeCreateInput(
    dto: CreateHealthcareDoctorDto,
  ): NormalizedDoctorInput {
    const firstName = this.normalizeRequired(
      dto.firstName,
      'El nombre es obligatorio',
    );
    const lastName = this.normalizeRequired(
      dto.lastName,
      'El apellido es obligatorio',
    );
    const specialty = this.normalizeRequired(
      dto.specialty,
      'La especialidad es obligatoria',
    );

    return {
      firstName,
      lastName,
      specialty,
      phone: normalizeHealthcareOptionalDisplayText(dto.phone) ?? null,
      email: normalizeHealthcareEmail(dto.email) ?? null,
      notes: normalizeHealthcareOptionalText(dto.notes) ?? null,
      searchKey: buildHealthcareSearchKey([firstName, lastName, specialty]),
    };
  }

  private normalizeRequired(value: unknown, message: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(message);
    }

    const normalized = normalizeHealthcareDisplayText(value);

    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private findDuplicateCandidates(
    companyId: string,
    searchKey: string,
    excludeDoctorId?: string,
  ) {
    return this.prisma.healthcareDoctor.findMany({
      where: {
        companyId,
        searchKey,
        ...(excludeDoctorId
          ? {
              NOT: {
                id: excludeDoctorId,
              },
            }
          : {}),
      },
      select: doctorCandidateSelect,
      orderBy: [{ isActive: 'desc' }, { id: 'asc' }],
    });
  }

  private async findRecord(
    companyId: string,
    doctorId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<DoctorDetailRecord> {
    const doctor = await client.healthcareDoctor.findFirst({
      where: {
        id: doctorId,
        companyId,
      },
      select: doctorDetailSelect,
    });

    if (!doctor) {
      throw doctorNotFoundException();
    }

    return doctor;
  }

  private async resolveLostUpdate(
    companyId: string,
    doctorId: string,
  ): Promise<never> {
    const doctor = await this.prisma.healthcareDoctor.findFirst({
      where: {
        id: doctorId,
        companyId,
      },
      select: {
        id: true,
      },
    });

    if (!doctor) {
      throw doctorNotFoundException();
    }

    throw resourceStateChangedException();
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

  private hasOwn<T extends object>(
    object: T,
    key: PropertyKey,
  ): key is keyof T {
    return Boolean(Object.prototype.hasOwnProperty.call(object, key));
  }

  private hasDefinedOwn<T extends object, K extends keyof T>(
    object: T,
    key: K,
  ): object is T & Record<K, Exclude<T[K], undefined>> {
    return this.hasOwn(object, key) && object[key] !== undefined;
  }

  private hasAnyDefined<T extends object>(
    object: T,
    keys: (keyof T)[],
  ): boolean {
    return keys.some((key) => this.hasDefinedOwn(object, key));
  }

  private mapDetail(doctor: DoctorDetailRecord): HealthcareDoctorDetail {
    const { affiliations, ...data } = doctor;

    return {
      ...data,
      affiliationSummary: {
        active: doctor.isActive
          ? affiliations.filter(
              (affiliation) =>
                affiliation.isActive && affiliation.hospital.isActive,
            ).length
          : 0,
        total: affiliations.length,
      },
    };
  }
}
