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
- No mostrar el campo técnico **País (código ISO)** en el formulario de Clientes. La búsqueda postal mexicana utiliza `MX` internamente al capturar explícitamente un CP; en otras ediciones de clientes históricos se conserva su `countryCode` previo, incluso si es nulo.
- La futura facturación CFDI requerirá sus propias validaciones fiscales (RFC, régimen fiscal, código postal fiscal, uso de CFDI, etc.). No convertir `legalName` en obligatorio para registrar clientes ni confundir automáticamente domicilio comercial con domicilio fiscal.
- Ampliar ubicación opcional con `postalCode`, `neighborhood` (colonia/asentamiento) y `municipality` además de `city`, `state`, `countryCode` y `address`. Migración exclusivamente aditiva, sin backfill inferido y sin sobrescribir el domicilio histórico.
- Para México, al capturar un CP válido de cinco dígitos consultar una fuente autorizada de datos postales y presentar las colonias/asentamientos y su municipio/localidad/estado; permitir elegir la combinación correcta si hay ambigüedad. Después permitir agregar calle y números en `address`.
- La selección postal debe ser asistida, no una condición para crear el cliente. Si no hay resultados, hay fallo de red o el domicilio no es mexicano, permitir captura manual con validaciones proporcionadas. No copiar ubicación de un código postal distinto sin confirmación del usuario; evitar que respuestas tardías reemplacen datos actuales.
- La integración postal deberá verificar licencias aptas para un SaaS comercial y tener pruebas deterministas con datos simulados; no acoplar el alta de clientes a la disponibilidad de un servicio externo.
- Asegurar escritura, lectura y actualización de todos los campos nuevos, y compatibilidad con flujos de creación de clientes desde Cotizaciones y otros módulos. Los permisos existentes no se modifican; CRM-001 permanece fuera del alcance.
- **Esta ampliación está aprobada como especificación y requiere implementación y CI adicional; no se considera completada por actualizar este documento.**

## Integración postal implementada — configuración pendiente
- La ruta autenticada `GET /customers/postal-lookup/:code` valida cinco dígitos y mantiene JWT/RBAC actual. Su único destino remoto es `https://api.postalkit.mx/v1/postal-codes/{code}`.
- Configurar `POSTALKIT_API_KEY` **únicamente** en el entorno del backend NestJS. No agregarla a variables `NEXT_PUBLIC_*`, commits, archivos de pruebas ni respuestas de API.
- QA local: agregar `POSTALKIT_API_KEY=<token real>` **solo** en `.qa/api.env` y recrear únicamente el servicio `api` con `docker compose -f docker-compose.qa.yml up -d --no-deps --force-recreate api`. No compartir el token en capturas ni mensajes.
- Diagnóstico seguro: `docker compose -f docker-compose.qa.yml exec -T api node -p "Boolean(process.env.POSTALKIT_API_KEY)"` devuelve `true` si la variable está presente. No verifica si el token es válido; una respuesta falsa identifica la falta de configuración.
- El frontend distingue «Autocompletado postal no configurado» de otros fallos de consulta y no exige capturar `countryCode` al usuario. La captura manual continúa disponible.
- El proveedor solo se consulta desde el backend. Se normalizan estado, municipio, ciudad y nombres de asentamientos para mostrar un selector de colonia; el usuario siempre puede editar el domicilio manualmente.
- Sin clave configurada, datos ausentes o caída de red, la consulta devuelve un error controlado y el formulario permite continuar manualmente. La alta no depende de la disponibilidad postal.
- Antes de activar para clientes comerciales, verificar los términos de servicio de PostalKit y los derechos aplicables al catálogo subyacente; la existencia de un plan pago no sustituye la revisión de licencia.
- Pendiente: prueba con credencial real en un entorno controlado, evidencia QA de CP múltiple, manual y fallo de proveedor, y revisión de CI. No considerar el autocompletado productivo hasta cerrar estos puntos.

## Ampliación QA — catálogos geográficos mexicanos
- El formulario ofrece selector de **Estado** con las 32 entidades federativas de PostalKit, incluyendo Ciudad de México.
- Al seleccionar estado, Zaping consulta **Municipios por estado** y **Ciudades por estado**, presenta sugerencias filtradas y permite escribir manualmente si falta una localidad o la API no responde. No se asume que todas las ciudades de un estado pertenezcan al municipio seleccionado: PostalKit publica su lista de ciudades por estado, no por municipio.
- Los nuevos endpoints son `GET /customers/geography/states`, `GET /customers/geography/states/:id/municipalities` y `GET /customers/geography/states/:id/cities`. Son autenticados con el mismo JWT/RBAC de Clientes; la clave de PostalKit permanece privada en NestJS.
- El backend valida el ID numérico del estado y cachea catálogos por una hora para reducir consumo. No incorpora valores parciales o hardcodeados al repositorio.
- Si el usuario cambia de estado de manera explícita, se limpian municipio, ciudad, CP y colonia previamente seleccionados para impedir una combinación inconsistente. Si el formulario se abre para un cliente histórico, sus valores se conservan.
- El lookup de CP permanece prioritario: cuando devuelve datos completos, rellena estado, municipio y ciudad, y permite escoger colonia. **Dirección (calle y números) siempre es de captura manual.**
- Todos los datos geográficos son opcionales. No se cambia el schema Prisma ni se añade migración en esta ampliación.
- Cierre de QA: comprobar el catálogo completo de estados, relación del municipio con el estado, sugerencias de ciudades por estado, cambio de estado y limpieza de campos dependientes, CP válido, fallback manual y persistencia.

## Refinamiento visual — buscadores de municipio, ciudad y colonia
- Sustituir `<datalist>` de Municipio y Ciudad por el componente reutilizable `CustomerLocationCombobox`: búsqueda de texto que ignora acentos, navegación con teclado y lista blanca integrada al modal (máximo 176 px de alto y scroll interno), sin menú nativo fuera de pantalla.
- Aplicar el mismo componente a Colonia / asentamiento. Cuando hay código postal, utilizar exclusivamente las colonias del CP consultado; cuando no hay CP y se selecciona Estado → Municipio, consultar las colonias mediante el endpoint protegido `GET /customers/geography/states/:stateId/municipalities/:municipalityId/settlements?page=N`.
- Esta ruta respeta la jerarquía del proveedor, limita el número de página, conserva los IDs de colonias y su CP, cachea por página y devuelve `{ items, hasMore }` sin credenciales. PostalKit pagina 20 colonias por llamada; **no descargar automáticamente todas las páginas**.
- La lista muestra `Nombre · CP 12345` y `Ver más colonias` cuando corresponde. Al seleccionar colonia, llenar su nombre y CP conservando la distinción de colonias homónimas con diferentes CP. Captura manual disponible para localidades no catalogadas o indisponibilidad del proveedor.
- El campo Dirección continúa siendo libre. No convertir valores fiscales, código postal comercial o razón social en campos obligatorios.
- QA requerido: verificar visualmente que el menú no sobresalga del modal y que municipio/colonia puedan escogerse con mouse o teclado; consultar páginas adicionales, desambiguar homónimos, cambiar estado y cancelar consultas anteriores, validar la búsqueda inversa por CP, editar clientes históricos, y persistencia.

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
