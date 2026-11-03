import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createConnection, type Socket } from 'node:net';
import { isAbsolute } from 'node:path';
import { SUPPLIER_ATTACHMENT_MAX_BYTES } from '../supplier-documents/supplier-document-attachment-validation';

/**
 * Only a scanner protocol outcome, NOT a malware-clearance attestation.\n * Do not use this verdict alone to mark files AVAILABLE.
 * ClamAV signature freshness, worker identity and policy gates are separate.
 */
export type ClamAvProtocolVerdict = 'CLAMD_OK_UNATTESTED' | 'MALWARE_DETECTED';

const FRAME_BYTES = 64 * 1024;
const MAX_REPLY_BYTES = 512;

/**
 * ZFILES-R2-03B1 local laboratory-only Unix-socket ClamAV INSTREAM.\n * Not registered by any NestJS module, route, job, or production process.
 * A TCP clamd socket has no authentication; never expose one to the internet.
 * No files are given to clamd by host path, and no user-provided paths exist.
 */
export class ClamAvInstreamScanner {
  constructor(
    private readonly socketPath: string,
    private readonly timeoutMs = 15_000,
  ) {
    if (
      !isAbsolute(socketPath) ||
      socketPath.includes('\0') ||
      /[\r\n]/u.test(socketPath) ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1_000 ||
      timeoutMs > 60_000
    ) {
      throw new BadRequestException('Configuración del escáner inválida');
    }
  }

  async scan(bytes: Buffer): Promise<ClamAvProtocolVerdict> {
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.length < 1 ||
      bytes.length > SUPPLIER_ATTACHMENT_MAX_BYTES
    ) {
      throw new BadRequestException('Tamaño inválido para análisis');
    }

    return new Promise<ClamAvProtocolVerdict>((resolve, reject) => {
      const socket = createConnection({ path: this.socketPath });
      let settled = false;
      let response = Buffer.alloc(0);
      const unavailable = () =>
        new ServiceUnavailableException('Análisis antimalware no confirmado');

      const finish = (outcome: ClamAvProtocolVerdict | Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (outcome instanceof Error) {
          reject(outcome);
        } else {
          resolve(outcome);
        }
      };

      const timer = setTimeout(() => finish(unavailable()), this.timeoutMs);
      socket.on('error', () => finish(unavailable()));
      socket.on('close', () => {
        if (!settled) finish(unavailable());
      });
      socket.on('data', (chunk: Buffer) => {
        response = Buffer.concat([response, chunk]);
        if (response.length > MAX_REPLY_BYTES) {
          finish(unavailable());
          return;
        }
        const terminator = response.indexOf(0);
        if (terminator === -1) return;
        // z-framed response is exactly one zero-terminated record.
        if (terminator !== response.length - 1) {
          finish(unavailable());
          return;
        }
        const reply = response.subarray(0, terminator).toString('utf8');
        if (reply === 'stream: OK') {
          finish('CLAMD_OK_UNATTESTED');
        } else if (/^stream: [^\r\n\0]{1,200} FOUND$/u.test(reply)) {
          finish('MALWARE_DETECTED');
        } else {
          // Size limit exceeded, engine fault, malformed/truncated reply,
          // or an unexpected result is never equivalent to a clean scan.
          finish(unavailable());
        }
      });
      socket.once('connect', () => {
        void this.sendInstream(socket, bytes).catch(() =>
          finish(unavailable()),
        );
      });
    });
  }

  private async sendInstream(socket: Socket, bytes: Buffer): Promise<void> {
    await this.write(socket, Buffer.from('zINSTREAM\0', 'ascii'));
    for (let offset = 0; offset < bytes.length; offset += FRAME_BYTES) {
      if (socket.destroyed) throw new Error('Scanner disconnected');
      const chunk = bytes.subarray(offset, offset + FRAME_BYTES);
      const length = Buffer.alloc(4);
      length.writeUInt32BE(chunk.length, 0);
      await this.write(socket, length);
      await this.write(socket, chunk);
    }
    await this.write(socket, Buffer.alloc(4)); // 0-length final frame
  }

  private write(socket: Socket, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.write(data, (error?: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
