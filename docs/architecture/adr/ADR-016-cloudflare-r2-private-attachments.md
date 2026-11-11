# ADR-016 — Cloudflare R2 como almacenamiento privado de adjuntos de Zaping

**Estado de decisión:** ACCEPTED
**Estado de implementación:** PARTIAL — componentes y buckets QA; sin worker integrado ni descarga habilitada
**Fecha:** 2026-10-26
**Responsable:** Zaping Team
**Área:** ERP / Documentos / Archivos de proveedores y futuros adjuntos de otros módulos
**Referencias:** issue #132; PR #140, #145 y #146; ADR-001 (multi-tenancy), ADR-007 (RBAC), ADR-012 (ciclo de vida)

## 1. Contexto

Zaping necesita adjuntar evidencia documental privada (PDF/JPEG) a documentos de proveedores sin almacenar archivos grandes en PostgreSQL, sin romper el aislamiento entre compañías y sin exponer archivos no escaneados. El ticket UX-PDOC-01B ya define metadatos `SupplierDocumentAttachment`, estado `PENDING_SCAN`, una validación preliminar de formato, y un puerto de lectura que permanece deshabilitado hasta conectar almacenamiento y antivirus reales.

El objetivo inicial es minimizar costos de operación para una aplicación SaaS de PyMEs, manteniendo una ruta sostenible a largo plazo y evitando interfaces de almacenamiento propietarias.

## 2. Decisión aprobada

Adoptar **Cloudflare R2, clase de almacenamiento Standard**, como proveedor objetivo de **almacenamiento privado de objetos** de Zaping.

- Backend NestJS accede a R2 por la API **S3-compatible**, mediante SDK oficial AWS para JavaScript `@aws-sdk/client-s3` con `region: "auto"` y endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (o endpoint específico si se elige una jurisdicción compatible).
- PostgreSQL/Prisma conserva exclusivamente metadatos, referencias de Company/Document/User, estado, checksum y auditoría; R2 conserva los bytes.
- Buckets **sin acceso público**: no activar `r2.dev` ni un dominio público y no utilizar una URL pública permanente.
- Separación de **cuarentena** y **objetos liberados**, preferentemente con buckets distintos por ambiente y permisos acotados a cada flujo. En QA se utilizan `zaping-quarantine-qa` y `zaping-private-qa`; producción y demás ambientes conservan una decisión de provisioning pendiente.
- Backend de aplicación recibe subida autenticada, valida límites y documento/tenant, crea la clave aleatoria y deposita el objeto en cuarentena. La verificación completa del contenido y malware ocurre **antes** de marcar `AVAILABLE` y antes de que pueda leerse desde la ruta de descarga.
- Motor de escaneo segregado y con privilegios mínimos lee cuarentena y publica bytes validados en almacenamiento privado, tras verificar checksum/contenido, y transiciona metadata con auditoría. Un error, timeout o falta de escáner deja el objeto en cuarentena o `REJECTED`; nunca autoaprueba.
- Descargas de archivos privados **vía backend NestJS autenticado** en esta etapa: RBAC, scope de Company, vínculo a documento, estado `AVAILABLE`, verificación de tamaño/checksum, auditoría y encabezados seguros. No usar presigned GET desde navegador inicialmente por facilidad de revocación y auditoría.
- No exponer `storageKey`, bucket, Access Key ID, Secret Access Key, URL interna ni claves en respuestas API o frontend.
- Contrato de formatos inicial: PDF/JPEG; límite inicial: 10 MiB/archivo, 10 archivos/documento, cuota total propuesta 100 MiB/documento; la cuota de la API deberá aplicarse de forma atómica en el flujo de subida, no solo en frontend.

## 3. Motivos

