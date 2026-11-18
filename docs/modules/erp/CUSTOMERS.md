# Customers — Zaping ERP

**Módulo:** Customers
**Producto:** Zaping ERP Core
**Versión:** 2.2.0
**Estado:** Aprobado
**Estado de implementación:** CUSTOMERS V1 IMPLEMENTED / VALIDATED
**Última actualización:** 2026-08-27
**Responsable:** Zaping ERP Team

---

# 1. Propósito

Customers administra el catálogo maestro de clientes de una Company.

Su responsabilidad principal es responder:

```text
¿Quién es nuestra contraparte comercial?

¿Cómo la identificamos?

¿Cómo podemos contactarla?

¿Está habilitada para nuevas operaciones?

¿Qué Quotes y Sales históricas están relacionadas con ella?
```

Customer representa:

```text
commercial counterpart
+
master-data identity
+
master-data lifecycle
```

No representa por sí mismo una operación comercial.

---

# 2. Ownership

Customers es propietario de información maestra como:

```text
name

type

email

phone

address

contactName

creditLimit

notes

isActive

tenant ownership
```

Customers no es propietario de:

```text
Quote lifecycle

Sale lifecycle

Inventory

Delivery future

Billing

Accounts Receivable

payments

Hospital

Doctor

Healthcare Case

Payer
```

---

# 3. Fronteras de dominio

Debe mantenerse:

```text
Customer
→ commercial counterpart
```

```text
Quote
→ commercial proposal
```

```text
Sale
→ CURRENT commercial sale workflow
```

y, en arquitectura futura:

```text
SalesOrder
→ commercial commitment
```

```text
Delivery
→ physical fulfillment
```

---

# 4. CURRENT vs TARGET vs FUTURE

Este documento distingue:

## CURRENT

Capacidades implementadas actualmente.

## TARGET

Evoluciones aprobadas pendientes de implementación.

## FUTURE

Capacidades posteriores cuya necesidad deberá validarse.

---

# 5. Estado CURRENT

Customers V1 soporta actualmente:

```text
Customer create

active Customer list

Customer detail

master-data update

soft-deactivation

inactive historical detail

tenant-scoped operations

Quote relationship

Sale relationship

active Customer validation for new Quotes

active Customer validation for new Sales

CustomerSelector

Customers frontend
```

Lifecycle vigente:

```text
ACTIVE
↓
INACTIVE
```

---

# 6. Modelo Customer actual

Conceptualmente:

```text
Customer

id
companyId

name
type

email
phone
address
contactName

creditLimit

notes

isActive

createdAt
updatedAt

quotes
sales
```

La definición técnica exacta pertenece a:

```text
schema.prisma
```

---

# 7. Customer como Master Data

Customer utiliza un lifecycle de Master Data.

La transición normal es:

```text
ACTIVE
↓
INACTIVE
```

No:

```text
ACTIVE
↓
physical DELETE
```

como operación empresarial ordinaria.

---

# 8. Customer ACTIVE

Un Customer activo puede utilizarse en nuevas operaciones comerciales compatibles.

Actualmente:

```text
Quote
✅
```

```text
Sale
✅
```

Futuro:

```text
SalesOrder
```

cuando ese modelo sea implementado.

---

# 9. Customer INACTIVE

Un Customer inactivo:

```text
remains persisted

remains historically referenceable

retains Quote history

retains Sale history
```

No debe utilizarse normalmente en nuevas operaciones comerciales.

---

# 10. Desactivación CURRENT

Actualmente:

```text
DELETE /customers/:id
```

implementa:

```text
isActive = false
```

No elimina físicamente el registro.

Debe interpretarse como:

```text
Deactivate Customer
```

y no como:

```text
Hard Delete Customer
```

---

# 11. Desactivación tenant-scoped

La operación debe ejecutarse dentro de la Company autenticada.

Debe impedirse:

```text
Company A User
↓
deactivate Customer Company B
```

aunque el UUID sea conocido.

---

# 12. Desactivación idempotente

La operación actual tolera que un Customer ya inactivo vuelva a recibir la orden
de desactivación.

Debe mantenerse:

```text
repeated deactivation
→ no destructive additional effect
```

---

# 13. Reactivación

Actualmente:

```text
Customer reactivation
→ NOT IMPLEMENTED
```

Una futura transición:

```text
INACTIVE
↓
ACTIVE
```

deberá realizarse mediante un workflow explícito.

No debe introducirse accidentalmente como un PATCH genérico.

---

# 14. Hard Delete

Customers V1 no expone hard delete.

Las relaciones históricas con:

```text
Quote

Sale
```

deben preservarse.

Una futura eliminación física requeriría una decisión específica sobre:

```text
retention

history

auditability

relations
```

---

# 15. Active list

Actualmente:

