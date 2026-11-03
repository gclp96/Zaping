# AGENT-FLOW-01 — GitHub Issues → Codex

**Estado:** V1 y piloto #196 integrados; preparación/verificación local manual añadida por AGENT-03A (#208), pendiente de aceptación. Sin activación automática, sin uso con clientes. 2026-11-03.

## Diferencia respecto al flujo anterior
ChatGPT y el fundador siguen definiendo arquitectura y prioridades; Codex sigue programando. La V1 incorpora un **contrato de trabajo en GitHub** y un **despachador local ejecutable**, evitando copiar manualmente la especificación a Codex. No crea un segundo agente ni automatiza PR/CI.

## Circuito con aprobación humana
1. Crear un issue con la plantilla **Agente de programación — tarea autorizable**.
2. Completar objetivo, clasificación A/B, alcance, fuera de alcance, criterios de aceptación, validaciones, dependencias y riesgos.
3. Un mantenedor revisa el issue. Crear una sola vez la etiqueta de GitHub `agent:ready` si no existe y aplicarla **manualmente** solo a tickets aprobados.
4. Ejecutar el lanzador en modo vista previa. Debe rechazar issues cerrados, sin campos requeridos, sin etiqueta o de nivel C. La vista previa imprime la huella SHA-256 del número, título y contenido exactos del ticket; el responsable revisa también el contenido antes de aprobar.
5. Con `--execute --approval-sha <SHA256>`, el script vuelve a leer el issue y rechaza modificaciones posteriores del contenido revisado. Después verifica el `origin`, obtiene `origin/main` sin cambiar `main` local y crea una nueva rama/worktree separados en la carpeta temporal. Rechaza nombres preexistentes sin sobrescribirlos.
6. El script inicia **un Codex CLI** en sandbox `workspace-write` con la tarea aprobada y le prohíbe realizar commit, push, PR, merge o deploy. Captura eventos JSONL para distinguir `turn.completed`, `turn.failed` y `error`, comprueba que existan cambios locales y compara HEAD antes/después. Un resultado `LOCAL_REVIEW` indica *únicamente* que se completó el turno y existe un diff, no que la tarea ni sus tests estén aprobados.
7. El responsable revisa diff, pruebas y bloqueos. Cualquier commit, PR o despliegue es **otro paso bajo control humano**.

**Dependencia de seguridad:** el lanzador comprueba que las reglas ampliadas de `AGENTS.md` ya estén en `origin/main`. Tras el PR #193 esto se cumple; sigue siendo un bloqueo preventivo si la rama cambia.

## Requisitos
- Checkout de `gclp96/zaping` en Windows u otro sistema con Git, Node, GitHub CLI `gh` autenticada y Codex CLI con sesión iniciada.
- Crear/aplicar manualmente `agent:ready`. Nunca incluir secretos ni datos reales de clientes en un issue.
- Comprobar que la configuración de sandbox funciona realmente en el equipo; los aislamientos varían entre plataformas.
- Para validación de API, regenerar Prisma Client en un entorno de pruebas cuando corresponda: `cd app/api; npx prisma generate`. Eso **no** autoriza migraciones.

## Comandos (desde raíz del checkout)
```powershell
node --test scripts/agents/issue-contract.test.mjs scripts/agents/codex-command.test.mjs scripts/agents/codex-outcome.test.mjs
node --check scripts/agents/run-task.mjs
gh auth status
codex --version

# Vista previa solamente: no modifica Git ni ejecuta el agente
node scripts/agents/run-task.mjs --issue NUMERO

# Solo después de aprobar el issue con agent:ready y revisar el alcance
node scripts/agents/run-task.mjs --issue NUMERO --execute --approval-sha SHA256_DE_LA_VISTA_PREVIA
```

## Estados conceptuales
`BACKLOG` (sin etiqueta), `READY` (revisión y etiqueta manual), `RUNNING_LOCAL` (worktree aislado), `LOCAL_REVIEW` (turno terminado con diff; pruebas sin acreditar), `PR_DRAFT` (publicación aprobada), `ACCEPTED` (CI y revisión verificadas), `BLOCKED` (ambigüedad o error).

Estos estados **no** están sincronizados automáticamente por la V1.

