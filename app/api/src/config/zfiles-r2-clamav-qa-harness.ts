import { isAbsolute } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import {
  ClamAvInstreamScanner,
  type ClamAvProtocolVerdict,
} from './zfiles-clamav-instream-lab';
import {
  ClamAvReadinessProbe,
  type ClamAvReadinessPolicy,
} from './zfiles-clamav-readiness-lab';
import {
  scanVerifiedQuarantineQaObject,
  type QaQuarantineReadiness,
  type QaQuarantineScanner,
  type QuarantineVerifiedReadQaManifest,
} from './zfiles-quarantine-verified-read-qa';

/**
 * ZFILES-SCAN-01F1: fixed synthetic-only laboratory fixture.
 * This module is NOT an ERP worker, NestJS provider, or download endpoint.
 */
export const ZFILES_SCAN_01F_QA_MANIFEST: QuarantineVerifiedReadQaManifest = {
  owner: {
    kind: 'PURCHASE_RECEIPT',
    companyId: '2a4c5d3a-0f66-42e9-8d74-eea7c80bb762',
    receiptId: '597d19d0-bef3-4451-aacb-9db7b4e792e3',
  },
  attachmentId: '213af81c-fb81-402f-947f-e3e2de0077cd',
  sizeBytes: 73,
  sha256: 'db8d51154a91568c291fe1e84c8fe9d56ebe858742b41dfea8419ab266eec679',
  etag: '"b9f6aafd18e3e5fe4dc37577f4b2c124"',
};

const POLICY: ClamAvReadinessPolicy = {
  policyVersion: 'zfiles-scan-01f1-qa-v1',
  daemonTimeZone: 'UTC',
  allowedEngineVersions: ['1.5.4'],
  maxDatabaseAgeMs: 48 * 60 * 60 * 1_000,
  maxFutureClockSkewMs: 5 * 60 * 1_000,
};

const rejected = () =>
  new Error('ZFILES-SCAN-01F QA prerequisites not verified');

export type ZfilesR2ClamAvQaScope = Readonly<{
  endpoint: string;
  socketPath: string;
}>;

/**
 * Reject unsafe contexts before opening either R2 or a clamd socket.
 * The returned object deliberately contains NO secrets or object-key input.
 * Token scope must be independently checked in Cloudflare's dashboard.
 */
export function requireZfilesR2ClamAvQaScope(
  env: NodeJS.ProcessEnv,
): ZfilesR2ClamAvQaScope {
  if (
    env.RUN_ZFILES_R2_CLAMAV_LIVE_QA !== '1' ||
    env.CI === 'true' ||
    env.GITHUB_ACTIONS === 'true' ||
    env.TZ !== 'UTC' ||
    env.R2_PRIVATE_BUCKET !== 'zaping-private-qa' ||
    env.R2_QUARANTINE_BUCKET !== 'zaping-quarantine-qa' ||
    (env.R2_JURISDICTION ?? 'default') !== 'default' ||
    !/^[0-9a-f]{32}$/u.test(env.R2_ACCOUNT_ID ?? '') ||
    !env.R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID ||
    !env.R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY ||
    env.R2_QUARANTINE_WRITE_ACCESS_KEY_ID ||
    env.R2_QUARANTINE_WRITE_SECRET_ACCESS_KEY
  ) {
    throw rejected();
  }
  const socketPath = env.CLAMD_SOCKET ?? '';
  if (
    !isAbsolute(socketPath) ||
    socketPath.includes('\0') ||
    /[\r\n]/u.test(socketPath)
  ) {
    throw rejected();
  }
  return {
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    socketPath,
  };
}

type QaTransport = Readonly<{
  client: Pick<S3Client, 'send'>;
  scanner: QaQuarantineScanner;
  readiness: QaQuarantineReadiness;
  close: () => void;
}>;

/** The injectable factory exists exclusively for network-free Jest checks. */
export type QaTransportFactory = (scope: ZfilesR2ClamAvQaScope) => QaTransport;

function createRealTransport(
  scope: ZfilesR2ClamAvQaScope,
  env: NodeJS.ProcessEnv,
): QaTransport {
  const client = new S3Client({
    endpoint: scope.endpoint,
    region: 'auto',
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: {
      accessKeyId: env.R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY!,
    },
  });
  return {
    client,
    scanner: new ClamAvInstreamScanner(scope.socketPath),
    readiness: new ClamAvReadinessProbe(scope.socketPath, POLICY),
    close: () => client.destroy(),
  };
}

/**
 * One fixture only. No upload, list, delete, copy, status change or attestation.
 * A protocol-level OK is explicitly NOT security clearance for AVAILABLE.
 * The real path is allowed only on an isolated Linux host with a Unix socket;
 * testTransportFactory allows hermetic, platform-independent Jest testing.
 */
export async function runZfilesR2ClamAvQa(
  env: NodeJS.ProcessEnv,
  testTransportFactory?: QaTransportFactory,
): Promise<ClamAvProtocolVerdict> {
  const scope = requireZfilesR2ClamAvQaScope(env);
  if (!testTransportFactory && process.platform !== 'linux') {
    throw rejected();
  }
  let transport: QaTransport | undefined;
  try {
    transport = testTransportFactory
      ? testTransportFactory(scope)
      : createRealTransport(scope, env);
    return await scanVerifiedQuarantineQaObject(
      transport.client,
      ZFILES_SCAN_01F_QA_MANIFEST,
      transport.scanner,
      transport.readiness,
    );
  } catch {
    throw new Error('ZFILES-SCAN-01F QA scan was not verified');
  } finally {
    transport?.close();
  }
}
