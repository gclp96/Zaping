import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { HealthcareDoctorHospitalAffiliationsService } from '../src/healthcare/doctor-hospital-affiliations/healthcare-doctor-hospital-affiliations.service';
import { HealthcareDoctorsService } from '../src/healthcare/doctors/healthcare-doctors.service';
import { HealthcareHospitalsService } from '../src/healthcare/hospitals/healthcare-hospitals.service';
import { PrismaService } from '../src/prisma/prisma.service';

type Endpoint = 'doctor' | 'hospital';
type Deactivation = Endpoint | 'affiliation';
type Transaction = Prisma.TransactionClient;

const DATABASE_NAME = 'hc_preferred_test';
const describePostgres = process.env.HC_PREFERRED_TEST_URL
  ? describe
  : describe.skip;

function isolatedDatabaseUrl(): string {
  const raw = process.env.HC_PREFERRED_TEST_URL;
  const url = new URL(raw ?? '');
  if (
    !raw ||
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '55471' ||
    url.pathname !== '/' + DATABASE_NAME ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Expected the dedicated loopback HC preferred test database.',
    );
  }
  return raw;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function instrumentTransaction(
  prisma: PrismaService,
  instrument: <T>(
    tx: Transaction,
    callback: (tx: Transaction) => Promise<T>,
  ) => Promise<T>,
): PrismaService {
  return {
    $transaction: <T>(
      callback: (tx: Transaction) => Promise<T>,
      options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
    ) =>
      prisma.$transaction((tx) => instrument(tx, callback), {
        ...options,
        timeout: 15_000,
      }),
  } as unknown as PrismaService;
}

async function backendPid(tx: Transaction): Promise<number> {
  const [row] = await tx.$queryRaw<
    { pid: number }[]
  >`SELECT pg_backend_pid() AS pid`;
  return row.pid;
}

async function waitForBlock(
  prisma: PrismaService,
  waiting: number,
  blocker: number,
): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const [row] = await prisma.$queryRaw<{ blocked: boolean }[]>`
      SELECT ${blocker}::integer = ANY(pg_blocking_pids(${waiting}::integer)) AS blocked
    `;
    if (row.blocked) return;
    await delay(20);
  }
  throw new Error(
    'PostgreSQL did not report the expected transaction lock wait.',
  );
}

