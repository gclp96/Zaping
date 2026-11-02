# ZFILES-INT-02B — revisión local

Fecha: 01/nov/2026 (America/Hermosillo). Ticket: https://github.com/gclp96/zaping/issues/189.
Estado: implementación local para revisión; NO MERGE-READY. Sin push, PR nuevo, merge ni deploy.

## Identidad y aislamiento

- Worktree: `C:\dev\zaping\output\zfiles-int-02b`.
- Rama: `codex/zfiles-int-02b-document-navigation`.
- Base exacta: `cd77eea2eb145d30adac0cbbe894e687c425e0e7`, `origin/main` actualizado mediante fetch; contiene merge PR188.
- `main` local se preservó en `3d022a6f386c73d0be1a6a2038ceb1fb00f63b62`; no se hizo checkout ni actualización de esa rama.
- Commit funcional: `97724968ef79ab482440cc5297c2d2f26025efbb`.
- Inventario inicial de worktrees inspeccionado; directorios preexistentes `output/`, `tmp/` y otros worktrees preservados.
- PR141: se aplicó solamente su delta Web de cuatro archivos entre base `68673877...` y HEAD `0b9d659016c0a4a3e51e92c746cbf68c936e8789`, y se reforzó localmente. No merge/rebase/cherry-pick del stack; sin PR142/144.
- Guías locales Next.js de Link y autenticación leídas antes de editar código.

## Comportamiento implementado

- Conserva referencia documental heredada como texto; sin vínculo validado no construye navegación por folio.
- GET `/supplier-documents/receipts/:receiptId/links` exclusivamente para ADMIN/MANAGER con sesión verificada; backend conserva autoridad JWT/RBAC/tenant.
- Valida payload completo: array, campos usados, receiptId, documentId igual a document.id, estados/tipos conocidos, identificadores no vacíos, duplicados y vínculos eliminados. Una inconsistencia impide todos los enlaces de la respuesta.
- Navegación por ID exacto codificado con encodeURIComponent; muestra ID para distinguir folios iguales y etiqueta visible de registro cancelado para CANCELLED.
- Loading, vacío, referencia histórica sin vínculo, error HTTP/payload y reintento; foco visible y lista etiquetada.
- Reinicio síncrono del estado por recepción, empresa, usuario o rol; cleanup descarta respuestas tardías. La carga del detalle también descarta respuestas tardías tras cambiar recepción.
- Sin cambios API/Prisma/migraciones, inventario, finanzas, facturación, almacenamiento ni flags. No se ejecutaron migraciones.

## Validación

- Recepciones final: `npm test -- 'app/(app)/purchase-receipts' --maxWorkers=1`: 5 archivos / 108 tests PASS. Incluye tests existentes del detalle, folios iguales con IDs distintos, CANCELLED, referencia histórica, payloads inválidos, HTTP/retry, cuatro roles, cambios de sesión y respuestas tardías de vínculos y detalle.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build` (Turbopack predeterminado): FAIL local; proceso hijo CSS sale antes de conectar, al escribir `/favicon.ico/route`. Reproducido fuera del sandbox. Sin atribuir causa definitiva ni modificar configuración.
- `NEXT_PUBLIC_API_URL=https://api.example.invalid npm run build -- --webpack` (variable establecida con sintaxis PowerShell): PASS, compilación, TypeScript y generación de rutas terminados.
- Web completa verificada por bloques: `npm test -- --maxWorkers=1 --exclude "app/(app)/purchases/page.test.tsx"`: 81 archivos / 1030 tests PASS en 324.54 s. Compras por separado: `npm test -- "app/(app)/purchases/page.test.tsx" --pool=forks --maxWorkers=2 --testTimeout=10000`: 1 archivo / 73 tests PASS en 21.15 s, con parámetros de CI. Reemplaza como evidencia principal el intento diagnóstico anterior con 15000 ms. Los tres últimos tests documentales añadidos durante la ejecución amplia están cubiertos por Recepciones final 108/108. No se omitió permanentemente ningún archivo: el único excluido de la ejecución amplia fue probado por separado. No se atribuye PASS a una ejecución unfiltered de `npm test`: intentos iniciales interrumpidos tuvieron timeouts bajo carga. Sin cambios persistentes de configuración, timeouts o archivos de Compras.
- `git diff --check`: PASS.

## Navegador

- Web del worktree en 3029 con Webpack, API sintética en loopback 3041. Sin conexión a API/DB operativa, sin escrituras persistentes de negocio.
- 390, 820 y 1440 px: revisión visual PASS; ancho scroll del documento igual al ancho cliente (375, 805 y 1425 respectivamente, descontando scrollbar); tabla conserva su scroll propio. Foco por teclado visible en enlace documental.
- Dos documentos con folio A-000123 conservaron destinos document-exact-1 y document-exact-2; segundo con etiqueta de cancelación.
- ADMIN/MANAGER: enlaces y GET observados. SALES/WAREHOUSE: referencia visible, cero enlaces documentales y sin GET restringido en registro del mock.
- Capturas: `output/qa/390.png`, `820.png`, `1440.png`. Fixture: `output/qa/mock-api.cjs`; sólo evidencia local, fuera del commit funcional.
- La API sintética no modela dashboard; la navegación automática de login a home produjo un error de fixture por totals ausente. QA del detalle se realizó mediante navegación directa posterior con sesión confirmada. No se atribuye ese error a esta implementación.
- Servidores y pestañas de QA cerrados; override de viewport restablecido.

## CI y riesgos

- Baseline postmerge: https://github.com/gclp96/zaping/actions/runs/41354646705 (#1160). Jobs consultados directamente por conector GitHub: Web, API e Historical upgrade pre-S1 completed/success. El cierre de #187 identifica el mismo SHA base.
- Esta rama no tiene CI remoto: no fue publicada. No declarar merge-ready ni aceptación productiva.
- QA visual usa datos sintéticos, no constituye E2E contra backend real de esta rama. Integración real y CI del futuro PR siguen pendientes.
- Build predeterminado Turbopack requiere revisión del entorno; Webpack PASS no sustituye ese resultado.
- Revisión de código humana y decisión de publicación/merge son pasos posteriores independientes.

## Artefactos locales

Patch acumulado (Web y este informe): `output/qa/ZFILES-INT-02B.patch`. Logs `output/qa/qa-*.log` y fixture/capturas quedan como evidencia local no versionada; no forman parte del diff productivo.
