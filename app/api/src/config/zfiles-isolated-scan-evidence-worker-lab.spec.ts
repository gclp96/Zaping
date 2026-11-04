import { ServiceUnavailableException } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import type { ClamAvReadiness } from './zfiles-clamav-readiness-lab';
import type { ClamAvProtocolVerdict } from './zfiles-clamav-instream-lab';
import {
  IsolatedScannerEvidenceWorker,
  type VerifiedQuarantineScanner,
  type WorkerReadinessProbe,
} from './zfiles-isolated-scan-evidence-worker-lab';
import {
  verifyScanEvidence,
  type ExpectedScanIdentity,
  type EvidenceVerificationPolicy,
} from './zfiles-signed-scan-evidence-lab';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const FILE = '33333333-3333-4333-8333-333333333333';
const NONCE = '44444444-4444-4444-8444-444444444444';
const T = Date.parse('2026-10-27T12:00:10.000Z');
const BUILT = '2026-10-27T11:00:00.000Z';

describe('ZFILES-R2-03C1 isolated scanner: fail-closed, no persistence', () => {
  const keys = generateKeyPairSync('ed25519');
  const job: ExpectedScanIdentity = {
    companyId: COMPANY,
    documentId: DOCUMENT,
    attachmentId: FILE,
    reservationId: FILE,
    requestNonce: NONCE,
    contentSizeBytes: 42,
    contentSha256: 'a'.repeat(64),
  };

  const verification: EvidenceVerificationPolicy = {
    trustedKeys: new Map([
      [
        'scan-key-v1',
        {
          publicKey: keys.publicKey,
          workerIdentity: 'scanner-qa-1',
          workerBuildDigest: 'f'.repeat(64),
        },
      ],
    ]),
    allowedPolicyVersions: new Set(['scanner-v1']),
    allowedEngineVersions: new Set(['1.4.3']),
    maxEvidenceAgeMs: 120_000,
    maxDatabaseAgeMs: 48 * 60 * 60_000,
    maxFutureClockSkewMs: 5_000,
  };

  function fixture() {
    const scanMock = jest.fn<
      Promise<ClamAvProtocolVerdict>,
      [string, string, number, string]
    >(() => Promise.resolve('CLAMD_OK_UNATTESTED'));
    const probeMock = jest.fn<Promise<ClamAvReadiness>, [number]>((nowMs) =>
      Promise.resolve({
        engineVersion: '1.4.3',
        databaseVersion: 28001,
        databaseBuiltAt: BUILT,
        observedAt: new Date(nowMs).toISOString(),
        policyVersion: 'scanner-v1',
        attested: false,
      }),
    );
    const scanner: VerifiedQuarantineScanner = {
      scan: (companyId, key, size, sha) => scanMock(companyId, key, size, sha),
    };
    const readiness: WorkerReadinessProbe = {
      check: (nowMs) => probeMock(nowMs),
    };
    const stamps = [T - 1000, T - 900, T - 500, T - 400];
    const worker = new IsolatedScannerEvidenceWorker(
      readiness,
      scanner,
      {
        keyId: 'scan-key-v1',
        privateKey: keys.privateKey,
        workerIdentity: 'scanner-qa-1',
        workerBuildDigest: 'f'.repeat(64),
        policyVersion: 'scanner-v1',
      },
      () => stamps.shift() ?? T,
    );
    return { worker, scanMock, probeMock };
  }

  it('signs the same registered bytes only after two matching probes', async () => {
    const f = fixture();
    const signed = await f.worker.scan(job);
    const verified = verifyScanEvidence(signed, job, verification, T);
    expect(verified.verdict).toBe('CLEAN_CANDIDATE');
    expect(verified.bytesVerified).toBe(true);
    expect(verified.quarantineKey).toBe(
      'quarantine/' + COMPANY + '/' + DOCUMENT + '/' + FILE,
    );
    expect(f.probeMock).toHaveBeenCalledTimes(2);
    expect(f.scanMock).toHaveBeenCalledWith(
      COMPANY,
      verified.quarantineKey,
      42,
      'a'.repeat(64),
    );
  });

  it('keeps a real malware detection out of the clean state', async () => {
    const f = fixture();
    f.scanMock.mockResolvedValue('MALWARE_DETECTED');
    const signed = await f.worker.scan(job);
    const verified = verifyScanEvidence(signed, job, verification, T);
    expect(verified.verdict).toBe('MALWARE_DETECTED');
  });

  it('never scans when the initial readiness check fails', async () => {
    const f = fixture();
    f.probeMock.mockRejectedValueOnce(new Error('clamd unavailable'));
    await expect(f.worker.scan(job)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(f.scanMock).not.toHaveBeenCalled();
  });

  it('never signs clean evidence if the quarantine read fails', async () => {
    const f = fixture();
    f.scanMock.mockRejectedValueOnce(new Error('SHA-256 mismatch'));
    await expect(f.worker.scan(job)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(f.probeMock).toHaveBeenCalledTimes(1);
  });

  it('rejects changed ClamAV signatures during a scan', async () => {
    const f = fixture();
    f.probeMock.mockImplementation((nowMs) =>
      Promise.resolve({
        engineVersion: '1.4.3',
        databaseVersion: nowMs >= T - 400 ? 28002 : 28001,
        databaseBuiltAt: BUILT,
        observedAt: new Date(nowMs).toISOString(),
        policyVersion: 'scanner-v1',
        attested: false,
      }),
    );
    await expect(f.worker.scan(job)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects stale or inconsistent policy between probes', async () => {
    const f = fixture();
    f.probeMock.mockImplementation((nowMs) =>
      Promise.resolve({
        engineVersion: '1.4.3',
        databaseVersion: 28001,
        databaseBuiltAt: BUILT,
        observedAt: new Date(nowMs).toISOString(),
        policyVersion: nowMs >= T - 400 ? 'scanner-v2' : 'scanner-v1',
        attested: false,
      }),
    );
    await expect(f.worker.scan(job)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('never signs on post-scan probe failure', async () => {
    const f = fixture();
    f.probeMock
      .mockResolvedValueOnce({
        engineVersion: '1.4.3',
        databaseVersion: 28001,
        databaseBuiltAt: BUILT,
        observedAt: new Date(T - 1000).toISOString(),
        policyVersion: 'scanner-v1',
        attested: false,
      })
      .mockRejectedValueOnce(new Error('post-scan outage'));
    await expect(f.worker.scan(job)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(f.scanMock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed tenant or object keys before invoking any adapter', async () => {
    for (const patch of [
      { companyId: '../another-tenant' },
      { documentId: 'private/unsafe' },
      { reservationId: NONCE },
      { contentSizeBytes: 10 * 1024 * 1024 + 1 },
      { contentSha256: 'F'.repeat(64) },
    ]) {
      const f = fixture();
      await expect(f.worker.scan({ ...job, ...patch })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(f.scanMock).not.toHaveBeenCalled();
      expect(f.probeMock).not.toHaveBeenCalled();
    }
  });

  it('does not sign an unexpected scanner result', async () => {
    const f = fixture();
    f.scanMock.mockResolvedValue('UNSUPPORTED' as ClamAvProtocolVerdict);
    await expect(f.worker.scan(job)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('prevents signature evidence reuse for another tenant or nonce', async () => {
    const f = fixture();
    const envelope = await f.worker.scan(job);
    expect(() =>
      verifyScanEvidence(envelope, { ...job, companyId: NONCE }, verification, T),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      verifyScanEvidence(
        envelope,
        { ...job, requestNonce: COMPANY },
        verification,
        T,
      ),
    ).toThrow(ServiceUnavailableException);
    // The DB must independently consume one-time nonces: this test only checks
    // equality against expected job identity and does not prevent DB replay.
  });

  it('rejects tampered claims, signature and untrusted worker key identity', async () => {
    const f = fixture();
    const envelope = await f.worker.scan(job);
    expect(() =>
      verifyScanEvidence(
        {
          ...envelope,
          claims: { ...envelope.claims, contentSha256: 'b'.repeat(64) },
        },
        job,
        verification,
        T,
      ),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      verifyScanEvidence(
        { ...envelope, signature: 'a'.repeat(86) },
        job,
        verification,
        T,
      ),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      verifyScanEvidence(
        { ...envelope, keyId: 'untrusted-key' },
        job,
        verification,
        T,
      ),
    ).toThrow(ServiceUnavailableException);
  });

  it('rejects aged evidence and a revoked verification policy', async () => {
    const f = fixture();
    const envelope = await f.worker.scan(job);
    expect(() =>
      verifyScanEvidence(envelope, job, verification, T + 300_000),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      verifyScanEvidence(
        envelope,
        job,
        { ...verification, allowedPolicyVersions: new Set(['revoked']) },
        T,
      ),
    ).toThrow(ServiceUnavailableException);
  });
});
