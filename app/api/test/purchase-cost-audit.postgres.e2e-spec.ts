import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guards';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { CompanySequenceAllocatorService } from '../src/company-sequences/company-sequence-allocator.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PurchasesController } from '../src/purchases/purchases.controller';
import { PurchasesFolioService } from '../src/purchases/purchases-folio.service';
import { PurchasesService } from '../src/purchases/purchases.service';

const runId = process.env.UX007I_RUN_ID;
const describePg = runId ? describe : describe.skip;

describePg('UX-007I cost audit on disposable PostgreSQL 16', () => {
  let db: PrismaClient;
  let service: PurchasesService;
  let legacy: Awaited<ReturnType<typeof fixture>> & {
    purchaseId: string;
    lineId: string;
  };
  const reason = 'Precio acordado con el proveedor';
  const history = (companyId: string, purchaseId: string) =>
    service.findCostAudit(companyId, purchaseId, UserRole.ADMIN, false);

  async function fixture(role: UserRole = UserRole.ADMIN) {
    const company = await db.company.create({
      data: { name: 'QA compras', rfc: randomUUID() },
    });
    const supplier = await db.supplier.create({
      data: { companyId: company.id, name: 'Proveedor QA' },
    });
    const product = await db.product.create({
      data: {
        companyId: company.id,
        sku: 'QA',
        name: 'Producto QA',
        cost: 100,
      },
    });
    const actor = await db.user.create({
      data: {
        companyId: company.id,
        email: randomUUID() + '@example.test',
        firstName: 'Ana',
        lastName: 'Compras',
        passwordHash: 'unused-test-value',
        role,
      },
    });
    const dto = {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: 2 }],
    };
    return { company, product, actor, dto };
  }

  beforeAll(async () => {
    const raw = process.env.UX007I_PG_URL;
    const container = process.env.UX007I_CONTAINER;
    if (
      !raw ||
      !container ||
      !/^[a-f0-9]{64}$/.test(container) ||
      !/^[a-f0-9]{16}$/.test(runId ?? '')
    ) {
      throw new Error('Run through test/run-purchase-cost-audit-qa.cjs');
    }
    const url = new URL(raw);
    const database = 'qa_purchase_audit_' + runId;
    if (
      url.protocol !== 'postgresql:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.port === '5436' ||
      url.pathname !== '/' + database ||
      url.username !== 'qa_purchase_audit' ||
      !url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('Invalid disposable database target');
    }
    const metadata = JSON.parse(
      execFileSync('docker', ['inspect', '--format', '{{json .}}', container], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ) as {
      Id: string;
      Config: { Labels: Record<string, string> };
      State: { Running: boolean };
      Mounts: { Type: string }[];
      HostConfig: { AutoRemove: boolean; Tmpfs: Record<string, string> };
      NetworkSettings: {
        Ports: Record<string, { HostIp: string; HostPort: string }[]>;
      };
    };
    expect(metadata).toMatchObject({
      Id: container,
      Config: { Labels: { 'zaping.ux007i': runId } },
      State: { Running: true },
      HostConfig: { AutoRemove: true },
      NetworkSettings: {
        Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: url.port }] },
      },
    });
    expect(metadata.HostConfig.Tmpfs['/var/lib/postgresql/data']).toBeTruthy();
    expect(metadata.Mounts.every((mount) => mount.Type === 'tmpfs')).toBe(true);
    db = new PrismaClient({ datasources: { db: { url: raw } } });
    const [identity] = await db.$queryRaw<
      Array<{ marker: string; admin: boolean; version: number }>
    >`
      SELECT shobj_description(d.oid, 'pg_database') AS marker, r.rolsuper AS admin,
        current_setting('server_version_num')::int AS version
      FROM pg_database d JOIN pg_roles r ON r.rolname = current_user
      WHERE d.datname = current_database()
    `;
    expect(identity).toMatchObject({
      marker: 'UX-007I:' + runId,
      admin: false,
    });
    expect(identity.version).toBeGreaterThanOrEqual(160000);
    expect(identity.version).toBeLessThan(170000);
    service = new PurchasesService(
      db as PrismaService,
      new PurchasesFolioService(new CompanySequenceAllocatorService()),
    );
    const f = await fixture();
    const oldOrder = await service.create(f.company.id, f.dto);
    legacy = { ...f, purchaseId: oldOrder.id, lineId: oldOrder.items[0].id };
    const getOrder = () =>
      db.purchase.findUniqueOrThrow({
        where: { id: oldOrder.id },
        include: { items: true },
      });
    const getAppliedMigrations = () => db.$queryRaw<
      Array<{ migration_name: string }>
    >`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name
    `;
    const originalOrder = await getOrder();
    const baseline = await getAppliedMigrations();
    const target = { migration_name: '20261123000000_purchase_cost_audit' };
    expect(baseline).not.toContainEqual(target);

    const apiRoot = resolve(__dirname, '..');
    const prisma = resolve(apiRoot, 'node_modules/prisma/build/index.js');
    for (const action of ['deploy', 'status']) {
      execFileSync(process.execPath, [prisma, 'migrate', action], {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: raw },
        stdio: 'pipe',
      });
    }
    expect(await getAppliedMigrations()).toEqual([...baseline, target]);
    expect(await getOrder()).toEqual(originalOrder);
    expect(await db.purchaseCostAudit.count()).toBe(0);
    process.stdout.write(
      'Prisma migrate deploy/status: UX-007I applied and up to date. Pre-existing order and lines preserved.\n',
    );
  }, 60_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('keeps pre-migration orders intact and skips quantity-only edits and unchanged explicit values', async () => {
    expect(
      await db.purchaseItem.findUnique({ where: { id: legacy.lineId } }),
    ).toMatchObject({
      purchaseId: legacy.purchaseId,
      quantity: 2,
      price: 100,
      listUnitCost: null,
    });
    expect(await history(legacy.company.id, legacy.purchaseId)).toEqual([]);
    const edited = await service.update(
      legacy.company.id,
      legacy.purchaseId,
      {
        ...legacy.dto,
        items: [
          {
            productId: legacy.product.id,
            quantity: 3,
            unitCost: 100,
            discountPercent: 0,
          },
        ],
      },
      UserRole.ADMIN,
    );
    expect(edited?.items[0]).toMatchObject({ quantity: 3, price: 100 });
    expect(await history(legacy.company.id, legacy.purchaseId)).toEqual([]);
  });

  it('audits real creation and draft edits with decimal prices and historical actor names', async () => {
    const { company, product, actor, dto } = await fixture();
    const purchase = await service.create(
      company.id,
      {
        ...dto,
        costAdjustmentReason: '  ' + reason + '  ',
        items: [
          {
            productId: product.id,
            quantity: 1,
            unitCost: 85.5,
            discountPercent: 10,
          },
        ],
      },
      UserRole.ADMIN,
      false,
      actor,
    );
    expect(purchase.items[0]).toMatchObject({
      listUnitCost: 85.5,
      discountPercent: 10,
      price: 76.95,
    });
    const renamed = await db.user.update({
      where: { id: actor.id },
      data: {
        firstName: 'María',
        role: UserRole.WAREHOUSE,
        canAdjustPurchaseUnitCost: true,
      },
    });
    const edited = await service.update(
      company.id,
      purchase.id,
      {
        ...dto,
        costAdjustmentReason: 'Descuento posterior del proveedor',
        items: [{ productId: product.id, quantity: 1, discountPercent: 0 }],
      },
      UserRole.WAREHOUSE,
      true,
      renamed,
    );
    expect(edited?.items[0]).toMatchObject({
      listUnitCost: null,
      discountPercent: 0,
      price: 85.5,
    });
    expect(edited?.items[0].id).not.toBe(purchase.items[0].id);
    const results = await service.findCostAudit(
      company.id,
      purchase.id,
      UserRole.WAREHOUSE,
      true,
    );
    expect(
      results.map((entry) => ({
        ...entry,
        previousGrossUnitCost: entry.previousGrossUnitCost.toFixed(4),
        newGrossUnitCost: entry.newGrossUnitCost.toFixed(4),
        previousDiscountPercent: entry.previousDiscountPercent.toFixed(2),
        newDiscountPercent: entry.newDiscountPercent.toFixed(2),
        previousNetUnitCost: entry.previousNetUnitCost.toFixed(4),
        newNetUnitCost: entry.newNetUnitCost.toFixed(4),
      })),
    ).toMatchObject([
      {
        productId: product.id,
        productDisplayName: product.name,
        actorUserId: actor.id,
        actorDisplayName: 'María Compras',
        actorRole: 'WAREHOUSE',
        previousGrossUnitCost: '85.5000',
        newGrossUnitCost: '85.5000',
        previousDiscountPercent: '10.00',
        newDiscountPercent: '0.00',
        previousNetUnitCost: '76.9500',
        newNetUnitCost: '85.5000',
      },
      {
        actorDisplayName: 'Ana Compras',
        actorRole: 'ADMIN',
        reason,
        previousGrossUnitCost: '100.0000',
        newGrossUnitCost: '85.5000',
        previousDiscountPercent: '0.00',
        newDiscountPercent: '10.00',
        previousNetUnitCost: '100.0000',
        newNetUnitCost: '76.9500',
      },
    ]);
    expect(
      await db.product.findUnique({ where: { id: product.id } }),
    ).toMatchObject({ cost: 100 });
  });

  it('requires a reason and restricts adjustments and history by role and tenant', async () => {
    const { company, product, actor, dto } = await fixture();
    const adjustment = {
      ...dto,
      items: [{ productId: product.id, quantity: 1, unitCost: 88 }],
    };
    const draft = await service.create(company.id, dto);
    await expect(
      service.create(company.id, adjustment, UserRole.ADMIN, false, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(
        company.id,
        draft.id,
        {
          ...adjustment,
          costAdjustmentReason: '   ',
        },
        UserRole.MANAGER,
        false,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(
        company.id,
        draft.id,
        {
          ...adjustment,
          costAdjustmentReason: reason,
        },
        UserRole.WAREHOUSE,
        false,
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.create(
        company.id,
        {
          ...adjustment,
          costAdjustmentReason: reason,
        },
        UserRole.SALES,
        false,
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.findCostAudit(company.id, draft.id, UserRole.SALES, false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.findCostAudit(company.id, draft.id, UserRole.WAREHOUSE, false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(history(legacy.company.id, draft.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(legacy.company.id, draft.id, adjustment),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await history(company.id, draft.id)).toEqual([]);
    expect(await db.purchase.count({ where: { companyId: company.id } })).toBe(
      1,
    );
  });

  it('rolls back the purchase, lines and inserted audit if the database rejects the audit', async () => {
    const { company, product, actor, dto } = await fixture();
    const purchase = await service.create(company.id, dto);
    await db.$executeRaw`
      CREATE FUNCTION qa_reject_cost_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'QA forced audit failure';
      END;
      $$
    `;
    await db.$executeRaw`
      CREATE TRIGGER qa_reject_cost_audit AFTER INSERT ON "PurchaseCostAudit"
      FOR EACH ROW WHEN (NEW.reason = 'Forzar rollback de auditoría')
      EXECUTE FUNCTION qa_reject_cost_audit()
    `;
    try {
      const adjustment = {
        ...dto,
        costAdjustmentReason: 'Forzar rollback de auditoría',
        items: [{ productId: product.id, quantity: 5, unitCost: 50 }],
      };
      await expect(
        service.create(company.id, adjustment, UserRole.ADMIN, false, actor),
      ).rejects.toThrow('QA forced audit failure');
      await expect(
        service.update(
          company.id,
          purchase.id,
          adjustment,
          UserRole.ADMIN,
          false,
          actor,
        ),
      ).rejects.toThrow('QA forced audit failure');
      expect(
        await db.purchase.findMany({
          where: { companyId: company.id },
          include: { items: true },
        }),
      ).toMatchObject([
        {
          id: purchase.id,
          subtotal: 200,
          items: [{ id: purchase.items[0].id, quantity: 2, price: 100 }],
        },
      ]);
      expect(
        await db.purchaseCostAudit.count({ where: { companyId: company.id } }),
      ).toBe(0);
    } finally {
      await db.$executeRaw`DROP TRIGGER qa_reject_cost_audit ON "PurchaseCostAudit"`;
      await db.$executeRaw`DROP FUNCTION qa_reject_cost_audit()`;
    }
  });

  it('chains concurrent changes to the actual previous price after the row lock', async () => {
    const { company, product, actor, dto } = await fixture();
    const purchase = await service.create(company.id, dto);
    const pending: Array<Promise<PromiseSettledResult<unknown>>> = [];
    let waiting = 0;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${purchase.id} FOR NO KEY UPDATE`;
      for (const unitCost of [90, 80]) {
        pending.push(
          Promise.allSettled([
            service.update(
              company.id,
              purchase.id,
              {
                ...dto,
                costAdjustmentReason: reason,
                items: [{ productId: product.id, quantity: 1, unitCost }],
              },
              UserRole.MANAGER,
              false,
              actor,
            ),
          ]).then(([result]) => result),
        );
      }
      const deadline = Date.now() + 3_000;
      while (waiting < 2 && Date.now() < deadline) {
        await tx.$queryRaw`SELECT pg_stat_clear_snapshot()::text`;
        const [row] = await tx.$queryRaw<Array<{ waiting: number }>>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE '%FOR NO KEY UPDATE%'
        `;
        waiting = row.waiting;
        if (waiting < 2) await delay(20);
      }
    });
    const settled = await Promise.all(pending);
    expect(waiting).toBe(2);
    expect(settled.map((result) => result.status)).toEqual([
      'fulfilled',
      'fulfilled',
    ]);
    const events = await history(company.id, purchase.id);
    expect(events).toHaveLength(2);
    const first = events.find((entry) =>
      entry.previousGrossUnitCost.equals(100),
    );
    const second = events.find(
      (entry) => !entry.previousGrossUnitCost.equals(100),
    );
    expect(first).toBeDefined();
    expect(second?.previousGrossUnitCost.toFixed(4)).toBe(
      first?.newGrossUnitCost.toFixed(4),
    );
    expect(
      (await db.purchaseItem.findFirst({ where: { purchaseId: purchase.id } }))
        ?.price,
    ).toBe(second?.newNetUnitCost.toNumber());
  }, 10_000);

  describe('Purchase cost audit over HTTP', () => {
    let app: INestApplication<App>;
    let order: Awaited<ReturnType<PurchasesService['create']>>;
    let tenant: Awaited<ReturnType<typeof fixture>>;
    const jwtSecret = randomUUID();
    const jwt = new JwtService({ secret: jwtSecret });

    beforeAll(async () => {
      tenant = await fixture();
      order = await service.create(
        tenant.company.id,
        {
          ...tenant.dto,
          costAdjustmentReason: reason,
          items: [{ productId: tenant.product.id, quantity: 2, unitCost: 90 }],
        },
        UserRole.ADMIN,
        false,
        tenant.actor,
      );
      const previousJwtSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = jwtSecret;
      try {
        const moduleRef = await Test.createTestingModule({
          imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
          controllers: [PurchasesController],
          providers: [
            JwtStrategy,
            JwtAuthGuard,
            RolesGuard,
            { provide: PrismaService, useValue: db },
            { provide: PurchasesService, useValue: service },
          ],
        }).compile();
        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
          new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
          }),
        );
        await app.init();
      } finally {
        if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousJwtSecret;
      }
    });

    afterAll(async () => {
      await app?.close();
    });

    it.each([
      [UserRole.ADMIN, false, 200],
      [UserRole.MANAGER, false, 200],
      [UserRole.WAREHOUSE, true, 200],
      [UserRole.WAREHOUSE, false, 403],
      [UserRole.SALES, false, 403],
    ])(
      'applies the stored %s role, delegated=%s, returning %s',
      async (role, delegated, status) => {
        const user = await db.user.create({
          data: {
            companyId: tenant.company.id,
            email: randomUUID() + '@example.test',
            firstName: 'HTTP',
            lastName: 'QA',
            passwordHash: 'unused-test-value',
            role,
            canAdjustPurchaseUnitCost: delegated,
          },
        });
        const token = jwt.sign({
          sub: user.id,
          email: user.email,
          companyId: user.companyId,
          role: status === 200 ? UserRole.SALES : UserRole.ADMIN,
          canAdjustPurchaseUnitCost: !delegated,
        });
        const response = await request(app.getHttpServer())
          .get('/purchases/' + order.id + '/cost-audit')
          .query({
            companyId: legacy.company.id,
            role: UserRole.ADMIN,
            canAdjustPurchaseUnitCost: true,
          })
          .set('Authorization', 'Bearer ' + token)
          .expect(status);
        if (status === 200) {
          expect(response.body as unknown).toMatchObject([
            {
              productId: tenant.product.id,
              actorUserId: tenant.actor.id,
              actorDisplayName: 'Ana Compras',
              actorRole: UserRole.ADMIN,
              previousGrossUnitCost: '100',
              newGrossUnitCost: '90',
              reason,
            },
          ]);
        }
      },
    );

    it('PATCH rejects missing or blank reasons without persisting changes and audits a justified adjustment', async () => {
      const { company, product, actor, dto } = await fixture(UserRole.MANAGER);
      const draft = await service.create(company.id, dto);
      const readDraft = () =>
        db.purchase.findUniqueOrThrow({
          where: { id: draft.id },
          include: { items: true },
        });
      const original = await readDraft();
      const auditWhere = { companyId: company.id, purchaseId: draft.id };
      const token = jwt.sign({
        sub: actor.id,
        email: actor.email,
        companyId: company.id,
        role: actor.role,
      });
      const adjustment = {
        ...dto,
        items: [{ productId: product.id, quantity: 2, unitCost: 90.125 }],
      };

      for (const reasonPayload of [
        {},
        { costAdjustmentReason: '' },
        { costAdjustmentReason: '   ' },
      ]) {
        const response = await request(app.getHttpServer())
          .patch('/purchases/' + draft.id)
          .set('Authorization', 'Bearer ' + token)
          .send({ ...adjustment, ...reasonPayload })
          .expect(400);
        expect(response.body as unknown).toMatchObject({
          message:
            'Describe el motivo del ajuste de costo o descuento (8 a 500 caracteres)',
        });
        expect(await readDraft()).toEqual(original);
        expect(await db.purchaseCostAudit.count({ where: auditWhere })).toBe(0);
      }

      await request(app.getHttpServer())
        .patch('/purchases/' + draft.id)
        .set('Authorization', 'Bearer ' + token)
        .send({ ...adjustment, costAdjustmentReason: reason })
        .expect(200);
      expect((await readDraft()).items).toMatchObject([
        { productId: product.id, price: 90.125, quantity: 2 },
      ]);
      const events = await db.purchaseCostAudit.findMany({ where: auditWhere });
      expect(events).toHaveLength(1);
      const [event] = events;
      expect(event).toMatchObject({
        ...auditWhere,
        productId: product.id,
        productDisplayName: product.name,
        actorUserId: actor.id,
        actorDisplayName: 'Ana Compras',
        actorRole: UserRole.MANAGER,
        reason,
      });
      expect({
        previousGross: event.previousGrossUnitCost.toFixed(4),
        newGross: event.newGrossUnitCost.toFixed(4),
        previousDiscount: event.previousDiscountPercent.toFixed(2),
        newDiscount: event.newDiscountPercent.toFixed(2),
        previousNet: event.previousNetUnitCost.toFixed(4),
        newNet: event.newNetUnitCost.toFixed(4),
      }).toEqual({
        previousGross: '100.0000',
        newGross: '90.1250',
        previousDiscount: '0.00',
        newDiscount: '0.00',
        previousNet: '100.0000',
        newNet: '90.1250',
      });
    });

    it('returns 404 for another company despite spoofed tenant inputs', async () => {
      const user = legacy.actor;
      const token = jwt.sign({
        sub: user.id,
        email: user.email,
        companyId: user.companyId,
        role: user.role,
      });
      await request(app.getHttpServer())
        .get('/purchases/' + order.id + '/cost-audit')
        .query({ companyId: tenant.company.id })
        .set('x-company-id', tenant.company.id)
        .set('Authorization', 'Bearer ' + token)
        .expect(404);
    });
  });
});
