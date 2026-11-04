# Arquitectura de Zaping

**Producto:** Zaping Platform
**Versión:** 2.2.0
**Estado:** Aprobado
**Última actualización:** 2026-08-27
**Responsable:** Zaping Architecture Team

> **Addendum propuesto (2026-11-03, no implementado):** [Zaping Smart Station — arquitectura objetivo y discovery](SMART_STATION_ARCHITECTURE.md) y [ADR-SMART-STATION-001](adr/ADR-SMART-STATION-001.md). La nueva capa de captura con cámaras, lector 2D y posible RFID no modifica el monolito modular ni traslada la autoridad de Purchase Receipts, CaseKit, Dispatch, Custody o Return/Reconciliation. Sus observaciones solo originan propuestas revisables y las confirmaciones quedan en los dominios existentes. Este addendum no implica despliegue ni cambios en Prisma.

---

# 1. Propósito

Este documento describe la arquitectura técnica vigente y la dirección arquitectónica de Zaping.

Su objetivo es explicar:

```text
cómo está organizada la plataforma;

qué responsabilidades existen;

cómo se relacionan los dominios;

cuáles son sus límites;

qué tecnologías forman parte actualmente del sistema;

qué reglas arquitectónicas deben respetarse;

qué está implementado actualmente;

qué pertenece a la arquitectura objetivo;

y cómo puede evolucionar Zaping sin sobreingeniería.
```

Las razones detrás de decisiones arquitectónicas específicas se documentan mediante ADR.

---

# 2. Alcance

Este documento cubre la arquitectura general de:

```text
Zaping Platform
Zaping ERP Core
Zaping Healthcare

Frontend
Backend
Persistencia
APIs
Seguridad
Multi-tenancy
Inventory
Equipment
Integraciones
Deployment
Evolución futura
```

No reemplaza:

```text
PRODUCT_VISION.md
PRODUCT_REQUIREMENTS.md
PROJECT_BOARD.md
ROADMAP.md
SECURITY_PRINCIPLES.md
API_GUIDELINES.md
ZAPING_WAY.md
documentación específica de módulos
ADR
```

Responsabilidades principales:

```text
ARCHITECTURE.md
→ arquitectura vigente y dirección técnica

ADR
→ por qué se tomó una decisión

PROJECT_BOARD.md
→ estado actual de implementación

ROADMAP.md
→ dirección futura del producto

docs/modules/
→ comportamiento funcional específico
```

---

# 3. Principio arquitectónico

La arquitectura existe para soportar el negocio.

Zaping prioriza:

```text
Business
↓
Domain
↓
Architecture
↓
Technology
```

y no:

```text
Technology
↓
Business forced into implementation
```

Las decisiones técnicas deben facilitar la evolución del producto sin introducir complejidad que todavía no sea necesaria.

---

# 4. Principios arquitectónicos

## Business First

Las reglas del negocio tienen prioridad sobre conveniencias técnicas.

---

## Modular Monolith

Los dominios viven actualmente dentro de una aplicación modular desplegable como una unidad principal.

---

## Multi-Tenant

Zaping atiende múltiples Companies manteniendo aislamiento lógico entre tenants.

---

## API First

Las capacidades empresariales deben poder consumirse mediante contratos backend independientes de una interfaz concreta.

---

## Layered Architecture

Las responsabilidades se separan mediante capas pragmáticas.

---

## Domain Ownership

Cada dominio es propietario de sus reglas y de la interpretación de su información.

---

## Security by Design

Autenticación, autorización, tenant isolation y protección de datos forman parte del diseño.

---

## Documentation First

Las decisiones relevantes deben comprenderse y documentarse antes de comprometer una implementación importante.

---

## Event Ready

La arquitectura puede incorporar eventos de dominio cuando aporten valor sin exigir una arquitectura distribuida.

---

## Simplicity First

No se introducen patrones, servicios, capas o infraestructura sin una necesidad concreta.

---

# 5. Arquitectura conceptual de producto

La estructura conceptual vigente es:

```text
Zaping Platform
│
├── Zaping ERP Core
│   └── capacidades empresariales reutilizables
│
├── Zaping Healthcare
│   └── vertical especializada inicial
│
├── Zaping Radar
│   └── inteligencia de oportunidades externas
│
└── Zaping AI
    └── capa futura de inteligencia
```

Relación principal:

```text
Zaping Healthcare
↓
consume
↓
Zaping ERP Core
```

Healthcare no reemplaza al ERP Core.

Radar puede integrarse con ERP cuando exista valor, pero mantiene identidad propia.

AI será una capa consumidora de información confiable, no una fuente primaria de verdad.

---

# 6. Canales

Actualmente:

```text
Web Application
```

Puede evolucionar posteriormente hacia:

```text
Customer Portal
Mobile Applications
Public API
External Integrations
```

No todos estos canales están implementados.

Los canales deben consumir las mismas capacidades de negocio.

No deben crear reglas independientes por interfaz.

---

# 7. Arquitectura técnica actual

La arquitectura implementada actualmente sigue:

```text
Browser
   ↓
Next.js Frontend
web/
   ↓
REST + JWT
   ↓
NestJS Backend
app/api/
   ↓
Application / Domain Coordination
   ↓
Prisma ORM
   ↓
PostgreSQL
```

El backend continúa como:

> **Modular Monolith**

---

# 8. Snapshot técnico implementado

## Frontend

`web/app` utiliza Next.js App Router.

Route groups principales:

```text
(public)
→ login
→ register
→ forgot-password

(app)
→ rutas autenticadas del ERP
→ AppShell compartido
```

`AppShell` contiene:

```text
Header
Sidebar desktop
navegación móvil
active navigation state
layout autenticado común
```

Los route groups no forman parte de la URL pública.

---

