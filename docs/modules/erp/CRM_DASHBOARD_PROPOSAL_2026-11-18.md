# CRM-DASH — Evolución de Clientes a dashboard comercial

**Producto:** Zaping ERP · módulo Clientes  
**Estado:** DECISIÓN DE PRODUCTO APROBADA / PENDIENTE DE DESARROLLO  
**Fecha de registro:** 2026-11-18  
**Prioridad estratégica:** P1, después de los gates P0 de ERP Pilot Readiness  
**Sprint, estimación y fechas:** sin asignar  
**Implementación:** NO INICIADA. Este documento no autoriza trabajo productivo durante la estabilización.

## 1. Objetivo y problema

Evolucionar la página **Clientes** hacia un centro comercial ligero de medición y seguimiento, sin construir otro producto ni replicar Microsoft Dynamics 365. INSAP utiliza Dynamics en prospección, oportunidades comerciales y seguimiento de ventas/vendedores. Dirección necesita visibilidad sobre resultados, actividad de equipo, negociaciones abiertas y acciones pendientes. Los vendedores necesitan continuidad del seguimiento.

**Decisión:** mantener un único ERP con tres vistas dentro de Clientes: `Resumen comercial | Directorio | Oportunidades`. La adopción por INSAP y cualquier futura sustitución de Dynamics no están comprometidas contractualmente.

## 2. Estado actual frente a objetivo

**CURRENT:** Clientes V1, altas/edición, clasificación/ubicación, directorio y ficha individual con información general, cotizaciones y ventas recientes; mejoras UX-005A/B/C/D integradas en `main` mediante PR #280–#283 el 18-nov-2026. La integración de código no demuestra por sí sola habilitación productiva.

**TARGET / PENDIENTE:**
- Resumen comercial de Clientes, Quotes y Sales con métricas verificables, filtros de período y estados de carga/error/sin datos.
- Prospectos y oportunidades con etapas, importes estimados, responsables y enlaces a cotizaciones.
- Actividades: llamadas, reuniones, visitas y seguimientos con vencimiento y responsable.
- Cartera y atribución comercial por vendedor, con autorización transversal.
- Embudo, conversión y alertas solo cuando existan datos y reglas suficientes.
- Consumo posterior de KPIs por Zaping Executive AI/ChatGPT mediante herramientas de lectura segura (MCP).

## 3. Alcance y exclusiones

Incluido en la dirección de producto: métricas ejecutivas, seguimiento comercial, oportunidades, responsables y navegación contextual hacia los módulos propietarios. **No incluidos en V1:** marketing automation, forecasting predictivo, campañas, CPQ avanzado, sincronización automática productiva con Dynamics, reemplazo inmediato del CRM actual o una segunda base de clientes.

El Dashboard **no** es propietario de ciclos de vida de Customer, Quote, Sale, Opportunity ni Inventory; agrega exclusivamente consultas de lectura y redirige a los respectivos workflows. `Customer` sigue siendo master data; `Quote` y `Sale` conservan sus reglas de negocio.

`CRM-001` ya aparece reservado en `docs/ux/UX-005D-customers-classification-location.md` para cartera, responsables y permisos comerciales. **No reutilizar este identificador para CRM Dashboard**; registrar los incrementos como `CRM-DASH-01` a `CRM-DASH-05`.

## 4. Experiencia objetivo

- **Resumen comercial:** tarjetas KPI reales, comparación de períodos cuando se defina la semántica, atención a clientes inactivos y cola de seguimientos.
- **Directorio:** conservar catálogo, filtros y formularios actuales sin regresiones; acceso a ficha individual.
- **Oportunidades:** lista/embudo y actividad siguiente, solo tras desarrollar el dominio correspondiente.
- **Roles:** dirección consulta agregados permitidos; vendedores consultan su cartera y actividad autorizadas. Los filtros de frontend no constituyen autorización.
- **Estados:** distinguir `0`, `sin datos suficientes`, `consulta fallida`, `loading` y `sin permisos`; jamás sustituir errores por cifras ficticias.

## 5. Catálogo inicial de métricas y gates

| Métrica candidata | Fuente | Condición antes de mostrar |
|---|---|---|
| Clientes registrados/habilitados | Customer | Definir `isActive`, companyId y fecha de corte |
| Clientes nuevos por período | Customer.createdAt | Período y zona horaria de Company |
| Cotizaciones del período | Quotes | Estados, fecha efectiva y cancelaciones |
| Ventas del período | Sales | Estados, devoluciones, moneda y fecha efectiva |
| Clientes sin compras recientes | Sales por Customer | Ventana y elegibilidad documentadas |
| Oportunidades abiertas e importe | Nuevo Opportunity | Lifecycle y estados no terminales aprobados |
| Conversión comercial | Opportunity | Numerador/denominador y cohorte definidos |
| Actividades vencidas | Nueva CommercialActivity | Fecha, estado y zona horaria |
| Rendimiento por vendedor | Ownership + Activity/Quotes/Sales | `CRM-001` y regla auditable de atribución |

Todo KPI requiere **contrato de métrica**: nombre, propósito, fuente, fórmula, fecha/timezone, moneda, estados incluidos/excluidos, denominador, regla de permisos, comportamiento sin datos y pruebas. No inferir cifras por vendedor según quién capturó la operación ni representar cotizaciones como oportunidades ganadas.

## 6. Modelo de dominio propuesto — NO APROBADO PARA MIGRACIÓN

