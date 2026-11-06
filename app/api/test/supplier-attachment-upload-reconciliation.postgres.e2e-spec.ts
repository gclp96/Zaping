import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import {
  PrismaClient,
  SupplierAttachmentReconcileAction,
  SupplierAttachmentUploadReservationStatus,
  SupplierDocumentAttachmentStatus,
  SupplierDocumentType,
} from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupplierAttachmentUploadReservationsService } from '../src/supplier-documents/supplier-attachment-upload-reservations.service';
import { SupplierAttachmentUploadReconciliationService } from '../src/supplier-documents/supplier-attachment-upload-reconciliation.service';

const describePg =
  process.env.RUN_SUPPLIER_UPLOAD_RECONCILIATION_PG === '1'
    ? describe
    : describe.skip;

describePg('B3d3 isolated PostgreSQL quarantine reconciliation', () => {
  let db: PrismaClient;
  let reservations: SupplierAttachmentUploadReservationsService;
  let reconciliation: SupplierAttachmentUploadReconciliationService;
  const verifier = { verify: jest.fn() };

  async function fixture() {
    const companyId = randomUUID();
    const actorId = randomUUID();
    await db.company.create({
      data: { id: companyId, name: 'B3d3 isolation', rfc: companyId },
    });
    await db.user.create({
      data: {
        id: actorId,
        companyId,
        firstName: 'QA',
        lastName: 'Verifier',
        email: actorId + '@example.invalid',
        passwordHash: 'NOT_A_LOGIN',
        role: 'ADMIN',
      },
    });
    const supplier = await db.supplier.create({
      data: { companyId, name: 'Supplier B3d3' },
    });
    const document = await db.supplierDocument.create({
      data: {
        companyId,
        supplierId: supplier.id,
        type: SupplierDocumentType.REMISION,
        number: randomUUID(),
        normalizedNumber: randomUUID(),
        documentDate: new Date('2026-10-26T00:00:00.000Z'),
        createdById: actorId,
      },
    });
    const reserved = await reservations.reserve({
      companyId,
      documentId: document.id,
      actorId,
      requestKey: randomUUID(),
      metadata: {
        originalName: 'evidencia.pdf',
        contentType: 'application/pdf',
        sizeBytes: 42,
        sha256: 'a'.repeat(64),
      },
    });
    return {
      companyId,
      documentId: document.id,
      reservationId: reserved.id,
    };
  }

  beforeAll(async () => {
    const raw = process.env.DATABASE_URL;
    if (
      !raw ||
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.CI !== 'true'
    ) {
      throw new Error('B3d3 requires isolated GitHub Actions PostgreSQL');
    }
    const target = new URL(raw);
    if (
      !['localhost', '127.0.0.1'].includes(target.hostname) ||
      target.port !== '5432' ||
      target.pathname !== '/zaping_test' ||
      target.username !== 'ci'
    ) {
      throw new Error('Unsafe B3d3 PostgreSQL target');
    }
    db = new PrismaClient({ datasources: { db: { url: raw } } });
    const [identity] = await db.$queryRawUnsafe<
      { database: string; role: string }[]
    >('SELECT current_database() AS database, current_user AS role');
    expect(identity).toEqual({ database: 'zaping_test', role: 'ci' });
    reservations = new SupplierAttachmentUploadReservationsService(
      db as unknown as PrismaService,
    );
    reconciliation = new SupplierAttachmentUploadReconciliationService(
      db as unknown as PrismaService,
      verifier,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    verifier.verify.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('verifies quarantined object and atomically registers PENDING_SCAN, never AVAILABLE', async () => {
    const f = await fixture();
    const result = await reconciliation.reconcile(f);
    expect(result).toEqual({
      id: f.reservationId,
      status: SupplierAttachmentUploadReservationStatus.REGISTERED,
    });
    expect(verifier.verify).toHaveBeenCalledWith(
      f.companyId,
      'quarantine/' + f.companyId + '/' + f.documentId + '/' + f.reservationId,
      42,
      'a'.repeat(64),
    );
    const attachment = await db.supplierDocumentAttachment.findUniqueOrThrow({
      where: { id: f.reservationId },
    });
    expect(attachment).toMatchObject({
      companyId: f.companyId,
      documentId: f.documentId,
      status: SupplierDocumentAttachmentStatus.PENDING_SCAN,
      storageKey:
        'private/' + f.companyId + '/' + f.documentId + '/' + f.reservationId,
      scannedAt: null,
    });
    const event = await db.supplierAttachmentReconcileEvent.findMany({
      where: { companyId: f.companyId, reservationId: f.reservationId },
    });
    expect(event.map((e) => e.action)).toEqual([
      SupplierAttachmentReconcileAction.QUARANTINE_VERIFIED,
    ]);
    await reconciliation.reconcile(f);
    expect(verifier.verify).toHaveBeenCalledTimes(1);
    expect(
      await db.supplierDocumentAttachment.count({
        where: { id: f.reservationId },
      }),
    ).toBe(1);
  });

  it('marks unavailable or ambiguous R2 read for review, keeps quota reserved', async () => {
    const f = await fixture();
    verifier.verify.mockRejectedValueOnce(
      new Error('S3 credentials must never leak'),
    );
    const result = await reconciliation.reconcile(f);
    expect(result.status).toBe(
      SupplierAttachmentUploadReservationStatus.RECONCILE_REQUIRED,
    );
    expect(
      await db.supplierDocumentAttachment.count({
        where: { id: f.reservationId },
      }),
    ).toBe(0);
    expect(
      await db.supplierAttachmentUploadReservation.count({
        where: {
          companyId: f.companyId,
          documentId: f.documentId,
          status: SupplierAttachmentUploadReservationStatus.RECONCILE_REQUIRED,
        },
      }),
    ).toBe(1);
    expect(
      await db.supplierAttachmentReconcileEvent.count({
        where: {
          companyId: f.companyId,
          reservationId: f.reservationId,
          action: SupplierAttachmentReconcileAction.NEEDS_REVIEW,
        },
      }),
    ).toBe(1);
    const recovered = await reconciliation.reconcile(f);
    expect(recovered.status).toBe(
      SupplierAttachmentUploadReservationStatus.REGISTERED,
    );
    expect(
      await db.supplierAttachmentReconcileEvent.count({
        where: { companyId: f.companyId, reservationId: f.reservationId },
      }),
    ).toBe(2);
  });

  it('serializes concurrent confirmations into one attachment and one verified event', async () => {
    const f = await fixture();
    const results = await Promise.all([
      reconciliation.reconcile(f),
      reconciliation.reconcile(f),
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'REGISTERED')).toBe(true);
    expect(
      await db.supplierDocumentAttachment.count({
        where: { companyId: f.companyId, documentId: f.documentId },
      }),
    ).toBe(1);
    expect(
      await db.supplierAttachmentReconcileEvent.count({
        where: { companyId: f.companyId, reservationId: f.reservationId },
      }),
    ).toBe(1);
  });

  it('rejects other companies before accessing quarantine object', async () => {
    const a = await fixture();
    const b = await fixture();
    await expect(
      reconciliation.reconcile({
        ...a,
        companyId: b.companyId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('database rejects fabricated REGISTERED or quota-release transitions', async () => {
    const f = await fixture();
    await expect(
      db.supplierAttachmentUploadReservation.update({
        where: { id: f.reservationId },
        data: { status: SupplierAttachmentUploadReservationStatus.REGISTERED },
      }),
    ).rejects.toThrow();
    await expect(
      db.supplierAttachmentUploadReservation.update({
        where: { id: f.reservationId },
        data: {
          status:
            SupplierAttachmentUploadReservationStatus.RELEASED_VERIFIED_EMPTY,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.supplierAttachmentUploadReservation.update({
        where: { id: f.reservationId },
        data: { sha256: 'b'.repeat(64) },
      }),
    ).rejects.toThrow();
  });

  it('audit events cannot be altered or removed', async () => {
    const f = await fixture();
    await reconciliation.reconcile(f);
    const audit = await db.supplierAttachmentReconcileEvent.findFirstOrThrow({
      where: { reservationId: f.reservationId },
    });
    await expect(
      db.supplierAttachmentReconcileEvent.update({
        where: { id: audit.id },
        data: { action: SupplierAttachmentReconcileAction.NEEDS_REVIEW },
      }),
    ).rejects.toThrow();
    await expect(
      db.supplierAttachmentReconcileEvent.delete({
        where: { id: audit.id },
      }),
    ).rejects.toThrow();
  });
});
