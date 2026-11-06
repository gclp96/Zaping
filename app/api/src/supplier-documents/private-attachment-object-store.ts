import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Readable } from 'node:stream';

/**
 * Private storage port. The implementation must authenticate with server-only
 * credentials, enforce bucket privacy, and resolve exact opaque keys only.
 * Never accept user-supplied URLs, buckets or object keys.
 */
export abstract class PrivateAttachmentObjectStore {
  abstract openReadOnly(storageKey: string): Promise<Readable>;
}

/**
 * Intentional fail-closed default until a real authenticated S3-compatible
 * adapter and mandatory malware scanner are configured and integration-tested.
 */
@Injectable()
export class UnconfiguredPrivateAttachmentStore extends PrivateAttachmentObjectStore {
  openReadOnly(): Promise<Readable> {
    return Promise.reject(
      new ServiceUnavailableException(
        'Descargas no disponibles hasta configurar almacenamiento privado y escaneo',
      ),
    );
  }
}
