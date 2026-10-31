import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function member(target: object, key: string | symbol): unknown {
  const value: unknown = Reflect.get(target, key);
  return typeof value === 'function'
    ? (...args: unknown[]): unknown =>
        Reflect.apply(value, target, args) as unknown
    : value;
}

type Options = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  timeout?: number;
  maxWait?: number;
};

/** A dedicated one-connection pool; no SET ROLE or shared transaction connection. */
export async function concurrencyActor(
  raw: string,
  hold = false,
  lockTimeoutMs?: number,
) {
  const url = new URL(raw);
  url.searchParams.set('connection_limit', '1');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  await db.$executeRawUnsafe(
    "SET SESSION default_transaction_isolation = 'repeatable read'",
  );
  const [session] = await db.$queryRaw<
    Array<{ pid: number; isolation: string }>
  >`
    SELECT pg_backend_pid() AS pid, current_setting('default_transaction_isolation') AS isolation`;
  const acquired = barrier();
  const release = barrier();
  const transactions: Array<{ pid: number; isolation: string }> = [];
  const client = new Proxy(db, {
    get(target, key) {
      if (key !== '$transaction') return member(target, key);
      return (
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options?: Options,
      ) =>
        target.$transaction(
          async (tx) => {
            const [identity] = await tx.$queryRaw<
              Array<{ pid: number; isolation: string }>
            >`
            SELECT pg_backend_pid() AS pid, current_setting('transaction_isolation') AS isolation`;
            if (identity.pid !== session.pid)
              throw new Error('Connection identity changed');
            transactions.push(identity);
            if (lockTimeoutMs !== undefined) {
              await tx.$queryRaw`SELECT set_config('lock_timeout', ${lockTimeoutMs + 'ms'}, true)`;
            }
            return callback(
              new Proxy(tx, {
                get(inner, field) {
                  if (field !== '$queryRaw') return member(inner, field);
                  return async (...args: unknown[]) => {
                    const query = args[0] as Prisma.Sql;
                    const supplierLock =
                      typeof query?.sql === 'string' &&
                      query.sql.includes('FROM "Supplier"') &&
                      query.sql.includes('FOR NO KEY UPDATE');
                    const result = await (
                      inner.$queryRaw as (
                        ...values: unknown[]
                      ) => Promise<unknown>
                    )(...args);
                    if (supplierLock) {
                      acquired.resolve();
                      if (hold) await release.promise;
                    }
                    return result;
                  };
                },
              }),
            );
            // Barrier time belongs to the test harness, not the production timeout policy.
          },
          { timeout: 15_000, ...options },
        );
    },
  });
  return {
    db,
    client: client as unknown as PrismaService,
    pid: session.pid,
    sessionIsolation: session.isolation,
    transactions,
    acquired: acquired.promise,
    release: release.resolve,
    async close() {
      release.resolve();
      await db.$disconnect();
    },
  };
}

export type ConcurrencyActor = Awaited<ReturnType<typeof concurrencyActor>>;

/** Observe this exact waiter and a known blocking PID, not any waiter in the DB. */
export async function expectBlocked(
  observer: PrismaClient,
  waiter: ConcurrencyActor,
  blockers: ConcurrencyActor[],
  label: string,
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [row] = await observer.$queryRaw<
      Array<{
        pid: number;
        blockers: number[];
        event: string | null;
        supplierLock: boolean;
      }>
    >`
      SELECT pid, pg_blocking_pids(pid) AS blockers, wait_event_type AS event,
        query LIKE '%FROM "Supplier"%FOR NO KEY UPDATE%' AS "supplierLock"
      FROM pg_stat_activity WHERE pid = ${waiter.pid}`;
    if (
      row?.event === 'Lock' &&
      row.supplierLock &&
      row.blockers.some((pid) => blockers.some((actor) => actor.pid === pid))
    ) {
      console.info('CONC_REVIEW_02_LOCK ' + JSON.stringify({ label, ...row }));
      return row;
    }
    // Polling delay is not the evidence: pg_blocking_pids + exact waiter are.
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No matching blocker for ${label}: waiter PID ${waiter.pid}`);
}

export function settled<T>(operation: Promise<T>) {
  return operation.then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (reason: unknown) => ({ status: 'rejected' as const, reason }),
  );
}

export async function expectAcquired(
  actor: ConcurrencyActor,
  outcome: Promise<unknown>,
) {
  await Promise.race([
    actor.acquired,
    outcome.then(() => {
      throw new Error('Operation ended before acquiring supplier lock');
    }),
  ]);
}
