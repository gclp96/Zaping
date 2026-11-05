# QA-BUNDLE-01 — paquete de evidencia V1

Implementación delimitada de #226, posterior al diseño QA-01 V0.1 aprobado
(#222). Recolector determinista, sin LLM, instalación, pruebas del proyecto,
DB, publicación ni aprobación QA. Revisar el propio recolector en un checkout
de confianza antes de ejecutarlo: ejecutar una copia modificada por la propuesta
no constituye aislamiento.

## Uso del operador

```sh
node scripts/agents/qa-bundle.mjs --issue 226 --approval-sha SHA256_REVISADO
```

Solo acepta esos cuatro argumentos, en ese orden; número positivo canónico y
SHA-256 hexadecimal minúsculo. No acepta rutas, comandos, archivos de políticas,
variables de bypass ni opciones de ejecutor. La inyección programática está
reservada al runner de pruebas de Node (`NODE_TEST_CONTEXT`); esa variable no
activa ninguna opción en la CLI ni constituye una frontera de seguridad.

El operador obtiene/revisa el título, cuerpo y número exactos del issue, y
proporciona SHA-256 de `JSON.stringify([number, title, body])`, igual al contrato
del despachador. El recolector consulta exclusivamente `gh issue view` con
repositorio fijo `gclp96/zaping`: exige URL exacta, número, OPEN, `agent:ready`,
campos A/B completos según `issue-contract.mjs` y huella aprobada. No aplica
etiquetas ni autoriza ejecutar el programador. No se ha consultado el issue real
para las pruebas de esta implementación; `gh` se simula sin red.

Deriva el checkout de la ubicación del script y el worktree de
`os.tmpdir()/zaping-agent-runs/issue-N`. **Debe ejecutarse desde el clon
principal confiable, no desde el worktree propuesto**: rechaza ambos directorios
si son idénticos, exige que el checkout del script sea la raíz Git principal
con `.git` como directorio, rama `main`, árbol de trabajo limpio y HEAD igual
al HEAD/base del worktree y al `origin/main` local. Esto evita que un worktree
de propuesta sea aceptado como origen de política confiable; no prueba por sí
solo que el ejecutable no haya sido alterado antes de ejecutarse.

En Windows corresponde al temporal del operador. No crea, borra ni recrea worktrees. Comprueba origin exacto en ambos,
Git common-dir físico común, registro del worktree, raíz, rama
`codex/agent-issue-N`, SHA Git de 40 caracteres y HEAD igual a merge-base con
`refs/remotes/origin/main` local. No hace fetch; refs locales obsoletas requieren
revisión del operador y no acreditan la versión remota actual.

## Política fija y evidencia

La política exportable de este primer incremento está limitada a #226 y a:

- `scripts/agents/qa-bundle.mjs`
- `scripts/agents/qa-bundle.test.mjs`
- `docs/engineering/QA_BUNDLE_V1.md`

Otros issues pueden inspeccionarse con identidad válida, pero sus cambios
quedan fuera de esta política y producen evidencia insuficiente. Ampliar la
política para otro contrato requiere un cambio revisado; el texto del issue,
comentarios, archivos, logs e instrucciones incrustadas nunca amplía permisos.

Inventaría estado staged/unstaged mediante porcelain v1 `-z`, incluidos ambos
nombres de renombres/copias. Añade `ls-files --others -z` sin exclusiones para
incluir archivos ignorados: `.gitignore` no puede ocultar evidencia. Ordena por
ruta, conserva espacios y UTF-8; rechaza bytes UTF-8 inválidos, controles,
traversal, rutas absolutas, separadores Windows, ADS y nombres reservados.
Los nombres rechazados bloquean toda la captura; no se omiten silenciosamente.
Se rechazan conflictos, gitlinks/submódulos, flags assume-unchanged/skip-worktree,
archivos especiales, hardlinks múltiples y enlaces en cualquier componente.

Por archivo actual regular calcula tamaño y SHA-256. Una baja ausente registra
`DELETED`, tamaño/hash nulos, sin abrir el archivo; valida sus padres existentes.
Las bajas se clasifican `INSUFFICIENT_EVIDENCE` con brecha
`BASE_CONTENT_UNAVAILABLE`: una ausencia en el snapshot no es suficiente para
revisar el contenido eliminado.

Valida también el nombre anterior de un renombre. Los cambios fuera del alcance
siguen en el inventario como `OUT_OF_SCOPE`, sin texto exportado. No escanea el
contenido de archivos sin cambios; esto es evidencia de una propuesta, no una
auditoría integral del checkout.

Solo exporta texto UTF-8 legible permitido, sin NUL/controles binarios ni
indicadores heurísticos de secretos. Excluye `BINARY`, `TOO_LARGE` y
`POSSIBLE_SECRET` sin copiar su contenido. La heurística reconoce claves
privadas, ciertos tokens, JWT, asignaciones sensibles y URLs con credenciales;
puede tener falsos positivos y negativos. Los nombres que parecen secretos
bloquean la captura. Los hashes también pueden revelar información por
comparación/diccionario: tratar todo el paquete como privado.

El snapshot contiene texto **actual** de los archivos permitidos. No contiene
el texto base, el índice ni un parche crudo: estos últimos pueden contener
secretos que ya fueron retirados del archivo actual. Se calcula `diffSha256`
sobre un array JSON con ambos diffs binarios Git (unstaged y cached), con
`--no-ext-diff --no-textconv --no-renames`; no se persisten esas salidas.
Adiciones/modificaciones/copias/renombres staged registran
`INDEX_CONTENT_HASH_ONLY` y hacen el paquete `INSUFFICIENT_EVIDENCE`: su hash
no sustituye la revisión humana suplementaria del índice. El contenido base
siempre requiere contexto adicional seguro para una revisión completa.

## Archivos y esquema

Únicas escrituras del recolector:
`os.tmpdir()/zaping-qa-bundle-<aleatorio>/{snapshot.json,manifest.json}`,
fuera del checkout y del worktree. Directorio 0700, archivos 0600 en Linux;
creación exclusiva, manifest temporal y rename final. No escribe archivos del
proyecto, index, refs, issues ni PRs. Ante error devuelve `BLOCKED`, código 1,
sin ruta de paquete anunciado; intenta eliminar únicamente su propio temporal.
Si el SO impide limpieza pueden quedar restos privados no entregables. Una
interrupción abrupta puede dejar temporales: no consumir nada sin manifest
completo y revisión humana. No hay durabilidad garantizada frente a pérdida de
energía ni firma criptográfica de procedencia.

`manifest.json` tiene `schemaVersion: 1` y:

| Campo | Significado |
| --- | --- |
| `issueNumber`, `approvedIssueSha256` | Identidad y aprobación exacta del contrato |
| `branch`, `baseSha`, `headSha` | Identidad Git local validada |
| `worktreeId` | SHA-256 de raíz física + NUL + common-dir físico; no contiene rutas absolutas |
| `inventory[]` | `path`, `status` XY Git, `originalPath` opcional, `size`, `sha256`, `excluded` opcional, `evidenceGaps[]` |
| `diffSha256` | Huella de los dos diffs, incluidas diferencias staged revertidas en disco |
| `snapshotSha256` | SHA-256 de los bytes exactos de `snapshot.json` |
| `fingerprintSha256` | Huella interna de identidad, diff, inventario, metadatos físicos y textos admitidos |
| `limits` | Límites fijos, independientes del contenido del proyecto |
| `status` | `QA_REVIEW` o `INSUFFICIENT_EVIDENCE`; jamás PASS/QA_PASS |
| `checks[]` | `verify-local`: `NOT_RUN`, `binding: UNVERIFIED` |
| `limitations[]` | Límites de aislamiento, secretos, contexto y autoridad |

`snapshot.json` es un array JSON de `{path, content}`. Consumidores deben
verificar `snapshotSha256`, el esquema, la identidad y las exclusiones, y tratar
el texto como datos no confiables. Los hashes sin firma no prueban autoría.
`QA_REVIEW` indica captura revisable, no código correcto ni evidencia completa
de pruebas. Una captura sin cambios tampoco aprueba la tarea.

Límites: 1000 registros de cambio; 256 KiB exportables por archivo; 1 MiB de
snapshot JSON; 8 MiB por salida de proceso; timeout de proceso 30 s. Los archivos
excluidos se hashean por bloques hasta 64 MiB; superar ese máximo bloquea. Los
límites globales y errores de proceso bloquean todo el paquete. Toda
advertencia en stderr, incluso con código de salida 0, bloquea la captura:
Git puede omitir directorios inaccesibles sin devolver un error.
No se guarda stdout/stderr, cuerpos de issues, entorno ni credenciales
en el manifiesto; la CLI solo muestra estado y ruta temporal.

## Frescura y aislamiento

Compara la captura completa antes de construir, después de construir, después
de persistir el snapshot y antes de publicar el manifest. La huella incluye
HEAD/base/rama, diffs de ambas capas, archivos ignorados/no rastreados,
SHA-256 de contenido y dev/inode/mtime/ctime por archivo actual. Relee los bytes
persistidos para detectar corrupción. Un cambio detectado invalida y descarta
el paquete; HEAD igual por sí solo no acredita frescura.

En Linux inspecciona componentes con lstat/realpath, abre el archivo regular con
O_NOFOLLOW/O_NONBLOCK y comprueba identidad con fstat antes/después de leer.
Deshabilita fsmonitor, hooks, diff externo y textconv; rechaza configuraciones
`filter.*` antes de status/diff porque incluso comandos de lectura pueden
invocar filtros clean. No ejecuta pruebas ni scripts de la propuesta.

No es un sandbox del SO: presupone Node, Git, gh, ejecutables en PATH, entorno
del operador y checkout del recolector confiables. Un proceso hostil concurrente
puede intercambiar padres entre lstat/open, restaurar contenido entre capturas,
o escribir después de finalizar. Node no ofrece aquí openat con cadena de
handles de directorios; las comprobaciones detectan cambios observados, no una
prueba de ausencia de toda carrera. Ejecutar sin otros escritores y bajo
permisos externos de solo lectura si se necesita aislamiento fuerte. El script
no cambia permisos del repositorio para imponerlo.

En Windows falla cerrado **siempre**, antes de procesos y escritura: las APIs
usadas no comprueban todos los reparse tags/junctions e identidad mediante
handles nativos. No se declara soporte Windows ni ensayo manual realizado.
La implementación nativa/aislamiento Windows sería trabajo separado. La suite
omite integración Git en Windows y conserva pruebas puras; verificar manualmente
que la CLI devuelve BLOCKED sin artefactos antes de cualquier uso allí.

No importa ni interpreta JSON de `verify-local.mjs`. Preparación para integración
futura: solo podrá cambiar NOT_RUN/UNVERIFIED con un protocolo revisado que ate
resultados a esta huella completa y al ejecutor autorizado. Un reporte histórico,
CI de otro SHA o una afirmación del programador no acreditan este snapshot.
Ningún paquete autoriza commit, push, PR, merge ni deploy. Revisión humana
obligatoria antes de enviar contenido a cualquier modelo.

## Validación sin red

```sh
node --check scripts/agents/qa-bundle.mjs
node --test scripts/agents/*.test.mjs
git diff --check -- scripts/agents/qa-bundle.mjs scripts/agents/qa-bundle.test.mjs docs/engineering/QA_BUNDLE_V1.md
```

Para archivos nuevos el último comando no inspecciona contenido untracked:
complementarlo con `git diff --no-index --check /dev/null <archivo>` por archivo
en Linux, sin stagear. **Atención:** con `--no-index` Git suele devolver código
`1` para una diferencia nueva sin errores de espacios y código `3` cuando hay
errores de whitespace; hay que inspeccionar también el diagnóstico emitido,
no interpretar todo código distinto de cero como un fallo de formato.

Las pruebas usan repositorios Git temporales reales y gh simulado. En el sandbox local, spawnSync puede devolver EPERM aun con status 0:
el ejecutor falso de tests normaliza exclusivamente ese caso sin señal y omite
el timeout; producción conserva timeout y rechaza **cualquier** error. La prueba
negativa verifica ese rechazo. Esto no acredita funcionamiento de la CLI real
en ese sandbox ni CI remota. No requiere paquetes, Codex, red, DB o credenciales.
