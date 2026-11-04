import { ServiceUnavailableException } from '@nestjs/common';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import {
  signScanEvidence,
  type EvidenceVerificationPolicy,
  type ScanEvidenceClaims,
} from './zfiles-signed-scan-evidence-lab';
import {
  ZfilesVerifiedChallengeGateway,
  type TrustedIssuedScanChallenge,
  type ZfilesChallengeEvidenceRepository,
} from './zfiles-verified-challenge-gateway-lab';

const keys = generateKeyPairSync('ed25519');
const now = Date.parse('2026-11-04T14:00:00.000Z');
const companyId = randomUUID();
const documentId = randomUUID();
const attachmentId = randomUUID();
const jobId = randomUUID();
const requestNonce = randomUUID();

const challenge: TrustedIssuedScanChallenge = {
  jobId,
  companyId,
  documentId,
  attachmentId,
  requestNonce,
  quarantineKey: [
    'quarantine',
    companyId,
    documentId,
    attachmentId,
  ].join('/'),
  contentSizeBytes: 42,
  contentSha256: 'a'.repeat(64),
  status: 'ISSUED',
  issuedAt: new Date(now - 10_000),
  expiresAt: new Date(now + 110_000),
};

const policy: EvidenceVerificationPolicy = {
  trustedKeys: new Map([
    [
      'qa-signer',
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

const cleanClaims: ScanEvidenceClaims = {
  protocol: 'zaping-scan-evidence-v1',
  companyId,
  documentId,
  attachmentId,
  reservationId: attachmentId,
  requestNonce,
  quarantineKey: challenge.quarantineKey,
  contentSizeBytes: 42,
  contentSha256: 'a'.repeat(64),
  bytesVerified: true,
  verdict: 'CLEAN_CANDIDATE',
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

function setup(override: Partial<TrustedIssuedScanChallenge> = {}) {
  const job = { ...challenge, ...override };
  const committed = new Set<string>();
  const repository: ZfilesChallengeEvidenceRepository = {
    loadChallengeById: jest.fn(() => Promise.resolve(job)),
    commitVerifiedAndConsumeOnce: jest.fn((request) => {
      const id = request.jobId + '/' + request.requestNonce;
      if (committed.has(id)) return Promise.resolve(false);
      committed.add(id);
      return Promise.resolve(true);
    }),
  };
  const gateway = new ZfilesVerifiedChallengeGateway(
    repository,
    policy,
    () => now,
  );
  return { repository, gateway };
}

describe('ZFILES-R2-03C2B1 signed evidence and issued challenge gateway lab', () => {
  it('verifies Ed25519 before requesting a single atomic commit', async () => {
    const f = setup();
    const evidence = signScanEvidence(cleanClaims, 'qa-signer', keys.privateKey);
    await expect(f.gateway.verifyAndCommit(jobId, evidence)).resolves.toEqual({
      status: 'VERIFIED_UNRELEASED',
      verdict: 'CLEAN_CANDIDATE',
    });
    expect(f.repository.loadChallengeById).toHaveBeenCalledWith(jobId);
    expect(f.repository.commitVerifiedAndConsumeOnce).toHaveBeenCalledWith({
      jobId,
      companyId,
      requestNonce,
      evidence,
    });
    expect(f.repository.commitVerifiedAndConsumeOnce).toHaveBeenCalledTimes(1);
  });

  it('preserves detected malware without converting it into AVAILABLE', async () => {
    const f = setup();
    const evidence = signScanEvidence(
      { ...cleanClaims, verdict: 'MALWARE_DETECTED' },
      'qa-signer',
      keys.privateKey,
    );
    await expect(f.gateway.verifyAndCommit(jobId, evidence)).resolves.toEqual({
      status: 'VERIFIED_UNRELEASED',
      verdict: 'MALWARE_DETECTED',
    });
  });

  it.each([
    { label: 'company mismatch', patch: { companyId: randomUUID() } },
    { label: 'document mismatch', patch: { documentId: randomUUID() } },
    { label: 'attachment mismatch', patch: { attachmentId: randomUUID() } },
    { label: 'nonce mismatch', patch: { requestNonce: randomUUID() } },
    { label: 'size mismatch', patch: { contentSizeBytes: 43 } },
    { label: 'sha mismatch', patch: { contentSha256: 'c'.repeat(64) } },
  ])('rejects signed $label before any commit', async ({ patch }) => {
    const f = setup();
    const changed = { ...cleanClaims, ...patch };
    const forged = signScanEvidence(
      {
        ...changed,
        reservationId: changed.attachmentId,
        quarantineKey: [
          'quarantine',
          changed.companyId,
          changed.documentId,
          changed.attachmentId,
        ].join('/'),
      },
      'qa-signer',
      keys.privateKey,
    );
    await expect(f.gateway.verifyAndCommit(jobId, forged)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(f.repository.commitVerifiedAndConsumeOnce).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'already consumed', patch: { status: 'CONSUMED' as const } },
    { label: 'expired job', patch: { expiresAt: new Date(now - 1) } },
    { label: 'incorrect quarantine key', patch: { quarantineKey: 'private/unsafe' } },
    { label: 'invalid job TTL', patch: { issuedAt: new Date(now - 500_000) } },
    { label: 'different id', patch: { jobId: randomUUID() } },
  ])('denies $label before signature acceptance', async ({ patch }) => {
    const f = setup(patch);
    const evidence = signScanEvidence(cleanClaims, 'qa-signer', keys.privateKey);
    await expect(f.gateway.verifyAndCommit(jobId, evidence)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(f.repository.commitVerifiedAndConsumeOnce).not.toHaveBeenCalled();
  });

  it('rejects modified signature and untrusted key id', async () => {
    const f = setup();
    const evidence = signScanEvidence(cleanClaims, 'qa-signer', keys.privateKey);
    for (const modified of [
      { ...evidence, signature: 'A'.repeat(86) },
      { ...evidence, keyId: 'revoked-key' },
    ]) {
      await expect(f.gateway.verifyAndCommit(jobId, modified)).rejects.toThrow(
        ServiceUnavailableException,
      );
    }
    expect(f.repository.commitVerifiedAndConsumeOnce).not.toHaveBeenCalled();
  });

  it('rejects signed SCAN_FAILED as an accepted scan', async () => {
    const f = setup();
    const evidence = signScanEvidence(
      { ...cleanClaims, verdict: 'SCAN_FAILED', failureCode: 'SCAN_TIMEOUT' },
      'qa-signer',
      keys.privateKey,
    );
    await expect(f.gateway.verifyAndCommit(jobId, evidence)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(f.repository.commitVerifiedAndConsumeOnce).not.toHaveBeenCalled();
  });

  it('fails closed on a second commit attempt (fake atomic repository)', async () => {
    const f = setup();
    const evidence = signScanEvidence(cleanClaims, 'qa-signer', keys.privateKey);
    await f.gateway.verifyAndCommit(jobId, evidence);
    await expect(f.gateway.verifyAndCommit(jobId, evidence)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(f.repository.commitVerifiedAndConsumeOnce).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the trusted job lookup is unavailable', async () => {
    const f = setup();
    (f.repository.loadChallengeById as jest.Mock).mockRejectedValue(
      new Error('db credentials would be secret'),
    );
    const evidence = signScanEvidence(cleanClaims, 'qa-signer', keys.privateKey);
    await expect(f.gateway.verifyAndCommit(jobId, evidence)).rejects.toThrow(
      'Evidencia de escaneo no autorizada',
    );
    expect(f.repository.commitVerifiedAndConsumeOnce).not.toHaveBeenCalled();
  });

  it('fails closed on an ambiguous or rejected transaction', async () => {
    const f = setup();
    (f.repository.commitVerifiedAndConsumeOnce as jest.Mock).mockResolvedValue(
      false,
    );
    const evidence = signScanEvidence(cleanClaims, 'qa-signer', keys.privateKey);
    await expect(f.gateway.verifyAndCommit(jobId, evidence)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects a noncanonical job identifier without reading the database', async () => {
    const f = setup();
    const evidence = signScanEvidence(cleanClaims, 'qa-signer', keys.privateKey);
    await expect(
      f.gateway.verifyAndCommit('../other-tenant', evidence),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(f.repository.loadChallengeById).not.toHaveBeenCalled();
  });
});
