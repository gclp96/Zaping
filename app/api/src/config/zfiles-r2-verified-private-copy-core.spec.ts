import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  signScanEvidence,
  type EvidenceVerificationPolicy,
  type ScanEvidenceClaims,
} from './zfiles-signed-scan-evidence-lab';
import {
  ZfilesVerifiedPrivateCopyCore,
  type TrustedPromotionCandidate,
} from './zfiles-r2-verified-private-copy-core';

const keys = generateKeyPairSync('ed25519');
const now = Date.parse('2026-11-04T14:00:00.000Z');
const pdf = Buffer.from('%PDF-1.4\nSynthetic Zaping QA document\n%%EOF\n');
const hash = createHash('sha256').update(pdf).digest('hex');
const companyId = randomUUID();
const documentId = randomUUID();
const attachmentId = randomUUID();
const jobId = randomUUID();
const requestNonce = randomUUID();

const policy: EvidenceVerificationPolicy = {
  trustedKeys: new Map([
    [
      'qa-worker',
      {
        publicKey: keys.publicKey,
        workerIdentity: 'qa-worker',
        workerBuildDigest: 'b'.repeat(64),
      },
    ],
  ]),
  allowedPolicyVersions: new Set(['zfiles-policy-v1']),
  allowedEngineVersions: new Set(['1.5.4']),
  maxEvidenceAgeMs: 120_000,
  maxDatabaseAgeMs: 48 * 60 * 60_000,
  maxFutureClockSkewMs: 5_000,
};

function candidate(
  verdict: 'CLEAN_CANDIDATE' | 'MALWARE_DETECTED' = 'CLEAN_CANDIDATE',
) {
  const claims: ScanEvidenceClaims = {
    protocol: 'zaping-scan-evidence-v1',
    companyId,
    documentId,
    attachmentId,
    reservationId: attachmentId,
    requestNonce,
    quarantineKey: ['quarantine', companyId, documentId, attachmentId].join(
      '/',
    ),
    contentSizeBytes: pdf.length,
    contentSha256: hash,
    bytesVerified: true,
    verdict,
    engineVersion: '1.5.4',
    databaseVersion: 28001,
    databaseBuiltAt: new Date(now - 3_600_000).toISOString(),
    readinessBeforeAt: new Date(now - 1_800).toISOString(),
    readinessAfterAt: new Date(now - 500).toISOString(),
    startedAt: new Date(now - 1_200).toISOString(),
    completedAt: new Date(now - 900).toISOString(),
    policyVersion: 'zfiles-policy-v1',
    workerIdentity: 'qa-worker',
    workerBuildDigest: 'b'.repeat(64),
    failureCode: null,
  };
  const signedEnvelope = signScanEvidence(claims, 'qa-worker', keys.privateKey);
  const record: TrustedPromotionCandidate = {
    jobId,
    companyId,
    documentId,
    attachmentId,
    requestNonce,
    quarantineKey: claims.quarantineKey,
    contentSizeBytes: pdf.length,
    contentSha256: hash,
    originalName: 'synthetic.pdf',
    contentType: 'application/pdf',
    jobStatus: 'CONSUMED',
    documentStatus: 'ACTIVE',
    attachmentStatus: 'PENDING_SCAN',
    receipt: {
      jobId,
      companyId,
      documentId,
      attachmentId,
      requestNonce,
      verdict,
      signedEnvelope,
    },
  };
  return record;
}

type QaOptions = {
  corruptedSource?: boolean;
  corruptedDestination?: boolean;
  conflict?: boolean;
  corruptHeader?: boolean;
  missingDestination?: boolean;
  expireDuringRead?: boolean;
};

