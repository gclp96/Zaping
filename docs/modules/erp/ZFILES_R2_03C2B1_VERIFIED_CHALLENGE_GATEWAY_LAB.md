# ZFILES-R2-03C2B1 — Gateway aislado de validación Ed25519 contra challenge DB

**Issue:** #229 · **Dependencias:** #228 (03C2A), #225 (03C1), todos Draft · **Estado:** laboratorio no activado.

## Objetivo

Validar la evidencia firmada de 03C1 contra el **challenge realmente emitido** en 03C2A. La identidad Company/Document/Attachment, nonce, clave de cuarentena, hash y tamaño se toman de una fila de trabajo **leída desde una fuente confiable**, nunca de un cliente HTTP ni de la evidencia recibida. Después se ejecuta `verifyScanEvidence` con una clave pública Ed25519 permitida, versión de worker, antigüedad de evidencia y de firmas, y coincidencia del scope.

La única salida exitosa es `VERIFIED_UNRELEASED`: no equivale a limpio, autorizado o descargable. `MALWARE_DETECTED` sigue como un veredicto de evidencia, no como transición a REJECTED.

## Contratos

`ZfilesChallengeEvidenceRepository` expone dos operaciones:
- `loadChallengeById(jobId)` — debe proceder de una consulta autorizada a PostgreSQL. El resultado incluye `ISSUED`, `issuedAt`, `expiresAt`, companyId/documentId/attachmentId, nonce generado por DB y metadata canónica.
- `commitVerifiedAndConsumeOnce(accepted)` — **contrato futuro, sin implementación real** en 03C2B1. Debe persistir evidencia íntegra y consumir `ISSUED→CONSUMED` en **una única transacción PostgreSQL**, con bloqueo `FOR UPDATE`, scope y expiración revalidados, llave única por job/nonce y roles positivos mínimos. Los tests usan un fake con consumo único para demostrar el comportamiento esperado; eso **no sustituye una prueba de concurrencia DB**.

`ZfilesVerifiedChallengeGateway.verifyAndCommit(jobId, evidence)`:
1. Valida formato UUID del job, carga challenge desde el repositorio, valida fechas/estado/metadata/key derivada.
2. Construye `ExpectedScanIdentity` únicamente a partir del registro.
3. Verifica firma y claims mediante `verifyScanEvidence` (03C1), sin persistencia previa.
4. Acepta exclusivamente `CLEAN_CANDIDATE` o `MALWARE_DETECTED`, nunca `SCAN_FAILED` como éxito.
5. Solicita un único commit al repositorio; si hay carrera/replay/no commit o error, retorna fallo saneado y ningún estado utilizable.

## Riesgos y límites

- El gateway aún **no** tiene un adaptador SQL, no está registrado en NestJS y no hay rol de producción. La interfaz por sí sola no garantiza atomicidad; ésta es la obligación formal de 03C2B2.
- PostgreSQL no verifica firmas Ed25519 en el esquema actual. Un rol verificador con EXECUTE sobre funciones privilegiadas debe permanecer limitado al proceso confiable, sin acceso directo a tablas y sin credenciales en frontend/API. El futuro promotor volverá a verificar la firma, junto con bytes de R2 origen/destino: no confiará únicamente en una fila de auditoría.
- Aún no se autentica quién puede solicitar escaneos. Los permisos de Company provienen del API autorizado futuro y la emisión de jobs no tiene permisos positivos.
- No se controla todavía VersionId de R2; no interpretar hash de un snapshot como inmutabilidad del objeto. 
- El scanner 03B puede entregar `CLAMD_OK_UNATTESTED`, no una atestación de procedencia criptográfica de firmas antivirus.

## Próximo incremento

**03C2B2:** migración aditiva de recibos verificables, función SQL atómica para receipt+nonce, ensayos de acceso real con LOGIN NOINHERIT, NOLOGIN owner y grants específicos, sin promoción. No mover los PR Draft a `main` hasta que CI de #225 y #228, PostgreSQL/seguridad y QA integral estén completos.

**Prohibido en 03C2B1:** SQL, Prisma, R2, secrets, endpoint, jobs operativos, descargas, `AVAILABLE`, `REJECTED`, promotion/copy/delete, merge automático.
