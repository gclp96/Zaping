import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createConnection } from 'node:net';
import { isAbsolute } from 'node:path';

/**
 * Laboratory readiness evidence only. It is not a scan attestation, does not
 * authorize AVAILABLE, and is not wired to any NestJS provider or endpoint.
 */
export type ClamAvReadiness = Readonly<{
  engineVersion: string;
  databaseVersion: number;
  databaseBuiltAt: string;
  observedAt: string;
  policyVersion: string;
  attested: false;
}>;

export type ClamAvReadinessPolicy = Readonly<{
  policyVersion: string;
  /** clamd VERSION has no time-zone offset; the runner must enforce UTC. */
  daemonTimeZone: 'UTC';
  allowedEngineVersions: readonly string[];
  maxDatabaseAgeMs: number;
  maxFutureClockSkewMs: number;
}>;

const MAX_REPLY_BYTES = 512;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const unavailable = () =>
  new ServiceUnavailableException('Escáner antimalware no verificable');

function validatePolicy(policy: ClamAvReadinessPolicy): void {
  if (
    !policy ||
    !/^[a-z0-9._-]{1,64}$/u.test(policy.policyVersion) ||
    policy.daemonTimeZone !== 'UTC' ||
    !Array.isArray(policy.allowedEngineVersions) ||
    policy.allowedEngineVersions.length < 1 ||
    policy.allowedEngineVersions.length > 20 ||
    !policy.allowedEngineVersions.every(
      (v: unknown) => typeof v === 'string' && /^\d+\.\d+\.\d+$/u.test(v),
    ) ||
    !Number.isSafeInteger(policy.maxDatabaseAgeMs) ||
    policy.maxDatabaseAgeMs < 60_000 ||
    policy.maxDatabaseAgeMs > 7 * 24 * 60 * 60 * 1_000 ||
    !Number.isSafeInteger(policy.maxFutureClockSkewMs) ||
    policy.maxFutureClockSkewMs < 0 ||
    policy.maxFutureClockSkewMs > 60 * 60 * 1_000
  ) {
    throw new BadRequestException('Política ClamAV inválida');
  }
}

/**
 * Validate the strict clamd VERSION triplet against a caller-supplied policy.
 * The timestamp is interpreted as UTC ONLY when the daemon is configured for
 * UTC; this function cannot verify daemon TZ, signature origin or freshness.
 */
export function evaluateClamAvVersion(
  versionReply: string,
  policy: ClamAvReadinessPolicy,
  nowMs = Date.now(),
): ClamAvReadiness {
  validatePolicy(policy);
  if (
    typeof versionReply !== 'string' ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0
  ) {
    throw unavailable();
  }

  const match =
    /^ClamAV (\d+\.\d+\.\d+)\/([1-9]\d*)\/(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([ 0-3]\d) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/u.exec(
      versionReply,
    );
  if (!match) throw unavailable();

  const [
    ,
    engineVersion,
    revisionText,
    weekday,
    monthName,
    dayText,
    hourText,
    minuteText,
    secondText,
    yearText,
  ] = match;
  if (!policy.allowedEngineVersions.includes(engineVersion)) {
    throw unavailable();
  }

  const databaseVersion = Number(revisionText);
  if (!Number.isSafeInteger(databaseVersion) || databaseVersion < 1) {
    throw unavailable();
  }

  const month = MONTHS.indexOf(monthName as (typeof MONTHS)[number]);
  const year = Number(yearText);
  const day = Number(dayText.trim());
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const builtMs = Date.UTC(year, month, day, hour, minute, second);
  const builtAt = new Date(builtMs);

  if (
    !Number.isFinite(builtMs) ||
    builtAt.getUTCFullYear() !== year ||
    builtAt.getUTCMonth() !== month ||
    builtAt.getUTCDate() !== day ||
    builtAt.getUTCHours() !== hour ||
    builtAt.getUTCMinutes() !== minute ||
    builtAt.getUTCSeconds() !== second ||
    WEEKDAYS[builtAt.getUTCDay()] !== weekday
  ) {
    throw unavailable();
  }

  const ageMs = nowMs - builtMs;
  if (ageMs > policy.maxDatabaseAgeMs || ageMs < -policy.maxFutureClockSkewMs) {
    throw unavailable();
  }

  return {
    engineVersion,
    databaseVersion,
    databaseBuiltAt: builtAt.toISOString(),
    observedAt: new Date(nowMs).toISOString(),
    policyVersion: policy.policyVersion,
    attested: false,
  };
}

/**
 * PING/VERSION over a local socket only. No credentials, R2, SQL, or uploads.
 * This object must remain unregistered until later security review.
 */
export class ClamAvReadinessProbe {
  constructor(
    private readonly socketPath: string,
    private readonly policy: ClamAvReadinessPolicy,
    private readonly timeoutMs = 5_000,
  ) {
    if (
      !isAbsolute(socketPath) ||
      socketPath.includes('\0') ||
      /[\r\n]/u.test(socketPath) ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1_000 ||
      timeoutMs > 30_000
    ) {
      throw new BadRequestException('Configuración ClamAV inválida');
    }
    validatePolicy(policy);
  }

  async check(nowMs = Date.now()): Promise<ClamAvReadiness> {
    const ping = await this.command('PING');
    if (ping !== 'PONG') throw unavailable();
    const versionReply = await this.command('VERSION');
    return evaluateClamAvVersion(versionReply, this.policy, nowMs);
  }

  private command(command: 'PING' | 'VERSION'): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const socket = createConnection({ path: this.socketPath });
      let settled = false;
      let reply = Buffer.alloc(0);
      const timer = setTimeout(() => finish(unavailable()), this.timeoutMs);

      function finish(result: string | Error): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (result instanceof Error) reject(result);
        else resolve(result);
      }

      socket.on('error', () => finish(unavailable()));
      socket.on('close', () => finish(unavailable()));
      socket.on('data', (chunk: Buffer) => {
        reply = Buffer.concat([reply, chunk]);
        if (reply.length > MAX_REPLY_BYTES) {
          finish(unavailable());
          return;
        }
        const end = reply.indexOf(0);
        if (end === -1) return;
        if (end !== reply.length - 1) {
          finish(unavailable());
          return;
        }
        finish(reply.subarray(0, end).toString('utf8'));
      });
      socket.once('connect', () => {
        socket.write(Buffer.from('z' + command + '\0', 'ascii'), (error) => {
          if (error) finish(unavailable());
        });
      });
    });
  }
}
