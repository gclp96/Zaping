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

**Segundo intento ejecutado (19/nov/2026):** 10/10 pruebas PASS, preflight y
exportación de 57 tablas PASS, pero el script creó la base
`zaping_issue284_transfer_trial_v2` y se detuvo antes de importar:
`pg_restore: error: one of -d/--dbname and -f/--file must be specified`.
Se comprobó que la llamada que renderiza SQL desde el archivo custom omitía
`--file=-`. **No volver a usar ni eliminar** `...transfer_trial_v2`.
Los datos de la QA operativa siguen fuera del alcance del script.

**Corrección del tercer ensayo:** para el siguiente intento usar una **nueva
sexta base** `zaping_issue284_transfer_trial_v3`; las bases v1/v2 se conservan.
Ahora `pg_restore --data-only --file=-` genera SQL completo hacia stdout
sin conectarse a una BD y la salida conserva sus bytes de `COPY`, sin
`trim()`. La validación estricta de `search_path` ocurre **ANTES** de crear
la sexta base. Solo si pasa, añade `SET search_path = pg_catalog, public;`
para la sesión de importación `psql --single-transaction`. No modifica
las migraciones, funciones, triggers, restricciones ni el esquema permanente.
Hay una prueba de regresión para exigir `--file=-` y rechazar paths imprevistos.
El script conserva el archivo exportado `pg_dump -Fc`, obtiene el SQL
`pg_restore --data-only` y **solo si reconoce exactamente un encabezado
de `search_path` vacío**, añade `SET search_path = pg_catalog, public;`
para esa sesión. Importa mediante `psql --single-transaction -v ON_ERROR_STOP=1`
con los triggers y las FKs activados. No altera migraciones oficiales,
definiciones de funciones, constraints ni el esquema permanente.

**Procedimiento del ensayo v3 (ejecutado y PASS en QA local):**

Desde la raíz de la rama de este PR, con los tres controles de rehearsal ya realizados:

```powershell
node --test scripts/qa/audit-zaping-files-r2-history.test.cjs scripts/qa/rehearse-issue284-official-data.test.cjs
node scripts/qa/rehearse-issue284-official-data.cjs
```

El script se detiene salvo que:
- El contenedor pertenezca al proyecto Docker `zaping-issue284-rehearsal`.
- La base limpia de rehearsal `zaping_qa` contenga exactamente 54 migraciones terminadas, ninguna R2 y **0 empresas**.
- La BD destino `zaping_issue284_transfer_trial_v3` **NO exista**.

Después:
1. Obtiene del esquema **limpio** la lista permitida de tablas y secuencias, excluyendo `_prisma_migrations` y las 3 tablas R2.
2. Exporta únicamente esos datos desde `zaping_issue284_restore_check` con `pg_dump --data-only -Fc --table`. Inspecciona la lista del archive para confirmar que no contiene el historial ni tablas R2.
3. **Tras validar el SQL exportado**, clona el esquema limpio con `createdb -T zaping_qa` a la sexta base `zaping_issue284_transfer_trial_v3` *en el Docker aislado*. Las bases fallidas v1 y v2 permanecen intactas.
4. Reproduce `pg_restore --data-only --file=-` a SQL; valida de forma estricta el encabezado `search_path` **antes de crear la base**; solo en el SQL importado añade un `search_path` temporal seguro para que las funciones diferidas resuelvan el esquema `public`. Ejecuta `psql --single-transaction -v ON_ERROR_STOP=1`, **sin desactivar triggers ni FKs**. Si falla una dependencia FK u otra verificación, se revierte toda la importación. No usar `--disable-triggers` como bypass.
5. Comprueba exactamente 54 migraciones oficiales y 0 R2, compara recuentos y huellas de todas las tablas oficiales contra el respaldo restaurado, y exige **110 filas** idénticas.

**Si falla:** conservar la sexta base, si se llegó a crear, y todas las bases anteriores; no borrar volúmenes ni datos, revisar el error y ajustar el ensayo en una base nueva. **Un fallo no autoriza deshabilitar restricciones ni modificar QA operativa.**