- `Customer`: contraparte comercial y datos maestros, sin responsabilidad sobre las ventas ni los casos clínicos.
- `Opportunity`: posible oportunidad vinculada a prospecto/cliente, etapas, responsable y resultado; no sustituye Quote.
- `CommercialActivity`: llamada, reunión, visita o tarea asociada a cliente/oportunidad, con fecha y autoría.
- `CommercialOwnership` o política equivalente: se formalizará en `CRM-001`, transversal a Clientes/Quotes/Sales y futuras métricas.
- `CRM Dashboard`: read model agregado tenant-scoped, sin autoridad de escritura.

Healthcare Case, Doctor y Hospital mantienen sus dominios; no convertirlos automáticamente en `Customer`. Zaping Radar puede generar oportunidades futuras mediante contratos explícitos, no acceso directo a tablas de negocio.

## 7. Seguridad y calidad

- `companyId` derivado de la sesión validada, no de un valor arbitrario enviado por el cliente.
- RBAC y restricciones por cartera **en el backend**; evitar filtraciones indirectas mediante conteos, exports o búsquedas.
- Revisar cifrado/privacidad, datos de clientes e historial de actividades; trazabilidad de reasignaciones y cambios de etapa.
- No importar ni sincronizar registros de Dynamics sin autorización, deduplicación, mapeo y origen de verdad acordado.
- Para futura integración con ChatGPT: OAuth/scopes, herramienta MCP de solo lectura, auditoría y prohibición de SQL arbitrario o bypass de permisos.
- Pruebas de segregación multiempresa, métricas, estados, casos límite, regresión de Clientes/Quotes/Sales y QA por rol. No declarar PASS sin ejecutar.

## 8. Plan de entregas (todos PENDIENTES)

| ID | Incremento | Dependencias | Estado |
|---|---|---|---|
| CRM-DASH-01 | Resumen comercial con KPIs **existentes y verificables** en Clientes | P0 estabilización, contratos de métricas, QA | BACKLOG / NO INICIADO |
| CRM-001 | Carteras, responsables y autorización transversal — ID preexistente | Definición de atribución, RBAC, revisión de alcance | DEPENDENCIA / NO INICIADO |
| CRM-DASH-02 | Oportunidades, pipeline y etapas | Modelo de negocio, CRM-001 | BACKLOG / NO INICIADO |
| CRM-DASH-03 | Actividades y seguimientos | Clientes/Oportunidades, permisos | BACKLOG / NO INICIADO |
| CRM-DASH-04 | Embudo, conversión y desempeño por vendedor | CRM-001/02/03, definiciones verificadas | BACKLOG / NO INICIADO |
| CRM-DASH-05 | Zaping Executive AI, métricas vía ChatGPT/MCP | KPIs estables, OAuth y auditoría | FUTURE / NO INICIADO |

### Regla de prioridad

La estabilización del ERP y preparación del piloto controlado (P0) **tienen precedencia**. CRM Dashboard no es requisito del primer piloto. No se asignan sprint, story points ni Target/Forecast/Commitment/Actual hasta refinement y autorización posterior al congelamiento de cambios. No se implementan endpoints, modelos, migraciones ni interfaces como parte de este registro documental.

## 9. Definition of Ready para CRM-DASH-01

- P0 de estabilización revisados y habilitación de desarrollo autorizada.
- Mapa de métricas aprobado con fuentes, semántica y visibilidad por rol.
- Contrato API/read-model y diseño UX revisados.
- Datos de QA confiables, matriz de roles y casos cross-tenant preparados.
- Aceptación explícita del primer incremento y estimación formal.

## 10. Criterios de aceptación y Definition of Done (futuro)

- Directorio y ficha individual conservan los flujos y permisos existentes.
- El dashboard presenta únicamente KPIs reales correctamente calculados y atribuibles a una fuente.
- Estados `0`, `sin datos`, `error`, `loading` y `forbidden` visibles y accesibles.
- Seguridad, aislamiento por Company, autorización por cartera y datos sensibles verificados.
- Pruebas unitarias/integración, QA manual por rol, lint/typecheck/build/CI y documentación de API/UX aprobados.
- Gate de release explícito; merge o CI verde por sí solos no significan disponibilidad productiva.

## 11. Riesgos y decisiones abiertas

1. Identificar producto y edición exactos de Dynamics en INSAP; campos y procesos utilizados realmente.
2. Definir propiedad comercial, crédito de ventas compartidas y reasignación de carteras.
3. Acordar fuente oficial por entidad durante coexistencia Dynamics/Zaping.
4. Formalizar los estados de Quotes/Sales aptos para cada KPI y exclusiones por cancelación.
5. Distinguir oportunidades Healthcare, licitaciones y venta tradicional.
6. Resolver privacidad, permisos de información de INSAP y derechos de integración.

## 12. Referencias

- `docs/project/ROADMAP.md` y `docs/project/PROJECT_BOARD.md`: prioridad, tickets y decisiones temporales.
- `docs/modules/erp/CUSTOMERS.md` y `docs/modules/erp/DASHBOARD.md`: dominio maestro y read models.
- `docs/ux/UX-005D-customers-classification-location.md`: referencia existente `CRM-001`.
- `docs/product/PRODUCT_REQUIREMENTS.md`: oportunidades Healthcare y límites de CRM avanzado.
- `AGENTS.md` y `docs/engineering/BRANCH_AND_STABILIZATION_POLICY.md`: congelamiento y restricciones de integración.
- PR #280–#283: estado de la interfaz Clientes al 18-nov-2026.

**Nota:** es una decisión de producto interna para planificación, no un contrato con INSAP ni evidencia de funcionalidad implementada.
