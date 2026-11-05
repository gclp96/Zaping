# QA-CONTRACT-02 — envelope V1

Contrato independiente del manifest QA-BUNDLE-01. `validateQaEnvelope(value)`
valida datos JSON planos y devuelve `{status, reasons, envelope,
exportablePaths}` sin comandos, IO, red, importaciones de ejecutores ni mutación
del input. `LIMITS` exporta los límites fijos. No calcula hashes ni inspecciona
contenido: valida su representación. No interpreta cuerpos de issues ni sus
referencias como autoridad. No ejecuta QA ni modifica el recolector #226.

## Esquema cerrado

Todos los campos son obligatorios salvo los explícitamente opcionales. Se
rechazan campos desconocidos en cada objeto, versiones distintas de `1`, tipos
coercibles, arrays dispersos y objetos distintos de objetos JSON planos. La API
es para valores JSON deserializados, no objetos ejecutables/proxies/getters de
código hostil. No ofrece un sandbox JavaScript. Valores inválidos producen
`BLOCKED`, sin envelope ni rutas exportables. Razones son códigos estables;
la primera falla estructural se devuelve, sin copiar valores rechazados.

| Campo | Formato V1 | Confianza y autoridad |
| --- | --- | --- |
| `schemaVersion` | entero literal `1` | Versión del contrato, independiente de manifest V1 |
| `repository` | literal `gclp96/zaping` | Identidad declarada, no consulta remota |
| `issueNumber` | entero seguro positivo | Ticket principal, nunca referencia como permiso |
| `approvedIssueSha256` | SHA-256 | Contrato aprobado completo incluyendo referencias cuando existan; origen debe comprobarlo el operador |
| `branch` | `codex/agent-issue-${issueNumber}` | Identidad exacta, no acceso a Git |
| `baseSha`, `headSha` | SHA Git de 40 hex minúsculas | Identidad declarada; igualdad base/HEAD no demuestra frescura |
| `worktreeId` | SHA-256 opaco | Identidad declarada sin ruta física exportada |
| `diffSha256`, `snapshotSha256`, `fingerprintSha256` | SHA-256 de 64 hex minúsculas | Huellas suministradas por productor; no se recalculan |
| `scope` | política abajo | Dato del operador vinculado al ticket, no autorización otorgada por esta función |
| `inventory` | array de registros abajo, máximo 1000 | Metadatos no confiables; no prueba exhaustividad del inventario |
| `checks` | opcional, máximo 100 | Declaraciones de procesos externos, nunca aprobación |
| `limitations` | array de textos, máximo 100 | Cada limitación declarada vuelve insuficiente la evidencia |

La construcción de `approvedIssueSha256` pertenece al aprobador de contexto:
SHA-256 de la serialización exacta revisada que incluya número, título, cuerpo y
referencias precargadas cuando existan, conforme al protocolo de contexto
aprobado del lanzador: actualmente `approvalFingerprint` en issue-context usa
`SHA256(JSON.stringify([number, title, body, references]))` si existen referencias,
y `SHA256(JSON.stringify([number, title, body]))` si no existen, conservando los
objetos normalizados y su orden exacto. Este contrato recibe solo el digest; no acepta contenido
ni intenta reconstruirlo. El hash antiguo del ticket aislado no debe sustituir
el contrato con referencias. La función no puede comprobar que el operador haya
aprobado realmente esos bytes.

`scope` tiene exactamente `authority: 'OPERATOR'`, `operatorId` (texto 1..100),
`issueNumber`, `approvedIssueSha256`, `allowedPaths`, `forbiddenPaths`. Número y
hash deben coincidir con el envelope. Ambas listas son obligatorias, máximo
1000 cada una; allowlist no vacía. No hay intersección ni duplicados incluso
ignorando mayúsculas. Cada ruta autoriza solo esa cadena exacta, no un directorio
ni sus descendientes. `operatorId` es una afirmación de procedencia, no una firma.
Ni un issue referenciado, ni el texto del ticket ni un archivo pueden ampliar
estas listas. El llamador debe obtener esta política por un canal confiable
separado de la propuesta y comprobar su aprobación externa.