function storage(options: QaOptions = {}) {
  const calls: string[] = [];
  const privateKey = ['private', companyId, documentId, attachmentId].join('/');
  const qSend = jest.fn((command: unknown) => {
    if (command instanceof HeadObjectCommand) {
      calls.push('Q_HEAD');
      expect(command.input.Bucket).toBe('zaping-quarantine-qa');
      return Promise.resolve({
        ContentLength: options.corruptHeader ? pdf.length + 1 : pdf.length,
        ETag: '"qa-etag"',
      });
    }
    if (command instanceof GetObjectCommand) {
      calls.push('Q_GET');
      expect(command.input.Bucket).toBe('zaping-quarantine-qa');
      expect(command.input.IfMatch).toBe('"qa-etag"');
      return Promise.resolve({
        ContentLength: pdf.length,
        Body: Readable.from([
          options.corruptedSource
            ? Buffer.alloc(pdf.length, 9)
            : Buffer.from(pdf),
        ]),
      });
    }
    throw new Error('Unexpected quarantine operation');
  });
  const pSend = jest.fn((command: unknown) => {
    if (command instanceof PutObjectCommand) {
      calls.push('P_PUT');
      expect(command.input.Bucket).toBe('zaping-private-qa');
      expect(command.input.Key).toBe(privateKey);
      expect(command.input.IfNoneMatch).toBe('*');
      expect(command.input.ContentLength).toBe(pdf.length);
      expect(command.input.ContentType).toBe('application/pdf');
      expect(Buffer.from(command.input.Body as Uint8Array)).toEqual(pdf);
      if (options.conflict) {
        throw Object.assign(new Error('PreconditionFailed'), {
          $metadata: { httpStatusCode: 412 },
        });
      }
      return Promise.resolve({ ETag: '"written"' });
    }
    if (command instanceof GetObjectCommand) {
      calls.push('P_GET');
      expect(command.input.Bucket).toBe('zaping-private-qa');
      expect(command.input.Key).toBe(privateKey);
      if (options.missingDestination) {
        return Promise.reject(new Error('NoSuchKey'));
      }
      return Promise.resolve({
        ContentLength: pdf.length,
        Body: Readable.from([
          options.corruptedDestination
            ? Buffer.alloc(pdf.length, 3)
            : Buffer.from(pdf),
        ]),
      });
    }
    throw new Error('Unexpected private operation');
  });
  const quarantine = { send: qSend } as unknown as Pick<S3Client, 'send'>;
  const privateBucket = { send: pSend } as unknown as Pick<S3Client, 'send'>;
  let clockReads = 0;
  const core = new ZfilesVerifiedPrivateCopyCore(
    quarantine,
    privateBucket,
    policy,
    () =>
      options.expireDuringRead && clockReads++ > 0
        ? now + policy.maxEvidenceAgeMs + 2_000
        : now,
  );
  return { core, calls, qSend, pSend, privateKey };
}

