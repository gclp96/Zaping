import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { CloudflareR2QuarantineWriter } from './cloudflare-r2-quarantine-write';
import {
  createR2ObjectKeys,
  requireTenantQuarantineR2Key,
} from './cloudflare-r2-object-keys';
import type { ValidatedQuarantinePayload } from './cloudflare-r2-quarantine-payload';

const bytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\n%%EOF\n');
const companyId = randomUUID();
const keys = createR2ObjectKeys(companyId, randomUUID());
const payload: ValidatedQuarantinePayload = {
  bytes,
  metadata: {
    contentType: 'application/pdf',
    originalName: 'reporte.pdf',
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  },
};

describe('R2 quarantine PutObject create-once writer', () => {
  const client = new S3Client({
    region: 'auto',
    endpoint:
      'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com',
    credentials: {
      accessKeyId: 'not-real',
      secretAccessKey: 'not-real',
    },
  });
  const writer = new CloudflareR2QuarantineWriter(
    client,
    'zaping-quarantine-qa',
  );
  const send = jest.spyOn(client, 'send');

  beforeEach(() => {
    jest.resetAllMocks();
    send.mockResolvedValue({ ETag: '"mock"' } as never);
  });

  afterAll(() => {
    client.destroy();
  });

  it('writes only to quarantine with fixed size, MIME and atomic no-overwrite', async () => {
    await writer.put(companyId, keys.quarantineKey, payload);
    expect(send).toHaveBeenCalledTimes(1);
    const [command, options] = send.mock.calls[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: 'zaping-quarantine-qa',
      Key: keys.quarantineKey,
      Body: bytes,
      ContentType: 'application/pdf',
      ContentLength: bytes.length,
      IfNoneMatch: '*',
      CacheControl: 'private, no-store',
    });
    expect(options).toMatchObject({
      abortSignal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it('refuses another tenant, private-bucket prefixes and URLs before SDK', async () => {
    for (const [key, tenant] of [
      [keys.quarantineKey, randomUUID()],
      [keys.privateKey, companyId],
      ['https://example.invalid/upload', companyId],
      [`quarantine/${companyId}/../../bad`, companyId],
    ]) {
      await expect(writer.put(tenant, key, payload)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a changed payload or incorrect digest before SDK', async () => {
    const tampered = {
      ...payload,
      bytes: Buffer.from(bytes),
    };
    tampered.bytes[6] = 0x58;
    await expect(
      writer.put(companyId, keys.quarantineKey, tampered),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('never returns the provider error, object key or bucket name', async () => {
    send.mockRejectedValueOnce(
      new Error('R2 secret/key should not be exposed'),
    );
    await expect(
      writer.put(companyId, keys.quarantineKey, payload),
    ).rejects.toThrow('Carga a cuarentena no confirmada');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('enforces Company ownership on opaque quarantine keys', () => {
    expect(requireTenantQuarantineR2Key(keys.quarantineKey, companyId)).toBe(
      keys.quarantineKey,
    );
    expect(() =>
      requireTenantQuarantineR2Key(keys.quarantineKey, randomUUID()),
    ).toThrow(BadRequestException);
  });

  it('does not accept a bucket name supplied as an unsafe path', () => {
    expect(() => new CloudflareR2QuarantineWriter(client, '../prod')).toThrow(
      BadRequestException,
    );
  });
});