```text
GET /customers
→ active Customers
```

Esto permite utilizar el listado como catálogo operativo para nuevas operaciones.

---

# 16. Historical detail

Actualmente:

```text
GET /customers/:id
```

puede recuperar un Customer inactivo dentro del tenant autenticado.

Esto permite conservar:

```text
historical Quote context

historical Sale context

audit / support context
```

Debe mantenerse:

```text
Inactive
≠
Historically invisible
```

---

# 17. Name

`name` representa actualmente la identificación comercial principal del Customer.

Ejemplos:

```text
Hospital San José

Clínica del Norte

Distribuidora Médica ABC
```

---

# 18. Customer name no es unique

El modelo actual no establece:

```text
unique(companyId, name)
```

para Customer.

Por tanto, no debe documentarse una restricción ficticia de unicidad por nombre.

---

# 19. Customers con nombres iguales

El modelo puede permitir Customers con nombres iguales o similares.

En ese caso la diferenciación puede depender de información como:

```text
contactName

address

email

future customer code

future fiscal identity
```

---

# 20. Duplicate detection — FUTURE

Una futura capacidad de calidad de datos puede detectar posibles duplicados.

Ejemplos:

```text
same name
+
same address
```

o, cuando exista:

```text
same RFC
```

Actualmente:

```text
formal Customer duplicate detection
→ NOT IMPLEMENTED
```

---

# 21. Fiscal identifier

Customer no contiene actualmente un campo fiscal oficial como:

```text
RFC
```

Por tanto no debe existir una regla documental como:

```text
Customer RFC must be unique
```

mientras ese campo no exista formalmente.

---

# 22. Fiscal Profile — FUTURE

Billing / CFDI puede requerir posteriormente:

```text
RFC

legal name

tax regime

fiscal postal code

CFDI use
```

El modelo debe diseñarse junto con Billing y no añadirse de forma aislada a
Customers.

---

# 23. Commercial Name vs Legal Name

Puede existir diferencia entre:

```text
commercial name
```

y:

```text
legal / fiscal name
```

El modelo actual no formaliza completamente esa distinción.

Pertenece a la futura evolución fiscal/comercial.

---

# 24. Type

Customer contiene actualmente:

```text
type String?
```

Es una clasificación opcional.

---

# 25. Type no es discriminador fuerte

Mientras `type` sea:

```text
String?
```

no debe gobernar lógica crítica como:

```text
authorization

Billing

Healthcare

Payer rules

Hospital behavior

Customer lifecycle
```

---

# 26. No utilizar Type como modelo Healthcare

Debe evitarse utilizar valores libres como:

```text
HOSPITAL

DOCTOR

PAYER
```

para reemplazar dominios especializados.

Debe mantenerse:

```text
Customer.type
→ optional classification
```

No:

```text
Customer.type
→ universal domain discriminator
```

---

# 27. Evolución de Type — FUTURE

Si aparecen categorías estables, `type` podrá evolucionar hacia:

```text
enum

catalog

configurable classification
```

según la necesidad real.

No debe decidirse prematuramente.

---

# 28. Email

`email` es opcional.

Puede utilizarse para:

```text
commercial contact

future document delivery

notifications

future Customer Portal
```

---

# 29. Customer email ≠ User identity

Debe mantenerse:

```text
Customer.email
≠
User.email authentication identity
```

Un Customer no se convierte automáticamente en un usuario autenticado.

---

# 30. Phone

`phone` es opcional.

Actualmente funciona como dato de contacto.

No debe utilizarse como identificador único sin una decisión específica.

---

# 31. Address

Customer utiliza actualmente:

```text
address
```

como campo simple.

No representa necesariamente:

```text
billing address

shipping address

fiscal address

Healthcare hospital location
```

simultáneamente.

---

# 32. Multiple Addresses — FUTURE

Una futura evolución puede necesitar:

```text
Billing Address

Shipping Address

Fiscal Address

Branch Address
```

Debe diseñarse junto con:

```text
Sales

Delivery

Billing
```

---

# 33. Contact Name

`contactName` representa actualmente el contacto principal conocido.

Ejemplo:

```text
Customer
Hospital ABC

Contact
Lic. María Pérez
```

---

# 34. Contact ≠ Customer

La persona de contacto no constituye necesariamente la entidad contractual.

Debe mantenerse:

```text
contactName
→ descriptive contact
```

---

# 35. Contact ≠ User

También:

```text
Customer.contactName
≠
authenticated Zaping User
```

No deben derivarse permisos o autenticación desde este campo.

---

# 36. Multiple Contacts — FUTURE

Una futura evolución puede requerir:

```text
Customer
└── Contacts[]
```

con responsabilidades como:

```text
Purchasing

Administration

Warehouse

Payments

Management
```

