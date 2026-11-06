import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createR2ObjectKeys } from './cloudflare-r2-object-keys';
import { CloudflareR2QuarantineVerifier } from './cloudflare-r2-quarantine-verifier';

describe('Quarantine R2 verification boundary', () => {
  const companyId = randomUUID();
  const { quarantineKey, privateKey } = createR2ObjectKeys(
    companyId,
    randomUUID(),
  );
  const bytes = Buffer.from('%PDF-1.7\n%%EOF\n');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const client = new S3Client({
    region: 'auto',
    endpoint:
      'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com',
    credentials: { accessKeyId: 'fake', secretAccessKey: 'fake' },
  });
  const send = jest.spyOn(client, 'send');
  const verifier = new CloudflareR2QuarantineVerifier(
    client,
    'zaping-quarantine-qa',
  );

  beforeEach(() => {
    jest.resetAllMocks();
    send.mockResolvedValue({ Body: Readable.from([bytes]) } as never);
  });
  afterAll(() => client.destroy());

  it('reads only quarantine tenant key and checks complete bytes', async () => {
    await verifier.verify(companyId, quarantineKey, bytes.length, sha256);
    expect(send).toHaveBeenCalledTimes(1);
    const [command] = send.mock.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect((command as GetObjectCommand).input).toEqual({
      Bucket: 'zaping-quarantine-qa',
      Key: quarantineKey,
    });
  });

  it('blocks cross-tenant and private prefixes before making R2 requests', async () => {
    await expect(
      verifier.verify(randomUUID(), quarantineKey, bytes.length, sha256),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      verifier.verify(companyId, privateKey, bytes.length, sha256),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed on mismatched hash or truncated content, hiding provider errors', async () => {
    await expect(
      verifier.verify(companyId, quarantineKey, bytes.length, 'b'.repeat(64)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    send.mockResolvedValueOnce({
      Body: Readable.from([bytes.subarray(0, 4)]),
    } as never);
    await expect(
      verifier.verify(companyId, quarantineKey, bytes.length, sha256),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    send.mockRejectedValueOnce(new Error('Sensitive R2 provider response'));
    await expect(
      verifier.verify(companyId, quarantineKey, bytes.length, sha256),
    ).rejects.toThrow('Verificación de cuarentena no confirmada');
  });

  it('rejects invalid bucket at construction', () => {
    expect(
      () => new CloudflareR2QuarantineVerifier(client, '../bucket'),
    ).toThrow(BadRequestException);
  });
});
