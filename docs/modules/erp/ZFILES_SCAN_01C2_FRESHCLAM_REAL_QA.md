# ZFILES-SCAN-01C2 — FreshClam real y revisión de firmas UTC en QA

**Estado:** parche para revisión, SIN activación ni ejecución real todavía.
**Base autoritativa:** `qa/integration` SHA `e238e8b7b5fa6fde748d11456c560ff1d59ad204`, CI #43128214688 PASS 4/4.
**Referencias:** PR histórico #220 (cerrado sin merge), 01B run #43087728587 y 01C1.

## Decisión y objetivo

Ejecutar **una sola actualización FreshClam real** en un runner Linux descartable, arrancar un clamd aislado *después* de ella y aplicar el `ClamAvReadinessProbe` ya integrado a la respuesta real `PING/VERSION` y al reloj UTC del runner.

- Imagen oficial `clamav/clamav-debian` por digest SHA-256 fijo demostrado en 01B, con pin explícito del motor `1.5.4`. Fallar si la identidad/versionado no coincide; no usar `stable` como fallback.
- Docker volume exclusivo con firma oficial presembrada desde la imagen, evitando descarga inicial de bases enteras siempre que sea posible. Un updater `--network bridge`, sin credenciales ni workspace, ejecuta `freshclam --stdout` **una vez**. Al fallo no reintentar ni cambiar de mirror o digest automáticamente.
- Montar `/var/log/clamav` como tmpfs escribible, debido al diagnóstico histórico del PR #220. Capturar la salida a un archivo efímero sin publicarlo en GitHub Actions; limpiar al final.
- Iniciar clamd con `--network none`, con `TZ=UTC`, `CLAMAV_NO_FRESHCLAMD=true`, sin puertos publicados. Compartir un volumen nuevo para el socket Unix y comprobar permisos exactos.
- Cliente Node separado con `--network none`, permisos mínimos, sin R2/PostgreSQL, que valida vigencia **máxima 48 h**, desviación futura máxima 5 min, `1.5.4` permitido, resultado `attested:false`, archivos PDF/JPEG sintéticos `CLAMD_OK_UNATTESTED`, EICAR `MALWARE_DETECTED`, firmas caducadas rechazadas y socket inexistente fail-closed.

## Activación (NO ejecutar en este incremento)

El workflow `.github/workflows/zfiles-clamav-freshclam-qa.yml` se registra sólo en la rama `qa/integration`, con rutas limitadas y `contents: read`. Los pushes ordinarios omiten el job. Para el **único intento revisado** se requiere un commit posterior con:

`[run-zfiles-freshclam-qa]`

Ese commit debe además modificar alguna ruta observada por el workflow. **No añadir el marcador durante revisión o pruebas locales.** Antes de activarlo: CI API/Web/Historical/Agents PASS sobre el primer commit, revisión del workflow, del digest y de recursos efímeros, y autorización humana del intento. No usar re-run de GitHub Actions para eludir el control.

## Interpretación de resultados

`FreshClam exit 0` no prueba por sí solo una actualización efectiva: puede significar que ya existían bases recientes. La condición operativa del ensayo es que `clamd`, iniciado después, reporte una revisión de firmas reciente mediante VERSION y la use para EICAR/archivos sintéticos. Un PASS no acredita procedencia criptográfica independiente, una firma de worker, escaneo de objetos R2 reales, protección contra todos los malware ni autorización `AVAILABLE`.

**Un fallo de FreshClam, limitación CDN, 403/429, incompatibilidad, permisos, socket, versión, caducidad, EICAR o timeout implica BLOCKED. No hacer retry automático.** El updater puede salir por bridge a Internet sin control de destino FQDN: esto sólo se permite en QA descartable sin secretos; producción requiere control de egress/proxy, persistencia y monitorización de bases.

## Exclusiones y protección del repositorio

No tocar `main`, `zaping_dev`, `zaping_qa`, volúmenes y respaldos locales, buckets R2, secretos, usuarios ni datos INSAP. Sin rutas HTTP, migraciones, roles SQL, promoción, descarga o cambio de estado a `AVAILABLE`.

## Verificación local antes del commit

```powershell
Set-Location C:\dev\zaping\app\api
npx --no-install prettier --write 'test/zfiles-clamav-freshclam.qa.e2e-spec.ts'
npm run typecheck
npm run lint:check
Set-Location C:\dev\zaping
git diff --check
```

La suite E2E real queda `describe.skip` sin el flag CI de laboratorio; no correrla en Windows. Revisar también el workflow YAML y documentar el SHA exacto de la ejecución cuando se active.

## Fuentes

- https://docs.clamav.net/manual/Installing/Docker.html
- https://docs.clamav.net/manual/Usage/SignatureManagement.html
- https://docs.clamav.net/faq/faq-freshclam.html
- https://github.com/gclp96/Zaping/pull/220

## Activación puntual SCAN-01C2 — 12/11/2026

**Autorización:** un solo intento de laboratorio FreshClam, solicitada al continuar el ticket tras CI 4/4 PASS del SHA `78cab91346b02b56a88677c82d5b6ffc0a65150f` (run #43269200703).

- El commit disparador contiene `[run-zfiles-freshclam-qa]` y modifica únicamente este documento vigilado por el workflow.
- El workflow debe ejecutar un solo proceso FreshClam con el digest fijo, sin credenciales R2/PostgreSQL ni datos reales; el motor y el cliente quedan sin acceso a red.
- GitHub Actions no debe reintentarse manualmente ni repetirse mediante otro commit sin revisión expresa. Ante 403, 429, permisos, error de red, versión o vigencia: **BLOCKED**, no cambiar imagen, espejo ni condiciones para obtener PASS.
- El reporte final debe referenciar el commit y los identificadores exactos de CI/laboratorio, incluyendo las pruebas sintéticas y la limpieza de recursos.
- Esta autorización **no habilita** uploads, descargas, promoción a `AVAILABLE`, despliegue ni merge a `main`. La evidencia del laboratorio mantiene `attested: false`.