describe('ZFILES-R2-03D1 verified private-byte staging core (offline only)', () => {
  it('revalidates signed CLEAN evidence, origin bytes and private read-back', async () => {
    const x = storage();
    await expect(x.core.stageVerifiedBytes(candidate())).resolves.toEqual({
      status: 'PRIVATE_BYTES_VERIFIED_UNRELEASED',
      companyId,
      attachmentId,
      privateKey: x.privateKey,
      sha256: hash,
      sizeBytes: pdf.length,
    });
    expect(x.calls).toEqual(['Q_HEAD', 'Q_GET', 'P_PUT', 'P_GET']);
  });

  it('rejects modified Ed25519 envelope without touching R2', async () => {
    const x = storage();
    const trusted = candidate();
    const tampered = {
      ...trusted,
      receipt: {
        ...trusted.receipt,
        signedEnvelope: {
          ...trusted.receipt.signedEnvelope,
          claims: {
            ...trusted.receipt.signedEnvelope.claims,
            contentSha256: 'f'.repeat(64),
          },
        },
      },
    };
    await expect(x.core.stageVerifiedBytes(tampered)).rejects.toThrow(
      'ZFILES-R2-03D1 private-byte verification failed',
    );
    expect(x.calls).toEqual([]);
  });

  it('never writes a signed MALWARE_DETECTED attachment', async () => {
    const x = storage();
    await expect(
      x.core.stageVerifiedBytes(candidate('MALWARE_DETECTED')),
    ).rejects.toThrow();
    expect(x.calls).toEqual([]);
  });

  it('requires consumed job and pending attachment state', async () => {
    for (const change of [
      { jobStatus: 'ISSUED' as const },
      { attachmentStatus: 'AVAILABLE' },
      { documentStatus: 'CANCELLED' },
      { companyId: randomUUID() },
    ]) {
      const x = storage();
      await expect(
        x.core.stageVerifiedBytes({ ...candidate(), ...change }),
      ).rejects.toThrow();
      expect(x.calls).toEqual([]);
    }
  });

  it('fails closed on source content mismatch before any private write', async () => {
    const x = storage({ corruptedSource: true });
    await expect(x.core.stageVerifiedBytes(candidate())).rejects.toThrow();
    expect(x.calls).toEqual(['Q_HEAD', 'Q_GET']);
  });

  it('fails closed on HEAD mismatch before reading source', async () => {
    const x = storage({ corruptHeader: true });
    await expect(x.core.stageVerifiedBytes(candidate())).rejects.toThrow();
    expect(x.calls).toEqual(['Q_HEAD']);
  });

  it('cannot overwrite a previously created private key', async () => {
    const x = storage({ conflict: true });
    await expect(x.core.stageVerifiedBytes(candidate())).rejects.toThrow();
    expect(x.calls).toEqual(['Q_HEAD', 'Q_GET', 'P_PUT']);
  });

  it('never returns a successful result when destination bytes differ', async () => {
    const x = storage({ corruptedDestination: true });
    await expect(x.core.stageVerifiedBytes(candidate())).rejects.toThrow();
    expect(x.calls).toEqual(['Q_HEAD', 'Q_GET', 'P_PUT', 'P_GET']);
  });

  it('03D3A recovers only by re-verifying existing private bytes with NO new PUT', async () => {
    const x = storage();
    await expect(x.core.reconcileExistingVerifiedBytes(candidate())).resolves.toEqual({
      status: 'PRIVATE_BYTES_VERIFIED_UNRELEASED',
      companyId,
      attachmentId,
      privateKey: x.privateKey,
      sha256: hash,
      sizeBytes: pdf.length,
    });
    expect(x.calls).toEqual(['Q_HEAD', 'Q_GET', 'P_GET']);
  });

  it('03D3A never re-stages if existing destination is missing or tampered', async () => {
    for (const opts of [
      { missingDestination: true },
      { corruptedDestination: true },
      { corruptedSource: true },
    ]) {
      const x = storage(opts);
      await expect(
        x.core.reconcileExistingVerifiedBytes(candidate()),
      ).rejects.toThrow('ZFILES-R2-03D1 private-byte verification failed');
      expect(x.calls).not.toContain('P_PUT');
    }
  });

  it('03D3A rejects malware or forged signed receipts before any R2 request', async () => {
    const malware = storage();
    await expect(
      malware.core.reconcileExistingVerifiedBytes(candidate('MALWARE_DETECTED')),
    ).rejects.toThrow();
    expect(malware.calls).toEqual([]);

    const x = storage();
    const trusted = candidate();
    await expect(
      x.core.reconcileExistingVerifiedBytes({
        ...trusted,
        receipt: {
          ...trusted.receipt,
          signedEnvelope: {
            ...trusted.receipt.signedEnvelope,
            signature: 'invalid',
          },
        },
      }),
    ).rejects.toThrow();
    expect(x.calls).toEqual([]);
  });

  it('03D3A rejects evidence that expires during read-back without any write', async () => {
    const x = storage({ expireDuringRead: true });
    await expect(
      x.core.reconcileExistingVerifiedBytes(candidate()),
    ).rejects.toThrow('ZFILES-R2-03D1 private-byte verification failed');
    expect(x.calls).toEqual(['Q_HEAD', 'Q_GET', 'P_GET']);
  });

  it('rejects misrepresented file MIME or extension before private PUT', async () => {
    for (const change of [
      { contentType: 'image/jpeg' as const },
      { originalName: 'malicious.jpg' },
    ]) {
      const x = storage();
      await expect(
        x.core.stageVerifiedBytes({ ...candidate(), ...change }),
      ).rejects.toThrow();
      expect(x.calls).toEqual(['Q_HEAD', 'Q_GET']);
    }
  });
});