## Backend

`app/api` contiene el monolito modular NestJS.

Módulos relevantes actuales:

```text
Auth
Users
Companies
Dashboard

Customers
Suppliers

Categories
Products
Inventory

Quotes
Sales

Purchases
Purchase Receipts

Equipment

Healthcare Cases
```

La implementación concreta puede continuar evolucionando sin modificar el principio de Modular Monolith.

---

# 9. Stack tecnológico actual

## Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
Vitest
```

## Backend

```text
NestJS
Node.js
TypeScript
Jest
Passport JWT
PDFKit
```

## Persistencia

```text
PostgreSQL
Prisma ORM
```

## Autenticación

```text
JWT
Passport
bcrypt
```

## Validación

```text
class-validator
class-transformer
ValidationPipe
```

## Infraestructura de desarrollo

```text
Docker
Docker Compose
variables de entorno
```

Nuevas tecnologías deben incorporarse únicamente cuando exista una necesidad técnica o de producto demostrable.

---

# 10. Capas del sistema

La separación conceptual es:

```text
Presentation
↓
Application
↓
Domain
↓
Infrastructure
↓
Persistence
```

Estas capas representan responsabilidades.

No es obligatorio crear una carpeta física diferente para cada capa dentro de cada módulo.

---

# 11. Presentation Layer

Responsable de interacción con usuarios o consumidores externos.

Actualmente incluye principalmente:

```text
Next.js Web Application
NestJS REST Controllers
```

Futuros consumidores:

```text
Customer Portal
Mobile Apps
Public API
External Integrations
```

Presentation no debe ser propietaria de reglas centrales del negocio.

---

# 12. Application Layer

Coordina casos de uso.

Ejemplos actuales:

```text
Create Purchase

Register Purchase Receipt

Create Quote

Create / Approve Sale

Inspect Equipment

Retire Equipment

Cancel Healthcare Case
```

Ejemplos de arquitectura objetivo:

```text
Confirm Delivery

Prepare Case

Dispatch Case

Reconcile Case
```

Gran parte de esta responsabilidad vive actualmente en Services de NestJS.

La Application Layer puede:

```text
coordinar módulos;

validar precondiciones;

orquestar operaciones;

abrir o participar en transacciones;

invocar servicios de dominio;

invocar capacidades públicas de otros módulos.
```

---

# 13. Domain Layer

Contiene reglas que definen comportamiento empresarial.

Ejemplos actuales:

```text
cantidad pendiente de Purchase Receipt

Product lot tracking

Sales eligibility

Equipment lifecycle

Equipment condition

Current Equipment Availability

entity lifecycle

folio allocation rules
```

Ejemplos Target:

```text
Delivery allocation

Case Availability

Case reconciliation

Custody rules

Healthcare dispatch rules
```

El dominio debe permanecer conceptualmente independiente de detalles de interfaz.

---

# 14. Infrastructure Layer

Contiene capacidades técnicas necesarias para operar el sistema.

Ejemplos:

```text
authentication

configuration

email future

storage future

logging

external services

Docker

future adapters
```

Infrastructure no debe determinar reglas fundamentales del negocio.

---

# 15. Persistence Layer

Actualmente:

```text
Prisma
↓
PostgreSQL
```

Responsable técnico de:

```text
persistencia
relaciones
constraints
indexes
migrations
transactions
```

Principio:

```text
Technical DB access
≠
Domain ownership
```

Que un módulo pueda acceder técnicamente a una tabla no significa que sea propietario de sus reglas.

---

# 16. Arquitectura backend

Dirección general:

```text
Controller
↓
Service / Domain Capability
↓
Prisma / Repository when useful
↓
PostgreSQL
```

Repository es opcional.

No debe introducirse únicamente para cumplir una estructura artificial.

---

## Controllers

Deben principalmente:

```text
recibir requests

resolver parámetros

aplicar Guards

aplicar decoradores

validar boundary HTTP

delegar

devolver respuestas
```

No deben contener lógica de negocio compleja.

---

## Services

Actualmente son la principal capa de coordinación backend.

Pueden contener:

```text
use cases

business validation

coordination

transactions

tenant-scoped persistence

calls to other allowed module capabilities
```

Cuando un Service crece excesivamente debe evaluarse si contiene varias responsabilidades.

---

## Repositories

Pueden introducirse cuando proporcionen:

```text
persistence isolation

query reuse

clarity

testability

