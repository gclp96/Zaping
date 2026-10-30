/* QA-AB-01: owns one newly created tmpfs PostgreSQL 16; never attaches existing DBs. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const Module = require('node:module');
const api = path.resolve(__dirname, '..');
const root = path.resolve(api, '../..');
const suffix = crypto.randomBytes(6).toString('hex');
const container = 'zaping-qa-ab-' + suffix;
const database = 'qa_ab_' + suffix;
const role = 'qa_ab_user_' + suffix;
const admin = 'qa_ab_admin_' + suffix;
const password = crypto.randomBytes(24).toString('hex');
const adminPassword = crypto.randomBytes(24).toString('hex');
const token = crypto.randomBytes(24).toString('hex');
const baseline = '226f5af0dad9d27e0a19d080ff7b2b27c952122a';
let stage;
const secrets = [password, adminPassword, token];
const redact = (s) =>
  secrets.reduce((s, v) => s.split(v).join('[REDACTED]'), String(s));
const env = {
  ...process.env,
  NODE_ENV: 'test',
};
delete env.GITHUB_ACTIONS;
delete env.RUN_DB_CONCURRENCY_TESTS;
let id;
let old;
let db;
let passed = 0;
function run(file, args, options = {}) {
  try {
    return cp.execFileSync(file, args, {
      cwd: api,
      env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    });
  } catch (e) {
    throw new Error(
      redact(
        [file, 'exit=' + e.status, e.stdout ?? '', e.stderr ?? ''].join('\n'),
      ),
    );
  }
}
function sql(text, bootstrap = false) {
  const e = { ...env, PGPASSWORD: bootstrap ? adminPassword : password };
  return run(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      'PGPASSWORD',
      container,
      'psql',
      '-X',
      '-q',
      '-t',
      '-A',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      bootstrap ? admin : role,
      '-d',
      database,
    ],
    { input: text, env: e },
  );
}
async function check(name, fn) {
  await fn();
  passed++;
  console.log('UPGRADE PASS ' + passed + ': ' + name);
}
function original(file) {
  return run('git', ['show', baseline + ':' + file], { cwd: root });
}
function originalExports(file) {
  const ts = require(path.join(api, 'node_modules/typescript'));
  const js = ts.transpileModule(original(file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2023,
    },
  }).outputText;
  const m = new Module(path.join(api, 'qa-ab-original.cjs'), module);
  m.filename = path.join(api, 'qa-ab-original.cjs');
  m.paths = Module._nodeModulePaths(api);
  m._compile(js, m.filename);
  return m.exports;
}
async function snapshot(client, companyId) {
  const tables = [
    'Company',
    'User',
    'Product',
    'Supplier',
    'Purchase',
    'PurchaseItem',
    'PurchaseReceipt',
    'PurchaseReceiptItem',
    'IdempotencyRecord',
    'InventoryPosition',
    'InventoryBatch',
    'InventoryPhysicalEffect',
    'InventoryPhysicalEffectLine',
    'InventoryMovement',
  ];
  const result = {};
  for (const table of tables) {
    const where = table === 'Company' ? 'id' : 'companyId';
    const predicate =
      table === 'PurchaseItem'
        ? '"purchaseId" IN (SELECT id FROM "Purchase" WHERE "companyId"=$1)'
        : '"' + where + '"=$1';
    result[table] = await client.$queryRawUnsafe(
      'SELECT to_jsonb(t) - ' +
        "'expirationDate'" +
        ' AS row FROM "' +
        table +
        '" t WHERE ' +
        predicate +
        ' ORDER BY id',
      companyId,
    );
    // Position is the only table gaining a field. Preserve expiry evidence on every other table.
    if (table !== 'InventoryPosition')
      result[table] = await client.$queryRawUnsafe(
        'SELECT to_jsonb(t) AS row FROM "' +
          table +
          '" t WHERE ' +
          predicate +
          ' ORDER BY id',
        companyId,
      );
  }
  return result;
}
function assertRepositoryTarget({
  branch,
  head,
  expectedHead,
  githubActions,
  ci,
  githubSha,
}) {
  const onActions = githubActions === 'true' && ci === 'true';
  const expected = expectedHead ?? (onActions ? githubSha : baseline);
  assert.match(
    expected ?? '',
    /^[a-f0-9]{40}$/,
    'Expected an exact authorized commit SHA',
  );
  assert.equal(head, expected, 'HEAD differs from the authorized SHA');
  if (onActions) {
    assert.match(githubSha ?? '', /^[a-f0-9]{40}$/, 'GitHub SHA is required');
    assert.equal(head, githubSha, 'HEAD differs from the GitHub workflow SHA');
  } else {
    const receiptLinksBranch = branch === 'codex/zfiles-int-02a-receipt-links';
    if (receiptLinksBranch) {
      assert.match(
        expectedHead ?? '',
        /^[a-f0-9]{40}$/,
        'Explicit QA SHA required',
      );
    }
    assert.ok(
      receiptLinksBranch ||
        branch === 'codex/insap-auto-01b-foundation-receipts',
      'Unexpected local QA branch',
    );
  }
  return head;
}
async function main() {
  const head = assertRepositoryTarget({
    branch: run('git', ['branch', '--show-current'], { cwd: root }).trim(),
    head: run('git', ['rev-parse', 'HEAD'], { cwd: root }).trim(),
    expectedHead: process.env.QA_AB_EXPECTED_HEAD,
    githubActions: process.env.GITHUB_ACTIONS,
    ci: process.env.CI,
    githubSha: process.env.GITHUB_SHA,
  });
  // CI checkout must contain the real baseline, not a local v1 schema copy.
  run('git', ['merge-base', '--is-ancestor', baseline, head], { cwd: root });
  const options = process.argv.slice(2);
  assert.ok(
    options.every((v) => ['--upgrade-only', '--legacy-only'].includes(v)),
    'Unknown QA mode',
  );
  assert.ok(
    !(options.includes('--upgrade-only') && options.includes('--legacy-only')),
    'QA modes are exclusive',
  );
  stage = fs.mkdtempSync(path.join(os.tmpdir(), 'zaping-qa-ab-'));
  env.DOTENV_CONFIG_PATH = path.join(stage, 'no-dotenv');
  for (const f of [
    '.env',
    '.env.local',
    'app/api/.env',
    'web/.env',
    'web/.env.local',
  ])
    assert.equal(
      fs.existsSync(path.join(root, f)),
      false,
      'QA refuses an existing dotenv file',
    );
  console.log('Creating fresh tmpfs PostgreSQL 16 for QA-AB-01');
  id = run(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      container,
      '--label',
      'zaping.qa-ab-token=' + token,
      '--label',
      'zaping.qa=QA-AB-01',
      '--tmpfs',
      '/var/lib/postgresql/data:rw,noexec,nosuid,size=536870912',
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_USER=' + admin,
      '--env',
      'POSTGRES_DB=' + database,
      '--env',
      'POSTGRES_PASSWORD',
      'postgres:16',
    ],
    { env: { ...env, POSTGRES_PASSWORD: adminPassword } },
  ).trim();
  const deadline = Date.now() + 60000;
  while (true) {
    try {
      run('docker', [
        'exec',
        container,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        admin,
        '-d',
        database,
      ]);
      break;
    } catch (e) {
      if (Date.now() > deadline) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const meta = JSON.parse(
    run('docker', ['inspect', '--format', '{{json .}}', container]),
  );
  assert.equal(meta.Id, id);
  assert.equal(meta.HostConfig.AutoRemove, true);
  assert.ok(meta.HostConfig.Tmpfs['/var/lib/postgresql/data']);
  assert.ok(meta.Mounts.every((m) => m.Type === 'tmpfs'));
  const ports = meta.NetworkSettings.Ports['5432/tcp'];
  assert.equal(ports.length, 1);
  assert.equal(ports[0].HostIp, '127.0.0.1');
  const internal = Object.values(meta.NetworkSettings.Networks)[0].IPAddress;
  const bootstrap = JSON.parse(
    sql(
      "SELECT json_build_object('database',current_database(),'role',current_user,'version',current_setting('server_version_num')::int,'port',current_setting('port')::int,'tables',(SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')))::text;",
      true,
    ).trim(),
  );
  assert.equal(bootstrap.database, database);
  assert.equal(bootstrap.role, admin);
  assert.ok(bootstrap.version >= 160000 && bootstrap.version < 170000);
  assert.equal(bootstrap.port, 5432);
  assert.equal(bootstrap.tables, 0);
  console.log(
    'BOOTSTRAP READ-ONLY IDENTITY VERIFIED ' + JSON.stringify(bootstrap),
  );
  // Only this fresh server is addressed. Bootstrap credentials never leave this process.
  sql(
    'CREATE ROLE ' +
      role +
      " LOGIN PASSWORD '" +
      password +
      "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; ALTER DATABASE " +
      database +
      ' OWNER TO ' +
      role +
      '; GRANT EXECUTE ON FUNCTION pg_control_system() TO ' +
      role +
      '; COMMENT ON DATABASE ' +
      database +
      " IS 'QA-AB-01:" +
      token +
      "';",
    true,
  );
  const url =
    'postgresql://' +
    role +
    ':' +
    password +
    '@127.0.0.1:' +
    ports[0].HostPort +
    '/' +
    database;
  Object.assign(env, {
    DATABASE_URL: url,
    QA_AB_DATABASE_URL: url,
    RUN_QA_AB_PG: '1',
    QA_AB_CONTAINER: container,
    QA_AB_CONTAINER_ID: id,
    QA_AB_DATABASE: database,
    QA_AB_ROLE: role,
    QA_AB_PORT: ports[0].HostPort,
    QA_AB_INTERNAL_ADDRESS: internal,
    QA_AB_TOKEN: token,
  });
  Object.assign(process.env, env);
  require(path.join(api, 'node_modules/ts-node')).register({
    transpileOnly: true,
    project: path.join(api, 'tsconfig.json'),
  });
  const { PrismaClient } = require(
    path.join(api, 'node_modules/@prisma/client'),
  );
  db = new PrismaClient({ datasources: { db: { url } } });
  const [server] = await db.$queryRawUnsafe(
    "SELECT current_database() AS database,current_user AS role,version() AS version,host(inet_server_addr()) AS address,inet_server_port() AS port,(SELECT system_identifier::text FROM pg_control_system()) AS system, (SELECT count(*)::int FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')) AS tables",
  );
  assert.equal(server.database, database);
  assert.equal(server.role, role);
  assert.equal(server.address, internal);
  assert.equal(server.port, 5432);
  assert.equal(server.tables, 0);
  assert.match(server.version, /PostgreSQL 16\./);
  env.QA_AB_SYSTEM_ID = server.system;
  process.env.QA_AB_SYSTEM_ID = server.system;
  const authorized =
    await require('./helpers/qa-ab-ephemeral-postgres.ts').openQaAbPostgres();
  await authorized.$disconnect();
  console.log(
    'ISOLATION VERIFIED ' +
      JSON.stringify({
        container,
        id,
        host: '127.0.0.1',
        externalPort: ports[0].HostPort,
        ...server,
        owner: role,
        nonAdmin: true,
        tmpfs: true,
      }),
  );
  const migrationRoot = path.join(api, 'prisma/migrations');
  const s1 = '20261023000001_inventory_position_unbatched_expiry';
  const historicalFiles = run(
    'git',
    [
      'ls-tree',
      '-r',
      '--name-only',
      baseline,
      '--',
      'app/api/prisma/migrations',
    ],
    { cwd: root },
  )
    .trim()
    .split('\n')
    .filter(
      (file) => file.endsWith('/migration.sql') && file.split('/').at(-2) < s1,
    )
    .sort();
  assert.equal(
    historicalFiles.length,
    46,
    'The fixed baseline must have 46 pre-S1 migrations',
  );
  const historicalSql = historicalFiles.map((file) => {
    const expected = original(file).replace(/\r\n/g, '\n');
    assert.equal(
      fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'),
      expected,
      'A historical migration differs from the fixed baseline: ' + file,
    );
    return expected;
  });
  const migrations = historicalFiles.map((file) => file.split('/').at(-2));
  for (const text of historicalSql) sql(text);
  console.log(
    'PRE-S1 schema built with ' +
      migrations.length +
      ' original migrations; last=' +
      migrations.at(-1),
  );
  if (process.argv.includes('--legacy-only')) {
    sql(fs.readFileSync(path.join(migrationRoot, s1, 'migration.sql'), 'utf8'));
    env.RUN_DB_CONCURRENCY_TESTS = '1';
    const reportPath = path.join(stage, 'legacy.json');
    let failure;
    try {
      run(
        process.execPath,
        [
          path.join(api, 'node_modules/jest/bin/jest.js'),
          '--config',
          'test/jest-e2e.json',
          '--runInBand',
          '--bail=1',
          '--json',
          '--outputFile',
          reportPath,
          'test/inventory.concurrency.e2e-spec.ts',
        ],
        { timeout: 180000 },
      );
    } catch (error) {
      failure = error;
    }
    if (fs.existsSync(reportPath)) {
      const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      console.log(
        'LEGACY_E2E_RESULT ' +
          JSON.stringify({
            passed: r.numPassedTests,
            failed: r.numFailedTests,
            pending: r.numPendingTests,
            total: r.numTotalTests,
          }),
      );
    }
    if (failure) throw failure;
    return;
  }
  const clientPath = path
    .join(api, 'node_modules', '.qa-ab-v1-' + suffix)
    .replace(/\\/g, '/');
  const schema = original('app/api/prisma/schema.prisma').replace(
    'provider = "prisma-client-js"',
    'provider = "prisma-client-js"\n  output = "' + clientPath + '"',
  );
  assert.ok(schema.includes(clientPath));
  fs.writeFileSync(path.join(stage, 'schema.prisma'), schema);
  run(
    process.execPath,
    [
      path.join(api, 'node_modules/prisma/build/index.js'),
      'generate',
      '--schema',
      path.join(stage, 'schema.prisma'),
    ],
    { cwd: stage },
  );
  const OldClient = require(clientPath).PrismaClient;
  old = new OldClient({ datasources: { db: { url } } });
  const oldPhysical = originalExports(
    'app/api/src/inventory/physical/physical-inventory.contract.ts',
  );
  const oldReceipt = originalExports(
    'app/api/src/purchases-receipts/purchase-receipt-request-hash.ts',
  );
  const companyId = '11111111-1111-4111-8111-111111111111',
    actorId = '22222222-2222-4222-8222-222222222222',
    productId = '33333333-3333-4333-8333-333333333333';
  const target = {
    productId,
    inventoryBatchId: null,
    state: 'AVAILABLE',
    contextType: null,
    contextId: null,
  };
  const request = {
    companyId,
    actorId,
    origin: { type: 'S2_COMPAT', id: 'historical', operation: 'APPLY' },
    operation: { kind: 'CREDIT', credits: [{ target, quantity: 3 }] },
  };
  const golden =
    'e5b4e36f86b37e317666f4e5a0ab0638ad6457893feb128b018cec7ab01d2450';
  assert.equal(oldPhysical.physicalRequestHash(request), golden);
  await old.company.create({
    data: {
      id: companyId,
      name: 'QA-AB pre-S1',
      rfc: companyId,
      timezone: 'America/Hermosillo',
    },
  });
  await old.user.create({
    data: {
      id: actorId,
      companyId,
      firstName: 'QA',
      lastName: 'AB',
      email: actorId + '@example.invalid',
      passwordHash: 'NOT-A-LOGIN',
      role: 'ADMIN',
    },
  });
  await old.product.create({
    data: {
      id: productId,
      companyId,
      sku: productId,
      name: 'Historical NULL',
      lotTracking: 'OPTIONAL',
      inventoryTracking: 'QUANTITY',
    },
  });
  let available, custody;
  await old.$transaction(async (tx) => {
    available = await tx.inventoryPosition.create({
      data: { companyId, ...target, quantity: 3, revision: 1 },
    });
    const effect = await tx.inventoryPhysicalEffect.create({
      data: {
        companyId,
        actorId,
        originType: 'S2_COMPAT',
        originId: 'historical',
        originOperation: 'APPLY',
        kind: 'CREDIT',
        requestHash: golden,
        lineCount: 1,
      },
    });
    await tx.inventoryPhysicalEffectLine.create({
      data: {
        companyId,
        effectId: effect.id,
        positionId: available.id,
        sequence: 1,
        delta: 3,
        quantityBefore: 0,
        quantityAfter: 3,
        revisionBefore: 0,
        revisionAfter: 1,
      },
    });
    await tx.product.update({ where: { id: productId }, data: { stock: 3 } });
    await tx.inventoryMovement.create({
      data: {
        companyId,
        productId,
        movementType: 'IN',
        quantity: 3,
        balance: 3,
        referenceType: 'QA_AB_V1',
        referenceId: effect.id,
        createdBy: actorId,
      },
    });
  });
  await old.$transaction(async (tx) => {
    custody = await tx.inventoryPosition.create({
      data: {
        companyId,
        productId,
        inventoryBatchId: null,
        state: 'CUSTODY',
        contextType: 'QA_AB_V1',
        contextId: 'historical-case',
        quantity: 1,
        revision: 1,
      },
    });
    await tx.inventoryPosition.update({
      where: { id: available.id },
      data: { quantity: 2, revision: 2 },
    });
    const intent = {
      companyId,
      actorId,
      origin: {
        type: 'QA_AB_V1',
        id: 'historical-transfer',
        operation: 'TRANSFER',
      },
      operation: {
        kind: 'TRANSFER',
        transfers: [
          {
            sourceId: available.id,
            quantity: 1,
            expectedSourceRevision: 1,
            target: {
              productId,
              inventoryBatchId: null,
              state: 'CUSTODY',
              contextType: 'QA_AB_V1',
              contextId: 'historical-case',
            },
          },
        ],
      },
    };
    const effect = await tx.inventoryPhysicalEffect.create({
      data: {
        companyId,
        actorId,
        originType: intent.origin.type,
        originId: intent.origin.id,
        originOperation: intent.origin.operation,
        kind: 'TRANSFER',
        requestHash: oldPhysical.physicalRequestHash(intent),
        lineCount: 2,
      },
    });
    await tx.inventoryPhysicalEffectLine.createMany({
      data: [
        {
          companyId,
          effectId: effect.id,
          positionId: available.id,
          sequence: 1,
          delta: -1,
          quantityBefore: 3,
          quantityAfter: 2,
          revisionBefore: 1,
          revisionAfter: 2,
        },
        {
          companyId,
          effectId: effect.id,
          positionId: custody.id,
          sequence: 2,
          delta: 1,
          quantityBefore: 0,
          quantityAfter: 1,
          revisionBefore: 0,
          revisionAfter: 1,
        },
      ],
    });
  });
  const supplier = await old.supplier.create({
    data: { companyId, name: 'QA pre-S1 supplier' },
  });
  const receiptProduct = await old.product.create({
    data: {
      companyId,
      sku: crypto.randomUUID(),
      name: 'Historical receipt',
      inventoryTracking: 'QUANTITY',
      lotTracking: 'OPTIONAL',
    },
  });
  const purchase = await old.purchase.create({
    data: {
      companyId,
      supplierId: supplier.id,
      folio: 'QA-V1-PO',
      status: 'PARTIALLY_RECEIVED',
      subtotal: 50,
      iva: 0,
      total: 50,
      items: {
        create: [
          {
            productId: receiptProduct.id,
            quantity: 10,
            price: 5,
            subtotal: 50,
          },
        ],
      },
    },
    include: { items: true },
  });
  const dto = {
    purchaseId: purchase.id,
    supplierDocumentType: 'REMISION',
    supplierDocumentNumber: 'QA-V1-REM',
    items: [{ purchaseItemId: purchase.items[0].id, quantityReceived: 2 }],
  };
  let receipt;
  await old.$transaction(async (tx) => {
    receipt = await tx.purchaseReceipt.create({
      data: {
        companyId,
        purchaseId: purchase.id,
        folio: 'QA-V1-REC',
        receivedBy: actorId,
        supplierDocumentType: 'REMISION',
        supplierDocumentNumber: 'QA-V1-REM',
      },
    });
    await tx.purchaseReceiptItem.create({
      data: {
        companyId,
        receiptId: receipt.id,
        purchaseItemId: purchase.items[0].id,
        productId: receiptProduct.id,
        quantityReceived: 2,
        unitCost: 5,
      },
    });
    await tx.idempotencyRecord.create({
      data: {
        companyId,
        scope: 'PURCHASE_RECEIPT_CREATE',
        key: 'qa-ab-v1',
        requestHash: oldReceipt.createPurchaseReceiptRequestHash(dto),
        resourceId: receipt.id,
      },
    });
    const position = await tx.inventoryPosition.create({
      data: {
        companyId,
        productId: receiptProduct.id,
        inventoryBatchId: null,
        state: 'AVAILABLE',
        quantity: 2,
        revision: 1,
      },
    });
    const intent = {
      companyId,
      actorId,
      origin: {
        type: 'PURCHASE_RECEIPT',
        id: receipt.id,
        operation: 'RECEIVE_QUANTITY',
      },
      operation: {
        kind: 'CREDIT',
        credits: [
          {
            target: {
              productId: receiptProduct.id,
              inventoryBatchId: null,
              state: 'AVAILABLE',
              contextType: null,
              contextId: null,
            },
            quantity: 2,
          },
        ],
      },
    };
    const effect = await tx.inventoryPhysicalEffect.create({
      data: {
        companyId,
        actorId,
        originType: intent.origin.type,
        originId: receipt.id,
        originOperation: intent.origin.operation,
        kind: 'CREDIT',
        requestHash: oldPhysical.physicalRequestHash(intent),
        lineCount: 1,
      },
    });
    await tx.inventoryPhysicalEffectLine.create({
      data: {
        companyId,
        effectId: effect.id,
        positionId: position.id,
        sequence: 1,
        delta: 2,
        quantityBefore: 0,
        quantityAfter: 2,
        revisionBefore: 0,
        revisionAfter: 1,
      },
    });
    await tx.product.update({
      where: { id: receiptProduct.id },
      data: { stock: 2 },
    });
    await tx.inventoryMovement.create({
      data: {
        companyId,
        productId: receiptProduct.id,
        movementType: 'IN',
        quantity: 2,
        balance: 2,
        unitCost: 5,
        referenceType: 'PURCHASE_RECEIPT',
        referenceId: receipt.id,
        createdBy: actorId,
      },
    });
  });
  const batch = await old.inventoryBatch.create({
    data: {
      companyId,
      productId,
      lotNumber: 'REAL-V1',
      initialQuantity: 0,
      availableQuantity: 0,
      unitCost: 1,
      expirationDate: new Date('2035-08-15T13:45:00Z'),
    },
  });
  await old.inventoryPosition.create({
    data: {
      companyId,
      productId,
      inventoryBatchId: batch.id,
      state: 'AVAILABLE',
    },
  });
  const before = await snapshot(old, companyId);
  const functions = await old.$queryRawUnsafe(
    "SELECT proname,pg_get_functiondef(p.oid) AS body FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY proname,p.oid",
  );
  await check(
    'fixtures v1 committed before S1; DATE column absent',
    async () => {
      const rows = await old.$queryRawUnsafe(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='InventoryPosition' AND column_name='expirationDate'",
      );
      assert.equal(rows.length, 0);
      assert.equal(before.InventoryPhysicalEffect.length, 3);
      assert.equal(before.InventoryPhysicalEffectLine.length, 4);
      assert.equal(before.InventoryPosition.length, 4);
    },
  );
  sql(fs.readFileSync(path.join(migrationRoot, s1, 'migration.sql'), 'utf8'));
  await check(
    'pre-S1 data unchanged: IDs, quantities, revisions, relations, Effects, claim, audit and documents',
    async () => assert.deepEqual(await snapshot(db, companyId), before),
  );
  await check(
    'new position DATE is NULL for every legacy row; Batch timestamp unchanged',
    async () => {
      const rows = await db.inventoryPosition.findMany({
        where: { companyId },
      });
      assert.ok(rows.every((p) => p.expirationDate === null));
      assert.equal(
        (
          await db.inventoryBatch.findUniqueOrThrow({ where: { id: batch.id } })
        ).expirationDate.toISOString(),
        '2035-08-15T13:45:00.000Z',
      );
    },
  );
  await check('historical SQL function definitions unchanged', async () =>
    assert.deepEqual(
      await db.$queryRawUnsafe(
        "SELECT proname,pg_get_functiondef(p.oid) AS body FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY proname,p.oid",
      ),
      functions,
    ),
  );
  const {
    PhysicalInventoryService,
  } = require('../dist/src/inventory/physical/physical-inventory.service');
  const {
    PhysicalInventoryRepository,
  } = require('../dist/src/inventory/physical/physical-inventory.repository');
  const physical = new PhysicalInventoryService(
    new PhysicalInventoryRepository(),
  );
  await check(
    'fixed v1 golden hash and real Effect replay after upgrade without writes',
    async () => {
      const nowHash =
        require('../dist/src/inventory/physical/physical-inventory.contract').physicalRequestHash(
          request,
        );
      assert.equal(nowHash, golden);
      const result = await db.$transaction((tx) => physical.apply(tx, request));
      assert.equal(result.replay, true);
      assert.deepEqual(await snapshot(db, companyId), before);
    },
  );
  await check(
    'historical supplier-document receipt replay after upgrade without a new credit',
    async () => {
      const {
        PurchaseReceiptsService,
      } = require('../dist/src/purchases-receipts/purchases-receipts.service');
      const authority = {
        run: (_c, action) => db.$transaction((tx) => action(tx, 'PHYSICAL')),
      };
      const service = new PurchaseReceiptsService(db, {}, authority, {});
      const result = await service.create(companyId, actorId, 'qa-ab-v1', dto);
      assert.equal(result.id, receipt.id);
      assert.deepEqual(await snapshot(db, companyId), before);
    },
  );
  await check(
    'NULLS NOT DISTINCT prevents duplicate AVAILABLE and CUSTODY NULL identities',
    async () => {
      for (const source of [available, custody])
        await assert.rejects(
          db.inventoryPosition.create({
            data: {
              companyId,
              productId,
              inventoryBatchId: null,
              state: source.state,
              contextType: source.contextType,
              contextId: source.contextId,
            },
          }),
          (e) => e.code === 'P2002',
        );
    },
  );
  await check(
    'known DATE identities coexist and reject same-day duplicates',
    async () => {
      for (const state of ['AVAILABLE', 'CUSTODY'])
        for (const day of ['2035-08-15', '2035-08-16']) {
          const data = {
            companyId,
            productId,
            inventoryBatchId: null,
            state,
            contextType: state === 'CUSTODY' ? 'QA_AB_V1' : null,
            contextId: state === 'CUSTODY' ? 'historical-case' : null,
            expirationDate: new Date(day + 'T00:00:00Z'),
          };
          await db.inventoryPosition.create({ data });
          await assert.rejects(
            db.inventoryPosition.create({ data }),
            (e) => e.code === 'P2002',
          );
        }
    },
  );
  await check(
    'CHECK rejects Batch plus Position DATE with atomic rollback',
    async () => {
      const beforeCount = await db.inventoryPosition.count({
        where: { companyId },
      });
      await assert.rejects(
        db.inventoryPosition.create({
          data: {
            companyId,
            productId,
            inventoryBatchId: batch.id,
            state: 'CUSTODY',
            contextType: 'QA_AB_V1',
            contextId: 'bad',
            expirationDate: new Date('2035-08-15'),
          },
        }),
      );
      assert.equal(
        await db.inventoryPosition.count({ where: { companyId } }),
        beforeCount,
      );
    },
  );
  assert.equal(passed, 9, 'All nine historical upgrade checks must pass');
  console.log(
    'UPGRADE TOTAL ' +
      passed +
      ' PASS; applying S1 did not reconstruct historical evidence.',
  );
  await old.$disconnect();
  old = undefined;
  await db.$disconnect();
  db = undefined;
  console.log(
    'UPGRADE_RESULT ' +
      JSON.stringify({ baseline, head, checks: passed, status: 'PASS' }),
  );
  if (
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.GITHUB_STEP_SUMMARY
  ) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      '\n### Historical upgrade pre-S1 → A\n\n- Baseline: \x60' +
        baseline +
        '\x60\n- Tested SHA: \x60' +
        head +
        '\x60\n- Upgrade: **9/9 PASS** on a new PostgreSQL 16 tmpfs container.\n- Preserved persisted v1 data, hashes and replays; no external database.\n',
    );
  }
  if (options.includes('--upgrade-only')) return;
  for (const file of [
    'inventory-position-expiry-migration.postgres.e2e-spec.ts',
    'purchase-receipt-supplier-document.postgres.e2e-spec.ts',
  ]) {
    console.log('POSTGRESQL E2E ' + file);
    const reportPath = path.join(stage, file + '.json');
    let failure;
    try {
      run(
        process.execPath,
        [
          path.join(api, 'node_modules/jest/bin/jest.js'),
          '--config',
          'test/jest-e2e.json',
          '--runInBand',
          '--bail=1',
          '--json',
          '--outputFile',
          reportPath,
          'test/' + file,
        ],
        { timeout: 180000 },
      );
    } catch (error) {
      failure = error;
    }
    if (fs.existsSync(reportPath)) {
      const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      console.log(
        'E2E_RESULT ' +
          JSON.stringify({
            file,
            passed: r.numPassedTests,
            failed: r.numFailedTests,
            pending: r.numPendingTests,
            total: r.numTotalTests,
            failures: r.testResults.flatMap((s) =>
              s.assertionResults
                .filter((t) => t.status !== 'passed')
                .map((t) => ({
                  name: t.fullName,
                  status: t.status,
                  failures: t.failureMessages.map(redact),
                })),
            ),
          }),
      );
    }
    if (failure) throw failure;
  }
  console.log('QA-AB-01 PostgreSQL phases completed.');
}
module.exports = { assertRepositoryTarget, baseline };

if (require.main === module)
  main()
    .catch((e) => {
      console.error(redact(e.stack ?? e.message));
      process.exitCode = 1;
    })
    .finally(async () => {
      await old?.$disconnect();
      await db?.$disconnect();
      if (id) {
        const actual = run('docker', [
          'inspect',
          '--format',
          '{{.Id}}',
          container,
        ]).trim();
        assert.equal(actual, id);
        run('docker', ['stop', '-t', '5', id]);
        console.log(
          'DESTROYED owned ephemeral container ' +
            id +
            '; tmpfs data discarded.',
        );
      }
      // Keep no credentials or database files on disk. stage contains only the v1 schema.
      if (stage) {
        assert.ok(
          path
            .resolve(stage)
            .startsWith(path.resolve(os.tmpdir()) + path.sep + 'zaping-qa-ab-'),
        );
        fs.rmSync(stage, { recursive: true, force: true });
      }
    });
