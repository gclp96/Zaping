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
3. El backend emite una autorización de carga de duración corta para un objeto con clave generada por el servidor; bucket privado, sin ACL pública.
4. Al completar la carga, NestJS valida metadatos e identidad del objeto y persiste vínculo, checksum y auditoría. Nunca confiar en un `companyId` o en una key de R2 aportados sin autorización.
5. El archivo queda con estado explícito `NOT_SCANNED` durante desarrollo, **no** `CLEAN`.
6. Lectura y descarga solo mediante backend que verifica permisos, registra auditoría y expide URL de descarga temporal cuando la política del entorno lo permite.
7. Borrado lógico del vínculo y política de limpieza del objeto físico documentada por separado.

La selección entre carga directa firmada y proxy backend se validará según el cliente HTTP, límites de tamaño y requisitos de verificación de contenido. No se autoriza contenido activo ejecutable ni previews HTML/PDF incrustadas sin endurecimiento.

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