- Modelo de costos razonable para etapa temprana y almacenamiento de documentos descargados con frecuencia.
- **Egress** de R2 sin cargo; el uso de almacenamiento y operaciones sí se contabiliza.
- API S3-compatible permite abstraer el proveedor y evaluar otro S3-compatible en el futuro, sin cambiar el dominio ni los metadatos.
- El plan gratuito mensual de **R2 Standard** permite arrancar con poco consumo: **10 GB-mes**, **1 millón de operaciones de clase A** y **10 millones de clase B**. Al 26/oct/2026, excedentes publicados Standard: USD **0.015/GB-mes**, **4.50/millón** A y **0.36/millón** B. Estos valores pueden cambiar y deben verificarse durante el despliegue; no incluyen antivirus, backend u otros servicios.
- **No elegir Infrequent Access** en V1: no cuenta con ese free tier y tiene cargo de recuperación, además de otra estructura de precios. Evaluarlo solo con datos reales de acceso.

Fuente oficial de precios: https://developers.cloudflare.com/r2/pricing/

## 4. Seguridad y multiempresa: invariantes

1. Ninguna credencial R2 se envía a Web ni se inserta en Git, `.env` versionados, logs, pruebas o documentación.
2. Utilizar **tokens de API limitados a buckets específicos** y permisos necesarios, separados por ambiente y por responsabilidad (subida a cuarentena, lectura de objetos liberados, escáner). Rotación y almacenamiento mediante gestor de secretos del despliegue.
3. La clave se genera en backend y se almacena como identificador interno opaco. No se acepta una ruta enviada por usuario ni se construye una URL directamente de sus datos.
4. Verificar `companyId` y `SupplierDocument.id` antes de operar; la clave interna nunca reemplaza la autorización por entidad.
5. Verificar firma/MIME, tamaño, checksum, cuotas, examen antimalware real y política de PDF no confiable. **La validación de firma por sí sola NO equivale a escaneo.**
6. Mantener `PENDING_SCAN` hasta que el worker registre evidencia real de análisis, el objeto de destino exista y su integridad haya sido verificada.
7. El bucket privado y el de cuarentena no deben ser accesibles anónimamente. No activar exposición pública para facilitar pruebas.
8. Errores y secretos no deben aparecer en respuestas al usuario. Registrar eventos de carga, escaneo, descarga, rechazo y eliminación lógica sin exponer datos sensibles.
9. Mantener datos de `SupplierDocumentAttachment` inmutables salvo transiciones auditadas; una operación de descarga no altera inventario, conciliación, costos ni la identidad comercial del documento.
10. La fecha de aceptación del ADR **no autoriza** crear buckets reales, usar credenciales del usuario ni aplicar migraciones a `zaping_dev`/`zaping_qa`.

## 5. Elecciones operativas pendientes

- Definir cuenta Cloudflare propietaria del entorno Zaping y roles administrativos.
- Aprovisionar entornos **dev/qa/prod aislados**; nombre de buckets, tokens limitados, bloqueo público y ciclo de rotación.
- Decidir localización de datos y obligaciones contractuales/privacidad antes de crear el bucket de producción. Los **Location Hints son best effort**, no garantía de residencia legal. Una **jurisdicción** puede exigir un endpoint específico; no asumir residencia México por latencia.
- Revisar políticas de retención y versionado/restauración según capacidades **reales** vigentes de R2; no presuponer compatibilidad íntegra con todas las funciones de S3.
- Seleccionar y desplegar antivirus / inspección de PDF en proceso aislado, con health checks, límites de CPU/memoria/tiempo, reintentos controlados, alertas y procedimiento de rechazo.
- Instalar SDK mantenido + lockfile actualizado bajo revisión de dependencias, e implementar `PrivateAttachmentObjectStore` específico de R2 detrás de su contrato existente.
- Probar storage con objetos reales de prueba, fallos, concurrencia, quotas, checksum, RBAC, aislamiento multiempresa, revocación y recuperación de incidentes.

## 6. Alternativas consideradas

