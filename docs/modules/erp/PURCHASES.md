# Purchases — Zaping ERP

**Módulo:** Purchases
**Producto:** Zaping ERP Core
**Versión:** 2.2.0
**Estado:** Aprobado
**Estado de implementación:** PURCHASES V1 IMPLEMENTED / VALIDATED
**Última actualización:** 2026-08-27
**Responsable:** Zaping ERP Team

---

# 1. Propósito

Purchases administra el compromiso comercial mediante el cual una Company ordena
Products a un Supplier.

Su responsabilidad principal es responder:

```text
¿Qué se ordenó?

¿A qué Supplier?

¿Qué cantidad?

¿A qué valor?

¿En qué estado está la orden?

¿Cuánto se ha recibido?

¿Cuánto continúa pendiente?
```

Debe mantenerse una separación estricta entre:

```text
Purchase
→ commercial ordering fact
```

y:

```text
PurchaseReceipt
→ physical receiving fact
```

Principio fundamental:

```text
Purchase
≠
Inventory IN
```

La entrada física ocurre mediante:

```text
Valid PurchaseReceipt creation
→ Inventory IN
```

---

# 2. Ownership

Purchases es propietario de:

```text
Purchase

PurchaseItem

Purchase lifecycle

Supplier selection

ordered quantities

purchase commercial values

Purchase folio

Purchase totals

ordered / received / pending interpretation
```

Purchase Receipts es propietario del workflow físico de recepción.

Inventory es propietario de:

```text
stock mutation

InventoryMovement

InventoryBatch semantics

inventory balances
```

Equipment es propietario de:

```text
EquipmentAsset physical identity
```

cuando un Receipt recibe Products:

```text
inventoryTracking = ASSET
```

---

# 3. Fronteras de dominio

Debe mantenerse:

```text
Purchase
→ what was ordered
```

```text
PurchaseReceipt
→ what was physically received
```

```text
Inventory
→ resulting quantity / batch / movement effects
```

```text
Equipment
→ physical identities for received ASSET units
```

Purchases no es propietario de:

```text
Inventory stock

InventoryMovement

Inventory availability

Equipment lifecycle

Equipment condition

Sales

Customer Delivery

Healthcare Case Logistics

Supplier Accounts Payable

Supplier invoicing
```

---

# 4. CURRENT vs TARGET vs FUTURE

Este documento distingue:

## CURRENT

Capacidades implementadas actualmente.

## TARGET

Evoluciones aprobadas pendientes de implementación.

## FUTURE

Capacidades posteriores que requieren una necesidad funcional específica.

---

# 5. Estado CURRENT

Actualmente Purchases soporta:

```text
Purchase creation

Purchase list

DRAFT editing

DRAFT approval

DRAFT cancellation

Purchase PDF

Purchase detail experience

client-side search

client-side filters

Purchase deep-link

partial Receipts

multiple Receipts

received / pending calculation

Receipt history

Inventory traceability

ASSET provisioning traceability
```

Lifecycle actual:

```text
DRAFT

CONFIRMED

PARTIALLY_RECEIVED

RECEIVED

CANCELLED
```

---

# 6. Flujo principal

```text
Supplier
↓
Purchase DRAFT
↓
Approve
↓
Purchase CONFIRMED
↓
Physical receiving
↓
PurchaseReceipt
↓
Inventory IN
```

Cuando corresponde:

```text
PurchaseReceipt
↓
ASSET Product
↓
EquipmentAsset provisioning
```

---

# 7. Principio de orden vs recepción

Incorrecto:

```text
Purchase approved
↓
Inventory stock increases
```

Correcto:

```text
Purchase approved
↓
goods are expected
```

y posteriormente:

```text
PurchaseReceipt
↓
goods physically received
↓
Inventory IN
```

Esto permite modelar correctamente:

```text
delivery delays

partial shipments

multiple Receipts

pending quantities

physical differences
```

---

# 8. Entidades principales

Purchases utiliza principalmente:

```text
Purchase

PurchaseItem
```

y se relaciona con:

```text
Supplier

Product

Company

PurchaseReceipt

PurchaseReceiptItem
```

Purchase Receipts se integra posteriormente con:

```text
InventoryBatch

InventoryMovement

EquipmentAsset

User
```

según el caso.

---

# 9. Purchase

`Purchase` representa una orden de compra.

Conceptualmente conserva:

```text
id

companyId

folio

supplierId

subtotal

iva

total

status

createdAt

updatedAt

items

receipts
```

La estructura técnica exacta pertenece a:

```text
schema.prisma
```

---

# 10. PurchaseItem

Cada Purchase contiene una o más partidas.

Conceptualmente:

```text
Purchase
└── PurchaseItem
    ├── productId
    ├── quantity
    ├── price
    └── subtotal
```

`PurchaseItem` conserva el valor comercial persistido de la operación.

No debe depender permanentemente del valor actual de:

```text
Product.cost
```

---

# 11. PurchaseReceipt relationship

Una Purchase puede tener:

```text
0..N PurchaseReceipt
```

Conceptualmente:

```text
Purchase
├── Receipt 1
├── Receipt 2
└── Receipt N
```

Esto permite recepciones:

```text
partial

multiple

progressive
```

hasta completar las cantidades ordenadas.

Los detalles funcionales del Receipt pertenecen a:

```text
PURCHASE_RECEIPTS.md
```

---

# 12. Purchase lifecycle

Lifecycle vigente:

```text
DRAFT
↓
CONFIRMED
↓
PARTIALLY_RECEIVED
↓
RECEIVED
```

También:

```text
DRAFT
↓
CANCELLED
```

Una recepción completa puede producir directamente:

```text
CONFIRMED
↓
RECEIVED
```