No forma parte de Customers V1.

---

# 37. creditLimit

Customer contiene actualmente:

```text
creditLimit Decimal?
```

Debe tratarse como:

```text
commercial reference
```

---

# 38. creditLimit no es Credit Engine

La existencia del campo no significa que Zaping ya implemente:

```text
Accounts Receivable

available credit

aging

payment reconciliation

automatic blocking

credit risk
```

---

# 39. creditLimit ≠ Available Credit

No debe utilizarse una fórmula simplista:

```text
availableCredit
=
creditLimit
-
Sales total
```

porque un cálculo financiero real deberá considerar:

```text
Invoices

Payments

Credit Notes

open balances

due dates

pending documents
```

---

# 40. Credit Management — FUTURE

Una evolución futura podrá introducir:

```text
SalesOrder
↓
Credit Check
↓
Approve / Warn / Block
```

cuando existan suficientes dominios financieros para hacerlo correctamente.

---

# 41. Decimal handling

`creditLimit` utiliza `Decimal` según el modelo actual.

Debe preservarse correctamente en:

```text
backend

DTO handling

serialization

frontend
```

y evitar conversiones imprecisas innecesarias.

---

# 42. Notes

`notes` contiene contexto administrativo secundario.

Ejemplo:

```text
Solicita cotizaciones por correo antes de las 14:00.
```

---

# 43. Notes no es modelo estructurado

No debe utilizarse `notes` como única fuente de información que gobierne:

```text
payment terms

Payer

Hospital

delivery address

fiscal data

credit rules
```

Si esos datos comienzan a afectar workflows, deberán modelarse explícitamente.

---

# 44. Create Customer

La creación debe obtener:

```text
companyId
```

desde el contexto autenticado.

Debe mantenerse:

```text
JWT / authenticated context
↓
companyId
↓
Create Customer
```

No:

```text
client-provided companyId
→ tenant authority
```

---

# 45. Update Customer

PATCH puede modificar únicamente los campos maestros permitidos por el DTO vigente.

No debe aceptar Mass Assignment de:

```text
companyId

createdAt

internal relations
```

ni otros atributos no autorizados.

---

# 46. Lifecycle separado de PATCH

Debe mantenerse:

```text
PATCH /customers/:id
→ master-data update
```

```text
DELETE /customers/:id
→ ACTIVE → INACTIVE
```

```text
INACTIVE → ACTIVE
→ NOT IMPLEMENTED
```

El lifecycle no debe convertirse en un switch arbitrario dentro del formulario
maestro.

---

# 47. API CURRENT

Endpoints actuales:

```text
GET    /customers

GET    /customers/:id

POST   /customers

PATCH  /customers/:id

DELETE /customers/:id
```

Semántica:

```text
DELETE
→ deactivate
→ not hard delete
```

---

# 48. Tenant isolation

Todas las operaciones deben mantenerse tenant-scoped.

Debe impedirse:

```text
Company A User
→ GET Customer Company B
```

```text
Company A User
→ PATCH Customer Company B
```

```text
Company A User
→ deactivate Customer Company B
```

---

# 49. Customer ↔ Quote — CURRENT

Actualmente:

```text
Customer
↓
Quote
```

Quote utiliza Customer como contraparte comercial.

Backend debe validar para nuevas Quotes:

```text
Customer exists

+

Customer belongs to authenticated Company

+

Customer.isActive = true
```

Estado:

```text
active Customer validation for new Quotes
→ IMPLEMENTED
```

---

# 50. Inactive Customer + Quote

Debe mantenerse:

```text
Inactive Customer
↓
New Quote
→ BLOCK
```

pero:

```text
Customer becomes inactive later
↓
Historical Quote
→ remains valid
```

La desactivación no reescribe historia.

---

# 51. Customer ↔ Sale — CURRENT

Actualmente:

```text
Customer
↓
Sale
```

Sale representa el documento comercial vigente de Sales V1.

Backend debe validar para nuevas Sales:

```text
Customer exists

+

Customer belongs to authenticated Company

+

Customer.isActive = true
```

Estado:

```text
active Customer validation for new Sales
→ IMPLEMENTED
```

---

# 52. Inactive Customer + Sale

Debe mantenerse:

```text
Inactive Customer
↓
New Sale
→ BLOCK
```

mientras:

```text
Customer becomes inactive later
↓
Historical Sale
→ remains valid
```

---

# 53. Sale es CURRENT

Debe mantenerse claramente:

```text
CURRENT

Customer
↓
Sale
```

`Sale` no debe describirse todavía como un modelo meramente legacy.

Forma parte del ERP Core V1 vigente.

---

# 54. SalesOrder / Delivery — TARGET

La arquitectura comercial futura podrá evolucionar hacia:

