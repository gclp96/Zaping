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
import { PrismaClient, SupplierDocumentType } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReceiptDocumentLinksService } from '../src/supplier-documents/receipt-document-links.service';

const describePg =
  process.env.RUN_RECEIPT_DOCUMENT_LINKS_PG === '1' ? describe : describe.skip;

jest.setTimeout(30_000);

describePg('UX-PDOC-01A receipt-document associations PostgreSQL', () => {
  let db: PrismaClient;
  let links: ReceiptDocumentLinksService;
  let app: INestApplication;

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
    app = module.createNestApplication();
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

  // Pause immediately after the real supplier lock, without changing cancellation.
  function gatedClient() {
    let acquired!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = new Proxy(db, {
      get(target, key) {
        if (key === '$transaction')
          return (
            callback: (tx: unknown) => Promise<unknown>,
            options: unknown,
          ) =>
            target.$transaction(
              async (tx) =>
                callback(
                  new Proxy(tx, {
                    get(t, k) {
                      if (k === '$queryRaw')
                        return async (...args: unknown[]) => {
                          const result = await (
                            t.$queryRaw as (...a: unknown[]) => Promise<unknown>
                          )(...args);
                          acquired();
                          await gate;
                          return result;
                        };
                      const value = Reflect.get(t, k);
                      return typeof value === 'function'
                        ? value.bind(t)
                        : value;
                    },
                  }),
                ),
              options as never,
            );
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return { client: client as unknown as PrismaService, locked, release };
  }

  it.each(['cancel-first', 'link-first'])(
    'serializes real cancellation and linking: %s',
    async (order) => {
      const f = await fixture();
      const r = await makeReceipt(f.companyId, f.supplierId);
      const docs = new (
        await import('../src/supplier-documents/supplier-documents.service')
      ).SupplierDocumentsService(db as unknown as PrismaService);
      const d = await docs.create(f.companyId, f.actorId, randomUUID(), {
        supplierId: f.supplierId,
        type: 'FACTURA',
        number: randomUUID(),
        documentDate: '2026-10-30',
        goodsNetAmount: '100.00',
        currency: 'MXN',
      });
      const g = gatedClient();
      const reconciliation = new SupplierDocumentReconciliationService(
        order === 'cancel-first' ? g.client : (db as unknown as PrismaService),
      );
      const linkService =
        order === 'link-first'
          ? new ReceiptDocumentLinksService(g.client)
          : links;
      const cancel = () =>
        reconciliation.cancelDocument(
          f.companyId,
          f.actorId,
          randomUUID(),
          d.id,
          {
            source: 'INTERNAL_RECORD_ERROR',
            reason: 'Cancelación de prueba aislada',
            expectedRevision: 0,
          },
        );
      const link = () =>
        linkService.link(f.companyId, f.actorId, r.receiptId, d.id);
      const first = order === 'cancel-first' ? cancel() : link();
      await g.locked;
      const second = order === 'cancel-first' ? link() : cancel();
      // Attach rejection handlers before unlocking to avoid unhandled rejections.
      const results = Promise.allSettled([first, second]);
      try {
        // Prove the second transaction actually reached the conflicting lock.
        // Starting two promises alone would also pass with sequential scheduling.
        const deadline = Date.now() + 10_000;
        let waiting = false;
        while (Date.now() < deadline) {
          const rows = await db.$queryRaw<Array<{ waiting: boolean }>>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database()
                AND pid <> pg_backend_pid()
                AND wait_event_type = 'Lock'
                AND query LIKE '%FOR NO KEY UPDATE%'
            ) AS waiting`;
          if (rows[0].waiting) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(true);
      } finally {
        g.release();
      }
      const settled = await results;
      expect(settled[0].status).toBe('fulfilled');
      expect(settled[1].status).toBe(
        order === 'cancel-first' ? 'rejected' : 'fulfilled',
      );
      if (order === 'cancel-first')
        expect((settled[1] as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictException,
        );
      const listed = await links.list(f.companyId, r.receiptId);
      expect(listed).toHaveLength(order === 'cancel-first' ? 0 : 1);
      if (listed.length) expect(listed[0].document.status).toBe('CANCELLED');
      expect(
        await db.purchaseReceiptDocument.count({
          where: { companyId: f.companyId },
        }),
      ).toBe(0);
    },
  );

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