sin pasar obligatoriamente por:

```text
PARTIALLY_RECEIVED
```

---

# 13. DRAFT

Una Purchase nueva comienza como:

```text
DRAFT
```

Representa una orden todavía editable y no confirmada.

Mientras permanezca en DRAFT pueden realizarse operaciones como:

```text
edit Supplier

edit Products

edit quantities

edit commercial values through supported workflow

approve

cancel
```

---

# 14. DRAFT no puede recibirse

Debe mantenerse:

```text
Purchase DRAFT
→ cannot receive goods
```

Primero debe existir:

```text
DRAFT
↓
Approve
↓
CONFIRMED
```

---

# 15. Edición después de DRAFT

Una vez que Purchase abandona:

```text
DRAFT
```

sus datos comerciales principales no deben editarse libremente.

Esto protege:

```text
Supplier

ordered quantities

commercial values

Product relationships

Receipt traceability
```

La edición normal de Purchase está restringida al estado DRAFT.

---

# 16. CONFIRMED

Approval produce:

```text
DRAFT
↓
CONFIRMED
```

Significa:

```text
the Purchase is confirmed
and may begin receiving goods
```

No significa:

```text
goods have already been physically received
```

---

# 17. Approval no modifica Inventory

Debe mantenerse:

```text
Purchase approval
→ no Product.stock increment
```

```text
Purchase approval
→ no InventoryMovement IN
```

```text
Purchase approval
→ no InventoryBatch creation
```

```text
Purchase approval
→ no EquipmentAsset provisioning
```

Todos esos efectos pertenecen al Receipt cuando corresponda.

---

# 18. PARTIALLY_RECEIVED

Cuando existe al menos una recepción válida, pero todavía quedan cantidades
pendientes:

```text
CONFIRMED
↓
PARTIALLY_RECEIVED
```

Conceptualmente:

```text
some quantity received
+
some quantity pending
```

---

# 19. RECEIVED

Cuando todas las cantidades ordenadas han sido recibidas:

```text
PARTIALLY_RECEIVED
↓
RECEIVED
```

o:

```text
CONFIRMED
↓
RECEIVED
```

si una sola Receipt completa la Purchase.

Una Purchase `RECEIVED` no acepta una nueva Receipt normal.

---

# 20. CANCELLED

Actualmente solo puede cancelarse:

```text
Purchase DRAFT
```

Flujo:

```text
DRAFT
↓
CANCELLED
```

La cancelación en otros estados es rechazada.

Debe mantenerse:

```text
CONFIRMED
PARTIALLY_RECEIVED
RECEIVED
→ not cancelled through current normal flow
```

---

# 21. CANCELLED no puede recibirse

Debe mantenerse:

```text
Purchase CANCELLED
→ no normal PurchaseReceipt
```

Si físicamente llega material relacionado con una orden cancelada, debe resolverse
mediante una decisión operacional explícita y no forzando el lifecycle normal.

---

# 22. Received status es derivado

El usuario no debe seleccionar manualmente:

```text
PARTIALLY_RECEIVED
```

o:

```text
RECEIVED
```

como simple edición de estado.

Esos estados deben derivarse de las cantidades reales recibidas.

---

# 23. Create Purchase

Para crear una Purchase se requiere conceptualmente:

```text
authenticated Company

valid Supplier

one or more Products

valid quantities

valid commercial values
```

Los recursos relacionados deben ser validados dentro del tenant autenticado.

---

# 24. Supplier validation — CURRENT

Actualmente backend valida que Supplier:

```text
exists

belongs to authenticated Company
```

Debe impedirse:

```text
Company A Purchase
→ Supplier Company B
```

---

# 25. Supplier active validation — PUR-ACTIVE-01

`PurchasesService.create()` y `update()` exigen un Supplier de la Company
autenticada con `isActive = true`. Primero se valida su existencia dentro de la
Company: recursos inexistentes o de otra empresa conservan `NotFoundException`.
Un proveedor de la empresa inactivo produce `BadRequestException` antes de
escribir o asignar un folio.

**Estado:** IMPLEMENTED — deuda de validación activa cerrada por PUR-ACTIVE-01.
Las consultas históricas no filtran por el estado activo del proveedor. No se
modifican aprobación, recepción ni reglas de folios.

---

# 26. Product validation — CURRENT

Los Products utilizados en Purchase deben:

```text
exist

belong to authenticated Company
```

Debe impedirse:

```text
Company A Purchase
→ Product Company B
```

---

# 27. Product active validation — PUR-ACTIVE-01

`PurchasesService.create()` y `update()` validan primero que todos los Products
pertenezcan a la Company autenticada. Una referencia inexistente o de otra
empresa conserva `NotFoundException`. Si alguno de los productos encontrados
está inactivo, se rechaza toda la operación con `BadRequestException`, antes de
escribir o asignar un folio; no se aceptan parcialmente las partidas activas.

**Estado:** IMPLEMENTED — deuda de validación activa cerrada por PUR-ACTIVE-01.
Las compras históricas continúan consultándose aunque sus productos se hayan
desactivado. Los costos, importes y movimientos de inventario no cambian.

---

# 28. Product tracking configuration

Purchase puede ordenar Products con distintas configuraciones:

```text
inventoryTracking

lotTracking
```

Purchase no ejecuta por sí misma la semántica física de esas configuraciones.

Debe mantenerse:

```text
Purchase
→ ordered Product + quantity + commercial value
```

mientras:

```text
PurchaseReceipt
→ physical tracking enforcement
```

---

# 29. ProductInventoryTracking

Products puede utilizar:

```text
QUANTITY

SERIALIZED

ASSET
```

La Purchase puede referenciar el Product independientemente de esa estrategia.

