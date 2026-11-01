import {
  concurrencyActor,
  ConcurrencyActor,
  expectAcquired,
  expectBlocked,
  settled,
} from './helpers/receipt-link-concurrency';
import { SupplierDocumentsService } from '../src/supplier-documents/supplier-documents.service';
import type { Server } from 'node:http';
import { PrismaModule } from '../src/prisma/prisma.module';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { SupplierDocumentsModule } from '../src/supplier-documents/supplier-documents.module';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { SupplierDocumentReconciliationService } from '../src/supplier-documents/supplier-document-reconciliation.service';
import { randomUUID } from 'node:crypto';
import {
  INestApplication,
  ValidationPipe,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient, SupplierDocumentType } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReceiptDocumentLinksService } from '../src/supplier-documents/receipt-document-links.service';

const describePg =
  process.env.RUN_RECEIPT_DOCUMENT_LINKS_PG === '1' ? describe : describe.skip;

jest.setTimeout(30_000);

describePg('UX-PDOC-01A receipt-document associations PostgreSQL', () => {
  let db: PrismaClient;
  let links: ReceiptDocumentLinksService;
  let app: INestApplication<Server>;

  async function fixture() {
    const companyId = randomUUID();
    const actorId = randomUUID();
    await db.company.create({
      data: { id: companyId, name: 'UX-PDOC-01A fixture', rfc: companyId },
    });
    await db.user.create({
      data: {
        id: actorId,
        companyId,
        firstName: 'QA',
        lastName: 'Receipt',
        email: actorId + '@example.invalid',
        passwordHash: 'NOT_A_LOGIN',
        role: 'ADMIN',
      },
    });
    const supplier = await db.supplier.create({
      data: { companyId, name: 'Supplier A' },
    });
    const otherSupplier = await db.supplier.create({
      data: { companyId, name: 'Supplier B' },
    });
    return {
      companyId,
      actorId,
      supplierId: supplier.id,
      otherSupplierId: otherSupplier.id,
    };
  }

  async function makeReceipt(companyId: string, supplierId: string) {
    const purchase = await db.purchase.create({
      data: {
        companyId,
        supplierId,
        folio: randomUUID(),
        subtotal: 0,
        iva: 0,
        total: 0,
        status: 'CONFIRMED',
      },
    });
    const receipt = await db.purchaseReceipt.create({
      data: { companyId, purchaseId: purchase.id, folio: randomUUID() },
    });
    return { receiptId: receipt.id, purchaseId: purchase.id };
  }

  async function makeDocument(
    companyId: string,
    supplierId: string,
    occurrence = 1,
    basedOnDocumentId?: string,
  ) {
    if (occurrence > 1 && !basedOnDocumentId) {
      throw new Error('An identity exception must reference its base document');
    }
    const creator = await db.user.findFirstOrThrow({
      where: { companyId },
      select: { id: true },
    });
    return db.supplierDocument.create({
      data: {
        companyId,
        supplierId,
        createdById: creator.id,
        type: SupplierDocumentType.REMISION,
        number: 'REM-123',
        normalizedNumber: 'REM-123',
        identityOccurrence: occurrence,
        documentDate: new Date('2026-10-26T00:00:00.000Z'),
        ...(occurrence > 1
          ? {
              exceptionBasedOnDocumentId: basedOnDocumentId,
              exceptionReason: 'Folio documental duplicado revisado para QA',
              exceptionEvidenceReference: 'Expediente aislado UX-PDOC-01A',
              exceptionReviewedById: creator.id,
              exceptionReviewedAt: new Date('2026-10-26T00:00:00.000Z'),
            }
          : {}),
      },
    });
  }

  beforeAll(async () => {
    const raw = process.env.DATABASE_URL;
    if (
      !raw ||
      (process.env.GITHUB_ACTIONS !== 'true' &&
        process.env.ZFILES_DISPOSABLE_PG !== '1') ||
      process.env.CI !== 'true'
    ) {
      throw new Error('UX-PDOC-01A tests require isolated CI PostgreSQL');
    }
    const target = new URL(raw);
    if (
      !['localhost', '127.0.0.1'].includes(target.hostname) ||
      target.port !== (process.env.ZFILES_TEST_PORT || '5432') ||
      target.pathname !== '/zaping_test' ||
      target.username !== 'ci'
    ) {
      throw new Error('Unsafe UX-PDOC-01A database target');
    }
    db = new PrismaClient({ datasources: { db: { url: raw } } });
    const [identity] = await db.$queryRawUnsafe<
      { database: string; role: string }[]
    >('SELECT current_database() AS database, current_user AS role');
    expect(identity).toEqual({ database: 'zaping_test', role: 'ci' });
    links = new ReceiptDocumentLinksService(db as unknown as PrismaService);
    process.env.JWT_SECRET =
      'zfiles-disposable-jwt-test-only-secret-0123456789';
    const module = await Test.createTestingModule({
      imports: [SupplierDocumentsModule, PrismaModule],
      providers: [JwtStrategy],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  it('links by actual ID despite two documents sharing the same folio', async () => {
    const f = await fixture();
    const receipt = await makeReceipt(f.companyId, f.supplierId);
    const firstDoc = await makeDocument(f.companyId, f.supplierId);
    const secondDoc = await makeDocument(
      f.companyId,
      f.supplierId,
      2,
      firstDoc.id,
    );

    const link = await links.link(
      f.companyId,
      f.actorId,
      receipt.receiptId,
      secondDoc.id,
    );
    expect(link.documentId).toBe(secondDoc.id);
    expect(link.documentId).not.toBe(firstDoc.id);

    const listed = await links.list(f.companyId, receipt.receiptId);
    expect(listed.map((row) => row.document.id)).toEqual([secondDoc.id]);
  });

  it('allows N:M associations but no duplicate active link', async () => {
    const f = await fixture();
    const receiptA = await makeReceipt(f.companyId, f.supplierId);
    const receiptB = await makeReceipt(f.companyId, f.supplierId);
    const doc = await makeDocument(f.companyId, f.supplierId);

    const first = await links.link(
      f.companyId,
      f.actorId,
      receiptA.receiptId,
      doc.id,
    );
    const replay = await links.link(
      f.companyId,
      f.actorId,
      receiptA.receiptId,
      doc.id,
    );
    expect(replay.id).toBe(first.id);
    await links.link(f.companyId, f.actorId, receiptB.receiptId, doc.id);
    expect(
      await db.purchaseReceiptSupplierDocumentLink.count({
        where: { companyId: f.companyId, documentId: doc.id, removedAt: null },
      }),
    ).toBe(2);
  });

  it('serializes concurrent replays without creating duplicate links', async () => {
    const f = await fixture();
    const receipt = await makeReceipt(f.companyId, f.supplierId);
    const doc = await makeDocument(f.companyId, f.supplierId);
    const concurrent = await Promise.all(
      Array.from({ length: 5 }, () =>
        links.link(f.companyId, f.actorId, receipt.receiptId, doc.id),
      ),
    );
    expect(new Set(concurrent.map((link) => link.id)).size).toBe(1);
  });

  it('retains the removed event after a later relink', async () => {
    const f = await fixture();
    const receipt = await makeReceipt(f.companyId, f.supplierId);
    const doc = await makeDocument(f.companyId, f.supplierId);
    const first = await links.link(
      f.companyId,
      f.actorId,
      receipt.receiptId,
      doc.id,
    );

    await links.unlink(
      f.companyId,
      f.actorId,
      receipt.receiptId,
      doc.id,
      'Documento capturado por error',
    );
    const second = await links.link(
      f.companyId,
      f.actorId,
      receipt.receiptId,
      doc.id,
    );
    expect(second.id).not.toBe(first.id);

    const all = await db.purchaseReceiptSupplierDocumentLink.findMany({
      where: { companyId: f.companyId, receiptId: receipt.receiptId },
      orderBy: { createdAt: 'asc' },
    });
    expect(all).toHaveLength(2);
    expect(all.filter((row) => row.removedAt === null)).toHaveLength(1);
    expect(all.find((row) => row.id === first.id)?.reason).toBe(
      'Documento capturado por error',
    );
  });

  it('rejects supplier mismatches and cross-tenant identifiers', async () => {
    const f = await fixture();
    const other = await fixture();
    const receipt = await makeReceipt(f.companyId, f.supplierId);
    const wrongSupplier = await makeDocument(f.companyId, f.otherSupplierId);
    const foreign = await makeDocument(other.companyId, other.supplierId);

    await expect(
      links.link(f.companyId, f.actorId, receipt.receiptId, wrongSupplier.id),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      links.link(f.companyId, f.actorId, receipt.receiptId, foreign.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      links.list(other.companyId, receipt.receiptId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects FK-bypassing supplier mismatches and historical deletions', async () => {
    const f = await fixture();
    const receipt = await makeReceipt(f.companyId, f.supplierId);
    const doc = await makeDocument(f.companyId, f.supplierId);
    const wrongSupplier = await makeDocument(f.companyId, f.otherSupplierId);
    await expect(
      db.purchaseReceiptSupplierDocumentLink.create({
        data: {
          companyId: f.companyId,
          purchaseId: receipt.purchaseId,
          supplierId: wrongSupplier.supplierId,
          receiptId: receipt.receiptId,
          documentId: wrongSupplier.id,
          createdById: f.actorId,
        },
      }),
    ).rejects.toThrow();

    const link = await links.link(
      f.companyId,
      f.actorId,
      receipt.receiptId,
      doc.id,
    );
    await expect(
      db.purchaseReceiptSupplierDocumentLink.delete({
        where: { id: link.id },
      }),
    ).rejects.toThrow();
  });
  it('enforces real JWT and RBAC for all three HTTP routes', async () => {
    const f = await fixture();
    const receipt = await makeReceipt(f.companyId, f.supplierId);
    const doc = await makeDocument(f.companyId, f.supplierId);
    const url = '/supplier-documents/receipts/' + receipt.receiptId + '/links';
    await request(app.getHttpServer()).get(url).expect(401);
    await request(app.getHttpServer())
      .post(url)
      .send({ documentId: doc.id })
      .expect(401);
    await request(app.getHttpServer())
      .delete(url + '/' + doc.id)
      .send({ reason: 'Documento incorrecto' })
      .expect(401);
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    for (const role of ['ADMIN', 'MANAGER', 'WAREHOUSE', 'SALES'] as const) {
      const user = await db.user.update({
        where: { id: f.actorId },
        data: { role },
      });
      const token = jwt.sign({
        sub: user.id,
        companyId: user.companyId,
        email: user.email,
        role,
      });
      const agent = () => request(app.getHttpServer());
      const allowed = role === 'ADMIN' || role === 'MANAGER';
      await agent()
        .get(url)
        .auth(token, { type: 'bearer' })
        .expect(allowed ? 200 : 403);
      await agent()
        .post(url)
        .auth(token, { type: 'bearer' })
        .send({ documentId: doc.id })
        .expect(allowed ? 201 : 403);
      await agent()
        .delete(url + '/' + doc.id)
        .auth(token, { type: 'bearer' })
        .send({ reason: 'Documento incorrecto' })
        .expect(allowed ? 200 : 403);
    }
    const other = await fixture();
    const actor = await db.user.findUniqueOrThrow({
      where: { id: other.actorId },
    });
    const token = jwt.sign({
      sub: actor.id,
      companyId: actor.companyId,
      email: actor.email,
      role: actor.role,
    });
    await request(app.getHttpServer())
      .get(url)
      .auth(token, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .post(url)
      .auth(token, { type: 'bearer' })
      .send({ documentId: doc.id })
      .expect(404);
    await request(app.getHttpServer())
      .delete(url + '/' + doc.id)
      .auth(token, { type: 'bearer' })
      .send({ reason: 'Documento incorrecto' })
      .expect(404);
  });

  it('double unlink has exactly one winner and preserves its audit', async () => {
    const f = await fixture();
    const r = await makeReceipt(f.companyId, f.supplierId);
    const d = await makeDocument(f.companyId, f.supplierId);
    const first = await links.link(f.companyId, f.actorId, r.receiptId, d.id);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        links.unlink(
          f.companyId,
          f.actorId,
          r.receiptId,
          d.id,
          'Documento incorrecto',
        ),
      ),
    );
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(
      (x) => x.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(NotFoundException);
    const row = await db.purchaseReceiptSupplierDocumentLink.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(row.removedById).toBe(f.actorId);
    expect(row.reason).toBe('Documento incorrecto');
    expect(row.removedAt).not.toBeNull();
    await expect(
      db.purchaseReceiptSupplierDocumentLink.update({
        where: { id: first.id },
        data: { reason: 'Cambiar historial prohibido' },
      }),
    ).rejects.toThrow();
  });

  type Action = 'link' | 'unlink' | 'cancel';
  const sessions: ConcurrencyActor[] = [];

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((session) => session.close()));
  });

  async function session(hold = false, lockTimeoutMs?: number) {
    const actor = await concurrencyActor(
      process.env.DATABASE_URL!,
      hold,
      lockTimeoutMs,
    );
    sessions.push(actor);
    return actor;
  }

  async function concurrentFixture(initialLink = false) {
    const f = await fixture();
    const r = await makeReceipt(f.companyId, f.supplierId);
    const docs = new SupplierDocumentsService(db as unknown as PrismaService);
    const d = await docs.create(f.companyId, f.actorId, randomUUID(), {
      supplierId: f.supplierId,
      type: 'FACTURA',
      number: randomUUID(),
      documentDate: '2026-10-30',
      goodsNetAmount: '100.00',
      currency: 'MXN',
    });
    if (initialLink)
      await links.link(f.companyId, f.actorId, r.receiptId, d.id);
    return { ...f, ...r, documentId: d.id };
  }

  type ConcurrentFixture = Awaited<ReturnType<typeof concurrentFixture>>;

  function perform(
    action: Action,
    actor: ConcurrencyActor,
    f: ConcurrentFixture,
  ): Promise<unknown> {
    const service = new ReceiptDocumentLinksService(actor.client);
    if (action === 'link')
      return service.link(f.companyId, f.actorId, f.receiptId, f.documentId);
    if (action === 'unlink')
      return service.unlink(
        f.companyId,
        f.actorId,
        f.receiptId,
        f.documentId,
        'Desvinculación concurrente revisada',
      );
    return new SupplierDocumentReconciliationService(
      actor.client,
    ).cancelDocument(f.companyId, f.actorId, randomUUID(), f.documentId, {
      source: 'INTERNAL_RECORD_ERROR',
      expectedRevision: 0,
      reason: 'Cancelación de prueba aislada',
    });
  }

  async function state(f: ConcurrentFixture) {
    const where = { companyId: f.companyId };
    const [
      rows,
      audits,
      claims,
      monetary,
      receipts,
      positions,
      movements,
      batches,
    ] = await Promise.all([
      db.purchaseReceiptSupplierDocumentLink.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      db.supplierDocumentAudit.findMany({ where, orderBy: { id: 'asc' } }),
      db.idempotencyRecord.findMany({ where, orderBy: { id: 'asc' } }),
      db.purchaseReceiptDocument.findMany({ where, orderBy: { id: 'asc' } }),
      db.purchaseReceipt.findMany({ where, orderBy: { id: 'asc' } }),
      db.inventoryPosition.findMany({ where, orderBy: { id: 'asc' } }),
      db.inventoryMovement.findMany({ where, orderBy: { id: 'asc' } }),
      db.inventoryBatch.findMany({ where, orderBy: { id: 'asc' } }),
    ]);
    return {
      rows,
      audits,
      claims,
      unchanged: { monetary, receipts, positions, movements, batches },
    };
  }

  function committedIsolation(label: string, actors: ConcurrencyActor[]) {
    expect(new Set(actors.map((actor) => actor.pid)).size).toBe(actors.length);
    for (const actor of actors) {
      expect(actor.sessionIsolation).toBe('repeatable read');
      expect(actor.transactions.length).toBeGreaterThan(0);
      for (const tx of actor.transactions) {
        expect(tx.pid).toBe(actor.pid);
        expect(tx.isolation).toBe('read committed');
      }
    }
    console.info(
      'CONC_REVIEW_02_TX ' +
        JSON.stringify({
          label,
          sessions: actors.map((actor) => ({
            pid: actor.pid,
            defaultIsolation: actor.sessionIsolation,
            transactions: actor.transactions,
          })),
        }),
    );
  }

  it.each([
    ['link', 'cancel', false],
    ['cancel', 'link', false],
    ['unlink', 'cancel', true],
    ['cancel', 'unlink', true],
  ] as const)(
    'uses independent PID barriers: %s before %s',
    async (firstAction, secondAction, initialLink) => {
      const f = await concurrentFixture(initialLink);
      const before = await state(f);
      const first = await session(true);
      const second = await session();
      const firstResult = settled(perform(firstAction, first, f));
      let secondResult: ReturnType<typeof settled<unknown>> | undefined;
      try {
        await expectAcquired(first, firstResult);
        secondResult = settled(perform(secondAction, second, f));
        await expectBlocked(
          db,
          second,
          [first],
          firstAction + '-before-' + secondAction,
        );
      } finally {
        first.release();
        second.release();
      }
      expect((await firstResult).status).toBe('fulfilled');
      const outcome = await secondResult;
      const denied = firstAction === 'cancel' && secondAction === 'link';
      expect(outcome.status).toBe(denied ? 'rejected' : 'fulfilled');
      if (denied && outcome.status === 'rejected')
        expect(outcome.reason).toBeInstanceOf(ConflictException);
      committedIsolation(firstAction + '-before-' + secondAction, [
        first,
        second,
      ]);
      const after = await state(f);
      expect(after.audits).toHaveLength(before.audits.length + 1);
      expect(
        after.audits.filter((row) => row.operation === 'DOCUMENT_CANCELLED'),
      ).toHaveLength(1);
      expect(after.claims).toHaveLength(before.claims.length + 1);
      expect(after.unchanged).toEqual(before.unchanged);
      expect(
        (
          await db.supplierDocument.findUniqueOrThrow({
            where: { id: f.documentId },
          })
        ).status,
      ).toBe('CANCELLED');
      if (denied) expect(after.rows).toEqual([]);
      else {
        expect(after.rows).toHaveLength(1);
        if (initialLink) {
          expect(after.rows[0].id).toBe(before.rows[0].id);
          expect(after.rows[0].removedAt).not.toBeNull();
          expect(after.rows[0].removedById).toBe(f.actorId);
          expect(after.rows[0].reason).toBe(
            'Desvinculación concurrente revisada',
          );
          expect(await links.list(f.companyId, f.receiptId)).toEqual([]);
        } else {
          const listed = await links.list(f.companyId, f.receiptId);
          expect(listed).toHaveLength(1);
          expect(listed[0].document.status).toBe('CANCELLED');
        }
      }
    },
  );

  it.each(['link', 'unlink'] as const)(
    'rolls back %s after a real PostgreSQL lock timeout',
    async (action) => {
      const f = await concurrentFixture(action === 'unlink');
      const before = await state(f);
      const holder = await session(true);
      const waiter = await session(false, 3_000);
      const held = settled(
        holder.client.$transaction(
          (tx) =>
            tx.$queryRaw(
              Prisma.sql`SELECT "id" FROM "Supplier" WHERE "id" = ${f.supplierId} AND "companyId" = ${f.companyId} FOR NO KEY UPDATE`,
            ),
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        ),
      );
      try {
        await expectAcquired(holder, held);
        const timed = settled(perform(action, waiter, f));
        await expectBlocked(db, waiter, [holder], action + '-timeout');
        const outcome = await timed;
        expect(outcome.status).toBe('rejected');
        if (outcome.status !== 'rejected')
          throw new Error('Lock timeout was not rejected');
        expect(outcome.reason).toBeInstanceOf(
          Prisma.PrismaClientKnownRequestError,
        );
        const error = outcome.reason as Prisma.PrismaClientKnownRequestError;
        expect(error.code).toBe('P2010');
        expect(error.meta).toEqual(expect.objectContaining({ code: '55P03' }));
        const [activity] = await db.$queryRaw<
          Array<{ state: string; xactStart: Date | null }>
        >`
        SELECT state, xact_start AS "xactStart" FROM pg_stat_activity WHERE pid = ${waiter.pid}`;
        expect(activity.state).toBe('idle');
        expect(activity.xactStart).toBeNull();
        expect(await state(f)).toEqual(before);
        console.info(
          'CONC_REVIEW_02_ROLLBACK ' +
            JSON.stringify({
              action,
              waiterPid: waiter.pid,
              holderPid: holder.pid,
              prismaCode: error.code,
              sqlState: '55P03',
              idle: true,
              unchanged: true,
            }),
        );
      } finally {
        holder.release();
      }
      expect((await held).status).toBe('fulfilled');
      // A fresh operation can commit on the same connection after the rollback.
      await perform(action, waiter, f);
      committedIsolation(action + '-timeout-recovery', [holder, waiter]);
      const after = await state(f);
      expect(after.audits).toEqual(before.audits);
      expect(after.claims).toEqual(before.claims);
      expect(after.unchanged).toEqual(before.unchanged);
      expect(after.rows).toHaveLength(1);
      expect(after.rows[0].removedAt === null).toBe(action === 'link');
    },
  );

  it('preserves integrity under a small queue of mixed independent operations', async () => {
    const f = await concurrentFixture(true);
    const before = await state(f);
    const holder = await session(true);
    const unlinker = await session();
    const linker = await session();
    const canceller = await session();
    const outcomes: Array<ReturnType<typeof settled<unknown>>> = [
      settled(perform('link', holder, f)),
    ];
    try {
      await expectAcquired(holder, outcomes[0]);
      outcomes.push(settled(perform('unlink', unlinker, f)));
      await expectBlocked(db, unlinker, [holder], 'queue-unlink');
      outcomes.push(settled(perform('link', linker, f)));
      await expectBlocked(db, linker, [holder, unlinker], 'queue-link');
      outcomes.push(settled(perform('cancel', canceller, f)));
      await expectBlocked(
        db,
        canceller,
        [holder, unlinker, linker],
        'queue-cancel',
      );
    } finally {
      holder.release();
    }
    const results = await Promise.all(outcomes);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');
    expect(results[3].status).toBe('fulfilled');
    if (results[2].status === 'rejected')
      expect(results[2].reason).toBeInstanceOf(ConflictException);
    committedIsolation('small-mixed-queue', [
      holder,
      unlinker,
      linker,
      canceller,
    ]);
    const after = await state(f);
    expect(
      after.rows.filter((row) => row.removedAt === null).length,
    ).toBeLessThanOrEqual(1);
    expect(after.rows.filter((row) => row.removedAt !== null)).toHaveLength(1);
    expect(after.rows.length).toBeGreaterThanOrEqual(1);
    expect(after.rows.length).toBeLessThanOrEqual(2);
    expect(after.audits).toHaveLength(before.audits.length + 1);
    expect(after.claims).toHaveLength(before.claims.length + 1);
    expect(after.unchanged).toEqual(before.unchanged);
    expect(
      (
        await db.supplierDocument.findUniqueOrThrow({
          where: { id: f.documentId },
        })
      ).status,
    ).toBe('CANCELLED');
  });

  it('serializes overlapping link/unlink and allows a new audited link afterward', async () => {
    const f = await fixture();
    const r = await makeReceipt(f.companyId, f.supplierId);
    const d = await makeDocument(f.companyId, f.supplierId);
    await links.link(f.companyId, f.actorId, r.receiptId, d.id);
    await Promise.all([
      links.link(f.companyId, f.actorId, r.receiptId, d.id),
      links.unlink(
        f.companyId,
        f.actorId,
        r.receiptId,
        d.id,
        'Documento incorrecto',
      ),
    ]);
    await links.link(f.companyId, f.actorId, r.receiptId, d.id);
    const rows = await db.purchaseReceiptSupplierDocumentLink.findMany({
      where: { companyId: f.companyId },
    });
    expect(rows.filter((x) => x.removedAt === null)).toHaveLength(1);
    expect(rows.filter((x) => x.removedAt !== null)).toHaveLength(1);
  });

  it('preserves custom partial index, six tenant FKs and both history triggers', async () => {
    const indexes = await db.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'PurchaseReceiptSupplierDocumentLink' AND indexname = 'PRSDL_active_pair_key'`,
    );
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toContain('UNIQUE');
    expect(indexes[0].indexdef).toContain('WHERE ("removedAt" IS NULL)');
    const fks = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*) FROM pg_constraint WHERE conrelid = '"PurchaseReceiptSupplierDocumentLink"'::regclass AND contype = 'f'`,
    );
    expect(Number(fks[0].count)).toBe(6);
    const triggers = await db.$queryRawUnsafe<Array<{ tgname: string }>>(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = '"PurchaseReceiptSupplierDocumentLink"'::regclass AND NOT tgisinternal ORDER BY tgname`,
    );
    expect(triggers.map((x) => x.tgname)).toEqual([
      'PRSDL_append_only_history',
      'PRSDL_no_delete',
    ]);
  });
});