**Si pasa:** todavía falta asegurar funcionalidad por roles, configuración de usuario y sesiones, y validar las referencias al almacenamiento externo R2 (el dump no contiene el objeto binario) antes del corte de QA. Un ensayo verde **no** cambia ninguna conexión de API/Web.

## Paso 2c — API funcional aislada, SOLO lectura (pendiente de ejecución local)

**Datos recuperados y verificados por el usuario:** la sexta base
`zaping_issue284_transfer_trial_v3` pasó la transferencia atómica: 54
migraciones oficiales, 110 filas idénticas a la restauración histórica y 0
migraciones/tablas R2. Los intentos anteriores v1/v2 y la QA operativa siguen
intactos.

El servicio opt-in `functional-check` del mismo
`docker-compose.qa-history-rehearsal.yml` construye la API NestJS de la
rama actual en un contenedor **sin puertos publicados**, sin acceso a la
red externa (solo `functional-private`, red Docker con `internal: true`).
El PostgreSQL de ensayo se conecta además a esa red; no se comparte la
red o los volúmenes de `zaping-local-qa`.

**Seguridad:** no monta `.qa/api.env`, no utiliza las credenciales JWT,
R2, Postalkit ni correo de QA, no lee `zaping_dev` y no activa proveedores
externos. Solo recibe `.qa/postgres.env` para construir **dentro de su
contenedor** una conexión a
`zaping-qa-postgres:5432/zaping_issue284_transfer_trial_v3`.
El guard de preflight rechaza otro destino, secrets de API o una BD con
historial R2. La API arranca con identidad de inventario **sintética y exclusiva**
(`INVENTORY_AUTHORITY_PROTOCOL=inventory-authority-v1`,
`INVENTORY_RUNTIME_BUILD=issue284-functional-v3`,
`INVENTORY_RUNTIME_ENVIRONMENT=isolated-rehearsal`) para satisfacer
`/health/ready` sin compartir la configuración de QA operativa.
Genera un JWT efímero diferente en cada ejecución, firma
tokens de prueba para los **usuarios ya existentes** en la base aislada
y nunca imprime JWT, email ni contraseñas. Los tokens efímeros no son
válidos contra la QA operativa.

Los controles funcionales son **exclusivamente GET**:
- `health/live`, `health/ready`, `auth/me`, rutas sin credenciales (401).
- Usuarios activos de ADMIN, MANAGER, SALES y WAREHOUSE, límites 403.
- Clientes, productos, compras, recepciones, cotizaciones, ventas y casos
  Healthcare. Compara recuentos retornados por API con Prisma y comprueba
  `companyId` de cada registro visible.
- Rechazo 404 al consultar un cliente del tenant contrario.
- Recuentos de nueve entidades antes/después para verificar que no hubo
  escrituras visibles.

**Ejecución en PowerShell** en la rama del PR #285, después de revisar CI:

```powershell
cd C:\dev\zaping
git pull --ff-only origin fix/issue-284-qa-migration-lineage-audit-20261118
node --test scripts/qa/issue284-api-functional-check.test.cjs
docker compose -f docker-compose.qa-history-rehearsal.yml --profile functional config --quiet
docker compose -f docker-compose.qa-history-rehearsal.yml --profile functional build functional-check
docker compose -f docker-compose.qa-history-rehearsal.yml --profile functional up -d --no-deps zaping-qa-postgres
docker compose -f docker-compose.qa-history-rehearsal.yml --profile functional run --rm --no-deps functional-check
```

La operación `up` puede **recrear el contenedor PostgreSQL aislado de ensayo
para añadirle la red interna**; su volumen `rehearsal-postgres` conserva las
bases. No hay conexión ni puertos compartidos con el PostgreSQL de QA
operativa. **No usar** `down -v` ni `--remove-orphans`.

Resultado esperado:
`PASS: isolated API ready; JWT/RBAC; tenant-scoped customer, products, purchases, receipts, quotes, sales and healthcare reads`.

**Límites de evidencia:** la firma JWT sintética no comprueba login con
contraseñas QA, ni prueba operaciones de escritura, front-end real,
disponibilidad del objeto externo R2 o continuidad de secretos tras un
corte. Antes de cortar QA necesitamos pruebas de login y transacciones en
una copia adicional, verificación de rollback y aprobación expresa. Si el
test falla, **no** cambiar conexiones ni datos de QA operativa: revisar la
salida y el guard fallido.