Los efectos físicos se aplican posteriormente durante los workflows compatibles.

---

# 30. ProductLotTracking

Products utiliza:

```text
NONE

OPTIONAL

REQUIRED
```

La Purchase no captura por sí sola el lote físico de la mercancía todavía no
recibida.

La aplicación de esas reglas pertenece al Receipt.

---

# 31. Productos duplicados

Una misma Purchase no debe contener dos partidas del mismo Product sin una razón
explícita de negocio.

La implementación actual rechaza Products duplicados dentro de la misma Purchase.

Preferir:

```text
Product A × 10
```

sobre:

```text
Product A × 4
Product A × 6
```

---

# 32. Quantity

La cantidad ordenada actual utiliza:

```text
integer >= 1
```

El soporte de cantidades fraccionarias requeriría una futura evolución coordinada
con:

```text
Products

Inventory

Purchases

Sales
```

---

# 33. Commercial unit value

Durante creación/edición, Purchase utiliza el valor comercial correspondiente al
Product según el workflow vigente.

`PurchaseItem` conserva un snapshot persistido.

Debe mantenerse:

```text
Product.cost changes later
≠
rewrite historical PurchaseItem value
```

La representación técnica exacta del campo pertenece al schema y al código actual.

---

# 34. Totales

Conceptualmente:

```text
Item subtotal
=
quantity × unit value
```

```text
Purchase subtotal
=
Σ item subtotals
```

El flujo vigente utiliza:

```text
IVA = 16%
```

según la implementación actual.

La estrategia fiscal completa pertenece a una futura evolución de Billing /
configuración tributaria.

---

# 35. Monetary representation

La implementación actual conserva representación monetaria histórica basada en el
modelo existente.

Antes de ampliar significativamente:

```text
Billing

CFDI

Accounting

financial reports
```

deberá revisarse de manera transversal:

```text
precision

rounding

currency

Prisma representation
```

Purchases no redefine por sí solo esa arquitectura.

---

# 36. Folio

Purchase utiliza:

```text
folio
```

como identificador empresarial separado del UUID técnico.

Debe mantenerse:

```text
id
→ technical identity
```

```text
folio
→ business-facing Purchase identity
```

El formato exacto vigente pertenece a la implementación.

---

# 37. Purchase PDF

Purchase puede generar:

```text
PDF
```

representando la orden comercial.

Puede incluir información como:

```text
Company

Supplier

folio

date

status

Products

quantities

commercial values

subtotal

IVA

total
```

---

# 38. Purchase PDF ≠ Receipt evidence

Debe mantenerse:

```text
Purchase PDF
≠
proof of physical receipt
```

Una Purchase documenta lo ordenado.

Purchase Receipt documenta lo físicamente recibido.

Actualmente:

```text
Purchase PDF
→ IMPLEMENTED
```

mientras:

```text
PurchaseReceipt PDF
→ NOT IMPLEMENTED
```

---

# 39. Ordered Quantity

Para cada `PurchaseItem`:

```text
Ordered Quantity
=
PurchaseItem.quantity
```

---

# 40. Received Quantity

Conceptualmente:

```text
Received Quantity
=
Σ PurchaseReceiptItem.quantityReceived
```

para el mismo:

```text
purchaseItemId
```

---

# 41. Pending Quantity

Debe mantenerse:

```text
Pending Quantity
=
Ordered Quantity
-
Received Quantity
```

Ejemplo:

```text
Ordered: 10
Received: 4
Pending: 6
```

---

# 42. Partial Receipts

Una Purchase puede recibirse progresivamente.

Ejemplo:

```text
Purchase
Quantity: 100

Receipt 1
40

Receipt 2
30

Pending
30
```

Esto es comportamiento CURRENT.

---

# 43. Multiple Receipt Items

Una PurchaseReceipt puede recibir múltiples PurchaseItems dentro de una misma
operación.

Ejemplo:

```text
Receipt

Product A × 10
Product B × 4
Product C × 2
```

La especificación completa pertenece a `PURCHASE_RECEIPTS.md`.

---

# 44. No duplicated PurchaseItem in one Receipt

Debe mantenerse:

```text
same purchaseItemId
→ only once inside one Receipt request
```

Incorrecto:

```text
PurchaseItem A × 2

PurchaseItem A × 3
```

Preferir:

```text
PurchaseItem A × 5
```

---

# 45. PurchaseItem ownership

Toda partida recibida debe pertenecer realmente a la Purchase indicada.

Debe rechazarse:

```text
Purchase A
↓
Receipt
↓
PurchaseItem from Purchase B
```

aunque ambos recursos pertenezcan al mismo tenant.

---

# 46. Over-receipt protection

Debe mantenerse:

```text
new quantityReceived
<=
pendingQuantity
```

Nunca debe ocurrir mediante el flujo normal:

```text
total received
>
ordered quantity
```

El backend debe recalcular el pendiente y no confiar únicamente en restricciones
frontend.

---

# 47. PurchaseReceipt como hecho físico

Actualmente PurchaseReceipt no tiene lifecycle separado:

```text
DRAFT
↓
CONFIRMED
```

Registrar válidamente:

```text
POST /purchase-receipts
```

constituye directamente el hecho físico.

Debe mantenerse:

```text
Valid PurchaseReceipt creation
→ Inventory effect
```

No existe una operación adicional:

```text
Confirm PurchaseReceipt
```

en el workflow CURRENT.

---

# 48. Receipt lot rules

Las reglas vigentes dependen de:

```text
Product.lotTracking
```

---

# 49. LotTracking NONE

```text
NONE
```

significa:

```text
lotNumber
→ not allowed
```

```text
expirationDate
→ not allowed
```

---

# 50. LotTracking OPTIONAL

```text
OPTIONAL
```

