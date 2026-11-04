# ZFILES-R2-03C2B2 — Evidencia Ed25519 y nonce atómico PostgreSQL

**Issue:** #231. **Base:** #230 (03C2B1) → #228 (03C2A) → #225 (03C1), todos Draft. **No desplegado.**

## Qué agrega

Migración PostgreSQL 16 y modelo Prisma `SupplierAttachmentScanReceipt`: envelope Ed25519 completo en JSONB, Company/Document/Attachment, nonce UUID, veredicto, timestamps y unicidad por job, nonce y adjunto/empresa.

Se agregan dos funciones PostgreSQL con `SECURITY DEFINER`, `search_path` fijado y reloj UTC:

1. `read_zfiles_scan_challenge(jobId)`: devuelve el challenge inmutable mediante EXECUTE, sin dar al verificador SELECT directo en las tablas.
2. `commit_zfiles_verified_scan(jobId, companyId, nonce, envelope)`: bloquea la fila `FOR UPDATE`, vuelve a cotejar Company, metadata, hash, tamaño, estado PENDING_SCAN, documento ACTIVE y TTL; inserta el envelope y cambia el nonce de ISSUED a CONSUMED **en la misma transacción SQL**. Ante error se revierte toda la operación. Si otro proceso consumió el nonce, la segunda operación retorna falso.

El trigger de 03C2A sigue bloqueando DELETE, edición arbitraria y consumo sin el receipt coincidente; sólo permite la transición a CONSUMED cuando el recibo ya existe. El recibo es inmutable por trigger y único por attachment/empresa. No se toca el bloqueo de estado de `SupplierDocumentAttachment`.

## Límite de confianza crítico

**PostgreSQL NO valida la firma Ed25519.** Sólo la comprueba el gateway de Node de #230, usando una clave pública fijada, política de worker/build, scope de Company/Document/Attachment, hash/longitud, nonce, vigencia de evidencia y firmas ClamAV.

El nuevo repositorio `ZfilesPostgresChallengeEvidenceLabRepository` está **sin registrar en NestJS**. Su conexión deberá ser una identidad dedicada del verificador, jamás compartida con la API, el uploader ni el escáner. Una cuenta con EXECUTE sobre commit podría presentar un sobre falsificado, aunque la base valide campos estructurales: **por eso no se conceden grants de producción en esta migración ni se puede usar el receipt como permiso para publicar archivos**.

Los tests de CI crean tres roles efímeros: owner `NOLOGIN` no-superuser con SELECT/UPDATE específicos, verifier `LOGIN NOINHERIT` con solo EXECUTE en dos funciones, y otro `LOGIN` sin EXECUTE. Se verifica permiso real mediante sesiones PostgreSQL, denegaciones DML y competencia desde dos conexiones físicas. Esos GRANTs sólo existen durante la prueba en `zaping_test` de CI; no crean roles persistentes en ambientes reales.

## Gates probados en el laboratorio

- Persistencia del envelope completo verificado y nonce CONSUMED, con adjunto todavía PENDING_SCAN.
- Dos verificadores concurrentes: sólo uno termina en VERIFIED_UNRELEASED.
- Replay, Company y nonce incorrectos, firma adulterada, fallo de roles y recibos inmutables, prohibición de reemisión posterior.
- Resultado MALWARE_DETECTED permanece en cuarentena y nunca autoriza REJECTED, AVAILABLE o descarga.

## Bloqueos para release

- La cuenta del verificador y las llaves públicas deben ser gestionadas de forma segura con rotación/revocación y aislamiento de procesos, sin credenciales en GitHub ni usuario final.
- Token R2 **Object Read** exclusivo de cuarentena con pruebas reales positivas y negativas; VersionId / generación de objeto o relectura y cotejo contra carrera TOCTOU.
- Permiso de emisión de job con contexto de Company autenticado, ciclo de vida de carga confirmada e integración del worker real con R2 y FreshClam.
- Servicio **promotor separado**, que revalide firma y bytes en origen/destino antes de permitir AVAILABLE; política de recuperación, monitoreo, retención y auditoría.
- API Next.js/NestJS, cuotas atómicas, vista previa/descarga autenticada y E2E multiempresa.

**Prohibido:** APIs/HTTP, carga real, download, CopyObject, DeleteObject, estados AVAILABLE/REJECTED, secrets, grants o roles productivos, merge o deploy automático. El resultado 03C2B2 es únicamente `VERIFIED_UNRELEASED`.

El CI (API/Web/Historical más E2E PostgreSQL con roles) debe aprobar sobre el commit exacto; hasta entonces ninguna afirmación de PASS.