complex data access encapsulation
```

No son obligatorios para todos los módulos.

Prisma puede utilizarse directamente desde Services cuando el ownership y las responsabilidades sigan siendo claros.

---

# 17. Comunicación entre módulos

La dirección preferida es utilizar capacidades explícitas de módulo.

Conceptualmente:

```text
Module A
↓
public capability / service contract
↓
Module B
```

en lugar de:

```text
Module A
↓
arbitrary writes to Module B internals
```

Sin embargo, Zaping es actualmente un Modular Monolith.

Algunas operaciones transaccionales coordinan varios dominios usando Prisma dentro de una misma transacción cuando esto es necesario para mantener atomicidad.

Ejemplo real:

```text
PurchaseReceiptsService
↓
Receipt
Inventory
Equipment provisioning
Purchase status
```

Principio:

> **La coordinación transaccional compartida es válida cuando el ownership de cada regla permanece claro.**

A medida que los límites maduren, deben preferirse capacidades públicas de módulo sobre dependencia indiscriminada de estructuras internas.

---

# 18. Arquitectura frontend

Dirección conceptual:

```text
Pages / Routes
↓
Features
↓
Business Components
↓
UI Components
```

Layouts y componentes compartidos pueden participar transversalmente.

---

## Pages / Routes

Responsables de:

```text
routing
composition
page context
workflow structure
```

No deben acumular toda la lógica de interacción.

---

## Features

Representan capacidades funcionales.

Pueden contener:

```text
hooks
forms
interaction logic
feature components
types
API integration
```

Ejemplos actuales:

```text
Purchase Form
Receipt Registration
Sale Creation
Equipment Inspection
Equipment Retirement
```

Ejemplos futuros:

```text
Case Preparation
Delivery Confirmation
Case Reconciliation
```

---

## Business Components

Componentes reutilizables con conocimiento empresarial controlado.

Ejemplos:

```text
ProductSelector
CustomerSelector
SupplierSelector
StatusBadge
MoneyInput
```

---

## UI Components

Componentes visuales genéricos.

Ejemplos:

```text
Button
Modal
Input
Table
Badge
Loading
ConfirmDialog
```

No deben conocer reglas específicas de dominio.

---

# 19. Arquitectura modular

El backend se organiza mediante módulos orientados a capacidades empresariales.

Principio:

```text
Module
≠
Database table
```

Un módulo existe porque posee una responsabilidad empresarial.

---

# 20. Dominios principales

| Dominio | Responsabilidad |
|---|---|
| Auth / Identity | autenticación e identidad |
| Companies | contexto de tenant |
| Customers | clientes |
| Suppliers | proveedores |
| Products | catálogo |
| Inventory | stock, lotes y movimientos |
| Purchases | abastecimiento |
| Purchase Receipts | recepción física de compras |
| Equipment | identidad y ciclo de vida de activos físicos |
| Quotes | cotización comercial |
| Sales | proceso comercial V1 actual |
| Returns | devolución comercial futura/evolutiva |
| Dashboard | lectura operacional |
| Healthcare | logística especializada de Cases |
| Billing | facturación futura |
| Radar | inteligencia externa |
| AI | inteligencia futura |

El estado exacto de implementación vive en:

```text
docs/project/PROJECT_BOARD.md
```

---

# 21. Domain Ownership

Cada dominio controla sus reglas.

## Inventory

Responsabilidades principales:

```text
Product.stock projection

InventoryMovement

InventoryBatch

lot quantities

inventory traceability
```

No debe considerarse propietario directo de:

```text
Equipment lifecycle

Equipment condition

Current Equipment Availability

Healthcare Assignment

Healthcare Custody
```

---

## Equipment

Responsable de:

```text
EquipmentAsset identity

assetCode

serialNumber

lifecycle

condition

origin

inspection history

retirement

Current Availability
```

---

## Healthcare

Responsable futuro de:

```text
Equipment Requirements

Case Equipment Assignment

Case Availability

Preparation

Dispatch

Custody

Return

Case reconciliation

Case calendar
```

Healthcare consume `EquipmentAsset`.

No lo redefine.

---

# 22. Base de datos compartida

Los módulos comparten PostgreSQL.

Principio:

```text
Shared Database
≠
Shared Domain Ownership
```

Prisma proporciona acceso técnico.

La arquitectura define quién posee cada regla.

---

# 23. Multi-tenancy

Zaping utiliza arquitectura multi-tenant.

Conceptualmente:

```text
Zaping Platform

├── Company A
├── Company B
└── Company C
```

`Company` representa la raíz del tenant.

Las entidades empresariales pertenecen a una Company directa o indirectamente.

---

# 24. Contexto del tenant

El tenant se deriva principalmente del usuario autenticado.

```text
JWT
↓
Authenticated User
↓
companyId
↓
Business Operation
```

Un `companyId` enviado arbitrariamente por frontend no debe convertirse en autoridad de seguridad.

---

## Estado actual

Los módulos normalizados y workflows nuevos aplican tenant scoping mediante:

```text
companyId
```

Sin embargo, todavía existe deuda relacionada con:

```text
legacy tenant-safe write hardening

systematic cross-tenant regression coverage
```

Por tanto, la arquitectura no declara aislamiento perfecto ya demostrado en toda la base histórica.

---

# 25. Autenticación y autorización

Flujo actual:

```text
Authorization: Bearer <JWT>
↓
Passport JWT
↓
JwtAuthGuard
↓
request.user
↓
companyId / role
↓
business operation
```

`RolesGuard` existe.

Actualmente se utiliza explícitamente en algunos dominios, incluyendo Healthcare Cases.

No debe interpretarse como un sistema granular de permisos completamente implementado para toda la plataforma.

---

# 26. Validación HTTP

La API utiliza globalmente `ValidationPipe` con:

```text
whitelist = true

forbidNonWhitelisted = true

transform = true
```

DTOs se utilizan en los límites HTTP.

Principio:

```text
Structural validation
→ boundary / DTO

Complex business validation
→ domain / service
```

---

# 27. Identificadores

Las entidades principales utilizan UUID como identidad técnica.

Ejemplo:

```prisma
id String @id @default(uuid())
```

Los documentos pueden utilizar además folios legibles.

```text
UUID
→ technical identity

OC-000421
→ business identity
```

Otros ejemplos:

```text
V-000001
CASE-000001
EQ-000001
```

Los folios no sustituyen UUID como identidad técnica.

---

# 28. Ciclo de vida de entidades

No existe Soft Delete universal.

La estrategia depende del tipo de entidad.

```text
Master Data
→ ACTIVE / INACTIVE

Transactional Documents
→ explicit lifecycle states

Historical Events
→ preserve history

