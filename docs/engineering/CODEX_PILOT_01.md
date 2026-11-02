# CODEX-PILOT-01 — Agente único de programación

**Estado:** preparado para ejecución; NO ejecutado ni validado todavía.
**Fecha de diseño:** 2026-11-02.
**Objetivo:** medir si Codex puede resolver una tarea focal de pruebas con mínima intervención y evidencia reproducible.

## Tarea para el agente
Trabaja con el repositorio `gclp96/zaping`, partiendo de una base actualizada y una rama de trabajo aislada. Lee primero `AGENTS.md` y las guías pertinentes.

**Implementación autorizada:** ampliar exclusivamente `app/api/src/purchases/purchases.controller.spec.ts` con dos pruebas unitarias:
1. Verificar que `PurchasesController.create` entrega al servicio `create` el `companyId` tomado de `req.user` y el DTO recibido, conservando el resultado devuelto.
2. Verificar que `PurchasesController.approve` entrega al servicio `approve` el `companyId` autenticado y el `id` recibido, conservando el resultado devuelto.

Estas pruebas comprueban el cableado de tenant en el controlador; **no** demuestran autorización JWT/RBAC, ni aislamiento efectivo en la base de datos. No presentarlas como pruebas E2E o de seguridad integrales.

## Restricciones
- Solo pruebas: no modificar código de producción, archivos de contratos, dependencias, configuración, Prisma, migraciones, CI ni documentación ajena al reporte.
- Mantener el patrón Jest y `TestingModule` existente. No duplicar pruebas equivalentes si el HEAD ya las incluye; explicar la situación.
- No borrar tests existentes ni aumentar timeouts para forzar PASS.
- No desplegar, no actualizar `main` local del usuario, no fusionar PR.
- Si hay conflictos, fallos previos o cambios concurrentes, reportarlos y mantener el alcance acotado.

## Validación y entrega
Desde `app/api`:
```sh
npm test -- --runInBand purchases.controller.spec.ts
npm run typecheck
npm run lint:check
```
Ejecutar `git diff --check` desde la raíz. Si corresponde abrir PR, que sea **draft** y sin merge. La CI remota solo puede declararse aprobada después de comprobar el run correspondiente.

La entrega debe incluir: SHA base, rama, archivos cambiados, número de pruebas nuevas, comandos y resultados, problemas pendientes, intentos de corrección y enlaces de PR/CI si existen.

## Medición del experimento
Registrar: tiempo activo humano aproximado, cantidad de intervenciones/correcciones, ejecuciones de pruebas, costo o créditos cuando la herramienta lo muestre, y retrabajo posterior. Comparar con otra tarea similar del flujo habitual; no inferir velocidad solo del número de líneas escritas.
