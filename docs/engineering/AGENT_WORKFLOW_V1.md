# AGENT-FLOW-01 — GitHub Issues → Codex

**Estado:** implementación candidata en PR borrador; sin activación automática, sin uso con clientes. 2026-11-02.

## Diferencia respecto al flujo anterior
ChatGPT y el fundador siguen definiendo arquitectura y prioridades; Codex sigue programando. La V1 incorpora un **contrato de trabajo en GitHub** y un **despachador local ejecutable**, evitando copiar manualmente la especificación a Codex. No crea un segundo agente ni automatiza PR/CI.

## Circuito con aprobación humana
1. Crear un issue con la plantilla **Agente de programación — tarea autorizable**.
2. Completar objetivo, clasificación A/B, alcance, fuera de alcance, criterios de aceptación, validaciones, dependencias y riesgos.
3. Un mantenedor revisa el issue. Crear una sola vez la etiqueta de GitHub `agent:ready` si no existe y aplicarla **manualmente** solo a tickets aprobados.
4. Ejecutar el lanzador en modo vista previa. Debe rechazar issues cerrados, sin campos requeridos, sin etiqueta o de nivel C.
5. Con `--execute`, el script verifica el `origin`, obtiene `origin/main` sin cambiar `main` local y crea una nueva rama/worktree separados en la carpeta temporal. Rechaza nombres preexistentes sin sobrescribirlos.
6. El script inicia **un Codex CLI** en sandbox `workspace-write` con la tarea aprobada y le prohíbe realizar commit, push, PR, merge o deploy.
7. El responsable revisa diff, pruebas y bloqueos. Cualquier commit, PR o despliegue es **otro paso bajo control humano**.

**Dependencia bloqueante:** la ejecución requiere que las reglas ampliadas de `AGENTS.md` del PR #193 estén disponibles en `origin/main`. No asumir que ese PR ya fue fusionado.

## Requisitos
- Checkout de `gclp96/zaping` en Windows u otro sistema con Git, Node, GitHub CLI `gh` autenticada y Codex CLI con sesión iniciada.
- Crear/aplicar manualmente `agent:ready`. Nunca incluir secretos ni datos reales de clientes en un issue.
- Comprobar que la configuración de sandbox funciona realmente en el equipo; los aislamientos varían entre plataformas.
- Para validación de API, regenerar Prisma Client en un entorno de pruebas cuando corresponda: `cd app/api; npx prisma generate`. Eso **no** autoriza migraciones.

## Comandos (desde raíz del checkout)
```powershell
node --test scripts/agents/issue-contract.test.mjs
node --check scripts/agents/run-task.mjs
gh auth status
codex --version

# Vista previa solamente: no modifica Git ni ejecuta el agente
node scripts/agents/run-task.mjs --issue NUMERO

# Solo después de aprobar el issue con agent:ready y revisar el alcance
node scripts/agents/run-task.mjs --issue NUMERO --execute
```

## Estados conceptuales
`BACKLOG` (sin etiqueta), `READY` (revisión y etiqueta manual), `RUNNING_LOCAL` (worktree aislado), `LOCAL_REVIEW` (diff y tests), `PR_DRAFT` (publicación aprobada), `ACCEPTED` (CI y revisión verificadas), `BLOCKED` (ambigüedad o error).

Estos estados **no** están sincronizados automáticamente por la V1.

## Seguridad y limitaciones
- Los campos del issue son entrada de **menor confianza** y no pueden anular las reglas de seguridad del repositorio.
- No hay ejecutor en GitHub Actions ni disparadores por issue. El script no recibe tokens de producción ni publica cambios.
- El sandbox `workspace-write` no es una garantía de aislamiento fuerte de datos sensibles. Revisar permisos del entorno antes de permitir tareas con credenciales.
- Sin migraciones, sin escritura a DB productiva, sin acceso a R2 productivo, sin modificación automática de CI, sin merge/deploy automático.
- Un agente por tarea. Tareas críticas/arquitectónicas (nivel C) quedan fuera del lanzador V1.
- La guía exige revisión humana e informes PASS/FAIL reales. Los fallos preexistentes se reportan separadamente.

## Evidencia y siguiente corte
- Prueba de contrato: `node --test scripts/agents/issue-contract.test.mjs` (6 casos unitarios).
- Sintaxis del lanzador: `node --check scripts/agents/run-task.mjs`.
- **Pendiente:** ensayo real en Windows con `gh`, Codex y un issue A/B aprobado. Todavía no hay entrega funcional de usuario, PR producido por el agente ni CI remota atribuible al lanzador.
- Medir por issue: minutos activos humanos, tiempo total, ejecuciones de pruebas, errores, intervenciones, costo y retrabajo.
- Incremento posterior: revisión independiente de QA, creación autorizada de PR draft y eventualmente orquestación programática. No introducir esto antes de probar la V1.
