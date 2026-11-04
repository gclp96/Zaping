# ADR-SMART-STATION-001 — Captura física desacoplada de la autoridad de inventario

**Fecha:** 2026-11-03  
**Estado:** PROPOSED — para revisión y aprobación  
**Contexto:** Estación inteligente para recepciones, preparación/dispatch de kits quirúrgicos, devoluciones/reconciliación y apoyo a remisiones de INSAP.  
**Documento de diseño:** [Smart Station Architecture](../SMART_STATION_ARCHITECTURE.md).

## Decisión propuesta

Extender Zaping mediante una **capa de captura desacoplada de hardware** con sesiones y propuestas revisables, integrándola a los comandos de negocio existentes en el monolito modular NestJS. El adaptador detecta y observa; Receipts, CaseKit, Dispatch, Custody, Return/Reconciliation y los futuros dominios comerciales siguen siendo autoridades exclusivas de confirmación y persistencia. Empezar con lector 2D individual y POC de multilectura; evaluar reconocimiento visual y RFID solo con datos reales.

## Razones

- Reutiliza reglas transaccionales, tenant isolation, RBAC, idempotencia y trazabilidad del Core y Healthcare.
- Cambia hardware sin cambiar contratos de negocio.
- Acepta falsos negativos/ambigüedades con revisión humana, sin crear entradas/salidas accidentales.
- Evita duplicar inventario y estados de dispatch, custodia y consumo.
- Permite productizar para más clientes/sucursales, sin ligar los derechos del producto al piloto.

## Alternativas

1. **Lógica de inventario dentro del software de cámara:** rechazada, divide autoridad y aumenta riesgo de doble movimiento.
2. **Microservicios de IA, inventario y hardware desde el inicio:** diferida por complejidad; usar proceso separado de visión solo si las cargas reales lo justifican.
3. **RFID universal desde día uno:** diferida porque requiere validar tagging, empaques y costo.
4. **Lectura manual como único canal permanente:** se conserva como fallback, no como límite de producto.

## Consecuencias

Se necesitan contratos de observaciones, revisión, sesiones e identidad de estación; UX de validación; métricas de precisión; controles de privacidad y QA. La detección por imagen es evidencia y no verdad del dominio. El trabajo se gestiona como discovery; **no implica migraciones, APIs ni rollout aprobados**.

## Criterios de aprobación futura

Demo repetible con datos reales, conteo de duplicados, pruebas de lote/caducidad, revisión de incidentes, cero confirmaciones silenciosas erróneas durante los escenarios aceptados, integración de permisos y regresión de Purchases/Dispatch/Return. Aprobar el diseño detallado y el alcance comercial antes de construir.
