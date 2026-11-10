# QA-REVIEW-01C1-A — SyntheticTransferV1 (parser puro)

**Issue:** [#264](https://github.com/gclp96/Zaping/issues/264)
**Parent:** [QA-REVIEW-01C #263](https://github.com/gclp96/Zaping/issues/263)
**Contrato:** V1 aprobado como diseño el 2026-11-09; implementación y resultados requieren revisión independiente
**Base contractual:** `main@7b8d5b878669dd674d6f31fe71b445d1489a184f`
**Runtime de validación exigido:** Node.js 24.20.0 (`.nvmrc`)

## 1. Propósito y límite de confianza

`parseSyntheticTransferV1()` inspecciona únicamente bytes **ya recibidos** y expectativas/política suministradas de forma independiente por un **llamador confiable**. Valida estructura JSON UTF-8, rutas relativas acotadas, operación, modo, tamaños y hashes. El resultado aceptado solamente certifica **coherencia interna del paquete recibido bajo esa política**.

```text
[Emisor de paquete / datos NO confiables]
    | bytes Uint8Array
    v
[Parser puro: SyntheticTransferV1] <--- [expected + approvedScopeBytes DEL OPERADOR]
    | ACCEPTED_SYNTHETIC_DATA / BLOCKED + metadatos seguros
    v
[Future 01C1-B: ledger de autorización] — NO IMPLEMENTADO
    |
[Future 01C1-C: cuarentena/staging por operador en VM] — NO IMPLEMENTADO
```

El parser **no** ejecuta comandos, compila, importa ni evalúa contenido; no abre archivos ni rutas, no usa Git/GitHub, `gh`, Docker/VM, red, LLM, reloj, variables de entorno o credenciales. Su único import es `node:crypto` para SHA-256. Tampoco crea staging ni autentica identidad/commit/estado Git. **Ni un `ACCEPTED_SYNTHETIC_DATA` ni una CI verde habilitan `agent:ready`, `QA_REVIEW`, aprobación, merge, publicación, modelos o transferencia de código real.**

## 2. API fija

```js
import { parseSyntheticTransferV1 } from './synthetic-transfer.mjs';

const result = parseSyntheticTransferV1({
  packageBytes,       // Uint8Array; bytes de UN documento JSON UTF-8
  approvedScopeBytes, // Uint8Array; scope JSON V1 obtenido independientemente
  expected: {         // valores verificados independientemente por operador
    repository: 'gclp96/zaping',
    issueNumber: 264,
    approvedIssueSha256,  // SHA-256 hex minúsculas, 64 caracteres
    scopeSha256,          // SHA-256 hex minúsculas de approvedScopeBytes exactos
    expectedBaseSha,     // Git SHA, 40 hex minúsculas
  },
});
```

El `issueNumber: 264` del ejemplo identifica el ticket de diseño. **No** representa un permiso real para usar contenido/rutas del repositorio. Los tests construyen una política de prueba totalmente ficticia en memoria; un producto real no debe derivar `expected` del paquete ni fiarse de un manifest de propuesta.

**Resultado fijo:**

```js
{
  status: 'ACCEPTED_SYNTHETIC_DATA' | 'BLOCKED',
  packageSha256: string | null,
  entries: Array<{ path, operation, mode, sizeBytes, sha256 }>,
  reasons: string[],
  provenance: 'UNVERIFIED_EXTERNALLY',
  limitations: string[],
}
```

- **Aceptación:** `packageSha256` del paquete crudo recibido; `entries` con **metadatos** solamente; `reasons: []`. No retorna `contentUtf8` ni otra copia del payload.
- **Bloqueo:** `packageSha256: null`, `entries: []`, **un** código de rechazo estable en `reasons`, sin valor, path, excepción o secreto del emisor. No hay aceptación parcial.
- `limitations` son frases predefinidas y nunca son un permiso. `provenance` permanece `UNVERIFIED_EXTERNALLY` tanto en éxito como en fallo.
- Entradas no conformes, incluidos textos fuera del perfil, retornan `status: 'BLOCKED'`. `NOT_SAFE_FOR_STAGE` es **un código de rechazo**, no significa que exista staging.

La API rechaza inputs que no sean registros de datos planos con claves exactas. Rechaza getters sobre `input` y `expected`; no se afirma protección general frente a Proxy JS malicioso pasado por un llamador ya comprometido. Los valores `Uint8Array` se comprueban por tamaño y se **copian antes de parsear/hashear**. La copia protege coherencia de la operación interna frente a mutaciones posteriores; no constituye protección frente a TOCTOU del sistema operativo ni garantiza snapshot atómico de memoria compartida bajo escritores hostiles.

## 3. Contrato cerrado de entrada

**Paquete:**

```json
{
  "schemaVersion": 1,
  "kind": "SYNTHETIC_TRANSFER",
  "declaredBaseSha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "entries": [
    {
      "path": "docs/synthetic-fixture.txt",
      "operation": "UNTRACKED_CREATE",
      "mode": "100644",
      "contentUtf8": "Synthetic fixture only.\n",
      "sizeBytes": 24,
      "sha256": "<calcular SHA-256 del texto exacto en el test>"
    }
  ]
}
```

El ejemplo es ilustrativo, no un fixture completo: `sha256` tiene marcador de posición. Los tests calculan tamaños y hashes reales y no utilizan firmas artificiales. El campo `declaredBaseSha` **no** es autenticación: se compara exactamente con `expected.expectedBaseSha`, obtenido por el operador.

**Política JSON V1 externa:** tiene exactamente `authority`, `operatorId`, `issueNumber`, `approvedIssueSha256`, `allowedPaths`, `forbiddenPaths`. Exige `authority: 'OPERATOR'`, identificador de operador de 1–100 caracteres de texto sin controles, issue positivo, SHA-256 de 64 caracteres hex minúsculas, y listas cerradas de rutas. `operatorId` en JSON **no** es identidad autenticada. El parser compara hash de bytes exactos del scope, issue y aprobación contra `expected`. El scope no puede incluir nombres duplicados, rutas inseguras ni conflictos por mayúsculas, prefijos o intersección entre permitido/prohibido.

**Operaciones V1:** solo `UNTRACKED_CREATE` y `TRACKED_WORKTREE_MODIFY`; solo `mode: '100644'`. No staged, rename, delete, ejecutables, symlinks, submódulos, Git bundle, ZIP/TAR, URLs ni parches libres. La elegibilidad verdadera de los estados `??` y ` M` solo podrá atestarla un futuro componente de operador. El parser no lo intenta.

### Límites

| Control | Máximo |
| --- | ---: |
| Paquete JSON | 2 MiB |
| Política JSON | 64 KiB |
| Entries | 16; mínimo 1 |
| Bytes de contenido UTF-8 por entry | 256 KiB |
| Suma de contenidos UTF-8 | 1 MiB |
| Ruta ASCII (bytes) | 240 |
| Paths de allowlist / forbidden list | 1,000 / 1,000 |
| Profundidad JSON paquete / política | 8 / 6 |
| Nodos JSON paquete / política | 1,024 / 4,096 |

`contentUtf8` puede ser cadena vacía (0 bytes). `sizeBytes` debe ser un entero seguro igual al **tamaño UTF-8 del valor de la cadena decodificada**. El SHA-256 debe calcularse de esos mismos bytes, no de la representación JSON escapada. Los límites de profundidad, nodos y contenido son específicos de este parser y **no cambian** los topes del productor QA-BUNDLE V2.

**JSON y Unicode:** se rechazan BOM, UTF-8 inválido, JSON malformado o con trailing content, números no finitos, campos extra, claves peligrosas (`__proto__`, `constructor`, `prototype`), claves duplicadas incluso si usan escapes Unicode, profundidad y tamaño superiores al perfil y surrogate aislado. El scanner recorre estructura antes de `JSON.parse`; no utiliza una expresión regular aislada para deducir el esquema JSON.

**Rutas:** perfil deliberadamente **ASCII** y más restrictivo que el productor: segmentos con patrón `[A-Za-z0-9_][A-Za-z0-9._-]*`, sin segmento vacío, `.`, `..`, dotfiles ni punto al final. Rechaza Windows device names, rutas absolutas, `\`, `:`, espacios, Unicode en rutas, `.git`, `.github`, `.env`, `.ssh`, `node_modules`, lockfiles, `package.json`, `Dockerfile`, nombres `docker-compose*` y toda la subruta `scripts/agents/`. Los paths de entries deben estar **idénticos** en `allowedPaths`, en orden ASCII estrictamente ascendente y sin colisiones case-insensitive ni de archivo/directorio por prefijos. Se comprueban **todos los ancestros segmentados**, no solo rutas adyacentes tras ordenar; por ejemplo `docs/a`, `docs/a-`, `docs/a/b.txt` debe rechazarse como colisión. Esta incompatibilidad deliberada con algunos paths permitidos por el productor requiere futura revisión si se amplía el perfil. Un path de código real no se convierte en fixture sintética por cambiarle el nombre.

**Texto y secretos:** se permiten cadenas Unicode válidas, tabulaciones y saltos de línea; se bloquean NUL, controles C0 distintos de TAB/LF/CR, DEL y controles C1. Un detector **heurístico** busca PEM private key, tokens GitHub, credenciales AWS con patrón conocido, JWT, valores largos bajo claves como `password`/`secret`/`token`/`api_key`, y URI con usuario/contraseña. Los casos detectados bloquean con `POSSIBLE_SECRET`, incluso si son falsos positivos. Los falsos negativos siguen siendo posibles: el parser **no certifica confidencialidad, origen sintético ni aptitud para egreso**. Instrucciones hostiles tipo `gh ...`, `git push`, `ignore instructions`, `NOT_RUN -> PASS` son únicamente datos, nunca órdenes.

## 4. Orden de validación y errores

El orden de precedencia es: tipos y cotas de ambos `Uint8Array`; forma/valores `expected`; scanner JSON del paquete, después de la política; estructura, paths y hash/identidad del scope; esquema del paquete y SHA de base; validación de cada entry en orden; colisiones/orden final. Un fallo devuelve un único código. Ningún error incluye texto capturado ni stack del proceso.

Códigos posibles: `INVALID_BYTES`, `LIMIT_EXCEEDED`, `INVALID_EXPECTATION`, `INVALID_BOM`, `INVALID_UTF8`, `INVALID_JSON`, `DUPLICATE_KEY`, `UNSAFE_KEY`, `INVALID_UNICODE`, `INVALID_SCHEMA`, `INVALID_SCOPE`, `SCOPE_HASH_MISMATCH`, `BASE_SHA_MISMATCH`, `UNSAFE_PATH`, `OUT_OF_SCOPE`, `DUPLICATE_PATH`, `UNSUPPORTED_OPERATION`, `INVALID_MODE`, `CONTENT_SIZE_MISMATCH`, `CONTENT_SHA_MISMATCH`, `POSSIBLE_SECRET`, `NOT_SAFE_FOR_STAGE`. Errores no contemplados producen `INVALID_SCHEMA` sin filtrar la excepción original.

## 5. Matriz de amenazas y cobertura

| Riesgo | Evidencia local esperada | Límite real |
| --- | --- | --- |
| JSON ambiguo / prototype pollution | Duplicados/escapes/keys peligrosas bloqueados | No es autenticación del emisor |
| Buffer alterado después de llamada | SHA y metadatos calculados de copia | No atesta fuente ni protege escritores hostiles concurrentes |
| SHA/tamaño falso | Rechazo calculado a partir de texto UTF-8 exacto | Un adversario puede crear datos falsos pero autoconsistentes |
| Path traversal / colisión / scope ampliado | Rechazo fail-closed | No comprueba estados físicos del filesystem |
| `M ` vs `??` falsamente declarado | Solo se admite el tipo de operación representado | Sin Git real, la operación sigue sin atestarse |
| Tokens secretos conocidos | `POSSIBLE_SECRET` y salida sin payload | Heurística con falsos positivos y negativos |
| Prompt injection / herramientas | Texto permanece inerte | No prueba un gateway ni aislamiento de un futuro modelo |
| Replay / autorización falsa | Identidad de scope declarativa contrastada | Ledger y sesión confiable quedan en #263 / 01C1-B |
| TOCTOU, symlink y staging | **No probado** | 01C1-C y VM dedicada por diseñar/probar |
| Seguridad de host / red / Docker / LLM | **No ejecutado** | Gate C-2/C-3 independientes |

## 6. Verificación permitida tras autorización operativa

```sh
node --check scripts/agents/synthetic-transfer.mjs
node --check scripts/agents/synthetic-transfer.test.mjs
node --test scripts/agents/synthetic-transfer.test.mjs
git diff --check
```

Los tests usan `node:test`, `node:assert/strict` y `node:crypto` y construyen fixtures **en memoria**, sin acceso a Git, filesystem, red, VM, Docker ni LLM. Incluyen rutas, alias, colisiones, tamaño, Unicode, inputs malformados, hashes, credenciales **ficticias**, y cadenas hostiles inertes. La ejecución final exigida por DoD debe hacerse en **Node.js 24.20.0** e identificarse con SHA exacto del futuro PR. Ejecutar tests con otra versión solo aporta evidencia preliminar; no equivale a ese gate.

**CI:** un push/PR futuro —y solo uno expresamente autorizado— podrá activar la CI estándar en runners **hospedados por GitHub**, incluidos jobs existentes de Docker/PostgreSQL. No se autoriza editar el workflow, lanzar Docker/VM local, modificar secretos/permisos ni activar dispatcher. Un PR Draft también puede disparar CI; por eso **push y PR requieren autorización independiente**. No cambiar `.github/workflows/ci.yml` en #264.

## 7. Alcance del ticket y siguientes gates

Cambios permitidos **únicamente** en:

1. `scripts/agents/synthetic-transfer.mjs`
2. `scripts/agents/synthetic-transfer.test.mjs`
3. `docs/engineering/QA_REVIEW_01C1_A_TRANSFER.md`

No modificar productor QA-BUNDLE, `qa-contract.mjs`, QA-REVIEW-01B, políticas, dispatcher, runner, workflows, API/Web, Prisma ni `main`. Cualquier cuarto archivo o ampliación funcional exige parar y revisar alcance. Antes de merge/cierre se requieren QA y revisión humana con evidencia ligada al SHA exacto del PR. Terminar #264 **no aprueba Gate C**, staging, inferencia remota/local ni QA-PILOT-01. Los tickets 01C1-B (ledger) y 01C1-C (loader/staging/TOCTOU) siguen separados y no quedan autorizados por este documento.
