# QA-REVIEW-01C1-B-LOGIC — ledger SQLite sintético V1

> **No operativo.** Esta implementación es un simulador didáctico, no un servicio de autorización. El ticket #268 permite únicamente LOGIC con datos sintéticos. No prueba identidad del proceso, procedencia de paquetes, control de acceso del host ni staging. No usar con código, documentos, secretos ni usuarios reales. Los tickets #266 y #263, HOST y Gate C permanecen pendientes.

## Alcance, runtime y archivos

- GitHub: [#268](https://github.com/gclp96/Zaping/issues/268) → [#266](https://github.com/gclp96/Zaping/issues/266) → [#263](https://github.com/gclp96/Zaping/issues/263).
- Rama de trabajo prevista: `feature/qa-review-01c1-b-logic-268`; baseline autorizado `c6ffc331c5e776e04f78e68aa2025aa362a8fa92`.
- Runtime **exacto** `Node v24.20.0`, SQLite integrado **3.53.4** (`node:sqlite`, Stability 1.2/release candidate). Sin npm ni drivers externos.
- Solo **cuatro archivos nuevos**: el motor `.mjs`, su `.test.mjs`, el `-worker.mjs` exclusivamente de test y este documento.
- Solo fixtures de SQLite desechables en un subdirectorio `zaping-logic-268-*` de la carpeta temporal del sistema, archivo `ledger.sqlite`. No utilizar rutas reales del ERP. La comprobación de rutas **no es protección contra host adversarial ni TOCTOU**.
- No instalar, desplegar, crear VM, alterar CI, conectarse a internet, ejecutar Codex, habilitar `agent:ready`, ni gestionar credenciales.

## API simulada

Las funciones exportadas reciben un manejador devuelto por `createNewTestLedgerV1` o `attachExistingTestLedgerV1`; **no** hay API HTTP, socket, lector de paquetes, runner ni CLI de autorizaciones:

- `createNewTestLedgerV1({filePath, nowMs, testFault?})`: crea exclusivamente una fixture inexistente; no abre ni modifica un archivo previo. Devuelve `SIMULATED_CREATED`, generación G1 y manejador local.
- `attachExistingTestLedgerV1({filePath, expectedGeneration, testFault?})`: une otra conexión/proceso a G1; **no** crea generación nueva. Se bloquea si DB falta, cambia de esquema o está en cuarentena.
- `simulateServiceRestartV1({filePath, nowMs})`: tras verificar integridad, invalida cada `AUTHORIZED`, escribe eventos y cambia generación mediante una **misma transacción**. Es el único modo con rotación de generación.
- `simulateIssueV1(handle,{confirmationRef,binding,nowMs})`: única autorización sintética por hash de confirmación. `confirmationRef` es texto sintético restringido; nunca se almacena en claro. Devuelve una referencia aleatoria **solo de prueba**.
- `simulateConsumeV1`, `simulateRevokeV1`, `simulateReadStatusV1`: reciben `{authorizationRef,binding,nowMs}`; comprueban generación, binding, reloj y estado. Consumo/revocación requieren una sola fila CAS y evento en la misma transacción.
- `handle.close()` es idempotente y no concede permisos.

Las respuestas, incluso `BLOCKED`, llevan **siempre** `simulationOnly:true, stagePermission:false`. `SIMULATED_ISSUED`, `SIMULATED_CONSUMED`, `SIMULATED_REVOKED`, `SIMULATED_STATUS`, `SIMULATED_RESTARTED` y `BLOCKED` **no equivalen** a `APPROVED`, Gate C PASS, `QA_PASS`, `STAGED_SYNTHETIC_ONLY` ni `agent:ready`. Los códigos de bloqueo son diagnósticos internos del harness, **no** una interfaz pública hacia actores no confiables. Una futura fachada externa deberá aplanarlos en `BLOCKED` uniforme.

### Binding fijo

El objeto de test debe contener exactamente los campos primitivos `repository` (`gclp96/zaping`), `issueNumber` (268), `approvedIssueSha256` (64 hex), `scopeSha256` (64 hex), `expectedBaseSha` (40 hex), `packageSha256` (64 hex), `profile` (`LOGIC_TEST`) y `purpose` (`SYNTHETIC_TEST_ONLY`). Se hashea en orden fijo junto con la generación. **No hay verificación de origen humano ni firma**: la inspección/procedencia real son dependencias del futuro 01C1-C/HOST. Rechazar o aceptar un hash sintético **no** es una aprobación real.

## Persistencia y límites de seguridad

- Tablas: `ledger_meta`, `authorizations`, `ledger_events`, esquema V1, FK, `CHECK`, `UNIQUE confirmation_ref_hash`; historial/tombstones conservados sin GC en V1.
- En DB solo se persisten hashes de referencias, confirmación y binding; estados, generación, expiración y eventos sin payload. No se persisten referencias en claro, rutas, credenciales ni contenido externo.
- `PRAGMA journal_mode=DELETE`, `synchronous=EXTRA` (3), `foreign_keys=ON` (1), `trusted_schema=OFF` (0), `user_version=1`, integridad/FK y lectura posterior; `defensive:true`, extensiones deshabilitadas y `timeout=250 ms` como valor de simulación. No confundir la comprobación documental de API con la prueba real del sistema.
- `BEGIN IMMEDIATE` serializa writers: selección/validación, actualización condicional exacta (`changes===1` o `1n`), evento y `COMMIT` confirmado antes de devolver éxito lógico.
- **TTL 600000 ms**; a partir de `nowMs>=expiresAtMs` la autorización no puede consumirse. `last_observed_wall_ms` detecta *retroceso del reloj proporcionado al simulador*. No se prueba reloj host confiable, snapshot restore ni anti-rollback físico.
- En fallo inesperado, timeout, SQL ambiguo o respuesta perdida tras COMMIT, la instancia bloquea el intento y se cierra; intenta marcar `ledger_meta.health=QUARANTINED` tras rollback best-effort. La escritura de cuarentena también puede fallar por bloqueo/IO: **el simulador no garantiza cuarentena duradera frente a un fallo host o un proceso hostil**. `simulateServiceRestartV1` debe inspeccionar DB y rotar generación para invalidar pendientes. Un COMMIT que ocurrió nunca se declara deshecho.
- La prohibición de `journal_mode=WAL` se comprueba para una DB existente antes de restablecer parámetros. No se migra esquema ni se recrea automáticamente DB ausente.
- El contrato de esquema V1 compara los SQL `CREATE` de todas las tablas e índices esperados con `sqlite_schema`, y rechaza **triggers, vistas, columnas nuevas o restricciones modificadas**. Esta comprobación es lógica, no un mecanismo contra un administrador del host.
- `simulateServiceRestartV1` revalida **generación, health y reloj después de `BEGIN IMMEDIATE`**, dentro del bloqueo de escritura, para evitar la carrera entre inspección previa y actualización del reloj. La prueba L07 incluye una escritura concurrente simulada determinísticamente mediante un hook solo del harness.

## Plan de comprobación — solo ejecución local autorizada

Partir desde el worktree sin cambiar `main` ni otros worktrees. En Windows, utilizar la **ruta absoluta del `node.exe` 24.20.0 portátil** guardada por el operador en `$nodeExe` (no el Node global). Ejemplo de comandos **después de incorporar únicamente los cuatro archivos**:

```powershell
cd C:\dev\zaping-logic-268
$nodeExe = 'C:\dev\tools\node-24.20.0\node-v24.20.0-win-x64\node.exe'
& $nodeExe --version
& $nodeExe -p "process.versions.sqlite"
& $nodeExe --check scripts/agents/synthetic-authorization-ledger.mjs
& $nodeExe --check scripts/agents/synthetic-authorization-ledger-worker.mjs
& $nodeExe --check scripts/agents/synthetic-authorization-ledger.test.mjs
& $nodeExe --test scripts/agents/synthetic-authorization-ledger.test.mjs
$tests = @(Get-ChildItem scripts/agents -Filter '*.test.mjs' -File | ForEach-Object { $_.FullName })
& $nodeExe --test @tests
# git diff --check no ve archivos sin seguimiento; revisar estos cuatro manualmente.
git status --short
git diff --check
```

En Windows PowerShell, la lista `Get-ChildItem` expande los tests antes de enviarlos a Node para evitar depender del glob de la shell. No modificar CI. En Ubuntu Actions, el workflow ya usa el glob del shell. El job `Agents` ya contempla `node --test scripts/agents/*.test.mjs` en Ubuntu; **no ha sido ejecutado/validado por este paquete**.

### Matriz L01–L12 y F01–F08

| Caso | Expectativa | Estado de entrega |
|---|---|---|
| L01 | Esquema/PRAGMAs y Node/SQLite exactos | `NOT_RUN` en Node 24.20.0 del operador |
| L02 | Unicidad y tombstones | `NOT_RUN` |
| L03 | Dos PIDs reales compiten por consumir, un solo ganador | `NOT_RUN` |
| L04 | Carrera consume/revoke, un terminal | `NOT_RUN` |
| L05 | Binding íntegro rechaza mismatches | `NOT_RUN` |
| L06 | TTL exacto, clock rollback y safe integer | `NOT_RUN` |
| L07 | `attach != restart`, generación nueva invalida pendientes | `NOT_RUN` |
| L08 | Failpoints F01–F08, bloqueo/cuarentena/recovery | `NOT_RUN` |
| L09 | DB ausente/corrupta, esquema/PRAGMA incompatible | `NOT_RUN` |
| L10 | Replay/entrada malformada/no secretos en claro | `NOT_RUN` |
| L11 | Imports/side effects y ausencia de integración operacional | `NOT_RUN` |
| L12 | Respuestas no operativas, suite focal y Agents con SHA | `NOT_RUN` |

F01 antes de BEGIN; F02 después de BEGIN; F03 tras UPDATE; F04 tras evento y antes de COMMIT; F05 error inyectado de resultado incierto al intentar COMMIT; F06 respuesta perdida tras COMMIT; F07 proceso externo sostiene un writer real para `SQLITE_BUSY`; F08 DB corrupta/incompatible. **Son simulaciones: no prueban corte de energía, fsync real, autenticación, Linux UID/ACL/SSH/SO_PEERCRED ni control de cambios remotos.**

## Evidencia y salida esperada

La persona que ejecute debe copiar a #268 versión de Node/SQLite, SHA inicial, rama, lista de archivos nuevos, salida focal, PID de ambos workers (distintos), suite Agents, y checks/diff. Un resultado `NOT_RUN`, FAIL o BLOCKED **no se transforma** en PASS por la existencia de este documento. Si hay incompatibilidad de runtime, otra ruta, un quinto archivo, filtración, CAS inconsistente o fallo de atomicidad: **STOP**, reportar, no instalar drivers ni relajar el contrato.

**No hay autorización para commit/push/PR/merge/CI remota, staging, VM, clouds, credenciales, agentes ni código real en esta entrega.**
