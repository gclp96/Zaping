# Zaping Smart Station — arquitectura objetivo y discovery

**Producto:** Zaping Platform / Zaping Healthcare / ERP Core  
**Fecha:** 2026-11-03  
**Estado:** PROPOSED / DISCOVERY — no implementado ni aprobado para operación productiva  
**Piloto candidato:** INSAP, matriz Hermosillo (sin compromiso contractual ni fecha garantizada)  
**Referencias:** [arquitectura](ARCHITECTURE.md), [ADR](adr/ADR-SMART-STATION-001.md), [ruta de evolución](../project/ROADMAP.md), [Purchase Receipts](../modules/erp/PURCHASE_RECEIPTS.md), [Dispatch](../modules/healthcare/CASE_DISPATCH_TECHNICAL_DESIGN.md), [Return/Reconciliation](../modules/healthcare/CASE_RECONCILIATION_TECHNICAL_DESIGN.md).

## 1. Problema y objetivo

La propuesta originada con INSAP es una estación de captura física para: (a) recepción de compras; (b) preparación, validación y entrega de materiales y maletines para cirugías; (c) devolución y conciliación; (d) propuesta de remisión revisada por el técnico, posteriormente enviada al hospital o aseguradora para autorización externa. El objetivo es reducir captura manual y errores sin convertir una observación de cámara en una mutación autoritativa de inventario.

Se consideran kits de fábrica (sellados/desechables y reutilizables), kits armados por INSAP, kits mixtos, maletines reutilizables, consumibles, lote/caducidad y serial cuando aplique. **Kit lógico** no equivale a **maletín/activo físico**. Un kit sellado no demuestra por sí mismo el conteo de sus componentes internos: esa información debe provenir de la evidencia del fabricante y quedar distinguida de una inspección física.

## 2. Posición en la plataforma

Mantener el **monolito modular** Next.js → NestJS REST/JWT → Prisma/PostgreSQL. Smart Station es un **canal/adaptador de captura**, inicialmente integrado al backend, no un ERP paralelo ni un microservicio obligatorio.

```text
Cámara(s) / Lector fijo 2D / lector manual alterno / RFID opcional
                 ↓
Adapter de dispositivo + captura local (sin autoridad de inventario)
                 ↓ observaciones con identidad de estación/sesión
Zaping Smart Station API / orquestación de captura (NestJS)
                 ↓ validación de tenant + RBAC + correlación + revisión
         Resolver catálogo/códigos/lotes/seriales
                 ↓ propuesta revisable, NO movimiento físico confirmado
    ┌────────────┼──────────────────────┐
Purchase Receipts  CaseKit / Preparation  Return / Reconciliation
    │             │                      │
Inventory IN   Dispatch / Custody       Consumo conciliado
    └────────────┼──────────────────────┘
           Ledgers y entidades existentes
```

La estación puede ser utilizada sin IA, mediante lectura individual 2D, y luego admitir multilectura/cámaras. Los adaptadores deberán publicar datos con un contrato común, sin codificar reglas de Receipts o Healthcare dentro del driver. No abrir un writer paralelo que invoque Prisma fuera del dominio.

## 3. Contratos conceptuales candidatos (no schema vigente)

- **StationDevice**: ID lógico, companyId, ubicación, capacidad de captura, configuración, versión y estado; identidad de dispositivo independiente del usuario.
- **CaptureSession**: ID, companyId, actor, modo (RECEIPT | CASE_PREPARATION | CASE_RETURN), documento de referencia autorizado, timestamps y lifecycle de sesión.
- **DetectionObservation**: sessionId, fuente, identificador externo leído, evidencia opcional, timestamp, confidence opcional, bounding box opcional, correlación de captura; un resultado observado, **no una entrada de inventario**.
- **ResolvedCaptureItem**: producto candidato, unidad/packaging, lote, caducidad, serie opcional, cantidad inferida, evidencia y estado de validación/conflicto; cambios auditables.
- **CaptureProposal**: snapshot versionado de líneas aceptadas/rechazadas/revisadas; confirmación explícita por actor con roles del dominio y clave idempotente.

Son nombres de diseño sujetos a domain discovery. No migrar ni crear rutas sin revisar agregados y contratos ya implementados. Identificar una **unidad física** requiere segmentación/códigos por instancia; no asumir que N lecturas del mismo código significan N unidades, ni que una única etiqueta de caja permite contar piezas internas. Los campos extraídos mediante OCR o IA se tratan como sugerencias hasta su validación.

## 4. Fronteras y autoridad

**ERP Core — Purchase Receipts:** conserva autoridad exclusiva de recepción física, conciliación con compra, transacción, batches e Inventory IN. La estación prepara líneas; nunca incrementa Product.stock directamente ni repite movimientos.

**Healthcare — CaseKit / Preparation:** controla composición esperada versus preparada. La estación ayuda a verificar contenido, sin aprobar Preparation automáticamente ni convertir kit en asset por inferencia.

**Healthcare — Dispatch / Custody:** salida confirmada y transferencia de custodia son hechos del dominio. La captura no equivale a entrega, consumo ni venta. Reutilizar controles de permisos, idempotencia y locking de Dispatch.