## Seguridad y limitaciones
- Los campos del issue son entrada de **menor confianza** y no pueden anular las reglas de seguridad del repositorio.
- No hay ejecutor en GitHub Actions ni disparadores por issue. El script no recibe tokens de producción ni publica cambios.
- Antes de ejecutar, revisar la vista previa y proporcionar su SHA-256; cualquier cambio del título o contenido obliga a aprobarlo de nuevo. La etiqueta por sí sola no basta.
- El sandbox `workspace-write` no es una garantía de aislamiento fuerte de datos sensibles. Revisar permisos del entorno antes de permitir tareas con credenciales.
- Sin migraciones, sin escritura a DB productiva, sin acceso a R2 productivo, sin modificación automática de CI, sin merge/deploy automático.
- Un agente por tarea. Tareas críticas/arquitectónicas (nivel C) quedan fuera del lanzador V1.
- La guía exige revisión humana e informes PASS/FAIL reales. Los fallos preexistentes se reportan separadamente.

## Incidente PILOT-02A — sandbox Windows
- En el intento inicial del issue #196, el agente inició, pero su herramienta de ejecución fue rechazada por la implementación **Windows unelevated restricted-token**: `cannot enforce split writable root sets directly; refusing to run unsandboxed`.
- En ese intento no pudo leer el repositorio ni agregar el test; ninguna validación se ejecutó y el worktree quedó sin cambios. Este incidente histórico no describe el cierre posterior del piloto.
- El lanzador anterior imprimió por error `Ejecución local terminada` pese al bloqueo. La corrección integrada clasifica `BLOCKED_OR_INCOMPLETE` si faltan cambios, hay eventos de error, termina con código no cero o no existe evento `turn.completed`. Conserva el worktree y devuelve exit code distinto de cero.
- La corrección distingue fallos reales y configura **MXC** para ejecuciones de Codex en Windows, conservando el sandbox `workspace-write`. MXC debe funcionar en el equipo antes de reintentar; no desactivar restricciones para hacer pasar la tarea.
- Diagnóstico seguro recomendado: comprobar si el equipo soporta MXC, sin cambiar configuración permanente:
  ```powershell
  codex -c windows.sandbox=mxc sandbox --include-managed-config --permission-profile :workspace -- cmd.exe /d /c echo MXC_OK
  $LASTEXITCODE
  ```
  En el equipo del piloto #196, la comprobación devolvió **MXC_OK y código 0**. El lanzador actualizado selecciona `-c windows.sandbox=mxc` en Windows. La prueba de sandbox puntual **no equivale** a una ejecución `codex exec` de principio a fin. En otros equipos, comprobar compatibilidad; si MXC falla, considerar `elevated` con configuración administrada o WSL2, nunca `danger-full-access`.
- Cada intento genera un archivo de instrucciones con nombre único, sin sobrescribir prompts previos. Un reintento del mismo issue no debe sobrescribir el worktree anterior. Antes de liberar una rama, confirmar ausencia de cambios con `git -C <ruta-worktree> status --short` y revisar `git worktree list`. No eliminar resultados ni cambios de otros pilotos.