significa:

```text
lotNumber
→ optional
```

Cuando se proporciona:

```text
expirationDate
```

debe existir:

```text
lotNumber
```

---

# 51. LotTracking REQUIRED

```text
REQUIRED
```

significa:

```text
lotNumber
→ required
```

mientras:

```text
expirationDate
→ optional
```

No debe documentarse aquí una comparación de `expirationDate` contra
`receivedAt` como invariante vigente si no forma parte del contrato confirmado.

---

# 52. InventoryBatch integration

Cuando corresponde utilizar lote:

```text
PurchaseReceiptItem
↓
InventoryBatch
```

El Receipt puede crear o reutilizar la representación de Batch según la
implementación vigente.

La estructura exacta y sus invariantes pertenecen a:

```text
INVENTORY.md

schema.prisma
```

Purchases no redefine `InventoryBatch`.

---

# 53. Receipt unit cost

PurchaseReceiptItem conserva el valor correspondiente a la PurchaseItem de origen
según la implementación vigente.

Esto permite mantener trazabilidad:

```text
Purchase
↓
PurchaseItem
↓
PurchaseReceiptItem
↓
Inventory effects
```

La normalización completa del modelo de costos continúa siendo una preocupación
transversal entre Purchases, Receipts e Inventory.

---

# 54. InventoryMovement reference — CURRENT

Los movimientos generados por Receipt utilizan la recepción física como
referencia.

Conceptualmente:

```text
movementType = IN

referenceType = PURCHASE_RECEIPT

referenceId = PurchaseReceipt.id
```

Debe mantenerse:

```text
Purchase approval
≠
physical movement reference
```

---

# 55. Receipt transaction boundary

Purchase Receipt coordina una operación transaccional que puede incluir:

```text
PurchaseReceipt

+

PurchaseReceiptItems

+

InventoryBatch when applicable

+

EquipmentAsset provisioning when ASSET

+

Product.stock

+

InventoryMovement IN

+

Purchase status recalculation
```

Los efectos inseparables deben completarse o revertirse juntos.

---

# 56. Receipt atomicity

No debe ocurrir:

```text
Receipt persisted
+
Inventory mutation missing
```

ni:

```text
Inventory increased
+
Receipt missing
```

ni, para ASSET:

```text
stock increased
+
required EquipmentAsset identities missing
```

cuando el provisioning forma parte de esa misma operación.

---

# 57. Receipt idempotency — CURRENT

`POST /purchase-receipts` utiliza:

```text
Idempotency-Key
```

La protección actual incluye:

```text
tenant-scoped key

request hash

same key + same payload
→ replay

same key + different payload
→ 409 Conflict

Serializable transaction

P2002 recovery path
```

Estado:

```text
PurchaseReceipt creation idempotency
→ IMPLEMENTED / VALIDATED
```

Permanece como deuda:

```text
real simultaneous PostgreSQL concurrency race QA
```

La especificación completa pertenece a:

```text
PURCHASE_RECEIPTS.md
```

---

# 58. Purchase creation idempotency

Debe distinguirse de Receipt.

Actualmente:

```text
POST /purchases
→ no formal idempotency contract
```

Por tanto:

```text
Purchase creation idempotency
→ TECHNICAL DEBT
```

No debe confundirse con la idempotencia ya implementada para Purchase Receipts.

---

# 59. ASSET provisioning relationship

Cuando un Receipt recibe:

```text
Product.inventoryTracking = ASSET
```

entonces:

```text
quantityReceived = N
↓
N EquipmentAsset
```

según las reglas de Core Equipment.

Purchase no crea EquipmentAsset al ser aprobada.

Debe mantenerse:

```text
Purchase
→ ordered quantity
```

```text
PurchaseReceipt
→ physical received quantity
```

```text
Equipment
→ physical ASSET identities
```

---

# 60. No duplicate Inventory mutation

Cuando Purchase Receipt crea EquipmentAsset:

```text
Equipment provisioning
→ does not increment Product.stock again
```

y:

```text
Equipment provisioning
→ does not create another InventoryMovement per asset
```

Purchase Receipt continúa siendo propietario de:

```text
Inventory IN
```

---

# 61. Purchase status after Receipt

Después de registrar una Receipt válida:

```text
remaining pending quantity
→ PARTIALLY_RECEIVED
```

```text
all quantities complete
→ RECEIVED
```

El estado debe derivarse de las cantidades reales.

---

# 62. No manual received status

No debe existir una operación normal como:

```text
User
→ select RECEIVED
```

sin comprobar:

```text
received quantities
```

El lifecycle debe reflejar el progreso físico real.

---

# 63. receivedBy

Purchase Receipt conserva el actor correspondiente según el workflow vigente.

Debe derivarse del contexto autenticado.

Frontend no debe utilizar un `userId` arbitrario como autoridad del evento físico.

La semántica detallada pertenece a `PURCHASE_RECEIPTS.md`.

---

# 64. receivedAt

Purchase Receipt conserva:

```text
receivedAt
```

según la implementación vigente.

Representa el momento reconocido para la recepción física.

No debe confundirse necesariamente con:

```text
createdAt
```

si la arquitectura futura diferencia ambos conceptos.

---

# 65. Receipt notes

Las notas pueden complementar contexto administrativo.

No deben sustituir datos estructurados como:

```text
quantity

lot

expiration

Product

responsible actor
```

---

# 66. Receipt history immutability

Una Receipt que ya produjo efectos físicos no debe editarse libremente para
reescribir:

```text
quantityReceived

Product

lot

Batch

unit value
```

sin una operación de corrección explícita.

---

# 67. Receipt correction / reversal

Actualmente:

```text
Receipt correction
→ NOT IMPLEMENTED
```

