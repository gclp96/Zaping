# ZFILES-SCAN-01F1 — Conexión R2 + ClamAV (QA aislado)

**Estado:** parche aditivo para pruebas locales; NO es un escáner productivo ni un permiso de publicación.
**Base remota revisada:** `qa/integration` SHA `e2e488b0768083c584b5493ea622b462e6f16491`; CI #43278726551 PASS 4/4.

## Evidencia previa (no repetida por este parche)

- Usuario confirmó token Cloudflare S3 **Object Read only**, bucket único `zaping-quarantine-qa`.
- HEAD/GET reales de la fixture sintética (73 bytes) pasaron; ETag exacto y SHA-256 verificados por la prueba manual local.
- ClamAV 1.5.4 + FreshClam con vigencia <48h pasaron en laboratorio GitHub Actions: #43271729810 (5/5 E2E).
- SCAN-01D validó con mocks ETag/ContentLength/SHA256, pre/post readiness y rechazo fail-closed (11/11).

**Importante:** ninguna de esas pruebas prueba todavía el flujo R2 real -> ClamAV real de punta a punta. Este incremento valida el cableado con transporte simulado, NO vuelve a correr R2/ClamAV en red.

## Alcance 01F1

1. Añadir un runner independiente que construye el cliente S3 `GetObject` (credenciales explícitas, `maxAttempts:1`) y los adaptadores reales `ClamAvReadinessProbe`/`ClamAvInstreamScanner`.
2. Reusar íntegramente `scanVerifiedQuarantineQaObject` de 01D para ETag condicional, SHA-256/tamaño y orden pre/scan/post.
3. Fijar **una sola fixture sintética** previamente cotejada: `quarantine/2a4c5d3a-0f66-42e9-8d74-eea7c80bb762/597d19d0-bef3-4451-aacb-9db7b4e792e3/213af81c-fb81-402f-947f-e3e2de0077cd`, 73 B, SHA-256 y ETag constantes.
4. Exigir flag `RUN_ZFILES_R2_CLAMAV_LIVE_QA=1`, `TZ=UTC`, contexto NO CI, buckets QA exactos y credenciales exclusivas `R2_QUARANTINE_SCAN_READ_*` (sin `R2_QUARANTINE_WRITE_*`).
5. Rechazar ejecución real fuera de Linux. No se añade script de lanzamiento ni se activa el flag; la inyección de transporte existe solamente para Jest hermético.
6. No agregar endpoints, servicios Nest, Prisma, tablas, roles, credenciales, Docker, CI jobs, tags de deploy ni acciones de escritura.

## Pruebas y criterios de aceptación

```powershell
Set-Location C:\dev\zaping\app\api
npx --no-install prettier --write 'src/config/zfiles-r2-clamav-qa-harness.ts' 'src/config/zfiles-r2-clamav-qa-harness.spec.ts'
npm test -- --runInBand zfiles-r2-clamav-qa-harness.spec.ts
npm run typecheck
npm run lint:check
Set-Location C:\dev\zaping
git diff --check
git diff --stat
```

Pruebas negativas: flag ausente, CI, TZ, nombres de bucket incorrectos, secretos ausentes, credencial de escritura presente, socket inválido, objeto adulterado y fallo de scanner. Nunca emitir `CLEAN` ni `AVAILABLE`; un resultado `CLAMD_OK_UNATTESTED` no permite descargar, publicar o promover el archivo.

**Gate siguiente 01F2 (fuera de alcance):** ensayo real desde un host Linux efímero y controlado con salida sólo a R2, socket Unix hacia clamd sin red, manifiesto fijo y credenciales introducidas localmente fuera de CI. Requiere revisión previa de egress, segregación, tiempo UTC, frescura de firmas y auditoría. El ETag no elimina riesgo TOCTOU post-escaneo; promociones y evidencia firmada siguen bloqueadas.
