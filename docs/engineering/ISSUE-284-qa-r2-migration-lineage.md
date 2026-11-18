# ISSUE-284 — Reconciliación del historial Prisma de QA (Zaping Files R2)

Estado: **implementación de diagnóstico/rehearsal; corte a nueva QA aún NO realizado**.

## Evidencia y decisión

- La base operativa local `zaping_qa` registra la migración aplicada
  `20261113190000_zaping_files_r2_v1` desde el 14/nov/2026.
- La migración procede del PR [#272](https://github.com/gclp96/Zaping/pull/272)
  (`feat/zaping-files-r2-v1-20261113`). **Ese PR fue cerrado sin merge.**
  Por ello, no puede darse por integrada la funcionalidad Zaping Files R2 en `main`.
- El SQL histórico existe en `b6ddc38:app/api/prisma/migrations/20261113190000_zaping_files_r2_v1/migration.sql`.
  Con finales de línea CRLF su SHA-256 es
  `8fcee7b0a88f1ef1ce9d2655576fa5bfeacec00fbcb0e0dc0f42ec41790f3223`,
  igual al checksum registrado en QA.
- La migración crea `ZapingFile`, `ZapingFileReceiptLink` y `ZapingFileEvent`
  con restricciones/trigger. Los modelos **no existen** en el `schema.prisma`
  actual de `main`, que sí contiene las estructuras distintas de
  `SupplierDocumentAttachment`. Estas no son sustitutos intercambiables.
- Las migraciones UX-005D `20261118010000_customer_location_fields` y
  `20261118020000_customer_fiscal_postal_fields` **sí forman parte de main** y
  se aplicaron a QA; no son causa de esta divergencia.
- Restaurar el SQL de #272 directamente en `app/api/prisma/migrations`
  introduciría tablas de un módulo no fusionado en *todas* las instalaciones
  nuevas. Un archivo presente no demuestra equivalencia entre esquema Prisma
  y BD ni autorización para activar R2. **No es la corrección aprobable.**
- Tampoco es correcto borrar manualmente el registro de
  `_prisma_migrations`: las tablas/constraints pueden seguir existiendo y
  se perdería trazabilidad.

**Resolución de diseño:** preservar `zaping_qa` y sus datos, realizar un
rehearsal limpio en un proyecto Docker aislado con las migraciones de `main`,
y después preparar un **corte controlado hacia una nueva base QA de main**,
con respaldo y decisión expresa sobre la conservación/recarga de datos de
prueba. No desplegar ni restaurar ninguna migración del PR #272 en main.

## Paso 1 — Auditar QA existente (solo lectura)

Desde la raíz de `main` o de la rama de este PR, con Docker QA activo:

```powershell
node scripts/qa/audit-zaping-files-r2-history.cjs
node --test scripts/qa/audit-zaping-files-r2-history.test.cjs
```

El auditor verifica que la API apunta exactamente a
`zaping-qa-postgres:5432/zaping_qa`, la identidad de PostgreSQL es
`zaping_qa|zaping_qa`, el registro histórico está terminado/no revertido,
el checksum coincide con el archivo histórico recuperado desde Git (incluida
variante CRLF), la ausencia de sus modelos en Prisma, la diferencia de
migraciones registradas vs carpetas presentes y **solo los recuentos** de las
tres tablas históricas R2. Nunca imprime URLs con contraseña ni filas.

**Punto de parada:** checksum no reconocido, tablas con registros R2,
otras migraciones exclusivas de DB o migraciones locales pendientes inesperadas.
Investigar antes de cualquier corte. Un `migrate status` con la advertencia
histórica no debe interpretarse como una migración pendiente para restaurar.

## Paso 2 — Ensayo CLEAN de main en PostgreSQL 16 aislado

El archivo `docker-compose.qa-history-rehearsal.yml` define **otro proyecto,
otra red y otros volúmenes**. No expone ningún puerto del host, no monta el
volumen de `zaping-local-qa` y no inicia servidores API/Web de Zaping.

```powershell
docker compose -f docker-compose.qa-history-rehearsal.yml up -d --wait zaping-qa-postgres
docker compose -f docker-compose.qa-history-rehearsal.yml run --rm --no-deps deps
docker compose -f docker-compose.qa-history-rehearsal.yml run --rm schema-check
```

- `deps` copia únicamente el proyecto Prisma/archivos npm a un volumen
  aislado e instala dependencias **sin variables de entorno del backend**.
- `schema-check` comprueba que su `DATABASE_URL` apunta al nombre DNS local
  de rehearsal y a `/zaping_qa`. Debido a la red propia del proyecto, ese
  DNS resuelve al **PostgreSQL desechable**, no al operativo.
- Solo en esa BD aislada ejecuta `prisma migrate deploy`, luego
  `prisma migrate status` y `prisma validate`.
- Si falla el guard de destino, no se ejecuta ninguna migración.

Confirmar que el SQL R2 NO se aplicó en ese ensayo:

```powershell
docker compose -f docker-compose.qa-history-rehearsal.yml exec -T zaping-qa-postgres psql -U zaping_qa -d zaping_qa -Atc "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261113190000_zaping_files_r2_v1';"
```

Resultado esperado: `0`. `migrate status` debe indicar esquema al día.
No usar `docker compose down -v` por defecto: conservar la evidencia de
rehearsal hasta revisión. Tampoco ejecutar comandos sobre otro proyecto
Compose por inferencia de nombres.

## Paso 3 — Corte real de QA: gate humano pendiente

**No forma parte de este PR.** No basta con un rehearsal verde para cambiar
la base que usan QA ADMIN/SALES/etc. Se requiere:

1. Confirmar el contenido real de las tres tablas R2 del auditor (cero filas
   o plan de conservación específico) y revisar si otras tablas QA guardan
   datos de prueba que deban preservarse.
2. Respaldo `pg_dump -Fc` reciente de la QA operativa + verificación de
   lectura `pg_restore --list` y preferiblemente restauración de ensayo.
   El respaldo hecho para UX-005D es evidencia anterior, pero **no sustituye**
   un respaldo previo al corte.
3. Elegir expresamente entre resembrar Company A/B y datos sintéticos o
   realizar una **migración de datos revisada** a una nueva BD. No copiar
   automáticamente `_prisma_migrations` ni las tablas R2 experimentales.
4. Crear una nueva BD QA con nombre distinto, aplicar solo migraciones de
   `main`, verificar conteos/roles/permisos, y actualizar configuración
   privada de API/Web **solo tras** una validación de destino.
5. Conservar sin borrar `zaping_qa` y su volumen para recuperación;
   después comprobar Clientes (incluido `QA-UX005D-Domicilio` cuando se
   haya preservado/sembrado), Compras/Recepciones, auth y multiempresa.
6. Documentar el cambio y el rollback (volver a apuntar la API a la BD
   original preservada, sin reescribir registros) antes de cerrar #284.

**No ejecutar** `prisma migrate reset`, `prisma migrate resolve`,
`prisma db push`, `DROP TABLE`, `DELETE FROM _prisma_migrations` ni
`docker compose down -v` sobre el entorno operativo. No modificar
`zaping_dev`, producción, Cloudflare R2 o credenciales durante este trabajo.

## Definition of Done

- [x] Origen y estado del PR R2 identificados; SHA-256 histórico validado.
- [x] Identificado que los tres modelos R2 no existen en `main`.
- [x] Auditor read-only y pruebas puras, sin operaciones DDL/DML.
- [x] Proyecto Docker de rehearsal separado y sin puertos expuestos.
- [ ] Auditor ejecutado contra la QA local actual; revisar conteos/alertas.
- [ ] Ensayo limpio PostgreSQL 16 completado con `migrate status` en verde.
- [ ] Política de preservación de datos y autorización de corte definidas.
- [ ] Corte hacia BD QA de `main` completado y pruebas de regresión PASS.
- [ ] Cerrar issue #284 solo después de comprobar que la QA activa no posee
      migraciones aplicadas ausentes de las fuentes oficiales.