```text
Receipt reversal
→ NOT IMPLEMENTED
```

Una futura solución deberá conservar la historia original y producir una operación
correctiva o compensatoria.

Debe evitarse:

```text
historical Receipt quantity
10
→ silently edited to 4
```

después de haber afectado Inventory.

---

# 68. Supplier Return — FUTURE

Supplier Return representa un hecho diferente de Purchase Receipt.

Conceptualmente:

```text
PurchaseReceipt
↓
Inventory
↓
Supplier Return
↓
Inventory OUT / disposition according to future design
```

No debe modificarse la Receipt original para representar una devolución posterior.

Estado:

```text
Supplier Returns
→ FUTURE / DEFERRED
```

No es un bloqueo del ERP Core V1 actual.

---

# 69. Purchase con Receipts existentes

Una Purchase con recepción parcial o completa no debe desaparecer ni reescribir
sus efectos históricos.

Debe mantenerse:

```text
Purchase history
+
Receipt history
+
Inventory history
```

como hechos relacionados pero distintos.

---

# 70. Multi-tenancy

Todas las operaciones Purchase deben ejecutarse dentro de la Company autenticada.

Debe mantenerse:

```text
Purchase.companyId

Supplier.companyId

Product.companyId

PurchaseReceipt.companyId
```

alineados con el tenant correspondiente.

---

# 71. ID security

Conocer un UUID como:

```text
purchaseId

purchaseItemId

supplierId

productId
```

de otra Company no concede acceso.

Backend debe validar ownership, no únicamente existencia global.

---

# 72. Authorization

Purchases utiliza la arquitectura transversal de Identity & Access.

Permisos conceptuales futuros pueden incluir:

```text
purchases.read

purchases.create

purchases.update

purchases.approve

purchases.cancel

purchaseReceipts.create
```

Estos nombres representan una dirección TARGET.

No deben interpretarse como un catálogo Permission-Based RBAC completamente
implementado actualmente.

---

# 73. Security work before production

Purchases participa en la revisión transversal de:

```text
critical endpoint authorization

systematic tenant-isolation regression

inactive-user enforcement

safe role provisioning
```

Además debe cerrarse la validación backend de:

```text
inactive Supplier

inactive Product
```

antes de considerar definitivo el uso de recursos en nuevas Purchases.

---

# 74. Audit — TARGET

Una futura plataforma transversal de Audit podrá registrar eventos como:

```text
Purchase created

Purchase updated

Purchase approved

Purchase cancelled

PurchaseReceipt registered
```

Actualmente existen hechos persistidos y metadatos operacionales, pero no un
Audit transversal completo.

---

# 75. Purchase API — CURRENT

Endpoints actuales relevantes:

```text
GET   /purchases

POST  /purchases

PATCH /purchases/:id

PATCH /purchases/:id/approve

PATCH /purchases/:id/cancel

GET   /purchases/:id/pdf
```

---

# 76. Purchase detail endpoint — CURRENT

Actualmente existe:

```text
GET /purchases/:id
```

La experiencia canónica de detalle es:

```text
/purchases/:id
→ Purchase 360
→ GET /purchases/:id
```

El listado de Purchases no es fuente de detalle completo. El folio de cada fila
navega a la ruta canónica:

```text
/purchases/<id>
```

La URL legacy:

```text
/purchases?purchaseId=<id>
```

permanece únicamente como compatibility redirect temporal hacia:

```text
/purchases/<id>
```

No es una segunda UI/API de detalle y no debe mantenerse indefinidamente sin
decisión explícita.

---

# 77. PurchaseReceipt API — CURRENT

Endpoints relacionados:

```text
POST /purchase-receipts

GET /purchase-receipts

GET /purchase-receipts/:id

GET /purchase-receipts/purchase/:purchaseId
```

La fuente canónica de esos endpoints es:

```text
PURCHASE_RECEIPTS.md
```

---

# 78. API nesting future

Una futura API podría evaluar contratos como:

```text
POST /purchases/:purchaseId/receipts
```

pero no debe realizarse un refactor únicamente por estética de URL.

El contrato actual es válido mientras permanezca consistente y mantenible.

---

# 79. Frontend Purchases V1

La experiencia `/purchases` soporta actualmente:

```text
Purchase list

folio navigation to /purchases/:id

create Purchase

edit DRAFT

approve DRAFT

cancel DRAFT

Purchase 360 canonical detail

Purchase PDF

Receipt registration

Receipt history

Inventory traceability

search

status / Supplier / Desde / Hasta filters

loading

error

retry

empty states
```

---

# 80. Search CURRENT

La búsqueda client-side puede considerar campos como:

```text
folio

Supplier

Supplier contact

Supplier email

SKU

Product
```

sobre las relaciones actualmente cargadas.

---

# 81. Filters CURRENT

El workspace permite actualmente:

```text
status filter

Supplier filter

date range filter:
Desde / Hasta

combined filters
```

Los filtros se aplican sobre datos ya cargados. Las fechas de Purchases se
interpretan con:

```text
Company.timezone
```

para evitar depender de la zona horaria del navegador.

Actualmente:

```text
server-side Purchase filtering
→ NOT IMPLEMENTED
```

---

# 82. Purchase legacy URL compatibility

Existe:

```text
/purchases?purchaseId=<id>
```

pero actualmente funciona sólo como redirect temporal de compatibilidad:

```text
/purchases?purchaseId=<id>
→ /purchases/<id>
```

El detalle real se resuelve siempre por:

```text
GET /purchases/:id
```

No existe `PurchaseDetailModal` como superficie vigente de detalle.

---

# 83. Purchase 360 canonical detail

La experiencia de detalle permite comprender:

```text
Supplier

ordered Items

Purchase status

commercial totals

Receipts

received quantities

pending quantities

Inventory-related traceability
```

Esta superficie ya existe como ruta dedicada `/purchases/:id`.

---

# 84. Contextual actions

Las acciones dependen del lifecycle.

```text
DRAFT
→ Edit
→ Approve
→ Cancel
```

```text
CONFIRMED
→ Register Receipt
```

```text
PARTIALLY_RECEIVED
→ Register remaining Receipt
```

```text
RECEIVED
→ Review history
```

```text
CANCELLED
→ historical/read-only context
```

---

# 85. Receipt from Purchase context

Cuando una Receipt inicia desde una Purchase, el sistema ya conoce:

```text
Purchase

Supplier

PurchaseItems

Ordered Quantity

Received Quantity

Pending Quantity
```

No debe obligar al usuario a volver a seleccionar datos ya determinados por el
contexto.

---

# 86. Receipt form

El frontend puede mostrar por partida:

```text
Product

Ordered

Received

Pending

Quantity to receive

Lot when applicable

Expiration when applicable
```

La visibilidad y obligatoriedad deben alinearse con:

```text
Product.lotTracking
```

---

# 87. UI validation

Frontend puede prevenir errores como:

```text
no received quantity

quantity < 1

quantity > pending

lot missing when REQUIRED

expiration without lot when OPTIONAL
```

Pero backend debe repetir las validaciones críticas.

---

# 88. Operation feedback

Acciones como:

```text
create Purchase

approve

cancel

generate PDF

register Receipt
```

deben mantener estados independientes de:

```text
loading

success

error
```

para que el usuario pueda distinguir claramente qué operación terminó o falló.

---

# 89. Receipt success handoff

Después de una Receipt válida, frontend conserva la identidad real devuelta por
backend.

Puede mostrar:

```text
Receipt folio

success state

View Receipt
```

y navegar al detalle dedicado correspondiente.

La especificación completa pertenece a:

```text
PURCHASE_RECEIPTS.md
```

---

# 90. Warehouse operations — FUTURE

Un futuro workspace de Warehouse podrá utilizar Purchases en estados:

```text
CONFIRMED

PARTIALLY_RECEIVED
```

para representar:

```text
pending receiving work
```

sin convertir Warehouse en propietario del Purchase lifecycle.

---

# 91. Multi-Warehouse — FUTURE

Cuando exista Multi-Warehouse, Purchase Receipt podrá necesitar indicar el destino
físico correspondiente.

Conceptualmente:

```text
PurchaseReceipt
↓
Warehouse / InventoryLocation
↓
Inventory IN
```

Esto no cambia:

```text
Purchase
≠
Inventory IN
```

---

# 92. Replenishment — FUTURE

Inventory podrá generar señales o recomendaciones basadas en:

```text
stock

minStock

consumption

lead time

pending Purchases
```

Esto genera intención de abastecimiento.

No genera Inventory automáticamente.

---

# 93. Purchase Requests / approvals — FUTURE

Capacidades futuras pueden incluir:

```text
Purchase Request

multi-step approval

approval limits

budget validation

Supplier quotation comparison
```

No forman parte de Purchase V1.

---

# 94. Accounts Payable — FUTURE

Purchases puede integrarse posteriormente con:

```text
Supplier invoices

Accounts Payable

invoice matching

payment status
```

pero estos dominios no pertenecen al alcance actual.

---

# 95. Barcode / QR receiving — FUTURE

Purchase Receipt podrá incorporar posteriormente:

```text
barcode

QR

scanner
```

para acelerar identificación de:

```text
Product

lot

physical units
```

sin debilitar las validaciones backend.

---

# 96. Historical imports — FUTURE

Importaciones de Purchases históricas deberán distinguir:

```text
historical commercial record
```

de:

```text
new physical PurchaseReceipt
```

para evitar generar stock accidentalmente durante una migración.

---

# 97. Healthcare boundary

Purchases no conoce Healthcare Cases.

La trazabilidad Core actual puede ser:

```text
Purchase
↓
PurchaseReceipt
↓
InventoryBatch when applicable
↓
InventoryMovement
```

y, para ASSET:

```text
PurchaseReceipt
↓
EquipmentAsset
```

Healthcare podrá consumir posteriormente esa procedencia.

Debe mantenerse:

```text
Purchases
→ no Case dependency
```

---

# 98. Healthcare TARGET

En el futuro Healthcare podrá utilizar inventario cuya procedencia sea:

```text
Purchase
↓
PurchaseReceipt
↓
Inventory / Equipment
```

y posteriormente relacionarlo con:

```text
Case

Assignment

Dispatch

Custody

Return
```

sin trasladar esas relaciones al modelo Purchase.

---

# 99. IMPLEMENTED — Purchase

Actualmente:

```text
Purchase creation

Purchase list

DRAFT editing

DRAFT approval

DRAFT cancellation

DRAFT / CONFIRMED / PARTIALLY_RECEIVED / RECEIVED / CANCELLED

Purchase folio

Purchase totals

Purchase PDF

client-side search

client-side status filter

client-side Supplier filter

Purchase deep-link

Receipt history integration
```

---

# 100. IMPLEMENTED — Receipt integration

Actualmente la integración relacionada incluye:

```text
partial Receipts

multiple Receipts

pending quantity calculation

over-receipt protection

ProductLotTracking NONE

ProductLotTracking OPTIONAL

ProductLotTracking REQUIRED

InventoryBatch integration

InventoryMovement IN

Product.stock increment

Purchase status recalculation

ASSET Equipment provisioning

Receipt idempotency

Receipt detail

Receipt traceability
```

La fuente canónica del detalle físico es:

```text
PURCHASE_RECEIPTS.md
```

---

