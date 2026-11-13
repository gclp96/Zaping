# ZFILES-SCAN-01F2 — Lectura R2 y escaneo ClamAV integrados (QA real)

**Estado inicial:** prueba E2E *opt-in* preparada; sin ejecución real ni aprobación de integración hasta disponer de Linux efímero revisado.
**Base:** `qa/integration` `b9bf831a676b349eebcb22c448be016b6d420261`; CI #43330767638 PASS 4/4.

## Propósito y alcance

Probar **una sola vez**, sobre un host Linux descartable, el flujo completo ya implementado en SCAN-01F1: cliente S3 con token QA de lectura -> `GetObject` con `If-Match` -> longitud y SHA-256 -> `clamd` local vía socket Unix y `INSTREAM` -> nueva comprobación de `PING/VERSION`. El resultado positivo **solo puede ser** `CLAMD_OK_UNATTESTED`, nunca una autorización `AVAILABLE`.

### Fixture fija

- Bucket exclusivamente de QA: `zaping-quarantine-qa`.
- Clave: `quarantine/2a4c5d3a-0f66-42e9-8d74-eea7c80bb762/597d19d0-bef3-4451-aacb-9db7b4e792e3/213af81c-fb81-402f-947f-e3e2de0077cd`.
- Tamaño 73 B; SHA-256 `db8d51154a91568c291fe1e84c8fe9d56ebe858742b41dfea8419ab266eec679`.
- ETag fuerte `"b9f6aafd18e3e5fe4dc37577f4b2c124"`.
- El objeto tiene `application/octet-stream`; su nombre es el UUID sin extensión. Es una prueba sintética, NO un certificado médico ni un PDF comercial validado.

### Gates obligatorios antes del primer intento real

1. Ubuntu/Linux **efímero, separado de Windows, producción, `zaping_dev` y `zaping_qa`**; usuario sin root y revisión de permisos del socket; hora UTC fiable.
2. `clamd` **sin puertos publicados ni conectividad a Internet**; socket Unix privado. Firmas descargadas por un actualizador aislado, siguiendo SCAN-01C2, sin token de R2 en ese contenedor. Motor autorizado `1.5.4`, base de firmas ≤48h y desviación futura ≤5 min. Una caída, desactualización, EICAR no detectado o revisión de firmas cambiante = BLOCKED.
3. Únicamente el proceso cliente puede salir por HTTPS al endpoint R2 de la cuenta QA. Restringir egress con reglas de red independientes; el script **no puede certificar** ese aislamiento. No introducir credenciales antes de cerrar ese gate.
4. Token S3 `Object Read only` restringido al bucket de cuarentena QA, tal como comprobó el usuario en Cloudflare; no montar credenciales en volúmenes, no escribir `.env`, logs, archivos temporales ni GitHub Secrets. Las credenciales pueden introducirse de forma interactiva en una subshell efímera, sin eco ni historial.
5. Trabajo aprobado para el SHA exacto revisado. `CI` y `GITHUB_ACTIONS` deben estar **ausentes**, no solo en `false`. No ejecutar en GitHub Actions: el arnés de SCAN-01F1 lo rechaza explícitamente.
6. No modificar ni sustituir la fixture en R2; el ETag y SHA deben coincidir con el manifiesto ya revisado. Ante un cambio o 403/404/412: detener y documentar, sin modificar el manifiesto para forzar el PASS.

### Variables para el proceso E2E (Linux, NO PowerShell)

- `RUN_ZFILES_R2_CLAMAV_LIVE_QA=1` y `ZFILES_SCAN_01F2_REVIEWED=1` **solo después de aprobar gates 1–6**.
- `TZ=UTC`, `R2_ACCOUNT_ID` (32 caracteres hexadecimales), `R2_JURISDICTION=default`.
- `R2_PRIVATE_BUCKET=zaping-private-qa`, `R2_QUARANTINE_BUCKET=zaping-quarantine-qa`.
- `R2_QUARANTINE_SCAN_READ_ACCESS_KEY_ID`, `R2_QUARANTINE_SCAN_READ_SECRET_ACCESS_KEY` del token QA exclusivamente de lectura.
- `CLAMD_SOCKET` debe apuntar al socket Unix real y privado (por ejemplo `/run/zaping-clamd/clamd.sock`).
- **Prohibidas** variables `R2_QUARANTINE_WRITE_*`, `CI`, `GITHUB_ACTIONS` y variables ambientales AWS/Cloudflare de otros sistemas.

Para ejecutar **solo esta suite** después de la revisión operativa, desde `app/api` en Linux:

```bash
./node_modules/.bin/jest --config ./test/jest-e2e.json --runInBand --no-cache \
  test/zfiles-r2-clamav-live.qa.e2e-spec.ts
```

No incluir valores de secretos en el comando, en la historia del shell, en un `.env`, en logs ni en captura. Comprobar `npm ci` antes de introducir credenciales. No ejecutar en Windows ni reutilizar las credenciales en CI.

## Qué constituye PASS

- Un solo GET condicional con ETag exacto; stream de 73 bytes y SHA-256 correcto, antes del escaneo.
- `PING/VERSION` real antes y después; versión 1.5.4 y revisión de firmas estable y reciente (máximo 48h).
- Un único resultado `CLAMD_OK_UNATTESTED`, con `attested: false` en readiness; sin invocación de PUT/COPY/DELETE ni SQL.
- Sin credenciales en salidas, limpieza de recursos efímeros, sin exponer el socket ni permitir descarga pública.

Cualquier otro resultado, firma caducada, pérdida de socket, discrepancia de objeto, error de red o token = **BLOCKED**. No reintentar automáticamente y no cambiar el digest, la edad máxima o el manifiesto para conseguir PASS.

## Riesgos que esta prueba NO resuelve

Identidad verificable del worker; prevención de repetición de trabajos; auditoría/firmas de evidencia; inmutabilidad del objeto después de escanear; antivirus de producción; autorización multiempresa en base de datos; protección TOCTOU de promoción; `AVAILABLE` y descargas. La fixture mínima tampoco demuestra sanitización documental ni validación semántica de PDF.

**Sin cambios** en `main`, endpoints, módulos NestJS, R2, PostgreSQL, Docker local, usuarios o permisos. Este incremento crea únicamente E2E opt-in y este contrato.
