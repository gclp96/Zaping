# ZFILES-SCAN-01A — ClamAV real aislado para QA

**Estado:** propuesta de implementación para revisión; prueba real NO ejecutada.
**Base de código observada:** `qa/integration` remoto `c6ffc331c5e776e04f78e68aa2025aa362a8fa92`, más commits locales informados `4392950` y `e188d0a`.
**Origen selectivo:** PR histórico #212 (cerrado sin fusionar) y cliente INSTREAM ya integrado mediante PR #210.

## Propósito y límites

Se reutiliza `ClamAvInstreamScanner` para probar contra `clamd` auténtico y sin R2/SQL:

- `PING` y `VERSION` verdaderos por socket Unix; versión consistente antes/después.
- PDF y JPEG sintéticos retornan solo `CLAMD_OK_UNATTESTED`.
- EICAR estándar armado exclusivamente en memoria devuelve `MALWARE_DETECTED`.
- Socket inexistente falla cerrado.
- Buffer vacío y tamaño mayor a 10 MiB son rechazados antes del análisis.

**Un PASS de 01A no certifica frescura de firmas, cobertura antimalware, integridad R2, procedencia de la imagen ni capacidad de publicar archivos.** No crear transición `AVAILABLE`, rutas HTTP, objetos R2 ni permisos PostgreSQL a partir de esta prueba.

## Infraestructura aislada

El workflow `.github/workflows/zfiles-clamav-isolated-qa.yml`:

- Corre solo en pushes a `qa/integration` que modifiquen rutas de este incremento y cuya **última confirmación** contenga exactamente `[run-zfiles-clamav-qa]`. Sin marcador el job se omite. No tiene programación periódica ni control de agentes.
- Usa imagen `clamav/clamav-debian` por digest histórico **que debe revalidarse**. El daemon no tiene red y no publica TCP; FreshClam automático está desactivado en 01A.
- Comparte un volumen *nuevo y exclusivo de la ejecución* con un cliente Node aislado sin red y con workspace de solo lectura. No monta `zaping_dev`, `zaping_qa`, volúmenes antiguos, credenciales ni R2.
- Al finalizar intenta retirar **solo** su contenedor y volumen efímeros. El digest se debe revisar antes de activar; no arrastrar versiones históricas a producción.
- No hace push, commit, merge, deploy, ni invoca ClamAV fuera del runner.

## Secuencia de validación

1. Revisar el parche y su alcance sobre `qa/integration`; `git diff --check`.
2. Ejecutar localmente los tests de protocolo existentes con Jest, además de TypeScript y ESLint. El E2E real se salta sin opt-in.
3. Revisar seguridad del workflow, sobre todo privilegios, digest, volumen y ausencia de secretos.
4. Registrar commit local **sin el marcador de opt-in**, mantener sin push hasta autorización humana.
5. Después de autorizar un push deliberado de prueba, registrar el identificador exacto de SHA/CI, inspeccionar Docker readiness, resultados y limpieza del volumen.
6. Cualquier fallo de imagen, socket, EICAR, motor, timeout o autorización implica BLOCKED; no inventar PASS.

### Comandos de verificación local (PowerShell)

```powershell
Set-Location C:\dev\zaping\app\api
npm test -- --runInBand zfiles-clamav-instream-lab.spec.ts
npm run typecheck
npm run lint:check
```

**No ejecutar `RUN_ZFILES_CLAMAV_REAL_QA=1` en Windows ni en la máquina del usuario:** el E2E requiere un contenedor Linux sin credenciales, y el flag del laboratorio no habilita el escáner productivo.

## Próximas dependencias para ZFILES-SCAN-01B / release

- Recuperar selectivamente `ClamAvReadinessProbe` de PR #218 y corregir/acotar la operación de FreshClam de PR #220 (los intentos históricos no constituyen QA aprobado).
- Pin/versionado, verificación de procedencia y firmas recientes del motor antes y después de cada escaneo.
- Worker aislado con lectura exacta de cuarentena, SHA-256, nonces, evidencia firmada, permisos SQL mínimos y reconciliación.
- Aislamiento por empresa, veto a reintentos inseguros, copia privada verificable y descarga autenticada solamente tras una transición auditable.

## Referencias

- [Protocolo ClamD INSTREAM](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
- [Imagen ClamAV Debian oficial](https://github.com/Cisco-Talos/clamav-docker/blob/main/clamav/README-debian.md)
- [PR #212](https://github.com/gclp96/Zaping/pull/212)
- [PR #220](https://github.com/gclp96/Zaping/pull/220)

## Activación puntual ZFILES-SCAN-01B (2026-11-11)

**Alcance:** un intento aislado en GitHub Actions para validar clamd real con archivos sintéticos. Este registro de autorización no cambia código productivo, credenciales, bases de datos ni despliegues.

- Base remota previa: `7761858b83e43710c5e909b79cad7c31efca5a35`, CI API/Web/Historical/Agents 4/4 PASS en run 43085134756.
- Se activa únicamente mediante el marcador de commit `[run-zfiles-clamav-qa]` y este cambio de documentación vigilado por el workflow.
- Imagen por digest histórico fijado en el workflow; el runner debe verificar disponibilidad mediante `docker pull`. Ante error de imagen, socket, PING/VERSION, PDF/JPEG o EICAR: FAIL/BLOCKED, sin cambio automático de digest ni reintento automático.
- No hay R2, PostgreSQL, secretos, red en los contenedores de daemon/cliente, endpoints HTTP ni transición `AVAILABLE`. Los resultados `CLAMD_OK_UNATTESTED` nunca permiten publicar.
- Un PASS de laboratorio NO avala frescura de firmas, certificación de PDF, procedencia verificable ni despliegue. El gate de FreshClam/firmas recientes permanece pendiente.
- Registrar SHA del commit disparador, workflow run, resultado de cada step y limpieza de recursos efímeros. No repetir la activación sin nueva revisión humana.
