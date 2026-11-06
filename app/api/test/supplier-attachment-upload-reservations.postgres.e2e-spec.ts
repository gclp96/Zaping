import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaClient,
  SupplierAttachmentUploadReservationStatus,
  SupplierDocumentType,
} from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupplierAttachmentUploadReservationsService } from '../src/supplier-documents/supplier-attachment-upload-reservations.service';

const describePg =
  process.env.RUN_SUPPLIER_UPLOAD_RESERVATIONS_PG === '1'
    ? describe
    : describe.skip;

describePg('B3d2 real PostgreSQL quota and concurrency', () => {
  let db: PrismaClient;
  let service: SupplierAttachmentUploadReservationsService;

  async function fixture(role: 'ADMIN' | 'SALES' = 'ADMIN') {
    const companyId = randomUUID();
    const actorId = randomUUID();
    await db.company.create({
      data: { id: companyId, name: 'B3d2 isolated fixture', rfc: companyId },
    });
    await db.user.create({
      data: {
        id: actorId,
        companyId,
        firstName: 'QA',
        lastName: 'Reservation',
        email: actorId + '@example.invalid',
        passwordHash: 'NOT_A_LOGIN',
        role,
      },
    });
    const supplier = await db.supplier.create({
      data: { companyId, name: 'Supplier B3d2 isolated' },
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
    return { companyId, actorId, documentId: document.id };
  }

  const metadata = {
    originalName: 'evidencia.pdf',
    contentType: 'application/pdf' as const,
    sizeBytes: 512,
    sha256: 'a'.repeat(64),
  };

  function input(
    f: Awaited<ReturnType<typeof fixture>>,
    requestKey = randomUUID(),
  ) {
    return { ...f, requestKey, metadata };
  }

  beforeAll(async () => {
    const raw = process.env.DATABASE_URL;
    if (
      !raw ||
      process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.CI !== 'true'
    ) {
      throw new Error('B3d2 requires isolated GitHub Actions database');
    }
    const url = new URL(raw);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.port !== '5432' ||
      url.pathname !== '/zaping_test' ||
      url.username !== 'ci'
    ) {
      throw new Error('Unsafe B3d2 PostgreSQL target');
    }
    db = new PrismaClient({ datasources: { db: { url: raw } } });
    const [identity] = await db.$queryRawUnsafe<
      { database: string; role: string }[]
    >('SELECT current_database() AS database, current_user AS role');
    expect(identity).toEqual({ database: 'zaping_test', role: 'ci' });
    service = new SupplierAttachmentUploadReservationsService(
      db as unknown as PrismaService,
    );
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('reserves with opaque quarantine path and returns no storage key or hash', async () => {
    const f = await fixture();
    const result = await service.reserve(input(f));
    expect(Object.keys(result).sort()).toEqual([
      'createdAt',
      'id',
      'sizeBytes',
      'status',
    ]);
    expect(result.status).toBe(
      SupplierAttachmentUploadReservationStatus.RESERVED,
    );
    const persisted =
      await db.supplierAttachmentUploadReservation.findUniqueOrThrow({
        where: { id: result.id },
      });
    expect(persisted.quarantineKey).toBe(
      `quarantine/${f.companyId}/${f.documentId}/${result.id}`,
    );
    expect(persisted.sha256).toBe(metadata.sha256);
  });

  it('serializes concurrent attempts and never admits more than 10 files', async () => {
    const f = await fixture();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => service.reserve(input(f))),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(10);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(2);
    expect(
      await db.supplierAttachmentUploadReservation.count({
        where: { companyId: f.companyId, documentId: f.documentId },
      }),
    ).toBe(10);
  }, 60_000);

  it('replays identical keys without double-reserving, rejects different metadata', async () => {
    const f = await fixture();
    const same = input(f);
    const [one, two] = await Promise.all([
      service.reserve(same),
      service.reserve(same),
    ]);
    expect(one.id).toEqual(two.id);
    await expect(
      service.reserve({
        ...same,
        metadata: { ...metadata, sha256: 'b'.repeat(64) },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await db.supplierAttachmentUploadReservation.count({
        where: { documentId: f.documentId, companyId: f.companyId },
      }),
    ).toBe(1);
  });

  it('counts scanner-gated attachments against available document quota', async () => {
    const f = await fixture();
    for (let i = 0; i < 9; i++) {
      await db.supplierDocumentAttachment.create({
        data: {
          companyId: f.companyId,
          documentId: f.documentId,
          uploadedById: f.actorId,
          storageKey: 'quarantine/' + randomUUID(),
          originalName: 'evidencia.pdf',
          contentType: 'application/pdf',
          sizeBytes: 512,
          sha256: metadata.sha256,
        },
      });
    }
    await service.reserve(input(f));
    await expect(service.reserve(input(f))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('blocks wrong Company and non-management actor before reservation', async () => {
    const a = await fixture();
    const b = await fixture();
    const sales = await fixture('SALES');
    await expect(
      service.reserve({ ...input(a), companyId: b.companyId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.reserve(input(sales))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('enforces immutable ledger: rejects direct UPDATE and DELETE', async () => {
    const f = await fixture();
    const row = await service.reserve(input(f));
    await expect(
      db.supplierAttachmentUploadReservation.update({
        where: { id: row.id },
        data: { status: SupplierAttachmentUploadReservationStatus.REGISTERED },
      }),
    ).rejects.toThrow();
    await expect(
      db.supplierAttachmentUploadReservation.delete({
        where: { id: row.id },
      }),
    ).rejects.toThrow();
    const still =
      await db.supplierAttachmentUploadReservation.findUniqueOrThrow({
        where: { id: row.id },
      });
    expect(still.status).toBe(
      SupplierAttachmentUploadReservationStatus.RESERVED,
    );
  });
});