describePostgres('HC preferred hospital deactivation in PostgreSQL', () => {
  let prisma: PrismaService;
  let fixtureIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: isolatedDatabaseUrl() });
    const [target] = await prisma.$queryRaw<
      { database: string; preferredIndex: boolean }[]
    >`
      SELECT current_database() AS database,
        EXISTS (
          SELECT 1 FROM pg_index
          WHERE indexrelid = to_regclass('"HC_Affiliation_company_doctor_preferred_uidx"')
            AND indisunique AND indisvalid AND indpred IS NOT NULL
        ) AS "preferredIndex"
    `;
    expect(target).toEqual({ database: DATABASE_NAME, preferredIndex: true });
    expect(await prisma.company.count()).toBe(0);
  });

  afterEach(async () => {
    if (!fixtureIds.length) return;
    const where = { companyId: { in: fixtureIds } };
    await prisma.$transaction([
      prisma.healthcareDoctorHospitalAffiliation.deleteMany({ where }),
      prisma.healthcareDoctor.deleteMany({ where }),
      prisma.healthcareHospital.deleteMany({ where }),
      prisma.company.deleteMany({ where: { id: { in: fixtureIds } } }),
    ]);
    fixtureIds = [];
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function seed(isPreferred: boolean) {
    const companyId = randomUUID();
    fixtureIds.push(companyId);
    return prisma.$transaction(async (tx) => {
      await tx.company.create({
        data: {
          id: companyId,
          name: 'HC preference test',
          rfc: companyId.slice(0, 13),
        },
      });
      const doctor = await tx.healthcareDoctor.create({
        data: {
          companyId,
          firstName: 'Test',
          lastName: 'Doctor',
          specialty: 'Test',
          searchKey: 'doctor',
        },
      });
      const hospital = await tx.healthcareHospital.create({
        data: {
          companyId,
          name: 'Test Hospital',
          city: 'Test',
          state: 'Test',
          searchKey: 'hospital',
        },
      });
      return tx.healthcareDoctorHospitalAffiliation.create({
        data: {
          companyId,
          doctorId: doctor.id,
          hospitalId: hospital.id,
          isPreferred,
        },
      });
    });
  }

  type Affiliation = Awaited<ReturnType<typeof seed>>;

  function deactivate(
    client: PrismaService,
    kind: Deactivation,
    row: Affiliation,
  ) {
    if (kind === 'doctor') {
      return new HealthcareDoctorsService(client).deactivate(
        row.companyId,
        row.doctorId,
      );
    }
    if (kind === 'hospital') {
      return new HealthcareHospitalsService(client).deactivate(
        row.companyId,
        row.hospitalId,
      );
    }
    return new HealthcareDoctorHospitalAffiliationsService(client).deactivate(
      row.companyId,
      row.id,
    );
  }

  function read(row: Affiliation) {
    return prisma.healthcareDoctorHospitalAffiliation.findFirstOrThrow({
      where: { id: row.id, companyId: row.companyId },
      include: { doctor: true, hospital: true },
    });
  }

  it.each<Endpoint>(['doctor', 'hospital'])(
    'clears the %s preferences, keeps other tenants isolated and preserves replay and reactivation',
    async (kind) => {
      const row = await seed(true);
      const otherTenant = await seed(true);
      const otherDoctor = await prisma.healthcareDoctor.create({
        data: {
          companyId: row.companyId,
          firstName: 'Other',
          lastName: 'Doctor',
          specialty: 'Test',
          searchKey: 'other doctor',
        },
      });
      const sameHospital =
        await prisma.healthcareDoctorHospitalAffiliation.create({
          data: {
            companyId: row.companyId,
            doctorId: otherDoctor.id,
            hospitalId: row.hospitalId,
            isPreferred: true,
          },
        });

      await expect(
        deactivate(prisma, kind, { ...row, companyId: otherTenant.companyId }),
      ).rejects.toMatchObject({
        status: 404,
      });
      const inactive = await deactivate(prisma, kind, row);
      expect(inactive.isActive).toBe(false);
      expect(await deactivate(prisma, kind, row)).toEqual(inactive);

      if (kind === 'doctor') {
        await new HealthcareDoctorsService(prisma).reactivate(
          row.companyId,
          row.doctorId,
        );
      } else {
        await new HealthcareHospitalsService(prisma).reactivate(
          row.companyId,
          row.hospitalId,
        );
      }

      expect(await read(row)).toMatchObject({
        isActive: true,
        isPreferred: false,
        [kind]: { isActive: true },
      });
      expect(await read(sameHospital)).toMatchObject({
        isActive: true,
        isPreferred: kind === 'doctor',
      });
      expect(await read(otherTenant)).toMatchObject({
        isActive: true,
        isPreferred: true,
      });
    },
  );

  it.each<Endpoint>(['doctor', 'hospital'])(
    'rolls back %s deactivation when preference cleanup fails',
    async (kind) => {
      const row = await seed(true);
      const failing = instrumentTransaction(prisma, (tx, callback) => {
        const delegate = tx.healthcareDoctorHospitalAffiliation;
        const updateMany = async (
          args: Prisma.HealthcareDoctorHospitalAffiliationUpdateManyArgs,
        ) => {
          const result = await delegate.updateMany(args);
          expect(result.count).toBe(1);
          // Fail in PostgreSQL after the real cleanup write, before either write commits.
          await tx.$queryRaw`SELECT 1 / 0`;
          return result;
        };
        return callback({
          ...tx,
          healthcareDoctorHospitalAffiliation: {
            ...delegate,
            updateMany: updateMany as typeof delegate.updateMany,
          },
        });
      });

      await expect(deactivate(failing, kind, row)).rejects.toMatchObject({
        response: { code: 'HEALTHCARE_PERSISTENCE_ERROR' },
      });
      expect(await read(row)).toMatchObject({
        isActive: true,
        isPreferred: true,
        [kind]: { isActive: true },
      });
    },
  );

  it.each([
    ['doctor', true],
    ['doctor', false],
    ['hospital', true],
    ['hospital', false],
    ['affiliation', true],
    ['affiliation', false],
  ] as const)(
    'serializes prefer against %s deactivation (prefer first: %s)',
    async (kind, preferFirst) => {
      const row = await seed(false);
      const held = deferred<number>();
      const started = deferred<number>();
      const release = deferred<void>();
      const winner = instrumentTransaction(prisma, async (tx, callback) => {
        const result = await callback(tx);
        held.resolve(await backendPid(tx));
        await release.promise;
        return result;
      });
      const waiter = instrumentTransaction(prisma, async (tx, callback) => {
        started.resolve(await backendPid(tx));
        return callback(tx);
      });
      const prefer = (client: PrismaService) =>
        new HealthcareDoctorHospitalAffiliationsService(client).prefer(
          row.companyId,
          row.id,
        );
      const first = Promise.allSettled([
        preferFirst ? prefer(winner) : deactivate(winner, kind, row),
      ]);
      let second: Promise<PromiseSettledResult<unknown>[]> | undefined;
      try {
        const winnerPid = await Promise.race([
          held.promise,
          first.then(([result]) => {
            if (result.status === 'rejected') throw result.reason;
            throw new Error(
              'The first transaction did not reach the hold point.',
            );
          }),
        ]);
        second = Promise.allSettled([
          preferFirst ? deactivate(waiter, kind, row) : prefer(waiter),
        ]);
        const waiterPid = await Promise.race([
          started.promise,
          second.then(([result]) => {
            if (result.status === 'rejected') throw result.reason;
            throw new Error(
              'The second transaction did not reach the start point.',
            );
          }),
        ]);
        await waitForBlock(prisma, waiterPid, winnerPid);
      } finally {
        release.resolve();
        await Promise.all([first, second]);
      }

      const [firstResult] = await first;
      const [secondResult] = await second;
      expect(firstResult).toMatchObject({ status: 'fulfilled' });
      if (preferFirst) {
        expect(firstResult).toMatchObject({ value: { isPreferred: true } });
        expect(secondResult).toMatchObject({ status: 'fulfilled' });
      } else {
        expect(secondResult).toMatchObject({ status: 'rejected' });
        if (secondResult.status !== 'rejected')
          throw new Error('Expected prefer to reject.');
        const error: unknown = secondResult.reason;
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getResponse()).toMatchObject({
          code:
            kind === 'affiliation'
              ? 'RESOURCE_STATE_CHANGED'
              : 'AFFILIATION_ENDPOINT_INACTIVE',
        });
      }

      const result = await read(row);
      expect(result).toMatchObject({
        isActive: kind !== 'affiliation',
        isPreferred: false,
      });
      if (kind !== 'affiliation') expect(result[kind].isActive).toBe(false);
    },
    25_000,
  );
});
