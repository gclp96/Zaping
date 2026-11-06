# Registro de depuración de PR — 2026-11-06

**Repositorio:** gclp96/zaping. **Estado:** auditoría preliminar / solo lectura. **Fuente:** PR abiertos en GitHub consultados el 2026-11-06. **Total inicial:** 47. **Cerrados en esta limpieza:** 1 (#223). **Abiertos restantes a este corte:** 46.

No se ha autorizado ninguna fusión, cierre ni borrado por el hecho de figurar en esta lista. El objetivo es resolver cada registro con trazabilidad y sin perder trabajo; los números son identificadores históricos que deben conservarse.

**Campos mínimos por PR antes de resolverlo:** estado de ramas base/head; archivos exclusivos y comparación contra main; últimas verificaciones CI en SHA exacto; riesgos y dependencias; decisión (`REWORK`, `SUPERSEDED`, `DEFER`, `BLOCKED`, `NEEDS_REVIEW`); referencia de sustitución o issue; comentario de cierre; validación de que no quedan descendientes dependientes.

**Decisiones de procesamiento:** PRs de consolidación y corrección -> revisar primero; no fusionar laboratorios ni PRs apilados automáticamente. Un cierre `SUPERSEDED` requiere identificar código absorbido o documentar trabajo descatalogado.

## R2 histórico y prototipos (19)

**Criterio inicial:** Comparar contra main y PR #252; no fusionar en lote; posible sustitución.

| PR | Nombre | Estado de triage | Decisión final |
|---|---|---|---|
| [#148](https://github.com/gclp96/zaping/pull/148) | feat(r2): validate Cloudflare R2 config and tenant-scoped object read contract (B3a) | NEEDS_REVIEW | Pendiente |
| [#149](https://github.com/gclp96/zaping/pull/149) | feat(r2): add locked AWS SDK v3 GetObject transport (UX-PDOC-01B3b) | NEEDS_REVIEW | Pendiente |
| [#150](https://github.com/gclp96/zaping/pull/150) | test(r2): read-only Cloudflare R2 QA smoke with synthetic fixture (B3c) | NEEDS_REVIEW | Pendiente |
| [#151](https://github.com/gclp96/zaping/pull/151) | feat(r2): bounded PDF/JPEG quarantine upload and create-once PutObject (B3d1) | NEEDS_REVIEW | Pendiente |
| [#152](https://github.com/gclp96/zaping/pull/152) | feat(r2): atomic PostgreSQL upload reservations and quota ledger (B3d2) | NEEDS_REVIEW | Pendiente |
| [#153](https://github.com/gclp96/zaping/pull/153) | feat(r2): verify quarantined bytes and reconcile upload ledger atomically (B3d3) | NEEDS_REVIEW | Pendiente |
| [#154](https://github.com/gclp96/zaping/pull/154) | feat(r2): fail-closed ClamAV Unix INSTREAM quarantine scan boundary (B3d4a) | NEEDS_REVIEW | Pendiente |
| [#155](https://github.com/gclp96/zaping/pull/155) | test(r2): isolated real ClamAV LTS scanner EICAR smoke (B3d4b) | NEEDS_REVIEW | Pendiente |
| [#156](https://github.com/gclp96/zaping/pull/156) | test(r2): opt-in real ClamAV lab smoke gate (B3d4b) | NEEDS_REVIEW | Pendiente |
| [#157](https://github.com/gclp96/zaping/pull/157) | feat(r2): ClamAV Unix VERSION freshness and pre/post scan readiness gates (B3d4c) | NEEDS_REVIEW | Pendiente |
| [#158](https://github.com/gclp96/zaping/pull/158) | feat(r2): fail-closed ClamAV readiness policy prototype (B3d4c) | NEEDS_REVIEW | Pendiente |
| [#159](https://github.com/gclp96/zaping/pull/159) | docs(r2): immutable scan attestation and private promotion design (B3d5) | NEEDS_REVIEW | Pendiente |
| [#160](https://github.com/gclp96/zaping/pull/160) | feat(r2): untrusted scan attempt ledger and hard deny unsafe attachment approval (B3d5a) | NEEDS_REVIEW | Pendiente |
| [#161](https://github.com/gclp96/zaping/pull/161) | feat(r2): isolated Ed25519 scan evidence envelope and verifier (B3d5b1) | NEEDS_REVIEW | Pendiente |
| [#162](https://github.com/gclp96/zaping/pull/162) | feat(r2): isolated signed worker pre/post ClamAV readiness lab (B3d5b2) | NEEDS_REVIEW | Pendiente |
| [#163](https://github.com/gclp96/zaping/pull/163) | feat(r2): immutable tenant and nonce-bound signed evidence receipts (B3d5b3a) | NEEDS_REVIEW | Pendiente |
| [#164](https://github.com/gclp96/zaping/pull/164) | feat(r2): DB-issued single-use scanner job challenges (B3d5b3b) | NEEDS_REVIEW | Pendiente |
| [#165](https://github.com/gclp96/zaping/pull/165) | feat(r2): isolated Ed25519 verified scan evidence gateway (B3d5b3c1) | NEEDS_REVIEW | Pendiente |
| [#166](https://github.com/gclp96/zaping/pull/166) | test(r2): authenticated non-owner PostgreSQL role denial matrix (B3d5b3c2a) | NEEDS_REVIEW | Pendiente |

## ZFiles laboratorios apilados (14)

**Criterio inicial:** Conservar evidencia y dependencias; determinar código exclusivo antes de cerrar.

| PR | Nombre | Estado de triage | Decisión final |
|---|---|---|---|
| [#212](https://github.com/gclp96/zaping/pull/212) | test(zfiles): real isolated ClamAV INSTREAM QA, synthetic EICAR (03B2) | NEEDS_REVIEW | Pendiente |
| [#215](https://github.com/gclp96/zaping/pull/215) | feat(zfiles): quarantine read-only verified scan laboratory (03B3) | NEEDS_REVIEW | Pendiente |
| [#218](https://github.com/gclp96/zaping/pull/218) | feat(zfiles): ClamAV Unix readiness with bounded signature age (03B4) | NEEDS_REVIEW | Pendiente |
| [#220](https://github.com/gclp96/zaping/pull/220) | test(zfiles): one-shot real FreshClam + UTC clamd readiness QA (03B5) | NEEDS_REVIEW | Pendiente |
| [#225](https://github.com/gclp96/zaping/pull/225) | feat(zfiles): isolated signed scan evidence worker lab (03C1) | NEEDS_REVIEW | Pendiente |
| [#228](https://github.com/gclp96/zaping/pull/228) | feat(zfiles): PostgreSQL issued-only scan challenge and nonce ledger (03C2A) | NEEDS_REVIEW | Pendiente |
| [#230](https://github.com/gclp96/zaping/pull/230) | feat(zfiles): DB-challenge-bound signed scan gateway lab (03C2B1) | NEEDS_REVIEW | Pendiente |
| [#232](https://github.com/gclp96/zaping/pull/232) | feat(zfiles): atomic PostgreSQL signed scan receipt and nonce consumption lab (03C2B2) | NEEDS_REVIEW | Pendiente |
| [#234](https://github.com/gclp96/zaping/pull/234) | test(zfiles): isolate R2 quarantine Object Read QA and cross-bucket denial (03C3A) | NEEDS_REVIEW | Pendiente |
| [#239](https://github.com/gclp96/zaping/pull/239) | feat(zfiles): verified private-byte staging core without release authority (03D1) | NEEDS_REVIEW | Pendiente |
| [#241](https://github.com/gclp96/zaping/pull/241) | feat(zfiles): least-privilege PostgreSQL promotion candidate reader (03D2A) | NEEDS_REVIEW | Pendiente |
| [#243](https://github.com/gclp96/zaping/pull/243) | feat(zfiles): auditable PostgreSQL private release transaction (03D2B) | NEEDS_REVIEW | Pendiente |
| [#247](https://github.com/gclp96/zaping/pull/247) | feat(zfiles): explicit read-only recovery of existing private objects (03D3A) | NEEDS_REVIEW | Pendiente |
| [#248](https://github.com/gclp96/zaping/pull/248) | test(zfiles): opt-in Cloudflare R2 private create-once and recovery QA (03D3B) | NEEDS_REVIEW | Pendiente |

## ZFiles consolidación (3)

**Criterio inicial:** Revisión de seguridad, duplicaciones y funcionalidades de main. No merge hasta gate.

| PR | Nombre | Estado de triage | Decisión final |
|---|---|---|---|
| [#253](https://github.com/gclp96/zaping/pull/253) | feat(zfiles): integrate fail-closed attachment read gate for receipts on modern main | NEEDS_REVIEW | Pendiente |
| [#255](https://github.com/gclp96/zaping/pull/255) | feat(zfiles): consolidate QA upload reservations and quarantine reconciliation | NEEDS_REVIEW | Pendiente |
| [#257](https://github.com/gclp96/zaping/pull/257) | feat(zfiles): receipt-native attachment metadata and QA-only read boundary | NEEDS_REVIEW | Pendiente |

## Documentos y Recepciones (7)

**Criterio inicial:** Comparar con SupplierDocument, PurchaseReceipt y #131 merged.

| PR | Nombre | Estado de triage | Decisión final |
|---|---|---|---|
| [#139](https://github.com/gclp96/zaping/pull/139) | docs(purchases): secure receipt-document links and attachments design (#132) | NEEDS_REVIEW | Pendiente |
| [#140](https://github.com/gclp96/zaping/pull/140) | feat(documents): receipt to supplier document links by ID (UX-PDOC-01A #132) | NEEDS_REVIEW | Pendiente |
| [#141](https://github.com/gclp96/zaping/pull/141) | feat(receipts): navigate to supplier documents by validated ID (#132) | NEEDS_REVIEW | Pendiente |
| [#142](https://github.com/gclp96/zaping/pull/142) | feat(receipts): select existing supplier documents and link by ID (#132) | NEEDS_REVIEW | Pendiente |
| [#144](https://github.com/gclp96/zaping/pull/144) | feat(receipts): unlink supplier document with reason (#132) | NEEDS_REVIEW | Pendiente |
| [#145](https://github.com/gclp96/zaping/pull/145) | feat(documents): private attachment metadata and scan gate (UX-PDOC-01B #132) | NEEDS_REVIEW | Pendiente |
| [#146](https://github.com/gclp96/zaping/pull/146) | feat(documents): authorize and integrity-check private attachment downloads (#132) | NEEDS_REVIEW | Pendiente |

## Correcciones de UI (2)

**Criterio inicial:** Validar si main ya contiene corrección; probar visual y compatibilidad.

| PR | Nombre | Estado de triage | Decisión final |
|---|---|---|---|
| [#137](https://github.com/gclp96/zaping/pull/137) | fix(ux): clarify supplier document net merchandise subtotal (#135) | NEEDS_REVIEW | Pendiente |
| [#138](https://github.com/gclp96/zaping/pull/138) | fix(receipts): conditional equipment section (#133) | NEEDS_REVIEW | Pendiente |

## Inventario FEFO (1)

**Criterio inicial:** Bloqueado por aceptación operativa; no activar sin UAT.

| PR | Nombre | Estado de triage | Decisión final |
|---|---|---|---|
| [#119](https://github.com/gclp96/zaping/pull/119) | feat(inventory): consumo FEFO autorizado sin lote para NONE/OPTIONAL | NEEDS_REVIEW | Pendiente |

## Smart Station (1)

**Criterio inicial:** Diseño fuera de freeze, preservar idea como backlog, no incorporar feature.

| PR | Nombre | Estado de triage | Decisión final |
|---|---|---|---|
| [#223](https://github.com/gclp96/zaping/pull/223) | docs: propuesta arquitectónica Zaping Smart Station y roadmap de piloto INSAP | DEFERRED | Cerrado sin merge 2026-11-06; preservar diseño en PR #223 |

## Evidencia y protocolo de cierre

1. Registrar SHA de main y SHA de head del PR antes de operaciones.
2. Identificar aportes únicos versus código/documentos ya incorporados a main, especialmente mediante PR #131 y #252.
3. Validar dependencias; un PR apilado puede cambiar de diff o perder su base al cerrar/borrar ramas previas.
4. Si se necesita código, crear una tarea de estabilización y extraer **solo el mínimo necesario** a qa/integration, sin activar flags, R2 ni migraciones operativas.
5. Si ya fue sustituido, comentar claramente la sustitución y cerrar sin merge; no eliminar rama hasta revisión de descendientes.
6. Registrar evidencia final. Conservar PR cerrado como historial consultable.

## Criterios de salida

- 47 decisiones finales registradas, con 0 PR heredados abiertos.
- Revisión del inventario de ramas remotas (165 al corte inicial), eliminación en orden seguro hasta dejar main y qa/integration.
- CI en los SHA finales y regresiones funcionales aceptadas.
- Gobernanza de agentes y protecciones de GitHub verificadas, no solo documentadas.