Temporary Data
→ delete / expire when appropriate
```

La estrategia completa se documenta mediante ADR-012.

---

# 29. Arquitectura de inventario

Inventory se basa en operaciones trazables.

```text
Business Event
↓
InventoryMovement
↓
Balance / Projection
```

`Product.stock` funciona actualmente como una proyección operacional optimizada.

No debe tratarse como:

```text
freely editable source of truth
```

Los cambios de stock deben provenir de operaciones controladas.

---

# 30. Compras y Recepciones

La arquitectura vigente es:

```text
Purchase
↓
PurchaseReceipt
↓
Inventory IN
```

Principio:

```text
Purchase
≠
Inventory IN
```

Confirmar una Purchase no significa recibir físicamente mercancía.

---

## Recepción física

Una creación válida de `PurchaseReceipt` representa el evento físico.

```text
Valid PurchaseReceipt creation
↓
InventoryMovement IN
```

No existe actualmente un lifecycle adicional de:

```text
PurchaseReceipt CONFIRMED
```

La creación válida del Receipt es la operación relevante.

---

## Recepciones parciales

Una Purchase puede tener múltiples Purchase Receipts.

```text
Ordered
-
Received
=
Pending
```

Estados de Purchase:

```text
CONFIRMED
↓
PARTIALLY_RECEIVED
↓
RECEIVED
```

---

# 31. Purchase Receipt Transaction Boundary

Una creación válida de Purchase Receipt puede coordinar atómicamente:

```text
Idempotency claim

+

PurchaseReceipt

+

PurchaseReceiptItems

+

InventoryBatch when applicable

+

Equipment provisioning for ASSET Products

+

Product.stock update

+

InventoryMovement IN

+

Purchase status recalculation
```

Estas mutaciones se ejecutan dentro de una transacción Prisma cuando forman parte de la misma operación.

Principio:

```text
critical partial failure
→ transaction rollback
```

---

# 32. Lot Tracking

Product define:

```text
ProductLotTracking

NONE
OPTIONAL
REQUIRED
```

Purchase Receipts aplica actualmente estas reglas.

Conceptualmente:

```text
NONE
→ no lot data

OPTIONAL
→ lot optional

REQUIRED
→ lot required
```

`InventoryBatch` representa existencia asociada a lote cuando corresponde.

---

# 33. SERIALIZED y ASSET

Debe mantenerse:

```text
SERIALIZED
≠
ASSET
```

## SERIALIZED

Representa inventario unitario serializado que no necesariamente es un activo reutilizable.

Su semántica operacional completa todavía debe evolucionar.

---

## ASSET

Representa identidad física persistente mediante:

```text
EquipmentAsset
```

Especialmente útil para equipos reutilizables.

Ambos conceptos pueden utilizar números de serie, pero pertenecen a workflows diferentes.

---

# 34. Equipment Core

`EquipmentAsset` pertenece a ERP/Core.

Representa:

```text
qué unidad física exacta existe
```

y no únicamente:

```text
qué Product/modelo es
```

---

## Modelo conceptual

```text
EquipmentAsset
├── assetCode
├── Product
├── serialNumber
├── lifecycle
├── condition
├── origin
├── batch when applicable
├── purchaseReceiptItem when applicable
└── operational history
```

No debe agregarse directamente por conveniencia:

```text
currentCase
custodian
doctorId
hospitalId
```

si esos hechos pertenecen al dominio Healthcare.

---

# 35. Equipment Lifecycle

Actualmente:

```text
ACTIVE
RETIRED
```

`RETIRED` es terminal.

Retirement:

```text
≠ DELETE
```

La identidad física e historia del Equipment se conservan.

---

# 36. Equipment Condition

Actualmente:

```text
GOOD
INSPECTION_PENDING
DAMAGED
OUT_OF_SERVICE
```

Principio:

```text
Lifecycle
≠
Condition
```

Un activo puede ser:

```text
ACTIVE + DAMAGED
```

o:

```text
RETIRED + DAMAGED
```

Lifecycle y Condition representan dimensiones distintas.

---

# 37. Equipment Inspection

Inspection representa una operación explícita.

Conceptualmente:

```text
EquipmentAsset.condition
↓
Inspection
↓
new EquipmentAsset.condition
```

Inspection preserva historia y actor.

Principio:

```text
Inspection
→ changes Condition

Inspection
≠
direct Availability flag
```

---

# 38. Current Equipment Availability

Current Availability está implementado como valor derivado.

Actualmente utiliza:

```text
EquipmentAsset.lifecycle
EquipmentAsset.condition
```

Reglas:

```text
ACTIVE + GOOD
→ available

ACTIVE + INSPECTION_PENDING
→ unavailable

ACTIVE + DAMAGED
→ unavailable

ACTIVE + OUT_OF_SERVICE
→ unavailable

RETIRED
→ unavailable
```

Availability:

```text
derived
not manually persisted
```

Principio:

```text
Condition
≠
Availability
```

---

# 39. Purchase Receipt → EquipmentAsset

Para:

```text
Product.inventoryTracking = ASSET
```

una Purchase Receipt puede aprovisionar:

```text
quantityReceived = N
↓
N EquipmentAsset
```

Los activos creados utilizan:

```text
lifecycle = ACTIVE

condition = INSPECTION_PENDING

origin = PURCHASE_RECEIPT
```

Equipment provisioning:

```text
does not increment stock again

does not create one InventoryMovement per asset
```

El Receipt sigue siendo propietario de la mutación de inventario.

---

# 40. Sales — arquitectura actual

Debe distinguirse claramente entre:

```text
CURRENT
```

y:

```text
TARGET
```

---

## CURRENT — ERP Core V1

Actualmente:

```text
Quote
↓ optional
Sale
```

Para Sales genéricas compatibles:

```text
Create Sale
→ DRAFT
→ no Inventory OUT

Approve Sale
→ CONFIRMED
→ Product.stock decrement
→ InventoryMovement OUT