```text
Customer
↓
SalesOrder
↓
Delivery
```

En esa arquitectura:

```text
SalesOrder
→ commercial commitment
```

```text
Delivery
→ physical fulfillment
```

Actualmente:

```text
SalesOrder
→ NOT IMPLEMENTED
```

```text
Delivery
→ NOT IMPLEMENTED
```

como sustitutos del flujo Sale V1.

---

# 55. CURRENT vs TARGET commercial model

Debe mantenerse:

```text
CURRENT

Customer
↓
Quote
↓
Sale
```

frente a:

```text
TARGET

Customer
↓
Quote
↓
SalesOrder
↓
Delivery
```

La arquitectura TARGET no debe documentarse como estado operativo actual.

---

# 56. Delivery Address — TARGET

Cuando exista Delivery, su destino físico puede diferir de:

```text
Customer.address
```

Debe mantenerse:

```text
Customer
≠
Delivery Address
```

como regla general.

---

# 57. Historical document data

Cambiar posteriormente:

```text
Customer name

address

email

phone
```

no debe reinterpretar de manera incorrecta la transacción histórica.

Los documentos deben conservar sus propios datos persistidos cuando el modelo
actual así lo haga.

---

# 58. Customer identity snapshots — FUTURE

Cuando exista necesidad de congelar formalmente datos como:

```text
Customer legal name

commercial address

fiscal information
```

en un documento emitido, deberá diseñarse una estrategia explícita de snapshot.

No se asume que todos esos snapshots existen actualmente.

---

# 59. CustomerSelector — CURRENT

`CustomerSelector` es un Business Component implementado para seleccionar Customers
dentro de workflows comerciales.

CURRENT:

```text
Quote
Sale
↓
CustomerSelector
↓
Customer
```

Future consumers pueden incluir:

```text
SalesOrder
```

---

# 60. CustomerSelector no es autoridad de dominio

Debe mantenerse:

```text
CustomerSelector
→ UX selection
```

mientras:

```text
backend
→ authoritative validation
```

Aunque UI filtre Customers, backend debe volver a validar:

```text
tenant

existence

isActive

workflow rules
```

---

# 61. Inactive Customer in selector

Para nuevas operaciones:

```text
Customer.isActive = false
→ excluded from normal selection
```

Esto complementa la validación backend.

Debe mantenerse:

```text
UI filtering
+
backend validation
```

---

# 62. Search

Criterios útiles incluyen:

```text
name

contactName

email
```

y posteriormente:

```text
RFC

Customer code

Organization context
```

cuando existan esos campos.

---

# 63. Contextual Customer creation — TARGET UX

Una futura experiencia puede permitir:

```text
New Quote
↓
Customer not found
↓
Create Customer
↓
Select new Customer
↓
Continue Quote
```

sin perder:

```text
items

quantities

prices

notes

commercial context
```

No debe marcarse como CURRENT sin implementación verificada.

---

# 64. Frontend Customers V1

La experiencia actual puede presentar información en secciones como:

```text
General

Contacto

Dirección

Crédito

Notas
```

y soporta el lifecycle vigente de Customers.

Capacidades principales:

```text
list

create

edit

deactivate

active state

historical detail

Customer selection in commercial workflows
```

---

# 65. Customer 360 — FUTURE UX

Una futura experiencia:

```text
Customer 360
```

puede reunir contexto de múltiples dominios.

Puede responder:

```text
Who is this Customer?

Are they active?

How do we contact them?

What have we quoted?

What have they purchased?

What documents exist?

What requires attention?
```

---

# 66. Customer 360 content

Puede incluir progresivamente:

```text
General

Quotes

Sales

future Sales Orders

future Deliveries

future Billing

Activity

Documents

History
```

Debe mantenerse:

```text
Customer 360
→ read model / contextual UX
```

No:

```text
Customers
→ owns Quote or Sale lifecycle
```

---

# 67. Customer analytics — FUTURE

Una futura vista puede mostrar:

```text
total sales

last sale

open Quotes

purchase frequency

commercial inactivity
```

cuando exista información suficiente.

No deben inventarse métricas sin datos confiables.

---

# 68. Customer ≠ Organization

Customer representa:

```text
commercial relationship
```

No necesariamente una abstracción universal de cualquier organización del mundo
real.

Una entidad como:

```text
Hospital
```

puede existir operacionalmente sin ser automáticamente Customer.

---

# 69. Generic Organization — FUTURE DECISION

Una futura arquitectura podría evaluar una entidad común como:

```text
Organization
```

para ciertos roles empresariales.

Sin embargo:

```text
Organization model
→ NOT DECIDED
```

No debe introducirse desde Customers sin revisar:

```text
Suppliers

Healthcare

Billing

Contacts

migrations

APIs
```

---

# 70. Customer ≠ Doctor

