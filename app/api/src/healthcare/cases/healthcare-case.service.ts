import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { HealthcareCaseStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  doctorInactiveException,
  doctorNotFoundException,
  healthcareConcurrencyTimeoutException,
  healthcarePersistenceException,
  hospitalInactiveException,
  hospitalNotFoundException,
  relatedResourceChangedException,
  resourceStateChangedException,
} from '../common/healthcare-errors';
import { acquireHealthcareCompanyLock } from '../common/healthcare-company-lock';
import { HealthcareCompanyLockTimeoutError } from '../common/healthcare-company-lock-timeout.error';
import { healthcareCompanyTransactionTimeoutConfiguration } from '../common/healthcare-company-transaction-timeout.config';
import { applyHealthcareSubsequentTransactionTimeouts } from '../common/healthcare-subsequent-transaction-timeouts';
import { HealthcareEquipmentAssignmentsService } from '../equipment-assignments/healthcare-equipment-assignments.service';

import { HealthcareCaseFolioService } from './healthcare-case-folio.service';

const healthcareCaseResponseSelect = {
  id: true,
  companyId: true,
  doctorId: true,
  hospitalId: true,
  folio: true,
  title: true,
  procedureDescription: true,
  status: true,
  scheduledStart: true,
  scheduledEnd: true,
  responsibleUserId: true,
  createdById: true,
  cancelledAt: true,
  cancelledById: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  healthcareDoctor: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      specialty: true,
      isActive: true,
    },
  },
  healthcareHospital: {
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      isActive: true,
    },
  },
} satisfies Prisma.HealthcareCaseSelect;

type HealthcareCaseRecord = Prisma.HealthcareCaseGetPayload<{
  select: typeof healthcareCaseResponseSelect;
}>;

export type HealthcareCaseResponse = Omit<
  HealthcareCaseRecord,
  'healthcareDoctor' | 'healthcareHospital'
> & {
  doctor: HealthcareCaseRecord['healthcareDoctor'];
  hospital: HealthcareCaseRecord['healthcareHospital'];
};

export type CreateHealthcareCaseInput = {
  title: string;
  procedureDescription?: string | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  responsibleUserId?: string | null;
  doctorId?: string | null;
  hospitalId?: string | null;
};

export type UpdateHealthcareCaseInput = {
  title?: string;
  procedureDescription?: string | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  responsibleUserId?: string | null;
  doctorId?: string | null;
  hospitalId?: string | null;
};

type NormalizedCreateHealthcareCaseInput = {
  title: string;
  procedureDescription: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  responsibleUserId: string | null;
  doctorId: string | null;
  hospitalId: string | null;
  status: HealthcareCaseStatus;
};

type NormalizedUpdateHealthcareCaseInput = NormalizedCreateHealthcareCaseInput;

type LockedHealthcareCase = {
  id: string;
  status: HealthcareCaseStatus;
};