Rutas: relativas, NFC, 1..240 unidades UTF-16; sin componentes vacíos, `.`/`..`,
barra inicial/final, backslash, controles C0/C1, sufijos punto/espacio, ADS,
reservados Windows CON/PRN/AUX/NUL/COM/LPT (incluidas extensiones), comodines,
corchetes, llaves, `%`, comillas, `<>|`, sustitutos Unicode aislados o caracteres
Unicode de formato (`General_Category=Cf`, incluidos U+202E y U+200B). Se rechazan
duplicados en inventory por ruta actual incluso ignorando mayúsculas. Un nombre
anterior puede coincidir con otro nombre actual: permite cadenas de renombres;
pero **dos renombres no pueden compartir `originalPath`**, incluso ignorando
mayúsculas. Los extremos deben autorizarse individualmente. No se resuelven rutas físicas.

## Inventario y elegibilidad

Cada registro tiene exactamente:

- `path`, `status`, `kind: 'REGULAR'`.
- `originalPath` obligatorio solo para rename staged; distinto de `path`.
- `size`, `sha256`: ambos nulos si contenido actual falta, o tamaño entero
  0..67108864 y SHA-256. No se admite contenido en el envelope.
- `base`, `index`: nulos o `{size, sha256}`, tamaño 0..262144. Representan
  contenido seguro disponible en una capa vinculada al snapshot externo;
  un hash del índice sin contenido disponible debe representarse como null.
- `excluded`: null o `BASE_CONTENT_UNAVAILABLE`, `INDEX_CONTENT_UNAVAILABLE`,
  `CONTENT_UNAVAILABLE`, `BINARY`, `TOO_LARGE`, `POSSIBLE_SECRET`, `OUT_OF_SCOPE`.
- `evidenceGaps`: array de esos mismos códigos, máximo 100, sin duplicados.

`status` es XY Git conservando espacios: `??` para untracked; X pertenece a
espacio/M/A/R/D e Y a espacio/M/D, excluyendo el estado limpio de dos espacios.
X expresa staged, Y unstaged; `MM` conserva ambas capas. Copias, conflictos,
submódulos y estados desconocidos requieren otro contrato y bloquean V1.
Symlinks/junctions/archivos especiales representados en `kind` bloquean. La
función no puede detectar enlaces omitidos o falsamente declarados REGULAR.
Un registro `??` es incompatible con `base` o `index` distintos de null:
se devuelve `BLOCKED` (`INVALID_GIT_METADATA`) incluso si otros metadatos
parecen completos. Los `originalPath` duplicados entre renombres se rechazan
con `DUPLICATE_RENAME_SOURCE`.

Un inventario vacío se considera `INSUFFICIENT_EVIDENCE` con
`INVENTORY_EMPTY`, incluso si el llamador declara checks vinculados PASS; un
inventario vacío no demuestra que el worktree esté limpio.

Se deriva `BASE_CONTENT_UNAVAILABLE` para cambios existentes/renombres/bajas
sin base; `INDEX_CONTENT_UNAVAILABLE` si hay capa staged sin índice vinculante.
Bajas siempre producen `DELETED_CONTENT`; V1 conserva esa incertidumbre incluso
con base declarada. Contenido actual ausente en otras entradas produce
`CONTENT_UNAVAILABLE`; tamaños mayores de 262144 producen `TOO_LARGE`.
Exclusiones y gaps se conservan y contribuyen razones. No se escanean secretos:
la heurística futura puede tener falsos negativos y necesita revisión humana.

