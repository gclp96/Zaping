# QA-REVIEW-01B — Validador determinista QA-BUNDLE V2

**Issue:** [#261](https://github.com/gclp96/Zaping/issues/261)  
**Contrato preexistente:** QA-REVIEW-01A, [#258](https://github.com/gclp96/Zaping/issues/258), PR #260  
**Base de diseño:** `8f2fa7fe25f3032f6c29a7ac107f0dcbd9e03fa6`  
**Código productor fijado:** `qa-bundle.mjs` blob `af42de25a2948359e4c0a2315cade25c10cd3817`; `qa-contract.mjs` blob `0530f19ba2c610c8741d923b5be2ec2052b6b69e`.

## Propósito y frontera

`validateQaBundleV2` analiza un artefacto QA-BUNDLE V2 **ya recibido**. No lee el filesystem, invoca comandos, Git/GitHub, Docker, red, IA ni código de propuesta. El módulo **no** autentica al operador ni la procedencia Git; esa validación corresponde al operador confiable y a QA-REVIEW-01C. No autoriza LLM, merge, aprobación, publicación ni despliegue. Únicamente procesa bytes, hace comprobaciones deterministas y devuelve datos diagnósticos sin contenido.

El recolector actual publica checks `NOT_RUN / UNVERIFIED` y tres limitaciones obligatorias. Por ello un artefacto V2 auténtico conforme al perfil fijado debe conservar `INSUFFICIENT_EVIDENCE`; no debe promoverse a `QA_REVIEW` por coincidencia de hashes ni sustituir tests no ejecutados por `PASS`.

## API

```js
import { validateQaBundleV2 } from './qa-review-validator.mjs';

const result = validateQaBundleV2({
  manifestBytes,       // Uint8Array; máximo 2 MiB (límite propio del validador)
  snapshotBytes,       // Uint8Array; máximo 1 MiB
  approvedScopeBytes,  // Uint8Array; máximo 64 KiB, provisto por un operador confiable
  expected: {          // identidad aprobada por un canal distinto del manifest
    repository: 'gclp96/zaping', issueNumber: 261,
    approvedIssueSha256, scopeSha256, branch: 'codex/agent-issue-261',
    baseSha, headSha, worktreeId
  }
});
// { status, reasons, verified, limitations }
```

`expected` es parte de la **interfaz del operador**: no construirlo copiando valores del manifest. La función realiza una copia acotada de cada `Uint8Array` antes de analizarla, para calcular el hash de los mismos bytes que se parsean. Esta copia no prueba que la fuente fuera auténtica ni elimina todos los ataques de concurrencia fuera del proceso.

- `BLOCKED`: entrada, esquema, hashes, alcance o coherencia inválidos. Razones estables; sin contenido, paths ni autorización.
- `INSUFFICIENT_EVIDENCE`: datos internamente coherentes conforme al productor fijado, pero checks no ejecutados y procedencia no atestada.
- `QA_REVIEW`: estado del contrato genérico `qa-contract.mjs`; **este validador lo rechaza para el productor actual**, pues no puede generarlo de forma legítima con `NOT_RUN` y las limitaciones obligatorias.

`verified.internalConsistency` y los hashes acreditan únicamente comprobaciones **internas del paquete recibido**. `verified.provenance` permanece `UNVERIFIED_EXTERNALLY` incluso con hashes correctos. El consumidor no debe interpretar ningún campo como permiso de publicar contenido.

## Controles implementados

1. **Parser estructural estricto:** UTF-8 fatal, prohibición de BOM, duplicación de claves tras decodificar escapes JSON, claves estructurales peligrosas (`__proto__`, `constructor`, `prototype`), JSON malformado, profundidad máxima de 48 y 300,000 nodos máximos. Las cadenas que contienen texto parecido a JSON se tratan solo como cadenas de datos.
2. **Esquemas cerrados:** `manifest` V2, `snapshot` V2, `envelope` V1, `metadata`, capas, `result` y `limits`. Los límites del productor son exactos, sin modificaciones silenciosas.
3. **Política e identidad:** se comparan los bytes de scope contra SHA-256 fijado por `expected` y contra `manifest.scopeSha256`; identidad del envelope, política y rutas autorizadas deben coincidir. La identidad declarada no constituye atestación.
4. **Integridad por bytes:** hash SHA-256 del snapshot **crudo** y hash de UTF-8, tamaño y modo por capa presente. Las capas excluidas no pueden contener texto; las borradas carecen de working; los metadatos deben coincidir exactamente por posición y ruta.
5. **Fingerprint:** reconstrucción de `before = {branch,baseSha,headSha,worktreeId,repository,issueNumber,approvedIssueSha256,scopeSha256,diffSha256,inventory}` y de cada entrada en el orden real del productor. `JSON.stringify(before)` se hashea en UTF-8 y se compara con `envelope.fingerprintSha256`. El orden externo de propiedades JSON no es evidencia de corrupción: se reconstruye el orden de **preimagen** de la captura. Este cálculo solo prueba autoconsistencia.
6. **Perfil V2 fijo:** check único `verify-local: NOT_RUN/UNVERIFIED`; las tres limitaciones textuales del recolector; resultado recalculado mediante `validateQaEnvelope` sin modificarlo; rechazo de `PASS` forjado y de manifest que afirme un estado más favorable.
7. **Fail-closed:** ninguna salida contiene contenido, secretos o paths; resultados con códigos predefinidos, sin conceder autorización externa.

## Límites y compatibilidad

| Límite | Valor |
| --- | ---: |
| `manifestBytes` del validador | 2 MiB |
| `snapshotBytes` del productor | 1 MiB |
| `approvedScopeBytes` | 64 KiB |
| Rutas | 1,000 |
| Tamaño de capa incluido | 256 KiB |
| Profundidad JSON | 48 |
| Nodos JSON | 300,000 |
| Proceso externo del productor | 30 s por comando |
| Operación total V2 del productor | 120 s globales |

`manifest.limits` se coteja con la configuración vigente del productor: `fileBytes=262144`, `totalBytes=1048576`, `paths=1000`, `processBytes=8388608`, `tableEntries=50000`, `commands=30000`, `commandBytes=67108864`, `durationMs=120000`. **El límite por proceso de 30 s no figura en ese objeto** y no contradice el límite global.

El límite de manifest de 2 MiB es una propuesta de este validador, no una cota garantizada por el recolector. Se ha probado un fixture de 1,000 rutas cortas, pero cualquier caso auténtico del productor que exceda ese máximo exige detener el trabajo y abrir revisión del contrato: **no ampliar el tamaño de forma automática**.

## Pruebas

Fixtures totalmente sintéticas y en memoria, sin acceso a un checkout de propuesta ni secretos reales. Cobertura prevista y ejercitada localmente: estados Git ` M`, `M `, `MM`, `A `, `??`, `R `, `RM`, `D `; inventario múltiple; exclusiones; corrupción de SHA de snapshot y capas; cambios de fingerprint/metadata; scope e identidad inconsistentes; checks `PASS` falsificados; reducción de limitaciones; JSON duplicado o escapado, BOM y UTF-8 inválido; payload de prompt injection tratado como dato; límites y determinismo.

Comandos de validación para una futura rama/PR donde exista el contrato real:

```sh
node --check scripts/agents/qa-review-validator.mjs
node --check scripts/agents/qa-review-validator.test.mjs
node --test scripts/agents/qa-review-validator.test.mjs
node --test --test-concurrency=1 scripts/agents/*.test.mjs
git diff --check
```

La suite local inicial se ejecutó con Node **22.16.0**, mientras la versión objetivo de Zaping es **24.20.0**. Esto **no** sustituye las pruebas ejecutadas por CI con el contrato real instalado en el repositorio ni acredita por anticipado el DoD. Los resultados definitivos deben vincularse a un SHA de rama/PR.

## Riesgos no resueltos y dependencias

- `diffSha256`: la fuente no exporta los bytes crudos de los diffs; no se puede recalcular en 01B.
- El `scopeSha256` identifica bytes, **no** firma el operador. Los hashes del paquete pueden ser creados por una fuente que controle todos sus campos.
- `worktreeId`, fecha/frescura, integridad de `.git`, presencia de escrituras concurrentes, comprobación real de permisos, secretos del host, contenedores, proveedor remoto y atestación de CI no son observables con estos dos JSON.
- Los controles adversariales de aislamiento, TOCTOU, parsers de salida de modelos e inyección de prompts **pertenecen a QA-REVIEW-01C y QA-PILOT-01**. Nunca se heredan como PASS del validador.

## Stop y rollback

Parar si la integración necesita alterar `qa-bundle.mjs`, `qa-contract.mjs`, la política externa, el runner, un cuarto archivo de producto o acceder a archivos y procesos desde el validador. Si cambia el perfil del productor, planificar una nueva versión contractual. Para revertir el incremento, dejar de consumir el nuevo módulo; no modificar registros de QA-BUNDLE V2, credenciales ni políticas. Ningún componente debe activar `agent:ready`, disparar modelos o mergear cambios por la salida del validador.
