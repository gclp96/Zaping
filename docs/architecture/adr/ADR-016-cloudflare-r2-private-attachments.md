# ADR-016 — Cloudflare R2 como almacenamiento privado de adjuntos de Zaping

**Estado de decisión:** ACCEPTED
**Estado de implementación:** PENDIENTE (sin bucket, credenciales ni escáner operativo configurados)
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
- Separación de **cuarentena** y **objetos liberados**, preferentemente con buckets distintos por ambiente y permisos acotados a cada flujo. Los nombres finales se definirán durante provisioning; nombres propuestos: `zaping-attachments-quarantine-{env}` y `zaping-attachments-private-{env}`, con `env` = `dev`/`qa`/`prod`.
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
- **Migración:** no migrar archivos previos ni ejecutar migraciones nuevas hasta QA y revisión. PR #145 y #146 continúan en borrador.

## 8. Estado y gates

**CURRENT:** Metadata/cuarentena y contrato de lectura en PR #145/#146. El adaptador de descarga registrado falla explícitamente (503); no existe almacenamiento R2 ni escáner operativo dentro del backend desplegado.

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