Toda ruta actual o anterior fuera de allowlist o en denylist deriva
`OUT_OF_SCOPE` y **bloquea todo el envelope**, sin rutas exportables. Declarar
`OUT_OF_SCOPE` como exclusión/gap también bloquea. No hay exportación parcial en
ese caso. `exportablePaths` solo indica candidatos de contenido actual regular,
permitido, presente, pequeño, no borrado, sin exclusiones/gaps; **no exporta
contenido ni concede permiso de lectura**. Puede haber candidatos aunque falte
base/índice/checks: el estado global continúa siendo insuficiente. El futuro
exportador debe volver a verificar política, bytes, secretos y estado global.

## Checks y vínculo exacto

Cada check tiene `name` (1..100, único), `source: {kind, id}` con kind
`LOCAL_VERIFIER | GITHUB_CI | NOT_RUN`, id 1..200. `status` opcional es
`PASS | FAIL | BLOCKED | NOT_RUN`, por defecto NOT_RUN. `binding` opcional es
`UNVERIFIED` por defecto, o un objeto con **todos** los campos de identidad y
huellas de la tabla (desde repository hasta fingerprint, sin schemaVersion).
El único campo extra permitido en binding es `publishedCommitSha` (SHA Git).
Todos los campos deben coincidir exactamente con el envelope. CI además exige
`publishedCommitSha === headSha`: el productor debe comprobar externamente que
ese SHA fue publicado y que la ejecución CI corresponde a él. No basta HEAD
para vincular un snapshot con cambios sin commit.

Checks omitidos generan `verify-local: NOT_RUN/UNVERIFIED`; array vacío deriva
`CHECKS_MISSING`. Binding ausente, histórico o distinto produce
`CHECK_UNVERIFIED` y normaliza el resultado a `NOT_RUN/UNVERIFIED`, incluso si
la afirmación recibida decía PASS. Fuente NOT_RUN nunca acredita resultados.
Un estado recibido FAIL/BLOCKED/NOT_RUN agrega `CHECK_FAIL`, `CHECK_BLOCKED` o
`CHECK_NOT_RUN`; no se convierte en PASS. SHA malformado bloquea, SHA válido de
otra revisión es evidencia insuficiente. Las razones se ordenan y deduplican.

## Matriz de decisión y límites de confianza

| Estado | Condición | Significado |
| --- | --- | --- |
| `BLOCKED` | Esquema/identidad/hash/ruta/política inválidos, capas `??` inconsistentes, origen de rename duplicado, enlaces declarados, límites estructurales excedidos, OUT_OF_SCOPE | No entregar envelope ni candidatos |
| `INSUFFICIENT_EVIDENCE` | Inventario vacío, gaps/exclusiones, bajas, base/índice ausentes, límites de contenido legible, checks no vinculados/no PASS, limitaciones | Datos normalizados con incertidumbre explícita; no aprobación |
| `QA_REVIEW` | Validación estructural sin razones de insuficiencia | Evidencia declarada apta para revisión humana/QA; no prueba de corrección |

Nunca se emite `QA_PASS` ni `APPROVED`. FAIL o BLOCKED de un check son evidencia
operativa, no un veredicto automático sobre código. Incluso QA_REVIEW con checks
PASS no autentica esos resultados ni autoriza integración.

Hashes solos, sin firma/atestación de origen y relectura confiable, no prueban
autenticidad, completitud ni frescura. Un atacante puede copiar todos los campos
o inventar hashes coherentes. Este validador comprueba igualdad de declaraciones;
el proceso externo debe comprobar procedencia, bytes exactos y ausencia de
cambios antes/después del verificador y antes de QA. No afirma haber verificado
firmas ni atestaciones. El tamaño total de bytes y el acceso al FS quedan al
recolector, no se simula aislamiento de solo lectura.

Todos los textos son 1..500 unidades UTF-16 sin controles salvo límites menores
indicados; arrays de textos máximo 100 sin duplicados. Los límites son fijos,
no configurables por el proyecto. Nuevos campos, estados Git, versiones o
semánticas requieren versión explícita y revisión del consumidor: no hay
fallback permisivo ni adaptación automática del manifest anterior.

