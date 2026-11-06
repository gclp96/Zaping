# Architecture Decision Records — Zaping

**Producto:** Zaping
**Versión del índice:** 2.0.0
**Estado:** En consolidación
**Última actualización:** 2026-09-21
**Responsable:** Zaping Team

---

# 1. Propósito

Este directorio contiene los Architecture Decision Records (ADR) oficiales de Zaping.

Un ADR documenta una decisión arquitectónica relevante incluyendo:

* contexto;
* problema;
* alternativas;
* decisión;
* consecuencias;
* estado;
* y relaciones con otras decisiones.

Los ADR preservan la historia arquitectónica del sistema.

---

# 2. Principio

> Las decisiones arquitectónicas importantes deben ser explícitas, justificadas y trazables.

Un ADR aceptado no debe eliminarse únicamente porque posteriormente cambie la arquitectura.

Cuando una decisión sea reemplazada debe marcarse como:

`SUPERSEDED`

y enlazarse con la decisión que la sustituye.

---

# 3. Cuándo crear un ADR

Debe considerarse un ADR cuando una decisión:

* afecta varios módulos;
* modifica límites de dominio;
* cambia una regla arquitectónica;
* introduce una tecnología significativa;
* afecta seguridad o multi-tenancy;
* modifica el modelo fundamental de datos;
* establece un patrón transversal;
* o es costosa de revertir.

No deben crearse ADR para decisiones triviales.

---

# 4. Estados

## PROPOSED

La decisión se encuentra en análisis.

## ACCEPTED

La decisión fue aprobada y representa la arquitectura vigente.

## REJECTED

La alternativa fue evaluada y descartada.

## SUPERSEDED

La decisión fue válida anteriormente pero fue reemplazada por otro ADR.

## DEPRECATED

La decisión continúa registrada por razones históricas pero ya no debe utilizarse para nuevas implementaciones.

---

# 5. Índice actual

| ADR     | Decisión                                  | Estado documental | Acción de consolidación  |
| ------- | ----------------------------------------- | ----------------- | ------------------------ |
| ADR-001 | Arquitectura Multi-Tenant                 | ACCEPTED          | Actualizar               |
| ADR-002 | Inventory Movements como fuente de verdad | ACCEPTED          | Actualizar               |
| ADR-003 | Estrategia Global de Soft Delete | SUPERSEDED | Reemplazado por ADR-012 |          |
| ADR-004 | UUID como identificador primario          | ACCEPTED          | Actualizar               |
| ADR-005 | Arquitectura por capas                    | CORRUPTO          | Reconstruir              |
| ADR-006 | API First                                 | ACCEPTED          | Actualizar               |
| ADR-007 | RBAC y permisos                           | ACCEPTED          | Actualizar               |
| ADR-008 | Documentation First                       | ACCEPTED          | Actualizar               |
| ADR-009 | Modular Monolith                          | ACCEPTED          | Reconstruir              |
| ADR-010 | Conversión directa Quote → Sale           | SUPERSEDED        | Preservar como histórico |
| ADR-011 | Sales Order y Delivery | ACCEPTED | Arquitectura objetivo |
| ADR-012 | Entity Lifecycle Strategy | ACCEPTED | Implementación parcial |
| ADR-013 | Inventory Custody & Case Logistics | ACCEPTED | Arquitectura objetivo Healthcare |
| ADR-014 | Inventory Locations and Internal Transfers | ACCEPTED | Arquitectura objetivo |
| ADR-HC-LOCK-001 | Healthcare Company-Scoped Transaction Coordination | ACCEPTED | Implementación y producción pendientes |
| ADR-016 | Cloudflare R2 Standard para adjuntos privados | ACCEPTED | QA parcial; producción pendiente |

---

# 6. Decisiones pendientes identificadas

Durante la consolidación documental se identificaron nuevas decisiones arquitectónicas que requieren formalización.

Entre ellas:

## Flujo comercial y fulfillment

La arquitectura objetivo evoluciona desde:

```text
Quote
→ Sale
→ Inventory OUT
```

hacia:

```text
Quote
→ SalesOrder
→ Delivery
→ Inventory OUT
```

Esta decisión deberá formalizarse mediante un nuevo ADR.

---

## Custodia e inventario temporal

Zaping Healthcare requiere distinguir:

```text
salida del almacén
```

de:

```text
salida definitiva de propiedad
```

Una salida temporal hacia un Case representa cambio de ubicación o custodia.

Esta decisión requerirá un ADR específico antes de modificar el modelo de Inventory.

---

## Lifecycle de entidades

La estrategia original de Soft Delete establece eliminación lógica para prácticamente todas las entidades empresariales.

El modelo actual utiliza también patrones como:

```text
isActive
```

y existen entidades históricas que requieren inmutabilidad en lugar de Soft Delete.

Debe formalizarse una estrategia más precisa para:

* desactivación;
* cancelación;
* Soft Delete;
* inmutabilidad;
* y eliminación física.

---

# 7. Reglas de mantenimiento

Cada ADR debe contener como mínimo:

1. Título.
2. Estado.
3. Fecha.
4. Contexto.
5. Problema.
6. Opciones consideradas.
7. Decisión.
8. Consecuencias.
9. Reglas de implementación cuando correspondan.
10. ADR relacionados.

---

# 8. Modificación de ADR aceptados

Los ADR representan historia.

Se permiten correcciones que:

* mejoren redacción;
* corrijan typos;
* actualicen enlaces;
* aclaren una decisión sin cambiar su intención.

Si una modificación cambia materialmente la decisión, debe crearse un nuevo ADR.

---

# 9. Implementación vs decisión

Un ADR puede estar aceptado aunque su implementación todavía no esté completa.

Cuando sea necesario distinguir ambas cosas, el documento podrá indicar:

```text
Estado de decisión: ACCEPTED
Estado de implementación: PARTIAL
```

Esto evita modificar la decisión arquitectónica únicamente porque todavía exista trabajo pendiente.

---

# 10. Fuente de verdad

Los ADR explican:

> por qué se tomó una decisión.

`ARCHITECTURE.md` explica:

> cuál es la arquitectura vigente.

La documentación de módulos explica:

> cómo se aplica la decisión dentro de un dominio.

`PROJECT_BOARD.md` explica:

> qué parte todavía está pendiente de implementación.

Estos documentos no deben sustituirse unos a otros.

---

# 11. Nomenclatura

Los archivos utilizan:

```text
ADR-XXX-descripcion.md
```

Ejemplos:

```text
ADR-001-multi-tenant.md
ADR-002-inventory-movements.md
ADR-003-entity-lifecycle.md
```

Evitar:

* espacios;
* mayúsculas inconsistentes;
* errores tipográficos;
* guiones bajos mezclados con guiones.

---

# 12. Historia

Los ADR existentes de Foundation continúan siendo relevantes como historia arquitectónica, pero están siendo revisados para corregir inconsistencias documentales acumuladas.

Git conserva las versiones anteriores.

La consolidación no debe ocultar decisiones históricas.

---

# 13. Principio final

Una arquitectura sana no depende únicamente de conocer:

> qué hacemos.

También debe poder responder:

> por qué decidimos hacerlo de esa manera.

Ese es el propósito de los ADR.
