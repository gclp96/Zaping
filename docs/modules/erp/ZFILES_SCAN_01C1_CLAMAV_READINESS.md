# ZFILES-SCAN-01C1 — Control offline de ClamAV PING/VERSION

**Estado:** parche propuesto para revisión y pruebas locales; no integrado, no desplegado.
**Base remota revisada:** `qa/integration` SHA `9ac922c27fef55bf448a8f2d7d70fd2896e2680b`.
**Origen:** recuperación selectiva de `ClamAvReadinessProbe` del PR histórico #218; NO cherry-pick del stack.

## Alcance

- Se agregan `ClamAvReadinessProbe` y `evaluateClamAvVersion` como utilidades aisladas no registradas en NestJS.
- PING y VERSION se consultan por socket local. La respuesta VERSION se comprueba con versión de engine explícita, revisión positiva, fecha UTC real, día de la semana, edad máxima y tolerancia de reloj futuro.
- La política de ejemplo permite solo el motor `1.5.4` y firmas con 48 horas máximas de antigüedad **en pruebas sintéticas**. No es un pin productivo ni garantiza que ese motor esté actualizado o soportado actualmente.
- Toda respuesta válida continúa con `attested: false`; no crea estado CLEAN ni AVAILABLE.
- Se prueba únicamente con protocolo simulado sobre un socket local; no usa R2, PostgreSQL, archivos de cliente ni FreshClam.
- Los tests tienen ruta de socket distinta en Windows para que la suite no requiera Docker local.

## Límites y gates

`VERSION` no incluye zona horaria ni prueba origen/autenticidad de firmas. Que se interprete una fecha como UTC presupone que el daemon fue configurado realmente en UTC y que el reloj de QA es confiable. Una versión reciente del motor tampoco demuestra que el archivo sea seguro.

Este slice **NO conecta** el probe al flujo de cuarentena, escaneo ni promoción. Se necesita un incremento independiente para verificar FreshClam real con control de frecuencia, manejo de errores y proveniencia; los ensayos históricos de PR #220 no constituyen PASS nuevo.

## Verificaciones locales

Desde `C:\dev\zaping\app\api`:

```powershell
npm test -- --runInBand zfiles-clamav-readiness-lab.spec.ts
npm run typecheck
npm run lint:check
```

Luego, desde la raíz del repositorio: `git diff --check` y revisión explícita del parche. No hacer push/merge/deploy automático; los directorios `output/` y `tmp/` permanecen intactos.

## Pruebas de aceptación

- Motor fuera de allowlist, revisión cero, fecha inválida, día incorrecto y respuestas ambiguas: fallo cerrado.
- Base con más de 48 horas y tiempo futuro fuera de margen: fallo cerrado.
- Falta de socket, PING incorrecto o VERSION ausente: fallo cerrado.
- Sin endpoints, proveedores Nest, dependencias, nuevos permisos, migraciones ni cambios Docker.
- El siguiente slice 01C2 evaluará FreshClam auténtico y firmas realmente recientes, con firma/seguridad y límites de red revisados.

## Referencias

- https://docs.clamav.net/manual/Usage/ClamdProtocol.html
- https://docs.clamav.net/manual/Usage/SignatureManagement.html
- https://docs.clamav.net/faq/faq-freshclam.html
- https://github.com/gclp96/Zaping/pull/218
- https://github.com/gclp96/Zaping/pull/220
