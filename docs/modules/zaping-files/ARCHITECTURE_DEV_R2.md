# Zaping Files — Arquitectura de almacenamiento y seguridad (fase de desarrollo)

**Fecha de decisión:** 2026-11-13  
**Estado:** APPROVED PRODUCT DIRECTION / IMPLEMENTATION PENDING  
**Ámbito:** Adjuntos reutilizables para recepciones de compras; extensible a otros módulos.

## Decisión

**Implementar primero Zaping Files con Cloudflare R2 privado, NestJS y PostgreSQL/Prisma, sin dependencia obligatoria de DigitalOcean ni ClamAV durante el desarrollo.** Posponer la contratación de servidores productivos y el servicio antivirus dedicado hasta la fase final de infraestructura, manteniendo explícita la deuda de seguridad.

No confundir *almacenamiento operativo* con *archivo analizado*. Cloudflare R2 **no** sustituye un scanner antivirus.

## Flujo de desarrollo propuesto (TARGET; no afirmar implementado)

1. Usuario autenticado solicita adjuntar PDF/JPEG a una recepción.
2. NestJS valida permisos, pertenencia a `companyId`, tipo real de archivo, extensión, tamaño, límites y entidad destino.
3. Para V1, el navegador envía un archivo pequeño (`multipart/form-data`, hasta 10 MiB) a NestJS; el backend valida sus bytes y genera la clave de objeto. El bucket R2 permanece privado.
4. NestJS sube el archivo a R2 mediante S3 API y persiste vínculo, checksum y auditoría. Nunca confiar en un `companyId` o una key aportados por el cliente.
5. El archivo queda con estado explícito `NOT_SCANNED` durante desarrollo, **no** `CLEAN`.
6. Las descargas pasan por NestJS, que verifica permisos, integridad y auditoría. En producción, las descargas `NOT_SCANNED` quedan bloqueadas hasta habilitar el scanner.
7. Borrado lógico del vínculo y política de limpieza del objeto físico documentada por separado.

La V1 utiliza carga y descarga a través del backend para validar bytes y evitar exponer credenciales; las URLs firmadas directas se reevaluarán si la escala lo exige. No se autoriza contenido activo ejecutable ni vistas previas HTML/PDF incrustadas sin endurecimiento.

## Seguridad mínima que no se pospone

- Bucket privado R2, credenciales solo del lado servidor, con alcance mínimo.
- Autorización por tenant y rol en **cada** operación, incluyendo descargas, listados, reemplazos y eliminaciones.
- Validación de extensión y magic bytes/MIME real, máximos de tamaño, límites de cantidad y nombres controlados; rechazar tipos no admitidos.
- URL firmada con vencimiento breve; no exponer claves R2 ni registrar URLs firmadas completas.
- Registro persistente de autor, empresa, recepción, objeto, tamaño, hash, estado y eventos relevantes.
- Restricción explícita de la función a pruebas internas con archivos confiables mientras no exista análisis antivirus.
- Política de bloqueo *fail closed* prevista para producción: `PENDING_SCAN`, `CLEAN`, `INFECTED`, `SCAN_FAILED`, con download permitido únicamente en `CLEAN` más autorización vigente.
- Inventario y tratamiento de archivos `NOT_SCANNED` antes de migrar a producción: reanalizar o retirar, sin marcarlos automáticamente como limpios.

## Servicio de análisis futuro (DEFERRED)

Una interfaz interna desacoplada del proveedor conectará un worker a los objetos privados en R2; el worker usará ClamAV mediante socket Unix. Se definirán después colas durables, identidad entre servicios, trabajos idempotentes, reintentos con backoff, límites, cuarentena, retención y monitoreo.

El prototipo `INF-CLAMAV-LAB-01` validó únicamente el motor local; **no** valida el comportamiento integrado del producto.

## Criterios de salida para activar adjuntos de terceros en producción

- Scanner o mitigación equivalente aprobada en evaluación de riesgos.
- Cuarentena efectiva y bloqueo de accesos a archivos no analizados.
- QA de tenant isolation, roles, cargas concurrentes, errores, reemplazos y caducidad de URLs.
- Observabilidad, backups/restauración, gestión de secretos y pruebas de recuperación.
- Documentación de costo recurrente, despliegue reproducible y rollback.

## Impacto sobre el plan

**CURRENT:** ERP Core existente; ClamAV fue probado únicamente en laboratorio externo.  
**TARGET (DEV):** Zaping Files + Cloudflare R2 sin servidor antivirus permanente, en entorno local/QA.  
**DEFERRED:** DigitalOcean/ClamAV, worker, cola y endurecimiento productivo.  
**NO CLAIM:** no se afirma que R2 esté integrado ni que existan ya tablas o endpoints de adjuntos.

Esta decisión evita costos recurrentes prematuros sin renunciar a controles de seguridad mínimos ni diseñar el módulo alrededor de un proveedor de cómputo específico.
