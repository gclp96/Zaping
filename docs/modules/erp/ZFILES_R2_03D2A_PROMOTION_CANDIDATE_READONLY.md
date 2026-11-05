# ZFILES-R2-03D2A — Candidato de promoción de solo lectura en PostgreSQL

**Alcance:** #237 · base PR #239 (03D1) → #234 (03C3A) → #232 (03C2B2) · PR Draft apilado, sin merge.

## Objetivo

Conectar los recibos firmados por escaneo y los trabajos consumidos de PostgreSQL con una **lectura de candidato al promotor**, sin habilitar ninguna transición de disponibilidad.

La función `public.read_zfiles_promotion_candidate(job_id UUID, company_id TEXT)` es `SECURITY DEFINER` y su `search_path` contiene solo `pg_catalog, pg_temp`. Sus tablas se referencian con `public.` explícito. Retorna un JSONB limitado a un job y Company autorizados por su rol de ejecución; un job inválido, cruzado, no consumido o asociado a malware retorna `NULL`.

### Comprobaciones previas en la consulta

- Job `CONSUMED`, `consumedAt` consistente y anterior a `expiresAt`, igual Company solicitada y mismo Document/Attachment/nonce que el receipt.
- Documento `ACTIVE`, adjunto `PENDING_SCAN` sin borrado lógico, storageKey canónica privada, quarantineKey canónica de origen y tamaño/hash coincidentes.
- Receipt persistido, único para ese job, con veredicto `CLEAN_CANDIDATE`; envelope JSON con claims estructurales correspondientes. Esto **NO valida la criptografía Ed25519**.
- Tipo documental PDF o JPEG y tamaño en rango 1–10 MiB; ninguna condición habilita cambiar el estado.
- Devuelve el envelope íntegro al promotor para su futura validación Ed25519 con clave pública/política/worker/build y su posterior cotejo de bytes en 03D1.

## Privilegios y amenaza residual

La migración revoca EXECUTE a `PUBLIC` y **no concede permisos de producción**. El lector `ZfilesPostgresPromotionCandidateReader` está sin registrar en NestJS, sin credenciales ni HTTP. Sólo podrá utilizarse desde una identidad dedicada del promotor, con EXECUTE explícito en la función y sin SELECT/UPDATE directos a tablas. Ese aprovisionamiento se hará exclusivamente mediante revisión independiente de seguridad.

El argumento `company_id` por sí solo **no autentica a nadie**. La identidad del proceso y un job asignado a ese servicio deben ser verificados externamente; nunca exponer la función al usuario final, un token HTTP ni al uploader.

**Importante TOCTOU:** una consulta SQL de solo lectura no congela estados ni impide cambios entre selección y copia R2. La futura liberación `AVAILABLE` exige una transacción explícita de reconciliación con lock, revalidación de firma, hash, estado del objeto privado, Company y evento auditable. Tampoco debe suponerse que el resultado del scanner sigue válido indefinidamente; `verifyScanEvidence` verifica frescura y política en Node.

## Pruebas

El E2E `test/zfiles-promotion-candidate.postgres.e2e-spec.ts` se habilita sólo con `RUN_ZFILES_PROMOTION_CANDIDATE_PG=1` en CI, exclusivamente `zaping_test` PostgreSQL 16 en localhost:5432 bajo usuario `ci`. Crea roles efímeros:
- Owner `NOLOGIN` con SELECT en las cuatro tablas requeridas y propietario de la función.
- Promoter `LOGIN NOINHERIT` con solo EXECUTE de la función.
- Unrelated `LOGIN NOINHERIT` sin EXECUTE.

Valida:
1. Privilegios positivos de función y negativos de SELECT/UPDATE/DML y acceso de rol no autorizado.
2. Firma Ed25519 real y receipt atómico del gateway anterior, más lectura de JSONB estructural del candidato CLEAN.
3. Denegación por Company incorrecta, job no existente o challenge sin consumir.
4. Denegación de MALWARE_DETECTED firmado y persistido.
5. Relectura no mutante; intento de AVAILABLE continúa bloqueado por trigger previo.

Ninguna prueba utiliza Cloudflare R2 real, ni toca bases DEV, QA o productivas. Si la suite no se ejecuta o CI falla, NO declarar PASS.

## Siguiente incremento de 03D

- 03D2B/03D3: transacción SQL liberadora de rol mínimo después de verificación del destino, auditoría e idempotencia ante caída entre R2 y DB.
- Identidades separadas para scanner (Get cuarentena), promotor (Get cuarentena, Put-if-absent y Get privado) y autorizador SQL. Tokens externos bajo mínimo privilegio.
- Almacenamiento sin sobrescrituras/reconciliación y QA físico R2 con archivos sintéticos.
- 03E (#238): endpoint y UX de recepciones con feature flag OFF inicialmente.

**Prohibido en 03D2A:** UPDATE/AVAILABLE, GRANT de producción, endpoint HTTP, provider NestJS, credenciales, emisión de URL, carga/descarga, CopyObject, DeleteObject, despliegue o merge automático.