@Injectable()
export class HealthcareCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthcareCaseFolioService: HealthcareCaseFolioService,
    private readonly equipmentAssignmentsService: HealthcareEquipmentAssignmentsService,
    @Inject(healthcareCompanyTransactionTimeoutConfiguration.KEY)
    private readonly companyTransactionTimeoutPolicy: ConfigType<
      typeof healthcareCompanyTransactionTimeoutConfiguration
    >,
  ) {}

  async create(
    companyId: string,
    createdById: string,
    input: CreateHealthcareCaseInput,
  ): Promise<HealthcareCaseResponse> {
    const normalizedInput = this.normalizeCreateInput(input);

    try {
      const healthcareCase = await this.prisma.$transaction(async (tx) => {
        await this.validateCreator(tx, companyId, createdById);

        if (normalizedInput.responsibleUserId) {
          await this.validateResponsibleUser(
            tx,
            companyId,
            normalizedInput.responsibleUserId,
          );
        }

        if (normalizedInput.doctorId) {
          await this.validateDoctor(tx, companyId, normalizedInput.doctorId);
        }

        if (normalizedInput.hospitalId) {
          await this.validateHospital(
            tx,
            companyId,
            normalizedInput.hospitalId,
          );
        }

        const folio =
          await this.healthcareCaseFolioService.allocateNextAvailableFolio(
            tx,
            companyId,
          );

        return tx.healthcareCase.create({
          data: {
            companyId,
            folio,
            title: normalizedInput.title,
            procedureDescription: normalizedInput.procedureDescription,
            status: normalizedInput.status,
            scheduledStart: normalizedInput.scheduledStart,
            scheduledEnd: normalizedInput.scheduledEnd,
            responsibleUserId: normalizedInput.responsibleUserId,
            doctorId: normalizedInput.doctorId,
            hospitalId: normalizedInput.hospitalId,
            createdById,
            cancelledAt: null,
            cancelledById: null,
            cancellationReason: null,
          },
          select: healthcareCaseResponseSelect,
        });
      });

      return this.mapResponse(healthcareCase);
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  /**
   * Upcoming scheduled cases only. This is a bounded operational agenda,
   * not a full case history or a calendar of all company events.
   */
  async findUpcoming(companyId: string, now = new Date()) {
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const cases = await this.prisma.healthcareCase.findMany({
      where: {
        companyId,
        status: HealthcareCaseStatus.SCHEDULED,
        scheduledStart: { gte: now, lt: horizon },
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

    return cases.flatMap((healthcareCase) =>
      healthcareCase.scheduledStart
        ? [
            {
              id: healthcareCase.id,
              folio: healthcareCase.folio,
              title: healthcareCase.title,
              scheduledStart: healthcareCase.scheduledStart.toISOString(),
              scheduledEnd:
                healthcareCase.scheduledEnd?.toISOString() ?? null,
              hospitalName: healthcareCase.healthcareHospital?.name ?? null,
            },
          ]
        : [],
    );
  }

  async findAll(companyId: string): Promise<HealthcareCaseResponse[]> {
    const healthcareCases = await this.prisma.healthcareCase.findMany({
      where: {
        companyId,
      },
      select: healthcareCaseResponseSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return healthcareCases.map((healthcareCase) =>
      this.mapResponse(healthcareCase),
    );
  }

  async findOne(
    companyId: string,
    caseId: string,
  ): Promise<HealthcareCaseResponse> {
    const healthcareCase = await this.prisma.healthcareCase.findFirst({
      where: {
        id: caseId,
        companyId,
      },
      select: healthcareCaseResponseSelect,
    });

    if (!healthcareCase) {
      throw new NotFoundException('Caso no encontrado');
    }

    return this.mapResponse(healthcareCase);
  }

  async update(
    companyId: string,
    caseId: string,
    input: UpdateHealthcareCaseInput,
  ): Promise<HealthcareCaseResponse> {
    try {
      const updatedCase = await this.prisma.$transaction(async (tx) => {
        const healthcareCase = await tx.healthcareCase.findFirst({
          where: {
            id: caseId,
            companyId,
          },
          select: healthcareCaseResponseSelect,
        });

        if (!healthcareCase) {
          throw new NotFoundException('Caso no encontrado');
        }

        if (healthcareCase.status === HealthcareCaseStatus.CANCELLED) {
          throw new ConflictException('El caso cancelado no puede modificarse');
        }

        const normalizedInput = this.normalizeUpdateInput(
          healthcareCase,
          input,
        );

        if (this.hasDefinedOwn(input, 'responsibleUserId')) {
          if (normalizedInput.responsibleUserId) {
            await this.validateResponsibleUser(
              tx,
              companyId,
              normalizedInput.responsibleUserId,
            );
          }
        }

        if (
          this.hasDefinedOwn(input, 'doctorId') &&
          normalizedInput.doctorId &&
          normalizedInput.doctorId !== healthcareCase.doctorId
        ) {
          await this.validateDoctor(tx, companyId, normalizedInput.doctorId);
        }

        if (
          this.hasDefinedOwn(input, 'hospitalId') &&
          normalizedInput.hospitalId &&
          normalizedInput.hospitalId !== healthcareCase.hospitalId
        ) {
          await this.validateHospital(
            tx,
            companyId,
            normalizedInput.hospitalId,
          );
        }

        const updateResult = await tx.healthcareCase.updateMany({
          where: {
            id: caseId,
            companyId,
            status: {
              in: [HealthcareCaseStatus.DRAFT, HealthcareCaseStatus.SCHEDULED],
            },
          },
          data: {
            title: normalizedInput.title,
            procedureDescription: normalizedInput.procedureDescription,
            status: normalizedInput.status,
            scheduledStart: normalizedInput.scheduledStart,
            scheduledEnd: normalizedInput.scheduledEnd,
            responsibleUserId: normalizedInput.responsibleUserId,
            doctorId: normalizedInput.doctorId,
            hospitalId: normalizedInput.hospitalId,
          },
        });

        if (updateResult.count !== 1) {
          await this.resolveLostCaseMutation(tx, companyId, caseId);
        }

        return this.findOneInTransaction(tx, companyId, caseId);
      });

      return this.mapResponse(updatedCase);
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async cancel(
    companyId: string,
    caseId: string,
    cancelledById: string,
    cancellationReason: string,
  ): Promise<HealthcareCaseResponse> {
    const normalizedReason =
      this.normalizeCancellationReason(cancellationReason);

    try {
      const transactionOptions = {
        maxWait: this.companyTransactionTimeoutPolicy.prismaMaxWaitMs,
        timeout:
          this.companyTransactionTimeoutPolicy.prismaTransactionTimeoutMs,
      };

      const cancelledCase = await this.prisma.$transaction(async (tx) => {
        await acquireHealthcareCompanyLock(tx, companyId, {
          acquisitionTimeoutMs:
            this.companyTransactionTimeoutPolicy
              .companyLockAcquisitionTimeoutMs,
        });
        await applyHealthcareSubsequentTransactionTimeouts(
          tx,
          this.companyTransactionTimeoutPolicy,
        );

        const healthcareCase = await this.lockCaseForCancellation(
          tx,
          companyId,
          caseId,
        );

        if (healthcareCase.status === HealthcareCaseStatus.CANCELLED) {
          throw new ConflictException('El caso ya está cancelado');
        }

        await this.validateCancellationActor(tx, companyId, cancelledById);

        const assignmentIds =
          await this.equipmentAssignmentsService.lockReservedCaseAssignments(
            tx,
            { companyId, caseId },
          );
        const cancelledAt = new Date();

        const updateResult = await tx.healthcareCase.updateMany({
          where: {
            id: caseId,
            companyId,
            status: {
              in: [HealthcareCaseStatus.DRAFT, HealthcareCaseStatus.SCHEDULED],
            },
          },
          data: {
            status: HealthcareCaseStatus.CANCELLED,
            cancelledAt,
            cancelledById,
            cancellationReason: normalizedReason,
          },
        });

        if (updateResult.count !== 1) {
          await this.resolveLostCaseMutation(tx, companyId, caseId);
        }

        await this.equipmentAssignmentsService.releaseLockedCaseAssignments(
          tx,
          {
            companyId,
            caseId,
            assignmentIds,
            releasedAt: cancelledAt,
            releasedById: cancelledById,
            releaseReason: normalizedReason,
          },
        );

        return this.findOneInTransaction(tx, companyId, caseId);
      }, transactionOptions);

      return this.mapResponse(cancelledCase);
    } catch (error) {
      if (error instanceof HealthcareCompanyLockTimeoutError) {
        throw healthcareConcurrencyTimeoutException();
      }

      this.rethrowWriteError(error);
    }
  }

  private normalizeCreateInput(
    input: CreateHealthcareCaseInput,
  ): NormalizedCreateHealthcareCaseInput {
    const title = input.title.trim();

    if (!title) {
      throw new BadRequestException('El título del caso es obligatorio');
    }

    const procedureDescription = input.procedureDescription?.trim() || null;
    const scheduledStart = input.scheduledStart ?? null;
    const scheduledEnd = input.scheduledEnd ?? null;
    const responsibleUserId = input.responsibleUserId ?? null;
    const doctorId = input.doctorId ?? null;
    const hospitalId = input.hospitalId ?? null;

    this.validateSchedule(scheduledStart, scheduledEnd);

    return {
      title,
      procedureDescription,
      scheduledStart,
      scheduledEnd,
      responsibleUserId,
      doctorId,
      hospitalId,
      status: scheduledStart
        ? HealthcareCaseStatus.SCHEDULED
        : HealthcareCaseStatus.DRAFT,
    };
  }

  private normalizeUpdateInput(
    healthcareCase: HealthcareCaseRecord,
    input: UpdateHealthcareCaseInput,
  ): NormalizedUpdateHealthcareCaseInput {
    const title = this.hasDefinedOwn(input, 'title')
      ? this.normalizeTitle(input.title)
      : healthcareCase.title;

    const procedureDescription = this.hasDefinedOwn(
      input,
      'procedureDescription',
    )
      ? this.normalizeOptionalString(input.procedureDescription)
      : healthcareCase.procedureDescription;

    const scheduledStart = this.hasDefinedOwn(input, 'scheduledStart')
      ? (input.scheduledStart ?? null)
      : healthcareCase.scheduledStart;

    const scheduledEnd = this.hasDefinedOwn(input, 'scheduledEnd')
      ? (input.scheduledEnd ?? null)
      : healthcareCase.scheduledEnd;

    const responsibleUserId = this.hasDefinedOwn(input, 'responsibleUserId')
      ? (input.responsibleUserId ?? null)
      : healthcareCase.responsibleUserId;

    const doctorId = this.hasDefinedOwn(input, 'doctorId')
      ? (input.doctorId ?? null)
      : healthcareCase.doctorId;

    const hospitalId = this.hasDefinedOwn(input, 'hospitalId')
      ? (input.hospitalId ?? null)
      : healthcareCase.hospitalId;

    this.validateSchedule(scheduledStart, scheduledEnd);

    return {
      title,
      procedureDescription,
      scheduledStart,
      scheduledEnd,
      responsibleUserId,
      doctorId,
      hospitalId,
      status: scheduledStart
        ? HealthcareCaseStatus.SCHEDULED
        : HealthcareCaseStatus.DRAFT,
    };
  }

  private normalizeTitle(title: string) {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      throw new BadRequestException('El título del caso es obligatorio');
    }

    return normalizedTitle;
  }

  private normalizeOptionalString(value?: string | null) {
    return value?.trim() || null;
  }

  private normalizeCancellationReason(cancellationReason: string) {
    const normalizedReason = cancellationReason.trim();

    if (!normalizedReason) {
      throw new BadRequestException('La razón de cancelación es obligatoria');
    }

    return normalizedReason;
  }

  private validateSchedule(
    scheduledStart: Date | null,
    scheduledEnd: Date | null,
  ) {
    if (!scheduledStart && scheduledEnd) {
      throw new BadRequestException('La fecha de fin requiere fecha de inicio');
    }

    if (
      scheduledStart &&
      scheduledEnd &&
      scheduledEnd.getTime() <= scheduledStart.getTime()
    ) {
      throw new BadRequestException(
        'La fecha de fin debe ser posterior a la fecha de inicio',
      );
    }
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

  private async validateCreator(
    tx: Prisma.TransactionClient,
    companyId: string,
    createdById: string,
  ) {
    const creator = await tx.user.findFirst({
      where: {
        id: createdById,
        companyId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!creator) {
      throw new BadRequestException('Usuario creador no válido');
    }
  }

  private async validateResponsibleUser(
    tx: Prisma.TransactionClient,
    companyId: string,
    responsibleUserId: string,
  ) {
    const responsibleUser = await tx.user.findFirst({
      where: {
        id: responsibleUserId,
        companyId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!responsibleUser) {
      throw new BadRequestException('Usuario responsable no válido');
    }
  }

  private async validateDoctor(
    tx: Prisma.TransactionClient,
    companyId: string,
    doctorId: string,
  ) {
    const doctor = await tx.healthcareDoctor.findFirst({
      where: {
        id: doctorId,
        companyId,
      },
      select: {
        isActive: true,
      },
    });

    if (!doctor) {
      throw doctorNotFoundException();
    }

    if (!doctor.isActive) {
      throw doctorInactiveException();
    }
  }

  private async validateHospital(
    tx: Prisma.TransactionClient,
    companyId: string,
    hospitalId: string,
  ) {
    const hospital = await tx.healthcareHospital.findFirst({
      where: {
        id: hospitalId,
        companyId,
      },
      select: {
        isActive: true,
      },
    });

    if (!hospital) {
      throw hospitalNotFoundException();
    }

    if (!hospital.isActive) {
      throw hospitalInactiveException();
    }
  }

  private async validateCancellationActor(
    tx: Prisma.TransactionClient,
    companyId: string,
    cancelledById: string,
  ) {
    const cancelledBy = await tx.user.findFirst({
      where: {
        id: cancelledById,
        companyId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!cancelledBy) {
      throw new BadRequestException('Usuario cancelador no válido');
    }
  }

  private async lockCaseForCancellation(
    tx: Prisma.TransactionClient,
    companyId: string,
    caseId: string,
  ): Promise<LockedHealthcareCase> {
    const [healthcareCase] = await tx.$queryRaw<LockedHealthcareCase[]>(
      Prisma.sql`
        SELECT "id", "status"
        FROM "HealthcareCase"
        WHERE "id" = ${caseId} AND "companyId" = ${companyId}
        FOR UPDATE
      `,
    );

    if (!healthcareCase) {
      throw new NotFoundException('Caso no encontrado');
    }

    return healthcareCase;
  }

  private async findOneInTransaction(
    tx: Prisma.TransactionClient,
    companyId: string,
    caseId: string,
  ) {
    const healthcareCase = await tx.healthcareCase.findFirst({
      where: {
        id: caseId,
        companyId,
      },
      select: healthcareCaseResponseSelect,
    });

    if (!healthcareCase) {
      throw new NotFoundException('Caso no encontrado');
    }

    return healthcareCase;
  }

  private async resolveLostCaseMutation(
    tx: Prisma.TransactionClient,
    companyId: string,
    caseId: string,
  ): Promise<never> {
    const healthcareCase = await tx.healthcareCase.findFirst({
      where: {
        id: caseId,
        companyId,
      },
      select: {
        id: true,
      },
    });

    if (!healthcareCase) {
      throw new NotFoundException('Caso no encontrado');
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

  private mapResponse(
    healthcareCase: HealthcareCaseRecord,
  ): HealthcareCaseResponse {
    const { healthcareDoctor, healthcareHospital, ...data } = healthcareCase;

    return {
      ...data,
      doctor: healthcareDoctor,
      hospital: healthcareHospital,
    };
  }
}
