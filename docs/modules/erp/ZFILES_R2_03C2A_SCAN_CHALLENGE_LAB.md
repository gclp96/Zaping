# ZFILES-R2-03C2A — Jobs/nonce de escaneo en PostgreSQL (laboratorio cerrado)

**Issue:** #227. **Base:** PR #225 (03C1). **Estado:** Draft, sin despliegue ni permisos productivos.

## Objetivo

Crear un challenge de escaneo emitido por PostgreSQL para un SupplierDocumentAttachment **existente, de la empresa indicada y todavía PENDING_SCAN**. El challenge fija company/document/attachment, ruta de cuarentena derivada del servidor, tamaño y SHA-256 de la fila de adjunto, UUID y nonce generados en PostgreSQL, y vigencia de 60–300 segundos.

No existe todavía carga operativa, reserva de subida ni prueba de que el objeto R2 existe. En particular, el material `ExpectedScanIdentity` de 03C1 sólo podrá provenir de este registro después de validar su autorización con un servicio aislado.

## Diseño de 03C2A

- `SupplierAttachmentScanJob`, enum `ISSUED | CONSUMED | EXPIRED`. El enum reserva CONSUMED para 03C2B: en este incremento su transición está **prohibida incluso con SQL directo**; no se crea función de consumo ni gateway.
- Función `issue_zfiles_scan_challenge(companyId, attachmentId, ttlSeconds)` tipo `SECURITY INVOKER`, revocada de PUBLIC y **sin GRANT a servicio alguno**. Sólo será invocada por el propietario de la base durante QA efímero. No conectar a controladores, workers ni credenciales ERP.
- Bajo bloqueo de fila `FOR UPDATE` del adjunto: verificar documento activo, pertenencia a Company, `PENDING_SCAN`, clave de metadatos `private/company/document/attachment` y hash/tamaño ya guardados. Derivar clave `quarantine/company/document/attachment`; **no aceptar key ni hash en parámetros**.
- Un único job ISSUED por empresa/adjunto con índice parcial. En reemisión, la función expira los ISSUED cuyo TTL terminó. Desafíos no vencidos rechazan una segunda emisión. Cada nueva emisión genera nonce distinto.
- Trigger mantiene identidad/hash/tamaño/nonce inmutables; sólo permite `ISSUED→EXPIRED` **después** de vencimiento. Todos los DELETE, falsificaciones de CONSUMED y actualizaciones arbitrarias se rechazan. Se conservan registros hasta diseñar retención auditada.
- FK compuesta attachmentId/companyId y documentId/companyId, CHECK de SHA, tamaño, formato de key, TTL y timestamps.
- Roles no-owner: sin SELECT/INSERT/UPDATE/DELETE a tabla y sin EXECUTE sobre función. Un test conecta realmente con usuario LOGIN NOINHERIT independiente y comprueba denegaciones. **Ningún GRANT positivo todavía**.

## Bloqueos y riesgos

Un operador propietario de PostgreSQL puede crear o modificar esquemas, funciones, triggers y grants. La función aún **no autentica que un companyId solicitado corresponde a un usuario**; dar EXECUTE a API o scanner sería inseguro. Los mecanismos de acceso positivo, contexto de identidad y ejecución segura con NOLOGIN owner requieren 03C2B.

Una fila job ISSUED **no es evidencia firmada ni prueba que R2 contiene el objeto**. El nonce no previene replay si se usa sin consumo atómico. 03C2B añadirá verificación Ed25519 con clave pública fijada, persistencia y consumo único en la misma transacción mediante un gateway aislado, con tests de concurrencia de roles reales. La autorización para AVAILABLE seguirá bloqueada hasta que 03D verifique también bytes origen/destino y privilegios R2.

## QA

CI-only PostgreSQL 16 `ci@localhost:5432/zaping_test` con guard: emisión válida, nonce único, TTL, intento cross-tenant, competencia de emisores, prohibición de CONSUMED, rechazo de edición y DELETE, bloqueo de AVAILABLE y denegación con login independiente. No usar `zaping_dev`, `zaping_qa` ni producción.

**Sin** conexión R2, credenciales, servicio de carga, API HTTP, promoción, estados AVAILABLE/REJECTED, descargas, firma persistida ni cambios de triggers existentes sobre adjuntos.

**DoD:** documentación, esquema/migración y E2E PASS, CI API/Web/Historical PASS, revisión de seguridad. Mantener Draft.
