<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


# Zaping — instrucciones para agentes de programación

## Vigencia especial: congelamiento de estabilización (desde 2026-11-06)

**Prioridad sobre el flujo legado indicado más abajo.** Consultar `docs/engineering/BRANCH_AND_STABILIZATION_POLICY.md` antes de cualquier cambio.

- Solo se autorizan las ramas remotas `main` y `qa/integration` al terminar la depuración histórica. Las ramas antiguas son legado de solo lectura.
- **Prohibido crear nuevas ramas/PR por issue o agente.** La instrucción antigua de “trabajar en rama aislada y preparar un PR” queda suspendida. Para aislamiento, usar parches y worktrees locales detached HEAD sin publicar ramas.
- No desarrollar ni integrar funcionalidades nuevas hasta completar el cierre de estabilización. Solo correcciones autorizadas, auditoría, QA, pruebas y gobernanza.
- El dispatcher `scripts/agents/run-task.mjs --execute` y su verificador usan la convención `codex/agent-issue-N`: **no utilizarlos** hasta refactorización, pruebas y aprobación. Los prompts no sustituyen esta restricción del código.
- Nunca hacer merges o escrituras directas a `main`, eliminar PR/ramas, alterar bases/volúmenes, crear migraciones ni activar flags sin autorización explícita para la operación concreta.
- Cada PR heredado requiere clasificación y evidencia antes del cierre; no confundir “mergeable” o CI verde con aceptación de seguridad.



## Objetivo y fuentes de verdad
- Zaping es un SaaS ERP multiempresa con vertical Healthcare. Backend: `app/api` (NestJS, Prisma, PostgreSQL); frontend: `web` (Next.js, React).
- Antes de modificar, revisar el código afectado y las fuentes pertinentes: `docs/engineering/DEVELOPMENT_WORKFLOW.md`, `QUALITY_STANDARDS.md`, `SECURITY_PRINCIPLES.md`, `docs/project/PROJECT_BOARD.md` y la especificación del módulo.
- El código y las pruebas de la rama base determinan el comportamiento implementado. No asumir que un resumen o documento antiguo describe el HEAD.
- Mantener una sola fuente responsable de cada regla: no duplicar contratos de dominio en este archivo.

## Método de trabajo
1. Verificar rama, `git status`, alcance y restricciones de la tarea. No sobrescribir trabajo local o worktrees ajenos.
2. Identificar criterios de aceptación y archivos afectados antes de editar. Si hay una ambigüedad de negocio o riesgo fuera de alcance, detener esa parte y explicarlo.
3. Hacer el cambio mínimo coherente con la arquitectura existente. No refactorizar módulos no relacionados.
4. Añadir/ajustar pruebas para el comportamiento afectado; ejecutar pruebas focales antes de validaciones más amplias, según el riesgo y la CI.
5. Entregar resumen del diff, comandos ejecutados y resultados reales, limitaciones, riesgos y estado de CI. Nunca reportar PASS sin haberlo ejecutado.

## Invariantes y límites
- Preservar aislamiento multiempresa mediante `companyId` derivado de la identidad autenticada; nunca confiar en un `companyId` suministrado por el cliente.
- Respetar JWT, RBAC y denegación ante autorización incierta. No filtrar datos entre empresas.
- No alterar movimientos de inventario, idempotencia, transacciones, custodia de equipos, reglas Healthcare ni contratos fiscales sin especificación y aprobación explícita.
- No crear ni ejecutar migraciones, tocar bases de datos reales, cambiar secretos, habilitar feature flags, modificar CI, desplegar o fusionar en `main` sin autorización explícita.
- No mostrar ni versionar secretos, `.env`, tokens, datos reales o evidencia privada.
- Trabajar en rama aislada y preparar un PR revisable; el merge y el despliegue quedan bajo control humano.

## Comandos de validación existentes (desde la carpeta indicada)
- `app/api`: `npm test -- --runInBand <nombre-del-spec>`, `npm run typecheck`, `npm run lint:check`, `npm run build`.
- `web`: `npm test -- <ruta-del-test>`, `npm run typecheck`, `npm run lint`, `npm run build`.
- La CI de `.github/workflows/ci.yml` incluye API, Web y Historical upgrade pre-S1; para validaciones con PostgreSQL usar únicamente entornos de prueba aislados.
- Ajustar la selección de pruebas al cambio, sin omitir gates exigidos por el contrato técnico de la tarea.
