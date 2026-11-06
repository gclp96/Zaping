# QA-BUNDLE-02 — diseño V2 para revisión humana

Estado: implementación local para revisión humana de QA-BUNDLE-02. La revisión
humana confirmó el diseño y la ruta privada; no constituye aprobación de una
política real ni autorización para publicar evidencia. No se crean ni modifican
políticas reales. Los tests usan exclusivamente fixtures Git y políticas sintéticas.

## CLI y procedencia

Invocación V2, orden y argumentos estrictos, sin flags adicionales:

```sh
node scripts/agents/qa-bundle.mjs --version 2 --issue N --approval-sha H --scope-sha S
```

N debe ser entero positivo seguro sin ceros iniciales; H y S, SHA-256 hexadecimal
minúscula de 64 caracteres. H es el fingerprint de contexto aprobado. S es el
hash de los bytes exactos del archivo de política revisado externamente, sin
normalizar espacios ni saltos de línea. Ausencia o discrepancia bloquea; nunca
se intenta V1 como recuperación. Legacy se conserva mediante `--version 1`
seguido de sus argumentos originales y exclusivamente para #226 y sus tres
rutas; la antigua invocación sin versión se rechaza. Mantener los casos
legacy de seguridad adaptando solamente la selección explícita de versión.

Única ruta de producción:
`~/.local/state/zaping-agent-runner/approved-scopes/issue-N.json`.
Aquí `~` significa exclusivamente `<home-OS>`.
`home-OS` se obtiene de `os.userInfo().homedir` para el UID efectivo coincidente
con el UID real; no de HOME, del issue, del repositorio ni de un argumento.
No se aceptan overrides de producción ni rutas arbitrarias. Si ese home o
identidad no se pueden resolver con garantías, BLOCKED. La ruta debe estar
físicamente fuera del checkout y de la raíz de tareas; el proceso no crea,
repara, cambia permisos ni escribe en `approved-scopes`.

Verificar cada componente absoluto con lstat/realpath sin enlaces, directorios
regulares en padres, sin escritura de grupo/otros en ancestros; ancestros
propiedad de root o del UID del runner. Home y todas las carpetas desde `.local` hasta `approved-scopes`: propiedad del UID y modo 0700; archivo regular, propietario UID,
modo 0600, nlink=1. Rechazar bits especiales, enlaces, junctions, hardlinks y
cualquier identidad física ambigua. Abrir con O_NOFOLLOW/O_NONBLOCK, comparar
fstat/lstat (dev, ino, tamaño, tiempos, permisos y propietario) antes/después,
leer máximo 64 KiB y volver a verificar padres e identidad. Repetir la lectura
y comparación exacta de bytes/identidad antes de publicación. Windows siempre
BLOCKED: no se amplía soporte ni se simulan garantías de handles nativos.

Política JSON UTF-8 estricta, sin BOM, con exactamente estos campos:

```json
{"authority":"OPERATOR","operatorId":"synthetic-operator","issueNumber":250,"approvedIssueSha256":"<H: 64 hex minúsculas>","allowedPaths":["docs/example.md"],"forbiddenPaths":[]}
```

Ejemplo ilustrativo inválido hasta reemplazar H; no es una política aprobada.
Validar claves duplicadas como error (JSON.parse solo no las detecta), campos
extra, tipos, límites y rutas conforme a QA-CONTRACT V1. No hay patrones ni
permisos de directorio: cada ruta exacta autoriza únicamente esa ruta.
N y H deben coincidir con CLI, contexto y envelope; ambos extremos de rename
requieren autorización. El operador instala la política por un canal separado,
revisa bytes y comunica S explícitamente. Nada del worktree, README, issue o
referencias puede introducir o ampliar listas.

Un hash no autentica al operador. Permisos e identidad del UID protegen frente
a otros usuarios, no frente a un escritor con ese mismo UID. `operatorId` es
una declaración, no una firma. Se presupone una sesión de operador confiable,
Node/Git/gh/PATH confiables y control externo de escritores. Si el proponente
puede modificar la política o invocación bajo el mismo UID, esta procedencia no
queda acreditada: no operar hasta separar permisos externamente. No se afirma
que el sandbox de Codex resuelva esa separación.

