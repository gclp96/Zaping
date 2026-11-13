# QA-REVIEW-01C1-B-LOGIC — ledger SQLite sintético V1

> **No operativo.** Esta implementación es un simulador didáctico, no un servicio de autorización. El ticket #268 permite únicamente LOGIC con datos sintéticos. No prueba identidad del proceso, procedencia de paquetes, control de acceso del host ni staging. No usar con código, documentos, secretos ni usuarios reales. Los tickets #266 y #263, HOST y Gate C permanecen pendientes.

## Alcance, runtime y archivos

- GitHub: [#268](https://github.com/gclp96/Zaping/issues/268) → [#266](https://github.com/gclp96/Zaping/issues/266) → [#263](https://github.com/gclp96/Zaping/issues/263).
- Rama de implementación original: `feature/qa-review-01c1-b-logic-268`, basada en `c6ffc331c5e776e04f78e68aa2025aa362a8fa92`; integrada mediante [PR #269](https://github.com/gclp96/Zaping/pull/269) en `main@d52fc5832ad3fd055b18c1f58cbc3b67465424ca`.
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

## Comprobaciones reproducibles — ejecutadas con autorización de LOGIC

El siguiente bloque conserva los comandos usados durante la validación local original. Para repetirla se debe utilizar un entorno de pruebas autorizado, sin alterar `main` ni otros worktrees, y la **ruta absoluta del `node.exe` 24.20.0 portátil** (no el Node global). Ejemplo histórico de ejecución con los cuatro archivos ya incorporados:

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

En Windows PowerShell, `Get-ChildItem` expande los tests antes de enviarlos a Node para evitar depender del glob de la shell. No se modificó CI. En Ubuntu Actions, el workflow ejecuta `node --test scripts/agents/*.test.mjs`; **Agents pasó en Linux** tanto en el [PR #269](https://github.com/gclp96/Zaping/actions/runs/43336973195) como [después del merge en `main`](https://github.com/gclp96/Zaping/actions/runs/43339475477). No se dispone aquí del conteo individual de casos Linux extraído de los logs.

### Matriz L01–L12 y F01–F08

**Corte de resultados (12 de noviembre de 2026):** los 12 criterios L01–L12 están cubiertos por **16 pruebas focales PASS**, incluidas dos pruebas adicionales de L07 (revalidación del reloj bajo lock) y L09 (SQL drift y triggers). La evidencia focal corresponde al Windows del mantenedor con Node.js **24.20.0** y SQLite **3.53.4**, sin fallos ni omisiones. La suite Agents Windows reportó **386 total = 290 PASS + 96 SKIP + 0 FAIL**; los SKIP son `linuxTest` del módulo `qa-bundle.test.mjs` que se omiten deliberadamente en Windows. El job **Agents Linux de GitHub Actions terminó en SUCCESS**; esto no significa que se haya extraído un conteo específico de cada caso de sus logs.

| Caso | Expectativa | Resultado lógico y evidencia |
|---|---|---|
| L01 | Esquema/PRAGMAs y Node/SQLite exactos | **PASS** — suite focal Windows 16/16; Node 24.20.0 / SQLite 3.53.4 |
| L02 | Unicidad y tombstones | **PASS** — prueba focal L02 |
| L03 | Dos PIDs reales compiten por consumir, un solo ganador | **PASS** — prueba focal L03, multiproceso |
| L04 | Carrera consume/revoke, un terminal | **PASS** — prueba focal L04, multiproceso |
| L05 | Binding íntegro rechaza mismatches | **PASS** — prueba focal L05 |
| L06 | TTL exacto, clock rollback y safe integer | **PASS** — prueba focal L06 |
| L07 | `attach != restart`, generación nueva invalida pendientes | **PASS** — 2 pruebas L07, incluida verificación del reloj bajo bloqueo |
| L08 | Failpoints F01–F08, bloqueo/cuarentena/recovery | **PASS lógico** — casos L08/F01–F07 y L09/F08; fallos **simulados**, no cortes físicos |
| L09 | DB ausente/corrupta, esquema/PRAGMA incompatible | **PASS** — 2 pruebas L09, incluyendo CREATE SQL modificado y triggers |
| L10 | Replay/entrada malformada/no secretos en claro | **PASS** — prueba focal L10 |
| L11 | Imports/side effects y ausencia de integración operacional | **PASS** — prueba focal L11 y revisión de imports |
| L12 | Respuestas no operativas, suite focal y Agents con SHA | **PASS LOGIC** — focal 16/16; Agents en PR y `main` SUCCESS; HOST/Gate C siguen `NOT_RUN` |

**Evidencia de integración:** [PR #269 integrado](https://github.com/gclp96/Zaping/pull/269), head `af20ee848c3e281d9e377ac39674b8b1bf7cc31d`, merge `d52fc5832ad3fd055b18c1f58cbc3b67465424ca`; cuatro archivos nuevos, 923 líneas, sin alterar código existente. GitHub Actions terminó en `success` para los cuatro jobs de [push previo](https://github.com/gclp96/Zaping/actions/runs/43336811705), [pull request](https://github.com/gclp96/Zaping/actions/runs/43336973195) y [push post-merge a main](https://github.com/gclp96/Zaping/actions/runs/43339475477): **Agents, API, Web y Historical upgrade pre-S1**. Esta evidencia **no equivale a revisión independiente de seguridad** ni a permisos operativos. La excepción de autorrevisión de mantenedor único aplica solo a LOGIC.

F01 antes de BEGIN; F02 después de BEGIN; F03 tras UPDATE; F04 tras evento y antes de COMMIT; F05 error inyectado de resultado incierto al intentar COMMIT; F06 respuesta perdida tras COMMIT; F07 proceso externo sostiene un writer real para `SQLITE_BUSY`; F08 DB corrupta/incompatible. **Son simulaciones: no prueban corte de energía, fsync real, autenticación, Linux UID/ACL/SSH/SO_PEERCRED ni control de cambios remotos.**

## Evidencia y límites posteriores a la integración

Las ejecuciones y los SHA de referencia quedaron registrados en [#268](https://github.com/gclp96/Zaping/issues/268) y en el [PR #269](https://github.com/gclp96/Zaping/pull/269). En una revalidación futura deberán cotejarse entorno, commit, alcance y salidas; un resultado `NOT_RUN`, FAIL o BLOCKED **no se transforma** en PASS por existir este documento. Ante incompatibilidad, archivo extra, filtración, CAS inconsistente o fallo de atomicidad: **STOP**, reportar; no instalar drivers ni relajar el contrato.

**Nota histórica (entrega inicial de 2026-11-12):** el paquete original no autorizaba commit, push, PR, merge ni CI remota. Esos pasos fueron **autorizados posteriormente, por separado, y completados para el PR #269**. Esta actualización documental no concede permisos nuevos.

**Restricciones que siguen vigentes:** el ledger es un simulador; no habilita `agent:ready`, agentes, LLM, código o datos reales, staging, credenciales ni infraestructura VM/cloud. La identidad/aislamiento HOST del [#266](https://github.com/gclp96/Zaping/issues/266) y Gate C del [#263](https://github.com/gclp96/Zaping/issues/263) continúan **`NOT_RUN` / `OPEN`**. #268 permanece abierto hasta decisión humana expresa de cierre; este documento no lo cierra.