**Healthcare — Return/Reconciliation:** diferencia `dispatched = used + returned + unresolved`. Faltante no equivale a consumido; reconocer equipos, sobrantes no reutilizables, daños, extravíos y necesidades de inspección/esterilización. La estación presenta propuesta para aprobación de reconciliation, no ejecuta una segunda baja de inventario.

**Remisión y aprobación externa:** propuesta comercial **TARGET** basada en conciliación y declaración explícita del técnico; hospital/aseguradora aprueba por canal externo definido posteriormente. No tratar la remisión como factura ni afirmar que existe un módulo de autorización externa. Diseñar estados, auditoría, responsables y rechazo/corrección antes de construir facturación.

## 5. Captura y niveles tecnológicos

1. **MVP: lectura individual** con lector fijo 2D/DataMatrix y entrada asistida; lectura de GTIN/producto y, si existe en código, lote, caducidad y serie.
2. **POC paralelo: multilectura visible** con cámara superior, buena luz, superficie delimitada y diez artículos, incluyendo artículos repetidos. Contar instancias, tratar oclusión, etiquetas idénticas, códigos no visibles y unidades/packaging; posibilidad de mover o girar manualmente.
3. **Opcional posterior: reconocimiento visual** por apariencia, con un catálogo controlado y revisión de baja confianza; no asumir que una imagen infiere lote ni caducidad.
4. **Alternativa RFID** solo después de confirmar necesidad de etiquetado, metales/líquidos, unidades versus empaques y costo. No comprar sistemas industriales en la etapa de discovery.

El sistema deberá mostrar explícitamente `DETECTED`, `UNRESOLVED`, `AMBIGUOUS` o `NEEDS_REVIEW` (nombres orientativos). Ninguna línea ambigua debe generar movimientos silenciosos. Modo manual siempre disponible.

## 6. Integridad, seguridad y operación

- Aislamiento multi-tenant en cada recurso, permiso por flujo, identidad de estación y del usuario, vínculo con almacén/sucursal y documento de referencia autorizado; mínimo privilegio.
- Capturas y reintentos deben ser **idempotentes**; deduplicación por sesión/captura/identidad de unidad y versionado de propuestas; revisar concurrencia al confirmar contra compra, stock, Case, Dispatch o Return.
- Fuente de verdad: transacciones de los dominios existentes. La lectura del hardware puede repetirse o fallar; no debe crear `InventoryMovement` hasta confirmación válida en el dominio competente.
- Evidencia de imagen: almacenamiento privado, TTL/retención mínima, control de acceso, enmascaramiento cuando corresponda, auditoría; no incorporar imágenes clínicas ni datos de pacientes al POC. R2 es una opción de almacenamiento ya seleccionada para Zaping Files, **no una integración Smart Station implementada**.
- Manejo de desconexión: no confirmar inventario offline; buffering/reintento requiere diseño separado y reconciliación de sesión.
- Para equipos reutilizables respetar EquipmentAsset, inspección, custodia y elegibilidad; no reutilizarlos automáticamente al volver.
- Observabilidad: errores de lectura, fallas de dispositivo, latencia, revisión humana, falsos positivos, incidencias y trazabilidad de confirmación.

## 7. Prueba de concepto y gates

Muestra inicial: **20–30 productos reales de INSAP** con variedad de marcas, empaques, formatos de código, lotes, seriales, duplicados y kits. Escenario controlado: colocar hasta diez unidades simultáneamente, comparar contra verdad-terreno manual.

Medir identificación por instancia, tasa de códigos leídos, conteo correcto, errores de lote/caducidad, tiempo por operación, porcentaje de revisión y tasa de falsos positivos; diferenciar `asistido` de `automático`. **Gate innegociable: cero confirmaciones silenciosas erróneas** en pruebas definidas (no constituye garantía estadística absoluta). Objetivos cuantitativos y muestra de aceptación operativa se aprobarán después de línea base; no inventar métricas ahora.

El piloto inicial de Hermosillo debe restringirse a flujos y operadores explícitamente autorizados, con fallback manual, QA por roles y regresión multiempresa. `MAIN`, staging y producción no se modifican por este documento.

## 8. Secuencia y decisiones pendientes

- DISCOVERY: entrevistar a almacén y técnico; mapear excepciones, maletines y remisiones; muestrear códigos, cantidades, packs y etiquetas.
- POC: lectura individual + experimento simultáneo con hardware disponible, sin escritor de inventario.
- DISEÑO: contrato de captura, identidad de estación, interfaces y autorizaciones; ADR revisado por equipo.
- PILOTO: integrar primero Purchase Receipts y después CaseKit/Dispatch/Return con doble validación funcional.
- ETAPA COMERCIAL: remisión preliminar confirmada por técnico, flujo de envío/aprobación externo; se negocia por separado.
- ESCALA: múltiples estaciones y sucursales, analítica y evaluación de reconocimiento visual/RFID.

**No comprometer estación automática para diciembre 2026.** Diciembre es un objetivo tentativo para piloto digital de alcance reducido, sujeto a preparación, QA y aceptación. Hardware, soporte, instalación, licencias, desarrollo, mantenimiento y propiedad intelectual se negocian como partidas separadas. La intención comercial es que Zaping conserve la PI del producto y que INSAP sea cliente/co-diseñador piloto; **se requiere contrato escrito**, no es una garantía legal derivada de este documento.
