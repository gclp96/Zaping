# ZFILES-INT-02A — vínculos documentales por ID

Ticket: #187. Baseline: 3d022a6f386c73d0be1a6a2038ceb1fb00f63b62.
Referencia seleccionada: PR140, 68673877a3ba9ad0a2226aece2d579d6b031501a.

## Contrato

PurchaseReceiptSupplierDocumentLink representa una asociación N:M sin importes.
PurchaseReceiptDocument conserva la conciliación monetaria de facturas.
Las rutas GET/POST/DELETE supplier-documents/receipts/:receiptId/links heredan
JWT y ADMIN/MANAGER del controller. El tenant y actor proceden de req.user.
No se infieren vínculos por folio. Se comprueban recepción, documento,
Company, proveedor y documento ACTIVE. Una segunda vinculación activa devuelve
el mismo registro. Tras desvincular se crea otro registro, conservando el histórico.
La desvinculación exige motivo de 10–1000 caracteres; repetirla devuelve 404.

## Concurrencia

Link y unlink toman Supplier FOR NO KEY UPDATE antes de modificar vínculos.
Link relee el documento después del lock. Este es el mismo recurso que ya toma
SupplierDocumentReconciliationService.execute antes de cancelar: no cambia ese
servicio ni sus asignaciones monetarias. Si cancela primero, link devuelve 409;
si link confirma primero, la cancelación posterior conserva el vínculo y la
consulta expone status CANCELLED. La serialización es por proveedor y puede
incrementar espera bajo contención; no se introduce un lock de inventario.
Los E2E pausan tras adquirir el lock y comprueban en pg_stat_activity la espera
real de la segunda transacción para probar ambos órdenes con el
servicio real de cancelación. También cubren link/link, unlink/unlink y link/unlink.

## Migración e índices

Se añade exclusivamente 20261027000000_receipt_supplier_document_links.
Se conservan las FK compuestas, índice parcial PRSDL_active_pair_key
(companyId, receiptId, documentId) WHERE removedAt IS NULL y triggers de historia.
Los nombres de las seis FK y dos índices normales se mapean explícitamente en
Prisma. El índice parcial, CHECK y triggers se mantienen en SQL y se verifican
contra pg_catalog: una comparación Prisma vacía no bastaría para acreditarlos.

## QA local (30 octubre 2026)

Worktree aislado: output/zfiles-int-02a; rama codex/zfiles-int-02a-receipt-links.
Node 24.21.0; npm 11.19.0. Dependencias copiadas a este worktree, sin cambios
al lockfile ni al cliente Prisma de main.
PostgreSQL 16 descartable: contenedor zaping-zfiles-int02a-pg, datos tmpfs,
127.0.0.1:55487; bases zaping_test y zfiles_upgrade. Sin conexión operativa.

- Prisma validate y generate: PASS.
- Clean install, 51 migraciones: PASS.
- Upgrade, 50 migraciones de main + una nueva: PASS.
- Drift: la salida textual de Prisma migrate diff es idéntico antes/después respecto a
  cada datamodel. Hay drift heredado de nombres en healthcare y conciliación;
  no es un esquema global sin drift. Evidencia local en .qa/drift-main.txt y
  .qa/drift-candidate.txt (sin secretos).
- PostgreSQL y HTTP JWT/RBAC: 12/12 PASS, incluidos índice parcial, seis FK,
  dos triggers, historial, tenant/proveedor, folios duplicados y concurrencia.
- Regresión API y Web, lint/typecheck/build: resultados finales pendientes
  de consolidación en esta misma nota.
- Historical upgrade pre-S1: launcher habilitado exclusivamente para esta rama
  adicional y SHA explícito exacto, con pruebas de rechazo de main/SHA incorrecto.
  Resultado del upgrade pendiente de consolidación. El job CI se conserva.

Las primeras ejecuciones bajo sandbox fallaron por permisos de caché/engine,
y la primera inicialización HTTP de tests necesitó importar PrismaModule.
La ejecución PostgreSQL corregida pasó. Web registró timeouts con el límite
normal de cinco segundos; no deben interpretarse como una regresión demostrada
ni omitirse del resultado final.

## Reproducción

En API: prisma validate; prisma generate; npm test -- --runInBand;
npm run typecheck; npm run lint:check; npm run build.
En CI, RUN_RECEIPT_DOCUMENT_LINKS_PG=1 ejecuta la suite HTTP/PostgreSQL sobre
el servicio efímero zaping_test. Localmente se exige CI=true,
ZFILES_DISPOSABLE_PG=1, ZFILES_TEST_PORT y DATABASE_URL apuntando a localhost,
usuario ci y base zaping_test. No se permite usar una base operativa.
La suite está opt-in; no se conecta a DB cuando el gate está desactivado.

Para drift se materializó schema.prisma y las 50 migraciones del SHA baseline
en .qa/upgrade, se instaló en zfiles_upgrade y se ejecutó migrate diff contra
ese datamodel; después migrate deploy del candidato y migrate diff contra
el modelo candidato. Ambas salidas se compararon byte a byte. No se ejecutaron
migraciones inversas ni se alteraron los SQL históricos.

## Revisión pendiente

No listo para merge. Revisar resultados en ChatGPT antes de cualquier push,
PR remoto o integración. No se incluyen adjuntos, R2, antivirus, uploads,
downloads ni las otras siete migraciones de Files. No hay merge ni deploy.