## Paso 2d — Smoke indispensable de LOGIN y ESCRITURA en copia nueva (pendiente local)

Sin repetir las 48 comprobaciones de lectura. El gate crea exclusivamente
'zaping_issue284_write_trial_v1' en el proyecto aislado
'zaping-issue284-rehearsal', copiando 'zaping_issue284_transfer_trial_v3'.
No modifica v3, QA operativa, ni las bases y respaldos históricos.

Precondiciones: CI verde en HEAD del PR Draft #285, v3 y lectura funcional PASS,
PostgreSQL de rehearsal disponible. Si el destino existe, DETENERSE y no repetir.

El preparador del host valida el nombre y etiqueta del proyecto Docker,
usuario PostgreSQL, 54 migraciones/0 R2, dos empresas, cinco usuarios,
cuatro clientes, siete compras, siete partidas, y ausencia del destino
ANTES de createdb. No acepta otro proyecto, base o destino.

~~~powershell
cd C:\dev\zaping
git pull --ff-only origin fix/issue-284-qa-migration-lineage-audit-20261118
node --test scripts/qa/*.test.cjs
docker compose -f docker-compose.qa-history-rehearsal.yml --profile functional config --quiet
docker compose -f docker-compose.qa-history-rehearsal.yml --profile functional up -d --wait --no-deps zaping-qa-postgres

# Ejecutar UNA SOLA VEZ y únicamente sobre la base nueva
node scripts/qa/prepare-issue284-write-trial.cjs

# Reutiliza la imagen aislada del gate de lectura. Override solo de entrypoint.
docker compose -f docker-compose.qa-history-rehearsal.yml --profile functional run --rm --no-deps --entrypoint node functional-check /issue284-tools/issue284-write-check.cjs
~~~

El runner se limita a la base de escritura, red Docker internal:true, sin
puertos publicados, sin secretos de QA, R2 o correo, y sin proveedores externos.
Genera contraseñas sintéticas (no las imprime) y sustituye SOLO los hashes
de dos usuarios en la copia nueva; la firma JWT de la API es efímera.

Prueba el login real de ADMIN A y usuario B, rechazo de contraseña incorrecta,
crear/leer/actualizar cliente nuevo, bloqueo cross-tenant 403/404,
crear/leer compra con proveedor/producto existentes y partida asociada,
rechazo de proveedor extranjero y aislamiento por empresa.

Final esperado en la COPIA: 2 empresas, 5 usuarios, 5 clientes, 8 compras,
8 partidas; 54 migraciones, 0 R2; recuentos de empresa B intactos.
Se esperan dos líneas PASS y un HOLD del runner.

IMPORTANTE: al usar contraseña y JWT sintéticos, esto NO comprueba continuidad
de claves, sesiones o contraseñas operativas. Si falla, conservar la BD y
detenerse; no repetir, limpiar, borrar ni usar down -v o reset.

## Paso 2e — Rollback del futuro corte (plan documental, NO ejecución)

Previo a la autorización de cambio de QA:
- Respaldo nuevo y restauración de prueba de QA operativa; validar datos y
  evidencia histórica R2 antes de cualquier cambio.
- Registrar destino anterior y candidato, guardando URLs y secretos en
  almacenamiento privado y NUNCA en Issues/logs.
- Definir ventana, responsables y detención de escritores. Ejecutar cambio
  solo con autorización expresa y verificar login con credenciales y JWT
  operativos, health y un flujo sobre la QA candidata.
- Ante fallo, parar escritores y restaurar el destino anterior apuntando a
  la QA preservada; comprobar salud y autenticación. Identificar cualquier
  escritura divergente antes de reintentar. Volver a la QA antigua es una
  recuperación temporal, NO reconciliación de su migración R2.
- Este PR NO realiza el corte ni la reversión.

## Paso 2f — Respaldo operativo RESTAURADO y preflight de corte (19/nov/2026)

**Evidencia local del usuario — PASS:** backup de QA operativa
'zaping_qa_pre_issue284_cutover_20261119_005304.dump', **481726 bytes**,
SHA-256 de la copia local coincidente con el archivo del contenedor,
TOC legible mediante pg_restore --list, restauración exitosa en el proyecto
aislado 'zaping-issue284-rehearsal' bajo la base independiente
'zaping_issue284_backup_restore_trial_v1'. Consultas de solo lectura
confirmaron: **54 migraciones oficiales + 1 R2 histórica = 55**, 2 empresas,
5 usuarios, 14 productos, 7 compras, 5 recepciones, 5 cotizaciones,
3 ventas, 5 casos Healthcare, **110 filas oficiales** y registros
históricos R2 **1/1/3**. Ninguna configuración o DB operativa fue alterada.

La prueba de escritura indispensable también terminó PASS en la **copia
descartable** 'zaping_issue284_write_trial_v1': 31/31 unit tests,
contraseñas sintéticas/login, cliente POST/PATCH, compra POST, RBAC,
cross-tenant 403/404, recuentos finales 5 clientes y 8 compras/partidas.
NO reutilizar esta copia para poblar candidata (contiene escritura de prueba).

**Siguiente paso: SOLO lectura**. Se añadió el preflight de corte:
'scripts/qa/issue284-cutover-preflight.cjs'. Compara identidad exacta de
ambos proyectos Docker y sus usuarios/base, **55 vs 54 migraciones** con
única R2 histórica extra, ausencia/presencia de las 3 tablas R2,
**57 tablas oficiales** y sus recuentos+huellas MD5 de cada fila (v3
versus QA operativa), total 110, registros R2 1/1/3 y **ausencia**
del nombre candidato 'zaping_qa_official_candidate_v1' en el proyecto
operativo. Todos los SELECT usan PGOPTIONS con sesiones read-only.

~~~powershell
cd C:\dev\zaping
git pull --ff-only origin fix/issue-284-qa-migration-lineage-audit-20261118
node --test scripts/qa/*.test.cjs
node scripts/qa/issue284-cutover-preflight.cjs
~~~

Esperado: 3 líneas PASS y 1 HOLD. Si falla, NO avanzar. Puede indicar
cambios reales después del respaldo o discrepancias en la identidad
de entornos: documentar antes de crear una candidata. El script NO crea
bases, NO copia datos, NO modifica secretos, API/Web ni migraciones.

**Diseño del paso POSTERIOR, sujeto a autorización expresa:**
- Pausar escritores QA y proteger/restaurar el respaldo actualizado.
- Crear una BD nueva exclusivamente dentro del PostgreSQL operativo:
  'zaping_qa_official_candidate_v1', sin sobrescribir 'zaping_qa'.
- Copiar SOLO los 57 objetos/tablas oficiales y sus 110 filas desde
  la v3 inmutable con transporte revisado, preservar constraints/triggers,
  y garantizar 54 migraciones oficiales y 0 R2 en la candidata.
  No trasladar el historial experimental ni el objeto R2 (soft-deleted,
  NOT_SCANNED) a la candidata. Guardar su evidencia en la original/dump.
- Validar claves/secretos de acceso, login real, integridad, endpoints,
  multiempresa y conectividad de API/Web antes de cambiar DATABASE_URL.
- Tras consentimiento explícito, ajustar configuración privada de
  QA únicamente a la candidata en una ventana con rollback definido.
  No tocar zapping_dev, producción, R2 externo ni tokens publicados.

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
- [x] Transferencia a la sexta BD de ensayo v3: 110 filas oficiales, huellas coincidentes, 54 migraciones, 0 R2.
- [x] Smoke funcional API aislada: 48 checks JWT/RBAC, tenant A/B, Clientes, Compras, Recepciones y Healthcare (salida local PASS).
- [x] Login real sintético y escritura mínima verificados en copia aislada (salida local PASS; no continuidad de secretos operativos).
- [x] Respaldo QA actualizado restaurado en Docker de ensayo y recuentos verificados.
- [ ] Preflight read-only de corte en host local (57 huellas/identidades).
- [ ] Política de preservación de datos y autorización de corte definidas.
- [ ] Corte hacia BD QA de `main` completado y pruebas de regresión PASS.
- [ ] Cerrar issue #284 solo después de comprobar que la QA activa no posee
      migraciones aplicadas ausentes de las fuentes oficiales.