Cancel DRAFT
→ CANCELLED
→ no Inventory OUT
```

Esta es la implementación vigente.

---

# 41. Sales — arquitectura objetivo

**Estado:** TARGET

La arquitectura objetivo futura es:

```text
Quote
↓ optional
SalesOrder
↓
Delivery
↓
Inventory OUT
```

Esta arquitectura todavía no sustituye la implementación actual `Sale`.

---

## SalesOrder

Representa:

> **compromiso comercial**

No representa:

> **salida física**

---

## Delivery

Representa:

> **cumplimiento físico definitivo**

Una SalesOrder puede tener múltiples Deliveries.

Esto permite:

```text
partial deliveries
pending quantities
batch allocation
```

---

## Target Inventory OUT

En la arquitectura objetivo:

```text
Delivery CONFIRMED
↓
InventoryMovement OUT
```

No simplemente:

```text
SalesOrder confirmed
```

---

# 42. Facturación

Arquitectura objetivo:

```text
SalesOrder
≠
Delivery
≠
Invoice
```

Facturación y fulfillment físico son responsabilidades diferentes.

La integración fiscal será diseñada como un dominio/capacidad específica.

---

# 43. Returns

Returns representa devoluciones comerciales.

Su implementación histórica/evolutiva no debe mezclarse con Healthcare Case Return.

Arquitectura objetivo:

```text
DeliveryItem
↓
ReturnItem
```

en lugar de profundizar permanentemente:

```text
SaleItem
↓
ReturnItem
```

Returns operacional completo permanece como evolución posterior.

---

# 44. Arquitectura Healthcare

Healthcare extiende ERP Core.

```text
ERP Core
↑
Healthcare orchestration
```

Una operación comercial normal no requiere Healthcare Case.

Healthcare no debe contaminar módulos genéricos con conceptos médicos específicos.

---

# 45. Healthcare — Current

Actualmente existe:

```text
HealthcareCase Foundation
```

Incluye:

```text
id
companyId
folio
title
procedureDescription
status
scheduledStart
scheduledEnd
responsibleUser
creation audit
cancellation audit
```

Estados actuales:

```text
DRAFT
SCHEDULED
CANCELLED
```

HealthcareCase Foundation no incluye todavía:

```text
Hospital
Doctor
Requirements
Equipment Assignment
Case Availability
CaseKit
Dispatch
Custody
Return
Reconciliation
```

---

# 46. Healthcare — Target

La arquitectura objetivo Healthcare incorpora:

```text
HealthcareCase
├── Hospital
├── Doctor
├── Requirements
├── Equipment Assignment
├── Case Availability
├── CaseKit
├── Dispatch
├── Custody
├── Return
├── Reconciliation
├── Calendar
└── commercial references
```

Estos conceptos no deben interpretarse como implementados únicamente porque aparecen en la arquitectura objetivo.

---

# 47. Healthcare Actors

Deben mantenerse separados:

```text
Doctor
Hospital
Customer
Payer
Technician
```

No debe asumirse:

```text
Customer
=
Hospital
=
Doctor
=
Payer
```

Representan responsabilidades empresariales diferentes.

---

# 48. Healthcare Requirements

Target:

```text
HealthcareCase
↓
Requirements
```

Requirements representa:

```text
qué necesita el Case
```

y puede incluir:

```text
Products / Materials
Equipment requirements
```

Requirement:

```text
≠
physical Assignment
```

---

# 49. Equipment Assignment

Target Healthcare:

```text
HealthcareCase
+
EquipmentAsset
↓
Case Equipment Assignment
```

Assignment representa:

```text
selección de una unidad física para un Case
```

Principio:

```text
EquipmentAsset
→ Core identity

Case Equipment Assignment
→ Healthcare relationship
```

No duplicar EquipmentAsset.

---

# 50. Case Availability

Current Equipment Availability responde:

```text
Can this asset be used now
according to Core Equipment facts?
```

Case Availability deberá responder:

```text
Can this asset be used
for this specific Case
at this time?
```

Podrá considerar:

```text
Current Equipment Availability
Assignment conflicts
Case schedule
Custody
Maintenance
Calibration
Turnaround
```

Case Availability pertenece a Healthcare.

---

# 51. Case Logistics

**Estado:** TARGET

Flujo conceptual:

```text
Healthcare Case
↓
Requirements
↓
Preparation
↓
CaseKit
↓
Assignment
↓
Dispatch
↓
Custody
↓
Procedure
↓
Return
↓
Inspection
↓
Reconciliation
```

No todos estos dominios están implementados actualmente.

---

# 52. Custodia Healthcare

Una salida de almacén hacia un Case:

```text
Warehouse
↓
Technician Custody
```

no significa necesariamente transferencia de propiedad ni consumo definitivo.

Por tanto:

```text
CaseDispatch
≠
Customer Delivery
```

y:

```text
CaseDispatch
≠
Definitive Inventory OUT
```

---

# 53. Healthcare Reconciliation

Target:

```text
Dispatched
=
Used
+
Returned
+
Unresolved
```

Reconciliation determina el destino final del material.

Material usado puede generar posteriormente la consecuencia comercial apropiada.

Debe evitarse:

```text
double Inventory decrement
```

---

# 54. Location, Custody, Availability y Ownership

Estos conceptos deben mantenerse separados:

```text
Location
Custodian
Availability
Ownership
```

Ejemplo:

```text
fuera del almacén
≠
vendido

en custodia
≠
consumido