## Contexto e identidad

Consumir `loadIssueContext()` de `issue-context.mjs` y su `approvalSha` vigente.
Consultar mediante gh solo el principal y referencias explícitas de su sección
aprobada, respetando sus límites y orden. Conservar el gate existente de
`validateIssue()` para tareas A/B abiertas con aprobación; una referencia no
adquiere autoridad. No calcular en V2 el hash legacy del principal si existen
referencias. Cambio de estado/aprobación, contenido o referencias durante
relecturas bloquea. No imprimir respuestas ni errores crudos de procesos.

Preservar checkout separado en main, origin exacto, common-dir físico compartido,
registro del worktree fijo temporal `zaping-agent-runs/issue-N`, rama exacta y
HEAD==base==HEAD confiable==origin/main. Sin fetch, instalación ni código de la
propuesta. Checkout o dependencias locales del recolector sucias bloquean;
comprobar también ignorados relevantes del checkout, no solo git status.
Inventariar dependencias importadas y su procedencia confiable; no cargar código
desde el worktree. No cambiar `qa-contract.mjs` ni `issue-context.mjs`: una
incompatibilidad exige detenerse y solicitar otro ticket.

## Captura y bytes revisables

Inventario determinista completo staged/unstaged/untracked/ignored, bajas y
renombres con ambos extremos; conservar XY Git, modes, identidades físicas,
tamaños y hashes en metadatos V2. Rechazar rutas no canónicas, invisibles,
duplicados, conflictos, gitlinks, symlinks, archivos especiales y flags de
índice que ocultan cambios. Rechazar configuración de filtros antes de status
o diff; desactivar hooks, fsmonitor, diff externo y textconv. Procesos sin shell,
con entorno reducido, timeout y salida acotada; error, señal, stderr o salida
incompleta bloquean. No ejecutar filtros para convertir contenido.

Capturar HEAD/base y stage 0 por OID validado con lectura de objetos Git crudos,
sin filtros/textconv; verificar tamaño antes de cargar blobs. Para renombres,
base corresponde a originalPath e index a path. Una baja no abre el archivo
actual: obtiene exclusivamente capas Git que existan. Untracked no tiene base
ni index; adición staged no tiene base. Ausencias esperadas no se inventan;
capas requeridas ausentes generan razones estables de insuficiencia. OID inválido,
mode inesperado o contradicción entre capas bloquea. Sin unstaged, working debe
coincidir con index en tamaño/hash y mode; MM/RM pueden diferir.

Snapshot V2:
`{schemaVersion:2, files:[{path, originalPath?, working, base, index}]}`.
Cada capa es null o `{mode,size,sha256,content}`; content es texto UTF-8 seguro
obtenido realmente. No se persisten blobs excluidos, parches crudos ni texto de
procesos. Separar capas evita confundir archivo actual con índice/base.
Metadata de disponibilidad base/index del envelope solo existe si esa capa
segura está serializada y ligada al snapshot por su hash; si no, null más
`BASE_CONTENT_UNAVAILABLE` o `INDEX_CONTENT_UNAVAILABLE`. Hash solo no acredita
contenido legible. Modes y detalles físicos quedan fuera del envelope cerrado.

Aplicar a TODAS las capas UTF-8 estricto, detección binaria y heurística de
secretos existentes, máximo 256 KiB por capa y 1 MiB de snapshot JSON total;
1000 rutas, 8 MiB por proceso, 30 s. Lecturas actuales acotadas a 64 MiB como V1;
blobs mayores se excluyen antes de cargarlos. Binarios/grandes/secretos generan
`BINARY`, `TOO_LARGE`, `POSSIBLE_SECRET`, más gaps de capa correspondientes.
No incluir prefijos parciales de contenido excluido. Excluir conservadoramente
todas las capas de una entrada si cualquiera resulta insegura, sin ocultar sus
razones; otras entradas seguras pueden permanecer solo si el estado no bloquea.
Fuera de alcance bloquea TODO el bundle antes de persistir cualquier texto.
La heurística tiene falsos negativos: revisión humana previa a entrega al modelo.

## Envelope, clasificación y publicación

