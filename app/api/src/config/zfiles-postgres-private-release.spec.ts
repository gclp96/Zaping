import { ZfilesPrivateReleaseCoordinator } from './zfiles-postgres-private-release';
import type {
  TrustedPromotionCandidate,
  PrivateBytesVerifiedUnreleased,
} from './zfiles-r2-verified-private-copy-core';

const jobId = 'f110eeef-a111-4111-b111-011111111111';
const companyId = 'f110eeef-a222-4222-b222-022222222222';
const documentId = 'f110eeef-a333-4333-b333-033333333333';
const attachmentId = 'f110eeef-a444-4444-b444-044444444444';
const sha256 = 'a'.repeat(64);
const privateKey = ['private', companyId, documentId, attachmentId].join('/');
const candidate = {
  jobId,
  companyId,
  documentId,
  attachmentId,
  contentSha256: sha256,
  contentSizeBytes: 200,
} as TrustedPromotionCandidate;
const verified: PrivateBytesVerifiedUnreleased = {
  status: 'PRIVATE_BYTES_VERIFIED_UNRELEASED',
  companyId,
  attachmentId,
  privateKey,
  sha256,
  sizeBytes: 200,
};

function harness(
  candidateResult: TrustedPromotionCandidate | null = candidate,
  copied: PrivateBytesVerifiedUnreleased = verified,
  released = true,
) {
  const reader = { load: jest.fn().mockResolvedValue(candidateResult) };
  const copy = {
    stageVerifiedBytes: jest.fn().mockResolvedValue(copied),
    reconcileExistingVerifiedBytes: jest.fn().mockResolvedValue(copied),
  };
  const ledger = {
    commitVerifiedPrivateRelease: jest.fn().mockResolvedValue(released),
  };
  const coordinator = new ZfilesPrivateReleaseCoordinator(reader, copy, ledger);
  return { reader, copy, ledger, coordinator };
}

describe('ZFILES-R2-03D2B unregistered coordinator', () => {
  it('03D3A uses explicit no-write recovery and the same SQL release gate', async () => {
    const h = harness();
    await expect(
      h.coordinator.recoverExisting(jobId, companyId),
    ).resolves.toEqual({
      status: 'AVAILABLE',
    });
    expect(h.copy.stageVerifiedBytes).not.toHaveBeenCalled();
    expect(h.copy.reconcileExistingVerifiedBytes).toHaveBeenCalledWith(
      candidate,
    );
    expect(h.ledger.commitVerifiedPrivateRelease).toHaveBeenCalledWith({
      jobId,
      companyId,
      privateKey,
      sha256,
      sizeBytes: 200,
    });
  });

  it('03D3A never runs SQL on unreadable, wrong or missing private bytes', async () => {
    for (const bad of [
      { ...verified, sha256: 'b'.repeat(64) },
      { ...verified, attachmentId: 'wrong' },
    ]) {
      const h = harness(candidate, bad);
      await expect(
        h.coordinator.recoverExisting(jobId, companyId),
      ).rejects.toThrow('ZFILES-R2-03D2B release failed');
      expect(h.ledger.commitVerifiedPrivateRelease).not.toHaveBeenCalled();
    }

    const missing = harness();
    missing.copy.reconcileExistingVerifiedBytes.mockRejectedValueOnce(
      new Error('private missing or tampered'),
    );
    await expect(
      missing.coordinator.recoverExisting(jobId, companyId),
    ).rejects.toThrow('ZFILES-R2-03D2B release failed');
    expect(missing.ledger.commitVerifiedPrivateRelease).not.toHaveBeenCalled();
  });

  it('03D3A does not touch R2 or SQL if the isolated reader denies recovery', async () => {
    const h = harness(null);
    await expect(
      h.coordinator.recoverExisting(jobId, companyId),
    ).resolves.toEqual({
      status: 'UNRELEASED',
    });
    expect(h.copy.reconcileExistingVerifiedBytes).not.toHaveBeenCalled();
    expect(h.ledger.commitVerifiedPrivateRelease).not.toHaveBeenCalled();
  });

  it('commits only after verified private bytes exactly match the scoped candidate', async () => {
    const h = harness();
    await expect(h.coordinator.promote(jobId, companyId)).resolves.toEqual({
      status: 'AVAILABLE',
    });
    expect(h.copy.stageVerifiedBytes).toHaveBeenCalledWith(candidate);
    expect(h.ledger.commitVerifiedPrivateRelease).toHaveBeenCalledWith({
      jobId,
      companyId,
      privateKey,
      sha256,
      sizeBytes: 200,
    });
  });

  it('never reads R2 or commits if the database reader denies the job', async () => {
    const h = harness(null);
    await expect(h.coordinator.promote(jobId, companyId)).resolves.toEqual({
      status: 'UNRELEASED',
    });
    expect(h.copy.stageVerifiedBytes).not.toHaveBeenCalled();
    expect(h.ledger.commitVerifiedPrivateRelease).not.toHaveBeenCalled();
  });

  it('rejects a mismatched tenant returned by an invalid reader', async () => {
    const h = harness({ ...candidate, companyId: 'another-company' });
    await expect(h.coordinator.promote(jobId, companyId)).rejects.toThrow(
      'ZFILES-R2-03D2B release failed',
    );
    expect(h.copy.stageVerifiedBytes).not.toHaveBeenCalled();
    expect(h.ledger.commitVerifiedPrivateRelease).not.toHaveBeenCalled();
  });

  it('rejects inconsistent private bytes before any DB release', async () => {
    for (const bad of [
      { ...verified, privateKey: 'private/other' },
      { ...verified, sha256: 'b'.repeat(64) },
      { ...verified, sizeBytes: 201 },
      { ...verified, attachmentId: 'different' },
    ]) {
      const h = harness(candidate, bad);
      await expect(h.coordinator.promote(jobId, companyId)).rejects.toThrow(
        'ZFILES-R2-03D2B release failed',
      );
      expect(h.ledger.commitVerifiedPrivateRelease).not.toHaveBeenCalled();
    }
  });

  it('keeps files unreleased if SQL refuses to commit', async () => {
    const h = harness(candidate, verified, false);
    await expect(h.coordinator.promote(jobId, companyId)).resolves.toEqual({
      status: 'UNRELEASED',
    });
  });

  it('normalizes read-back and database failures without publishing', async () => {
    const h = harness();
    h.copy.stageVerifiedBytes.mockRejectedValueOnce(
      new Error('R2_ACCESS_KEY_ID=secret'),
    );
    await expect(h.coordinator.promote(jobId, companyId)).rejects.toThrow(
      'ZFILES-R2-03D2B release failed',
    );
    expect(h.ledger.commitVerifiedPrivateRelease).not.toHaveBeenCalled();

    h.ledger.commitVerifiedPrivateRelease.mockRejectedValueOnce(
      new Error('secret SQL details'),
    );
    await expect(h.coordinator.promote(jobId, companyId)).rejects.toThrow(
      'ZFILES-R2-03D2B release failed',
    );
  });
});
