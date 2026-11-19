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

Desde la raíz de la rama de este PR (o `main` **después** de integrar el PR), con Docker QA activo:

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

## Paso 2b — Transferencia de datos oficiales a base de ensayo versionada

**Verificaciones realizadas en QA local el 18/nov/2026, según resultados compartidos:**

- El rehearsal limpio tiene **54 migraciones**, `prisma migrate status` y `validate` PASS, **0 migraciones R2**.
- Respaldo de QA realizado en formato `pg_dump -Fc`; SHA-256 cotejado. Restauración de prueba completa en `zaping_issue284_restore_check` PASS.
- En el respaldo restaurado, las tres tablas R2 mantienen **1 archivo / 1 vínculo / 3 eventos** y cinco consultas de relaciones por empresa reportaron **0 huérfanos**. El archivo está eliminado lógicamente, estado `NOT_SCANNED`, tamaño 2369 bytes; no debe reactivarse.
- Inventario: 22 tablas oficiales con **110 filas**, 3 tablas experimentales R2 con 5 filas. Datos en **ambas** empresas, incluyendo escenarios de Healthcare.
- Las definiciones de columnas, tipos, nullabilidad y defaults coinciden. Se compararon 699 objetos estructurales por BD; únicamente difiere la representación de `SupplierDocumentAttachment_mime_check`: la restaurada convierte cada elemento del arreglo `['application/pdf','image/jpeg']` a `text`; la limpia convierte todo el arreglo a `text[]`. Son **equivalentes** para esos literales; no modificar constraints.

**Primer intento ejecutado (18/nov/2026):** 8/8 pruebas PASS; el script creó
`zaping_issue284_transfer_trial` (cuarta base), pero `pg_restore --single-transaction`
falló al hacer `COMMIT` con `relation "EquipmentAsset" does not exist`.
Una consulta posterior confirmó que la tabla `public."EquipmentAsset"` sí existe,
las 54 migraciones siguen aplicadas y la importación dejó **0 empresas** (rollback).
El origen es una función diferida de custodia de equipos
(`public.equipment_custody_assert_asset`): referencia tablas
`"EquipmentAsset"` y `"EquipmentAssetCustody"` sin `public.`. El dump
configura `search_path` vacío; el fallo ocurre al ejecutar la función.
No se modificaron funciones, triggers, restricciones ni la base QA operativa.

**Corrección del ensayo:** para el siguiente intento usar una **nueva quinta base**
`zaping_issue284_transfer_trial_v2`; se conserva la cuarta como evidencia.
El script conserva el archivo exportado `pg_dump -Fc`, obtiene el SQL
`pg_restore --data-only` y **solo si reconoce exactamente un encabezado
de `search_path` vacío**, añade `SET search_path = pg_catalog, public;`
para esa sesión. Importa mediante `psql --single-transaction -v ON_ERROR_STOP=1`
con los triggers y las FKs activados. No altera migraciones oficiales,
definiciones de funciones, constraints ni el esquema permanente.

**Procedimiento corregido (aún no ejecutado en QA local):**

Desde la raíz de la rama de este PR, con los tres controles de rehearsal ya realizados:

```powershell
node --test scripts/qa/audit-zaping-files-r2-history.test.cjs scripts/qa/rehearse-issue284-official-data.test.cjs
node scripts/qa/rehearse-issue284-official-data.cjs
```

El script se detiene salvo que:
- El contenedor pertenezca al proyecto Docker `zaping-issue284-rehearsal`.
- La base limpia de rehearsal `zaping_qa` contenga exactamente 54 migraciones terminadas, ninguna R2 y **0 empresas**.
- La BD destino `zaping_issue284_transfer_trial_v2` **NO exista**.

Después:
1. Obtiene del esquema **limpio** la lista permitida de tablas y secuencias, excluyendo `_prisma_migrations` y las 3 tablas R2.
2. Exporta únicamente esos datos desde `zaping_issue284_restore_check` con `pg_dump --data-only -Fc --table`. Inspecciona la lista del archive para confirmar que no contiene el historial ni tablas R2.
3. **Clona** el esquema limpio con `createdb -T zaping_qa` a la quinta base `zaping_issue284_transfer_trial_v2` *en el Docker aislado*. La cuarta base fallida permanece intacta.
4. Reproduce `pg_restore --data-only` a SQL; valida de forma estricta el encabezado `search_path`; solo en el SQL importado añade un `search_path` temporal seguro para que las funciones diferidas existentes resuelvan el esquema `public`. Ejecuta `psql --single-transaction -v ON_ERROR_STOP=1`, **sin desactivar triggers ni FKs**. Si falla una dependencia FK u otra verificación, se revierte toda la importación. No usar `--disable-triggers` como bypass.
5. Comprueba exactamente 54 migraciones oficiales y 0 R2, compara recuentos y huellas de todas las tablas oficiales contra el respaldo restaurado, y exige **110 filas** idénticas.

**Si falla:** conservar la quinta base y todas las bases anteriores, sin borrar volúmenes ni datos; revisar el error y ajustar el ensayo en una base nueva, sin repetir destructivamente. **Un fallo no autoriza deshabilitar restricciones ni modificar QA operativa.**

**Si pasa:** todavía falta asegurar funcionalidad por roles, configuración de usuario y sesiones, y validar las referencias al almacenamiento externo R2 (el dump no contiene el objeto binario) antes del corte de QA. Un ensayo verde **no** cambia ninguna conexión de API/Web.

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
- [x] Auditor ejecutado en QA local; una migración R2 huérfana, 1/1/3 registros, checksum verificado.
- [x] Ensayo limpio PostgreSQL 16 completado: 54 migraciones, 0 R2; `migrate status` y `validate` PASS.
- [x] Respaldo restaurado verificado, 5 consultas de integridad sin huérfanos, inventario 110+5 y equivalencia estructural documentada.
- [ ] Ensayo de transferencia a cuarta BD con 110 filas oficiales y hashes coincidentes.
- [ ] Política de preservación de datos y autorización de corte definidas.
- [ ] Corte hacia BD QA de `main` completado y pruebas de regresión PASS.
- [ ] Cerrar issue #284 solo después de comprobar que la QA activa no posee
      migraciones aplicadas ausentes de las fuentes oficiales.
