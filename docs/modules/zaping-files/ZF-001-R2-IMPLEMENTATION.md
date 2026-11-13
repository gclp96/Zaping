# ZF-001 — Zaping Files (R2, recepciones de compra)

**Corte:** 2026-11-13  
**Estado:** IMPLEMENTATION IN BRANCH — QA/PROVISIONING PENDING  
**Rama:** `feat/zaping-files-r2-v1-20261113`  
**Decisión:** Cloudflare R2 privado. DigitalOcean/ClamAV pospuestos; no afirmar análisis antivirus.

## Alcance implementado

- Backend NestJS: endpoints de listado, carga `multipart/form-data`, descarga autenticada y borrado lógico.
- Validación **en el servidor** de PDF/JPEG por extensión, MIME declarado y firmas mínimas de bytes, con límites de 10 MiB y 5 documentos por recepción.
- R2 accesible solo desde NestJS por `@aws-sdk/client-s3` (ya existente en el backend). El navegador no recibe credenciales, claves de objetos ni URLs públicas.
- Modelo Prisma `ZapingFile` reutilizable como metadatos de objeto; relación tenant-scoped `ZapingFileReceiptLink` y auditoría `ZapingFileEvent`.
- Identidad de empresa y actor derivadas del JWT; roles autorizados ADMIN/MANAGER/WAREHOUSE.
- SHA-256 registrado y verificado al descargar. Descargas forzadas como attachment/octet-stream; no preview activo.
- Estado `NOT_SCANNED`. En `NODE_ENV=production`, **también se bloquean las cargas**, y los archivos sin estado `CLEAN` no pueden descargarse. **No existe scanner en esta versión**, por lo que la descarga productiva permanecerá cerrada.
- Frontend: panel de archivos en el detalle de Purchase Receipts; la carga se realiza después de crear la recepción. La vista previa local provisional de captura no se utiliza.

## API (JWT, roles y companyId exigidos)

| Método | Endpoint | Efecto |
| --- | --- | --- |
| GET | `/purchase-receipts/:receiptId/files` | Lista exclusivamente archivos activos de la empresa |
| POST | `/purchase-receipts/:receiptId/files` | FormData `file`; crea objeto privado y metadatos |
| GET | `/purchase-receipts/:receiptId/files/:fileId/download` | Devuelve bytes como descarga (solo development/test con NOT_SCANNED; producción requiere CLEAN) |
| DELETE | `/purchase-receipts/:receiptId/files/:fileId` | Borrado lógico, actor y evento |

Ninguna respuesta JSON devuelve el storageKey ni credenciales. Las operaciones consultan pertenencia de archivo-recepción-empresa antes de leer/escribir. Se utiliza bloqueo del renglón de recepción para serializar el máximo de 5 adjuntos.

## Configuración manual para pruebas locales

1. En el panel Cloudflare, ingresar a **R2 Object Storage → Buckets → Create bucket**.
2. Elegir clase **Standard**, conservar el bucket privado y no habilitar acceso público ni dominios personalizados.
3. Crear credenciales R2 con **Object Read & Write** restringidas al bucket del desarrollo, con principio de mínimo privilegio. Guardarlas en un gestor de secretos; no pegarlas en chats, commits, documentación, capturas ni `NEXT_PUBLIC_*`.
4. Configurar **solo en el entorno del backend** (p. ej. `app/api/.env`, archivo ignorado por Git):

   ```dotenv
   R2_ACCOUNT_ID=<id de 32 caracteres hexadecimales>
   R2_BUCKET=<nombre bucket privado dev>
   R2_ACCESS_KEY_ID=<id de clave R2 restringida>
   R2_SECRET_ACCESS_KEY=<secreto de clave R2>
   ```

5. Mantener el `NODE_ENV=development` en local. Sin los cuatro valores, la API puede arrancar, pero los uploads/downloads responden 503.
6. Aplicar la migración **únicamente contra una base local de desarrollo/QA previamente respaldada**, nunca contra producción sin revisión:

   ```bash
   cd app/api
   npm ci
   npx prisma generate
   npx prisma migrate deploy
   npm run typecheck
   npm run lint:check
   npm test -- --runInBand
   npm run build
   ```

7. En `web/`, ejecutar `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`. Con ambos servidores locales levantados, crear una recepción y adjuntar desde su página de detalle.

**No se requieren reglas CORS de R2 para esta primera versión:** la carga y descarga pasan por el backend. Al incorporar URLs presignadas directas se evaluará CORS y validación del tamaño de la carga en esa nueva arquitectura.

## Comprobaciones de aceptación (aún no declaradas PASS)

- [ ] Migración y generación Prisma pasan en BD de QA local.
- [ ] CI API/Web: lint, typecheck, unit, build.
- [ ] Subida PDF/JPEG válidos y rechazo de tipos disfrazados.
- [ ] Límite 10 MiB y máximo 5 archivos, también con dos solicitudes simultáneas.
- [ ] 404 a UUID de otra empresa, otra recepción o archivo eliminado.
- [ ] Roles SALES sin permiso para ver/cargar/descargar.
- [ ] Archivo listado, descargado y eliminado desde UI; descargas sin render embebido.
- [ ] En modo production, la carga devuelve 503 y NOT_SCANNED devuelve 403 al descargar.
- [ ] Acceso público al bucket denegado.
- [ ] Ausencia de contraseñas/tokens en logs y cambios versionados.
- [ ] Revisión de riesgo por archivos de terceros antes de cualquier piloto comercial.

## Límites y pendientes importantes

- **SIN antivirus**: `NOT_SCANNED` no significa archivo seguro. Solo QA interna con documentos confiables. Producción exige gate de seguridad.
- Al eliminar lógicamente, **el objeto físico permanece privado** en R2 para retención/auditoría. Una política y tarea de purga deberá diseñarse para no acumular almacenamiento indefinidamente.
- Si el proceso muere tras subir un objeto y antes de crear metadatos, puede quedar un objeto huérfano; la compensación de errores cubre fallos de base conocidos, no crashes. Se necesitará conciliación eventual.
- Límite de 10 MiB por archivo: la API usa buffers en memoria; no es una solución para archivos de gigabytes.
- Los checksums detectan alteraciones del objeto, no malware.
- R2 es de terceros y el nivel gratuito se limita por almacenamiento y operaciones; vigilar uso real, sin asumir costo cero ilimitado.
- Sin credenciales de prueba disponibles aquí, **no se puede afirmar una integración E2E real con Cloudflare**.

## Referencias

- https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/objects/upload-objects/
- https://developers.cloudflare.com/r2/buckets/cors/

## Definición de Done

ZF-001 no estará `Done` hasta pasar los gates anteriores en un entorno local controlado. Esta rama documenta e implementa el código; el PR permanece en revisión hasta verificarlo.