Debe mantenerse:

```text
Customer
≠
Doctor
```

Un Doctor puede:

```text
request a Product

participate in a Case

influence demand

work at multiple Hospitals
```

sin ser la contraparte comercial.

---

# 71. Doctor who is also Customer

Una misma persona real podría desempeñar ambos roles en determinados escenarios.

Eso no significa:

```text
all Doctors
→ Customers
```

Los roles deben mantenerse conceptualmente separados.

---

# 72. Customer ≠ Hospital

Debe mantenerse:

```text
Customer
≠
Hospital
```

Hospital puede representar:

```text
procedure location

buyer

payer

operational organization

none of the above
```

según el contexto.

---

# 73. Hospital as Customer

En una operación concreta, Hospital puede actuar como contraparte comercial.

Eso no implica:

```text
Hospital
=
Customer
```

como equivalencia universal.

---

# 74. Customer ≠ Payer

También:

```text
Customer
≠
Payer
```

Quien compra, recibe o solicita un producto puede no ser quien finalmente paga.

---

# 75. No inferir Payer

Cuando Billing soporte múltiples responsabilidades económicas, no debe asumirse:

```text
customerId
=
payerId
```

sin reglas explícitas.

---

# 76. Healthcare boundary

Customers pertenece a ERP Core.

Healthcare puede utilizar contexto comercial de Customer cuando corresponda.

Pero debe mantener separados:

```text
Customer

Doctor

Hospital

Payer

Case
```

---

# 77. Healthcare Foundation

La existencia de Healthcare Case Foundation no modifica automáticamente Customer.

No deben agregarse a Customer campos como:

```text
doctorId

hospitalId

payerId

caseId

diagnosis
```

para resolver la vertical.

---

# 78. Healthcare commercial context — TARGET

Futuros workflows pueden relacionar:

```text
Case
+
Customer
+
Payer
```

cuando el contexto comercial haya sido determinado.

No todos los Cases necesitan conocer Customer desde el primer momento.

---

# 79. Opportunity — FUTURE

Un posible futuro flujo CRM/Healthcare podría ser:

```text
Doctor contact
↓
Opportunity
↓
Case
↓
commercial responsibility
↓
Customer / Payer
```

Actualmente:

```text
Opportunity
→ FUTURE
```

No forma parte de Customers V1 ni Healthcare Case Foundation actual.

---

# 80. Direct commercial flow

Fuera de Healthcare:

```text
CURRENT

Customer
↓
Sale
```

y posteriormente:

```text
TARGET

Customer
↓
SalesOrder
↓
Delivery
```

No debe requerirse:

```text
Hospital

Doctor

Case
```

para una venta comercial normal.

---

# 81. Privacy

Customer contiene información empresarial y potencialmente información personal
de contactos.

Debe aplicarse:

```text
data minimization

authorization

tenant isolation

limited exposure
```

---

# 82. Personal contact data

Campos como:

```text
contactName

email

phone
```

pueden representar datos personales de personas relacionadas con el Customer.

Solo deben utilizarse para fines empresariales necesarios.

---

# 83. Customer ≠ Patient

Debe mantenerse:

```text
Customer
≠
Patient
```

Customers no debe convertirse en un repositorio de:

```text
diagnosis

clinical history

medical record

patient health data
```

---

# 84. Patient domain

Actualmente Zaping no necesita un Patient master para resolver el ERP Core ni el
Healthcare Case Foundation vigente.

Si una futura capacidad requiere información de paciente, deberá evaluarse como
una decisión específica por su sensibilidad.

---

# 85. Authorization

Customers utiliza la arquitectura transversal de Identity & Access.

Permisos conceptuales futuros pueden incluir:

```text
customers.read

customers.create

customers.update

customers.deactivate
```

El Permission-Based RBAC completo continúa como TARGET.

---

# 86. Credit permissions — FUTURE

Si `creditLimit` se convierte posteriormente en una configuración financiera
sensible, puede ser necesario distinguir:

```text
customers.update
```

de:

```text
customers.credit.update
```

No se requiere actualmente.

---

# 87. Audit — TARGET

Una futura capacidad transversal de Audit puede registrar:

```text
Customer created

Customer updated

Customer deactivated

Customer reactivated

creditLimit changed
```

Actualmente no existe un Audit transversal completo.

---

# 88. Data Import — FUTURE

Customers es candidato natural para importación desde:

```text
CSV

XLSX

external systems
```

Flujo conceptual:

```text
File
↓
Mapping
↓
Validation
↓
Duplicate analysis
↓
Preview
↓
Import
```

---

# 89. External systems

Una futura migración puede recibir datos desde sistemas como:

```text
CONTPAQi

Aspel

Microsip

Odoo

SAP

Excel
```

