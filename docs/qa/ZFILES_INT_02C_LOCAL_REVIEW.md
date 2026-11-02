# ZFILES-INT-02C — revisión local

Fecha: 02/nov/2026 (America/Hermosillo). Issue https://github.com/gclp96/zaping/issues/191.

**Implementación local completada; QA automatizada final PASS. Integración real 02C pendiente. NO MERGE-READY.**

## Identidad y preflight

- Rama codex/zfiles-int-02c-link-existing, worktree C:/dev/zaping/output/zfiles-int-02c.
- git fetch origin main ejecutado; origin/main verificado exactamente en 7de0aaf92bf6aa7d63e5f098f7219143cd703203 antes de crear el worktree. Rama y ruta propuestas no existían; no se sobrescribió nada.
- Commit funcional local: d5ed38fecb8f74b54ca66d8382a8342abec962a8. La documentación QA se guarda en un commit posterior sin cambios de aplicación. Sin push ni PR.
- Main local preservada en 3d022a6f386c73d0be1a6a2038ceb1fb00f63b62. Output, tmp y otros worktrees preservados.
- Instrucciones AGENTS raíz/Web y guía local Next.js de use client revisadas. Versiones: Node v24.21.0, npm 11.19.0, Next 16.4.3; npm ci desde lockfile, sin modificar dependencias.
- Gate baseline: GitHub Actions #1163 https://github.com/gclp96/zaping/actions/runs/41472571585 consultado directamente: API, Web, Historical upgrade pre-S1 completed/success. Esto sólo acredita el baseline; no hay CI remoto de la candidata sin publicación.

## Reconciliación mínima y contratos

PR142 fue leído como referencia (HEAD de0042a6969f3addd319a48a8049e84a09009a3c); no se aplicaron sus commits ni su patch, no merge/rebase/cherry-pick. Se partió del componente integrado por PR190, conservando navegación, CANCELLED, legado y descarte por identidad. Se añade supplierId a la identidad de render.

Contratos confirmados en código actual, sin necesidad de cambiar backend:
- GET /supplier-documents/receipts/:receiptId/links: vínculos vigentes con document poblado, Company/JWT/RBAC del backend.
- GET /supplier-documents con params {supplierId}: lista por Company y proveedor, orderBy createdAt desc / id desc, take:50, sin paginación.
- POST /supplier-documents/receipts/:receiptId/links con {documentId}: devuelve vínculo real; valida tenant, recepción, proveedor y ACTIVE, serializa por proveedor y hace replay de vínculo existente. No utiliza asignación monetaria ni requiere nuevas rutas.
- PR144/unlink no se incorporó. No hay DELETE ni creación de SupplierDocument en esta UI.

Diferencias respecto a la referencia histórica: validación estricta de UUID/tenant/proveedor/occurrence y duplicados; request cleanup al cerrar/reabrir; identidad completa incluye proveedor; guard síncrono contra doble POST; respuestas de POST coherentes antes de refrescar, sin mutación optimista; refresh de listado y vínculos tras errores concurrentes.

## Archivos funcionales modificados

| Archivo bajo web/app/(app)/purchase-receipts | Cambio |
|---|---|
| ExistingSupplierDocumentPicker.tsx | Selector accesible, GET bajo demanda, validación, selección por ID, POST y recuperación |
| ExistingSupplierDocumentPicker.test.tsx | 44 tests nuevos de selector, RBAC, tenant/proveedor, payloads, concurrencia y respuestas tardías |
| receipt-document-contract.ts | Extrae el validador de vínculos existente sin cambiar su comportamiento de navegación |
| ReceiptSupplierDocuments.tsx | Supplier en identidad, apertura sólo tras GET inicial resuelto, foco y refresh canónico |
| ReceiptSupplierDocuments.test.tsx | Actualiza el prop supplierId; conserva las 33 regresiones de navegación |
| [id]/page.tsx | Proveedor exclusivamente desde receipt.purchase.supplier.id |
| [id]/page.test.tsx | Regresión que verifica el proveedor y receiptId pasados desde la compra cargada |

Este informe es el octavo archivo del diff versionado. Los logs y el harness temporal permanecen como evidencia no versionada en output/qa.

## Comportamiento y seguridad

Sólo ADMIN/MANAGER ven el botón después de una consulta inicial válida. SALES/WAREHOUSE hacen cero GET de documentos y cero POST; no se cambió su acceso general a Recepciones.

Al abrir/reintentar se consultan la lista del proveedor y los vínculos frescos. Se rechaza íntegramente una respuesta malformada, con más de 50 entradas, UUID inválido/duplicado, companyId/supplierId ajenos, tipo/estado desconocido, número/serie inválidos u occurrence no entero positivo. Los vínculos refrescados deben pertenecer también a la empresa/proveedor esperados. Sólo ACTIVE no vinculados se ofrecen. Opciones distinguidas por tipo, serie/folio, occurrence e ID; no hay inferencia a partir de texto legado.

No se permite POST sin selección. Guard por ref impide doble envío en el mismo ciclo, además del estado disabled. Durante POST no se permite cancelar el compromiso ya enviado. Tras respuesta coherente, se relee GET de vínculos; no se inventa un vínculo visual con el payload de POST. Respuesta incoherente o error 403/404/409/otro limpia selección/opciones y pide refresco antes de reintentar. El backend sigue siendo autoridad para cambios concurrentes.