# 101. VALIDATED

La validación registrada cubre, según los hitos correspondientes:

```text
Purchase creation

DRAFT editing

approval

cancellation

approval without Inventory mutation

partial Receipt

full Receipt

pending quantity

over-receipt protection

Inventory IN

ASSET provisioning

Receipt idempotency

Purchase → Receipt handoff

Receipt detail

Inventory traceability

frontend search / filters

Purchase deep-link
```

Los gates técnicos incluyen:

```text
tests

build

lint

git diff --check
```

y Prisma validation/status cuando corresponde.

Los totales específicos se registran en:

```text
PROJECT_BOARD.md

CHANGELOG.md
```

---

# 102. TECHNICAL DEBT — Purchase

PUR-ACTIVE-01 cierra la validación de Supplier/Product activos en create/update;
contrato y alcance en las secciones 25 y 27.

Permanece pendiente:

```text
Purchase creation idempotency
```

```text
backend pagination
```

```text
server-side search/filtering
```

```text
future cleanup of legacy purchaseId compatibility redirect
```

---

# 103. RELATED RECEIPT DEBT

Relacionada con Purchases, pero propiedad de Purchase Receipts:

```text
Receipt correction
```

```text
Receipt reversal
```

```text
Receipt PDF
```

```text
real simultaneous PostgreSQL idempotency race QA
```

No deben confundirse con deuda del lifecycle de Purchase.

---

# 104. TARGET

Evoluciones posteriores pueden incluir:

```text
improved Audit integration

granular permissions

OpenAPI documentation improvements

Multi-Warehouse Receipt destination

Supplier Returns
```

Estas capacidades no son necesarias para considerar funcional Purchase V1.

---

# 105. FUTURE

Capacidades posteriores posibles:

```text
Purchase Requests

advanced approval workflows

Supplier quotations

expected delivery dates

backorders

Accounts Payable

supplier invoice matching

purchase analytics

automated replenishment recommendations

barcode / QR receiving
```

No deben considerarse alcance actual únicamente por aparecer aquí.

---

# 106. Invariantes

## Purchase approval

```text
Purchase DRAFT
→ Approve
→ CONFIRMED
```

No:

```text
Approve
→ Inventory IN
```

---

## Inventory

```text
Purchase
≠
Inventory IN
```

---

## Receipt

```text
Valid PurchaseReceipt creation
→ physical receipt
→ Inventory IN
```

---

## Receipt lifecycle

```text
PurchaseReceipt
→ no separate CONFIRMED state currently
```

---

## Quantity

```text
Received Quantity
<=
Ordered Quantity
```

---

## Pending

```text
Pending
=
Ordered
-
Received
```

---

## Status

```text
Purchase PARTIALLY_RECEIVED / RECEIVED
→ derived from Receipt quantities
```

---

## DRAFT

```text
DRAFT
→ editable
→ approvable
→ cancellable
→ not receivable
```

---

## CONFIRMED

```text
CONFIRMED
→ receivable
→ not normal master-data editable
```

---

## RECEIVED

```text
RECEIVED
→ no additional normal Receipt
```

---

## CANCELLED

```text
CANCELLED
→ no normal Receipt
```

---

## Tenant

```text
Purchase Supplier
→ same Company
```

```text
Purchase Product
→ same Company
```

```text
PurchaseReceipt
→ same Company
```

---

## Receipt item

```text
PurchaseReceiptItem
→ belongs to Purchase
```

---

## Lot NONE

```text
NONE
→ no lot
→ no expiration
```

---

## Lot OPTIONAL

```text
OPTIONAL
→ lot optional
→ expiration requires lot
```

---

## Lot REQUIRED

```text
REQUIRED
→ lot required
```

---

## Atomicity

```text
Receipt physical effects
→ atomic
```

---

## Equipment

```text
Purchase approval
≠
EquipmentAsset creation
```

```text
ASSET Receipt
→ EquipmentAsset provisioning
```

---

# 107. Anti-patrones

## Inventory on approval

```text
Approve Purchase
→ stock += ordered quantity
```

Incorrecto.

---

## PurchaseReceipt CONFIRMED

Inventar un estado:

```text
PurchaseReceipt CONFIRMED
```

como requisito actual.

Incorrecto.

---

## Manual received state

```text
User selects RECEIVED
```

sin verificar cantidades.

Incorrecto.

---

## Over-receipt

```text
Ordered = 10
Received = 13
```

sin workflow excepcional explícito.

Incorrecto.

---

## Editing Receipt history

Modificar silenciosamente una Receipt después de que produjo Inventory.

Incorrecto.

---

## Cross-tenant Supplier

```text
Purchase Company A
→ Supplier Company B
```

Incorrecto.

---

## Cross-tenant Product

```text
Purchase Company A
→ Product Company B
```

Incorrecto.

---

## Frontend-only active validation

Confiar únicamente en que UI mostró Suppliers/Products activos sin validar backend.

Incorrecto como arquitectura definitiva.

---

## Old lot flags

Reintroducir:

```text
requiresLotTracking

requiresExpirationTracking

requiresSerialTracking
```

cuando ya existen:

```text
inventoryTracking

lotTracking
```

Incorrecto.

---

## Notes as structured data

Guardar exclusivamente dentro de notas:

```text
lot

quantity

expiration

responsible actor
```

Incorrecto.

---

## Supplier Return by rewriting Receipt

Editar Receipt original para representar una devolución posterior.

Incorrecto.

---

# 108. Relación con Products

Products define:

```text
Product identity

inventoryTracking

lotTracking
```

Purchases define:

```text
ordered quantity

commercial Purchase value
```

Purchase Receipts aplica el tracking físico correspondiente.

---

# 109. Relación con Suppliers

