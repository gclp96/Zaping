# ZFILES-R2-03B5 — FreshClam auténtico y ClamAV con reloj real (QA una sola vez)

**Issue:** #219 · **Base:** PR #218 → #215 → #212 → #210 (Draft apilados) · **Estado:** laboratorio, no funcionalidad ERP.

## Alcance

Se mantienen los módulos ClamAvReadinessProbe de 03B4 y ClamAvInstreamScanner de 03B1/03B2. Se intenta probarlos contra clamd real **después** de una actualización auténtica con FreshClam y el reloj UTC actual del runner, no la fecha ficticia usada en 03B4.

- Imagen oficial clamav/clamav-debian por digest concreto recuperado del laboratorio B2: sha256:c21aa18cc0a358678255a3dfb343a4555b58f71b97d7b869df8fdf7ea0a5b4b1; el motor debe ser **exactamente 1.5.4** o detenerse.
- Sembrar firmas incluidas en la imagen fijada para reducir descargas; no usar imagen _base vacía.
- **Actualizador separado**: único contenedor con red Docker bridge, sin tokens de Cloudflare, variables AWS, bases de datos ni repositorio; FreshClam se ejecuta una sola vez, sin reintentos. Fallo de descarga / 429 / 403 / timeout implica FAIL/BLOCKED.
- **Clamd separado**: arranca después de FreshClam con --network none, sin puertos expuestos, directorio de firmas preparado y TZ=UTC; socket Unix local.
- **Cliente**: Node separado, --network none, --read-only, sin capacidades, workspace y socket de sólo lectura. Jest verifica PING/VERSION y antigüedad máxima **48h** contra reloj real; PDF/JPEG sintéticos dan sólo CLAMD_OK_UNATTESTED; EICAR de prueba da MALWARE_DETECTED; daemon ausente y política caducada fallan cerrado; misma revisión pre/post.

## Activación única

El workflow no usa workflow_dispatch porque una rama nueva no está registrada como workflow en main. Usa un **push sólo en rama 03B5** con condición explícita de mensaje de commit:

    [run-zfiles-b5-freshclam-once]

Sin esa marca el job se omite. No hay eventos pull_request ni schedule en el workflow dedicado. CI general API/Web/Historical sí se ejecuta sin contactar FreshClam. Ejecutar el marcador **únicamente** tras revisión de código y checks normales. No repetir automáticamente cuando haya rate limits del CDN.

## Interpretación de la evidencia

Un PASS completo probaría una ejecución correcta de FreshClam, clamd auténtico con firmas de fecha reciente medida contra reloj real, EICAR detectado, PDF/JPEG sintéticos sin hallazgo y continuidad pre/post. Un retorno de FreshClam sin nuevos bytes descargados sólo es aceptable si clamd informa una base reciente.

**No certifica** procedencia criptográfica independientemente verificada, identidad del worker, firma de evidencia, inmutabilidad del objeto, ni escaneo R2 real. No demuestra detección de todo malware. Los resultados quedan attested:false y CLAMD_OK_UNATTESTED; no permiten AVAILABLE ni descargas.

La red del updater es bridge y no está limitada por FQDN; para producción harán falta política egress/proxy, almacenamiento persistente de firmas, control de tasa y observabilidad. El digest fijo mejora reproducibilidad, pero no equivale a atestación independiente de firma de imagen.

## Prohibiciones y pendientes

Sin tokens R2, PostgreSQL, .env, paquetes INSAP, documentos reales, endpoints, promoción, borrado, descargas, SQL, firma de evidencia ni merge automático. Falta la credencial de solo lectura cuarentena verificada, versión exacta del objeto y job/no-replay, worker firmado, roles SQL mínimos, promoción segura y reconciliación con main (PR #214 de agentes). El PR sigue Draft.

## Fuentes

- https://github.com/Cisco-Talos/clamav-docker/blob/main/clamav/README-debian.md
- https://docs.clamav.net/faq/faq-freshclam
- https://docs.clamav.net/manual/Usage/ClamdProtocol.html