Debe mantenerse:

```text
external identifier
≠
Zaping Customer UUID
```

---

# 90. Customer Code — FUTURE

Muchos ERP utilizan un código empresarial de Customer.

Actualmente no existe un campo oficial documentado para ello.

Si el negocio lo requiere deberá añadirse deliberadamente.

No debe reutilizarse:

```text
UUID

type
```

para cumplir esa función.

---

# 91. Customer Portal — FUTURE

Debe distinguirse:

```text
Customer 360
→ internal Zaping users
```

de:

```text
Customer Portal
→ authorized external users
```

Customer master no constituye por sí mismo una credencial de acceso.

---

# 92. Customer Portal identity

Una futura experiencia externa requerirá:

```text
external identity

authentication

authorization

Customer relationship
```

sin reutilizar directamente:

```text
Customer.email
```

como identidad autenticada automática.

---

# 93. Accounts Receivable — FUTURE

Capacidades futuras pueden incluir:

```text
Invoices

Payments

Accounts Receivable

Credit Notes

Aging

Payment Terms
```

Estas capacidades financieras no pertenecen actualmente a Customer V1.

---

# 94. Dashboard

Dashboard puede consumir Customers para métricas como:

```text
active Customers

total Customers

recent Customers

sales by Customer
```

cuando sean útiles.

Dashboard no es propietario del catálogo.

---

# 95. Analytics — FUTURE

Métricas como:

```text
Top Customers

Customer inactivity

purchase frequency

commercial trend
```

deben derivarse de operaciones reales.

No deben almacenarse manualmente como propiedades arbitrarias del Customer.

---

# 96. AI — FUTURE

Una futura capa de inteligencia podrá identificar patrones como:

```text
This Customer has not purchased recently.
```

o:

```text
Purchase frequency decreased.
```

solo cuando existan datos suficientes y reglas confiables.

---

# 97. IMPLEMENTED

Actualmente:

```text
Customer persistence

Customer create

active Customer list

Customer detail

Customer update

soft-deactivation

inactive historical detail

tenant-scoped operations

type String?

contact data

creditLimit

Quote relationship

Sale relationship

CustomerSelector

active Customer validation for new Quotes

active Customer validation for new Sales

Customers frontend
```

---

# 98. VALIDATED

La validación registrada cubre según los hitos correspondientes:

```text
Customer create

Customer update

tenant-scoped detail

soft-deactivation

repeated deactivation

active-only list

inactive historical detail

historical Quote compatibility

historical Sale compatibility

inactive Customer rejection in new Quote

inactive Customer rejection in new Sale

frontend Customer workflows

CustomerSelector-dependent flows
```

Los gates técnicos incluyen según el hito:

```text
tests

build

lint

git diff --check
```

Los snapshots cuantitativos pertenecen a:

```text
PROJECT_BOARD.md

CHANGELOG.md
```

---

# 99. TECHNICAL DEBT

Permanece pendiente:

```text
Customer reactivation workflow
```

```text
server-side Customer search / pagination when required
```

```text
Audit integration
```

```text
formal Customer identity snapshot strategy where needed
```

La detección avanzada de duplicados también puede evaluarse cuando exista mejor
identidad fiscal/comercial.

---

# 100. TARGET

Evoluciones posteriores pueden incluir:

```text
Customer reactivation

server-side search / pagination

Customer 360

Contextual Customer creation

Audit integration

Data Import

SalesOrder integration

Delivery integration
```

No todas tienen la misma prioridad.

---

# 101. FUTURE

Capacidades posibles:

```text
Fiscal Profile

Multiple Contacts

Multiple Addresses

Customer Code

Credit Management

Accounts Receivable

Payment Terms

Price Lists

Customer Segmentation

Customer Portal

Documents

Advanced Analytics

AI Recommendations

generic Organization model if justified
```

No forman parte automáticamente del ERP Core V1.

---

# 102. Invariantes

## Tenant

```text
Customer
→ belongs to one Company
```

```text
Customer companyId
→ derives from authenticated tenant
```

---

## Lifecycle

```text
ACTIVE
→ may participate in new compatible commercial operations
```

```text
INACTIVE
→ remains historically visible
```

---

## Deactivation

```text
DELETE /customers/:id
→ isActive = false
```

No:

```text
physical deletion
```

---

## Reactivation

```text
INACTIVE → ACTIVE
→ NOT IMPLEMENTED
```

---

## Quote

```text
New Quote
→ active same-tenant Customer required
```

---

## Sale

```text
New Sale
→ active same-tenant Customer required
```

---

## Historical operations

```text
Customer deactivation
→ does not invalidate historical Quotes or Sales
```

---

## Name

```text
Customer.name
→ not unique by current schema
```

---

## Type

