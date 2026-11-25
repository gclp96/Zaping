Project Board — Zaping

## Snapshot vigente — UX-007 Compras y Recepciones (24-nov-2026)

**Estado: UX-007 COMPLETE / MERGED / UAT LOCAL ACCEPTED.** El cierre técnico y de pruebas está incorporado en `main@47ad3f298ecf27531ed0ef5ca514504ddbe461c8` (PR #297, #298 y #301). La PR #301 solo añadió dos archivos de pruebas de motivo obligatorio; CI 4/4 PASS (Agents, API, Historical upgrade pre-S1 y Web). **No declara despliegue productivo ni activación general de flags.**

- **Alcance verificado:** flujo de Compras y PDF, autor histórico, costos/descuentos por partida, auditoría de ajustes, Recepciones parciales y trazabilidad a Inventory, roles ADMIN/MANAGER/WAREHOUSE/SALES. UAT manual de empresa A/B y GET de cinco recursos extranjeros con JWT de Company B: 5/5 HTTP 404. Evidencia de cierre adicional: Web 119/119, PostgreSQL/HTTP final 12/12 y hook Web 18/18 (resultados locales reportados).
- **Motivo obligatorio:** pruebas negativas finales acreditan HTTP 400 al omitir/enviar vacío/solo espacios; cero cambios en la orden y sus partidas, cero eventos de auditoría; con justificación válida se registra un evento. La prueba manual negativa en interfaz no tuvo evidencia concluyente; **no** se declara PASS manual para ese caso.
- **PR históricas cerradas sin merge adicional:** #290, #291, #293, #294, #295 y #296, tras verificar que sus HEAD estaban contenidos en `main` (0 commits por delante). Comentarios de trazabilidad en las PR. **No se borraron ramas ni worktrees.**
- **PR pendientes de decisión:** #287 y #292 permanecen DRAFT/OPEN. Sus ramas son divergentes con `main` (10 y 3 commits por delante, respectivamente) y sus cambios principales tienen versiones integradas o evolucionadas; **no fusionar ni cerrar** sin reconciliación final de diferencias.
- **Gates no acreditados por este cierre:** deployment, migraciones en bases reales, aceptación completa en operación de clientes, activación de funcionalidades con flags, respaldo/rollback en el ambiente de destino y validación de riesgos de índices/migraciones bajo carga.
- **Siguiente objetivo propuesto (sin sprint/fecha/SP comprometidos):** release-readiness de Compras/Recepciones: revisión de PR divergentes, matriz de gates de despliegue, plan de migraciones/respaldo/rollback y cierre documental. Mantener iniciativas Healthcare e Inventory sujetas a sus propios gates; no inferir cutover real.

Este snapshot prevalece sobre las referencias históricas de Compras/Recepciones anteriores que aparecen debajo. La historia de tickets y milestones existentes permanece intacta.

---

## Cierre de integración — Compras y Recepciones V1 (27-oct-2026)

**Código de rediseño RR-001–RR-007: INTEGRADO EN main** mediante [PR #176](https://github.com/gclp96/zaping/pull/176), merge `83ce41e799f6b8523adf1f176e57477d43388bc6`. La CI del HEAD final `6e08288a81b25ad1f93870d7cf3cb8d2a7f8315f` completó Web, API e Historical upgrade pre-S1: **3/3 PASS** ([run 40612272176](https://github.com/gclp96/zaping/actions/runs/40612272176)). Los PR #167 y #169–#175 se cerraron como superseded para impedir integración duplicada; #168 aparece fusionado por GitHub al incorporar su rama.

- **Compras V1 y Recepciones V1:** flujos comerciales y físicos anteriormente implementados/validados; no se cambian backend, Prisma, transacciones, multiempresa, idempotencia ni mutaciones de inventario en esta integración.
- **Rediseño de recepción:** código incorporado pero **flags OFF por defecto**. `NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE` y `NEXT_PUBLIC_ZAPING_FILES_RECEIPTS_UI` requieren `true` explícito; el formulario clásico permanece como fallback.
- **QA manual:** evidencia en PR #174 de responsive, zoom parcial, captura parcial, validaciones visibles, descarte, prototipo de archivos y acceso directo denegado para SALES. No declarar todos los gates de operación, a11y o roles completados; consultar `RECEIPTS_REDESIGN_01_RR007_RELEASE_GATES.md`.
- **Zaping Files:** prototipo metadata-only, sin lectura/subida de bytes ni persistencia; integración real con Cloudflare R2, antivirus, autorización y auditoría **pendiente por separado**, sin activar.
- **Siguiente ciclo:** mejora visual de la **página Compras**, inspirada en Recepciones, como iniciativa independiente con contrato UX/QA y sin cambios de dominio ni inventario.

**Distinción:** integración de código completada; **habilitación general de UI rediseñada NO aprobada todavía**. Cierre de Compras/Recepciones V1 no implica liberación de adjuntos reales.

---


Producto: Zaping Platform
Estado: Desarrollo activo
Fase actual: M-HC1 Healthcare Operations Foundation — HC-NEXT-03C1–C4 COMPLETE / MERGED — PARENT INTEGRATIONS COMPLETE — HC-LOCK-04 FINAL CLOSED / ACCEPTED — HC-NEXT-03C5-A COMPLETE / MERGED — HC-NEXT-03C6-A/C6-B/C6-C/C6-D/C6-E COMPLETE / MERGED — HC-OPS-01A COMPLETE / MERGED — PR #50 — main@bb530e8 — HC-OPS-01A.1 COMPLETE / MERGED — PR #53 — main@54a5d79 — Actual 28-sep-2026 — HC-OPS-01B COMPLETE / MERGED — PR #56 — main@478e0f0 — DoD PASS — DoR COMPLETE — HC-NEXT-03C5-B COMPLETE / DoD PASS / MERGED — B0 COMPLETE / MERGED — PR #57 — main@1be994d — DoD PASS; B1 COMPLETE / MERGED — PR #58 — main@9504cdd — DoD PASS; B2 COMPLETE / MERGED — PR #59 — main@dac9794 — DoD PASS; B3 COMPLETE / VALIDATED / MERGED — PR #60 — main@ad19dcf — CI PASS
Última actualización: 2026-10-22
Responsable: Zaping Team

0. Snapshot vigente

01E-A COMPLETE / MERGED — PR #86 — TARGET 5 SP.
01E-B COMPLETE / MERGED — PR #87 — TARGET 8 SP.
Focal635/635 (32 suites); PostgreSQL35/35 en DB nueva efímera; full API1981/1981 (119 suites); Web43/43 (2 archivos) PASS.
Elegibilidad física en Availability/Create/Replace; Inspection/Retirement con HC lock, revisión e historia atómicas.
Coverage/PREPARED conservados; primitiva interna caller-owned. 01E entregó registry vacío;
01C registra el adapter CASE_DISPATCH_ITEM con validación durable fail-closed.
UNVERIFIED no es destino nuevo: acreditar Assets necesarios mediante baseline01E-A antes del despliegue operativo.
Sin control Company nuevo, fallback ni migraciones. REAL EQUIPMENT RECONCILIATION: NOT EXECUTED.
PRODUCTIVE EQUIPMENT CUSTODY: ENABLED BY CONFIRM CODE PATH.
CaseDispatch physical confirmation: COMPLETE / MERGED — PR #92 — HC-DSP-01C TARGET 8 SP.
HC-CASE-DISPATCH BACKEND: COMPLETE / MERGED. Return/Reconciliation: 01A/01B/01C/01D
COMPLETE / MERGED — PR #94/#95/#96/#99. FUNCTIONAL BACKEND COMPLETE / MERGED —
23/23 functional TARGET SP; [estado post-merge en TD §21](../modules/healthcare/CASE_RECONCILIATION_TECHNICAL_DESIGN.md#21-hc-rr-01d--cierre-documental-post-merge-de-pr-99).
M-HC1 OPEN.

HC-INVENTORY-CUSTODY-01E — [Technical Design APPROVED](../modules/erp/INVENTORY_CUSTODY_01E_TECHNICAL_DESIGN.md).
IMPLEMENTATION: 01E-A COMPLETE / MERGED — PR #86; 01E-B COMPLETE / MERGED — PR #87. 01E IMPLEMENTATION COMPLETE / MERGED. ASSET/EquipmentAsset únicamente; SERIALIZED material excluido.
01E-A: COMPLETE / MERGED — PR #86 — TARGET 5 SP.
01E-B: COMPLETE / MERGED — PR #87 — TARGET 8 SP. TOTAL 01E TARGET: 13 SP = 5 + 8; sustituye el TARGET8SP anterior.
EquipmentAsset root físico; lifecycle/condition/location independientes; AVAILABLE derivado.
Custodia/eventos dedicados; UNVERIFIED conservador; adapter Dispatch productivo implementado en 01C.
Autoridad Equipment independiente de InventoryCutover QUANTITY: no exige activación01D.
REAL COMPANY CUTOVER: NOT EXECUTED. EXTERNAL OPERATIONAL FENCE: NOT CERTIFIED.
M-HC1 OPEN. Sin Forecast, Commitment, Actual ni fechas asignadas.

HC-CASE-DISPATCH — TECHNICAL DESIGN APPROVED / MERGED — PR #88. HC-DSP-01A COMPLETE / MERGED — PR #89; HC-DSP-01B COMPLETE / MERGED — PR #90.
QUANTITY SOURCING BLOCKER: RESOLVED. Candidate C SALES-ONLY; Dispatch usa Position
explícita y revisión, batch nullable según tracking/fuente. Custodio híbrido,
Equipment estricto y autoridad Inventory compartida conservados. Backend TARGET18SP:
01A COMPLETE / MERGED — PR #89 — TARGET 5 SP.
01B COMPLETE / MERGED — PR #90 — TARGET 5 SP; HC-DSP-LOCK-01 COMPLETE / MERGED — PR #91 — TARGET 3 SP.
01C COMPLETE / MERGED — PR #92 — TARGET 8 SP.
01C: PostgreSQL16 aislado75/75, focal905/905 (36 suites), full API2207/2207 (123 suites),
typecheck/noEmit focal/lint/build/Prisma validate/Prettier/diff PASS; evidencia en TD §17.
01B: focal242/242 (4 suites), API2147/2147 (122 suites), PostgreSQL16 comandos40/40 y
cleanup PASS en DB nueva temporal; typecheck/noEmit focal/lint/build/Prisma validate/Prettier/diff PASS.
CREATE vacío, custodian, add MATERIAL/EQUIPMENT, exclude y cancel; CAS/audit/idempotencia
con detalle actual + recibo original. Sin schema/migración ni confirmación/efectos físicos.
[Technical Design](../modules/healthcare/CASE_DISPATCH_TECHNICAL_DESIGN.md) y
[CASE_LOGISTICS §258](../modules/healthcare/CASE_LOGISTICS.md#258-hc-case-dispatch--v1-approved-contract).

HC-INVENTORY-CUSTODY-DEF — Inventory Custody & Physical Availability Definition —
COMPLETE / MERGED — PR #75 — main@51363f5 — TARGET 5 SP.
[DEC-INV-CUST-01..14 APPROVED con refinamientos](../modules/erp/INVENTORY_CUSTODY_DEFINITION.md).
Posiciones = autoridad física actual; ledger/efectos = evidencia histórica;
Product.stock = proyección compatible owned futura. 01A está COMPLETE / MERGED con el
fundamento dormido; los writers/readers productivos conservan su comportamiento.

| Foundation slice                                                                            | TARGET            | Estado                                                                                                                               |
| ------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| HC-INVENTORY-CUSTODY-01A — Core authority + ledger/effects + read model                     | 8 SP              | COMPLETE / MERGED — PR #77 — main@47fd68a                                                                                            |
| HC-INVENTORY-CUSTODY-01B — Receipts + manual Inventory + projections                        | 8 SP              | COMPLETE / MERGED — PR #79 — DORMANT UNTIL 01D                                                                                       |
| HC-INVENTORY-CUSTODY-01C — Sales + outbound source resolution + concurrency                 | 8 SP              | COMPLETE / MERGED — PR #80 — main@c3d0824 — DORMANT UNTIL 01D                                                                        |
| HC-INVENTORY-CUSTODY-01D — Reconciliation + opening baseline + coordinated cutover umbrella | 21 SP = 5 + 8 + 8 | IMPLEMENTATION COMPLETE / MERGED — 01D-A PR #82; 01D-B PR #83; 01D-C PR #84; original8SP SUPERSEDED |
| HC-INVENTORY-CUSTODY-01D-A — Durable Cutover Control & Legacy Classification Foundation     | 5 SP              | COMPLETE / MERGED — PR #82 — NON-ACTIVATING                                                                                          |
| HC-INVENTORY-CUSTODY-01D-B — Reconciliation, Opening Baseline & Verification                | 8 SP              | COMPLETE / MERGED — PR #83 — NO PRODUCTIVE ACTIVATION                                                                                |
| HC-INVENTORY-CUSTODY-01D-C — Authority Cutover, Writer Wiring & Operational Activation      | 8 SP              | COMPLETE / MERGED — PR #84 — ACTUAL CUTOVER NOT EXECUTED                                                                                   |
| HC-INVENTORY-CUSTODY-01E — EquipmentAsset custody foundation | 13 SP = 5 + 8 | TECHNICAL DESIGN: APPROVED / MERGED — PR #85 — 01E-A COMPLETE / MERGED — PR #86; 01E-B COMPLETE / MERGED — PR #87 |
| HC-INVENTORY-CUSTODY-01E-A — Persistence, invariants, baseline & physical history | 5 SP | COMPLETE / MERGED — PR #86 |
| HC-INVENTORY-CUSTODY-01E-B — Physical primitives, Equipment/Assignment/readers & cross-domain acceptance | 8 SP | COMPLETE / MERGED — PR #87 |

DEF merged en `51363f566c8c6656f1653f03f11d9489ab4d082b`;
[TD-INV-01A-01..20](../modules/erp/INVENTORY_CUSTODY_TECHNICAL_DESIGN.md)
APPROVED / MERGED — PR #76. Implementación 01A COMPLETE / MERGED — PR #77 —
`47fd68a409906b3a5981bd7f7cd30a48e08714b0` — TARGET 8 SP.
InventoryPosition + PhysicalEffect/Line, cuatro UNIQUE parciales, FKs compuestas,
CHECKs y completitud diferida de INSERT; sin triggers de inmutabilidad UPDATE/DELETE.
Core interno creditAvailable/transfer/definitiveOut y reads Positions-only;
TransactionClient del caller, locks Product → Batch → Position, INSERT normal,
abort y clasificación fresca externa ante colisión de origen. Sin consumidores
productivos, backfill, cutover ni cambios de saldo legacy.

Evidencia histórica local de 01A (no reejecutada en este diseño): contrato focal 20/20 dentro de API `npm test -- --runInBand`
1806/1806, 109 suites;
PostgreSQL 26/26 mediante
`node test/helpers/inventory-physical-postgres-runner.cjs --run-isolated` en
`127.0.0.1:5434 / zaping_spike_test`. Migración
`20261013000000_add_inventory_physical_authority` aplicada sólo allí por socket
administrativo `postgres`, con registro/checksum transaccional; aceptación con rol
temporal sin superusuario `zaping_inv01a_330d32e4f289`, luego eliminado. Cleanup de
fixtures PASS, cero Company de ese run. Último saldo, creación concurrente, replay,
mismatch entre Products distintos, rollback de transfer y FKs/CHECKs reales PASS.
Prisma validate, typecheck, lint, build y noEmit focal PASS. Una corrida PostgreSQL
en paralelo con la suite API agotó el timeout de 5 s de una prueba; repetición
aislada 26/26 PASS sin modificar timeouts. `prisma generate` encontró EPERM al reemplazar
DLL en uso: no se declara PASS; cliente actualizado usado por las pruebas y motor
existente con SHA-256 idéntico al instalado. `prisma migrate deploy` por TCP falló
por credencial administrativa desactualizada; el runner usa socket local del
contenedor aislado, sin cambiar credenciales existentes ni .env. El noEmit global
de specs encontró errores en tests existentes fuera de 01A; el conjunto focal pasa.

01A está merged y permanece dormido. 01B está COMPLETE / MERGED — PR #79 — TARGET 8 SP;
[TD-INV-01B-01..30](../modules/erp/INVENTORY_CUSTODY_01B_TECHNICAL_DESIGN.md)
APPROVED / MERGED — PR #78. Baseline implementación
`724918966d4375cf3e96e5ccab900f6ef734d752`; Activation DORMANT UNTIL 01D.
OUT manual con sources explícitas y expectedRevision; COUNT_CORRECTION AVAILABLE
con actor/razón y Effect/Line incluso delta cero, sin revision bump ni proyección cero.
Receipt mixto admite conjuntos disjuntos: QUANTITY Positions, ASSET Equipment,
SERIALIZED sin nueva integración física. Proyecciones compartidas y replay atómico.
TARGET 8 SP con alcance backend dormido; sin frontend, cutover, Sales ni backfill.
01C COMPLETE / MERGED — PR #80 — main@c3d0824 — TARGET 8 SP; DORMANT UNTIL 01D.
01D TECHNICAL DESIGN APPROVED32/32;01D-A COMPLETE / MERGED — PR #82;01D-B COMPLETE / MERGED — PR #83.
01E TECHNICAL DESIGN APPROVED; 01E-A COMPLETE / MERGED — PR #86, 01E-B COMPLETE / MERGED — PR #87.
HC-DSP-01A COMPLETE / MERGED — PR #89; HC-DSP-01B COMPLETE / MERGED — PR #90;
HC-DSP-LOCK-01 COMPLETE / MERGED — PR #91; 01C COMPLETE / MERGED — PR #92;
frontend fuera de scope; M-HC1 OPEN.
Evidencia del cierre histórico01B, anterior al wiring01D-C: COUNT_CORRECTION con delta cero auditado y sin UPDATE Position;
dos migraciones (enums separados de constraints); adapter compartido de proyección
desde hechos persistidos; historial compatible ADJUSTMENT absoluto; manual con key,
actor y fuentes explícitas; Receipt interno mixto con reserva ASSET codes antes de
Product roots. No controller productivo invoca la integración. Helper legacy
registerPurchaseEntry retirado en01D-C, sin alias físico. No backfill/activación real.

Evidencia histórica local 01B (no reejecutada en el diseño 01C): focal 28/28; API `npm test -- --runInBand` 1814/1814,
110 suites; typecheck/lint/build, Prisma format/validate y noEmit focal PASS.
Aceptación `node test/helpers/inventory-integration-postgres-runner.cjs --run-isolated`:
30/30 PASS; `prisma migrate deploy` normal PASS sólo en
`127.0.0.1:5434 / zaping_spike_test`. Último rol temporal
`zaping_inv01b_a721c8d2c491`: migración con privilegio administrativo temporal,
aceptación sin superusuario; fixtures eliminados, Company residue=0 y rol eliminado.
Una corrida ampliada tuvo 29 PASS / 1 FAIL por UPDATE no autorizado del fixture
PurchaseItem; fixture corregido para INSERT con costo requerido, sin ampliar grants.
`prisma generate` no PASS: DLL Windows en uso (EPERM). Harness 01A inicialmente
detenido por checksum; se verificó que el registrado coincide exactamente con LF
y el checkout usa CRLF. Se aceptó sólo esa equivalencia de finales de línea, sin
modificar SQL ni metadata. Regresión PostgreSQL 01A: 26/26 PASS; rol temporal
`zaping_inv01a_221153c22427` y fixtures eliminados.
Prueba estática ampliada de ausencia de callers productivos: 20/20 PASS.

01B COMPLETE / MERGED — PR #79; se satisface la dependencia de diseño 01C.
[TD-INV-01C-01..36](../modules/erp/INVENTORY_CUSTODY_01C_TECHNICAL_DESIGN.md):
APPROVED con restricciones vinculantes: OPTIONAL Candidate C sólo unbatched;
replay lógico ZERO WRITES sólo mismo actor original con autorización actual, otro actor conserva error histórico.
Sin Idempotency-Key; actor histórico no necesita permanecer activo.
Gates01D: accesibilidad OPTIONAL, reaudit global locks y manifest legacy; no bloquean implementación dormida01C.
En el cierre histórico01C, anterior al wiring01D-C, Sales productivo conservaba routing legacy. La activación real01A/B/C sigue DORMANT.
Evidencia local01C: 133/133 pruebas focales (6 suites), typecheck/lint/build PASS;
PostgreSQL12/12 PASS en 127.0.0.1:5434 / zaping_spike_test, rol temporal sin superusuario
y fixtures eliminados; cero migraciones. Resolver Candidate C, replay mismo actor,
orquestación interna y history compartido; guard de dormancia y controllers legacy verificados.
Detalle y límites en §F del diseño01C; merge mediante PR #80 sobre
`c3d0824e64152ae26c0d891d203b5fa8ebb80899`, sin activación ni deployment declarado.

HC-INVENTORY-CUSTODY-01D — TECHNICAL DESIGN: APPROVED.
[TD-INV-01D-01..32](../modules/erp/INVENTORY_CUSTODY_01D_TECHNICAL_DESIGN.md):
32/32 human approved con restricciones vinculantes; DOC DELTA incorporado.
01D-A COMPLETE / MERGED — PR #82; 01D-B COMPLETE / MERGED — PR #83; 01D-C COMPLETE / MERGED — PR #84.
ACTIVATION: NOT STARTED; DESIGN APPROVED ≠ CUTOVER READY.
Original TARGET8SP SUPERSEDED BY HUMAN RE-ESTIMATION.
01D-A TARGET5SP COMPLETE / MERGED — PR #82;01D-B TARGET8SP COMPLETE / MERGED — PR #83;
01D-C TARGET8SP COMPLETE / MERGED — PR #84; TOTAL01D TARGET21SP =5+8+8.
01D-A: DB control dedicado, CAS/digest/checkpoints/membership/classifier y resolver
foundation non-activating.01D-B: reconciliation/manifest/dry-run, initializer opening-only,
adapter baseline, apply por Product/resume/VERIFY; no productive activation.
01D-C: router único Company, wiring conjunto Receipt/manual/Sales, readers compatibles,
barrera/activación/ensayo/recovery; backend-only, sin frontend ni fulfillment nuevo.
Apertura conserva owned vencido/inactivo sin hacerlo elegible y CUSTODY sólo con
contexto durable válido representable. Stock no se duplica; initialQuantity intacto.
Manifest externo seguro, no Git real por defecto; operador técnico separado del actor User.
Certificación KNOWN WRITERS=COMPLETE / UNKNOWN WRITERS=0 y freeze tenant demostrado
o GLOBAL APPLICATION WRITE FREEZE son gates. OPTIONAL inaccesible/ambiguo, discrepancias,
UNKNOWN legacy, parity/idempotency/tenant/barrier fallidos bloquean toda Company.
01A/01B/01C DORMANT;01E no requiere activar01D; 01E-A COMPLETE / MERGED — PR #86; 01E-B COMPLETE / MERGED — PR #87;M-HC1 OPEN.
01D-A: schema-only migration, CAS/checkpoints/membership/classifier/resolver internos implementados.
Al cierre histórico01D-A no incluía reconciliation/APPLY/VERIFY.01D-B los añade internamente, sin activación/routing productivo.
Validación histórica01D-A: full API1896 tests/113 suites PASS; PostgreSQL16/16 PASS en contenedor nuevo
loopback/tmpfs (DB zaping_cutover_test), cleanup PASS; Prisma validate/typecheck/lint/build PASS.
Prisma generate: DLL Windows ocupada; no declarar PASS. noEmit global tests:70 diagnósticos
preexistentes, cero nuevos; detalle en §A.1 del diseño01D.
01D-C COMPLETE / MERGED — PR #84 — TARGET 8 SP. HC-INVENTORY-CUSTODY-01D IMPLEMENTATION COMPLETE / MERGED.
Full API1935/1935 (116 suites), Web106/106 (8 archivos), PostgreSQL aislado27/27 PASS.
Fence compartido/exclusivo y router único cableados; CLI interna exige adapter de evidencia.
ACTUAL CUTOVER NOT EXECUTED; 01D ACTIVATION NOT PERFORMED AGAINST REAL COMPANY.
EXTERNAL OPERATIONAL FENCE: NOT CERTIFIED. [Runbook](../modules/erp/INVENTORY_CUSTODY_01D_CUTOVER_RUNBOOK.md).

Evidencia histórica 01D-B COMPLETE / MERGED — PR #83 — TARGET8SP.
Focal77/77, full API1918/114 suites, PostgreSQL43/43 PASS; Prisma format/validate/generate,
typecheck, lint tocado y build PASS. Aceptación sólo DB nueva efímera zaping_opening_test,
loopback/tmpfs; cleanup PASS; .env intacto. OPENING interno, manifest/review/APPLY/VERIFY;
registry CUSTODY fail-closed sin namespaces predeterminados; sin routing ni PHYSICAL_ACTIVE.
Detalle y límites en §A.2 del diseño01D.01D-C COMPLETE / MERGED — PR #84; actual cutover NOT EXECUTED.
01A/B/C DORMANT;01D ACTIVATION NOT STARTED;M-HC1 OPEN.
Dispatch backend COMPLETE / MERGED — PR #92. Return/Reconciliation backend
funcional COMPLETE / MERGED — PR #94/#95/#96/#99; seguimiento de RISK-006.
Inventory 01D/01E COMPLETE / MERGED; sin adopción real.
Sin Forecast/Commitment/Actual ni fechas asignados.

| Slice                                           | TARGET | Estado                                            |
| ----------------------------------------------- | ------ | ------------------------------------------------- |
| HC-DSP-01A — Persistence + read                 | 5 SP   | COMPLETE / MERGED — PR #89 |
| HC-DSP-01B — DRAFT commands                     | 5 SP   | COMPLETE / MERGED — PR #90 |
| HC-DSP-LOCK-01 — DRAFT lock compatibility | 3 SP | COMPLETE / MERGED — PR #91 |
| HC-DSP-01C — Atomic Confirm + custody/inventory | 8 SP   | COMPLETE / MERGED — PR #92 |
| HC-DSP-01D — Frontend                           | Candidate 5 SP   | OUT OF CURRENT BACKEND SCOPE |

HC-DSP-01A COMPLETE / MERGED — PR #89; HC-DSP-01B COMPLETE / MERGED — PR #90 — TARGET 5 SP.
HC-DSP-LOCK-01 COMPLETE / MERGED — PR #91 — TARGET 3 SP.
HC-DSP-01C COMPLETE / MERGED — PR #92 — TARGET 8 SP.
Backend Dispatch original total18SP: COMPLETE / MERGED — through PR #92.
Confirm POST 200, tx único, QUANTITY AVAILABLE→CUSTODY y adapter Equipment productivo.
Escenario29 validado con una fuente preparada y Positions/batches distintos, un Effect
y destinos propios; el duplicado exacto sourceCaseKitItem/Position no puede ser DRAFT válido.
PhysicalInventory conserva agregación defensiva inferior; no autoriza líneas Dispatch duplicadas.
PostgreSQL16 nuevo aislado75/75, focal905/36 suites y API2207/123 suites PASS.
Typecheck/noEmit focal/lint/build/Prisma validate/Prettier/diff check PASS; sin schema,
migraciones nuevas ni generate. Custody habilitada por código Confirm; reconciliación real
Equipment y real Company cutover NOT EXECUTED. RETURN: 01D funcional no merged;
aceptación bloqueada, detalle vigente abajo.
Evidencia y target aislado en [TD §17](../modules/healthcare/CASE_DISPATCH_TECHNICAL_DESIGN.md#17-hc-dsp-01c--atomic-confirm-implementado-y-probado).
P1 abiertos: recovery/reopen de PREPARED y selector
Assignment >100. Recovery es gate antes de uso amplio en producción; corrección/
reversal auditado de Dispatch confirmado es RELEASE GATE antes de production-ready.
M-HC1 permanece OPEN. Sin Forecast, Commitment, Actual ni fechas nuevas.

HC-RETURN-RECONCILIATION — **TECHNICAL DESIGN APPROVED / MERGED — PR #93**;
HC-RR-01A **COMPLETE / MERGED — PR #94**.
HC-RR-01B **COMPLETE / MERGED — PR #95** — TARGET **5 SP**.
HC-RR-01C **COMPLETE / MERGED — PR #96** — TARGET **5 SP**.
[TD canónico](../modules/healthcare/CASE_RECONCILIATION_TECHNICAL_DESIGN.md) y
[Case Logistics §259](../modules/healthcare/CASE_LOGISTICS.md#259-hc-return-reconciliation--v1-approved-contract).
Un HealthcareCaseReconciliation por episodio de un Dispatch CONFIRMED; Dispatch 1:N.
MATERIAL returnedQty=retornado y aprobado RESTOCKABLE; usedQty=consumo definitivo;
unresolved derivado, sin movimiento. Recibido con disposición pendiente sigue
unresolved/CUSTODY con observación; sin QUARANTINE/unavailable-return V1. Confirmados
inmutables: corrección futura fuera de scope. Revisar ambos riesgos antes de producción.
Equipment RETURNED/UNRESOLVED, condición separada; cierre exacto con un CUSTODY_CLOSE,
sin Inspection fabricado, reactivar RETIRED ni liberar Assignment. Sin mutar Case/Kit.
Mixto atómico; sólo MATERIAL positivo activa fence/PHYSICAL/runtime. Observacional
sin efectos exige recurso pendiente y razón explícita (prueba operacional futura en 01D).
01A entrega persistencia/invariantes/GET; 01B añade CREATE vacío, ITEM_ADD neutral,
OUTCOME_SET, EXCLUDE y CANCEL con revisión, audit, hash/idempotencia y replay durable.
Observation CREATE-only; corregir con CANCEL + CREATE. DRAFTs no reservan capacidad;
OUTCOME recaptura revisiones observadas. Sin CONFIRM ni escrituras físicas, autoridad
Inventory, fence o HC Company lock; sin cambios Prisma/migraciones. Validado: focal
Reconciliation/RBAC 259/259, PostgreSQL16 comandos 39/39 y regresión 01A 44/44,
cada uno en entorno nuevo aislado/tmpfs, 43 migraciones existentes y cleanup PASS.
Full API 2388/2388 (130 suites); typecheck/noEmit focal, lint, build, Prisma validate,
Prettier/check y diff check PASS. Esta evidencia corresponde al cierre histórico 01B.

01C entrega `returnFromCustody(tx, command)` caller-owned y registry de cierre separado,
vacío/congelado/fail-closed en producción. Exige HC Company lock retenido; Asset UPDATE
antes de Custody UPDATE; CAS y un único CUSTODY_CLOSE con timestamp compartido.
Retorno CUSTODY → WAREHOUSE, pointer null, reportedCondition whitelist, revision +1;
lifecycle y metadata RETIRED preservados. Cero cambios Assignment/Case/Kit/Inventory.
Replay por origen/hash/testigo histórico, incluso tras lost response y redispatch,
sin gates actuales ni escrituras. Sin schema/migración ni endpoint público.
Validado 01C: unitarios nuevos 72/72; focal Equipment/Assignment/Dispatch 825/825
(31 suites); PostgreSQL16 nuevo aislado loopback/tmpfs 46/46, rol no superusuario,
43 migraciones existentes, cleanup PASS; full API 2460/2460 (133 suites).
Typecheck/noEmit focal, lint, build, Prisma validate, Prettier/check y diff check PASS.
Carreras observadas por PIDs, pg_blocking_pids y pg_stat_activity: cierres concurrentes,
Inspection y Retirement; rollback tras Custody/Asset/evento y prelocks multi-Asset PASS.
En la baseline merged 01C, productive reconciliation close adapter y Confirm RR
**NOT IMPLEMENTED** en aquella baseline. Estado actual 01D: COMPLETE / MERGED — PR #99.
Evidencia histórica 01C y target exacto en TD §18; estado vigente en TD §21. Sin DB real.

| Slice | Alcance | TARGET | Estado |
| --- | --- | --- | --- |
| HC-RR-01A | Persistence, invariants & reads | 5 SP | COMPLETE / MERGED — PR #94 |
| HC-RR-01B | DRAFT commands, outcomes & idempotency | 5 SP | COMPLETE / MERGED — PR #95 |
| HC-RR-01C | Equipment custody close primitive, close registry & internal tests | 5 SP | COMPLETE / MERGED — PR #96 |
| HC-RR-01D | Atomic Confirm, productive adapter & cross-domain PostgreSQL acceptance | 8 SP | COMPLETE / MERGED — PR #99 |
| BACKEND TOTAL | Return / Reconciliation | 23 SP | FUNCTIONAL BACKEND COMPLETE / MERGED — 23/23 TARGET SP |

Sólo planning TARGET, sin Forecast/Commitment/Actual ni fechas. REAL COMPANY CUTOVER
y REAL EQUIPMENT RECONCILIATION NOT EXECUTED; M-HC1 OPEN. 01D COMPLETE / MERGED —
PR #99; el riesgo residual RISK-006 permanece abierto. Sin Actual SP ni métricas nuevas.

HC-RR-PERF-01: **COMPLETE / MERGED — PR #97 — TARGET 8 SP**.
HC-RR-PERF-02: **COMPLETE / MERGED — PR #98 — TARGET 5 SP**.
N1000 real Confirm: 30 ejecuciones normales, mediana 6.324 s, p90 7.486 s,
p95 nearest-rank 7.922 s, máximo 8.519 s; cero fallos/timeouts. Gate PASS.
SQL por Confirm: ~8137 → 3157 (-61.2%); Transfer 3019, proyección 6,
evidencia 4, snapshots 4, resto 124. Baseline histórica: mediana 15.94 s,
p95 18.45 s, 7/10 >15 s, cero fallos naturales sólo en esa muestra READ.
Lotes <=250; Position CAS, locks, hashes, timeouts, schema y migraciones intactos.
Prelocks canónicos existentes antes de UPDATE Batch; cardinalidad/identidades
exactas y rollback completo, incluidos fallos en chunks posteriores.
PostgreSQL funcional 360/360; benchmark aparte 30/30, exclusiones no cuentan PASS.
API completa 2473/2473 (134 suites); typecheck/noEmit focal/lint/build/Prisma/formato PASS.
HC-RR-01D: **COMPLETE / MERGED — PR #99 — TARGET 8 SP**. Implementación `8a575b1`,
merge en main `4d7395214f8501013f923341ea8186cd4b0d6ecb` (`4d73952`).
01A/01B/01C COMPLETE / MERGED — PR #94/#95/#96. Backend RR: FUNCTIONAL BACKEND
COMPLETE / MERGED — **23/23 functional TARGET SP**, sin atribuir Actual SP.
Backend feature TARGET 23 SP separado de PERF-01 (8 SP) y PERF-02 (5 SP).
Sin Forecast, Commitment, Actual ni fechas nuevos.
[Evidencia histórica PERF-02, límites, targets y cleanup](../../app/api/test/physical-writer-throughput-results.md).
REAL COMPANY CUTOVER / REAL EQUIPMENT RECONCILIATION: NOT EXECUTED. M-HC1 OPEN.

### HC-RR-01D — cierre QA 2026-10-18

> Checkpoint histórico previo al merge de PR #99. Se conservan evidencia y fecha;
> READY FOR HUMAN STAGING REVIEW / NOT MERGED describe ese momento.
> Estado actual en el cierre post-merge siguiente y TD §21.

IMPLEMENTED / TESTED — **READY FOR HUMAN STAGING REVIEW**, TARGET **8 SP**, NOT MERGED.
API actual 2526/2526 (136 suites); focal Confirm/adapter 46/46 (2 suites); core
PostgreSQL 81 PASS / 0 FAIL / 4 SKIPPED; final completo sin instrumentación
**85 PASS / 0 FAIL / 0 SKIPPED** (51.023 s), una sola ejecución final tras QA.
RETURNED/USED 1000 y rechazos 1001, Equipment replay/redispatch, concurrencia y
rollback PASS. 23514 y 57014 preservados con rollback y sin estado parcial.
ESLint 24 errores / 1 warning → **0 / 0**; Prettier 9 archivos normalizados a LF,
19/19 PASS; typecheck/noEmit (18 raíces, 0 diagnósticos), build, Prisma y diff check PASS.
Se conserva evidencia previa 1363 tests/55 suites focales y 553 tests/13 suites
PostgreSQL; no reejecutada aquí y sin cambios de producción ni fixtures/hooks compartidos.
Cambios QA sólo en dos tests y finales de línea de nueve archivos. Sin cambios
schema/migración, locks, Position CAS, writers, APIs, timeouts ni guard Equipment.
Los dos PostgreSQL16 nuevos en loopback/tmpfs usaron 44 migraciones y runtime no
superusuario; puertos 50933 y 50168, cleanup PASS. No DB ni operación real.
Riesgo histórico **OPEN / NOT REPRODUCED**, root cause UNKNOWN / NOT VERIFIED;
ninguna corrección funcional. Decisión humana: avanzar con riesgo explícito y
reabrir si aparece evidencia reproducible; ver RISK-006.
[Evidencia, targets e inventario exacto tracked/untracked en TD §20](../modules/healthcare/CASE_RECONCILIATION_TECHNICAL_DESIGN.md#20-hc-rr-01d--cierre-qa-y-preparación-de-staging-2026-10-18).
Backend RR NOT MERGED COMPLETE UNTIL 01D MERGE. REAL COMPANY CUTOVER / REAL
EQUIPMENT RECONCILIATION NOT EXECUTED. M-HC1 OPEN. Staged/committed/pushed NONE.

### HC-RR-01D — cierre post-merge de PR #99

**COMPLETE / MERGED — PR #99 — TARGET 8 SP**. Implementación `8a575b1`, merge main
`4d7395214f8501013f923341ea8186cd4b0d6ecb` (`4d73952`). Backend Return/Reconciliation V1:
**FUNCTIONAL BACKEND COMPLETE / MERGED — 23/23 functional TARGET SP**.
PERF-01 y PERF-02 COMPLETE / MERGED — PR #97/#98; sus SP correctivos se mantienen
separados del TARGET funcional. No se reportan Actual SP ni métricas de entrega.

Se conserva el cierre QA anterior: PostgreSQL 85/85, API 2526/2526 (136 suites),
regresión PostgreSQL 553/553 (13 suites), ESLint/Prettier/typecheck/build/Prisma PASS.
Constraints diferidas explícitas Line → Effect → RR/idempotency/Equipment dentro
de la transacción; RETURNED/USED 1000 y rechazos 1001, Equipment replay histórico
y rollback PASS. No se reejecutan tests en este delta exclusivamente documental.

RISK-006 **OPEN**, causa UNKNOWN / NOT VERIFIED, corrección funcional NONE.
El merge aceptó el riesgo residual documentado; no se declara resuelto.
M-HC1 **OPEN**; REAL COMPANY CUTOVER / REAL EQUIPMENT RECONCILIATION **NOT EXECUTED**.
No implica despliegue, readiness operativa ni cierre de Healthcare Operations Foundation.
[Cierre post-merge y evidencia conservada en TD §21](../modules/healthcare/CASE_RECONCILIATION_TECHNICAL_DESIGN.md#21-hc-rr-01d--cierre-documental-post-merge-de-pr-99).

### HC-DSP-COR-01 — Corrección auditada de Dispatch confirmado sin entrega física

**M-HC1: OPEN. P0 RELEASE GATE. TD V0.8 / 01A: APPROVED / MERGED — PR #101. 01B: IMPLEMENTATION COMPLETE / MERGED — PR #102. 01C: PRINCIPAL ACTIVO — 01C-A DONE / MERGED — PR #105; 01C-B CODE REVIEW / QA PASSED / NOT MERGED; 01C-C PENDIENTE. 01D–01F: BACKLOG.**

Contexto operativo INSAP: ajustes manuales con observación corrigen diferencias `AVAILABLE`; **no** corrigen por sí solos `CUSTODY` ni episodios Equipment. V1 permitirá una única compensación **completa** de un Dispatch `CONFIRMED` registrado por error **sin entrega física**, conservando el hecho original. ADMIN/MANAGER declara expresamente que no hubo entrega y consigna motivo; corrección inmutable con actor/fecha y efectos nuevos. Material: `TRANSFER CUSTODY → AVAILABLE`, mismo Product/batch, sin aumento de `Product.stock` owned. Equipment: `CUSTODY_CLOSE` de origen corrección, `WAREHOUSE`, preservando condición/lifecycle, sin eventos físicos posteriores a su `CUSTODY_OPEN`. R/R `DRAFT` bloquea hasta cancelación explícita, `CONFIRMED` bloquea; `CANCELLED` coherente sin efectos no bloquea. Lecturas: «Corregido — sin entrega física» separado de Return/Reconciliation y del status histórico `CONFIRMED`; sin pendiente físico ficticio.

| Slice | Alcance | Estado |
| --- | --- | --- |
| HC-DSP-COR-01A | Technical Design Approval Delta | **APPROVED / MERGED — PR #101 — main@619c9b6** |
| HC-DSP-COR-01B | Persistence & Witness | **IMPLEMENTATION COMPLETE / MERGED — PR #102 — main@af4fe0d** |
| HC-DSP-COR-01C | Compensación MATERIAL QUANTITY | **01C-A/B/C MERGED — PR #105/#109/#112; QA focal aprobada, sin activación operativa** |
| HC-DSP-COR-01C-A | Inventory Contract & Evidence | **DONE / MERGED — PR #105 — 5 SP completados (Target 5)** |
| HC-DSP-COR-01C-B | Orquestación MATERIAL-only | **DONE / MERGED — PR #109 — Target 5 SP aprobado y completado; Actual no reestimado** |
| HC-DSP-COR-01C-C | Concurrencia y cierre | **DONE / MERGED — PR #112, main@8055dba; PostgreSQL 22/22 PASS; CI API/Web PASS, 3 SP preliminares** |
| HC-DSP-COR-01D | [Compensación Equipment](HC_DSP_COR_01D_TICKET.md) | **PR #113 OPEN / CODE REVIEW — PostgreSQL Equipment/MIXTO 33/33 PASS; regresión MATERIAL 22/22 PASS; CI/DoD/merge pendientes** |
| HC-DSP-COR-01E | RR admission, read model y bloqueos | **BACKLOG** |
| HC-DSP-COR-01F | QA PostgreSQL y release gate backend | **BACKLOG** |

[PR #102](https://github.com/gclp96/zaping/pull/102) MERGED. Integración: `af4fe0d24cff828bad9b85b9ba52e69e95811c1d`. Commit funcional: `28b05820ab077a0b23fc3154d7c5ca6cc1000e5b`. Verificación histórica al cierre de 01B: `main` y HEAD de `docs/hc-dsp-cor-01b-post-merge` coincidían entonces con esa integración; su segundo padre es el commit funcional. 01A integrado por PR #101 (`619c9b6`).

Evidencia histórica comunicada por el responsable: PostgreSQL aislado Persistence **29/29 PASS** y Hardening **37/37 PASS**, con **dos ejecuciones completas consecutivas PASS sin instrumentación** de Hardening; total final **66/66 PASS**. Unitarias 01B **153/153 PASS**. PostgreSQL no se reejecutó en este cierre documental.

Typecheck global de specs: **FAIL, 70 errores preexistentes, sin nuevas localizaciones reportadas**; excepción pendiente de aceptación humana expresa. Intermitencia EQUIPMENT: sin causa raíz confirmada ni resolución demostrada. **RISK-006: OPEN / NOT REPRODUCED. M-HC1: OPEN.** El merge no demuestra resolución ni aceptación formal de estas excepciones y riesgos.

**La corrección operativa de Dispatch no está habilitada.** 01B integra Persistence & Witness, sin endpoints públicos ni writers productivos. No autoriza despliegue, migración real, cutover o activación. **01C-A/B/C: MERGED; 01D: PR #113 OPEN / QA focal PASS / NO MERGE; 01E–01F: BACKLOG**; no se cierra el release operativo.

[PR #105](https://github.com/gclp96/zaping/pull/105) **MERGED** en main: integración **2db5d64596552cb8802cce9c64fac93876dfc251**, funcional **adbbdb63849b4cfd40e7b137f8c7aeacc207ead7**. Verificados en Git local y GitHub. Merge 2026-10-20 16:25:23 America/Hermosillo. **DoD de 01C-A acreditada: DONE / MERGED, 5 SP completados del Target aprobado de 5 SP**, sin reestimación Actual ni horas inferidas.

Evidencia A: **253/253 PASS locales (11 suites)**, build/lint/formato y typecheck focal/productivo PASS reportados; **13/13 PostgreSQL PASS, exit 0**, ejecutados manualmente por el usuario en PostgreSQL 16.15, 127.0.0.1:5436, zaping_hc_dsp_cor_01c_a_test. Primer intento externo: 13 FAIL por INCOMPATIBLE_BUILD y variables Inventory ausentes; repetición con runtime configurado PASS. Codex no ejecutó PostgreSQL. Code Review técnico aprobado en sesión, sin bloqueos funcionales; P2 documental resuelto e integrado. [CI #327](https://github.com/gclp96/zaping/actions/runs/39514031375) sobre adbbdb6 verificado completed/success, jobs API/Web SUCCESS. Detalle de DoD y fuentes en el [ticket 01C](HC_DSP_COR_01C_TICKET.md#cierre-post-merge-de-01c-a--done--merged).

HC-DSP-COR-01C-A/B/C están integrados por PR #105/#109/#112; **01D está en PR #113 OPEN / CODE REVIEW**, con PostgreSQL focal 33/33 PASS y regresión 01C-C 22/22 PASS. Las notas siguientes de refinamiento previo son historia y no sustituyen el estado actual. Autorización de B sobre main@10a5327 (PR #106), rama feat/hc-dsp-cor-01c-b-material-orchestration, **Target 5 SP aprobado**, Started **2026-10-20** (America/Hermosillo). **01C-C REFINEMENT / NOT READY FOR IMPLEMENTATION**, 3 SP preliminares. B Started 2026-10-20 y Merged 2026-10-22, 5 SP de Target aprobado completados; sin Commitment, Forecast, Actual recalculado ni horas inferidas. El [workflow](../engineering/DEVELOPMENT_WORKFLOW.md#241-delivery-incremental-y-preparación-verificable) y los sprints existentes permanecen vigentes.

B incorpora un comando interno sin registro Nest ni caller público: shared fence/PHYSICAL/runtime antes del claim, claim inmutable con resourceId definitivo, locks HC/Case/Dispatch/items, adapter A, proyecciones, mappings y sello 01B en una transacción. **QA PostgreSQL externa del usuario:** primera ejecución 25 PASS / 6 FAIL, exit 1; corrección del lookup B → 01B; repetición focal 2/2 PASS; ejecución completa final **31/31 PASS, 0 skipped, exit code 0**, PostgreSQL 16, 127.0.0.1:5437, zaping_hc_dsp_cor_01c_b_test. Codex no ejecutó PostgreSQL. La impresión manual posterior al primer intento no acreditó PASS.

QA local histórica antes del fix: **847/847 casos únicos PASS en 29 suites**, en dos ejecuciones (711 PASS iniciales + repetición HTTP 136/136 tras EACCES). No reejecutadas sobre la versión corregida. Después del fix: **260/260 PASS, ocho suites afectadas**, con aserciones exactas de filtros Prisma, hash e identidad claim/witness; revalidadas en el Code Review final. Typecheck focal/productivo, ESLint y Prettier PASS tras el fix; esos checks y build API revalidados PASS en este review. Code Review de los once archivos: sin bloqueos funcionales; observación P3 de precisión diagnóstica de fault injection en el [ticket](HC_DSP_COR_01C_TICKET.md#cierre-de-evidencia-y-code-review-final-de-01c-b). [CI #341](https://github.com/gclp96/zaping/actions/runs/39818610916) API/Web SUCCESS y [PR #109](https://github.com/gclp96/zaping/pull/109) MERGED en `main@7ee270b`; B DONE, sin Actual recalculado ni habilitación operativa. La evidencia PG de A permanece separada.

**Integración y QA focal de 01C-C (2026-10-22):** [PR #112](https://github.com/gclp96/zaping/pull/112) **MERGED**, main@8055dba, 5 archivos test-only, 22/22 PostgreSQL PASS y CI API/Web SUCCESS. Primera ejecución 8 PASS / 14 FAIL conservada como historia, dos fixes test-only. RR CREATE guard sigue pendiente de 01E; no cutover ni activación. [Ticket y QA](HC_DSP_COR_01C_TICKET.md#hc-dsp-cor-01c-c--evidencia-de-implementación-test-only-y-qa-focal-2026-10-22). Sin Target/Commitment/Forecast/Actual nuevos; 3 SP preliminares.

**Implementación y QA local de 01D (2026-10-22):** [PR #113](https://github.com/gclp96/zaping/pull/113) **OPEN / CODE REVIEW**, commit funcional `cdce025`, 21 archivos (código, unitarias y E2E). 01D Equipment-only y MIXTO usa adapter específico del registry, cierre compartido con hash y timestamp del root 01B verificados, replay, rollback atómico y condiciones físicas intactas. **PostgreSQL 16 aislado 01D: RUN 2 33/33 PASS** tras corregir sólo un fixture E2E (`custodianDisplayName`); RUN 1 histórico 12 PASS / 21 FAIL. Regresión de 01C-C en otra base limpia **22/22 PASS, exit 0**: **55/55 total local**. Unitarias 271/271 PASS (reporte Codex), TypeScript focal, lint, formato y build API PASS reportados. [Ticket y gates](HC_DSP_COR_01D_TICKET.md). **CI remoto, DoD y merge pendientes**; no rutas públicas ni activación, 01E/01F releases pendientes, RISK-006 OPEN / NOT REPRODUCED.

**Refinamiento 01C-C (2026-10-22, propuesto):** matriz de carreras y DoR en el [ticket](HC_DSP_COR_01C_TICKET.md#hc-dsp-cor-01c-c--refinement--dor-propuesta-2026-10-22). Alcance candidato: corrección vs keys distintas, movimiento físico, RR Create/Cancel/Confirm y fence shared/exclusive, pruebas reales de ambos sentidos, rollback y diagnóstico de locks. RR guard post-corrección continúa en 01E. Sin Target aprobado, sin autorización PostgreSQL ni implementación. La inspección no certifica el orden global.

El orden final de locks requiere validación PostgreSQL real; la inspección no lo aprueba. Adapter hash/fecha interno específico, incluyendo creación/búsqueda/replay de Effects. Product/Batch no elegibles se rechazan; riesgo de vencimiento/desactivación posterior. Replay con autorización actual, misma Company/intención y actor histórico conservado; distinta key tras corrección: conflicto estable. Rechazo íntegro de Equipment ACTIVE, sin parciales ni caller público. No activar hasta integrar 01D/01E/01F.

Forecast / Commitment y tiempos nuevos no establecidos; sin reestimación Actual. A y B registran 5 SP completados cada uno por DoD y merge verificados (Targets de 5 SP aprobados); B Started 2026-10-20 y Merged 2026-10-22; C MERGED 2026-10-22 con 3 SP preliminares y sin Target aprobado. 01D no tiene SP/Target/Actual nuevos aprobados. API de compensación **no habilitada** hasta que 01B–01F estén integrados y aceptados con PostgreSQL real, clientes compatibles, regresiones y revisión humana. Sin cutover de Company real, sin writers externos certificados. **RISK-006: OPEN / NOT REPRODUCED**, causa desconocida; no se acreditó fix.

[Technical Design aprobado](../modules/healthcare/CASE_DISPATCH_CORRECTION_TECHNICAL_DESIGN.md) · [Aprobación 01A](../modules/healthcare/CASE_DISPATCH_CORRECTION_APPROVAL_01A.md) · [Ticket 01B](HC_DSP_COR_01B_TICKET.md).

### M-OX1 — Great Operational Experience (UX)

**Workstream: OPEN.** UX & Workflow V1; OX-SHELL-01A integrado no completa M-OX1 ni inicia otro incremento UX. Los estados Healthcare existentes se conservan.

| Incremento | Estado | Evidencia |
| --- | --- | --- |
| [OX-SHELL-01A — Account Menu & Operational Navigation](OX_SHELL_01A_TICKET.md) | **COMPLETE / MERGED — PR #107** | [PR #107](https://github.com/gclp96/zaping/pull/107); funcional `27a5c6c0c4ab7ecc78cb534aba3cef1e5b802792`; merge `a5b46f1c683a8aa581ef9b295fad2a7ee67e1149`; Merged 2026-10-22. |

UserMenu accesible en AppHeader mínimo persistente desktop/móvil; Cambiar contraseña y Cerrar sesión fuera de Sidebar, que conserva sólo navegación operativa. Ruta /change-password, título, sesión y logout existentes preservados. DEC-OX-049/055/056 aplicadas en este incremento; DEC-OX-050 **parcialmente implementada**. La autorización Stage 3 fue específica de este slice; sin Company selector, notificaciones, calendario, perfil editable ni capacidades adicionales de Top Bar.

QA local posterior a los fixes: **111/111 PASS**, ocho suites; typecheck, ESLint, build, formato focal y whitespace PASS. **QA manual PASS reportado por el usuario**. Code Review realizado; **P2-01 CLOSED / P2-02 CLOSED**. [CI #333](https://github.com/gclp96/zaping/actions/runs/39746006362): **API SUCCESS / Web SUCCESS**; integración verificada en origin/main.

**Deuda independiente: focus trap completo del drawer OPEN**, conservada en [UX Improvement Backlog](../ux/UX_IMPROVEMENT_BACKLOG.md#4-accesibilidad--drawer). No se cierra por el merge de OX-SHELL-01A. [CURRENT del shell](../ux/UX_DECISIONS.md#4-appshell-v2) actualizado documentalmente.

Started 2026-10-21; Merged 2026-10-22. **5 SP preliminares**, sin Target/Forecast/Commitment/Actual, velocidad ni Sprint 01 asignados. Sin horas inventadas ni imputación al Sprint 1 histórico de Healthcare; no se modifican sus métricas o estados.

Este documento representa el estado operativo actual del proyecto.

Debe responder principalmente:

qué está implementado;

qué está validado;

qué trabajo está activo;

qué sigue;

qué bloquea un release;

qué deuda técnica permanece;

cuál es la siguiente decisión correcta para avanzar Zaping.

Los detalles históricos de implementación y snapshots antiguos deben conservarse en:

docs/project/CHANGELOG.md

y no duplicarse dentro de este Board.

POST-ACCEPTANCE BASELINE

Canonical branch: `main`

Canonical baseline: `fbf29b6`

PR #3: MERGED

Post-merge CI: PASS

ERP Core V1: CLOSED / ACCEPTED — local V1 baseline

DEV-NEXT-03B — ERP Core V1 Local Acceptance: COMPLETED / PASS

Manual role matrix: ADMIN / MANAGER / SALES / WAREHOUSE — PASS

QA-001 through QA-008: CLOSED / PASS

HC-NEXT-01C1 through C7: CLOSED / MERGED

HC-NEXT-01C8: CLOSED / MERGED / ACCEPTED

HC-NEXT-01: CLOSED / ACCEPTED

PR #14 / HC-NEXT-01C8: MERGED

OPS-RC-B5B: CLOSED

OPS-RC-B5C real staging acceptance: DEFERRED / READY WHEN NEEDED

No staging or production deployment is claimed by this baseline.

IMPLEMENTED / VALIDATED

ERP Core

├── Authentication / JWT foundation
├── Users V1 administration
├── Authenticated App Shell
├── Navigation
├── UX-01 App Shell v2 / frontend foundations
│ ├── semantic tokens
│ ├── layout primitives
│ ├── responsive Sidebar / AppHeader
│ ├── authenticated Home V1
│ └── Categories normalization
├── Dashboard 2.0
├── Customers V1
├── Suppliers V1
├── Products / Categories V1
├── Inventory Movement Ledger V1
├── Equipment V1
├── Quotes V1
├── Sales V1
├── Purchases V1
│ ├── Purchase 360 canonical detail
│ ├── folio navigation to /purchases/:id
│ ├── timezone-aware date filters
│ └── legacy purchaseId compatibility redirect
├── Purchase Receipts V1
│ ├── partial / full receiving
│ ├── lot tracking
│ ├── idempotency
│ ├── Inventory IN
│ ├── Equipment provisioning
│ └── cross-module traceability
├── Secure password recovery
├── Authorization + Tenant Isolation V1
│ ├── fixed-role ERP Core authorization
│ ├── tenant-safe reads and mutations
│ ├── cross-company relation hardening
│ └── frontend role-aware UX / 403 handling
└── Healthcare Case Foundation

CURRENT

M-HC1 — Healthcare Operations Foundation

├── HC-NEXT-03A — Healthcare Equipment Assignment Domain Discovery
│ └── COMPLETE / DOCUMENTED
└── HC-NEXT-03B — Healthcare Equipment Assignment Technical Design
├── COMPLETE / APPROVED
├── HC-NEXT-03B.1 Persistence & Availability Design — APPROVED / DOCUMENTED
├── HC-NEXT-03B.2 API / DTO / Authorization Contract — APPROVED / DOCUMENTED
└── HC-NEXT-03B.3 Implementation Slicing / Acceptance Contract — APPROVED / DOCUMENTED

HC-NEXT-03C1 — Equipment Assignment Persistence / Migration
└── COMPLETE / MERGED

HC-NEXT-03C2 — Assignment Backend Base
└── COMPLETE / MERGED

RECENTLY COMPLETED

└── Requirements
├── DOMAIN DISCOVERY COMPLETE / DOCUMENTED
├── TECHNICAL DESIGN APPROVED
├── PERSISTENCE / BACKEND / FRONTEND COMPLETE / MERGED
└── ACCEPTANCE COMPLETE / ACCEPTED

Frontend UX workstream

├── UX-01 Foundations / App Shell v2
│ └── COMPLETED / VALIDATED
│
└── UX-02 DataTable / operational lists
├── COMPLETE / VALIDATED
├── DataTable para listas operativas
└── StaticTable para detalle/documentación

CURRENT

HC-NEXT-03C3 — Availability / Conflict Review / Concurrency
→ COMPLETE / MERGED

HC-NEXT-03C4 — Replace / Release / Parent Integrations
→ COMPLETE / MERGED
→ Manual Release HC-LOCK-03B COMPLETE / MERGED IN main@8a3b189
→ Replace backend COMPLETE / MERGED
→ Requirement Retire C4-C1 COMPLETE / MERGED IN main@3e1810f
→ Case Cancel C4-C2 COMPLETE / MERGED IN main@f429e9f

HC-LOCK-01 — Company Lock Protocol ADR
→ ARCHITECTURE ACCEPTED
→ DONE — ARCHITECTURE / DOCUMENTATION ACCEPTED
→ V1 IMPLEMENTATION COMPLETE THROUGH HC-LOCK-02/03/04
→ STAGING / PRODUCTION APPROVAL NOT CLAIMED

RECENTLY COMPLETED / NEXT

HC-LOCK-02 / HC-LOCK-03B / HC-LOCK-04
→ PROTOCOL CONSOLIDATED / MANUAL RELEASE MERGED
→ HC-LOCK-04 FINAL CLOSED / ACCEPTED IN main@be73bc4

HC-NEXT-03C4-C parent integrations
→ C4-C1 REQUIREMENT RETIRE COMPLETE / MERGED IN main@3e1810f
→ C4-C2 CASE CANCEL COMPLETE / MERGED IN main@f429e9f

HC-NEXT-03C5-A — Contract Alignment & Safe PostgreSQL Harness
→ COMPLETE / MERGED — PR #36 + #37 — main@5ec9f67

HC-NEXT-03C6-A — Case Equipment Assignments Read-only View
→ COMPLETE / MERGED — PR #38 — main@8a67d5a — Actual 25-sep-2026

HC-NEXT-03C6-B — Create Assignment UI
→ COMPLETE / MERGED — PR #40 — main@4805128 — Actual 25-sep-2026

HC-NEXT-03C6-C — Release Assignment UI
→ COMPLETE / MERGED — PR #42 — main@9bade4d — Actual 25-sep-2026

HC-NEXT-03C6-D — Replace Assignment UI
→ COMPLETE / MERGED — PR #45 — main@99efc5a — Actual 25-sep-2026

HC-NEXT-03C6-E — Requirement-linked Assignment UI
→ COMPLETE / MERGED — PR #47 — main@a1f0fee — Actual 27-sep-2026

HC-OPS-01A — CaseKit Draft & Contents
→ COMPLETE / MERGED — PR #50 — main@bb530e8 — Actual 27-sep-2026

HC-OPS-01A.1 — Draft Item Exclusion
→ COMPLETE / MERGED — PR #53 — main@54a5d79 — Actual 28-sep-2026

HC-OPS-01B — Preparation Confirmation & Readiness
→ COMPLETE / MERGED — PR #56 — main@478e0f0 — DoD PASS — DoR COMPLETE — stale-item blocker RESOLVED by 01A.1 — no SP, Forecast or Commitment

HC-NEXT-03C5-B — Integrated Backend Validation
→ COMPLETE / DoD PASS / MERGED — B0 COMPLETE / MERGED — PR #57 — main@1be994d — DoD PASS; B1 COMPLETE / MERGED — PR #58 — main@9504cdd — DoD PASS; B2 COMPLETE / MERGED — PR #59 — main@dac9794 — DoD PASS; B3 COMPLETE / VALIDATED / MERGED — PR #60 — main@ad19dcf — CI PASS

HC-NEXT-03C5-COVERAGE — CoverageNote / Aggregated Coverage Backend
→ COMPLETE / MERGED / CONTRACT APPROVED / REQUIRED BEFORE C6 SLICES THAT DEPEND ON COVERAGE

DEFERRED

OPS-RC-B5C — real staging acceptance
→ READY WHEN NEEDED; not executed by this baseline

PRE-PILOT / PRE-PRODUCTION OPERATIONAL GATES

Antes de pilot/commercial production deben resolverse o verificarse formalmente
los pendientes operativos. No reabren la aceptación local de ERP Core V1:

real password-recovery email delivery/configuration

staging acceptance when OPS-RC-B5C is reactivated

backup / restore provider validation

formal pilot acceptance evidence

Authorization + Tenant Isolation V1:

IMPLEMENTED / VALIDATED

ERP Core funcional y su cierre B2:

≠
production-ready

1. Propósito del Project Board

El Project Board representa exclusivamente el estado vigente del trabajo.

Separación documental:

PROJECT_BOARD.md

→ estado actual
→ prioridades
→ trabajo activo
→ siguiente trabajo
→ blockers
→ deuda

ROADMAP.md

→ dirección futura
→ secuencia estratégica
→ evolución de producto

CHANGELOG.md

→ historia de trabajo completado
→ entregas anteriores
→ snapshots históricos

El Project Board no debe convertirse en un historial de implementación.

2. Estado general de Zaping

Zaping Platform
│
├── ERP Core
│ ├── Foundation estable
│ ├── Comercial V1 operativo
│ ├── Compras / Recepciones operativas
│ ├── Inventario transaccional
│ ├── Equipment Core
│ ├── trazabilidad entre módulos
│ └── V1 CLOSED / ACCEPTED — local baseline
│
├── Healthcare
│ ├── Case Foundation implementado
│ ├── Equipment boundary definido
│ └── operational workflows TARGET
│
├── Radar
│ └── producto futuro
│
└── AI
└── evolución futura

3. ERP Core — Estado actual

Dominio

Estado vigente

Companies

✅ IMPLEMENTED

Identity & Access

✅ AUTH + USERS + PASSWORD SECURITY + ROLE AUTHORIZATION + TENANT ISOLATION V1 IMPLEMENTED / VALIDATED

Dashboard

✅ IMPLEMENTED / VALIDATED

Customers

✅ V1 IMPLEMENTED / VALIDATED

Suppliers

✅ V1 IMPLEMENTED / VALIDATED

Products

✅ V1 IMPLEMENTED / VALIDATED

Categories

✅ IMPLEMENTED / VALIDATED

Inventory

✅ Movement Ledger V1 IMPLEMENTED / VALIDATED

Equipment

✅ Equipment V1 IMPLEMENTED / VALIDATED

Quotes

✅ V1 IMPLEMENTED / VALIDATED

Sales

✅ V1 IMPLEMENTED / VALIDATED sobre modelo Sale CURRENT

Purchases

✅ V1 IMPLEMENTED / VALIDATED

Purchase Receipts

✅ V1 IMPLEMENTED / VALIDATED

Returns

⏳ P1 DEFERRED — diseño/persistencia parcial; backend operacional no CURRENT

Audit

⏳ FUTURE foundation

Healthcare Cases

✅ Foundation backend IMPLEMENTED / VALIDATED

4. Trabajo cerrado recientemente

H7 — ERP Core Functional Normalization

Estado: ✅ COMPLETED / VALIDATED

Incluye:

Authenticated App Shell

Navigation

Dashboard

Customers

Suppliers

Products

Inventory

Equipment

Quotes

Sales

Purchases

Purchase Receipts

Subfases finales:

H7A0
→ Sales detail deep-link

H7A
→ Quotes normalization
→ Quote → Sale handoff

H7B
→ Purchases normalization

Resultado:

ERP Core functional normalization
→ COMPLETED

Purchase Receipts V1

Estado: ✅ IMPLEMENTED / VALIDATED

Implementado:

Purchase Receipt creation

partial receiving

full receiving

lot tracking

InventoryBatch integration

Product.stock increment

InventoryMovement IN

EquipmentAsset provisioning for ASSET Products

idempotency

receipt detail

cross-module traceability

dedicated frontend

Contrato idempotente:

Idempotency-Key +
companyId +
PURCHASE_RECEIPT_CREATE

Comportamiento:

same key + same payload
→ replay same Receipt

same key + different payload
→ 409 Conflict

same key + another Company
→ independent identity

La idempotencia de Purchase Receipts ya no es deuda funcional.

Permanece como deuda de QA:

real simultaneous PostgreSQL concurrency test

Equipment V1

Estado: ✅ IMPLEMENTED / VALIDATED

Incluye:

EquipmentAsset identity

automatic assetCode

serialNumber

normalized serial key

lifecycle

condition

origin

manual creation

Purchase Receipt provisioning

inspection

retirement

current availability

detail frontend

search / filters

deep-link

Lifecycle:

ACTIVE

RETIRED

Condition:

GOOD

INSPECTION_PENDING

DAMAGED

OUT_OF_SERVICE

Origin:

MANUAL

PURCHASE_RECEIPT

IMPORT

INITIAL_MIGRATION

Current Availability:

ACTIVE + GOOD
→ available

INSPECTION_PENDING
→ unavailable

DAMAGED
→ unavailable

OUT_OF_SERVICE
→ unavailable

RETIRED
→ unavailable

Availability representa únicamente hechos actualmente implementados en Equipment Core.

No representa todavía:

Case Assignment

Custody

Maintenance

Calibration

Case conflicts

Dispatch

Return

5. Customers / Suppliers

Customers

Estado: ✅ IMPLEMENTED / VALIDATED

Lifecycle:

active by default
↓
DELETE
↓
isActive = false

DELETE representa desactivación y no hard delete.

Reglas actuales:

active list

historical detail preserved

historical Quotes preserved

historical Sales preserved

Customer activo para nuevas Quotes/Sales:

backend validation
→ IMPLEMENTED

Pendiente:

reactivation workflow

inactive-record administration

Suppliers

Estado: ✅ IMPLEMENTED / VALIDATED

Lifecycle equivalente:

active
↓
deactivate
↓
isActive = false

Las Purchases históricas conservan su Supplier.

Pendiente:

backend validation of active Supplier
for new / edited Purchase

La ausencia de esta validación permanece deuda de integridad.

6. Products

Estado: ✅ IMPLEMENTED / VALIDATED

Campos principales:

SKU

name

description

brand

category

barcode

cost

price

stock

minStock

isActive

inventoryTracking

lotTracking

Inventory tracking:

QUANTITY

SERIALIZED

ASSET

Lot tracking:

NONE

OPTIONAL

REQUIRED

Reglas actuales:

Product.stock
→ no se modifica mediante Product CRUD

Product creation
→ stock inicial gestionado por backend

tracking
→ no se modifica arbitrariamente después de existir historia operacional

DELETE
→ deactivation

Pendiente:

Product 360

reactivation

formal tracking migration workflow

imports

future unit-of-measure model

Healthcare Product Profile

Deuda de integridad relacionada con Purchases:

active Product backend validation
for new / edited Purchase

7. Inventory

Estado: ✅ Movement Ledger V1 IMPLEMENTED / VALIDATED

Frontend:

Inventory

├── Existencias

└── Movimientos

Movement types CURRENT:

IN

OUT

ADJUSTMENT

Trazabilidad:

referenceType

referenceId

balance

unitCost

Product

createdAt

Flujos principales:

Purchase Receipt
→ InventoryMovement IN

Sale approval
→ InventoryMovement OUT

Pendiente:

backend pagination

server-side search / filtering

date-range filtering

server-side reference filtering

manual adjustment workflow review

multi-warehouse

locations

transfers

physical counts

barcode / QR

Location, Position e internal TRANSFER están aprobados como capacidades
TARGET de Advanced Inventory, pero no son CURRENT.

No son CURRENT.

8. Quotes

Estado: ✅ V1 IMPLEMENTED / VALIDATED

Estados:

DRAFT

CONFIRMED

CANCELLED

Funcionalidad:

create

list

search

status filter

detail from current loaded data

approve

cancel

PDF

Quote → Sale conversion

Conversión:

POST /sales/from-quote/:quoteId

El backend devuelve la Sale creada con:

id

folio

Frontend handoff:

Quote
↓
Convert to Sale
↓
Venta creada correctamente
↓
/sales?saleId=<Sale.id>

Deuda vigente:

historical converted Quote
→ convertedToSale is known
→ original Sale identity is not exposed

Por lo tanto una Quote histórica convertida todavía no puede navegar a su Sale original.

También permanece deuda futura:

dedicated GET /quotes/:id strategy
for server-side pagination/deep-link robustness

9. Sales

Estado: ✅ V1 IMPLEMENTED / VALIDATED

Estados principales:

DRAFT

CONFIRMED

CANCELLED

Folios:

V-000001

V-000002

...

Generados mediante:

CompanySequence

key = SALE_FOLIO

Flujo:

Create Sale
→ DRAFT
→ no stock mutation

Approve
→ CONFIRMED
→ Product.stock decrement
→ InventoryMovement OUT

Cancel DRAFT
→ CANCELLED
→ no stock mutation

Generic Sales eligibility:

inventoryTracking === QUANTITY

AND

lotTracking !== REQUIRED

Productos incompatibles con Sales genérico son rechazados por backend.

Deep-link:

/sales?saleId=<id>

Pendiente:

Sale create idempotency

confirmed Sale reversal

generic DRAFT edit only if product requirements justify it

pagination

server-side filtering

required-lot fulfillment

ASSET / SERIALIZED fulfillment

SalesOrder / Delivery TARGET architecture

payments

invoice

10. Purchases

Estado: ✅ V1 IMPLEMENTED / VALIDATED

Estados:

DRAFT

CONFIRMED

PARTIALLY_RECEIVED

RECEIVED

CANCELLED

Funcionalidad:

create

edit DRAFT

approve

cancel DRAFT

Purchase 360 canonical detail

folio navigation to /purchases/:id

PDF

search

status filter

Supplier filter

Desde / Hasta date filter with Company.timezone

Receipt creation

Receipt history

partial receiving

full receiving

deep-link

Deep-link:

/purchases/:id

Legacy compatibility:

/purchases?purchaseId=<id>
→ /purchases/<id>

Este redirect es temporal y no representa una segunda UI de detalle.

Deuda:

active Supplier backend validation

active Product backend validation

pagination

server-side filtering

future cleanup of legacy purchaseId compatibility redirect

11. Purchase Receipts

Estado: ✅ V1 IMPLEMENTED / VALIDATED

Documento canónico:

docs/modules/erp/PURCHASE_RECEIPTS.md

Flujo:

Purchase CONFIRMED / PARTIALLY_RECEIVED
↓
PurchaseReceipt
↓
PurchaseReceiptItem
├── Product.stock increment
├── InventoryMovement IN
├── InventoryBatch when applicable
└── EquipmentAsset for ASSET Product
↓
Purchase PARTIALLY_RECEIVED / RECEIVED

Lot tracking implementado:

NONE

OPTIONAL

REQUIRED

Equipment provisioning:

QUANTITY
→ no EquipmentAsset

SERIALIZED
→ no EquipmentAsset currently

ASSET
→ one EquipmentAsset per unit received

Frontend:

/purchase-receipts

/purchase-receipts/<id>

Cross-module navigation:

Purchase → Receipt

Receipt → Purchase

Receipt → Inventory

Receipt → Equipment

Deuda:

real simultaneous PostgreSQL idempotency race QA

SERIALIZED receipt semantics

Receipt PDF

Receipt correction / cancellation / reversal

server-side pagination / filtering

Product.stock ↔ EquipmentAsset reconciliation

12. Identity & Access

Estado: ✅ AUTH + USERS + PASSWORD SECURITY + ROLE AUTHORIZATION + TENANT ISOLATION V1 IMPLEMENTED / VALIDATED

Implementado:

JWT

JwtStrategy

JwtAuthGuard

RolesGuard where configured

companyId tenant context

ValidationPipe

ValidationPipe:

whitelist = true

forbidNonWhitelisted = true

transform = true

Endpoints principales:

/auth/register

/auth/login

/auth/me

/users

/users/:id

SEC-001 — Authentication Response Sanitization

Estado: ✅ COMPLETED / VERIFIED

Regla:

API response
→ no passwordHash exposure

La deuda histórica de exposición de passwordHash en register/login fue resuelta.

No debe mantenerse como riesgo activo.

SEC-002 — Default ADMIN / Safe Role Provisioning Review

Estado: ✅ COMPLETED / VERIFIED

Resuelto para el código vigente:

User.role
→ no @default(ADMIN)

Company sign-up

→ first ADMIN explicit

Users V1 create

→ ADMIN-only

→ explicit role required

SEC-003 — Inactive User Enforcement

Estado: ✅ COMPLETED / VERIFIED

Implementado:

User.isActive = false
→ login rejected

JWT vigente
→ revalidated against DB on subsequent requests

role current
→ loaded from DB for protected requests

AUTH-USERS-V1 — Users V1 Administration

Estado: ✅ COMPLETE

Closed checkpoints:

ERP-V1-CLOSE-B1C-A

ERP-V1-CLOSE-B1C-B

ERP-V1-CLOSE-B1C-C

Implementado:

GET /users

GET /users/:id

POST /users

PATCH /users/:id

No DELETE /users.

ADMIN-only, tenant-safe, no passwordHash in responses.

SEC-004 — Tenant Isolation Regression

Estado: ✅ CLOSED / VERIFIED
Prioridad: P0

Validado en B2D:

```text
Company A
→ cannot read/write Company B resources

tenant-safe list/detail/mutation behavior
→ validated across critical ERP modules

mixed-tenant relations
→ rejected without business side effects

final tenant predicates
→ validated for sensitive writes
```

La cobertura automatizada es la evidencia de este cierre; no se presenta como
penetration testing.

SEC-005 — Secure Password Recovery

Estado: ✅ IMPLEMENTED / VERIFIED
Prioridad: P0

Workstream:

AUTH-PASSWORD-SECURITY-V1
→ IMPLEMENTED

El reset inseguro anterior fue retirado.

Estado actual:

secure recovery
→ IMPLEMENTED / VERIFIED

/forgot-password
→ recovery request with generic response

/reset-password
→ one-time token password reset

El flujo vigente cubre:

recovery request

secure random token

hashed token persistence

30-minute expiration

single-use atomic consumption

pending-token invalidation after password reset

password change authVersion invalidation

JWT revocation after password change/reset

safe response semantics

no account enumeration

auth session invalidation through authVersion

email delivery through Resend

token/plaintext/reset URL/password/passwordHash excluded from logs

Frontend coverage:

/forgot-password

/reset-password?token=...

La implementación fue validada en B1D-D2/D3. El snapshot cuantitativo de B2D
se conserva como evidencia histórica, anterior al gate pre-merge B5B.10.

Permanecen como validación operativa posterior:

real email delivery/configuration verification:
verified sender/domain, valid RESEND_API_KEY, EMAIL_FROM and
FRONTEND_BASE_URL, plus real forgot → email → reset → login E2E

staging acceptance when B5C is reactivated.

La matriz manual de roles fue completada por DEV-NEXT-03B con ADMIN, MANAGER,
SALES y WAREHOUSE en PASS; no forma parte de la validación operativa pendiente.

SEC-006 — Authentication Abuse Protection / Rate Limiting

Estado: ✅ IMPLEMENTED / VALIDATED — operational QA pending
Prioridad: P0 preproduction / B3

Endpoints sensibles como:

/auth/login

/auth/register

POST /auth/forgot-password

POST /auth/reset-password

deben contar con protección básica contra abuso antes de producción.

Debe definirse según arquitectura:

rate limiting

retry / lockout policy where appropriate

monitoring

safe error responses

No aplicar una estrategia de lockout que permita denegación de servicio trivial sin análisis.

Debe cubrir también cualquier otro endpoint auth-sensitive aprobado por la
política final.

La configuración de `@nestjs/throttler` y su cobertura focal fueron integradas
en B3B1. El pendiente restante es la verificación operativa en el entorno de
staging cuando OPS-RC-B5C sea reactivado.

SEC-007 — Protected Route / Session Architecture

Estado: ✅ IMPLEMENTED / VALIDATED — operational QA pending
Prioridad: P0 preproduction

CURRENT frontend utiliza:

(app) route group

AppShell

JWT stored client-side

axios interceptor

401 clear / redirect

El contrato de bootstrap de sesión, deep-link protegido, ausencia de flash,
redirect 401 y preservación ante network/5xx quedó validado en B3B4.

La aceptación operativa debe confirmar:

session bootstrap

protected deep-link refresh

protected-page flash

logout consistency

unauthenticated navigation behavior

storage strategy before production

JWT en localStorage sigue siendo la estrategia CURRENT y debe revisarse como
decisión operativa antes de producción; no es un blocker de implementación
pendiente en este baseline.

SEC-008 — Critical Authorization Review

Estado: ✅ CLOSED / VERIFIED
Prioridad: P0

Validado en B2D:

```text
JwtAuthGuard + RolesGuard + @Roles(...)

fixed-role matrix for ADMIN / MANAGER / SALES / WAREHOUSE

server-side business authorization

no frontend-only authorization assumptions

401 / 403 / 404 / 400 semantics
```

El frontend role-aware es UX; el backend mantiene la autoridad.

SEC-009 — Production Secrets / Configuration Review

Estado: ✅ IMPLEMENTED / VALIDATED — real provider QA pending
Prioridad: P0 preproduction

Debe verificarse:

JWT_SECRET / secrets management

production environment variables

no committed credentials

safe environment separation

production database configuration

debug/dev settings disabled where appropriate

CORS / environment-specific origins reviewed

La configuración fail-closed, CORS por entorno y la separación de variables
quedaron validadas en B3B2. El gate operativo todavía exige
sender/domain verificado, `RESEND_API_KEY`, `EMAIL_FROM` y
`FRONTEND_BASE_URL` válidos, y una prueba real forgot → email → reset → login.

DEPENDENCY AUDIT NOTE

La alerta de `deepmerge-ts` vía `@prisma/config` / Prisma tooling fue
remediada con un override compatible y la actualización correspondiente del
lockfile en OPS-RC-B5B.10B1 (`bac9ab5`, override `^8.0.1`). No queda como
blocker de este baseline; el mantenimiento periódico de dependencias continúa.

B2D VALIDATION SNAPSHOT

```text
Backend: 60 suites / 628 tests PASS
Frontend: 54 files / 653 tests PASS bounded
Frontend: 54 files / 653 tests PASS serial
Backend build/lint: PASS
Frontend build/lint: PASS
Prisma validate/status: PASS
25 migrations found; database schema up to date
```

Authorization + Tenant Isolation V1 quedó `CLOSED / IMPLEMENTED`. La cobertura
validó autenticación, role denial, aislamiento de listados/detalles/mutaciones,
relaciones mixtas, ausencia de side effects en rechazos cross-tenant, predicados
finales, semántica de errores y preservación de sesión ante `403`.

El blocker `RC-DATA` de posible lost update en
`InventoryService.createMovement` fue resuelto mediante control de concurrencia
y su regresión quedó integrada antes del merge de PR #1.

13. Release Readiness

QA-CORE — Commercial Core Regression

Estado: ✅ COMPLETED / PASS — DEV-NEXT-03B
Prioridad: P0

La aceptación local del ERP Core V1 cerró la regresión comercial y la matriz
manual de roles. La evidencia canónica se conserva en
`docs/project/ERP_CORE_V1_LOCAL_ACCEPTANCE.md`:

critical business flows

tenant isolation

authorization

lifecycle

folios

stock effects

movement references

PDFs

deep-links

idempotency replay/conflict

historical deactivation behavior

Resultado final:

```text
API: 65 suites / 705 tests PASS
Web: 57 files / 696 tests PASS — stable one-worker strategy
API/Web lint, typecheck and production build: PASS
Web production routes: 22 / 22
Git diff checks: PASS
```

Este cierre es aceptación local, no aceptación de staging ni despliegue de
producción. Los gates operativos pre-piloto permanecen separados en §0 y §12.

14. Returns

RET-004 — Returns Backend

Estado: ⏳ DEFERRED
Prioridad: P1 estratégica

Diseño existente:

RET-001 Functional Design
→ completed

RET-002 Prisma Design
→ completed

RET-003 Schema + Migration
→ completed

Backend operacional:

RET-004
→ pending

Returns no es blocker P0 para el cierre funcional del ERP Core V1 actual.

Debe evolucionar coordinadamente con la futura separación:

SalesOrder
↓
Delivery
↓
Commercial Return
↓
Inspection / Disposition
↓
Inventory

Debe distinguirse siempre:

Commercial Return
≠
Healthcare CaseReturn

Evitar profundizar nuevas dependencias físicas sobre Sale CURRENT.

15. Sales Evolution

SALES-REF — SalesOrder + Delivery

Estado: ⏳ TARGET
Prioridad: P1 estratégica

Arquitectura objetivo:

Quote
↓ optional
SalesOrder
↓
Delivery
↓
Inventory OUT

Debe separar:

commercial commitment
≠
physical fulfillment

Scope futuro:

SalesOrder

SalesOrderItem

Delivery

DeliveryItem

partial deliveries

pending quantities

batch allocation

Quote conversion

Commercial Returns integration

legacy migration

CURRENT continúa siendo:

Sale

hasta que exista una migración formal.

16. Inventory Evolution

INV-FEFO

Estado: ⏳ PENDING
Prioridad: P1

Objetivo:

First Expired
First Out

INV-EXP

Estado: ⏳ PENDING
Prioridad: P1

Incluye:

expired inventory

near-expiration inventory

operational availability

alerts

Dashboard integration

Advanced Inventory — DESIGNED / APPROVED TARGET — NOT IMPLEMENTED

Necesidades futuras:

Multi-Warehouse

Locations

Positions

Internal Transfers / custody semantics

Serialized operational tracking

Physical Counts

Barcode / QR

Prioridad general:

P2

salvo cuando una capacidad sea prerequisite para un workflow P0/P1.

Advanced Inventory cuenta con diseño aprobado y permanece no implementado.
La fuente canónica es:

```text
docs/modules/erp/ADVANCED_INVENTORY.md
```

Backlog aprobado:

| ID          | Item                           | Estado                                                                        |
| ----------- | ------------------------------ | ----------------------------------------------------------------------------- |
| INV-WH-001  | Branch / Warehouse foundation  | 🎯 TARGET                                                                     |
| INV-LOC-001 | Storage Locations              | 🎯 TARGET                                                                     |
| INV-LOC-002 | Inventory by Location          | 🎯 TARGET                                                                     |
| INV-LOC-003 | Preferred Storage Location     | 🎯 TARGET                                                                     |
| INV-LOC-004 | Receipt Put-away               | 🎯 TARGET                                                                     |
| INV-LOC-005 | Internal Relocation            | 🎯 TARGET                                                                     |
| INV-TRF-001 | Warehouse Transfers            | 🎯 TARGET                                                                     |
| INV-RES-001 | Inventory Reservations         | 🎯 TARGET                                                                     |
| INV-CNT-001 | Physical / Cycle Counts        | 🎯 TARGET                                                                     |
| INV-SCN-001 | Location QR / Barcode          | 🎯 TARGET                                                                     |
| INV-LED-001 | Inventory Ledger V2            | 🎯 TARGET                                                                     |
| EQ-AVL-001  | Derived Equipment Availability | ✅ IMPLEMENTED / VALIDATED in Core; location/custody evolution remains TARGET |
| EQ-MNT-001  | Equipment Maintenance          | 🎯 TARGET                                                                     |

Estos items no implican ejecución inmediata, versión ni fecha de entrega.

17. Healthcare — Estado actual

Milestone: M-HC1 — Healthcare Operations Foundation

Estado: ACTIVE — P1

Prioridad: P1 estratégica

Healthcare Case Foundation está IMPLEMENTED / VALIDATED.

EquipmentAsset / Equipment V1 está IMPLEMENTED / VALIDATED en ERP Core y
constituye la identidad física que Healthcare consumirá sin duplicarla.

Modelo actual:

HealthcareCase

id

companyId

folio

title

procedureDescription?

status

scheduledStart?

scheduledEnd?

responsibleUserId?

createdById

cancelledAt?

cancelledById?

cancellationReason?

createdAt

updatedAt

Lifecycle Foundation CURRENT:

DRAFT

SCHEDULED

CANCELLED

Reglas:

scheduledStart exists
→ SCHEDULED

scheduledStart absent
→ DRAFT

CANCELLED
→ terminal in Foundation

Folio:

CASE-000001

Generado mediante:

CompanySequence

key = HEALTHCARE_CASE_FOLIO

API:

POST /healthcare/cases

GET /healthcare/cases

GET /healthcare/cases/:id

PATCH /healthcare/cases/:id

POST /healthcare/cases/:id/cancel

Foundation no incluye:

Hospital

Doctor

Case Requirements

Equipment Assignment

Case Availability

Preparation

CaseKit

Dispatch

Custody

CaseReturn

Healthcare material inspection

Reconciliation

Billing

Insurance

Patient records

Clinical records

Reliability debt:

Healthcare Case creation idempotency
→ NOT IMPLEMENTED

Un retry después de una respuesta exitosa perdida puede crear otro Case y consumir otro folio.

18. Healthcare — capability cerrado y orden TARGET

HC-NEXT-01C1 a C7 están CLOSED / MERGED en `main`: persistencia, masters,
affiliations, integración HealthcareCase, hardening backend, frontend de masters
y selectors/duplicate-review UX. HC-NEXT-01C8 completó la acceptance automatizada
y manual y está CLOSED / MERGED / ACCEPTED.

Estado HC-NEXT-01: `CLOSED / ACCEPTED`

ADMIN, MANAGER, SALES y WAREHOUSE están PASS.

Durante QA, el 500 inicial de Healthcare Case correspondió a la migration
pendiente `20260910194524_add_healthcare_doctors_hospitals` en la base Docker QA
`zaping_qa`. `prisma migrate deploy` corrigió ese drift de ambiente; no fue un
defecto de producto y QA continuó satisfactoriamente.

Requirements domain discovery está COMPLETE / DOCUMENTED, el technical design
está APPROVED, persistence/backend/frontend están COMPLETE / MERGED y la
acceptance automatizada y manual está COMPLETE / ACCEPTED. La matriz ADMIN,
MANAGER, SALES y WAREHOUSE quedó PASS.

`RequirementOperationalEvidencePolicy` existe, pero la integración con un
producer real de fulfillment permanece diferida hasta futuros dominios como
Dispatch, Equipment Assignment o Custody.

HC-NEXT-03A — Equipment Assignment Domain Discovery está COMPLETE / DOCUMENTED.
El contrato canónico vive en `docs/modules/healthcare/EQUIPMENT_ASSIGNMENT.md`.
Assignment normalmente resuelve una Requirement de equipo, admite asignación
directa urgente trazable y mantiene separados Assignment, Dispatch, Custody,
Inventory Movement y lifecycle/condition. Cobertura y Availability son
derivadas; los conflictos se muestran como warnings y cualquier override exige
autorización, justificación y auditoría. HC-NEXT-03C1 Persistence / Migration y
HC-NEXT-03C2 Assignment Backend Base están COMPLETE / MERGED.

HC-NEXT-03B está COMPLETE / APPROVED. HC-NEXT-03B.1 Persistence & Availability Design está
APPROVED / DOCUMENTED en
`docs/modules/healthcare/EQUIPMENT_ASSIGNMENT_TECHNICAL_DESIGN.md`: una fila por
activo, lifecycle mínimo, origin/lineage, buffers Company-scoped, overlap sin DB
hard block, composite FKs y estrategia concurrente de revalidación. El diseño
permite Assignment con schedule incompleto como disponibilidad pendiente,
define el release derivado de reservas `REQUIREMENT` como objetivo de la Parent
Integration y evita over-coverage mediante validación de dominio, usando
`DIRECT` para extras.
HC-NEXT-03B.2 API / DTO / Authorization Contract está APPROVED / DOCUMENTED:
recurso top-level, DTOs allowlisted, review 200/no-write con fingerprint,
Create/Replace/Release, fixed-role RBAC, errores estables, idempotencia y
atomicidad. HC-NEXT-03B.3 Implementation Slicing / Acceptance Contract está
APPROVED / DOCUMENTED con la secuencia C1–C7, gates por slice y acceptance A–P.
HC-NEXT-03C1 Equipment Assignment Persistence / Migration, HC-NEXT-03C2
Assignment Backend Base, HC-NEXT-03C3 Availability / Conflict Review /
Concurrency y HC-NEXT-03C4 Replace / Release / Parent Integrations están COMPLETE
/ MERGED. El protocolo Company-first, ambas Parent Integrations y HC-LOCK-04
final están integrados/aceptados; C6-A–C6-E están COMPLETE / MERGED y C5-B
permanece pendiente con B0 COMPLETE / MERGED — PR #57 — main@1be994d — DoD PASS.

Secuencia planeada de alto nivel para M-HC1:

1. Hospital / Doctor

2. Requirements

3. Equipment Assignment

4. Case Availability

5. CaseKit / Maletín DRAFT

6. Architecture gate for physical logistics

7. Dispatch / Custody

8. Return / Reconciliation

9. Calendar

10. Case 360

11. Mobile technician experience

CaseKit DRAFT precede Dispatch y no crea movimiento, reserva física ni custodia.
El gate previo a Dispatch / Custody debe resolver physical positioning,
custody, location y transfer semantics mediante diseño/ADR explícito si es
necesario. No bloquea Hospital / Doctor, Requirements, Equipment Assignment ni
Case Availability ni HC-OPS-01A, y no implica ejecutar todo Advanced Inventory
dentro de M-HC1 o del mismo slice.

Principios:

Healthcare
→ consumes ERP Core EquipmentAsset

Equipment Assignment / Custody
≠
EquipmentLifecycle

Healthcare no debe duplicar la identidad física de Equipment.

19. Otros P1 estratégicos

IMP-001 — Data Import

Estado: ⏳ PENDING

Customers

Suppliers

Products

Inventory

CSV

XLSX

UX-360 — 360 Views

Estado: ⏳ PARTIAL / ACTIVE

Product 360

Customer 360

Supplier 360

Purchase 360
✅ COMPLETED / CLOSED

SalesOrder 360 TARGET

Equipment 360

Case 360

UX-DASH — Action Dashboard Evolution

Estado: ⏳ TARGET

Dirección:

Attention
↓
Action
↓
KPIs
↓
Trends

Dashboard CURRENT ya está implementado.

Esta tarea representa evolución posterior, no carencia del Dashboard actual.

UX-SEARCH — Global Search

Estado: ⏳ PENDING

Debe respetar:

tenant

permissions

resources

context

AUTH-PERM — Permission-Based RBAC

Estado: ⏳ DEFERRED P1

Evolución:

UserRole
↓
RolesGuard

hacia:

Role
↓
Permissions
↓
PermissionsGuard

AUD-001 — Audit Foundation

Estado: ⏳ PENDING

Primera fase conceptual:

AuditEvent

AuditService

tenant

actor

action

resource

safe metadata

append-only

critical integrations

20. Future Products

Zaping Radar

Estado: 🔮 FUTURE

Dirección inicial:

public procurement

healthcare opportunities

Sonora

Baja California

Baja California Sur

Nuevo León

Sinaloa

Zaping AI

Estado: 🔮 FUTURE

Principio:

AI debe construirse sobre dominios confiables, workflows explícitos y datos trazables.

No debe competir actualmente con la estabilización del ERP Core ni con la construcción posterior del dominio Healthcare.

21. Technical Debt Consolidated

La siguiente deuda permanece vigente y debe revisarse periódicamente.

Security / Release

B3 security implementation — CLOSED / VALIDATED

real password-recovery email delivery/configuration

OPS-RC-B5C staging acceptance — DEFERRED / READY WHEN NEEDED

backup / restore provider validation

Reliability / Integrity

Sales create idempotency

Healthcare Case create idempotency

real concurrent Purchase Receipt PostgreSQL idempotency test

Product.stock ↔ EquipmentAsset reconciliation

SERIALIZED receipt semantics

inactive Supplier validation
for new / edited Purchase

inactive Product validation
for new / edited Purchase

historical Quote → Sale identity

Scalability

backend pagination

server-side search / filtering

Inventory date filtering

Inventory reference filtering server-side

Purchase deep-link pagination compatibility

Quote detail/deep-link pagination compatibility

Equipment pagination / bulk availability if later required

Equipment

serial correction / edit workflow

manual batch selector

retired actor display/name resolution

Product.stock ↔ EquipmentAsset reconciliation

Lifecycle

Product reactivation

Customer reactivation

Supplier reactivation

inactive-record administration

Product tracking migration workflow

Purchase Receipts

Receipt PDF

Receipt correction / cancellation / reversal

real concurrent idempotency PostgreSQL QA

Frontend / Architecture

Inventory tabs primitive decision

Modal accessibility / focus management

drawer complete focus trap

branch/context selector / notifications / global search

collaboration

global pagination strategy

frontend test worker resource exhaustion under parallel pool

22. Riesgos activos

RISK-001 — Security Hardening

Riesgos vigentes:

B2 Authorization + Tenant Isolation V1
→ CLOSED / VERIFIED

B3 security implementation
→ CLOSED / VALIDATED

remaining operational validation: real Resend delivery and staging acceptance
when OPS-RC-B5C is reactivated

passwordHash exposure ya no forma parte de este riesgo.

Mitigación:

complete the remaining operational validation before pilot / commercial
production release

RISK-002 — Legacy Sales Architecture

Actualmente Sale concentra responsabilidades comerciales y parte del fulfillment físico.

Objetivo TARGET:

SalesOrder
≠
Delivery

Mitigación:

avoid deepening physical workflows directly inside Sale

hasta diseñar la evolución correspondiente.

RISK-003 — Returns Legacy Dependency

Commercial Returns depende parcialmente del modelo actual de Sales.

Mitigación:

defer operational expansion

-

coordinate with SalesOrder / Delivery evolution

RISK-004 — Equipment / Inventory Dual Truth

Actualmente existen:

Product.stock

-

EquipmentAsset records

Para Products ASSET, ambas representaciones no deben evolucionar como fuentes físicas independientes.

Mitigación:

define formal reconciliation/invariant strategy
before broader automation

RISK-005 — Product Scope Growth

Evitar desarrollar simultáneamente:

ERP

Healthcare

Radar

AI

Portal

Mobile

Billing

Prioridad actual:

stable ERP Core

-

differentiated Healthcare workflows after Core closure

### RISK-006 — Equipment custody-close timestamp guard

Estado: **OPEN / NOT REPRODUCED**. Root cause: **UNKNOWN / NOT VERIFIED**.
Rechazo histórico intermitente del guard temporal/coherencia de cierre Equipment:
84 PASS / 1 FAIL en PostgreSQL; ocurrió durante Confirm inicial, antes del replay.
Los operandos de ese fallo no se retuvieron. Corrección funcional: **NONE**.

Evidencia posterior: 5 aislados PASS; 2 core PASS (81 seleccionados cada uno);
2 completos PASS (85 cada uno); cierre sin instrumentación previo 85/0/0;
core QA 81/0/4 y final QA **85/0/0** del checkpoint 2026-10-18, sin instrumentación. Todos los
límites Material se ejecutaron en los completos. No se observó inversión en las
capturas diagnósticas; no se demuestra causa timezone/precisión/mocks/fixtures.

La decisión de merge de PR #99 aceptó el riesgo residual documentado, bajo seguimiento
QA. RISK-006 permanece OPEN; reabrir la investigación ante evidencia reproducible.
Los PASS posteriores no sustituyen el fallo histórico ni significan que fue corregido.
No se introduce diagnóstico productivo ni automatización. Evidencia histórica en TD §20
y estado post-merge en TD §21.

23. Definition of Done

Una tarea no está completada únicamente porque:

code compiles

Según corresponda deberá incluir:

business rules approved

architecture review

implementation

migration when required

tests

lint

build

tenant isolation

authorization

manual QA

security review

documentation

CHANGELOG update

git health

24. Estados

✅ COMPLETED

→ terminado y validado

🟢 IN PROGRESS

→ trabajo activo

🟡 READY / PARTIAL

→ listo para comenzar o parcialmente implementado

⏳ PENDING

→ aprobado pero no implementado

⛔ BLOCKER

→ debe resolverse antes del gate indicado

🔎 VERIFY

→ requiere verificación

🎯 TARGET

→ dirección aprobada no implementada

🔮 FUTURE

→ dirección posterior

25. Prioridades

P0

→ security

→ integrity

→ release blocker

P1

→ strategic commercial capability

P2

→ important expansion

Future

→ long-term direction

26. Orden de trabajo inmediato

CURRENT

ERP Core V1 CLOSED / ACCEPTED; M-HC1 ACTIVE.

→ HC-NEXT-01C1-C7 CLOSED / MERGED

→ HC-NEXT-01C8 CLOSED / MERGED / ACCEPTED — AUTOMATED + MANUAL PASS

→ HC-NEXT-01 CLOSED / ACCEPTED

→ Requirements Domain Discovery COMPLETE / DOCUMENTED

→ Requirements Technical Design APPROVED

→ Requirements Persistence / Backend / Frontend COMPLETE / MERGED

→ Requirements Acceptance COMPLETE / ACCEPTED — ADMIN / MANAGER / SALES /
WAREHOUSE PASS

CURRENT ROADMAP ITEM

→ HC-NEXT-03C4 Healthcare Equipment Assignment Replace / Release / Parent Integrations — COMPLETE / MERGED — HC-LOCK-04 FINAL CLOSED / ACCEPTED

→ HC-NEXT-03C5-A Contract Alignment & Safe PostgreSQL Harness — COMPLETE / MERGED — PR #36 + #37 — main@5ec9f67
→ HC-NEXT-03C6-A Case Equipment Assignments Read-only View — COMPLETE / MERGED — PR #38 — main@8a67d5a — Actual 25-sep-2026
→ HC-NEXT-03C6-B Create Assignment UI — COMPLETE / MERGED — PR #40 — main@4805128 — Actual 25-sep-2026
→ HC-NEXT-03C6-C Release Assignment UI — COMPLETE / MERGED — PR #42 — main@9bade4d — Actual 25-sep-2026
→ HC-NEXT-03C6-D Replace Assignment UI — COMPLETE / MERGED — PR #45 — main@99efc5a — Actual 25-sep-2026
→ HC-NEXT-03C6-E Requirement-linked Assignment UI — COMPLETE / MERGED — PR #47 — main@a1f0fee — Actual 27-sep-2026
→ HC-OPS-01A CaseKit Draft & Contents — COMPLETE / MERGED — PR #50 — main@bb530e8 — Actual 27-sep-2026
→ HC-OPS-01A.1 Draft Item Exclusion — COMPLETE / MERGED — PR #53 — main@54a5d79 — Actual 28-sep-2026
→ HC-OPS-01B Preparation Confirmation & Readiness — COMPLETE / MERGED — PR #56 — main@478e0f0 — DoD PASS — DoR COMPLETE
→ HC-NEXT-03C5-B Integrated Backend Validation — COMPLETE / DoD PASS / MERGED — B0 COMPLETE / MERGED — PR #57 — main@1be994d — DoD PASS; B1 COMPLETE / MERGED — PR #58 — main@9504cdd — DoD PASS; B2 COMPLETE / MERGED — PR #59 — main@dac9794 — DoD PASS; B3 COMPLETE / VALIDATED / MERGED — PR #60 — main@ad19dcf — CI PASS
→ HC-NEXT-03C5-COVERAGE — COMPLETE / MERGED / CONTRACT APPROVED / REQUIRED BEFORE C6 SLICES THAT DEPEND ON COVERAGE
→ HC-CASE-AVL — Case Availability — COMPLETE / MERGED
→ HC-CASE-AVL-R — Derived Case Availability Read — Backend — COMPLETE / MERGED — PR #69 — main@59d5aae — DoD PASS — TARGET 5 SP
→ HC-CASE-AVL-UI — Case Availability Summary — Frontend — COMPLETE / MERGED — PR #71 — main@e56970d — DoD PASS — TARGET 3 SP

DEFERRED

→ OPS-RC-B5C real staging acceptance — READY WHEN NEEDED

SECUENCIA ESTRATÉGICA M-HC1

Hospital / Doctor
↓
Requirements
↓
Equipment Assignment
↓
Case Availability
↓
architecture gate for physical logistics
↓
Dispatch / Custody
↓
Return / Reconciliation
↓
CaseKit / Maletín
↓
Calendar
↓
Case 360
↓
Mobile Technician

27. Calidad post-acceptance y snapshot histórico

Baseline vigente: `a4434a6`, merge de PR #3. DEV-NEXT-03B cerró la aceptación
local ERP Core V1 con ADMIN, MANAGER, SALES y WAREHOUSE en PASS; QA-001 a
QA-008 quedaron CLOSED / PASS. La evidencia detallada vive en
`docs/project/ERP_CORE_V1_LOCAL_ACCEPTANCE.md`.

Snapshot final DEV-NEXT-03B:

```text
API: 65 suites / 705 tests PASS
Web: 57 files / 696 tests PASS — one worker
API/Web lint, typecheck and production build: PASS
Web production routes: 22 / 22
Git diff checks: PASS
```

Esto no acredita staging ni producción. Real Resend, OPS-RC-B5C,
backup/restore con proveedor real y la aceptación formal de piloto/release
siguen como gates operativos separados.

Snapshot histórico al cierre de ERP-V1-CLOSE-B2D:

```text
Backend: 60 suites / 628 tests PASS
Frontend: 54 files / 653 tests PASS bounded
Frontend: 54 files / 653 tests PASS serial
Backend build/lint: PASS
Frontend build/lint: PASS
Prisma validate/status: PASS
25 migrations found; database schema up to date
```

Este snapshot es histórico de B2D y valida la regresión completa de autorización
y tenant isolation de ese cierre. Los controles B3 y la corrección RC-DATA fueron
integrados posteriormente. La matriz manual de roles se completó en
DEV-NEXT-03B; Resend real y staging permanecen separados.

El full Vitest pool puede presentar agotamiento de workers/recursos en ejecución paralela.

Si ocurre:

parallel infrastructure/resource failure
≠
application test failure

La suite completa puede ejecutarse con workers limitados o de forma serial para
obtener un resultado confiable.

Los conteos de B2D no representan el total actual de tests; cualquier nuevo
snapshot cuantitativo debe basarse en su propia ejecución y evidencia.

28. Fuente de verdad por dominio

ERP UX
→ docs/modules/erp/ERP_UI_UX.md

Purchase Receipts
→ docs/modules/erp/PURCHASE_RECEIPTS.md

Equipment
→ docs/modules/erp/EQUIPMENT.md

Inventory
→ docs/modules/erp/INVENTORY.md

Advanced Inventory target design
→ docs/modules/erp/ADVANCED_INVENTORY.md

Sales
→ docs/modules/erp/SALES.md

Identity / Access
→ docs/modules/erp/IDENTITY_ACCESS.md

Security
→ docs/engineering/SECURITY_PRINCIPLES.md

Healthcare boundaries
→ docs/modules/healthcare/HEALTHCARE.md

Healthcare domain model
→ docs/modules/healthcare/DOMAIN_MODEL.md

Healthcare Case
→ docs/modules/healthcare/CASES.md

Architecture
→ docs/architecture/

Project state
→ docs/project/PROJECT_BOARD.md

Future direction
→ docs/project/ROADMAP.md

Historical delivery record
→ docs/project/CHANGELOG.md

29. B2E close conditions

Estado: ✅ CLOSED / VERIFIED

Condiciones documentales verificadas al cierre B2E:

primary documentation reviewed

cross-document CURRENT / TARGET / FUTURE sync

Authorization + Tenant Isolation V1 reflected

B3 gates and the then-open RC-DATA finding reflected (both superseded by the
post-merge baseline above)

PROJECT_BOARD final sync

ROADMAP / root README security wording checked if needed

Markdown consistency reviewed

git status --short reviewed

git diff --check PASS

no secrets / credentials / .env backup committed

only intended documentation changes present

Esta lista conserva la evidencia documental del cierre B2E; los checks fueron
completados antes de la integración de PR #1.

30. Principio final

Este documento debe poder responder siempre:

¿Cuál es el siguiente trabajo correcto para avanzar Zaping hoy?

Respuesta vigente:

ERP Core V1
→ CLOSED / ACCEPTED in canonical `main` at `a4434a6`

OPS-RC-B5B
→ CLOSED

DEV-NEXT-03B
→ COMPLETED / PASS

M-HC1 — Healthcare Operations Foundation
→ ACTIVE — P1

HC-NEXT-01C1-C7 — Doctors/Hospitals capability slices
→ CLOSED / MERGED

HC-NEXT-01C8 — Integrated Acceptance & Regression Gate
→ CLOSED / MERGED / ACCEPTED — AUTOMATED + MANUAL ACCEPTANCE PASS

HC-NEXT-01
→ CLOSED / ACCEPTED

Requirements
→ DOMAIN DISCOVERY COMPLETE / DOCUMENTED
→ TECHNICAL DESIGN APPROVED
→ PERSISTENCE / BACKEND / FRONTEND COMPLETE / MERGED
→ ACCEPTANCE COMPLETE / ACCEPTED

HC-NEXT-03A — Healthcare Equipment Assignment Domain Discovery
→ COMPLETE / DOCUMENTED

HC-NEXT-03B — Healthcare Equipment Assignment Technical Design
→ COMPLETE / APPROVED

HC-NEXT-03B.1 Persistence & Availability Design
→ APPROVED / DOCUMENTED

HC-NEXT-03B.2 API / DTO / Authorization Contract
→ APPROVED / DOCUMENTED

HC-NEXT-03B.3 Implementation Slicing / Acceptance Contract
→ APPROVED / DOCUMENTED

HC-NEXT-03C1 Equipment Assignment Persistence / Migration
→ COMPLETE / MERGED

HC-NEXT-03C2 Assignment Backend Base
→ COMPLETE / MERGED

HC-NEXT-03C3 Availability / Conflict Review / Concurrency
→ COMPLETE / MERGED

HC-NEXT-03C4 Replace / Release / Parent Integrations
→ COMPLETE / MERGED
→ MANUAL RELEASE HC-LOCK-03B COMPLETE / MERGED — PR #31
→ REPLACE BACKEND COMPLETE / MERGED — PR #27
→ REQUIREMENT RETIRE C4-C1 COMPLETE / MERGED IN main@3e1810f
→ CASE CANCEL C4-C2 COMPLETE / MERGED IN main@f429e9f — PR #33

Healthcare Equipment Assignment implementation
→ PARTIALLY IMPLEMENTED — BACKEND C1–C4 COMPLETE / MERGED
→ C5-A COMPLETE / MERGED — PR #36 + #37 — main@5ec9f67
→ C6-A READ-ONLY VIEW COMPLETE / MERGED — PR #38 — main@8a67d5a
→ C6-B CREATE UI COMPLETE / MERGED — PR #40 — main@4805128
→ C6-C RELEASE UI COMPLETE / MERGED — PR #42 — main@9bade4d
→ C6-D REPLACE UI COMPLETE / MERGED — PR #45 — main@99efc5a
→ C6-E REQUIREMENT-LINKED ASSIGNMENT UI COMPLETE / MERGED — PR #47 — main@a1f0fee
→ HC-OPS-01A CASEKIT DRAFT & CONTENTS — COMPLETE / MERGED — PR #50 — main@bb530e8 — Actual 27-sep-2026
→ HC-OPS-01A.1 DRAFT ITEM EXCLUSION — COMPLETE / MERGED — PR #53 — main@54a5d79 — Actual 28-sep-2026
→ HC-OPS-01B PREPARATION CONFIRMATION & READINESS — COMPLETE / MERGED — PR #56 — main@478e0f0 — DoD PASS — DOR COMPLETE
→ C5-B COMPLETE / DoD PASS / MERGED — B0 COMPLETE / MERGED — PR #57 — main@1be994d — DoD PASS; B1 COMPLETE / MERGED — PR #58 — main@9504cdd — DoD PASS; B2 COMPLETE / MERGED — PR #59 — main@dac9794 — DoD PASS; B3 COMPLETE / VALIDATED / MERGED — PR #60 — main@ad19dcf — CI PASS; C5-COVERAGE REFINED / CONTRACT APPROVED

OPS-RC-B5C real staging acceptance
→ DEFERRED / READY WHEN NEEDED

Advanced Inventory
→ DESIGNED / APPROVED TARGET — NOT IMPLEMENTED — P2

No staging or production deployment is claimed by this baseline. ERP Core V1
continúa abierto a evoluciones futuras como SalesOrder + Delivery, Commercial
Returns, FEFO, Expiration, Audit, Permission-Based RBAC, Data Import, Advanced
Inventory y Billing / CFDI, sin reabrir por ello su aceptación local V1.

### HC-NEXT-03C4-C — Equipment Assignment Parent Integrations

Estado: COMPLETE / MERGED — C4-C1 AND C4-C2 IN MAIN — HC-LOCK-04 FINAL CLOSED / ACCEPTED
Prioridad: P1
Milestone: M-HC1 — Healthcare Operations Foundation
Sprint candidato: HC-01
Estimación: 8 SP — PROVISIONAL
Commitment: NO ESTABLECIDO

Baseline vigente: main @ be73bc4
PR #27: MERGED
PR #31 / Manual Release HC-LOCK-03B: MERGED
Replace: INTEGRADO EN MAIN
HC-NEXT-03C4: COMPLETE / MERGED — C4-C1 y C4-C2 integrados

Objetivo:
Liberar de forma atómica las reservas lógicas aplicables cuando se
cancela un Healthcare Case o se retira una Requirement.

Alcance:

- Case cancellation: liberar Assignments RESERVED del Case con
  releaseCause = CASE_CANCELLED.
- Requirement retire: liberar sólo Assignments RESERVED de origen
  REQUIREMENT asociadas a la Requirement, con
  releaseCause = REQUIREMENT_WITHDRAWN.
- Case cancellation libera `DIRECT` y `REQUIREMENT`; Requirement retire preserva
  `DIRECT`. Ambos conservan historial.
- Compartir Prisma.TransactionClient entre el comando padre y sus releases.
- Mantener autorización, respuestas públicas y aislamiento tenant.
- No crear InventoryMovement, Return ni cambios de Custody.

Dependencias de Definition of Ready:

- [ADR-HC-LOCK-001](../architecture/adr/ADR-HC-LOCK-001-healthcare-company-scoped-transaction-coordination.md)
  aprobado como arquitectura; no como implementación o readiness productiva.
- HC-LOCK-02 consolidó el protocolo V1 y sus timeouts.
- HC-LOCK-03B está integrado en `main` @ 8a3b189.
- HC-LOCK-04 final está CLOSED / ACCEPTED sobre `main@be73bc4` después de
  integrar y validar los releases derivados.

Gates:
Pruebas focales, rollback íntegro, concurrencia real en PostgreSQL,
regresiones de Cases/Requirements/C3, autorización, tenant isolation,
API tests, lint, typecheck, build y git diff --check.

Finding relacionado de cierre C4:
La discrepancia entre el contrato documentado de Release manual repetido y el
comportamiento del servicio quedó resuelta, validada e integrada en HC-LOCK-03B.
C4 quedó completado al integrar ambas Parent Integrations y aceptar el checkpoint
final de HC-LOCK-04.

### HC-NEXT-03C4-C1 — Requirement Retire Parent Integration

Estado: COMPLETE / MERGED IN `main@3e1810f`
Prioridad: P1
Milestone: M-HC1 — Healthcare Operations Foundation
Baseline: main @ 8a3b189
Integración: main @ 3e1810f

Objetivo:
Retirar una Requirement y liberar en la misma transacción todas sus Equipment
Assignments `RESERVED` de origen `REQUIREMENT`, preservando historial y el
contrato público existente.

Scope:

- Reutilizar el `Prisma.TransactionClient` del comando padre.
- Orden obligatorio: `Company → Case → Requirement → Assignments por ID ASC`.
- Revalidar tenant, Case, Requirement, origin y lifecycle bajo lock.
- Persistir `REQUIREMENT_WITHDRAWN`, actor del comando, `retirementReason`
  normalizada como `releaseReason` y un timestamp compartido con `retiredAt`.
- Mantener el replay de Requirement `RETIRED` como HTTP 200 zero-write, sin
  reparación de Assignments históricas.
- Rollback conjunto ante cualquier fallo; cero reservas aplicables es válido.
- No crear idempotency claims de Assignment ni efectos físicos.

Dependencias / DoR:

- HC-LOCK-02 y HC-LOCK-03 integrados en `main`.
- HC-LOCK-04 prerequisite checkpoint acreditado.
- Enum, relaciones e índice tenant-scoped existentes; no requiere migración.
- Contrato funcional y transaccional aprobado en
  `EQUIPMENT_ASSIGNMENT.md`, sección 13.2.
- DoR: READY.

Acceptance Criteria:

- Una, múltiples o cero reservas aplicables se resuelven atómicamente.
- `DIRECT`, otros parents/tenants y filas históricas permanecen intactas.
- Replay no escribe ni sobrescribe auditoría.
- Create/Replace/Manual Release concurrentes observan el estado confirmado del
  ganador sin filas parciales.
- Fallos de write/readback revierten Requirement y releases.
- RBAC, tenant isolation, errores y respuesta HTTP del padre no cambian.
- No hay Inventory Movement, Return ni Custody.

Pruebas requeridas:

- Unitarias focales de Requirements y Assignment service/repository.
- Regresiones controller/RBAC y respuesta pública.
- PostgreSQL E2E determinista de transición, replay, aislamiento, rollback y
  carreras Create/Replace/Manual Release contra Retire en ambos órdenes.
- Aserciones de ausencia de claims y efectos físicos.
- Typecheck, lint, Prettier, build y `git diff --check`.

Evidencia de cierre técnico:

- Jest focal: 429/429 PASS.
- Typecheck, ESLint, Prettier focal, API build y `git diff --check`: PASS.
- PostgreSQL E2E C4-C1: 13/13 PASS, exit 0; 14 pruebas skipped por el filtro;
  ejecución en la base aislada `zaping_spike_test`.
- El teardown elimina sólo fixtures de los Company IDs del run, refresca el
  registro de Assignments/claims, verifica conteos cero y propaga fallos de
  cleanup o desconexión. El exit 0 acredita ese alcance, no una base globalmente
  vacía ni readiness productiva.
- Revisión final: sin schema, migraciones, rutas, DTOs, claims derivados ni
  efectos físicos nuevos.

Definition of Done:

- Implementación transaction-bound sin nested transaction ni llamada HTTP
  interna.
- AC y gates locales/PostgreSQL PASS con evidencia verificable.
- Sin schema, migraciones, rutas, DTOs ni contratos nuevos.
- Documentación y board alineados.

Fuera de alcance:
Case Cancel Parent Integration C4-C2, reparación histórica, frontend, Dispatch,
Return, Custody, Inventory Movement y cambios de disponibilidad física.

Dependencia de cierre:
C4-C1 alimentó el checkpoint final de HC-LOCK-04, completado después de integrar
Case Cancel C4-C2 y ejecutar las regresiones de Parent Integrations.

### HC-NEXT-03C4-C2 — Case Cancel Parent Integration

Estado: COMPLETE / MERGED IN `main@f429e9f`
Prioridad: P1
Milestone: M-HC1 — Healthcare Operations Foundation
Baseline: main @ 3e1810f
Implementación integrada: `88cdea1`; PR #33 merged en `main@f429e9f`

Objetivo:
Cancelar un Healthcare Case y liberar en la misma transacción todas sus Equipment
Assignments `RESERVED`, tanto `DIRECT` como `REQUIREMENT`, preservando historia y
el contrato público existente.

Scope:

- Reutilizar el `Prisma.TransactionClient` del comando padre y las primitivas
  internas de C4-C1; sin nested transaction ni llamada a Manual Release público.
- Orden obligatorio: `Company → Case → Assignments por ID ASC`.
- Revalidar tenant, Case y lifecycle bajo lock; aplicar updates condicionales y
  rollback conjunto.
- Persistir `CASE_CANCELLED`, actor del comando, `cancellationReason` persistida
  sin normalización adicional como `releaseReason` y un timestamp compartido
  entre `cancelledAt` y `releasedAt`.
- Mantener replay `CANCELLED` como HTTP 409 zero-write, sin reparación histórica.
- Cero reservas aplicables es válido; no crear claims ni efectos físicos.

Dependencias / DoR:

- C4-C1 y sus primitivas están integradas en `main@3e1810f`.
- HC-LOCK-02 y HC-LOCK-03 están integrados.
- HC-LOCK-04 prerequisite estaba acreditado para el DoR; el checkpoint final está
  CLOSED / ACCEPTED en `main@be73bc4`.
- Enum, relaciones e índice tenant-scoped existentes; no requiere migración.
- Contrato funcional y transaccional aprobado en `EQUIPMENT_ASSIGNMENT.md`,
  sección 13.3, y alineado con `CASES.md`.
- DoR: READY.

Acceptance Criteria:

- Una, múltiples o cero reservas `DIRECT`/`REQUIREMENT` se liberan atómicamente
  con la auditoría aprobada.
- Otros Cases/tenants y filas `RELEASED`/`REPLACED` permanecen intactas.
- Replay devuelve 409 y no escribe ni sobrescribe auditoría.
- Create/Replace/Manual Release/Requirement Retire concurrentes observan el
  estado confirmado del ganador sin filas parciales.
- Fallos de write/readback revierten Case y releases.
- Endpoint, DTO, HTTP, RBAC ADMIN/MANAGER, tenant isolation, errores y respuesta
  pública directa del padre no cambian.
- No hay claims, Inventory Movement, Return, Custody ni cambios físicos.

Pruebas requeridas:

- Unitarias focales de Cases y Assignment service/repository.
- Regresiones controller/RBAC, validación, status y respuesta pública.
- PostgreSQL E2E determinista de transición, replay, aislamiento, rollback y
  carreras Create/Replace/Manual Release/Requirement Retire contra Cancel en
  ambos órdenes.
- Aserciones de ausencia de claims y efectos físicos.
- Typecheck, lint, Prettier, build y `git diff --check`.

Definition of Done:

- Implementación transaction-bound sin nested transaction ni llamada HTTP
  interna.
- AC y gates locales/PostgreSQL PASS con evidencia verificable.
- Sin schema, migraciones, rutas, DTOs ni contratos nuevos.
- Documentación y board alineados con la evidencia final.
- Parent Integrations integradas y regresiones conjuntas ejecutadas; checkpoint
  final de HC-LOCK-04 acreditado.

Evidencia técnica e integración:

- Jest focal: 346/346 PASS.
- Typecheck, `lint:check`, Prettier focal, API build y `git diff --check`: PASS.
- PostgreSQL/HTTP E2E focal sobre `zaping_spike_test`: 16/16 PASS, 26 skipped
  por filtro, exit 0. La selección ejecutó 15 escenarios C4-C2 y la regresión
  C4-C1 que preserva Assignments `DIRECT` al retirar una Requirement.
- El teardown elimina sólo fixtures asociados a los Company IDs del run,
  comprueba conteos cero y propaga fallos de cleanup mediante `AggregateError`.
- No hay evidencia de schema/migraciones, claims derivados, efectos físicos ni
  cambios del contrato HTTP público.
- C4-C2 quedó integrado mediante PR #33 en `main@f429e9f`.

Fuera de alcance:
Reparación histórica, Case reopening, Case Availability, frontend, Dispatch,
Return, Custody, Inventory Movement, cambios de disponibilidad física y nuevas
capacidades de Manual Release, Replace o Requirement Retire.

Dependencia de cierre:
El checkpoint final de HC-LOCK-04 está CLOSED / ACCEPTED sobre
`main@be73bc4`, después de integrar C4-C2 y validar ambas Parent Integrations.

### HC-LOCK-01 — Healthcare Company Lock Architecture Decision

Estado: DONE — ARCHITECTURE / DOCUMENTATION ACCEPTED

Objetivo:
Persistir la decisión de coordinación transaccional Company-scoped y alinear sus
fuentes documentales canónicas.

Entregable:

- [ADR-HC-LOCK-001 — Healthcare Company-Scoped Transaction Coordination](../architecture/adr/ADR-HC-LOCK-001-healthcare-company-scoped-transaction-coordination.md).
- Alineación de
  [Equipment Assignment Technical Design](../modules/healthcare/EQUIPMENT_ASSIGNMENT_TECHNICAL_DESIGN.md).

Límite:
La aceptación del ADR por sí sola no aprobaba implementación, producción ni
deployment. La implementación V1 y la validación integrada se completaron en
HC-LOCK-02/03/04; staging, deployment y aprobación para producción permanecen
como gates separados.

### HC-LOCK-02 — Stable Company Lock Protocol Consolidation

Estado: COMPLETE / MERGED — main @ e002453

Objetivo:
Consolidar la implementación V1 del protocolo común, incluida la derivación
estable SHA-256/`bigint`, vectores deterministas, parametrización segura,
adopción por participantes y política de timeouts que no debilite límites
heredados.

Dependencias:

- HC-LOCK-01 define la arquitectura aceptada.
- Debe completarse antes de considerar integración o rollout productivo.

### HC-LOCK-03 — Manual Release Refinement and Implementation

Estado: HC-LOCK-03B COMPLETE / MERGED — main @ 8a3b189; FINAL REGRESSION ACCEPTED IN main@be73bc4

Objetivo:
Refinar e implementar Manual Release con orden
`Company → EquipmentAsset → Assignment`, idempotencia por estado y key/payload,
y resolver las decisiones de dominio/API diferidas expresamente por
ADR-HC-LOCK-001.

Dependencias:

- HC-LOCK-01 para el contrato arquitectónico.
- HC-LOCK-02 para la implementación estable del protocolo.

No incluye los releases derivados de Case Cancel o Requirement Retire.

Evidencia de validación de HC-LOCK-03B:

- Jest focal de Release: 177/177 PASS.
- Typecheck, build, ESLint, Prettier focal y `git diff --check`: PASS.
- PostgreSQL/HTTP real aislado: 14/14 PASS, exit 0, sobre
  `zaping_spike_test` en `127.0.0.1:5434` con usuario dedicado, ejecutado en
  `fix/hc-lock-04-jwt-isolation@9cc76ce` e integrado mediante PR #34.
- El cleanup acreditado se limita a los fixtures propiedad de la ejecución: el
  `afterAll` ejecuta cleanup acotado por sus Company IDs y verifica conteos cero;
  el exit 0 confirma que ese hook terminó sin error. No acredita una base globalmente
  vacía ni readiness productiva.

### HC-LOCK-04 — Company Lock Integration and Regression QA

Estado: CLOSED / ACCEPTED — FINAL CHECKPOINT ACCREDITED IN `main@be73bc4`

Objetivo:
Validar sobre PostgreSQL y HTTP el protocolo consolidado, rollback, contención,
esperas acotadas, aislamiento multi-tenant, contrato 503 y regresiones.

La ejecución se separa en dos checkpoints dentro del mismo ticket:

1. **Prerequisite protocol QA — ACCREDITED:** validó HC-LOCK-02 y Manual Release
   B4-B1 con 14/14 E2E PostgreSQL/HTTP PASS, exit 0, en
   `fix/hc-lock-04-jwt-isolation@9cc76ce`.
2. **Final integrated QA — ACCREDITED:** Parent Integrations 2H ejecutó 28/28
   PASS, exit 0, sobre `main@f429e9f`, cubriendo Case Cancel y Requirement
   Retire dentro de la frontera transaccional final y sus regresiones.

Dependencias:

- HC-LOCK-02 para el protocolo consolidado.
- HC-LOCK-03 para los escenarios finales de Manual Release.
- HC-NEXT-03C4-C implementado para ejecutar el checkpoint integrado final; no
  para el prerequisite protocol QA.

El diff `f429e9f..be73bc4` sólo modifica el E2E de Manual Release —66 inserciones
y 32 eliminaciones, `diff --check` PASS— para aislar el JWT efímero. No cambia
producción; por ello las ejecuciones 2H y B4-B1 son equivalentes respecto de la
baseline productiva final. La aceptación no acredita staging, producción ni una
base globalmente vacía. Ambas ejecuciones fueron focales: no acreditan pruebas no
seleccionadas ni sustituyen los gates posteriores de C5.

### Relación con Parent Integrations

HC-NEXT-03C4-C se completó como entregable funcional separado: C4-C1 está
integrado en `main@3e1810f` y C4-C2 en `main@f429e9f`. Ambos alimentaron el
checkpoint final de HC-LOCK-04 aceptado en `main@be73bc4`. Dispatch, Return,
Custody e Inventory Movement permanecen fuera de este workstream.

Ambos harnesses eliminaron y verificaron en cero sólo sus fixtures propios y
propagaron fallos de cleanup. Esta evidencia no afirma limpieza global de
`zaping_spike_test`.

### HC-NEXT-03C5 — Backend Hardening / Integrated E2E

Decisiones aprobadas:

- **DEC-C5-01:** `HealthcareEquipmentRequirementCoverageNote` y la cobertura
  agregada quedan fuera de C5. Se entregarán en el ticket backend independiente
  HC-NEXT-03C5-COVERAGE antes de cualquier slice C6 que dependa de cobertura; su
  contrato funcional aún está pendiente.
- **DEC-C5-02:** C5 se divide en C5-A Contract Alignment & Safe PostgreSQL
  Harness y C5-B Integrated Backend Validation.
- **DEC-C5B-01:** APROBADA: C5-B usa un rol dedicado `zaping_hc_c5b`. El refinamiento por sí
  mismo no autorizó provisioning; el checkpoint posterior acredita rol y ACL
  mínimos y gate real PASS.
- **DEC-C5B-02:** APROBADA: el error sanitizado se acredita con evidencia compuesta: los
  unitarios prueban el mapping Prisma estable; 2H prueba fallos PostgreSQL reales
  y su respuesta HTTP sanitizada con auth guard de test; una prueba C5-B
  representativa probará el pipeline HTTP con JWT real y un error Prisma
  controlado. La combinación no demuestra un fallo PostgreSQL nativo y JWT real
  en la misma petición ni reabre los timeouts de HC-LOCK-04.
- **DEC-C5B-03:** APROBADA: el harness actualizará directamente el fixture persistido de
  Case y verificará por List/Detail HTTP el recálculo de disponibilidad. No usa ni
  acredita Case Update API o concurrencia durante la reprogramación.
- HC-LOCK-04 permanece CLOSED / ACCEPTED y no se reabre sin un defecto concreto.

#### HC-NEXT-03C5-A — Contract Alignment & Safe PostgreSQL Harness

Estado: COMPLETE / MERGED — PR #36 + #37 — `main@5ec9f67`

Dependencias satisfechas:

- baseline de inicio `main@5d33cb0`, integración mediante PR #36 y cierre
  documental mediante PR #37 en `main@5ec9f67`;
- HC-NEXT-03C1–C4 COMPLETE / MERGED;
- HC-LOCK-04 final CLOSED / ACCEPTED sobre la baseline productivamente
  equivalente `main@be73bc4`;
- matriz C1–C4 y divergencias B.1/B.2/B.3 refinadas.
- harness C1 endurecido en `85b480d` y corrección diagnóstica/SQL integrada en
  `02d7a6e`.

Alcance:

- alinear la documentación CURRENT de Replace, Company Lock y estados de slices;
- endurecer únicamente el harness PostgreSQL de integridad C1 para usar opt-in y
  URL explícitos (`RUN_HC_C5_POSTGRES_TESTS=1` y `HC_C5_DATABASE_URL`), sin
  dotenv, `.env`, `DATABASE_URL` genérica ni fallback;
- verificar antes de toda escritura la identidad conectada, base, usuario, host,
  puertos host/server, versión PostgreSQL y schema efectivo;
- verificar `CONNECT`, `USAGE` y `SELECT`/`INSERT`/`DELETE` únicamente sobre las
  diez tablas requeridas; sin `UPDATE`, privilegios globales, administrativos ni
  privilegios de secuencia;
- exigir que todas las conexiones alcancen la misma instancia y que no existan
  sesiones ajenas al run;
- usar fixtures con IDs propios del run y cleanup tenant-scoped en orden
  referencial, con readback de conteos cero y propagación agregada de fallos.

Infraestructura y ejecución acreditadas para C5-A:

- usuario dedicado `zaping_hc_c5`;
- base `zaping_spike_test`;
- endpoint host `127.0.0.1:5434`.
- identidad dedicada y permisos mínimos verificados;
- PostgreSQL real: 27/27 PASS, 0 skipped, exit 0; preflight y teardown sin errores
  reportados;
- excepción ACL aprobada: `CONNECT`/`TEMPORARY` y `USAGE` heredados de `PUBLIC`,
  sin cambios en ACL compartidas.

La evidencia acredita sólo los fixtures propios y su teardown; no declara la base
globalmente vacía. La exclusividad se comprueba al inicio, pero no queda garantizada
durante toda la ejecución. Los laboratorios B4-B1 y 2H no se consideran
equivalentes automáticamente.

Definition of Ready:

- contrato C5-A documentado y baseline limpia: satisfecho;
- identidad/usuario/variable explícita y manifiesto mínimo de privilegios
  aprobados: satisfecho;
- conexión efectiva, schema, aislamiento de sesiones y cleanup verificados en
  preflight autorizado: satisfecho para la ejecución C1 acreditada.

Acceptance Criteria:

- el harness falla cerrado antes de escribir ante cualquier mismatch de identidad,
  schema, permisos o sesiones;
- no carga configuración implícita ni usa credenciales heredadas como fallback;
- fixtures y cleanup sólo alcanzan IDs propios del run, verifican conteos cero y
  hacen fallar el gate ante cualquier error;
- el cambio no modifica producción, schema, migraciones ni semántica C1–C4.

Definition of Done:

- implementación y revisión focal del harness completadas;
- preflight autorizado documenta identidad efectiva sin secretos;
- validaciones estáticas y `git diff --check` verdes;
- PostgreSQL C1 27/27 PASS y teardown sin errores reportados;
- PR #36 y #37 integrados en `main@5ec9f67`; C5-A COMPLETE / MERGED.

Sprint 1:

- ventana: 24-sep–07-oct-2026;
- capacidad bruta informada: 20 h/semana; no equivale a velocidad, Forecast ni
  Commitment;
- C5-A completado el 24-sep-2026;
- C6-A, pantalla visible de consulta read-only de Equipment Assignments para un
  Case, quedó COMPLETE / MERGED mediante PR #38 en `main@8a67d5a`;
- C6-B, creación visual de Assignment DIRECT, quedó COMPLETE / MERGED mediante
  PR #40 en `main@4805128`;
- C6-C, liberación visual de Assignment RESERVED, quedó COMPLETE / MERGED
  mediante PR #42 en `main@9bade4d`;
- C6-D, reemplazo visual de Assignment RESERVED, quedó COMPLETE / MERGED mediante
  PR #45 en `main@99efc5a`;
- C6-E, creación visual de Assignment vinculada a Requirement, quedó COMPLETE /
  MERGED mediante PR #47 en `main@a1f0fee`, con Actual 27-sep-2026;
- Actual C6-A, C6-B, C6-C y C6-D: 25-sep-2026. El 07-oct-2026 continúa siendo el
  cierre de la ventana, no un Commitment retroactivo;
- B0 conserva sus 3 SP; DoR COMPLETE y DoD PASS; validación runtime aceptada;
- Actual C5-A: 24-sep-2026 — completado antes del Target;
- Forecast: pendiente de estimar para el trabajo restante;
- Commitment: pendiente; el siguiente incremento funcional requiere refinamiento
  y no se declara READY.

#### HC-NEXT-03C5-B — Integrated Backend Validation

Estado: COMPLETE / DoD PASS / MERGED — B0 COMPLETE / MERGED — PR #57 — main@1be994d — DoD PASS; B1 COMPLETE / MERGED — PR #58 — main@9504cdd — DoD PASS; B2 COMPLETE / MERGED — PR #59 — main@dac9794 — DoD PASS; B3 COMPLETE / VALIDATED / MERGED — PR #60 — main@ad19dcf — CI PASS

Estimación total: 16 SP. Los SP expresan complejidad relativa y no se convierten
en horas ni Commitment.

##### C5-B0 — Safe Integrated Harness — 3 SP

Estado: COMPLETE / MERGED — PR #57 — main@1be994d — DoD PASS

DoR: COMPLETE. DEC-C5B-01/02/03 aprobadas el 08-oct-2026 sobre
`main@478e0f0`. C5-A y HC-LOCK-04 mantienen su evidencia aceptada;
HC-OPS-01B está MERGED mediante PR #56.

Implementación focal: suite
`app/api/test/healthcare-equipment-assignments.c5b.postgres.e2e-spec.ts` y helper
`app/api/test/helpers/healthcare-c5b-harness.ts`. Opt-in exclusivo, un cliente
Prisma explícito compartido con Nest, preflight de identidad/schema/ACL/PID,
Company A/B con marcadores acreditados, un smoke List con JWT real y cleanup
propio con readback independiente y errores agregados sanitizados. El helper
`withC5bHarness` centraliza el ciclo reutilizable para B1/B2.

Contrato: rol `zaping_hc_c5b`, flag `RUN_HC_C5B_POSTGRES_TESTS=1`, URL
`HC_C5B_DATABASE_URL`, PostgreSQL 16, `127.0.0.1:5434`, servidor 5432,
`zaping_spike_test`, schema `public`; sin dotenv ni fallback.

ACL exacta: `CONNECT` de base y `USAGE` de schema; `SELECT/INSERT/DELETE`
en Company, User, Product, HealthcareCase, HealthcareCaseRequirement,
EquipmentAsset, HealthcareEquipmentAssignment e IdempotencyRecord;
`SELECT/DELETE` en ConflictOverride y sólo `SELECT` en Settings.
`UPDATE(id)` en Asset/Requirement; `UPDATE(scheduledStart, scheduledEnd,
updatedAt)` en Case; `UPDATE(companyId)` en Settings;
`UPDATE(resourceId, updatedAt)` en IdempotencyRecord. Sin UPDATE de Assignment,
INSERT de ConflictOverride, DML de CoverageNote/CaseKit/Inventory, secuencias,
DDL, TRUNCATE, membresías, ownership ni grant options. La excepción PUBLIC
TEMPORARY de C5-A no se hereda. Se verifican etiquetas enum, sin exigir USAGE
para DML, y EXECUTE de las firmas efectivamente usadas.

Cierre B0 (08-oct-2026): DoD PASS. Rol aprovisionado con mínimo privilegio;
TEMPORARY revocado de PUBLIC en zaping_spike_test, sin TEMPORARY/CREATE ni
atributos administrativos para zaping_hc_c5b. Preflight real PASS de identidad,
schema, ACL positivas/prohibidas, funciones/PID y colisiones; JWT real y Company
A/B acreditadas; cleanup propio y readback cero PASS.

Gate habilitado aceptado: 1 suite / 1 test passed, aproximadamente 30 s, mediante
`npx jest --config ./test/jest-e2e.json --runInBand test/healthcare-equipment-assignments.c5b.postgres.e2e-spec.ts`.
Target validado: zaping_spike_test, zaping_hc_c5b, public, PG16, servidor 5432;
URL externa estricta 127.0.0.1:5434. La dirección interna válida/estable admite
CIDR opcional, sin IP/subred Docker fija.

Deltas cerrados: diagnósticos sanitizados visibles en el mensaje exterior de
AggregateError con originales privados, y validación de dirección interna con
CIDR. Evidencia estática aceptada PASS: TypeScript focal/noEmit, ESLint/Prettier
TS, gating deshabilitado, pruebas URL/CHECK y diff check. Diagnósticos 7 PASS;
identidad + diagnósticos 46 PASS (incluye las 7). No quedan HIGH/BLOCKER de B0.
Checklist detallado y evidencia en
[EQUIPMENT_ASSIGNMENT_TECHNICAL_DESIGN, §34.5.2.1](../modules/healthcare/EQUIPMENT_ASSIGNMENT_TECHNICAL_DESIGN.md#34521-b0--safe-integrated-harness--3-sp).

B0 está MERGED mediante PR #57 en main@1be994d. Su evidencia y alcance
se conservan; B1 registra a continuación la aceptación adicional de List/Detail.

##### C5-B1 — List/Detail HTTP Readback — 5 SP

Estado: COMPLETE / MERGED — PR #58 — main@9504cdd — DoD PASS

DoR: COMPLETE. Refinamiento aprobado sobre main@1be994d. Suite focal
`app/api/test/healthcare-equipment-assignments.c5b-list-detail.postgres.e2e-spec.ts`
reutiliza withC5bHarness sin modificar B0 ni crear un harness paralelo.
List/Detail acreditan cuatro roles con JWT real, 401 sin autenticación, Company
A/B, foreign igual a missing, filtros, orden/paginación/vacío, JSON público
exacto e históricos RELEASED/REPLACED con auditoría. Dynamic A completa el Case
y cambia false/null/INCOMPLETE_CASE_SCHEDULE a true/true/sin warnings; Dynamic B
reprograma sólo ese Case y devuelve true/false/CURRENT_ASSIGNMENT_CONFLICT por
ambos GET. Comparación persistida completa prueba Assignments sin mutación.

DoD: PASS. Evidencia estática aceptada: TypeScript focal/noEmit, ESLint, Prettier,
disabled-mode seguro y scope/diff PASS. Runtime focal PostgreSQL 16/HTTP/JWT:
1 suite / 1 test passed, 0 snapshots, ~24 s (~23.4 s de escenario); cleanup y
zero-residue B0 PASS. Sin cambios productivos, schema/migraciones, Web o ACL;
sin Settings/ConflictOverride/IdempotencyRecord nuevos. No hay HIGH/BLOCKER
pendientes según la evidencia aceptada. Checklist y comando en
[EQUIPMENT_ASSIGNMENT_TECHNICAL_DESIGN, §34.5.2.2](../modules/healthcare/EQUIPMENT_ASSIGNMENT_TECHNICAL_DESIGN.md#34522-b1--listdetail-http-readback--5-sp).
Este cierre usa la evidencia aportada, no reejecuta PostgreSQL ni tests.

B1 está MERGED mediante PR #58 en main@9504cdd. Su alcance y evidencia
se conservan; la aceptación de Create se registra a continuación.

##### C5-B2 — Create HTTP/JWT — 5 SP

Estado: COMPLETE / MERGED — PR #59 — main@dac9794 — DoD PASS

DoR: COMPLETE. Refinamiento sobre main@9504cdd; B0/B1 MERGED. Suite focal
`app/api/test/healthcare-equipment-assignments.c5b-create.postgres.e2e-spec.ts`
reutiliza B0 sin cambios ni harness paralelo. POST real con JWT y transacción
PostgreSQL: ADMIN/MANAGER/WAREHOUSE 201, SALES 403, sin JWT 401; REQUIREMENT y
DIRECT, relaciones/auditoría, JSON outcome/data exacto, tenant A/B y foreign igual
a missing. Rechazos de compatibilidad no dejan Assignment/claim. Idempotencia:
primer éxito/claim finalizado, replay 201 sin duplicados, request distinto 409
y key aislada por Company. Availability completa, propia incompleta y relacionada
incompleta; solapamiento devuelve review 200 con fingerprint dinámico sin writes.

DEC-C5B-02: fallo Prisma INYECTADO en completeIdempotencyClaim con HTTP/JWT y
transacción reales; 500 sanitizado, rollback, spy restaurado en finally y retry
con la misma key 201. No es evidencia de fallo nativo PostgreSQL. Product/stock,
Assets y Assignments preexistentes sin cambios por readback permitido; no se
afirma readback directo Inventory/Purchases/Sales. Sin cambios productivos,
Prisma/schema/migraciones, Web o ACL. Confirmación persistida ConflictOverride
DEFERRED / NOT APPLICABLE TO B2; INSERT sigue prohibido.

DoD: PASS. Estática focal/disabled mode/diff/scope PASS aceptados. Runtime:
1 suite / 1 test PASS, 0 snapshots, exit 0, ~8 s (~7.5 s de escenario), PG16;
cleanup/zero-residue B0 PASS. Sin HIGH/BLOCKER pendientes en evidencia aceptada.
Checklist y comando en
[EQUIPMENT_ASSIGNMENT_TECHNICAL_DESIGN, §34.5.2.3](../modules/healthcare/EQUIPMENT_ASSIGNMENT_TECHNICAL_DESIGN.md#34523-b2--create-httpjwt--5-sp).
Este cierre es documental, sin reejecución de DB/tests ni cambios a la suite.

B2 MERGED mediante PR #59 en main@dac9794. El INSERT prohibido y la
confirmación diferida describen exclusivamente el cierre histórico B2; B3 añade
la aceptación y el permiso mínimo siguientes.

##### C5-B3 — Integrated Gate & Closeout — 3 SP

Estado: COMPLETE / VALIDATED / MERGED — PR #60 — main@ad19dcf — CI PASS.
DoR COMPLETE: B0/B1/B2 MERGED. C5-B COMPLETE / DoD PASS / MERGED.
Gates sobre delta final: foco Equipment Assignments 8 suites/250 tests y full
API 100 suites/1616 tests PASS; Prisma validate/generate (Client v6.19.3),
lint:check sin fix, typecheck, production build y diff-check PASS.
CI PASS: push API/Web y PR API/Web. PR #60 MERGED; sin deployment declarado.

Sincronización post-merge (09-oct-2026): PR #60 — test(healthcare): complete
C5-B integrated closeout; feature commit fae381c; merge commit
ad19dcf7ba0971dcb0d67f21658ca229237f5620. Push checks API/Web PASS y PR checks
API/Web PASS. La evidencia local anterior se conserva como antecedente; el
estado vigente es B3 COMPLETE / VALIDATED / MERGED y C5-B COMPLETE / DoD PASS /
MERGED. M-HC1 permanece OPEN; no se declara release ni deployment.

Create confirmado: fingerprint vigente/stale, razón normalizada, JWT/RBAC,
tenant, 1 Assignment + 2 Overrides + 1 claim atómicos, rollback INYECTADO/retry,
replay/reuse, JSON exacto y List/Detail. B3 focal PASS (1 suite/1 test, exit 0),
frontera física, cleanup y zero-residue propios acreditados. B0/B1/B2/B3 focales
PASS con ACL final. Operador añadió sólo ConflictOverride INSERT;
SELECT/INSERT/DELETE, sin UPDATE, grant options ni permisos auxiliares nuevos.

Incidente histórico http.sessions: PID no acreditado, teardown PASS; causa raíz
no establecida. Diagnóstico sanitizado añadido sin cambiar el rechazo ni añadir
retry/sleep, exclusiones o cliente observador. 17 tests diagnósticos y estática
focal PASS; B0/B3 disabled safely skipped. Una reproducción controlada
B0 → B1 → B2 PASS — INCIDENT NOT REPRODUCED; también B0 → B1 → B3 PASS.
No se afirma ejecución de las cuatro suites en una secuencia ni reverse; el
contrato canónico no exige estos comandos adicionales. Ningún defecto productivo
HIGH/BLOCKER establecido; no se recomienda una corrección lifecycle especulativa.

Checklist y evidencia exacta:
[EQUIPMENT_ASSIGNMENT_TECHNICAL_DESIGN, §34.5.2.4](../modules/healthcare/EQUIPMENT_ASSIGNMENT_TECHNICAL_DESIGN.md#34524-b3--integrated-gate--closeout--3-sp).
Sin cambios API productiva, Prisma/schema/migraciones o Web. Este cierre es sólo
documental y no conecta DB ni reejecuta validación runtime. M-HC1 permanece abierto.
Después de C5-B MERGED: COVERAGE COMPLETE / MERGED; R COMPLETE / MERGED
mediante PR #63; N COMPLETE / MERGED — PR #65 — main@2fa5927 — DoD PASS — 5 SP.
Sin cambios SP, Forecast o Commitment.

#### HC-NEXT-03C5-COVERAGE — CoverageNote / Aggregated Coverage Backend

Estado: COMPLETE / MERGED / CONTRACT APPROVED — DEC-C5-COV-01–05 aprobadas por Leo.
R COMPLETE / MERGED; N COMPLETE / MERGED — PR #65 — main@2fa5927 — DoD PASS.
Umbrella COMPLETE / MERGED — R PR #63 y N PR #65; DoD PASS; CI PASS.
Capability de dominio fuera de C5-A/B; no campaña de test coverage. M-HC1 OPEN.
Cantidad y certainty separadas; COVERED no certifica readiness/availability.
Notes sólo se resuelven explícitamente; stale conservadas sin cambiar counts.
UNAVAILABLE sólo con assignedQty=0; PARTIAL_CONTEXT sólo con 0<assignedQty<q.
V1 informacional, sin bloquear Case, CaseKit preparation o Dispatch/Custody.
Contrato completo/API/errores/transactions:
[EQUIPMENT_ASSIGNMENT_TECHNICAL_DESIGN, §34.5.3](../modules/healthcare/EQUIPMENT_ASSIGNMENT_TECHNICAL_DESIGN.md#3453-hc-next-03c5-coverage).

##### HC-NEXT-03C5-COVERAGE-R — Derived Requirement Coverage Read — 5 SP

Estado: COMPLETE / MERGED — PR #63 — main@d63b8fe — DoD PASS; CI PASS.
CI PASS. Feature commit: ba570f7cfeb2ef546d309a1e681b47e3114fadad.
Merge commit en main: d63b8fee6956899213d75dd85c6d2bd33e52f7b5.
C5-B merged.
Scope: GET Case coverage y GET Requirement note history, snapshot consistente,
nominalAssignedQty/assignedQty/missingQty, PENDING/PARTIAL/UNAVAILABLE/COVERED,
Availability/warnings independientes, notes activas/historia paginada, orden,
cuatro roles y tenant. Sin coverageStatus persistido ni Company lock para GET.
AC: conteo compatible/eligible/RESERVED REQUIREMENT; DIRECT/RELEASED/REPLACED
excluidos; COVERED+incertidumbre; conflicto separado; UNAVAILABLE activa sólo a
cero; PARTIAL_CONTEXT sin efecto matemático; foreign=missing; cuatro roles;
schedule sin falsa certificación; release/replace/reschedule recomputan; JSON
público; sin writes físicos/status cache. Non-goals: note commands, blockers,
CaseKit/inventario, override nuevo o Web. DoD: unit/HTTP/JWT/PostgreSQL pertinente,
recomputación, tenant/RBAC/invariantes, ACL/cleanup/residue, gates aplicables,
docs, CI y merge. AC numerados completos en diseño §34.5.3.

Evidencia local acreditada: focal Equipment Assignments PASS (305 tests / 11 suites),
full API PASS (1671 tests / 103 suites), lint/typecheck/build PASS, TypeScript focal
noEmit PASS y git diff --check PASS. PostgreSQL acceptance PASS (1 suite / 1 test)
con harness C5-B existente, zaping_spike_test, HTTP/JWT reales, tenant/RBAC,
fixtures persistidos, cleanup y protecciones zero-residue. ACL aplicado al rol
zaping_hc_c5b: SELECT/INSERT/DELETE en public."HealthcareEquipmentRequirementCoverageNote";
no UPDATE. ACL exclusivo del rol de test C5-B; no autoriza producción.
Sin cambio Prisma schema/migration ni actividad staging/producción.
DEC-C5-COV-05.1–05.5 implementadas/validadas; semántica individual intacta.
Arquitectura Controller → Service → Repository → Prisma; RepeatableRead con
un TransactionClient para todos los inputs, sin Company advisory/write locks ni
writes en GET. R COMPLETE / MERGED — PR #63 — main@d63b8fe — DoD PASS; CI PASS.
Este cierre registra
la evidencia del checkpoint, sin reejecutar tests ni conectar DB.

##### HC-NEXT-03C5-COVERAGE-N — CoverageNote Commands & Audit — 5 SP

Estado: COMPLETE / MERGED — PR #65 — main@2fa5927 — DoD PASS — 5 SP.
CI PASS. Feature commit N: ff4124d99afcc04d0607ca3f813a154cb754c180.
Merge commit N en main: 2fa5927e239998d52e0004f14fdfeb5a312ff28a.
Merge mediante PR #65; sin migración ni deployment de producción acreditados.
Dependencia R merge satisfecha por PR #63. Goal: create/resolve auditable explícito.
Dependencias/DoR: R merged y contrato aprobado; aceptación PostgreSQL PASS.
Scopes create/resolve y migration mínima aplicados; ACL de aceptación validado.
Scope: dos POST,
contexto/kind/comment, auditoría inmutable, active uniqueness, replay/reuse,
concurrencia/rollback, tenant/RBAC y readback R. AC: UNAVAILABLE sólo cero;
PARTIAL_CONTEXT sólo parcial; contexto inválido zero-write; nunca auto-resolve;
una activa/kind y coexistencia según contexto; create/resolve idempotentes;
primer audit intacto; antigua no cierra sucesora; duplicate race seguro;
rollback note/claim; SALES 403, foreign=missing; readback R; sin writes Assignment/
inventario. Non-goals: PUT/DELETE API, notes genéricas, blocking o frontend.
DoD: migration, unit/HTTP/JWT/PostgreSQL, concurrencia material, rollback/replay,
cleanup/residue/invariantes, gates generales/estáticos, docs, CI y merge.

R reutiliza CoverageNote y harness C5-B. N incorpora los scopes
HEALTHCARE_EQUIPMENT_COVERAGE_NOTE_CREATE y HEALTHCARE_EQUIPMENT_COVERAGE_NOTE_RESOLVE;
migration 20261009000000_add_coverage_note_idempotency_scopes aplicada, schema al día.
ACL sólo zaping_hc_c5b en 127.0.0.1:5434/zaping_spike_test: UPDATE de tabla=false,
resolvedAt/resolvedById=true; SELECT/INSERT/DELETE no delegables, sin UPDATE lifecycle.
DEC-C5-COV-06 IMPLEMENTED / VALIDATED: CREATE exige Case no CANCELLED y Requirement
ACTIVE (409 zero-write); RESOLVE y replay completado siguen permitidos tras
CANCELLED/RETIRED. Primer audit preservado; note antigua no resuelve sucesora.
Concurrencia material PASS: dos PID de aplicación y un PID control acreditados,
Company advisory lock determinista observado con pg_stat_activity/pg_locks;
sesiones desconocidas rechazadas. CREATE: éxito + 409 sanitizado; RESOLVE: primer audit.
Control sólo infraestructura de test/fixtures, sin autorización productiva;
desconectado antes de checks finales, sin credenciales documentadas/committed.
Evidencia acreditada: focal 386; helpers 75; full API 1752 tests / 106 suites;
Prisma validate/generate, lint/typecheck/build, noEmit, Prettier TS y diff-check PASS;
disabled-mode safe skip; PostgreSQL N PASS — 1 suite / 1 test (~43.247 s).
control.disconnect y concurrency.disconnect PASS; opt-in y URLs de runtime/control
ausentes después. Evidencia detallada/comando en diseño §34.5.3; sin reruns.
Sin status cache ni tabla nueva. Actividad DB durante cierre: NONE. M-HC1 OPEN.
N y umbrella MERGED; DoD PASS; CI PASS. Sin release ni deployment.
Orden: R → N → futuros slices C6 que requieran coverage. Estimaciones 5+5 SP,
sin Forecast/Commitment nuevos; C6-A/B/C/D/E ya merged no quedan bloqueados.

#### HC-CASE-AVL — Case Availability

Estado: COMPLETE / MERGED. M-HC1 OPEN.
R COMPLETE / MERGED — PR #69 — main@59d5aae — DoD PASS; CI PASS.
Feature commit: `6b1ae85d0f7ff4fd81bd0d0e42403975e4db6c9e`;
merge en main: `59d5aae1efa02aa53153bd0de03552d0679df7d6`.
HC-CASE-AVL-UI COMPLETE / MERGED — PR #71 — main@e56970d — DoD PASS — TARGET 3 SP.
UI merged mediante PR #71; CI PASS. Feature commit:
`c66fc37fac4a36ebe7be91e84b484a59c3cb5907`; merge commit en main:
`e56970d6f7587ef72e06a18ee1f45dbcb839ec83`.

| Slice                                                    | Estado                                               | Estimación  |
| -------------------------------------------------------- | ---------------------------------------------------- | ----------- |
| HC-CASE-AVL-R — Derived Case Availability Read — Backend | COMPLETE / MERGED — PR #69 — main@59d5aae — DoD PASS | TARGET 5 SP |
| HC-CASE-AVL-UI — Case Availability Summary — Frontend    | COMPLETE / MERGED — PR #71 — main@e56970d — DoD PASS | TARGET 3 SP |

Contrato aprobado y autoridad DEC-CASE-AVL-01/02/03:
[CASES §86](../modules/healthcare/CASES.md#861-contrato-aprobado-v1--case-level-projection).
Proyección derivada e informacional, sin enum general, workflow gate o estado
persistido. Equipment diagnostica RESERVED REQUIREMENT + RESERVED DIRECT;
RELEASED/REPLACED fuera. Coverage conserva R sin DIRECT. Ausencia de Requirements/
CaseKit explícita, sin inferir readiness ni aplicabilidad. Snapshot RepeatableRead,
TransactionClient compartido, zero-write y reuse de fórmulas existentes.
Implementado GET /healthcare/cases/:caseId/availability, dimensiones schedule,
requirements, coverage, equipment y preparation. ADMIN/MANAGER/SALES/WAREHOUSE;
sin JWT 401, Company sólo JWT, foreign Case igual a missing.

DoD local: focal inicial 202 / 10; Availability 34 / 2; helpers 94 / 4;
full API 1786 / 108; lint/typecheck/build/Prisma validate/generate/focal noEmit,
Prettier/diff-check y disabled-mode safe skip PASS.
PostgreSQL HC-CASE-AVL-R 1 suite / 1 test PASS (~27 s), lectura persistida
integrada y zero-write, sin claim de concurrencia. Sólo
127.0.0.1:5434/zaping_spike_test, rol zaping_hc_c5b; ACL adicional SELECT-only
en CaseKit/Item, sin write privileges de aplicación. Fixtures propios mediante
control acreditado; cleanup Item → Kit → dependencias, sesiones desconocidas
rechazadas, control.disconnect/concurrency.disconnect PASS y zero-residue.
Opt-in y URLs aplicación/operador ausentes después (tres Test-Path False).
Comando, alcance y evidencia en [CASES §86.10](../modules/healthcare/CASES.md#8610-hc-case-avl-r--post-merge-closeout).
Actividad DB durante cierre: NONE; sin reruns ni deployment.
Backend read y UI merged; sin cambio de schema, migration o ACL de producción.
TARGET exclusivamente; sin Forecast, Commitment, Actual o fechas asignados.
UI local: resumen en «Detalle del caso» entre procedimiento y Requerimientos,
cinco dimensiones (schedule/requirements/coverage/equipment/preparation), servicio
tipado GET /healthcare/cases/:caseId/availability sin requests por fila, protección
de respuestas stale y loading/errores aislados. Requerimientos preservado;
drill-down a Equipment Assignments y CaseKit. ADMIN/MANAGER/SALES/WAREHOUSE.
Sin verdict global READY/AVAILABLE, gate ni rederivación frontend.

DoD UI: focal 69 PASS; `npm test -- --maxWorkers=2` 855/855 tests y 69/69 archivos
PASS; lint/typecheck/build PASS, build con
`NEXT_PUBLIC_API_URL=https://api.example.invalid`; git diff --check PASS.
Default `npm test`: 842 PASS / 13 FAIL / 855 tests; 63 archivos PASS / 6 FAIL / 69.
Todos los fallos: timeouts de 5000 ms en customers/products/quotes/purchases/users/
suppliers preexistentes, ninguno de HC-CASE-AVL-UI. Auditoría: ENVIRONMENTAL /
NON-BLOCKING, sin leaks/loops/contaminación atribuibles al ticket. No se declara
default npm test PASS; config/timeouts/scripts/worker defaults intactos.
Evidencia completa en [CASES §86.11](../modules/healthcare/CASES.md#8611-hc-case-avl-ui--local-dod-closeout).
UI COMPLETE / MERGED — PR #71; umbrella COMPLETE / MERGED; CI PASS. M-HC1 OPEN.
Cierre sólo documental, sin reruns ni actividad DB; backend intacto.
Siguiente acción: revisión humana → staging selectivo → commit → docs PR.

#### HC-NEXT-03C6-A — Case Equipment Assignments Read-only View

Estado: COMPLETE / MERGED — PR #38 — `main@8a67d5a` — Actual 25-sep-2026

Objetivo y alcance inicial:

- entregar una pantalla centrada en Case, conectada a List/Detail existentes;
- mostrar listado, detalle y disponibilidad expuesta por la API;
- cubrir estados loading, empty, error y RBAC sin inventar reglas frontend;
- mantener el slice independiente de B0; su aceptación integrada quedó limitada
  a los gates aplicables acreditados de autenticación, permisos y List/Detail.

Acceptance Criteria:

- desde un Case se consulta su listado y se abre el detalle de una Assignment;
- la UI representa la disponibilidad recibida y estados loading/empty/error;
- los cuatro roles respetan el contrato read-only y un 403 no destruye la sesión;
- no se exponen ni habilitan acciones fuera del alcance.

Definition of Done:

- Vitest focal 29/29 PASS;
- ESLint, TypeScript y Next.js build PASS; CI API/Web PASS;
- validación manual PASS para empty state, Assignment DIRECT/RESERVED real,
  Detail modal y disponibilidad “No verificable” con warning
  `INCOMPLETE_CASE_SCHEDULE`;
- PR #38 integrado en `main@8a67d5a` el 25-sep-2026.

Known non-blocker: datos de desarrollo presentan mojibake como “Cirug�a” o
“Demostraci�n”; la UI estática UTF-8 es correcta. No bloqueó la aceptación de
C6-A y no se abre trabajo de infraestructura en este cierre.

Fuera de alcance: Create, Replace o Release en UI, CoverageNote, movimientos
físicos y cambios productivos de backend.

#### HC-NEXT-03C6-B — Create Assignment UI

Estado: COMPLETE / MERGED — PR #40 — `main@4805128` — Actual 25-sep-2026

El slice añadió sobre C6-A la creación de Assignment DIRECT mediante el backend
Create integrado, con acción restringida por rol, formulario, Idempotency-Key por
request, manejo de resultados y refresh de List, sin ampliar reglas de dominio en
frontend ni incorporar Requirement assignment, Replace, Release o CoverageNote.

Evidencia de cierre:

- Vitest focal 19/19 PASS;
- TypeScript Web, ESLint Web y Next.js build PASS;
- CI API/Web PASS;
- validación manual PASS para MANAGER Create DIRECT, éxito con refresh de List,
  nueva Assignment RESERVED visible, disponibilidad/warning renderizados y SALES
  sin acción Create.

El mojibake observado en datos de desarrollo continúa como known non-blocker; la
UI estática UTF-8 permanece correcta.

#### HC-NEXT-03C6-C — Release Assignment UI

Estado: COMPLETE / MERGED — PR #42 — `main@9bade4d` — Actual 25-sep-2026

El slice completa el ciclo visible RESERVED → RELEASED desde la pantalla de
Assignments, reutilizando Manual Release integrado, motivo requerido,
Idempotency-Key por request, feedback y refresh de List. Los tests focales
mantienen SALES read-only; no se registra validación manual de SALES.

Evidencia de cierre:

- Vitest focal 26/26 PASS;
- TypeScript Web, ESLint Web y Next.js build PASS;
- CI API/Web PASS;
- validación manual PASS para MANAGER con Release visible sobre RESERVED, motivo
  requerido, transición RESERVED → RELEASED, feedback con refresh,
  disponibilidad “No aplica (histórico)” y desaparición de la acción Release.

El mojibake observado en datos de desarrollo continúa como known non-blocker; la
UI estática UTF-8 permanece correcta.

#### HC-NEXT-03C6-D — Replace Assignment UI

Estado: COMPLETE / MERGED — PR #45 — `main@99efc5a` — Actual 25-sep-2026

El slice completa el flujo visible RESERVED A → REPLACED y crea la sucesora
RESERVED B mediante el backend Replace integrado. La acción se limita a RESERVED
y roles autorizados, excluye el Asset origen del selector, envía los campos e
Idempotency-Key exigidos y refresca List inmediatamente tras éxito.

Evidencia de cierre:

- Vitest focal 33/33 PASS;
- TypeScript Web, ESLint Web y Next.js build PASS;
- CI API/Web PASS;
- validación manual PASS para MANAGER con Replace visible sobre RESERVED, Asset
  origen excluido, Replace ejecutado desde UI, original → REPLACED, sucesora →
  RESERVED, refresh inmediato de List y disponibilidad histórica/no aplicable en
  REPLACED.

No se declara validación manual de SALES. El mojibake observado en datos de
desarrollo continúa como known non-blocker; la UI estática UTF-8 permanece
correcta.

#### HC-NEXT-03C6-E — Requirement-linked Assignment UI

Estado: COMPLETE / MERGED — PR #47 — `main@a1f0fee` — Actual 27-sep-2026

El slice añadió un flujo REQUIREMENT separado de DIRECT: selecciona un Requirement
ASSET activo del Case y un EquipmentAsset compatible, crea la Assignment mediante
el backend integrado y refresca List mostrando `origin=REQUIREMENT`, la relación
con el Requirement y su cobertura.

Evidencia de cierre:

- Vitest focal 42/42 PASS;
- TypeScript Web, ESLint Web y Next.js build PASS;
- CI API/Web PASS;
- validación manual PASS para flujo REQUIREMENT separado de DIRECT, exclusión de
  Requirements con tracking QUANTITY, Requirement ASSET disponible, asignación de
  EquipmentAsset compatible desde UI, `origin=REQUIREMENT` visible, relación con
  Requirement visible en List, cobertura actualizada a 1/1 y refresh automático.

No se declara validación manual de SALES ni Detail. El mojibake observado en datos
de desarrollo continúa como known non-blocker; la UI estática UTF-8 permanece
correcta.

#### HC-OPS-01A — CaseKit Draft & Contents

Estado: COMPLETE / MERGED — PR #50 — `main@bb530e8` — Actual 27-sep-2026

Contrato canónico: `docs/modules/healthcare/CASE_KITS.md`, sección 231.

Decisiones cerradas: un CaseKit lógico por Case; status exclusivamente `DRAFT`;
material QUANTITY no reservante; fuentes invalidadas conservadas como stale por
read-model; Idempotency-Key obligatorio para Create/Add; errores estables,
tenant isolation y fixed-role RBAC.

Alcance: crear/consultar el Maletín y agregar Requirements QUANTITY o Assignments
RESERVED ya vinculadas al Case. La UI debe advertir que no decrementa stock, no
modifica batches, no crea InventoryMovement y no garantiza disponibilidad física.

Evidencia: API focal/regression 382/382 PASS; Web focal 26/26 PASS; Prisma validate,
TypeScript API/Web, ESLint API/Web, API build, Next.js build y CI API/Web PASS.

Validación manual acreditada para MANAGER: Create CaseKit, estado `DRAFT`, banner
no reservante, Requirement `QUANTITY` agregado, Equipment Assignment `RESERVED`
agregado y Materials/Equipment renderizados correctamente. No se registra
validación manual de SALES.

El cierre mantiene Create/Get/Add only y `DRAFT` only. Update/Remove Item,
`InventoryMovement`, reserva o decremento de stock, Dispatch, Custody, Return e
Inspection permanecen fuera de 01A.

Persisten como trabajos independientes C5-B, C5-COVERAGE, Case Availability
general, permission-based RBAC y despliegue staging/productivo. HC-OPS-01A no
implementa Dispatch, Return, Custody, Inventory Movement ni disponibilidad física,
y no declara Healthcare Core terminado.

#### HC-OPS-01A.1 — Draft Item Exclusion

Estado: COMPLETE / MERGED — PR #53 — `main@54a5d79` — Actual 28-sep-2026.

Contrato canónico: `docs/modules/healthcare/CASE_KITS.md`, sección 232.

Objetivo: corregir un item incorrecto o stale de un CaseKit `DRAFT` sin perder
trazabilidad. Añade lifecycle `ACTIVE | EXCLUDED`, default `ACTIVE`, y auditoría
opcional `excludedById`, `excludedAt`, `exclusionReason`, con relación User
tenant-safe. El check exige auditoría nula para `ACTIVE` y completa para `EXCLUDED`;
la razón se normaliza y admite 1..1000 caracteres.

Los unique por Requirement/Assignment pasan a índices parciales limitados a
`ACTIVE`. Las filas históricas `EXCLUDED` coexisten y la misma fuente puede volver
a agregarse. GET conserva ambas; Add, duplicate detection y readiness/coverage
futuros consideran sólo `ACTIVE`.

API: `POST /healthcare/case-kits/:caseKitId/items/:itemId/exclude`, body
`{ reason }`, Idempotency-Key obligatorio y HTTP 200 con item directo. Sólo un item
`ACTIVE` de Kit `DRAFT` puede excluirse por primera vez; Case `CANCELLED` rechaza
la mutación. Actor/tenant vienen del JWT. Company-first, locks de Case/Kit/item,
revalidación, exclusión, auditoría y claim comparten una transacción; update cero
requiere readback.

Replay: misma key/payload y estado ya excluido con key nueva/misma razón retornan
200 preservando auditoría; la key nueva no se consume en state replay. Payload
distinto usa `IDEMPOTENCY_KEY_REUSED`; razón distinta usa
`CASE_KIT_ITEM_ALREADY_EXCLUDED`. El replay completado prevalece sobre estado
posterior y las colisiones concurrentes recuperan al ganador.

RBAC/UI: ADMIN, MANAGER y WAREHOUSE excluyen; SALES read-only. La acción aparece
sólo para `ACTIVE + DRAFT`, exige razón, explica que conserva historia y muestra
badge/actor/fecha/razón después del refresh. Sin restore, edit o hard delete.

DoR: COMPLETE. AC y DoD exigen tenant isolation, replay, concurrencia, rollback,
índices parciales, historia legible, re-agregado y ausencia de efectos físicos,
con pruebas focales API/Web/PostgreSQL y gates estáticos/build aplicables.

Evidencia de cierre: Prisma validate/generate PASS; API focal 36/36 y Web focal
12/12 PASS; TypeScript y ESLint API/Web, API build, Next.js build y
`git diff --check` PASS; harness PostgreSQL 2H completo 45/45 PASS, 0 skipped. La
validación manual acreditó como MANAGER la exclusión de un item `ACTIVE`, la
preservación de la historia `EXCLUDED` con actor/fecha/razón, el re-agregado de la
misma fuente y la coexistencia de la fila histórica `EXCLUDED` con la nueva
`ACTIVE`. No se registra validación manual de SALES.

Fuera: PREPARED, item update, restore, hard delete, versioning genérico,
Dispatch/Custody/Return e Inventory/stock/Assignment mutation. No se asignan SP,
Forecast ni Commitment.

#### HC-OPS-01B — Preparation Confirmation & Readiness

Estado: COMPLETE / MERGED — PR #56 — main@478e0f0 — DoD PASS — DoR COMPLETE.

Prerequisito satisfecho: HC-OPS-01A.1 está COMPLETE / MERGED y resolvió el blocker
de corrección de items stale.

Contrato canónico: `docs/modules/healthcare/CASE_KITS.md`, sección 233, y
`docs/modules/healthcare/CASES.md`, sección 79.

Alcance: añadir sólo `PREPARED` y `DRAFT -> PREPARED`, sin `IN_PREPARATION` ni
reopen. `PREPARED` confirma preparación lógica, vuelve inmutable el contenido y no
representa reserva física, Dispatch o salida de Warehouse. Persiste actor/fecha;
readiness y blockers se derivan sin snapshot persistido.

La primera confirmación exige Case `SCHEDULED` con ventana completa, items `ACTIVE`
válidos y cobertura de todos los Requirements `ACTIVE + REQUIRED`: QUANTITY exacta,
ASSET cubierto con Assignments `REQUIREMENT + RESERVED` y SERIALIZED bloqueado.
BACKUP ausente no bloquea; DIRECT no cubre Requirements; empty Kit es válido sin
Requirements obligatorios.

API: `POST /healthcare/case-kits/:caseKitId/confirm-preparation`, body vacío,
Idempotency-Key obligatorio y HTTP 200 con response CaseKit directa. Readiness
BLOCKED retorna `CASE_KIT_PREPARATION_BLOCKED`/409 zero-write sin consumir key.
Replay por key o estado preserva auditoría; key reutilizada para otro Kit retorna
`IDEMPOTENCY_KEY_REUSED`/409. La primera transición usa Company-first, revalidación
y atomicidad de status/auditoría/claim.

La frontera de confirmación bloquea además Product y EquipmentAsset de fuentes
ACTIVE, en orden determinista tenant-safe, y relee el Kit antes de decidir la
transición. Web vuelve a consultar Case/Kit tras conflictos de readiness/estado,
conserva el error y oculta readiness anterior si falla el refresh.

Invalidaciones posteriores por Requirement retire, Assignment release/replace o
Case cancel conservan `PREPARED` y auditoría, pero recalculan readiness `BLOCKED`;
no reparan ni reemplazan fuentes. ADMIN/MANAGER/WAREHOUSE confirman; SALES es
read-only. La UI muestra checklist/blockers, warning no reservante, confirmación,
badge/auditoría e inmutabilidad, sin controles de Dispatch.

AC/DoD: cubrir reglas de readiness, tenant/RBAC, replay, colisión, rollback,
conditional update, invalidaciones posteriores, UI y ausencia de writes físicos;
schema/gates API/Web/PostgreSQL y validación manual aplicables deben pasar.

DoD final: PASS. Evidencia aceptada: API unit 69/69, HTTP/JWT 9/9, Web 20/20,
PostgreSQL integrado 52/52 en `zaping_spike_test` PostgreSQL 16; Prisma
validate/generate, typecheck/lint focal, formato delta, builds API/Web y QA manual
PASS. Checklist y alcance preciso de cada evidencia en
[CASE_KITS, secciones 233.14–233.15](../modules/healthcare/CASE_KITS.md).
No quedan findings HIGH/BLOCKER de 01B. COMPLETE significa terminado y validado;
quedó MERGED mediante PR #56 en main@478e0f0; no se declara deployment. M-HC1 continúa abierto.
Siguiente trabajo registrado: HC-NEXT-03C5-B3 Integrated Gate & Closeout,
COMPLETE / VALIDATED / MERGED — PR #60 — main@ad19dcf — CI PASS; B0/B1/B2 MERGED. No se modifican SP, Forecast, Commitment ni fechas de
sprint.

Fuera: `IN_PREPARATION`, reopen, mutación de items `PREPARED`, lotes/seriales,
reserva física, Inventory Movement, Dispatch/Custody/Return y arquitectura no
relacionada. No se asignan SP, Forecast ni Commitment.
