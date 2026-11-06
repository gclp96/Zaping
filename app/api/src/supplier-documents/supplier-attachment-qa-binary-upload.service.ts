import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SupplierAttachmentUploadReservationStatus,
  SupplierDocumentStatus,
  UserRole,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  inspectSupplierAttachment,
  SUPPLIER_ATTACHMENT_MAX_BYTES,
} from './supplier-document-attachment-validation';
import { QuarantineUploadWriterPort } from './zfiles-qa-quarantine-writer';
import { requireTenantQuarantineR2Key } from './cloudflare-r2-object-keys';

type ReceiveInput = {
  companyId: string;
  documentId: string;
  actorId: string;
  reservationId: string;
  declaredLength: string | undefined;
  contentType: string | undefined;
  contentEncoding: string | undefined;
  transferEncoding: string | undefined;
  source: Readable;
};

/**
 * QA-only HTTP ingestion boundary. The R2 PUT is create-once and does NOT
 * imply scan clearance, DB registration or an AVAILABLE document.
 */
@Injectable()
export class SupplierAttachmentQaBinaryUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: QuarantineUploadWriterPort,
  ) {}

  async receive(input: ReceiveInput): Promise<{
    id: string;
    status: 'QUARANTINE_WRITE_ACKNOWLEDGED_UNVERIFIED';
  }> {
    const {
      companyId,
      documentId,
      actorId,
      reservationId,
      source,
      declaredLength,
      contentType,
      contentEncoding,
      transferEncoding,
    } = input;
    if (
      !declaredLength ||
      !/^[1-9][0-9]*$/.test(declaredLength) ||
      contentEncoding !== undefined ||
      transferEncoding !== undefined ||
      !['application/pdf', 'image/jpeg'].includes(contentType ?? '')
    ) {
      throw new BadRequestException('Cabeceras de carga inválidas');
    }
    const size = Number(declaredLength);
    if (
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > SUPPLIER_ATTACHMENT_MAX_BYTES
    ) {
      throw new BadRequestException('Tamaño de carga inválido');
    }

    const actor = await this.prisma.user.findFirst({
      where: { id: actorId, companyId, isActive: true },
      select: { role: true },
    });
    if (
      !actor ||
      (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER)
    ) {
      throw new ForbiddenException('Sin permiso para cargar adjuntos');
    }

    const reservation =
      await this.prisma.supplierAttachmentUploadReservation.findFirst({
        where: {
          id: reservationId,
          companyId,
          documentId,
          createdById: actorId,
          status: SupplierAttachmentUploadReservationStatus.RESERVED,
          document: { is: { status: SupplierDocumentStatus.ACTIVE } },
        },
      });
    if (!reservation) {
      throw new NotFoundException('Reserva de adjunto no encontrada');
    }
    if (
      size !== reservation.sizeBytes ||
      contentType !== reservation.contentType
    ) {
      throw new BadRequestException('La carga no coincide con la reserva');
    }
    const expectedKey = [
      'quarantine',
      companyId.toLowerCase(),
      documentId.toLowerCase(),
      reservationId.toLowerCase(),
    ].join('/');
    requireTenantQuarantineR2Key(reservation.quarantineKey, companyId);
    if (reservation.quarantineKey !== expectedKey) {
      throw new BadRequestException('Reserva con clave inconsistente');
    }

    // HTTP application/pdf and image/jpeg bypass Nest's JSON/urlencoded
    // parsers. Never destroy a successfully consumed IncomingMessage: the
    // server still needs the socket to return the HTTP response.
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for await (const piece of source) {
        if (!(piece instanceof Uint8Array)) {
          throw new BadRequestException('Contenido de archivo inválido');
        }
        const bytes = Buffer.from(piece);
        total += bytes.length;
        if (total > size || total > SUPPLIER_ATTACHMENT_MAX_BYTES) {
          throw new BadRequestException('Archivo excede la reserva');
        }
        chunks.push(bytes);
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Recepción de archivo incompleta');
    }
    if (total !== size) {
      throw new BadRequestException('Longitud de archivo incompleta');
    }
    const bytes = Buffer.concat(chunks, total);
    const metadata = inspectSupplierAttachment({
      bytes,
      claimedMime: contentType,
      originalName: reservation.originalName,
    });
    if (
      createHash('sha256').update(bytes).digest('hex') !== reservation.sha256
    ) {
      throw new BadRequestException('El archivo no coincide con la reserva');
    }
    // The durable write-intent fence wins a race against cancellation under
    // the SAME SupplierDocument lock as quota reservations. No R2 operation
    // may start before it commits. Any failure after this remains ambiguous:
    // the quota stays reserved until explicit R2 reconciliation.
    await this.claimWriteIntent({
      companyId,
      documentId,
      actorId,
      reservationId,
    });
    await this.writer.put(companyId, expectedKey, { metadata, bytes });
    // This is a PUT acknowledgement, NOT a scanner or database clearance.
    // The reconciliation worker must still verify exact bytes via R2 GET.
    return {
      id: reservationId,
      status: 'QUARANTINE_WRITE_ACKNOWLEDGED_UNVERIFIED',
    };
  }

  private async claimWriteIntent(scope: {
    companyId: string;
    documentId: string;
    actorId: string;
    reservationId: string;
  }): Promise<void> {
    const { companyId, documentId, actorId, reservationId } = scope;
    await this.prisma.$transaction(
      async (tx) => {
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
        const changed =
          await tx.supplierAttachmentUploadReservation.updateMany({
            where: {
              id: reservationId,
              companyId,
              documentId,
              createdById: actorId,
              status: SupplierAttachmentUploadReservationStatus.RESERVED,
              writeAttemptedAt: null,
            },
            data: { writeAttemptedAt: new Date() },
          });
        if (changed.count !== 1) {
          throw new ConflictException(
            'Reserva cancelada o escritura ya iniciada',
          );
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5000,
        timeout: 15000,
      },
    );
  }
}