```text
Customer.type
→ optional classification
→ not authoritative domain discriminator
```

---

## Email

```text
Customer.email
≠
User login identity
```

---

## Credit

```text
creditLimit
≠
available credit
```

```text
creditLimit
≠
complete Credit Management
```

---

## Healthcare

```text
Customer
≠
Doctor
```

```text
Customer
≠
Hospital
```

```text
Customer
≠
Payer
```

```text
Customer
≠
Patient
```

---

# 103. Anti-patrones

## Hard Delete

Eliminar físicamente un Customer histórico.

Incorrecto.

---

## Lifecycle through arbitrary PATCH

```text
PATCH Customer
isActive = true / false
```

como mecanismo genérico de lifecycle.

Incorrecto para el contrato vigente.

---

## Fake Customer name uniqueness

Documentar:

```text
unique(companyId, name)
```

cuando el schema actual no lo define.

Incorrecto.

---

## Fake RFC rule

Documentar unicidad o validación de:

```text
Customer.rfc
```

cuando el campo no existe.

Incorrecto.

---

## Inactive Customer accepted by UI only

Depender exclusivamente de que frontend oculte Customers inactivos.

Incorrecto.

Backend debe validar.

---

## Customer = Hospital

Usar Customer como reemplazo universal de Hospital.

Incorrecto.

---

## Customer = Doctor

Usar Customer como reemplazo universal de Doctor.

Incorrecto.

---

## Customer = Payer

Asumir que quien compra es necesariamente quien paga.

Incorrecto.

---

## Customer = Patient

Guardar información clínica dentro del catálogo de Customers.

Incorrecto.

---

## Contact = User

Utilizar automáticamente:

```text
Customer.email
```

o:

```text
contactName
```

como identidad autenticada.

Incorrecto.

---

## Type as universal discriminator

Utilizar un `String?` libre para determinar:

```text
Hospital

Doctor

Payer

permissions

billing rules
```

Incorrecto.

---

## Credit Limit = Available Credit

Bloquear ventas mediante una resta incompleta sin dominio financiero.

Incorrecto.

---

## Notes as structured model

Guardar dentro de notes información estructurada que gobierna workflows.

Incorrecto.

---

# 104. Relación con Quotes

CURRENT:

```text
Customer
↓
Quote
```

Customers identifica la contraparte.

Quotes administra:

```text
proposal

items

commercial values

Quote lifecycle
```

El Customer activo se valida en nuevas Quotes.

---

# 105. Relación con Sales

CURRENT:

```text
Customer
↓
Sale
```

Sales administra el workflow comercial actual.

Debe mantenerse:

```text
Sale
→ CURRENT
```

No describirlo todavía como un modelo únicamente histórico.

---

# 106. Relación con SalesOrder / Delivery

TARGET:

```text
Customer
↓
SalesOrder
↓
Delivery
```

Esta arquitectura pertenece a la evolución futura del flujo comercial.

No sustituye todavía el comportamiento CURRENT de Sale.

---

# 107. Relación con Healthcare

Healthcare puede asociar Customer cuando exista contexto comercial.

Debe mantener independientes:

```text
Doctor

Hospital

Customer

Payer

Case
```

Customers no absorbe esos dominios.

---

# 108. Relación con Billing

Billing utilizará Customer o la estructura fiscal/comercial correspondiente para
documentos financieros.

La definición de:

```text
Payer

Fiscal Profile

Accounts Receivable
```

no pertenece completamente a Customers V1.

---

# 109. Relación con Business Components

`CustomerSelector` pertenece conceptualmente a:

```text
ux/BUSINESS_COMPONENTS.md
```

Customers proporciona:

```text
resource + business rules
```

CustomerSelector proporciona:

```text
reusable selection experience
```

---

# 110. ADR relacionados

```text
ADR-001 — Multi-Tenant

ADR-004 — UUID

ADR-005 — Layered Architecture

ADR-006 — API First

ADR-007 — RBAC

ADR-009 — Modular Monolith

ADR-011 — SalesOrder + Delivery

ADR-012 — Entity Lifecycle

ADR-013 — Inventory Custody & Case Logistics
```

ADR-011 representa arquitectura comercial TARGET y no significa que
SalesOrder/Delivery ya estén implementados.

---

# 111. Documentación relacionada

```text
docs/modules/erp/QUOTES.md

docs/modules/erp/SALES.md

docs/modules/erp/PRODUCTS.md

docs/modules/erp/INVENTORY.md

docs/modules/erp/IDENTITY_ACCESS.md

docs/modules/erp/SUPPLIERS.md

docs/modules/healthcare/HEALTHCARE.md

docs/modules/healthcare/DOMAIN_MODEL.md

docs/architecture/ARCHITECTURE.md

docs/engineering/API_GUIDELINES.md

docs/engineering/SECURITY_PRINCIPLES.md

docs/product/PRODUCT_REQUIREMENTS.md

docs/product/ZAPING_WAY.md

docs/ux/BUSINESS_COMPONENTS.md

docs/project/PROJECT_BOARD.md

docs/project/ROADMAP.md

docs/project/CHANGELOG.md
```

