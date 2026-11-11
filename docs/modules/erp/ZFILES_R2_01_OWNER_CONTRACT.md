# ZFILES-R2-01 — Contrato inicial de propietarios de adjuntos

**Estado:** propuesta de cambio local, SIN integración ni aprobación para producción.
**Base auditada:** `qa/integration` en commit `c6ffc331c5e776e04f78e68aa2025aa362a8fa92` (11/11/2026).
**Tipo:** incremento aditivo y aislado; no cambia rutas HTTP, Prisma ni credenciales.

## Hallazgo de la auditoría

- `SupplierDocumentAttachment` pertenece a `SupplierDocument` y conserva sus
  restricciones actuales y el bloqueo de mutación.
- `PurchaseReceiptSupplierDocumentLink` permite que una recepción consulte
  documentos comerciales vinculados; no convierte ese adjunto en evidencia
  perteneciente directamente a la recepción.
- `ReceiptFilesPreview` es exclusivamente una selección local: no sube,
  persiste, analiza ni descarga archivos.
- Los clientes S3 de R2 y el scanner INSTREAM actuales están limitados a QA/lab.

## Contrato del primer incremento

Se introduce un tipo discriminado, sin persistencia, con dos propietarios:

- `SUPPLIER_DOCUMENT`: `companyId` + `documentId`.
- `PURCHASE_RECEIPT`: `companyId` + `receiptId`.

`createZfilesQuarantineKey` acepta exclusivamente esos dos tipos y UUID
canónicos. Genera una clave interna con el mismo patrón que QA:
`quarantine/<companyId>/<ownerId>/<attachmentId>`. El `attachmentId` se crea
con `randomUUID()` si no se especifica. No acepta rutas del navegador.

El tipo de propietario se conservará como dato relacional autoritativo.
Ninguna clave R2 equivale a permiso de acceso; NestJS debe validar contra
PostgreSQL la existencia, compañía, estado y permisos de la entidad objetivo.

## Decisiones pendientes antes de persistencia o HTTP

1. Aprobar esquema relacional para adjuntos propios de recepciones sin
   cambiar la semántica de `SupplierDocumentAttachment`.
2. Resolver inconsistencia entre ADR-016 (upload/download vía backend) y
   el checkpoint ZFILES-R2-01 (PUT firmado). Por defecto, respetar ADR-016
   hasta que exista una enmienda aprobada; nunca publicar GET firmado
   directo a contenido no liberado.
3. Definir mecanismo operativo real de ClamAV, promoción a privado,
   identidad SQL de mínima autoridad, auditoría e idempotencia.
4. Reconciliar código experimental de PR cerrados sin fusionar antes de
   crear nuevos caminos paralelos.

## Criterios verificables de este parche

- Aditivo: crea únicamente un helper TypeScript, su test y este contrato.
- Sin migraciones, API, nuevos permisos, endpoints, configuración R2 ni
  modificaciones de Docker.
- Los tests focalizados verifican dos propietarios válidos y rechazos de
  tipo desconocido, rutas malformadas e IDs inválidos.
- `npm test -- --runInBand zfiles-attachment-owner.spec.ts` y
  `npm run typecheck` deben ejecutarse localmente tras revisión/aplicación.
- No afirmar PASS de CI ni producción sin evidencia del repositorio.

## Siguiente paso

Integrar esta identidad de propietario en el contrato de datos,
manteniendo intactos los documentos comerciales y los vínculos existentes.
No habilitar subida/descarga hasta cerrar los gates de seguridad.
