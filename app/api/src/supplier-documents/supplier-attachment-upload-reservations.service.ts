import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SupplierAttachmentUploadReservationStatus,
  SupplierDocumentAttachmentStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createR2ObjectKeys } from './cloudflare-r2-object-keys';
import {
  SUPPLIER_ATTACHMENT_MAX_BYTES,
  SUPPLIER_ATTACHMENT_MAX_PER_DOCUMENT,
  type InspectedSupplierAttachment,
} from './supplier-document-attachment-validation';

export const SUPPLIER_ATTACHMENT_MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;

type ReserveInput = {
  companyId: string;
  documentId: string;
  actorId: string;
  requestKey: string;
  metadata: InspectedSupplierAttachment;
};

/**
 * Internal DB-only reservation boundary. No controller, S3 call or auto-scan.
 *
 * Every future writer that registers/unregisters document attachment bytes
 * MUST acquire the same SupplierDocument row lock before changing quota state.
 * Without that invariant an aggregate alone cannot protect concurrency.
 */
@Injectable()
export class SupplierAttachmentUploadReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(input: ReserveInput) {
    const { companyId, documentId, actorId, metadata } = input;
    const key = input.requestKey.trim();
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) {
      throw new BadRequestException('Clave de reserva inválida');
    }
    if (
      !Number.isSafeInteger(metadata.sizeBytes) ||
      metadata.sizeBytes < 1 ||
      metadata.sizeBytes > SUPPLIER_ATTACHMENT_MAX_BYTES ||
      !/^[0-9a-f]{64}$/.test(metadata.sha256) ||
      !['application/pdf', 'image/jpeg'].includes(metadata.contentType) ||
      !metadata.originalName ||
      Buffer.byteLength(metadata.originalName, 'utf8') > 255 ||
      /[\\/]/u.test(metadata.originalName) ||
      Array.from(metadata.originalName).some((char) => {
        const code = char.codePointAt(0) ?? 0;
        return code < 32 || code === 127;
      })
    ) {
      throw new BadRequestException('Metadatos de reserva inválidos');
    }

    return this.prisma.$transaction(
      async (tx) => {
        // Serialize reservations *per tenant/document*, including quota reads.
        // SQL structure is fixed. Prisma.sql binds user-generated identifiers.
        const locked = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "SupplierDocument"
            WHERE "id" = ${documentId} AND "companyId" = ${companyId}
              AND "status" = 'ACTIVE'
            FOR UPDATE`,
        );
        if (locked.length !== 1) {
          throw new NotFoundException('Documento activo no encontrado');
        }

        const actor = await tx.user.findFirst({
          where: { id: actorId, companyId, isActive: true },
          select: { role: true },
        });
        if (
          !actor ||
          (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER)
        ) {
          throw new ForbiddenException('Sin permiso para cargar adjuntos');
        }

        const previous =
          await tx.supplierAttachmentUploadReservation.findUnique({
            where: {
              companyId_documentId_requestKey: {
                companyId,
                documentId,
                requestKey: key,
              },
            },
          });
        if (previous) {
          if (
            previous.createdById !== actorId ||
            previous.originalName !== metadata.originalName ||
            previous.contentType !== metadata.contentType ||
            previous.sizeBytes !== metadata.sizeBytes ||
            previous.sha256 !== metadata.sha256 ||
            previous.status ===
              SupplierAttachmentUploadReservationStatus.RELEASED_VERIFIED_EMPTY
          ) {
            throw new ConflictException(
              'Clave de reserva reutilizada con datos diferentes',
            );
          }
          return {
            id: previous.id,
            status: previous.status,
            sizeBytes: previous.sizeBytes,
            createdAt: previous.createdAt,
          };
        }

        const [existing, reservations] = await Promise.all([
          tx.supplierDocumentAttachment.aggregate({
            where: {
              companyId,
              documentId,
              status: { not: SupplierDocumentAttachmentStatus.REMOVED },
            },
            _count: { _all: true },
            _sum: { sizeBytes: true },
          }),
          tx.supplierAttachmentUploadReservation.aggregate({
            where: {
              companyId,
              documentId,
              status: {
                in: [
                  SupplierAttachmentUploadReservationStatus.RESERVED,
                  SupplierAttachmentUploadReservationStatus.RECONCILE_REQUIRED,
                ],
              },
            },
            _count: { _all: true },
            _sum: { sizeBytes: true },
          }),
        ]);
        const count = existing._count._all + reservations._count._all;
        const bytes =
          (existing._sum.sizeBytes ?? 0) + (reservations._sum.sizeBytes ?? 0);
        if (
          count >= SUPPLIER_ATTACHMENT_MAX_PER_DOCUMENT ||
          bytes + metadata.sizeBytes > SUPPLIER_ATTACHMENT_MAX_DOCUMENT_BYTES
        ) {
          throw new ConflictException('Cuota de adjuntos agotada');
        }

        const keys = createR2ObjectKeys(companyId, documentId);
        const reserved = await tx.supplierAttachmentUploadReservation.create({
          data: {
            id: keys.attachmentId,
            companyId,
            documentId,
            createdById: actorId,
            requestKey: key,
            quarantineKey: keys.quarantineKey,
            originalName: metadata.originalName,
            contentType: metadata.contentType,
            sizeBytes: metadata.sizeBytes,
            sha256: metadata.sha256,
            status: SupplierAttachmentUploadReservationStatus.RESERVED,
          },
        });
        // Never return quarantineKey, object-store credentials or digest to UI.
        return {
          id: reserved.id,
          status: reserved.status,
          sizeBytes: reserved.sizeBytes,
          createdAt: reserved.createdAt,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5000,
        timeout: 15000,
      },
    );
  }
}