## Ejemplos sintéticos e integración futura

Las fixtures en `scripts/agents/qa-contract.test.mjs` usan solo `a.txt`, hashes
repetidos artificiales y una identidad `synthetic-operator`. No constituyen
atestación real. Ejemplo de check sin ejecutar:

```json
{"name":"verify-local","source":{"kind":"NOT_RUN","id":"not-run"},"status":"NOT_RUN","binding":"UNVERIFIED"}
```

Su clasificación es INSUFFICIENT_EVIDENCE. Una ruta `../cliente` bloquea; un
rename permitido hacia `new.txt` desde una ruta no autorizada también bloquea.
Un check con snapshot anterior se normaliza a NOT_RUN/UNVERIFIED. Las pruebas
incluyen una declaración completamente vinculada que produce QA_REVIEW, sin
convertir esa declaración en aprobación de código.

QA-BUNDLE-02 deberá adaptar explícitamente su inventario al envelope, obtener
política del operador, verificar hashes de contenido base/índice/snapshot,
relecturas y procedencia de resultados. No puede copiar un PASS histórico ni
marcar presente contenido cuyo único dato es un hash. Este incremento no cambia
qa-bundle, verify-local, run-task o permisos. QA-REVIEW-01 deberá demostrar el
runtime aislado del futuro revisor; ningún prompt garantiza ese aislamiento.

Validación local: `node --test scripts/agents/qa-contract.test.mjs`,
`node --test scripts/agents/*.test.mjs`,
`node --check scripts/agents/qa-contract.mjs`, `git diff --check`; complementar
archivos nuevos con `git diff --no-index --check /dev/null <archivo>` sin stage.
La suite pura no usa fixtures externas, red, credenciales ni comandos.
EPERM del sandbox debe reportarse y revalidarse por el operador.

Revisión independiente y humana, autorización separada de commit/PR Draft y CI
real del SHA publicado siguen pendientes fuera de esta ejecución. Merge y
publicación requieren gates humanos separados. Estas pruebas no declaran QA
lista para operar ni CI remota aprobada.

## Evidencia de esta implementación (2026-11-05)

Node v24.20.0, sandbox Linux; no se acredita una revalidación externa en Ubuntu
WSL2. Test focal requerido PASS; ejecución adicional con
`--test-isolation=none` permite contar los 71 casos internos, todos PASS.
Sintaxis y `git diff --check` PASS; los tres archivos nuevos también pasan
`git diff --no-index --check` sin diagnósticos de whitespace.

Suite completa Agents ejecutada: 7 archivos PASS, 1 FAIL. La falla existente
está en `verify-local.test.mjs`, caso “process evidence captures an actual child
exit (no network)”: espera FAIL y recibe BLOCKED. Ejecución diagnóstica aislada:
29/30 casos PASS. Un proceso mínimo confirmó `spawnSync` con timeout devolviendo
`error.code: EPERM` junto con el exit code real. No se modifica el ejecutor para
sortearlo. El operador debe repetir la suite completa fuera de esa restricción;
este gate permanece pendiente, sin aprobación local completa ni CI remota.

## Revisión correctiva independiente — QA-CONTRACT-02

Se añadieron siete regresiones a las 71 pruebas focales previas: `??` con base;
`??` con índice; origen compartido entre dos renombres `R `; origen compartido
entre `R ` y `RM`; ruta con U+202E; ruta con U+200B; e inventario vacío con
check PASS vinculado. La política de clasificación es conservadora: metadatos
Git contradictorios y rutas inseguras bloquean; el inventario vacío es
insuficiente. No se modifican ejecutores ni se presume que los hashes prueben
identidad. Los resultados de pruebas deben registrarse por entorno y versión
Node; una prueba aislada no equivale a la suite completa ni a CI.