## Cierre verificado del piloto #196 / PR #207
- [Issue #196](https://github.com/gclp96/zaping/issues/196) cerrado como completed el 2026-11-03 a las 08:28:47 UTC. [PR #207](https://github.com/gclp96/zaping/pull/207) fusionado el mismo día a las 08:28:46 UTC, merge `45333eb379eba3f96384daa15a971f20041c5f50`, HEAD del PR `3596b0593896dfba960d95cdad89cfc6af8ca4d1`.
- Único archivo del piloto: `app/api/src/purchases/purchases.controller.spec.ts`, una prueba nueva (22 líneas) que verifica llamada única a `cancel('company-1', 'purchase-1')` y propagación del resultado. La descripción del PR registra Jest focal **5/5 PASS**, typecheck, lint y diff check PASS; son evidencia histórica del PR, no comandos reejecutados por #208.
- CI **post-merge comprobada en GitHub**: [run 41603577138](https://github.com/gclp96/zaping/actions/runs/41603577138), evento push en main para el SHA de merge, completed/success; inicio 08:28:48 UTC y actualización final 08:32:25 UTC. Jobs **API, Web e Historical upgrade pre-S1: success**. No confundir esta CI con una CI de #208.
- La prueba focal usa mocks: acredita los argumentos del controlador, no autorización RBAC ni aislamiento/transacciones PostgreSQL. La CI sí registra gates PostgreSQL efímeros independientes; esa evidencia pertenece a esos jobs, no al nuevo caso Jest.
- No constan minutos activos humanos, costo ni retrabajo medidos. No reconstruirlos a partir de timestamps. La preparación repetitiva se aborda con el procedimiento siguiente.

## Preparación y verificación reproducibles — AGENT-03A

Herramienta local invocada por una persona desde un checkout de confianza. Revisar también el código de la herramienta si procede de un diff de agente. No se conecta al lanzador ni a eventos de GitHub; no inicia Codex, no modifica aprobaciones, no publica y no elimina worktrees.

```powershell
# Sin instalaciones ni pruebas; gates NOT_RUN
node scripts/agents/verify-local.mjs --issue 208

# El operador revisa antes TODO el diff, archivos no versionados/ignorados,
# manifests, lockfiles, configuración npm y scripts/dependencias de instalación.
# Solo después de esa revisión y en un entorno sin secretos:
node scripts/agents/verify-local.mjs --issue 208 --prepare

# Invocación separada; elegir y revisar el spec focal apropiado para la tarea
node scripts/agents/verify-local.mjs --issue 208 --verify --spec app/api/src/purchases/purchases.controller.spec.ts

# Pruebas de la herramienta: procesos simulados, sin red ni Codex
node --test scripts/agents/*.test.mjs
node --check scripts/agents/verify-local.mjs
```

- Solo resuelve `<os.tmpdir()>/zaping-agent-runs/issue-N` con N positivo canónico; no acepta rutas alternativas. Comprueba componentes sin symlinks/junctions, ruta real, origin Zaping, directorio Git común, registro del worktree, raíz y rama `codex/agent-issue-N`. No obtiene refs por red. La base es merge-base con el `origin/main` local: HEAD debe coincidir con ella (el agente no tiene autorización para crear commits). Si las refs o identidad no son fiables, detenerse y revisar manualmente.
- `--prepare` falla cerrado ante cambios versionados/no versionados/ignorados fuera de una lista conservadora: TypeScript bajo `app/api/src`, Markdown bajo `docs` y `scripts/agents/verify-local*.mjs`. Excluye contenido de node_modules de ese inventario. Así bloquea manifests, lockfiles, `.npmrc`, configuraciones y scripts externos antes de instalar. Rechaza además hooks de instalación propios y dependencias locales en manifests raíz/API. Otros alcances requieren revisión separada, sin ampliar permisos automáticamente.
- La preparación ejecuta npm ci con --ignore-scripts, --no-audit y --no-fund, seguido de Prisma Client generate mediante Node y el CLI local de Prisma, sin npx ni shell. Utiliza configuración npm temporal aislada. No ejecuta migraciones. Los ejecutables de dependencias siguen requiriendo un entorno de confianza, sin secretos productivos.
- `--verify` requiere archivo regular `.spec.ts` bajo `app/api/src` con ruta relativa validada, dependencias locales Jest/TypeScript/ESLint y cliente Prisma generado. Ejecuta en orden `git diff --check <base> --`, `npm test -- --runInBand --runTestsByPath <spec>`, `npm run typecheck`, `npm run lint:check`. Se detiene al primer fallo; los siguientes quedan NOT_RUN. No instala ni migra. Revisar el spec y el entorno: código de pruebas puede tener efectos propios.
- En ambas operaciones se compara HEAD y diff versionado antes/después; una diferencia bloquea el resultado y se conserva para revisión, sin revertirla. No ejecutar otros escritores concurrentes. La herramienta no es una frontera de aislamiento frente a procesos hostiles o modificaciones concurrentes.
- Reporte por invocación: `<os.tmpdir()>/zaping-local-review-<único>/report.json`, fuera del worktree, con base/HEAD, rama, archivos, presencia de dependencias, comandos/argv/cwd, códigos, señal/error y duración. Para cada salida guarda bytes y SHA-256, sin texto crudo, prompts, variables de entorno ni datos de pruebas. Cada checkpoint se escribe a temporal y se publica con rename; si no puede guardar el reporte, devuelve BLOCKED/no cero. Un `.tmp` o JSON incompleto no acredita ningún gate.
- `PASS` solo significa que terminaron con código 0 los procesos requeridos **para ese modo**, junto con comprobaciones de identidad e integridad. PASS de preparación no acredita verificación. `FAIL` registra un proceso con salida no cero; `BLOCKED` indica precondición incierta, interrupción, timeout, fallo de arranque o reporte; `NOT_RUN` identifica gates no ejecutados. Inspección devuelve 0 con NOT_RUN; preparación/verificación fallida o bloqueada devuelve no cero. No transformar estos resultados ni LOCAL_REVIEW en QA_PASS/ACCEPTED; aún se requieren revisión humana y CI del PR.

### Estado del ensayo de #208

Ensayo Windows del issue #208 completado: 46/46 pruebas del sistema de agentes PASS, sintaxis PASS, inspección NOT_RUN correcta, --prepare PASS (npm ci y Prisma Client), y --verify PASS (diff, Jest focal, typecheck y ESLint). Evidencia local del operador; todavía no constituye CI remota del PR #208.

Siguiente incremento, por separado: diseño de QA independiente inicialmente de solo lectura. No se añade un segundo agente ni orquestación automática en #208.
