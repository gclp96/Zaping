const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} = require('node:fs');
const path = require('node:path');

const cwd = path.resolve(__dirname, '..');
const runId = randomBytes(8).toString('hex');
const name = 'zaping-ux007i-' + runId;
const database = 'qa_purchase_audit_' + runId;
const password = randomBytes(24).toString('hex');
const label = 'zaping.ux007i';
const target = '20261123000000_purchase_cost_audit';
const env = {
  ...process.env,
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
};
const run = (program, args, options = {}) =>
  execFileSync(program, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });

let containerId;
let baseline;
let stage = 'create isolated PostgreSQL 16 container';
try {
  containerId = run(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--label',
      label + '=' + runId,
      '--tmpfs',
      '/var/lib/postgresql/data:rw,noexec,nosuid,size=512m',
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_PASSWORD',
      'postgres:16',
    ],
    { env: { ...env, POSTGRES_PASSWORD: password } },
  ).trim();
  stage = 'verify isolated PostgreSQL container';
  const metadata = JSON.parse(
    run('docker', ['inspect', '--format', '{{json .}}', containerId]),
  );
  const [port, ...otherPorts] = metadata.NetworkSettings.Ports['5432/tcp'];
  assert.equal(metadata.Id, containerId);
  assert.equal(metadata.Config.Labels[label], runId);
  assert.ok(
    metadata.HostConfig.AutoRemove &&
      metadata.HostConfig.Tmpfs['/var/lib/postgresql/data'],
  );
  assert.ok(metadata.Mounts.every((mount) => mount.Type === 'tmpfs'));
  assert.equal(port.HostIp, '127.0.0.1');
  assert.equal(otherPorts.length, 0);
  assert.match(port.HostPort, /^\d+$/);
  assert.notEqual(port.HostPort, '5436');
  run('docker', [
    'exec',
    containerId,
    'sh',
    '-c',
    'i=0; until pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; do i=$((i+1)); [ "$i" -lt 30 ] || exit 1; sleep 1; done',
  ]);
  const sql = (input, user, db) =>
    run(
      'docker',
      [
        'exec',
        '-i',
        containerId,
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        user,
        '-d',
        db,
      ],
      { input },
    );

  stage = 'create isolated test database';
  sql(
    "CREATE ROLE qa_purchase_audit LOGIN PASSWORD '" +
      password +
      "';\n" +
      'CREATE DATABASE ' +
      database +
      ' OWNER qa_purchase_audit;\n' +
      'COMMENT ON DATABASE ' +
      database +
      " IS 'UX-007I:" +
      runId +
      "';",
    'postgres',
    'postgres',
  );
  const identity = sql(
    "SELECT current_setting('server_version_num') || '|' || shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = current_database();",
    'qa_purchase_audit',
    database,
  );
  assert.ok(identity.includes('UX-007I:' + runId));
  assert.match(identity, /\b16\d{4}\|UX-007I:/);
  const url =
    'postgresql://qa_purchase_audit:' +
    password +
    '@127.0.0.1:' +
    port.HostPort +
    '/' +
    database;
  const migrations = path.join(cwd, 'prisma', 'migrations');
  const names = readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(names.at(-1), target);

  // Give Prisma the real pre-UX-007I migration files so the upgrade uses its own ledger.
  stage = 'deploy pre-audit Prisma baseline';
  baseline = mkdtempSync(path.join(cwd, 'node_modules', '.ux007i-baseline-'));
  const baselineMigrations = path.join(baseline, 'prisma', 'migrations');
  mkdirSync(baselineMigrations, { recursive: true });
  cpSync(
    path.join(cwd, 'prisma', 'schema.prisma'),
    path.join(baseline, 'prisma', 'schema.prisma'),
  );
  cpSync(
    path.join(migrations, 'migration_lock.toml'),
    path.join(baselineMigrations, 'migration_lock.toml'),
  );
  for (const migration of names.slice(0, -1)) {
    cpSync(
      path.join(migrations, migration),
      path.join(baselineMigrations, migration),
      { recursive: true },
    );
  }
  const baselineConfig = path.join(baseline, 'prisma.config.ts');
  cpSync(path.join(cwd, 'prisma.config.ts'), baselineConfig);
  const prisma = path.join(cwd, 'node_modules', 'prisma', 'build', 'index.js');
  const isolatedEnv = {
    ...env,
    DATABASE_URL: url,
    DOTENV_CONFIG_PATH: path.join(baseline, 'unused.env'),
  };
  run(
    process.execPath,
    [prisma, 'migrate', 'deploy', '--config', baselineConfig],
    { env: isolatedEnv },
  );
  console.log(
    'Prisma migrate deploy: pre-audit baseline applied (' +
      (names.length - 1) +
      ' migrations).',
  );

  stage = 'run PostgreSQL audit tests';
  run(
    process.execPath,
    [
      'node_modules/jest/bin/jest.js',
      '--config',
      'test/jest-e2e.json',
      '--runInBand',
      '--bail',
      '--runTestsByPath',
      'test/purchase-cost-audit.postgres.e2e-spec.ts',
    ],
    {
      stdio: 'inherit',
      env: {
        ...isolatedEnv,
        UX007I_PG_URL: url,
        UX007I_CONTAINER: containerId,
        UX007I_RUN_ID: runId,
      },
    },
  );
} catch (error) {
  console.error('UX-007I PostgreSQL QA failed at ' + stage);
  if (error.stderr)
    console.error(
      String(error.stderr).replaceAll(password, '[REDACTED]').slice(0, 2000),
    );
  process.exitCode = 1;
} finally {
  if (baseline) {
    const resolvedBaseline = path.resolve(baseline);
    assert.equal(
      path.dirname(resolvedBaseline),
      path.join(cwd, 'node_modules'),
    );
    assert.match(
      path.basename(resolvedBaseline),
      /^\.ux007i-baseline-[a-zA-Z0-9]+$/,
    );
    rmSync(resolvedBaseline, { recursive: true, force: true });
  }
  if (containerId) {
    run('docker', ['rm', '--force', containerId]);
    console.log('Removed the disposable UX-007I PostgreSQL container.');
  }
}
