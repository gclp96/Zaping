# Política de ramas, agentes y estabilización — Zaping

**Estado:** propuesta operativa para revisión en `qa/integration`, no aplicada a `main` todavía.
**Inicio de congelamiento:** 2026-11-06.
**Alcance:** repositorio `gclp96/zaping`.

## 1. Objetivo

Reducir el trabajo pendiente de integración y asegurar un ERP estable antes de retomar nuevas funcionalidades o activar módulos en el piloto comercial. Durante el congelamiento, **no se integran funcionalidades nuevas**.

## 2. Únicas ramas remotas autorizadas al finalizar la transición

- `main`: fuente de verdad, estable. No commits directos, no force-push, no eliminación. Los cambios llegan solo después de CI, QA y aprobación.
- `qa/integration`: rama compartida de implementación de correcciones, consolidación y QA. El operador aplica cambios revisados **secuencialmente**. No es producción.

**Prohibido:** crear o publicar ramas remotas `feat/*`, `fix/*`, `codex/*`, `test/*`, `docs/*` o PR apilados durante la política. Mientras se auditan los PR heredados, sus ramas son exclusivamente **legado de solo lectura**, no autorización para nuevos trabajos.

No deben existir varias personas o agentes modificando simultáneamente `qa/integration`. Si se necesitan trabajos aislados, usar carpetas temporales con **worktrees detached HEAD** y parches locales revisados; no crear ramas remotas ni PR. No aplicar parches a la rama compartida sin verificar estado limpio, base actual y pruebas apropiadas.

## 3. Congelamiento funcional temporal

Se permiten solamente:

1. Auditoría y trazabilidad de PR históricos.
2. Recuperación selectiva de correcciones necesarias y ya validadas.
3. Corrección de bugs actuales, regresiones, seguridad y fallos de CI.
4. Limpieza de ramas/PR con evidencia de preservación o sustitución.
5. QA, documentación de estabilidad y cambio de reglas de gobernanza.

No se permiten nuevos endpoints/features, integraciones fiscales, cambios de alcance del producto, activación de flags, despliegues ni migraciones productivas por iniciativa de agentes. Excepciones de seguridad críticas exigen aprobación humana explícita y conservar el mismo flujo de dos ramas.

Las funciones inactivas o experimentales de R2, antivirus, firma, promoción y Healthcare mantienen su estado **OFF / no liberado**; una CI verde o PR `mergeable` no significa seguridad ni aceptación funcional.

## 4. Reglas obligatorias para agentes

- Modo predeterminado: **solo lectura** para clasificación, evaluación y propuestas.
- No ejecutar el dispatcher heredado `scripts/agents/run-task.mjs --execute` durante el congelamiento; crea `codex/agent-issue-N` y contradice esta política. El verificador heredado también está acoplado a esas ramas; reemplazar ambos con pruebas antes de reactivar agentes.
- No crear ramas, PR, commits, push, merges, rebases, tags, migraciones, cambios de CI ni cierres/borrados sin tarea y autorización explícitas.
- Para cualquier corrección autorizada: alcance mínimo, diff, evidencia QA en SHA exacto, revisión de impacto multiempresa/JWT/RBAC/transacciones y estado final. Los resultados no ejecutados se etiquetan `NOT_RUN`, nunca `PASS`.
- Un agente puede proponer un parche local. Un **único integrador humano/controlado** lo incorpora a `qa/integration` tras revisar colisiones y validar.
- Si hay incertidumbre relevante sobre integridad, seguridad, procedencia o regresiones, detener integración y registrar bloqueo.

## 5. Política de PR

- Durante limpieza: **ningún PR nuevo de funcionalidad**.
- Después de la limpieza: como máximo **un PR de promoción** `qa/integration → main`, solo cuando el lote de estabilización esté listo. No se abren PR por agente ni por subtarea.
- Todo PR heredado debe clasificarse: `MERGE_REWORK`, `SUPERSEDED`, `DEFERRED`, `NEEDS_REVIEW` o `BLOCKED`.
- Antes de cerrar un PR heredado: verificar si su contenido está incorporado, es redundante, se preservó en otra línea o debe convertirse en issue. Escribir justificación, fuente reemplazante y riesgos. **Cerrar no implica fusionar.**
- No borrar la rama asociada hasta verificar que no contiene trabajo único necesario y que no bloquea PRs dependientes. Dejar evidencia de SHA y vinculación histórica.
- Nunca ejecutar `git reset --hard`, `push --force`, `docker volume rm`, `docker system prune --volumes`, ni migraciones/destrucción de DB como parte de esta limpieza.

## 6. Gates para promover a main

1. Diff y dependencias del lote revisadas, sin nuevas funcionalidades.
2. `qa/integration` sincronizada y sin conflictos con `main`.
3. CI del HEAD candidato: API, Web, Agents y Historical upgrade, incluyendo pruebas PostgreSQL aisladas exigidas por el alcance.
4. Regresión manual de flujos centrales: Auth/RBAC/tenant, Compras, Recepciones, Inventario, Cotizaciones, Ventas y roles. Los módulos/flags fuera del piloto se verifican **apagados**.
5. Revisión de migraciones, seguridad, datos sensibles, R2, archivos y auditoría según riesgo.
6. Actualización documental y registro de qué está realmente habilitado; sin afirmaciones no verificadas.
7. Aprobación humana explícita de promoción. No auto-merge.

## 7. Finalización de la estabilización

Se declara concluida únicamente con evidencia:
- 47 PR heredados resueltos individualmente (fusionado si aprobado, cerrado como sustituido, o trabajo registrado fuera de PR abierto); cero PR de funcionalidad pendientes en cola.
- Solo `main` y `qa/integration` como ramas remotas activas, tras proteger trabajo valioso y eliminar ramas legadas de manera controlada.
- `main` y `qa/integration` con CI aprobada en SHAs identificados y regresión funcional mínima registrada.
- Dispatcher y verificador de agentes compatibles con política de dos ramas, con pruebas que impidan recrear ramas/PR por issue.
- Protecciones de GitHub verificadas (rulesets, checks requeridos, revisión para `main`, evitar force-push y borrado) o limitación documentada si plan/permisos no lo permiten.

Esta política se prepara en QA; **no es un mecanismo de bloqueo efectivo sobre `main` hasta aplicar controles y actualizaciones allí**.
