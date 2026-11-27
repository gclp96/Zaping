import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { HealthcareMasterStatus } from '../common/dto/healthcare-master-list-query.dto';
import {
  healthcarePersistenceException,
  hospitalNotFoundException,
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
import { CreateHealthcareHospitalDto } from './dto/create-healthcare-hospital.dto';
import { HealthcareHospitalListQueryDto } from './dto/healthcare-hospital-list-query.dto';
import { UpdateHealthcareHospitalDto } from './dto/update-healthcare-hospital.dto';

const hospitalListSelect = {
  id: true,
  companyId: true,
  name: true,
  city: true,
  state: true,
  address: true,
  phone: true,
  email: true,
  contactName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HealthcareHospitalSelect;

const hospitalCandidateSelect = {
  id: true,
  name: true,
  city: true,
  state: true,
  address: true,
  isActive: true,
} satisfies Prisma.HealthcareHospitalSelect;

const hospitalDetailSelect = {
  ...hospitalListSelect,
  notes: true,
  affiliations: {
    select: {
      isActive: true,
      doctor: {
        select: {
          isActive: true,
        },
      },
    },
  },
} satisfies Prisma.HealthcareHospitalSelect;

type HospitalListItem = Prisma.HealthcareHospitalGetPayload<{
  select: typeof hospitalListSelect;
}>;

type HospitalCandidate = Prisma.HealthcareHospitalGetPayload<{
  select: typeof hospitalCandidateSelect;
}>;

type HospitalDetailRecord = Prisma.HealthcareHospitalGetPayload<{
  select: typeof hospitalDetailSelect;
}>;

type NormalizedHospitalInput = {
  name: string;
  city: string;
  state: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  notes: string | null;
  searchKey: string;
};

export type HealthcareHospitalDetail = HospitalListItem & {
  notes: string | null;
  affiliationSummary: {
    active: number;
    total: number;
  };
};

export type HealthcareHospitalMutationResult =
  | {
      outcome: 'DUPLICATE_REVIEW_REQUIRED';
      resourceType: 'HOSPITAL';
      candidates: HospitalCandidate[];
    }
  | {
      outcome: 'CREATED' | 'UPDATED';
      data: HealthcareHospitalDetail;
    };

@Injectable()
export class HealthcareHospitalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: HealthcareHospitalListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const status = query.status ?? HealthcareMasterStatus.ACTIVE;
    const where: Prisma.HealthcareHospitalWhereInput = { companyId };

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

    if (query.city !== undefined) {
      where.city = {
        equals: normalizeHealthcareDisplayText(query.city),
        mode: 'insensitive',
      };
    }

    if (query.state !== undefined) {
      where.state = {
        equals: normalizeHealthcareDisplayText(query.state),
        mode: 'insensitive',
      };
    }

    const [totalItems, items] = await Promise.all([
      this.prisma.healthcareHospital.count({ where }),
      this.prisma.healthcareHospital.findMany({
        where,
        select: hospitalListSelect,
        orderBy: [{ name: 'asc' }, { city: 'asc' }, { id: 'asc' }],
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
    hospitalId: string,
  ): Promise<HealthcareHospitalDetail> {
    return this.mapDetail(await this.findRecord(companyId, hospitalId));
  }

  async create(
    companyId: string,
    dto: CreateHealthcareHospitalDto,
  ): Promise<HealthcareHospitalMutationResult> {
    const input = this.normalizeCreateInput(dto);
    const candidates = await this.findDuplicateCandidates(
      companyId,
      input.searchKey,
    );

    if (candidates.length > 0 && dto.confirmPossibleDuplicate !== true) {
      return {
        outcome: 'DUPLICATE_REVIEW_REQUIRED',
        resourceType: 'HOSPITAL',
        candidates,
      };
    }

    try {
      const hospital = await this.prisma.healthcareHospital.create({
        data: {
          companyId,
          name: input.name,
          city: input.city,
          state: input.state,
          address: input.address,
          phone: input.phone,
          email: input.email,
          contactName: input.contactName,
          notes: input.notes,
          searchKey: input.searchKey,
        },
        select: hospitalDetailSelect,
      });

      return {
        outcome: 'CREATED',
        data: this.mapDetail(hospital),
      };
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async update(
    companyId: string,
    hospitalId: string,
    dto: UpdateHealthcareHospitalDto,
  ): Promise<HealthcareHospitalMutationResult> {
    const current = await this.findRecord(companyId, hospitalId);
    const hasEditableField = this.hasAnyDefined(dto, [
      'name',
      'city',
      'state',
      'address',
      'phone',
      'email',
      'contactName',
      'notes',
    ]);

    if (!hasEditableField) {
      return {
        outcome: 'UPDATED',
        data: this.mapDetail(current),
      };
    }

    const name = this.hasDefinedOwn(dto, 'name')
      ? this.normalizeRequired(dto.name, 'El nombre es obligatorio')
      : current.name;
    const city = this.hasDefinedOwn(dto, 'city')
      ? this.normalizeRequired(dto.city, 'La ciudad es obligatoria')
      : current.city;
    const state = this.hasDefinedOwn(dto, 'state')
      ? this.normalizeRequired(dto.state, 'El estado es obligatorio')
      : current.state;
    const identityChanged =
      name !== current.name || city !== current.city || state !== current.state;
    const searchKey = identityChanged
      ? buildHealthcareSearchKey([name, city, state])
      : undefined;

    if (searchKey !== undefined) {
      const candidates = await this.findDuplicateCandidates(
        companyId,
        searchKey,
        hospitalId,
      );

      if (candidates.length > 0 && dto.confirmPossibleDuplicate !== true) {
        return {
          outcome: 'DUPLICATE_REVIEW_REQUIRED',
          resourceType: 'HOSPITAL',
          candidates,
        };
      }
    }

    const data: Prisma.HealthcareHospitalUpdateManyMutationInput = {};

    if (this.hasDefinedOwn(dto, 'name')) {
      data.name = name;
    }
    if (this.hasDefinedOwn(dto, 'city')) {
      data.city = city;
    }
    if (this.hasDefinedOwn(dto, 'state')) {
      data.state = state;
    }
    if (this.hasDefinedOwn(dto, 'address')) {
      data.address = normalizeHealthcareOptionalText(dto.address) ?? null;
    }
    if (this.hasDefinedOwn(dto, 'phone')) {
      data.phone = normalizeHealthcareOptionalDisplayText(dto.phone) ?? null;
    }
    if (this.hasDefinedOwn(dto, 'email')) {
      data.email = normalizeHealthcareEmail(dto.email) ?? null;
    }
    if (this.hasDefinedOwn(dto, 'contactName')) {
      data.contactName =
        normalizeHealthcareOptionalDisplayText(dto.contactName) ?? null;
    }
    if (this.hasDefinedOwn(dto, 'notes')) {
      data.notes = normalizeHealthcareOptionalText(dto.notes) ?? null;
    }
    if (searchKey !== undefined) {
      data.searchKey = searchKey;
    }

    let updateResult: { count: number };

    try {
      updateResult = await this.prisma.healthcareHospital.updateMany({
        where: {
          id: hospitalId,
          companyId,
        },
        data,
      });
    } catch (error) {
      this.rethrowWriteError(error);
    }

    if (updateResult.count !== 1) {
      await this.resolveLostUpdate(companyId, hospitalId);
    }

    return {
      outcome: 'UPDATED',
      data: this.mapDetail(await this.findRecord(companyId, hospitalId)),
    };
  }

  deactivate(companyId: string, hospitalId: string) {
    return this.setActiveState(companyId, hospitalId, false);
  }

  reactivate(companyId: string, hospitalId: string) {
    return this.setActiveState(companyId, hospitalId, true);
  }

  private async setActiveState(
    companyId: string,
    hospitalId: string,
    targetState: boolean,
  ): Promise<HealthcareHospitalDetail> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const current = await this.findRecord(
            companyId,
            hospitalId,
            transaction,
          );

          if (current.isActive === targetState) {
            return this.mapDetail(current);
          }

          // Lock the parent before touching affiliations, matching prefer() lock order.
          const result = await transaction.healthcareHospital.updateMany({
            where: { id: hospitalId, companyId, isActive: !targetState },
            data: { isActive: targetState },
          });

          if (result.count === 1 && !targetState) {
            await transaction.healthcareDoctorHospitalAffiliation.updateMany({
              where: { companyId, hospitalId, isPreferred: true },
              data: { isPreferred: false },
            });
          }

          const latest = await this.findRecord(
            companyId,
            hospitalId,
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
    dto: CreateHealthcareHospitalDto,
  ): NormalizedHospitalInput {
    const name = this.normalizeRequired(dto.name, 'El nombre es obligatorio');
    const city = this.normalizeRequired(dto.city, 'La ciudad es obligatoria');
    const state = this.normalizeRequired(dto.state, 'El estado es obligatorio');

    return {
      name,
      city,
      state,
      address: normalizeHealthcareOptionalText(dto.address) ?? null,
      phone: normalizeHealthcareOptionalDisplayText(dto.phone) ?? null,
      email: normalizeHealthcareEmail(dto.email) ?? null,
      contactName:
        normalizeHealthcareOptionalDisplayText(dto.contactName) ?? null,
      notes: normalizeHealthcareOptionalText(dto.notes) ?? null,
      searchKey: buildHealthcareSearchKey([name, city, state]),
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
    excludeHospitalId?: string,
  ) {
    return this.prisma.healthcareHospital.findMany({
      where: {
        companyId,
        searchKey,
        ...(excludeHospitalId
          ? {
              NOT: {
                id: excludeHospitalId,
              },
            }
          : {}),
      },
      select: hospitalCandidateSelect,
      orderBy: [{ isActive: 'desc' }, { id: 'asc' }],
    });
  }

  private async findRecord(
    companyId: string,
    hospitalId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<HospitalDetailRecord> {
    const hospital = await client.healthcareHospital.findFirst({
      where: {
        id: hospitalId,
        companyId,
      },
      select: hospitalDetailSelect,
    });

    if (!hospital) {
      throw hospitalNotFoundException();
    }

    return hospital;
  }

  private async resolveLostUpdate(
    companyId: string,
    hospitalId: string,
  ): Promise<never> {
    const hospital = await this.prisma.healthcareHospital.findFirst({
      where: {
        id: hospitalId,
        companyId,
      },
      select: {
        id: true,
      },
    });

    if (!hospital) {
      throw hospitalNotFoundException();
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

  private mapDetail(hospital: HospitalDetailRecord): HealthcareHospitalDetail {
    const { affiliations, ...data } = hospital;

    return {
      ...data,
      affiliationSummary: {
        active: hospital.isActive
          ? affiliations.filter(
              (affiliation) =>
                affiliation.isActive && affiliation.doctor.isActive,
            ).length
          : 0,
        total: affiliations.length,
      },
    };
  }
}
