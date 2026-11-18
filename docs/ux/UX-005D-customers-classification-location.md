# UX-005D — Clientes: clasificación y ubicación
Estado: Implementación propuesta (18 de noviembre de 2026)

## Objetivo
Limpiar el catálogo de Clientes y ofrecer exactamente tres filtros visibles: nombre, tipo y ubicación. Mantener intactos el aislamiento por empresa y los flujos comerciales existentes.

## Decisiones de producto
- Tipos disponibles para nuevas altas y reclasificaciones: HOSPITAL, CLINIC, DOCTOR, INDIVIDUAL, BUSINESS, PUBLIC_INSTITUTION y OTHER. Etiquetas: Hospital, Clínica, Médico / Consultorio, Particular, Empresa / Distribuidor, Institución pública y Otro.
- «Licitación» es un canal/proceso comercial, **no** un tipo de cliente; no se asigna automáticamente a «Institución pública».
- Conservamos el campo histórico Customer.type (String nullable), sin reemplazar valores antiguos ni inferir su categoría. Los tipos desconocidos o ausentes se muestran «Por clasificar» hasta que un usuario los seleccione explícitamente al editar.
- Los nuevos valores se validan en la API contra el catálogo. La edición del resto de campos no debe reescribir el tipo silenciosamente.
- La ubicación se compone de city, state y countryCode opcionales; address conserva el domicilio completo. No se interpreta un address libre para generar campos estructurados.
- Los clientes previos mantienen ubicación sin clasificar hasta su edición. No se asignan país/ciudad/estado por suposición.
- Filtro Ubicación: destinos presentes en el catálogo activo, con opción «Sin ubicación». El filtro de nombre ignora tildes y mayúsculas.
- El listado muestra Nombre, Tipo, Ubicación y Acciones. Correo, teléfono y dirección permanecen en ficha y formulario. 
- Sin implementación de responsable, visibilidad por usuario ni política de cartera en esta entrega. CRM-001 hará cumplir esos controles de seguridad transversalmente en Clientes, Cotizaciones y Ventas.

## Seguridad y compatibilidad
- Mantener JWT/RBAC ADMIN, MANAGER, SALES actuales. Sin permisos nuevos.
- Escrituras y lecturas siguen aisladas por Company. Nada de filtros exclusivos en frontend para autorización.
- Migración aditiva nullable y reversible a nivel de aplicación; no se toca Customer.type histórico ni se inventan ubicaciones.
- Esquema local y migración deben aplicarse juntos antes de iniciar API con nuevo Prisma Client.

## Acceptance Criteria
1. El buscador por nombre, el filtro por tipo y ubicación son combinables y pueden limpiarse.
2. Tipo en altas/edición es un select con las siete opciones; API rechaza tipos nuevos fuera de catálogo, sin borrar registros históricos.
3. Se puede filtrar por ciudad/estado guardados y por «Sin ubicación»; no se infiere desde address.
4. Las filas muestran tipo legible o «Por clasificar», ubicación o «Sin ubicación», y el enlace a la ficha existente.
5. Editar puede completar ubicación sin perder domicilio; el catálogo muestra los cambios tras guardar.
6. Tests de frontend (filtros, formulario, responsive/empty) y backend (validación, tenant, campos). Migración sin backfill destructivo.
7. CI Web/API/Agents/Historical Upgrade PASS y QA visual antes de fusionar.
