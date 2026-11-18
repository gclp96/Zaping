# UX-005D — Clientes: clasificación y ubicación
Estado: Implementación en revisión; ampliación funcional aprobada el 18 de noviembre de 2026

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

## Ampliación aprobada — alta, identidad comercial y domicilio (18/11/2026)
- Únicamente **Nombre** (`Customer.name`) y **Tipo** son obligatorios en el alta. Correo electrónico, teléfono, contacto, razón social y domicilio son opcionales; validar formato de correo solo cuando se proporcione.
- **Nombre comercial / nombre de cliente** y **Razón social** son datos diferentes. Conservar `Customer.name` como identificador comercial para listados, búsqueda, relaciones y documentos operativos. Añadir `Customer.legalName String?` (nombre o denominación fiscal) como columna independiente, sin copiar ni inferir valores históricos, sin usar `name` como razón social al emitir documentos fiscales.
- En el formulario, mostrar **Nombre del cliente** como campo obligatorio y **Razón social (opcional, dato fiscal)** como campo separado. Nunca unir automáticamente ambos campos; una coincidencia literal solo procede si el usuario captura ambos igual.
- La futura facturación CFDI requerirá sus propias validaciones fiscales (RFC, régimen fiscal, código postal fiscal, uso de CFDI, etc.). No convertir `legalName` en obligatorio para registrar clientes ni confundir automáticamente domicilio comercial con domicilio fiscal.
- Ampliar ubicación opcional con `postalCode`, `neighborhood` (colonia/asentamiento) y `municipality` además de `city`, `state`, `countryCode` y `address`. Migración exclusivamente aditiva, sin backfill inferido y sin sobrescribir el domicilio histórico.
- Para México, al capturar un CP válido de cinco dígitos consultar una fuente autorizada de datos postales y presentar las colonias/asentamientos y su municipio/localidad/estado; permitir elegir la combinación correcta si hay ambigüedad. Después permitir agregar calle y números en `address`.
- La selección postal debe ser asistida, no una condición para crear el cliente. Si no hay resultados, hay fallo de red o el domicilio no es mexicano, permitir captura manual con validaciones proporcionadas. No copiar ubicación de un código postal distinto sin confirmación del usuario; evitar que respuestas tardías reemplacen datos actuales.
- La integración postal deberá verificar licencias aptas para un SaaS comercial y tener pruebas deterministas con datos simulados; no acoplar el alta de clientes a la disponibilidad de un servicio externo.
- Asegurar escritura, lectura y actualización de todos los campos nuevos, y compatibilidad con flujos de creación de clientes desde Cotizaciones y otros módulos. Los permisos existentes no se modifican; CRM-001 permanece fuera del alcance.
- **Esta ampliación está aprobada como especificación y requiere implementación y CI adicional; no se considera completada por actualizar este documento.**

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
7. Nuevas altas son válidas con solo Nombre y Tipo; editar un cliente sin correo o teléfono no bloquea el guardado. Si se captura correo, se valida su formato.
8. Razón social opcional persiste por separado y nunca modifica Nombre. Registros históricos conservan razón social vacía hasta captura explícita.
9. CP mexicano válido ofrece colonias y completa la ubicación elegida; entrada ambigua, inexistente, servicio indisponible y captura manual están cubiertos por pruebas.
10. Guardar, reabrir y actualizar conserva dirección completa, CP, colonia, municipio, ciudad y estado; los campos estructurados históricos permanecen nulos si no se editaron.
11. CI Web/API/Agents/Historical Upgrade PASS, QA funcional y visual antes de fusionar.