GOOD condition
≠
available for a Case
```

El modelo persistente futuro debe respetar estas diferencias.

---

# 55. API Architecture

La aplicación utiliza REST como interfaz principal entre frontend y backend.

API First significa:

> **La capacidad pertenece al backend y puede ser utilizada por múltiples clientes.**

No significa que todas las APIs sean públicas.

---

# 56. Application API vs Public API

## Application API

Utilizada por aplicaciones oficiales de Zaping.

Actualmente es la interfaz principal.

---

## Public API

Interfaz futura para terceros.

Puede requerir:

```text
versioning
scopes
credentials
rate limits
documentation
compatibility guarantees
webhooks
```

---

# 57. Versionado de API

La arquitectura histórica propuso:

```text
/api/v1/
```

como esquema general.

Actualmente no existe una obligación de versionar todas las APIs internas de esta manera.

El versionado será especialmente importante cuando existan:

```text
external consumers
stable public contracts
integration compatibility requirements
```

Los lineamientos específicos pertenecen a:

```text
API_GUIDELINES.md
```

---

# 58. APIs orientadas al negocio

Los endpoints pueden representar acciones explícitas cuando expresan mejor el dominio que un CRUD genérico.

Ejemplos actuales:

```text
POST /purchase-receipts

POST /equipment/:equipmentId/inspections

POST /equipment/:equipmentId/retire

POST /healthcare/cases/:id/cancel
```

Principio:

```text
explicit domain operation
>
generic PATCH when business meaning matters
```

---

# 59. Seguridad

Modelo conceptual:

```text
Request
↓
Authentication
↓
Authorization
↓
Tenant Isolation
↓
Validation
↓
Business Rules
↓
Persistence
↓
Audit when applicable
```

El orden técnico puede variar según framework.

Principio:

> **Ninguna operación crítica debe depender de una única barrera de seguridad.**

---

# 60. Protección de datos

No deben exponerse:

```text
passwordHash
secrets
internal tokens
data from another tenant
unnecessary internal details
stack traces in inappropriate contexts
```

La deuda histórica de exposición de `passwordHash` en respuestas de autenticación fue corregida.

Las reglas completas viven en:

```text
SECURITY_PRINCIPLES.md
```

---

# 61. RBAC

Actualmente:

```text
User
↓
Role
↓
RolesGuard where configured
```

La dirección futura es:

```text
User
↓
Role
↓
Permissions
↓
Permission-based authorization
```

RBAC y tenant isolation son controles diferentes.

Un usuario puede tener un rol correcto y aun así no tener derecho a datos de otra Company.

---

# 62. Datos Healthcare

Zaping Healthcare no debe convertirse inicialmente en:

```text
Electronic Medical Record
```

Healthcare Case Foundation evita:

```text
patient identifiers
diagnosis
medical history
clinical notes
clinical record fields
```

Información clínica sensible requiere análisis específico de:

```text
privacy
security
regulation
business necessity
```

antes de incorporarse.

---

# 63. Transacciones

Operaciones con múltiples efectos inseparables deben ejecutarse atómicamente.

Ejemplo actual:

```text
Purchase Receipt

Idempotency claim
+
Receipt
+
ReceiptItems
+
Batch
+
Equipment provisioning when applicable
+
Stock
+
InventoryMovement
+
Purchase status
```

Principio:

```text
all critical effects succeed
or
rollback
```

---

# 64. Idempotencia

Operaciones susceptibles a retry, doble click o pérdida de respuesta deben evitar efectos duplicados cuando el riesgo lo justifique.

## Current

Purchase Receipts implementa:

```text
Idempotency-Key
```

con:

```text
tenant-scoped key
request hash
replay
conflict detection
transactional protection
```

---

## Deuda actual

```text
Sale create
→ idempotency pending

Healthcare Case create
→ idempotency pending
```

---

## Target

Deberá evaluarse idempotencia para:

```text
Delivery
Dispatch
Return
Reconciliation
financial commands
other high-impact operations
```

---

# 65. Integridad histórica

Eventos confirmados no deben reescribirse silenciosamente para ocultar errores.

Preferir:

```text
Original Event
+
Compensating / Corrective Event
```

sobre:

```text
silent historical mutation
```

Esto será especialmente importante para:

```text
Inventory
Receipts
Deliveries
Returns
Billing
Audit
```

---

# 66. Dashboard

Dashboard es principalmente consumidor de información.

No debe convertirse en propietario de reglas empresariales.

Puede utilizar:

```text
aggregations
read models
optimized queries
```

para presentar contexto operacional.

---

# 67. Read Models

Cuando los workflows crezcan pueden utilizarse representaciones optimizadas para lectura.

Ejemplos:

```text
Action Dashboard
Warehouse Operations
Case Calendar
Customer 360
Product 360
Case 360
```

Read Models pueden combinar varios dominios.

No se apropian de sus reglas.

---

# 68. Workspaces

Un Workspace representa una experiencia orientada a tareas.

Ejemplo futuro:

```text
Warehouse Operations
```

Puede reunir:

```text
Purchase Receipts
Case Preparation
Deliveries
Returns
Equipment
Inventory alerts
```

sin convertirse necesariamente en un nuevo dominio backend.

---

# 69. Eventos de dominio

Zaping está preparado conceptualmente para utilizar Domain Events.

Ejemplos:

```text
PurchaseReceived
EquipmentRetired
DeliveryConfirmed
CaseReconciled
```

Pueden inicialmente ejecutarse:

```text
inside the same process
```

---

# 70. Event Driven no es requisito actual

Zaping no adopta actualmente una arquitectura distribuida basada en eventos.

No existe obligación de utilizar:

```text
Kafka
RabbitMQ
message brokers
event sourcing
```

Se introducirán únicamente si una necesidad concreta lo justifica.

---

# 71. Integraciones externas

La arquitectura puede evolucionar hacia:

```text
SAT / CFDI

email

storage

carriers

accounting systems

customer APIs

supplier APIs

