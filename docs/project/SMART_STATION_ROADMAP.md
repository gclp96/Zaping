# Smart Station — ruta propuesta y dependencias

**Fecha:** 2026-11-03  
**Estado:** DISCOVERY / PROPOSED (no sprint comprometido)  
**Piloto:** INSAP Hermosillo (candidato); expansión eventual a otras sucursales y clientes.  
**Origen:** propuesta comercial de estación de lectura simultánea y logística quirúrgica.  
**Arquitectura:** [Smart Station Architecture](../architecture/SMART_STATION_ARCHITECTURE.md) y [ADR-001](../architecture/adr/ADR-SMART-STATION-001.md).

| Orden | Iniciativa | Entrega / gate | Dependencia / cautela |
|---|---|---|---|
| SS-00 | Discovery operativo y muestras | Mapa de casos, catálogo de 20–30 referencias, códigos/packaging, política de kits, flujo de remisiones y matriz de excepciones | Participación de almacén y técnicos; aclarar lotes, sellos, seriales, retornos |
| SS-01 | POC de captura **sin mutación de inventario** | Lectura 2D individual y prueba multilectura de hasta 10 artículos incluidos duplicados, métricas, videos/fotos controlados | Hardware prestado/económico; verdad terreno y validación manual |
| SS-02 | Contrato Smart Station | Sesión, observación, propuesta, adaptador de dispositivo, RBAC, tenant y auditoría; diseño aprobado | Resultado SS-01, revisión de arquitectura y equipos de dominio |
| SS-03 | Integración Purchase Receipts | Captura asistida → revisión → confirmar por comando actual de receipt | Regresión transaccional, idempotencia, stock/lote y permisos |
| SS-04 | Preparación/Despacho Healthcare | Captura de kit/maletín → validación → preparación/confirmación y custodia existentes | CaseKit, Equipment, Dispatch ya implementados; QA real antes de usar |
| SS-05 | Return/Reconciliation Healthcare | Captura de sobrantes → diferencias → USED/RETURNED/UNRESOLVED con revisión | Contratos Return/Reconciliation, equipos y control de doble OUT |
| SS-06 | Remisión asistida | Borrador derivado del consumo revisado → técnico confirma → envío/aprobación externa | Discovery de remisiones, responsabilidades, rechazo/ajuste y facturación futura |
| SS-07 | Producto industrial / multi-sucursal | Paquete de hardware comercial, soporte, instalación, monitoreo y versiones | Precisión probada, TCO real, contratos de PI/servicio y aprobación comercial |

**Estrategia temporal:** diciembre 2026 es únicamente una **hipótesis de piloto digital** de alcance controlado, condicionado a pruebas y readiness; no implica promesa de estación con lectura automática total. La selección tecnológica y el presupuesto requieren resultados de SS-00/SS-01 y cotizaciones. La propiedad intelectual se definirá en contrato de Zaping con INSAP; no conceder exclusividad o cesión implícita.

**Fuera de alcance inicial:** entrenamiento de un modelo generalista de reconocimiento de empaques, tagging RFID masivo, lectura de elementos ocultos, automatización sin revisión humana, autorización de aseguradoras y facturación automática.

**Prioridad:** no interrumpir cierre de M-HC1, real company cutover, QA ni pendientes de Receipts/Zaping Files. Ordenar implementación por riesgos y dependencias; no modificar las fechas del Roadmap canónico hasta estimar capacidad y presupuesto.