Cambiar recepción, proveedor, empresa, usuario o rol remonta el estado documental; cerrar selector lo desmonta. Resultados tardíos se descartan; no se reutiliza una selección invalidada. Un POST ya enviado puede completarse en backend aunque cambie la identidad: se descarta su respuesta en UI y no se promete rollback/cancelación de esa operación.

Aviso explícito: “Se muestran hasta 50 documentos recientes. Si no aparece, puede estar fuera de este listado”. El vacío sólo habla de elegibles en el listado reciente, nunca de inexistencia histórica.

## Pruebas y resultados

| Validación | Comando / resultado | Exit |
|---|---|---:|
| Focalizada inicial | npm test -- 'app/(app)/purchase-receipts' --pool=forks --maxWorkers=2 --testTimeout=10000; 6 archivos / 147 tests antes de las últimas ampliaciones | 0 |
| Web completa, primer intento | npm run test -- --pool=forks --maxWorkers=2 --testTimeout=10000 --reporter=default --reporter=json --outputFile=.../web-tests.json; 80/83 archivos y 1133/1148 tests PASS, 15 FAIL | 1 |
| Suites fallidas aisladas | npm test -- equipment/page.test.tsx products/page.test.tsx purchases/page.test.tsx (paths completos app/(app) en log) --pool=forks --maxWorkers=2 --testTimeout=10000; 3 archivos / 128 tests PASS | 0 |
| Web completa final | npm run test -- --pool=forks --maxWorkers=2 --testTimeout=10000 --reporter=default --reporter=json --outputFile=.../web-tests-final.json; 83 archivos / 1148 tests PASS | 0 |
| Typecheck | npm run typecheck; ver typecheck-final.log y static-exits.json | 0 |
| Lint final | npm run lint; sin warnings, lint-final.log y lint-exit.json | 0 |
| Build oficial | NEXT_PUBLIC_API_URL=https://api.example.test; npm run build, Next.js 16.4.3 Turbopack, compila/TypeScript/rutas terminados | 0 |
| Diff | git diff --check | 0 |

La ejecución final incluye 153 tests en los 6 archivos de Recepciones. test-matrix.json/CSV cotejan los 83 archivos con git ls-files: 0 omitidos y 0 duplicados. No se suman reintentos como tests únicos. Los únicos parámetros adicionales a CI son reportes; timeout 10000 y dos forks intactos. Se retiró un import sin uso de un test y un blanco EOF sin cambios de lógica durante la validación; el segundo run completo usa el estado final.

El primer FAIL se conserva completo. Afectó Equipment, Products y Purchases, archivos idénticos al baseline (unchanged-failing-files.json); principalmente timeouts y dos esperas/assertions de UI. Ocurrió mientras hubo validaciones/harness propios en paralelo. Las tres suites y la suite completa posterior pasaron sin cambiar su código ni timeout. No se establece causalidad por memoria/CPU ni se llama definitivamente “problema ambiental”: causa de la variación INCONCLUSIVE, con riesgo de intermitencia local. No se modificó inventario ni compras para forzar PASS.

El build estándar se ejecutó fuera del sandbox, con caché nueva del worktree, conforme al diagnóstico previo de Turbopack; no se usó --webpack ni se modificaron scripts/CI. Los primeros errores de tipado del desarrollo están en typecheck.log; quedan superados por typecheck-final.log y el build PASS.

## QA visual y límites

Harness temporal del componente real, con sesión/API simuladas, en loopback 3312. Claramente rotulado como datos simulados. Se verificó:
- 390/820/1440 px: scrollWidth igual a clientWidth (390/820/1440); capturas selector-390.png, selector-820.png, selector-1440.png.
- Select con label real, occurrence e ID en las dos opciones de folio igual; confirmación deshabilitada hasta selección.
- Cancelar devuelve foco al botón; Enter reabre; seleccionar occurrence #2 y confirmar muestra tras refresh el href /supplier-documents/40000000-0000-4000-8000-000000000002.
- Harness y pestaña cerrados, viewport restaurado, listener 3312 ausente.

Esto NO acredita integración 02C con NestJS/JWT/PG reales. No se reutiliza la QA integrada de 02B como prueba del nuevo selector. No se creó DB ni se ejecutaron migraciones: la instrucción actual las prohíbe. Company A/B, proveedor incorrecto y errores de backend se ensayaron con respuestas controladas en tests Web. Queda pendiente QA real con un entorno descartable preparado/autorizado y CI de candidata tras revisión/publicación autorizada. No se contactaron bases operativas ni servidores existentes.

## Estado y riesgos

Implementación y tests guardados en commit local funcional indicado; documentación en commit posterior. Artefactos completos en output/qa; patch acumulado ZFILES_INT_02C.patch contra el baseline incluye código, tests e informe. Main local, otros worktrees, output y tmp previos preservados. No backend, schema, migraciones, dependencias, CI, conciliación, importes, inventario, adjuntos o R2 modificados. Sin desvinculación.

Riesgos: límite de 50 sin búsqueda/paginación; revalidación concurrente depende del backend; POST incierto requiere refrescar antes de reintentar; QA integrada real y CI remota de candidata pendientes; primer FAIL amplio no reproducido, causa inconclusa. No merge-ready, sin push, PR, merge ni deploy.