`QUOTES.md` y `SALES.md` son documentación CURRENT relacionada, no documentos
futuros.

---

# 112. Fuente de verdad

```text
CUSTOMERS.md
→ Customer master-data behavior
→ Customer lifecycle
```

```text
QUOTES.md
→ CURRENT Quote behavior
→ active Customer validation for Quotes
```

```text
SALES.md
→ CURRENT Sale behavior
→ active Customer validation for Sales
```

```text
ADR-011
→ TARGET SalesOrder / Delivery architecture
```

```text
Healthcare documentation
→ Doctor / Hospital / Case boundaries
```

```text
Billing future
→ fiscal / Payer / financial behavior
```

```text
schema.prisma
→ CURRENT persistence
```

```text
Customers backend
→ CURRENT API/business implementation
```

```text
Customers frontend
→ CURRENT user experience
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

# 113. Estado consolidado

```text
Customer create
✅ IMPLEMENTED / VALIDATED

active Customer list
✅ IMPLEMENTED / VALIDATED

Customer detail
✅ IMPLEMENTED / VALIDATED

Customer master-data update
✅ IMPLEMENTED / VALIDATED

soft-deactivation
✅ IMPLEMENTED / VALIDATED

inactive historical detail
✅ IMPLEMENTED / VALIDATED

tenant-scoped operations
✅ IMPLEMENTED / VALIDATED

CustomerSelector
✅ IMPLEMENTED

Quote integration
✅ IMPLEMENTED / VALIDATED

Sale integration
✅ IMPLEMENTED / VALIDATED

active Customer validation for new Quotes
✅ IMPLEMENTED / VALIDATED

active Customer validation for new Sales
✅ IMPLEMENTED / VALIDATED
```

Pendiente:

```text
Customer reactivation
⏳

server-side Customer search / pagination
⏳

Audit integration
⏳

formal identity snapshot strategy where required
⏳
```

Target / Future:

```text
SalesOrder / Delivery integration

Customer 360

Contextual Customer creation

Fiscal Profile

Credit Management

Multiple Contacts

Multiple Addresses

Data Import

Customer Portal

Accounts Receivable

Price Lists

Advanced Analytics
```

---

# 114. Secuencia de proyecto

Customers V1 forma parte del ERP Core ya normalizado.

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
Customer 360

Customer Portal

Credit Management

SalesOrder / Delivery

generic Organization model
```

no deben convertirse automáticamente en el siguiente sprint únicamente porque
aparecen documentadas.

---

# 115. Principio final

Customer debe responder una pregunta clara:

```text
¿Quién es nuestra contraparte comercial?
```

CURRENT:

```text
Customer
↓
Quote
↓
Sale
```

TARGET:

```text
Customer
↓
Quote
↓
SalesOrder
↓
Delivery
```

Healthcare mantiene otros conceptos independientes:

```text
Doctor
→ Healthcare participant

Hospital
→ organizational / procedure context

Customer
→ commercial counterpart

Payer
→ economic responsibility
```

Estas funciones pueden coincidir en una misma entidad del mundo real, pero Zaping
no debe asumir que son equivalentes.

Debe mantenerse:

```text
Customer identity
≠
commercial transaction
≠
Healthcare participant
≠
physical location
≠
economic payer
```

---

## CRM-DASH — extensión comercial pendiente (2026-11-18)

**Estado:** decisión de producto aprobada; **BACKLOG / NO IMPLEMENTADO**. La evolución propuesta convierte la página Clientes en un CRM ligero: `Resumen comercial | Directorio | Oportunidades`, con indicadores ejecutivos, oportunidades y seguimientos, sin alterar el dominio maestro de Customer ni los ciclos de vida de Quotes/Sales.

El trabajo se planificará **después de ERP Pilot Readiness P0**. `CRM-001` conserva su significado preexistente de carteras, responsables y permisos comerciales; `CRM-DASH-01..05` identifican entregas distintas. No declarar métricas por vendedor ni conversión hasta que existan datos y reglas de atribución verificadas. Esta nota **no modifica modelos, endpoints ni permisos CURRENT**.

**Documento fuente:** [CRM_DASHBOARD_PROPOSAL_2026-11-18.md](CRM_DASHBOARD_PROPOSAL_2026-11-18.md).  
**Roadmap / backlog:** [ROADMAP.md](../../project/ROADMAP.md) y [PROJECT_BOARD.md](../../project/PROJECT_BOARD.md).
