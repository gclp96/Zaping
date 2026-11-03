# ZFILES-R2-03B2 — ClamAV real aislado, sin R2

**Issue:** #211. **Base:** ZFILES-R2-03B1 PR #210. **Estado:** Draft / laboratorio.

## Objetivo

Probar en un runner Linux descartable el cliente `ClamAvInstreamScanner` del incremento 03B1 contra el **clamd real**, usando únicamente archivos sintéticos en memoria. Este gate no publica archivos, no consume datos de INSAP ni habilita la interfaz de Zaping Files.

## Prueba real

- Un contenedor `clamav/clamav-debian:stable` incluye firmas antivirus **preinstaladas** y ejecuta `clamd` con un socket Unix compartido (`/tmp/clamd.sock`). No publica puertos y se ejecuta con `--network none`, límites de memoria 4 GiB, CPU y procesos.
- La aplicación de prueba corre como **otro contenedor** `node:24-bookworm-slim`, con `--network none`, `--read-only`, sin capacidades Linux, sin privilegios adicionales, con workspace y socket de solo lectura. No recibe secretos, credenciales R2, DB, ni token de GitHub.
- Se ejecuta el **mismo adaptador TypeScript** de la rama 03B1, no un cliente de protocolo alternativo, y se comprueba:
  1. `PING` y `VERSION` verdaderos antes y después de escanear. Se comprueba formato, revisión de DB no vacía y estabilidad durante este ensayo.
  2. PDF sintético y JPEG sintético → `CLAMD_OK_UNATTESTED`, jamás `AVAILABLE`.
  3. Firma inofensiva **EICAR** generada solo en memoria → `MALWARE_DETECTED`; no se publica la firma identificada.
  4. Socket ausente → error y rechazo sin resultado limpio.
  5. Entradas vacías o >10 MiB → rechazo.
- El test real se ejecuta **solo** cuando `RUN_ZFILES_CLAMAV_REAL_QA=1` en el workflow de esta rama, con Linux/CI/ubicación exacta de socket. El CI API habitual lo omite sin reclamar evidencia real.
- El workflow limpia siempre contenedor y socket local. No hay R2 PUT, R2 GET ni cambios en PostgreSQL/Prisma.

## Lo que NO demuestra

- La imagen con firmas preinstaladas se arranca **sin red** y con FreshClam deshabilitado: **no** acredita vigencia actual ni procedencia criptográfica de firmas. `VERSION` solo constata revisión cargada y consistencia del proceso durante el ensayo.
- La etiqueta de imagen `:stable` es móvil. CI imprime el digest resuelto para seguimiento; antes de desplegar un escáner operativo habrá que fijar digest, validar versiones soportadas y establecer una política de actualización de firmas.
- Que ClamAV diga `OK` no equivale a evidencia firmada, ni a una garantía absoluta de ausencia de malware.
- **No** prueba todavía lectura desde R2, aislamiento entre tenants, credencial scanner Object Read only, jobs de un solo uso, identidad del worker, roles no-owner de PostgreSQL ni promoción de cuarentena a privado.

## Próximos gates

1. Conectar el escáner en QA usando una identidad **solo lectura para `zaping-quarantine-qa`**, no el token RW de nuestro primer laboratorio.
2. Verificar bytes reales SHA-256/tamaño de R2 contra una identidad de job confiable y activar comprobación de readiness antes/después con firmas frescas y cadena de suministro verificadas.
3. Firmar y verificar evidencia de resultado vinculada a Company, documento, adjunto, nonce y sha; auditar bajo roles SQL separados con privilegios positivos mínimos.
4. Solo tras lo anterior y posterior relectura del objeto privado, preparar transición atómica a `AVAILABLE` en un incremento explícitamente aprobado.

## Fuentes

- [ClamAV ClamD protocol — INSTREAM](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
- [ClamAV Official Docker](https://docs.clamav.net/manual/Installing/Docker.html)
- Históricos #154 (INSTREAM), #155 (ClamAV real), #158 (readiness), #162 (worker firmado), #166 (roles SQL negativos).