public procurement sources
```

Cada integración constituye un trust boundary.

Debe considerar:

```text
authentication
authorization
retries
failure handling
observability
audit where appropriate
```

---

# 72. Zaping Radar

Radar representa inteligencia sobre información externa.

Puede requerir:

```text
source connectors
jobs
asynchronous processing
normalization
alerts
saved searches
document processing
```

Su topología de deployment independiente se decidirá cuando exista evidencia operativa.

Radar no debe acoplarse directamente al modelo transaccional del ERP.

---

# 73. Zaping AI

AI será una capa consumidora de información confiable.

```text
Operational Systems
↓
Reliable Data
↓
Context
↓
AI
```

AI:

```text
≠
source of truth
```

y:

```text
≠
authorization bypass
```

Toda acción futura asistida por AI deberá respetar:

```text
Identity
Tenant
Permissions
Domain Rules
Audit when required
```

---

# 74. Performance

La arquitectura debe evitar problemas conocidos:

```text
N+1 queries

unbounded collections

missing indexes

repeated processing

oversized payloads

unnecessary round trips
```

Principio:

> **No optimizar sin medir.**

Los objetivos de rendimiento de producto no son automáticamente SLOs productivos formales.

---

# 75. Paginación

Listados que puedan crecer deben evolucionar hacia:

```text
backend pagination
server-side filtering
server-side search
```

Actualmente algunos módulos todavía dependen de:

```text
client-side filtering
loaded-list deep-link resolution
```

Esto se mantiene como deuda arquitectónica de escalabilidad.

---

# 76. Caching

Caching puede incorporarse cuando exista una necesidad demostrable.

No debe utilizarse indiscriminadamente en información altamente mutable sin una estrategia de invalidación clara.

Especial atención a:

```text
Inventory
Equipment Availability
Case Availability
financial balances
```

---

# 77. Escalabilidad

El Modular Monolith puede escalar inicialmente mediante múltiples instancias de la misma aplicación.

Conceptualmente:

```text
Load Balancer
│
├── Zaping Backend
├── Zaping Backend
└── Zaping Backend
```

cuando la infraestructura futura lo requiera.

No es necesario dividir dominios en microservicios para conseguir escalamiento horizontal básico.

---

# 78. Observabilidad

La plataforma deberá evolucionar hacia:

```text
structured logs
metrics
monitoring
alerts
tracing when useful
```

La infraestructura concreta se definirá al formalizar ambientes productivos.

---

# 79. Logging y Audit

Debe distinguirse:

```text
Technical Logging
```

de:

```text
Business Audit
```

Logs:

```text
→ operate and troubleshoot system
```

Audit:

```text
→ preserve relevant business actions
```

No son intercambiables.

---

# 80. Deployment

Actualmente el proyecto utiliza:

```text
Docker
Docker Compose
```

principalmente para infraestructura y desarrollo local.

La arquitectura está preparada para:

```text
containerized deployment
+
future cloud environments
```

No se declara todavía una topología productiva cloud definitiva.

---

## Development

Actualmente:

```text
Docker / Docker Compose
Node.js
PostgreSQL
Next.js
NestJS
```

---

## Production

La topología productiva deberá formalizarse antes de una exposición comercial real.

Debe considerar como mínimo:

```text
runtime hosting
database
secrets
TLS
backups
logging
monitoring
deployment strategy
rollback
availability
```

---

# 81. Configuración

Configuración dependiente del entorno debe proporcionarse externamente.

Ejemplos:

```text
DATABASE_URL
JWT_SECRET
```

No deben almacenarse secretos reales en código fuente ni documentación versionada.

---

# 82. Ambientes

La arquitectura debe distinguir progresivamente:

```text
development
test
staging
production
```

Cada ambiente debe mantener separación adecuada de:

```text
data
credentials
secrets
configuration
```

---

# 83. Testing

La arquitectura debe permitir pruebas en diferentes niveles.

```text
unit tests

integration tests

component tests

end-to-end tests

manual QA

regression
```

Áreas de mayor riesgo requieren mayor cobertura.

---

# 84. Áreas de alto riesgo

Se consideran especialmente sensibles:

```text
Authentication

Authorization

Multi-Tenancy

Inventory

Money

Purchase Receipts

Equipment provisioning

Deliveries future

Returns

Healthcare Custody

Healthcare Reconciliation

Migrations

Billing
```

Cambios en estas áreas requieren controles adicionales.

---

# 85. C4 Model

Zaping utiliza C4 como herramienta de comunicación.

Se mantienen cuando aportan valor:

```text
C1 — System Context

C2 — Containers

C3 — Components
```

---

## C4 Level 4

No se mantiene un documento manual global de Code Level porque el código cambia con demasiada frecuencia.

El nivel de código se representa mejor mediante:

```text
source code
module documentation
tests
focused diagrams when needed
```

---

# 86. ADR

Las decisiones arquitectónicas viven en:

```text
docs/architecture/adr/
```

Responsabilidad:

```text
ARCHITECTURE.md
→ what is current / target

ADR
→ why a decision was made
```

El contenido de los ADR no debe duplicarse completamente dentro de este documento.

---

# 87. Decisiones arquitectónicas principales

Entre las decisiones relevantes se encuentran:

```text
ADR-001  Multi-Tenant

ADR-002  Inventory Movements

ADR-004  UUID Strategy

ADR-005  Layered Architecture

ADR-006  API First

ADR-007  RBAC

ADR-008  Documentation First

ADR-009  Modular Monolith

ADR-011  SalesOrder / Delivery

ADR-012  Entity Lifecycle

ADR-013  Inventory Custody / Case Logistics
```

ADR-003 y ADR-010 se conservan históricamente después de ser superseded.

El índice oficial vive en:

```text
docs/architecture/adr/README.md
```

---

# 88. Evolución arquitectónica

La evolución no debe seguir un calendario artificial.

Dirección:

```text
Modular Monolith
↓
Clearer Domain Boundaries
↓
Domain Events when valuable
↓
Selective service extraction
only when evidence exists
```

No existe obligación de evolucionar hacia microservicios.

---

# 89. Criterios para separar servicios

Un dominio puede considerarse candidato a servicio independiente si aparece evidencia como:

```text
independent scaling