- **Amazon S3:** servicio robusto y ampliamente integrado, pero el equipo prioriza menores costos de salida y simplicidad económica inicial para este flujo.
- **Guardar PDF/JPEG directamente en PostgreSQL:** descartado por mezclar binarios con base transaccional y aumentar presión sobre backup/restore.
- **Cloudflare R2 Infrequent Access:** descartado por free tier inaplicable y costos por recuperación en V1.
- **Presigned URLs directas al navegador como opción por defecto:** diferidas; son tokens bearer temporales útiles, pero para documentos confidenciales la descarga vía backend facilita revocación, validación y auditoría centralizadas.

## 7. Impactos y compatibilidad

- **Database:** usar `SupplierDocumentAttachment` como fuente de metadatos; no reemplazar `PurchaseReceiptSupplierDocumentLink` ni `PurchaseReceiptDocument`.
- **Backend:** adaptador R2 S3-compatible, proceso de cuarentena/escáner, descarga autenticada y eventos de auditoría.
- **Frontend:** carga y descarga mediante API autenticada sin credenciales ni presigned GET; estados visibles `PENDING_SCAN`, `AVAILABLE`, `REJECTED`.
- **Seguridad:** separación de permisos/tokens/buckets y bloqueo público; contratos multiempresa existentes permanecen obligatorios.
- **Migración:** no migrar archivos previos ni ejecutar migraciones nuevas hasta QA y revisión. Los contratos históricos de PR #145 y #146 deben reconciliarse con `main` antes de su integración.

## 8. Estado y gates

**CURRENT (05/11/2026):** la fundación de metadatos está integrada en `main`, existen buckets R2 QA con pruebas de lectura, y los prototipos de escáner, firma y promoción permanecen en PR apilados. No existe flujo operativo de escaneo y promoción integrado en el backend, no hay descarga habilitada. QA de recuperación privada 03D3B todavía no está aprobado; el objeto privado esperado devolvió 404. No trasladar resultados de laboratorio a autorización de producción.

**TARGET:** Subida autenticada a cuarentena R2 → validación/escáner obligatorio → objeto privado liberado → marca `AVAILABLE` → descarga autorizada desde NestJS.

**GATES ANTES DE RELEASE:** CI, revisión de dependencias, pruebas E2E con R2 real en entorno aislado, auditoría de roles y tenants, pruebas de antivirus/cuotas, QA de navegador, runbook operacional y aprobación de costos/privacidad.

## 9. Fuentes técnicas

- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/r2/get-started/s3/
- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/api/tokens/
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- https://developers.cloudflare.com/r2/buckets/public-buckets/
- https://developers.cloudflare.com/r2/reference/data-location/

**Principio final:** R2 almacena objetos privados; Zaping mantiene autoridad sobre identidad, acceso, escaneo e historial.

## 10. Enmienda propuesta ZFILES-ADR-01 (11/11/2026)

**Estado:** propuesta documentada sobre `qa/integration`; requiere revisión de seguridad, QA y commit.
**Motivo:** conciliar el ADR-016 original (subida recibida por NestJS) con la carga directa a cuarentena por URL PUT firmada prevista en ZFILES-R2-01.
**Regla de precedencia tras su aprobación:** esta sección modifica **el transporte de subida, la extensión de propietarios y la exposición mínima inevitable de una URL PUT** de las secciones 2, 4, 6 y 7. Permanecen vigentes todas las exigencias de bucket privado, antivirus, autorización, auditoría y descarga autenticada del ADR original. No activa endpoints ni elimina los bloqueos SQL actuales.

### 10.1 Propietarios y compatibilidad