Supplier identifica al proveedor comercial de la Purchase.

Debe mantenerse:

```text
Purchase
→ Supplier relationship
```

y:

```text
Supplier historical deactivation
→ does not erase Purchase history
```

La validación backend de Supplier activo para nuevas Purchases permanece como
deuda.

---

# 110. Relación con Purchase Receipts

Debe mantenerse:

```text
PURCHASES.md
→ what was ordered
```

```text
PURCHASE_RECEIPTS.md
→ what was physically received
```

Este documento no es la fuente canónica de la implementación detallada de Receipt.

---

# 111. Relación con Inventory

Purchase no modifica Inventory al aprobarse.

Purchase Receipt produce:

```text
InventoryMovement IN

Product.stock increment

InventoryBatch when applicable
```

La semántica resultante pertenece a:

```text
INVENTORY.md
```

---

# 112. Relación con Equipment

Para Products ASSET:

```text
PurchaseReceipt
↓
Equipment provisioning
↓
EquipmentAsset
```

Purchases no administra:

```text
assetCode

serial

lifecycle

condition

Inspection

Retirement
```

Estas reglas pertenecen a:

```text
EQUIPMENT.md
```

---

# 113. ADR relacionados

```text
ADR-001 — Multi-Tenant

ADR-002 — Inventory Movements

ADR-005 — Layered Architecture

ADR-006 — API First

ADR-007 — RBAC

ADR-009 — Modular Monolith

ADR-012 — Entity Lifecycle
```

---

# 114. Documentación relacionada

```text
docs/modules/erp/SUPPLIERS.md

docs/modules/erp/PRODUCTS.md

docs/modules/erp/PURCHASE_RECEIPTS.md

docs/modules/erp/INVENTORY.md

docs/modules/erp/EQUIPMENT.md

docs/modules/erp/IDENTITY_ACCESS.md

docs/architecture/ARCHITECTURE.md

docs/engineering/API_GUIDELINES.md

docs/engineering/SECURITY_PRINCIPLES.md

docs/project/PROJECT_BOARD.md

docs/project/ROADMAP.md

docs/project/CHANGELOG.md
```

---

# 115. Fuente de verdad

```text
PURCHASES.md
→ Purchase lifecycle
→ ordered quantities
→ Supplier relationship
→ commercial Purchase behavior
```

```text
PURCHASE_RECEIPTS.md
→ physical receiving
→ lot rules
→ Receipt idempotency
→ Inventory mutation orchestration
→ ASSET provisioning
```

```text
INVENTORY.md
→ stock / movement / Batch semantics
```

```text
EQUIPMENT.md
→ EquipmentAsset identity
```

```text
PRODUCTS.md
→ Product tracking configuration
```

```text
SUPPLIERS.md
→ Supplier lifecycle
```

```text
schema.prisma
→ CURRENT persistence
```

```text
Purchases backend
→ CURRENT Purchase implementation
```

```text
Purchase Receipts backend
→ CURRENT Receipt implementation
```

```text
tests
→ validated behavior
```

```text
PROJECT_BOARD.md
→ current project status and debt
```

```text
CHANGELOG.md
→ historical implementation evolution
```

---

# 116. Estado consolidado

```text
Purchase creation
✅ IMPLEMENTED / VALIDATED

Purchase list
✅ IMPLEMENTED / VALIDATED

DRAFT editing
✅ IMPLEMENTED / VALIDATED

DRAFT approval
✅ IMPLEMENTED / VALIDATED

DRAFT cancellation
✅ IMPLEMENTED / VALIDATED

Purchase PDF
✅ IMPLEMENTED / VALIDATED

DRAFT
✅

CONFIRMED
✅

PARTIALLY_RECEIVED
✅

RECEIVED
✅

CANCELLED
✅

client-side Purchase search/filtering
✅

Purchase deep-link
✅
```

Receipt integration:

```text
Partial Receipts
✅

Multiple Receipts
✅

Pending quantity
✅

Over-receipt protection
✅

ProductLotTracking rules
✅

InventoryBatch integration
✅

InventoryMovement IN
✅

Product.stock IN
✅

ASSET provisioning
✅

Receipt idempotency
✅

Receipt detail / handoff
✅
```

Purchase debt:

```text
Supplier active backend enforcement
⏳

Product active backend enforcement
⏳

Purchase creation idempotency
⏳

backend pagination
⏳

server-side search/filtering
⏳
```

Related Receipt debt:

```text
Receipt correction / reversal
⏳

Receipt PDF
⏳

real simultaneous PostgreSQL idempotency race QA
⏳
```

---

# 117. Secuencia de proyecto

Purchases V1 forma parte del ERP Core normalizado.

La secuencia vigente es:

```text
H8 Documentation / Technical Regression
↓
UX-B.6 Full ERP End-to-End QA
↓
ERP Core V1 Closure
↓
Healthcare specialization
```

Por tanto, capacidades como:

```text
Supplier Returns

advanced approvals

Multi-Warehouse

replenishment
```

no deben convertirse automáticamente en el siguiente sprint únicamente por estar
documentadas.

---

# 118. Principio final

Debe mantenerse siempre:

```text
Buying
≠
Receiving
```

La secuencia correcta es:

```text
Supplier
↓
Purchase
↓
ordered commercial commitment
↓
PurchaseReceipt
↓
physical receipt
↓
Inventory IN
```

y, cuando el Product utiliza ASSET:

```text
PurchaseReceipt
↓
EquipmentAsset identities
```

sin duplicar Inventory.

En términos de ownership:

```text
Purchase
→ what was ordered
```

```text
PurchaseReceipt
→ what was physically received
```

```text
Inventory
→ quantity consequence
```

```text
Equipment
→ reusable physical identity
```
