import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  createQuarantineScannerQaClient,
  type QuarantineScannerQaFixture,
} from './zfiles-r2-quarantine-scan-qa';
import { verifyZfilesR2QaBody } from './zfiles-r2-qa-read';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export type ScannerObjectReadQaScope = Readonly<{
  fixture: QuarantineScannerQaFixture;
  privateFixtureKey: string;
}>;

const unavailable = () =>
  new Error('ZFILES-R2-03C3A QA permissions could not be verified');

/**
 * Only fixed stage/status codes are safe to print in local QA.
 * No SDK message, URL, object key, account ID, request ID, or secret is used.
 */
export class ZfilesR2QaSafeDiagnosticError extends Error {
  constructor(readonly code: string) {
    super(`ZFILES-R2-03C3A QA permissions could not be verified [${code}]`);
  }
}

type QaStage = 'Q_HEAD' | 'Q_GET' | 'P_HEAD';

function safeRequestFailure(stage: QaStage, error: unknown) {
  const metadata =
    error && typeof error === 'object' && '$metadata' in error
      ? (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata
      : undefined;
  const status = metadata?.httpStatusCode;
  const category =
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 412 ||
    status === 429
      ? `HTTP_${status}`
      : 'OTHER';
  return new ZfilesR2QaSafeDiagnosticError(`${stage}_${category}`);
}

/**
 * Explicit opt-in, local only. Existing 03B3 parser performs strict fixture,
 * bucket, endpoint and credential checks. 03C3A additionally REQUIRES a
 * confirmed Cloudflare token scope and an existing private QA fixture.
 * The credentials stay outside source control and GitHub Actions.
 */
export function createScannerObjectReadQaClient(env: NodeJS.ProcessEnv): {
  client: S3Client;
  scope: ScannerObjectReadQaScope;
} {
  if (
    env.RUN_ZFILES_R2_SCANNER_OBJECT_READ_QA !== '1' ||
    env.R2_SCANNER_QA_READ_ONLY_CONFIRMED !== '1' ||
    env.CI === 'true' ||
    env.GITHUB_ACTIONS === 'true'
  ) {
    throw unavailable();
  }
  const privateFixtureKey = env.R2_SCANNER_QA_PRIVATE_FIXTURE_KEY ?? '';
  const privateParts = privateFixtureKey.split('/');
  if (
    privateParts.length !== 4 ||
    privateParts[0] !== 'private' ||
    !privateParts.slice(1).every((part) => UUID.test(part))
  ) {
    throw unavailable();
  }
  // Do not permit mistakenly reusing the write credential from 03A.
  const scannerKey = env.R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID ?? '';
  if (
    !scannerKey ||
    scannerKey === env.R2_QUARANTINE_WRITE_ACCESS_KEY_ID ||
    scannerKey === env.R2_READ_ACCESS_KEY_ID
  ) {
    throw unavailable();
  }
  const { client, fixture } = createQuarantineScannerQaClient({
    ...env,
    RUN_ZFILES_R2_QUARANTINE_SCAN_QA: '1',
  });
  return { client, scope: { fixture, privateFixtureKey } };
}

function deniedPrivateRead(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const data = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    (data.name === 'AccessDenied' || data.name === 'Forbidden') &&
    data.$metadata?.httpStatusCode === 403
  );
}

/**
 * Actual QA S3 calls: HEAD exact quarantine object, GET with HEAD ETag guard
 * and SHA-256 verification, then HEAD exact *known existing* private object.
 * Never issues PutObject, DeleteObject, CopyObject, ListObjects or URLs.
 *
 * The negative HEAD must return 403. 404, 412 and network errors are NOT
 * evidence that the token lacks cross-bucket read permissions.
 */
export async function verifyScannerObjectReadQaScope(
  client: Pick<S3Client, 'send'>,
  scope: ScannerObjectReadQaScope,
): Promise<void> {
  const { fixture, privateFixtureKey } = scope;
  if (
    fixture.bucket !== 'zaping-quarantine-qa' ||
    fixture.key !==
      [
        'quarantine',
        fixture.companyId,
        fixture.documentId,
        fixture.attachmentId,
      ].join('/') ||
    !UUID.test(fixture.companyId) ||
    !UUID.test(fixture.documentId) ||
    !UUID.test(fixture.attachmentId) ||
    privateFixtureKey.split('/').length !== 4 ||
    privateFixtureKey.split('/')[0] !== 'private' ||
    !privateFixtureKey
      .split('/')
      .slice(1)
      .every((x) => UUID.test(x))
  ) {
    throw new ZfilesR2QaSafeDiagnosticError('SCOPE_INVALID');
  }

  let head: { ContentLength?: number; ETag?: string };
  try {
    head = await client.send(
      new HeadObjectCommand({ Bucket: fixture.bucket, Key: fixture.key }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
  } catch (error) {
    throw safeRequestFailure('Q_HEAD', error);
  }
  if (
    head.ContentLength !== fixture.sizeBytes ||
    typeof head.ETag !== 'string' ||
    !/^"[^"]{1,128}"$/u.test(head.ETag)
  ) {
    throw new ZfilesR2QaSafeDiagnosticError('Q_HEAD_METADATA');
  }

  let stream: Readable | undefined;
  try {
    let response: { Body?: unknown; ContentLength?: number };
    try {
      response = await client.send(
        new GetObjectCommand({
          Bucket: fixture.bucket,
          Key: fixture.key,
          IfMatch: head.ETag,
        }),
        { abortSignal: AbortSignal.timeout(15_000) },
      );
    } catch (error) {
      throw safeRequestFailure('Q_GET', error);
    }
    stream = response.Body instanceof Readable ? response.Body : undefined;
    if (!stream || response.ContentLength !== fixture.sizeBytes) {
      throw new ZfilesR2QaSafeDiagnosticError('Q_GET_METADATA');
    }
    try {
      await verifyZfilesR2QaBody(stream, fixture);
    } catch {
      throw new ZfilesR2QaSafeDiagnosticError('Q_BODY_VERIFICATION');
    }
  } finally {
    stream?.destroy();
  }

  // Negative permission probe ONLY after a fully verified quarantine read.
  // 404 or network errors are inconclusive, not permission proof.
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: 'zaping-private-qa',
        Key: privateFixtureKey,
      }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
  } catch (error) {
    if (deniedPrivateRead(error)) return;
    throw safeRequestFailure('P_HEAD', error);
  }
  throw new ZfilesR2QaSafeDiagnosticError('P_HEAD_ALLOWED');
}