Construir explícitamente el objeto cerrado V1 con `schemaVersion:1`,
`repository`, `issueNumber`, `approvedIssueSha256`, `branch`, `baseSha`, `headSha`,
`worktreeId`, `scope`, `inventory`, `diffSha256`, `snapshotSha256`,
`fingerprintSha256`, `checks`, `limitations`. Mapear inventario solo a campos
permitidos por `validateQaEnvelope()`. No convertir un manifest V1 existente.
El manifest exterior V2 contiene versión 2, envelope V1, resultado real
`{status,reasons,exportablePaths}`, metadatos V2 y límites; sin contenido crudo.
Nunca sustituir el resultado real del validador por una clasificación optimista.

Check fijo, incluso si hay JSON histórico PASS:
`{name:'verify-local',status:'NOT_RUN',source:{kind:'NOT_RUN',id:'not-run'},binding:'UNVERIFIED'}`.
No leer ni integrar reportes históricos; atestación y CI exacta son otro ticket.

| Estado | Consecuencia |
| --- | --- |
| BLOCKED | Sin envelope confiable, snapshot, manifest publicado ni exportablePaths; solo códigos seguros de diagnóstico |
| INSUFFICIENT_EVIDENCE | Evidencia privada revisable con gaps y razones; sin aprobación |
| QA_REVIEW | Solo semántica del contrato: evidencia revisable, nunca permiso |

Con checks NOT_RUN y limitaciones declaradas, V2 producirá normalmente
INSUFFICIENT_EVIDENCE aun con todas las capas disponibles. No vaciar limitations
ni fingir tests vinculados para obtener QA_REVIEW. Nunca emitir QA_PASS/APPROVED.

Captura y relecturas completas incluyen contexto, política, identidad Git,
índice, diffs de ambas capas, contenidos, ignored y metadatos físicos. Hash del
diff mantiene capas staged y unstaged; fingerprint cubre snapshot y captura sin
circularidad (no incluye su propio campo). Comprobar antes/después de construir,
después de persistir y antes de publicar. Revalidar envelope sobre bytes releídos.

Única escritura: temporal privado aleatorio fuera de ambos repositorios,
directorio 0700, archivos 0600 exclusivos. Escribir snapshot y manifest temporal,
releer bytes/hashes, repetir captura, publicar manifest por rename al final.
Cualquier fallo elimina únicamente el temporal propio y devuelve BLOCKED sin
ruta anunciada. Si limpieza falla, restos privados no consumibles; nunca entregar
un manifest de éxito tras error. No hay garantía de durabilidad ante corte de
energía ni exclusión de todo escritor hostil: lstat/open no equivale a openat
con cadena de handles. Requerir ausencia externa de escritores concurrentes;
las relecturas detectan cambios observables, no prueban aislamiento del SO.

Rollback de implementación: dejar de invocar V2; no modificar ni migrar paquetes
V1. No fallback automático, reparación de políticas ni mutaciones del repositorio.
Una política inválida se corrige solo por el operador en una acción independiente.

## Matriz de pruebas prevista (sin red)

| Grupo | Casos y resultado requerido |
| --- | --- |
| Legacy | Mantener casos V1 y límite #226/tres rutas, versión explícita |
| Política | Ausente/hash incorrecto/issue o referencias discrepantes, campos extra/duplicados, permisos/propietario incorrectos, carpeta pública, enlaces/hardlink: BLOCKED sin artefactos |
| Git real | M espacio, espacio M, MM, A espacio, ??, R espacio, RM, D espacio, espacio D, índice revertido en disco, inventario vacío, ignored; capas y hashes exactos |
| Scope | Ruta actual o anterior no permitida/prohibida, duplicación de origen rename: BLOCKED sin exportación parcial |
| Rutas/FS | Traversal, Unicode invisible, symlink padre/hoja, hardlink, junction/Windows, gitlink, filtros y flags ocultos: BLOCKED |
| Capas | Base/index ausentes: null y gap; contradicción sin unstaged: BLOCKED; binario/grande/secreto histórico o actual: sin bytes ni prefijos exportados |
| Identidad | Origin/rama/base/head/worktree/fingerprint incorrectos, checkout o dependencia sucia: BLOCKED |
| Procesos/carreras | Error/señal/stderr/truncado; cambios de working/index/HEAD/política/contexto durante checkpoints; errores de escritura/relectura/rename/limpieza: sin manifest de éxito |
| Checks | JSON histórico PASS no altera NOT_RUN/UNVERIFIED ni su source |
| Inmutabilidad | Antes/después comparar archivos, index, HEAD de repositorios; solo temporal propio y tres archivos autorizados en diff |