- `SUPPLIER_DOCUMENT` identifica un archivo comercial vinculado por `companyId` y `documentId`. La persistencia actual `SupplierDocumentAttachment` y sus restricciones siguen intactas.
- `PURCHASE_RECEIPT` identifica evidencia propia de la recepción mediante `companyId` y `receiptId` (por ejemplo, fotografía de mercancía o acuse). No se deduce pertenencia a partir de folios ni de vínculos con un documento comercial.
- `PurchaseReceiptSupplierDocumentLink` continúa relacionando documentos comerciales existentes con recepciones. `PurchaseReceiptDocument` continúa representando conciliación monetaria; ninguno se sustituye ni modifica por esta enmienda.
- Se reutilizará el contrato tipado `ZfilesAttachmentOwner` y la generación de claves opacas del incremento ZFILES-OWN-01. Su validación sintáctica de UUID no autoriza una operación: siempre es necesaria la comprobación real de empresa, entidad, estado y rol en PostgreSQL.
- **Persistencia aún por decidir** en ZFILES-DB-01: esquema específico para adjuntos propios de recepción o generalización auditada del almacenamiento de metadatos. En cualquiera de los dos casos, exigir relaciones/FK compuestas por Company y propiedad inequívoca a nivel SQL, y conservar la migración existente sin reescribirla.

### 10.2 Transporte de subida: decisión condicionada a QA

1. El usuario autenticado solicita una **reserva de carga** a NestJS. El backend verifica JWT/RBAC, `companyId`, propietario activo, límites de PDF/JPEG y cuota transaccional. No se acepta una key, bucket, ruta ni URL enviados por el cliente.
2. La aplicación reserva una identidad de adjunto y una key única de cuarentena, genera un `writeId`/identificador de intento y emite **una URL PUT firmada de duración breve**, exclusivamente para esa key y `zaping-quarantine-qa` en el ambiente QA. La expiración inicial se definirá mediante ensayos de conectividad de archivos de hasta 10 MiB; no reutilizarla como autorización de negocio.
3. La firma debe vincular los encabezados críticos que sean compatibles, al menos `Content-Type`, `If-None-Match: *` y el identificador de intento. Confirmar en QA que `X-Amz-SignedHeaders` y R2 **rechazan solicitudes que omitan o cambien los encabezados**, y que el segundo PUT no sobrescriba el primero. No fiarse de colocar encabezados sin firmarlos. Probar la restricción efectiva de tamaño de extremo a extremo; una URL firmada con carga no acotada **no se habilita** en producción. Si el SDK/R2 no permite aplicar los controles requeridos, usar temporalmente carga autenticada por backend hasta resolverlos.
4. Configurar CORS **solo** en cuarentena, con orígenes concretos autorizados, método PUT y encabezados necesarios. CORS no sustituye autenticación ni impide el abuso de una URL filtrada. Mantener deshabilitados `r2.dev` y dominios públicos; no hay presigned GET.
5. **Excepción explícita al punto 2 del ADR original:** para efectuar PUT directo, el navegador recibe transitoriamente la URL firmada, que incluye host del endpoint R2, bucket de cuarentena y key objetivo. Esa exposición temporal no constituye permiso para otros objetos ni autoriza revelar `storageKey`/bucket en endpoints de listados, logs o metadatos generales. Revisar que los componentes de key no filtren datos sensibles antes de habilitar cargas. Tratar la URL como credencial bearer temporal. Nunca registrarla completa en logs, analítica, traces, auditoría visible ni mensajes de error. No entregar credenciales R2 permanentes, claves del bucket privado ni ubicación interna de este último a Web.
6. Tras el PUT, el navegador solicita **confirmación** por la API. NestJS recupera y coteja el objeto por la identidad reservada: existencia, intento, tamaño, SHA-256 sobre bytes reales, firma/magic bytes PDF/JPEG, MIME y cuota. `ETag`, `HEAD` aislado y MIME enviado por el navegador **no prueban integridad ni ausencia de malware**.
7. Un timeout, caída de conexión o PUT de resultado ambiguo no libera cuota ni autoriza reintentar con la misma key. Conservar estado de reconciliación hasta demostrar el resultado; `HEAD 404` momentáneo no es prueba suficiente de ausencia tras escritura en vuelo. Reintentos usan una nueva reserva solo cuando la anterior quede reconciliada conforme a política segura.

