# ZFILES-R2-03B4 — ClamAV readiness (Unix PING/VERSION, laboratorio)

**Issue:** #217 · **Base:** PR #215 (Draft) · **Estado:** Laboratorio aislado, sin despliegue, sin merge.

## Objetivo

Sustituir el `readiness` exclusivamente simulado de 03B3 por un comprobador compatible con su interfaz: `ClamAvReadinessProbe`, basado en el prototipo histórico de PR #158. Se conecta a un **socket Unix local** y solicita `zPING\0` / `zVERSION\0` en conexiones independientes, sin exponer TCP. La verificación pre/post del 03B3 debe seguir fallando cerrado ante cambios de engine/revisión/fecha/política.

## Política temporal de QA

- Motor permitido mediante una lista explícita de versiones exactas (no wildcard automático). No se seleccionan versiones dinámicamente para autorizar producción.
- Respuesta VERSION estricta: `ClamAV X.Y.Z/revision/Ddd Mmm dd HH:mm:ss YYYY`. Se valida revisión positiva, calendario real y día de semana.
- Rechazar firmas reportadas como anteriores al umbral configurado o con fecha demasiado futura, reloj inválido, respuesta parcial, socket desconectado, comando no reconocido o timeout. Ejemplo **solo laboratorio**: antigüedad máxima 48 horas, skew máximo 5 minutos.
- El daemon debe operar en **UTC** y el proceso de QA tener reloj UTC sincronizado; TZ se impone como contrato de despliegue (no puede inferirse de VERSION). Un campo `daemonTimeZone: 'UTC'` en la política no acredita por sí solo la configuración del daemon.
- `attested:false` en toda respuesta: una base de firmas con fecha aparentemente reciente **no garantiza** procedencia, integridad criptográfica ni `freshclam` exitoso.

## Pruebas

- Tests unitarios sin red prueban VERSION válido, motor fuera de allowlist, base caducada, reloj futuro, fechas inválidas, política inválida, desconexión y timeout.
- Fake daemon sobre **socket Unix real** para demostrar `zPING` y `zVERSION`, junto a una llamada a `scanVerifiedQuarantineQaObject` de 03B3 con bytes **sintéticos en memoria** y `GetObject` falso. Se exige orden pre → GET/verificación hash → scan → post.
- El test combinado usa una **hora de evaluación sintética** respecto a la fecha de la base de ejemplo. No demuestra frescura el 03-nov-2026 ni actualizaciones de firmas recientes; tampoco ejecuta `clamd` genuino en este nuevo incremento.
- CI general (API/Web/PostgreSQL histórico) deberá pasar sobre SHA exacto del PR. No almacenar ni registrar archivos reales.

## Bloqueantes posteriores

1. Ejecutar probe de B4 contra **ClamAV auténtico** con firmas realmente actualizadas, reloj UTC real y política revisada, aparte de la prueba de formato/daemon offline de B2.
2. Diseñar FreshClam controlado, actualización oficial y validación operativa de su resultado, procedencia y sincronización de base cargada en `clamd`. Registrar historial sin revelar firmas, contenidos o secretos.
3. Fijar digest de imagen de daemon, credencial R2 QA `Object Read` exclusiva de cuarentena, prueba real de privilegios negativos e identidad de worker.
4. Añadir job firmable/no replay, ledger/auditoría, rol PostgreSQL scanner no-owner con permisos positivos mínimos; sólo después discutir promoción segura a `AVAILABLE` en PR separado.

## Prohibiciones

Sin credenciales ni Cloudflare R2 real, PostgreSQL/Prisma, endpoints, descarga, auditoría productiva, habilitar `AVAILABLE`, promoción/copia/borrado, clamd real productivo o merge automático. Este probe nunca autoriza por sí mismo una liberación de adjunto.

## Referencias oficiales

- https://docs.clamav.net/manual/Usage/ClamdProtocol.html
- https://docs.clamav.net/manual/Usage/SignatureManagement.html
