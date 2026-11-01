# ZFILES-INT-02A / CONC-REVIEW-02

Ticket #187. Base verificada: 9bc2739bd836f14cf653181638b1b28819245724.
Rama: codex/zfiles-int-02a-receipt-links. El worktree estaba limpio antes de editar.

## Cambio productivo

Link y unlink declaran Prisma.TransactionIsolationLevel.ReadCommitted en su única
transacción. No se modifican rutas, respuestas, permisos ni timeouts productivos.
El resto del diff del servicio corresponde al formato de los argumentos.

Los tres flujos usan Supplier FOR NO KEY UPDATE con ID y Company. Link lee la
recepción, adquiere el lock y después revalida documento, proveedor y ACTIVE.
Unlink adquiere ese lock y cierra condicionalmente el vínculo que sigue activo;
permite desvincular un documento cancelado, conservando el histórico. Cancelación
mantiene su claim de idempotencia antes del mismo lock, relee ACTIVE y ejecuta
su operación original. No se introduce otro orden de locks ni una transacción anidada.

cancelDocument y su servicio completo no cambian. Tampoco cambian conciliación
monetaria, inventario, movimientos, Prisma/migraciones, Web, dependencias ni launcher QA.
No se incorporan R2, adjuntos o descargas.

## Pruebas deterministas

Cada actor usa un PrismaClient independiente con connection_limit=1. Su PID
se obtiene de PostgreSQL y se comprueba dentro de la transacción. Cada sesión
tiene default_transaction_isolation=repeatable read: las operaciones reales deben
seguir mostrando read committed. No se simula identidad mediante SET ROLE.

Las barreras mantienen el primer lock. El observador consulta el PID exacto del
waiter, wait_event_type=Lock, la consulta Supplier y pg_blocking_pids. Sólo se
aceptan bloqueadores conocidos del escenario. El polling de 10 ms no constituye
por sí solo evidencia de bloqueo. La cola mixta registra también bloqueadores
intermedios, no exige que todo waiter dependa directamente del primer PID.

| Escenario | Waiter → bloqueador observado | Resultado persistido |
|---|---|---|
| Link antes de cancel | 114 → 113 | Ambos confirman; vínculo conservado y documento CANCELLED |
| Cancel antes de link | 116 → 115 | Cancel confirma; link rechaza con ConflictException; ningún vínculo nuevo |
| Unlink antes de cancel | 118 → 117 | Ambos confirman; mismo vínculo cerrado, con actor/motivo/fecha |
| Cancel antes de unlink | 120 → 119 | Ambos confirman; documento cancelado y vínculo cerrado |
| Timeout link | 122 → 121 | SQLSTATE 55P03; snapshot sin cambios y conexión idle sin transacción |
| Timeout unlink | 125 → 124 | SQLSTATE 55P03; vínculo original sin cierre falso ni otra evidencia |
| Cola mixta | 127 → 126; 128 → 127; 129 → 127/128 | Sin deadlock observado, como máximo un vínculo activo e histórico conservado |

Los PID son evidencia de esta ejecución, no valores esperados fijos del test.
Los tests calculan los PID y las relaciones de bloqueo en cada ejecución.

Tras cada timeout se libera el holder y una nueva operación confirma en la misma
conexión del waiter. Se verifica el rollback comparando filas de vínculos,
auditoría documental, idempotencia, asignaciones monetarias, recepciones y tablas
de stock antes/después. Se comprueba también que xact_start sea NULL.

Los escenarios con cancelación admiten únicamente su auditoría y claim legítimos
adicionales. Link rechazado no añade vínculo ni auditoría propia espuria. Los
vínculos retirados desaparecen de la consulta; un vínculo conservado tras cancelar
expone document.status=CANCELLED y no se convierte en aprobación documental.

El timeout de lock de 3 segundos se configura sólo mediante SET LOCAL en el actor
de pruebas. El presupuesto de transacción del harness es 15 segundos para sostener
las barreras. No se alteran los timeouts productivos ni los del frontend.

## QA y aislamiento

PostgreSQL 16.15 nuevo, tmpfs, cero tablas iniciales, base zaping_test, usuario ci,
puerto localhost aleatorio 51314. Contenedor propio:
8fccd7b3166dae195b6cf12d40baeb2eee06b08f7590458881cd6b361dda4524.
Se verificó su ID/montajes/puerto/identidad antes de migrar y se retiró por ese ID
al terminar. No se usaron bases operativas. Las 51 migraciones se aplicaron sólo
a ese servidor descartable; no hay migraciones nuevas en este cambio.

- PostgreSQL + HTTP/JWT/RBAC/historial/concurrencia: 17/17 PASS, 36,562 segundos.
- Unitarios afectados: 20/20 PASS en 2 suites, incluidos aislamiento y normalización.
- Prisma validate: PASS.
- Typecheck API: PASS.
- Lint API completo sin autofix y build: PASS.
- Web: sin cambios; no se ejecutó ni modificó su suite o configuración.

Comandos: Prisma CLI validate; Jest src/supplier-documents --runInBand; Jest con
test/jest-e2e.json y receipt-document-links.postgres.e2e-spec.ts; tsc --noEmit
-p tsconfig.build.json; eslint con el patrón oficial {src,apps,libs,test}/**/*.ts
sin autofix; nest build.

Evidencias locales conservadas bajo
C:/dev/zaping/output/zfiles-int-02a/.qa/CONC-REVIEW-02/run-1/:
isolation.json, cleanup.json, migrations.log, postgres-tests.log,
pid-evidence.jsonl, unit-tests.log, prisma-validate.log, typecheck.log, lint.log y build.log.
El JSONL contiene 9 observaciones de lock, 7 registros de escenarios con 18
transacciones y 2 rollbacks. Se conservan lint-attempt1.log y lint-attempt2.log:
el lint detectó una aserción de tipos innecesaria y después su indentación.
Se corrigieron sin cambiar lógica; type-only-fix.json verifica que el JavaScript
emitido del E2E final es idéntico al que pasó las 17 pruebas PostgreSQL.

## Riesgos residuales y revisión

La prueba de contención es pequeña: no acredita throughput ni ausencia universal
de deadlocks. Sigue existiendo serialización por proveedor. El timeout probado
es el del lock PostgreSQL; no se ejercitaron caída de red, agotamiento del pool o
el límite temporal propio de una transacción Prisma. Los errores de motor siguen
propagándose con rollback, sin retries automáticos ni nuevo mapeo HTTP.

Los fixtures de concurrencia no contienen asignaciones financieras ni existencias
previas; la afirmación de que no cambian esos flujos se apoya también en el diff
sin modificaciones de sus módulos y en las escrituras acotadas del servicio.

**PASS para la matriz local CONC-REVIEW-02**. No merge-ready: revisar resultados en ChatGPT. Sin push, merge,
deploy ni cambios en main. Se conservan output, tmp y las evidencias anteriores.