### 10.3 Estados, escaneo y promoción

- Separar el estado de **reserva/transporte** del estado de **seguridad/publicación**. El objeto cargado o confirmado permanece en cuarentena y en estado no descargable (`PENDING_SCAN` o equivalente).
- Un proceso aislado lee los bytes originales desde cuarentena y comprueba tamaño/SHA-256 antes de analizarlos con **ClamAV real**, con política explícita de disponibilidad, versión y actualización de firmas. Un resultado de laboratorio `CLAMD_OK_UNATTESTED` no autoriza `AVAILABLE`.
- Aceptar promoción únicamente tras evidencia verificable asociada a Company/propietario/adjunto/bytes/nonce; separación de identidades SQL y de tokens R2; rechazo de replay. Comparar íntegramente bytes origen/destino, garantizar destino no sobrescribible y registrar transiciones de estado/auditoría con privilegios mínimos.
- PostgreSQL y R2 **no comparten una transacción atómica**: fallos entre copia y commit pueden dejar objetos huérfanos privados pero no liberados. Reconciliar mediante eventos/idempotencia, sin publicar por inferencia ni borrar automáticamente objetos de estado incierto.
- El trigger actual que impide UPDATE/DELETE sobre `SupplierDocumentAttachment` permanece cerrado hasta una migración separada y auditada. Esta enmienda no autoriza transiciones directas a `AVAILABLE`, `REJECTED` o `REMOVED`.

### 10.4 Descarga, eliminación y UX

- La **descarga permanece vía NestJS autenticado** en V1: validar rol, Company, propietario y asociación, que el archivo siga `AVAILABLE`, auditar acceso y emitir `Content-Disposition`/tipo/seguridad apropiados. No ofrecer URL GET firmada al navegador.
- La eliminación es **lógica y auditada**; no se equipara a borrado físico inmediato en R2. Establecer retención y purga posterior con reconciliación y autorización expresa. La revocación de acceso en API debe ser efectiva aunque subsistan objetos.
- La UI actual `ReceiptFilesPreview` continúa siendo local y sin persistencia. No cambiar `NEXT_PUBLIC_ZAPING_FILES_RECEIPTS_UI` ni mostrar botón de descarga o progreso real hasta integrar API, escaneo y gates.

### 10.5 Criterios de aceptación para ejecutar esta decisión

- Prueba real QA de firma: operación/key exactos, expiración, replay, `Content-Type`, `If-None-Match` y encabezados obligatorios alterados/omitidos; CORS con origen autorizado y no autorizado.
- Rechazo de tamaños mayores a 10 MiB **antes de permitir uso productivo**; ante incertidumbre en el PUT firmado, fallback a upload proxy validado o a otro mecanismo que imponga el límite efectivo.
- Reserva y cuota concurrentes, tenencia/RBAC, propietario ajeno, cancelación segura antes de escritura y recuperación de intentos ambiguos validados sobre PostgreSQL efímero.
- ClamAV QA real con firmas vigentes, EICAR sintético controlado, daemon caído, timeout y resultado ambiguo, siempre fail-closed.
- Verificación de integridad cuarentena/privado, no sobrescritura, reintentos, anti-replay, inmutabilidad SQL, auditoría, huérfanos y revocación de descarga.
- Tests unitarios, integración, E2E con servicios aislados, revisión de dependencias, TypeScript/ESLint/build, CI y QA de navegador. **No afirmar PASS sin evidencia.**
- Ningún bucket o credencial productiva, ninguna escritura sobre `zaping_dev`/`zaping_qa`, ningún deploy ni activación de flags se autoriza por aprobar este documento.

**Referencias técnicas de la enmienda:**
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- https://developers.cloudflare.com/r2/api/s3/conditional-operations/
- https://developers.cloudflare.com/r2/buckets/cors/
- https://developers.cloudflare.com/r2/api/s3/extensions/
