# AGENT-FLOW-01 — GitHub Issues → Codex

**Estado:** V1 integrada en main; corrección de clasificación de resultados en revisión. Sin activación automática, sin uso con clientes. 2026-11-02.

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
`BACKLOG` (sin etiqueta), `READY` (revisión y etiqueta manual), `RUNNING_LOCAL` (worktree aislado), `LOCAL_REVIEW` (diff y tests), `PR_DRAFT` (publicación aprobada), `ACCEPTED` (CI y revisión verificadas), `BLOCKED` (ambigüedad o error).

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
- Issue #196: el agente inició, pero su herramienta de ejecución fue rechazada por la implementación **Windows unelevated restricted-token**: `cannot enforce split writable root sets directly; refusing to run unsandboxed`.
- El agente no pudo leer el repositorio ni agregar el test; ninguna validación se ejecutó y el worktree quedó sin cambios.
- El lanzador anterior imprimió por error `Ejecución local terminada` pese al bloqueo. Esta revisión cambia la clasificación a `BLOCKED_OR_INCOMPLETE` si faltan cambios, hay eventos de error, termina con código no cero o no existe evento `turn.completed`. Conserva el worktree y devuelve exit code distinto de cero.
- **La corrección del reporte no arregla el sandbox de Windows.** No desactivar las restricciones para hacer pasar la tarea.
- Diagnóstico seguro recomendado: comprobar si el equipo soporta MXC, sin cambiar configuración permanente:
  ```powershell
  codex -c windows.sandbox=mxc sandbox --include-managed-config --permission-profile :workspace -- cmd.exe /d /c echo MXC_OK
  $LASTEXITCODE
  ```
  Si imprime `MXC_OK` y código 0, revisar la posibilidad de usar MXC desde Codex CLI. Si no es compatible, considerar el sandbox `elevated` con configuración administrada o WSL2; nunca `danger-full-access` como solución.
- Un reintento del mismo issue no debe sobrescribir el worktree anterior. Antes de liberar una rama, confirmar ausencia de cambios con `git -C <ruta-worktree> status --short` y revisar `git worktree list`. No eliminar resultados ni cambios de otros pilotos.

## Evidencia y siguiente corte
- Prueba de contrato: `node --test scripts/agents/issue-contract.test.mjs` (contrato, argumentos y resultados; comprobar en el equipo/CI antes de aceptar).
- Sintaxis del lanzador: `node --check scripts/agents/run-task.mjs`.
- **Verificado:** autenticación `gh`, contrato y argv Codex en Windows. **Bloqueado:** ejecución de herramientas por sandbox unelevated. Aún no hay implementación del issue #196, PR producido por el agente ni CI remota atribuible a una entrega suya.
- Medir por issue: minutos activos humanos, tiempo total, ejecuciones de pruebas, errores, intervenciones, costo y retrabajo.
- Incremento posterior: revisión independiente de QA, creación autorizada de PR draft y eventualmente orquestación programática. No introducir esto antes de probar la V1.
