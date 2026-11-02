# ZFILES-R2-01 — Fundación privada de adjuntos documentales

**Fecha:** 2026-11-02  
**Estado:** PR Draft en revisión; **NO es un sistema operativo de carga/descarga**.  
**Ticket:** #197. **Fuente histórica:** PR #145, reconciliado selectivamente contra `main` (base `d646025b71f393b57524301cbc3d2af36f57cd6b`).

## Contrato de dominio

- Una evidencia comercial PDF/JPEG se asociará a un **SupplierDocument** mediante `documentId` y `companyId`. Las recepciones acceden al documento mediante `PurchaseReceiptSupplierDocumentLink`, ya integrado en `main`; no se vuelve a crear la relación ni se infiere por folio.
- `PurchaseReceiptDocument` sigue siendo conciliación monetaria independiente. Las fotografías de daños/embalajes específicas de cada `PurchaseReceipt` requerirán un propietario de adjunto adicional en un incremento posterior.
- Los bytes residirán en almacenamiento privado (Cloudflare R2 en fases posteriores), **nunca en PostgreSQL**. `storageKey` es un identificador interno opaco, no URL pública y no procede de clientes; no existe todavía una ruta que lo emita ni lo acepte.
- Metadatos: `companyId`, `documentId`, `uploadedById`, clave privada, nombre, MIME previsto, tamaño, SHA-256, estado, fecha y campos reservados para escaneo y retiro.
- Relaciones compuestas de documento/usuario con empresa; una empresa ajena no puede vincularse usando solamente el ID de otra.
- Los estados previstos son `PENDING_SCAN`, `AVAILABLE`, `REJECTED`, `REMOVED`, pero **en esta fase solo se permite insertar `PENDING_SCAN`**. El trigger bloquea todas las actualizaciones y los borrados, incluso intentando falsificar `scanEngine`, `scannedAt`, `status` o `sha256`.
- Un administrador de base de datos o superusuario puede alterar o desactivar triggers: estas reglas no reemplazan roles no-owner, gateway firmado y separación de facultades posteriores.

## Seguridad del contenido

El inspector puro `inspectSupplierAttachment` comprueba nombre saneado, longitud, MIME declarado, extensión, firma inicial/final básica PDF/JPEG y hash SHA-256. No está conectado a HTTP ni permite subir archivos. **No garantiza que un archivo sea seguro**: firmas correctas pueden contener malware o contenido PDF activo.

Límites previstos para carga (aún **sin implementación de cuota atómica**):
- PDF y JPG/JPEG, máximo **10 MiB por archivo**.
- **10 archivos por SupplierDocument**, máximo agregado **100 MiB**.
- La vista local experimental de Recepciones conserva 5 archivos y no guarda bytes. No cambiar su flag `NEXT_PUBLIC_ZAPING_FILES_RECEIPTS_UI` ni asumir que habilita cargas.

## Recuperación de código histórico

- Se reutilizan selectivamente modelo/enum de PR #145 y validación pura PDF/JPEG.
- La migración `20261027010000_supplier_document_attachments_foundation` es **aditiva** y conserva límites/FKs/índices del prototipo. Su trigger está expresamente reemplazado por una regla **deny-all** para UPDATE/DELETE, a diferencia de B1, que permitía pasar a `AVAILABLE` con campos de escaneo falsificables.
- No se integran servicios/endpoints/descarga de #145/#146, SDK R2 de #149, ni ledger, certificados, workers, ClamAV, permisos de roles o gateways de #150–#166.
- No se duplican migraciones de vínculos de Recepciones. Revisar diff Prisma/SQL completo antes de merge.

## Pruebas y release gates

La suite `app/api/test/zfiles-attachment-foundation.postgres.e2e-spec.ts` solo corre si `RUN_ZFILES_ATTACHMENT_FOUNDATION_PG=1`, `CI=true`, `GITHUB_ACTIONS=true`, y la URL apunta al usuario `ci` en `localhost:5432/zaping_test`. CI proporciona PostgreSQL 16 efímero, aplica las migraciones y ejecuta la suite. La prueba no debe reutilizar `zaping_dev`, `zaping_qa` ni producción.

Cobertura esperada: inserción pendiente, rechazo de creación disponible, rechazo de promoción incluso con campos falsos por Prisma y SQL directo, inmutabilidad y no DELETE, FK compuestas cross-tenant, MIME/tamaño/hash/clave privada. Pruebas unitarias verifican el inspector de bytes.

**No atribuir PASS hasta observar los resultados reales de CI.** Revisar también TypeScript, lint, compilación, regresiones API/Web y historical upgrade. Si falla la migración o un test, mantener Draft y corregir en la misma rama; no desactivar gates para obtener PASS.

## Próxima secuencia

1. ZFILES-R2-02: adaptar R2 QA privado, credenciales restringidas por bucket y pruebas sintéticas de lectura/escritura; sin tráfico productivo.
2. Cerrar autorización POSITIVA de roles no-owner SQL (pendiente tras PR #166), escáner ClamAV real y atestación verificable; cuotas/stock de reservas concurrentes.
3. Promoción exact-byte cuarentena→bucket privado, anti-replay, trazabilidad y reconciliación, con fail-closed ante cualquier fallo.
4. API autenticada de upload y download, auditoría, estados reales y experiencia de usuario; después extender el propietario a fotos de Recepciones.

**Fuera de alcance:** endpoints, uploads, descargas, disponibilidad pública, bases operativas, R2 productivo y cambios a facturación, inventario o conciliación.