Fixtures Git locales y gh simulado exclusivamente en tests. Inyección de rutas,
procesos y checkpoints solo en contexto de pruebas, nunca mediante CLI/entorno
de producción. Ningún test ejecuta código propuesto, red, Codex o instalaciones.
Gates posteriores: node --check del recolector; test focal; suite Agents completa;
git diff --check y chequeo individual de untracked, en Ubuntu Node 24. Registrar
resultados reales, no asumir CI ni PASS por ejecutar un comando distinto.

## Compatibilidad, pruebas y límites de esta entrega

V1 conserva su formato de snapshot/manifest, sus reglas de clasificación y el
scope fijo de #226/tres rutas. Su CLI ahora exige `--version 1` antes de los
argumentos originales: las invocaciones antiguas sin versión fallan cerradas.
V2 exige `--version 2` y `--scope-sha`; no adapta manifests V1 ni intenta V1 si
V2 falla. Los consumidores deben elegir y validar la versión explícitamente.

Compatibilidad de fingerprint V1 (#226): la identidad física de cada archivo
que participa en `fingerprintSha256` conserva exactamente cuatro campos, en
este orden: `dev`, `ino`, `mtimeNs`, `ctimeNs` (strings). La ampliación de
identidad física de V2 utiliza nueve campos (`dev`, `ino`, `size`, `mtimeNs`,
`ctimeNs`, `mode`, `uid`, `gid`, `nlink`) únicamente para el cálculo V2 y las
verificaciones internas. No se debe reutilizar esa identidad extendida para
la preimagen V1, porque cambiaría huellas legacy para evidencia idéntica.
Una prueba reconstruye independientemente la preimagen V1 y comprueba el SHA-256;
también verifica que V2 conserva sus nueve campos.

Los únicos imports locales del recolector son `issue-contract.mjs`,
`qa-contract.mjs` e `issue-context.mjs`, desde el checkout del propio recolector;
se comprueba que ese checkout main esté limpio, incluidos ignorados. No se
importan dependencias del worktree propuesto. Los dos contratos consumidos no
se modifican.

Los tests permiten una identidad OS sintética mediante la API interna protegida
por `NODE_TEST_CONTEXT`. En ese caso verifican desde el home privado sintético,
pues el ancestro `/tmp` del harness es público. Producción no acepta esa identidad
por CLI ni variables de entorno: verifica desde `/` y usa `os.userInfo()` junto
con UID real/efectivo. No se considera `HOME` ni `XDG_STATE_HOME` como autoridad.
La API interna es para código de tests confiable; no aísla JavaScript hostil que
ya tenga ejecución bajo el UID del operador.

La consulta remota del issue #250 no estuvo disponible por restricción de red.
La matriz local y los requisitos confirmados guían estas pruebas; no se afirma
haber contrastado casos adicionales del cuerpo remoto. La suite completa, CI,
fallos específicos y riesgos deben registrarse con resultados reales al entregar.
No hay bundle real generado ni política aprobada. Checks históricos permanecen
NOT_RUN/UNVERIFIED, sin leer reportes de PASS. CI remota NOT_RUN; commit, push,
PR, merge y deploy no autorizados.

## Resultados locales de esta entrega (2026-11-05)

Node v24.20.0, Linux restringido. Sintaxis del recolector PASS. Prueba focal
con `node --test --test-isolation=none scripts/agents/qa-bundle.test.mjs`:
78/78 PASS. Incluye regresiones V1, capas Git reales, políticas sintéticas,
contenido inseguro del índice, referencias y carreras observables.
Suite Agents completa: 7 archivos PASS, 1 FAIL (`verify-local.test.mjs`).
Diagnóstico aislado de ese archivo: 29/30 PASS; el caso de proceso hijo espera
FAIL y obtiene BLOCKED, coincidiendo con el fallo preexistente documentado en
QA_CONTRACT_V1.md. No se cambia el ejecutor ni se declara el gate completo PASS.

La matriz anterior expresa el contrato de revisión, no una afirmación de que
cada fallo del SO esté reproducido. Queda revisión externa de permisos con
usuarios distintos, Windows/junctions (producción bloquea), fallo de limpieza y
carreras hostiles entre syscalls. Ninguna prueba local demuestra aislamiento
frente a un escritor del mismo UID. La cobertura exacta adicional del issue
remoto sigue sin verificarse por falta de conectividad.

## Correcciones de auditoría independiente (#250)

La preimagen de `fingerprintSha256` en V2 es `JSON.stringify(capture)` en UTF-8:
identidad Git (`branch`, `baseSha`, `headSha`, `worktreeId`), `repository`,
`issueNumber`, `approvedIssueSha256`, `scopeSha256`, `diffSha256` e inventario
completo con capas y metadatos físicos. `scopeSha256` es el SHA-256 de los bytes
exactos de la política verificada, sin normalización. Se conserva en el manifest
exterior V2 y en la preimagen; nunca se añade al envelope V1 cerrado. Cambiar
operador o solo un salto de línea de la política cambia la huella aun con el
mismo diff y snapshot. La política y el contexto se revalidan en cada captura.

Cada captura V2 consulta exactamente una vez `ls-files --stage -z` y una vez
`ls-tree -r -z <baseSha validado>`, incluso con inventario vacío. La tabla de
índice sirve tanto para las comprobaciones previas a status/diff como para las
capas. Las tablas viven únicamente dentro de esa captura; las cuatro capturas
de una publicación normal las reconstruyen. No hay caché entre comprobaciones
de frescura. Duplicados, registros malformados, ausencia del terminador NUL,
modos inválidos y más de 50 000 entradas por tabla bloquean toda la operación.

Además de los límites existentes, V2 limita la operación completa a 30 000
comandos, 64 MiB acumulados de stdout de procesos y 120 segundos medidos con
reloj monótono. Comprueba tiempo antes y después de cada proceso; conserva
30 segundos por proceso, 8 MiB por salida y rechazo de stderr/error/señal.
El plazo global no es un temporizador interruptor de operaciones síncronas:
el proceso en curso puede consumir su timeout antes de devolver BLOCKED.
Estos límites no amplían scope ni admiten evidencia parcial como éxito; un
exceso elimina el temporal propio y no anuncia manifest. V1 conserva sus límites
y su cálculo de huella anterior. Los checks siguen NOT_RUN/UNVERIFIED.

Pruebas adicionales: políticas semánticamente iguales con bytes distintos y
operadores distintos sobre el mismo diff; conteos para cero, uno y tres cambios;
carreras de índice justo después de leer cada tabla en cada una de las cuatro
capturas (incluidas las posteriores a persistir); duplicados, truncamientos,
límites de entradas, presupuesto agregado de salida y plazo global.

Validación de las correcciones de auditoría (2026-11-05, Node v24.20.0):

- `node --check scripts/agents/qa-bundle.mjs` y `node --check scripts/agents/qa-bundle.test.mjs`: PASS.
- `node --test --test-isolation=none scripts/agents/qa-bundle.test.mjs`: 98/98 PASS.
- `node --test --test-isolation=none scripts/agents/*.test.mjs`: 238/239 PASS;
  único fallo en `verify-local.test.mjs:270`, “process evidence captures an actual
  child exit (no network)”, esperado FAIL frente a BLOCKED. Ya documentado en
  QA_CONTRACT_V1.md; no se modifica el ejecutor ni se declara PASS global.
- `git diff --check`: PASS. Comprobación individual del documento aún untracked
  con `git diff --no-index --check /dev/null docs/engineering/QA_BUNDLE_V2.md`:
  sin diagnósticos de whitespace (código 1 por archivo añadido).

Logs locales de esta ejecución: `/tmp/issue-250-focal.log` y
`/tmp/issue-250-agents.log`. Solo los tres archivos autorizados figuran en el
estado Git. CI remota NOT_RUN. Sin commit, push, PR, merge ni deploy.
Persisten las limitaciones de escritores del mismo UID y carreras entre syscalls
ya descritas; las tablas por captura no constituyen aislamiento transaccional Git.
