import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SupplierAttachmentReconcileAction,
  SupplierAttachmentUploadReservationStatus,
  SupplierDocumentAttachmentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenantQuarantineR2Key } from './cloudflare-r2-object-keys';
import { QuarantineObjectVerifier } from './cloudflare-r2-quarantine-verifier';

type Scope = {
  companyId: string;
  documentId: string;
  reservationId: string;
};

type Result = {
  id: string;
  status: SupplierAttachmentUploadReservationStatus;
};

/**
 * Internal worker-only orchestration. No HTTP entry point or provider wiring.
 *
 * R2 verification is outside the transaction: never hold PostgreSQL locks
 * during network operations. The R2 key is create-once; the DB lock serializes
 * registration and quota consumption. No release/expiry is implemented.
 */
@Injectable()
export class SupplierAttachmentUploadReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: QuarantineObjectVerifier,
  ) {}

  async reconcile(scope: Scope): Promise<Result> {
    const { companyId, documentId, reservationId } = scope;
    const reservation =
      await this.prisma.supplierAttachmentUploadReservation.findFirst({
        where: { id: reservationId, companyId, documentId },
      });
    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada');
    }
    if (
      reservation.status ===
      SupplierAttachmentUploadReservationStatus.REGISTERED
    ) {
      return { id: reservation.id, status: reservation.status };
    }
    if (
      reservation.status !==
        SupplierAttachmentUploadReservationStatus.RESERVED &&
      reservation.status !==
        SupplierAttachmentUploadReservationStatus.RECONCILE_REQUIRED
    ) {
      throw new ConflictException('Reserva no conciliable');
    }
    const expectedKey = [
      'quarantine',
      companyId.toLowerCase(),
      documentId.toLowerCase(),
      reservationId.toLowerCase(),
    ].join('/');
    requireTenantQuarantineR2Key(reservation.quarantineKey, companyId);
    if (reservation.quarantineKey.toLowerCase() !== expectedKey) {
      throw new ConflictException('Clave de reserva inconsistente');
    }

    try {
      await this.verifier.verify(
        companyId,
        reservation.quarantineKey,
        reservation.sizeBytes,
        reservation.sha256,
      );
    } catch {
      return this.flagForReview(scope);
    }

    return this.registerVerified(scope);
  }

  private async registerVerified(scope: Scope): Promise<Result> {
    const { companyId, documentId, reservationId } = scope;
    return this.prisma.$transaction(async (tx) => {
      await this.lockDocument(tx, companyId, documentId);
      const reservation =
        await tx.supplierAttachmentUploadReservation.findFirst({
          where: { id: reservationId, companyId, documentId },
        });
      if (!reservation) throw new NotFoundException('Reserva no encontrada');
      if (
        reservation.status ===
        SupplierAttachmentUploadReservationStatus.REGISTERED
      ) {
        return { id: reservation.id, status: reservation.status };
      }
      if (
        reservation.status !==
          SupplierAttachmentUploadReservationStatus.RESERVED &&
        reservation.status !==
          SupplierAttachmentUploadReservationStatus.RECONCILE_REQUIRED
      ) {
        throw new ConflictException('Reserva no conciliable');
      }
      const expected = [
        'quarantine',
        companyId.toLowerCase(),
        documentId.toLowerCase(),
        reservationId.toLowerCase(),
      ].join('/');
      if (reservation.quarantineKey !== expected) {
        throw new ConflictException('Clave de reserva inconsistente');
      }
      const exists = await tx.supplierDocumentAttachment.findUnique({
        where: { id: reservation.id },
      });
      if (exists) {
        throw new ConflictException('Existe un adjunto con este identificador');
      }

      // Attachment metadata and reservation transition are atomic. The
      // private-key metadata points to the FUTURE approved location; while
      // PENDING_SCAN nothing is listable or downloadable by users.
      await tx.supplierDocumentAttachment.create({
        data: {
          id: reservation.id,
          companyId,
          documentId,
          uploadedById: reservation.createdById,
          storageKey: reservation.quarantineKey.replace(
            /^quarantine\//,
            'private/',
          ),
          originalName: reservation.originalName,
          contentType: reservation.contentType,
          sizeBytes: reservation.sizeBytes,
          sha256: reservation.sha256,
          status: SupplierDocumentAttachmentStatus.PENDING_SCAN,
        },
      });
      await tx.supplierAttachmentUploadReservation.update({
        where: { id: reservation.id },
        data: {
          status: SupplierAttachmentUploadReservationStatus.REGISTERED,
        },
      });
      await tx.supplierAttachmentReconcileEvent.create({
        data: {
          companyId,
          reservationId: reservation.id,
          action: SupplierAttachmentReconcileAction.QUARANTINE_VERIFIED,
        },
      });
      return {
        id: reservation.id,
        status: SupplierAttachmentUploadReservationStatus.REGISTERED,
      };
    });
  }

  private async flagForReview(scope: Scope): Promise<Result> {
    const { companyId, documentId, reservationId } = scope;
    return this.prisma.$transaction(async (tx) => {
      await this.lockDocument(tx, companyId, documentId);
      const reservation =
        await tx.supplierAttachmentUploadReservation.findFirst({
          where: { id: reservationId, companyId, documentId },
        });
      if (!reservation) throw new NotFoundException('Reserva no encontrada');
      if (
        reservation.status ===
          SupplierAttachmentUploadReservationStatus.REGISTERED ||
        reservation.status ===
          SupplierAttachmentUploadReservationStatus.RECONCILE_REQUIRED
      ) {
        return { id: reservation.id, status: reservation.status };
      }
      if (
        reservation.status !==
        SupplierAttachmentUploadReservationStatus.RESERVED
      ) {
        throw new ConflictException('Reserva no conciliable');
      }
      await tx.supplierAttachmentUploadReservation.update({
        where: { id: reservation.id },
        data: {
          status: SupplierAttachmentUploadReservationStatus.RECONCILE_REQUIRED,
        },
      });
      await tx.supplierAttachmentReconcileEvent.create({
        data: {
          companyId,
          reservationId: reservation.id,
          action: SupplierAttachmentReconcileAction.NEEDS_REVIEW,
        },
      });
      return {
        id: reservation.id,
        status: SupplierAttachmentUploadReservationStatus.RECONCILE_REQUIRED,
      };
    });
  }

  private async lockDocument(
    tx: Prisma.TransactionClient,
    companyId: string,
    documentId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "SupplierDocument"
        WHERE "id" = ${documentId} AND "companyId" = ${companyId}
        FOR UPDATE`,
    );
    if (rows.length !== 1) {
      throw new NotFoundException('Documento no encontrado');
    }
  }
}