independent lifecycle

different infrastructure needs

special resilience requirements

stable boundary

independent team ownership

specialized workload
```

No simplemente porque:

```text
"it may be useful someday"
```

---

# 90. Compatibilidad con verticales

ERP Core debe permanecer suficientemente genérico para permitir nuevas verticales.

Healthcare debe utilizar contratos del Core.

No debe introducir reglas médicas dentro de módulos empresariales genéricos si esas reglas solo pertenecen a Healthcare.

---

# 91. Principio de no contaminación

Ejemplo incorrecto:

```text
Product
├── surgeryId
├── doctorId
└── hospitalId
```

si estos conceptos pertenecen exclusivamente a Healthcare.

Preferir:

```text
ERP Core
↑
Healthcare relationships / orchestration
```

---

# 92. Principio de extensibilidad

Extensible no significa configurable infinitamente.

No convertir prematuramente la plataforma en:

```text
plugin framework

metadata-driven engine

dynamic schemas

generic workflow engine

fully configurable rule system
```

antes de tener una necesidad real.

---

# 93. Deuda arquitectónica

Cuando una implementación temporal contradiga la arquitectura objetivo debe registrarse explícitamente.

Ejemplos actuales:

```text
legacy Sale
→ current V1 implementation

SalesOrder + Delivery
→ target architecture
```

También:

```text
Product.stock
+
EquipmentAsset
→ reconciliation invariant still pending
```

y:

```text
SERIALIZED receipt semantics
→ not yet fully modeled
```

La implementación existente no debe redefinir silenciosamente la dirección futura.

---

# 94. Revisión arquitectónica

Cambios que afecten:

```text
domain boundaries

Inventory model

Equipment identity

multi-tenancy

security

entity lifecycle

integration architecture

fundamental persistence

financial semantics

Healthcare custody
```

deben pasar por revisión arquitectónica.

ADR debe utilizarse cuando exista una decisión arquitectónica significativa que deba preservarse.

---

# 95. Invariantes arquitectónicas

Estas propiedades no deben romperse sin una decisión explícita.

## Tenant

```text
Company A
≠
Company B data access
```

---

## Inventory

```text
Stock change
→ traceable controlled operation
```

---

## Purchase

```text
Purchase
≠
Inventory IN
```

---

## Purchase Receipt — Current

```text
Valid PurchaseReceipt creation
→ InventoryMovement IN
```

---

## Equipment

```text
Product
≠
EquipmentAsset
```

```text
Lifecycle
≠
Condition
```

```text
Condition
≠
Availability
```

---

## Sale — Current

```text
Sale DRAFT
→ no Inventory OUT
```

```text
Sale approval
→ InventoryMovement OUT
```

---

## Sales — Target

```text
SalesOrder
≠
Inventory OUT
```

```text
Delivery CONFIRMED
→ InventoryMovement OUT
```

---

## Healthcare — Target

```text
CaseDispatch
≠
Customer Delivery
```

```text
CaseDispatch
≠
Definitive Inventory OUT
```

```text
Assignment
≠
Custody
```

```text
Return
≠
Available
```

---

## Historia

```text
Confirmed historical event
→ no silent rewrite
```

---

## Domain Ownership

```text
Technical DB access
≠
Domain ownership
```

---

# 96. Current vs Target vs Future

Todo documento arquitectónico debe distinguir:

## CURRENT

Funcionalidad realmente implementada.

Ejemplos:

```text
Purchase Receipt → Inventory IN

Sale approval → Inventory OUT

EquipmentAsset

Current Equipment Availability

HealthcareCase Foundation
```

---

## TARGET

Arquitectura aprobada hacia la que el sistema evoluciona.

Ejemplos:

```text
SalesOrder + Delivery

Healthcare Requirements

Equipment Assignment

Case Availability

Dispatch / Custody / Return

Healthcare Reconciliation
```

---

## FUTURE

Posibilidades que todavía requieren suficiente validación.

Ejemplos:

```text
Microservices

Advanced event infrastructure

Public API

AI automation

multi-region infrastructure
```

El estado operativo concreto debe consultarse siempre en:

```text
PROJECT_BOARD.md
```

---

# 97. Documentación relacionada

## Producto

```text
docs/product/PRODUCT_VISION.md

docs/product/PRODUCT_REQUIREMENTS.md

docs/product/ZAPING_WAY.md
```

## Ingeniería

```text
docs/engineering/ENGINEERING_GUIDE.md

docs/engineering/DEVELOPMENT_WORKFLOW.md

docs/engineering/QUALITY_STANDARDS.md

docs/engineering/SECURITY_PRINCIPLES.md
```

## Arquitectura

```text
docs/architecture/c4/

docs/architecture/adr/
```

## Dominios

```text
docs/modules/erp/

docs/modules/healthcare/
```

## Estado del proyecto

```text
docs/project/PROJECT_BOARD.md

docs/project/ROADMAP.md

docs/project/CHANGELOG.md
```

---

# 98. Principio final

La arquitectura de Zaping debe permitir que el producto crezca sin perder claridad.

Debe priorizar:

```text
Correct Domain Boundaries

+

Traceable Business Operations

+

Secure Multi-Tenancy

+

Explicit Lifecycle

+

Simple Infrastructure

+

Stable Contracts
```

antes que:

```text
More Services

+

More Layers

+

More Technologies

+

More Infrastructure
```

La dirección es:

```text
Reliable Modular Monolith
↓
Clear Domain Boundaries
↓
Explicit Business Workflows
↓
Healthcare Differentiation
↓
Selective Expansion
↓
Distributed Complexity only when justified
```
