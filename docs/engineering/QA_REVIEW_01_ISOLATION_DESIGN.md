# QA-REVIEW-01A — Diseño de aislamiento y contrato de seguridad (PR #260, Ready for Review)

**Proyecto:** Zaping Quality Agent
**Ticket:** [#258](https://github.com/gclp96/Zaping/issues/258)
**Fecha de corte:** 2026-11-08
**Base contractual fijada para revisión:** commit `83ca497c7a91cbe127b74a279e642749ac718c0c` (QA-BUNDLE V2); blob `qa-bundle.mjs` `af42de25a2948359e4c0a2315cade25c10cd3817`
**Tipo:** C — diseño/arquitectura; no ejecutable por el despachador V1
**Estado del documento:** en revisión humana mediante PR #260 (Ready for Review); alcance documental separado y aprobado por el propietario, pero diseño aún pendiente de aceptación formal; no habilita IA
**Dependencias:** [QA-01 #222](https://github.com/gclp96/Zaping/issues/222), [QA-CONTRACT-02 #246](https://github.com/gclp96/Zaping/issues/246), [QA-BUNDLE-02 #250](https://github.com/gclp96/Zaping/issues/250), [PR #256](https://github.com/gclp96/Zaping/pull/256)

> Este documento fue preparado inicialmente fuera del repositorio y después incorporado únicamente en la rama `docs/qa-review-01a-isolation` mediante el Draft PR #260, con el issue #258 reabierto por autorización del propietario. Su publicación documental no implica aprobación de seguridad, merge, ejecución de código propuesto, despliegue ni habilitación de un agente.

## 1. Decisión propuesta

Separar la recolección de evidencias, su validación determinista, la eventual inferencia y la decisión humana. Adoptar **Docker Desktop ejecutado por un operador confiable** como primera alternativa para laboratorios **sintéticos**, con imagen fijada por digest y endurecimiento adicional antes de uso real. **No autorizar todavía un revisor de IA sobre código real**. Mantener bloqueado Bubblewrap 0.9.0 de Ubuntu 24.04 como frontera de seguridad por CVE-2026-87766; `unshare` sin raíz privada tampoco basta.

El validador QA-REVIEW-01B se implementará antes del gateway/runtime QA-REVIEW-01C. No recibirá herramientas, credenciales, conexiones de red, worktrees ni directorios de Git: solamente bytes de un paquete y expectativas verificadas por un componente confiable. La aprobación de envío de código a un servicio remoto será **un gate humano separado**.

## 2. Diagrama de límites de confianza

```text
[Programador / worktree no confiable]
               |
               v
[QA-BUNDLE V2, ejecutado por operador confiable]
  - política externa OPERATOR, Git y contexto aprobados
  - inventario, snapshot.json y manifest.json
               |
        bytes capturados
               v
[QA-REVIEW-01B, validador PURO sin IO]
  - verifica esquema cerrado, hashes de bytes, scope,
    consistencia entre snapshot/manifest, checks y expectativas
  - NO certifica origen Git por sí solo
               |
     resultado / diagnóstico (NO permiso)
               v
[Operador: atestación de procedencia, relectura, revisión
 de secretos, aprobación de datos y gating de entrega]
               |
       solo si gates posteriores PASS
               v
[QA-REVIEW-01C, gateway confiable + runtime aislado]
  - runtime sin herramientas y sin acceso a worktree
  - si se autoriza inferencia remota, egress solo desde gateway
               |
               v
[Parser determinista de salida del modelo]
  - hallazgos consultivos, schema y evidencia validada
               |
               v
[Responsable humano]
  - decide correcciones / PR / merge / release
```

**Autoridades:**
- **Programador/propuesta:** puede producir contenido y diffs, nunca la política de acceso ni pruebas acreditadas.
- **Operador:** controla la selección de alcance, aprobación del ticket, preparación de evidencia y autorización expresa de transporte; no delega esas decisiones al texto del ticket o de la propuesta.
- **QA-BUNDLE V2:** recopila datos sin ejecutar código propuesto; no concede autorización.
- **QA-REVIEW-01B:** algoritmo puro para consistencia e integridad local de bytes. No autentica la procedencia ni declara QA aprobado.
- **Gateway/runtime 01C:** etapa futura con frontera de filesystem/proceso y, si se autoriza, red limitada al gateway. El modelo no obtiene shell ni tool calling.
- **Humano:** única autoridad final de cambios, publicación y aceptación.

## 3. Evidencia registrada en #258 y límite de cada PASS

| Prueba | Evidencia de laboratorio | Lo que **no** demuestra |
|---|---|---|
| `unshare --user --map-root-user` WSL2 | user namespace disponible | Aislamiento de FS, secretos o red del host |
| `unshare --user --mount --net` | namespaces distintos; UID 0 mapeado a UID 1000 del host | Root privado ni aislamiento de archivos |
| Lectura/escritura tras `unshare` | **FAIL:** lectura de `AGENTS.md` y escritura en HOME/runner seguían permitidas | No sirve como sandbox para revisor real |
| Docker efímero sin mounts | UID 65534, `--network none`, rootfs RO, sin capabilities, sin socket observado; escritura `EROFS` | Escape de contenedor, imagen confiable, ataque a daemon |
| Bind mount de fixture sintética RO | Lectura permitida; escritura sobre mount `EROFS` | Protección frente a modificación concurrente por el host |
| SHA-256 sintético host→contenedor→host | Los mismos bytes coinciden antes/dentro/después | Firma, origen, procedencia Git, protección TOCTOU o tests vinculados |

**Checkpoint:** PR #256 y QA-BUNDLE V2 tienen 99/99 focales y 240/240 de agentes PASS según las evidencias compartidas. Esos resultados NO acreditan un futuro paquete de propuesta. Los checks del envelope siguen `NOT_RUN/UNVERIFIED`.

## 4. Modelo de amenazas, controles y pruebas propuestas

| Amenaza | Límite/confianza comprometida | Control requerido | Evidencia/gate | Estado |
|---|---|---|---|---|
| Mismo UID operador/proponente | Cambio de política o evidencia desde host | Separación efectiva de identidad/permisos y origen confiable; no compartir directorios escribibles | Pruebas negativas de lectura/escritura al árbol del operador | **Bloqueador sin mitigación completa** |
| `unshare` con root FS compartida | Acceso HOME y checkout | No usar namespaces desnudos; raíz privada y mounts allowlisted | Prueba WSL2 FAIL documentada | **Confirmado** |
| Symlinks/hardlinks/reparse en staging | Escape de rutas o sustitución de bytes | Directorio creado por operador, rutas canónicas, archivo regular nlink=1, verificación de componentes y handles; no fuentes controladas por propuesta | Fixtures de enlaces y carreras | Pendiente |
| TOCTOU host ↔ bind RO | Cambios entre verificación y modelo | Crear copia privada inmutable por permisos/propietario, fijar bytes antes de entregar, rehash al abrir/tras consumo; detener ante cambios | Alteración controlada durante lectura y antes de publicación | Pendiente |
| Secreto no detectado | Difusión al modelo local/remoto | Heurística conservadora en todas las capas, cuarentena, revisión humana y clasificación de datos; sin log de payloads | Falsos negativos conocidos y fixtures de claves en base/index/working | Pendiente |
| Prompt injection en código/diff/log | Cambio de políticas o invocación de herramientas | Contenido de propuesta es *dato*, no instrucción; el modelo no tiene tools; postvalidador descarta órdenes/autorizaciones | Fixtures que ordenan ignorar reglas, publicar, usar shell o elevar PASS | Pendiente |
| Salida JSON hostil | Hallazgos falsos, rutas inexistentes, status autoaprobatorio | Parser estricto, límites de bytes/hallazgos, paths y líneas verificables, status derivado por host, no por modelo | JSON malicioso, duplicados, Unicode, oversize y referencias falsas | Pendiente |
| Fuga por red o canal host | Código, credenciales o contexto exfiltrados | Runtime sin red, secretos, socket Docker, montajes host; gateway remoto aislado y supervisado | Intentos de conexión, acceso a sockets, PATH/HOME, mounts y env | Parcial, sintético |
| Escape de contenedor/daemon | Acceso al host Docker o Windows | Imagen fijada por digest, configuración endurecida, seccomp, no new privileges, capabilities=0, sin privilegios, sin socket, límites y mantenimiento de versiones | Inspección de contenedor/host, negative tests, threat review | Pendiente |
| Metadatos/hash falsos | Atribuir artefactos a issue o checks distintos | 01B coteja bytes y declaraciones; operador comprueba proveniencia y revisión/alcance; nunca confiar en hashes solos | Tamper de manifest/snapshot/alcance, hash consistente falsificado | Pendiente |
| Resultados CI históricos | Falso PASS en diff sin commit | Rechazar check no vinculado; mantener `NOT_RUN/UNVERIFIED` | Fixture de CI con otro SHA y PASS histórico | Contrato disponible; gate 01B pendiente |

## 5. Elección de runtime

| Alternativa | Ventaja | Limitación | Decisión |
|---|---|---|---|
| `unshare` solo (WSL2) | Disponible y rápido | Se comprobó lectura/escritura sobre HOME; no provee rootfs privada | **Rechazado** como aislamiento completo |
| Bubblewrap candidato Ubuntu 24.04 `0.9.0-1ubuntu0.3` | Diseñado para sandboxing | Noble continúa vulnerable a CVE-2026-87766; arreglos de symlink revertidos | **No instalar/usar** como frontera fiable |
| Docker Desktop Linux | Laboratorio sintético probado; controles RO/red/UID | Daemon privilegiado, kernel compartido, mounts alterables desde host, imagen y políticas aún sin atestar | **Candidato para laboratorio**, no aprobación operativa |
| VM dedicada / host separado | Frontera más fuerte y aislamiento de credenciales | Mayor costo operativo | Alternativa preferente si threat model exige fuerte separación frente al host/operador |

**Perfil mínimo futuro para Docker (solo bajo ticket 01C y autorización):** imagen pinneada por digest y revisada; entrada solo mediante staging privado autorizado; sin mounts del checkout/HOME/`.git`/políticas/socket Docker/WSL/Windows; `--network none` para el revisor; usuario no-root, rootfs RO, `--cap-drop ALL`, `no-new-privileges`, seccomp, PIDs/CPU/memoria limitados, sin `--privileged`, `--env-file`, publicación de puertos ni acceso al daemon. Verificar controles **desde dentro**. Evitar que el revisor pueda alterar montajes, controles o rutas. El gateway, si se habilita, será un proceso confiable distinto y su salida de red tendrá un destino y política explícitos.

**Política externa de modelos:** el propietario autoriza por separado el proveedor/entorno, identidad de datos, fragments permitidos, confidencialidad/retención, credencial del gateway, destino y revocación. Sin autorización solo fixtures sintéticas/offline. No existe aprobación implícita por terminar 01A o 01B.

## 6. Contrato de entrada QA-REVIEW-01B

### 6.1 Datos recibidos como bytes, no como rutas

Una función pura futura recibirá:

```text
validateQaBundleV2({
  manifestBytes: Uint8Array,
  snapshotBytes: Uint8Array,
  approvedScopeBytes: Uint8Array,
  expected: {
    repository, issueNumber, approvedIssueSha256, scopeSha256,
    branch, baseSha, headSha, worktreeId
  }
}) -> { status, reasons, verified, limitations }
```

`expected` y `approvedScopeBytes` deben llegar por canal de operador verificado independiente de la propuesta. El llamador no puede rellenarlos leyendo los campos del propio manifest. Esta API **no** lee archivos, Git, red ni usuarios; tampoco es un sandbox. El operador es responsable de la lectura segura, relectura y cadena de custodia.

`manifest.json` V2 real: `schemaVersion:2`, `scopeSha256`, `envelope` V1, `result:{status,reasons,exportablePaths}`, `metadata`, `limits`. `snapshot.json` V2 real: `schemaVersion:2`, `files:[{path,originalPath?,working,base,index}]`. Cada capa disponible lleva `{mode,size,sha256,content}`; las ausencias son `null`. El validador reutilizará `validateQaEnvelope()` **sin modificarlo** y comprobará que el resultado guardado coincida exactamente con el resultado derivado. **Además deberá verificar el perfil exacto del productor QA-BUNDLE V2 actual**, no solo un envelope V1 estructuralmente aceptable: un envelope falsificado podría contener un `PASS` aparentemente vinculado y `QA_REVIEW` aunque el recolector actual jamás lo emite. La validación debe rechazar claves duplicadas y campos ajenos (incluidos en objetos anidados), UTF-8 inválido, BOM no permitido, entradas enormes, rutas peligrosas y arrays inconsistentes. Se debe preservar la semántica del colector tal como está implementada, no reinterpretar V1 legacy.

### 6.2 Niveles distintos de afirmación

1. **Esquema:** JSON cerrado y tipos válidos.
2. **Integridad de los bytes recibidos:** hash SHA-256 sobre los bytes crudos de `snapshot.json` igual a `envelope.snapshotSha256`; por capa, SHA-256 del UTF-8 de `content` coincide con `sha256` y con tamaño; ninguna capa excluida contiene texto filtrable.
3. **Coherencia interna:** políticas, `manifest.result`, inventory, metadata, snapshot files y extremos de rename concuerdan; `scopeSha256` equivale a los bytes externos de política; reconstrucción exacta del fingerprint de captura **solo si** se especifica y prueba el preimagen/order de serialización del colector V2 fijado (no aceptar una canonicalización nueva como equivalente). Una discrepancia bloquea.
4. **Procedencia y frescura:** NO demostrables solo con los JSON. `diffSha256` se calculó del diff Git interno no exportado: 01B no puede recalcularlo sin los bytes originales. `worktreeId`, `approvedIssueSha256` y `scopeSha256` son declaraciones salvo vínculo externo del operador. Tampoco puede probar ausencia de escritor hostil. La atestación externa y el gate de relectura corresponden al operador/01C; no marcar estos puntos como PASS por integridad interna.

**Límites base del código existente:** 1,000 rutas, 256 KiB por capa revisable, 1 MiB para `snapshot.json`, política de máximo 64 KiB. El límite de `manifestBytes` deberá ser adicional y explícito (propuesta de ticket 01B: 2 MiB). Los límites de ejecución son independientes y ya están documentados: `timeout: 30000` (30 segundos **por proceso**) en cada invocación, y `V2_LIMITS.durationMs: 120000` (120 segundos **para la operación completa**) verificado antes y después de cada proceso. El plazo global no interrumpe una syscall síncrona en curso; no existe discrepancia entre ambos valores.

### 6.3 Resultados

| Estado | Cuándo | Acción permitida |
|---|---|---|
| `BLOCKED` | Esquema/hash/identidad/política contradictorios, ruta no permitida, contenido filtrado, inconsistencia o tampering | No entregar al modelo ni reportar rutas exportables |
| `INSUFFICIENT_EVIDENCE` | Datos seguros pero incompletos, checks no vinculados, limitaciones declaradas, capas ausentes | Diagnóstico consultivo con faltantes; nunca PASS ni envío automático |
| `QA_REVIEW` | Semántica estricta de QA-CONTRACT sin razones | Paquete estructuralmente revisable; NO aprobación, credencial ni permiso de transmisión |

**Advertencia crítica:** QA-BUNDLE V2 agrega `NOT_RUN/UNVERIFIED` y limitaciones; por tanto su estado habitual correcto es `INSUFFICIENT_EVIDENCE` incluso si los bytes concuerdan. 01B debe **aceptar y conservar esa insuficiencia**, no cambiarla a `QA_REVIEW` para permitir un piloto. `NEEDS_CHANGES` corresponde exclusivamente al veredicto consultivo del revisor posterior (01C/PILOT), nunca a una prueba que 01B no ejecuta.


### 6.4 Controles contra suplantación de un bundle V2

01B validará el **perfil de salida fijado del recolector actual**, además del contrato genérico `validateQaEnvelope()`:

- `envelope.checks` tendrá exactamente un `verify-local` con `status: NOT_RUN`, `source: {kind: NOT_RUN, id: not-run}` y `binding: UNVERIFIED`. Rechazar como `BLOCKED` cualquier PASS, check adicional, nombre alternativo o supuesto atestado, aunque `qa-contract.mjs` acepte checks vinculados en abstracto. Un cambio legítimo de productor necesita otro contrato/ticket.
- `envelope.limitations` conservará las tres limitaciones exactas publicadas por QA-BUNDLE V2 en esta versión; no permitir que un emisor las elimine para fabricar `QA_REVIEW`. `manifest.limits` también deberá coincidir con el perfil V2 real revisado, incluida la configuración de duración declarada.
- Reconstruir `fingerprintSha256` únicamente con el **orden de propiedades** que utiliza `capture()` en `qa-bundle.mjs`: `branch,baseSha,headSha,worktreeId,repository,issueNumber,approvedIssueSha256,scopeSha256,diffSha256,inventory`. Para cada entrada de `inventory`, reconstruir el orden `path,status,originalPath?`, después `size,sha256,identity,working,base,index,excluded,evidenceGaps`; verificar estrictamente que `metadata` no añade, omite ni reordena semánticamente datos. Hash de `JSON.stringify(before)` sobre UTF-8, sin canonicalización inventada.
- Los números de inode, permisos, propietario y tiempos que aparecen declarados en `metadata.identity` son datos para consistencia interna, **no prueba de un sistema de archivos real**. Los bytes y las expectativas del operador siguen sujetos a un gate independiente de procedencia y frescura. Un atacante que controla todos los inputs puede generar hashes autoconsistentes.
- El analizador de JSON duplicado debe ser **consciente de la estructura y los escapes**, no una expresión regular sobre todo el documento: texto de código que contiene `"{\"x\":1}"` es un valor de cadena, no un segundo objeto de política. Pruebas de claves repetidas en todos los niveles y claves escapadas equivalentes.

Con estas restricciones, un bundle válido emitido por la versión actual de QA-BUNDLE V2 continuará normalmente `INSUFFICIENT_EVIDENCE`, aun cuando la integridad verificable sea correcta. **01B valida un artefacto, no concede permisos para un modelo.**

## 7. Contrato futuro de salida del modelo (01C, NO implementar en 01A/01B)

Salida candidata JSON con identidad del paquete, `findings[]` y `limitations[]`. Hallazgo: `id`, `severity: BLOCKER|HIGH|MEDIUM|LOW`, `confidence` explícita, `path`, `line`, `claim`, `evidence`, `reproduction`, `recommendation`. Limitar cantidad/longitud; validar que cada ruta/línea/evidencia procede del snapshot y no del contexto no autorizado. No aceptar campos de herramientas/acciones, shell, URLs de exfiltración o permisos. El modelo NO determina la clasificación de seguridad del paquete ni acredita checks: un parser confiable deriva un reporte consultivo `NEEDS_CHANGES`, `INSUFFICIENT_EVIDENCE` o `QA_REVIEW`. `QA_PASS`, `APPROVED`, merge, commit, issue y deploy quedan prohibidos.

## 8. Gates de aceptación y pruebas adversariales

- **Gate A (documental, #258):** aprobar diagrama, matriz de amenazas, mecanismos de autorización, decisión de runtime y amenazas residuales; revisar el diff del único documento permitido en rama separada. `main` sin cambios.
- **Gate B (QA-REVIEW-01B):** pruebas puras sintéticas de bytes, políticas, JSON hostil, hashes, rutas, metadata/snapshot/envelope, serialización de fingerprint, `NOT_RUN` persistente, tampering y no ejecución de código. Sin IO ni red.
- **Gate C (QA-REVIEW-01C):** staging privado del operador, relecturas/TOCTOU, aislamiento real con fixtures, no accesos HOME/Git/socket/Windows, control de network, ausencia de tools, contención y parser de resultados. Gate humano explícito de datos para LLM externo.
- **Gate D (QA-PILOT-01):** piloto separado con un defecto reproducible y un falso positivo conocido, ambos en fixtures autorizadas. Registrar precisión, rechazo de alucinaciones, costes y latencias. El piloto real requiere autorización específica posterior.

**Parada inmediata:** fuga de contenido fuera de allowlist, lectura de host, escritura no permitida, salida a red inesperada, cambio de bytes/identidad, secreto detectado, contradicción Git/política, permiso de escritura inadvertido, uso de credentials, intento de ejecutar tools, error de limpieza o ambigüedad de origen. Fail-closed con razones seguras, no imprimir contenido.

**Rollback:** suspender invocación del nuevo validador/revisor sin mutar QA-BUNDLE V2; eliminar solo el staging efímero propio por proceso confiable; revocar credenciales/gateway si se hubiera habilitado; dejar evidencia de fallo y no actualizar issues/PRs automáticamente. Cualquier corrección de política solo la realiza el operador en un cambio independiente.

## 9. Desglose en tickets

1. **QA-REVIEW-01B:** validador puro determinista para manifest+snapshot QA-BUNDLE V2, sin IO, LLM, Git, docker ni acciones. Dependiente de aceptación humana de 01A.
2. **QA-REVIEW-01C:** loader/atestador y gateway con staging privado y aislamiento verificable; pruebas adversariales sintéticas; ninguna inferencia real sin aprobación de datos y seguridad.
3. **QA-PILOT-01:** análisis consultivo controlado de defecto y falso positivo, contrato y permiso de ejecución explícitos; nunca PR/merge automático.

## 10. DoR, DoD y puntos pendientes

**DoR #258:** revisar contratos #222/#246/#250 y el laboratorio WSL/Docker; alcance documental solamente; autor identificado; hechos y restricciones trazables.

**DoD documental #258 (separación de alcance autorizada):** especificación y threat model revisados y aceptados por el propietario; riesgos residuales, límites de evidencia sintética, gates y rollback documentados; AC-02/AC-03 operativos asignados a 01C/PILOT, sin afirmar que sus pruebas ya pasaron; diff documental inspeccionado y PR integrado exclusivamente bajo autorización humana posterior. Cerrar un issue en GitHub no equivale a cumplirlo ni a autorizar runtime de IA.

**Pendientes que impiden declarar seguridad aprobada:** pruebas adversariales de prompt/output JSON; staging privado y TOCTOU; host/daemon/imagen endurecidos y atestados; clasificación confidencial y aprobación de modelo remoto; definición del punto de relectura del operador; verificar experimentalmente el límite temporal global al implementar el runtime futuro, sin reinterpretar los dos límites existentes. Durante la preparación autorizada del Draft PR #260, el issue #258 fue reabierto y el documento se agregó exclusivamente a una rama separada; el documento aún no se ha integrado a `main`. La aceptación de diseño y el merge permanecen pendientes de revisión y autorización humanas.

**Decisión humana de alcance (08/11/2026):** #258 conserva como DoD exclusivamente la especificación arquitectónica y su revisión formal; las verificaciones operativas de AC-02 (host, permisos, aislamiento) y AC-03 (prompt injection/parser) son gates bloqueantes de QA-REVIEW-01C y QA-PILOT-01. No se han transferido sus resultados ni se ha concedido permiso de uso de IA. La aceptación del diseño, el merge y el cierre de #258 siguen sujetos a decisiones humanas posteriores.

## 11. Evaluación contra los ocho criterios del issue #258 (sin aprobación automática)

| AC | Estado a fecha de corte | Evidencia y límite |
| --- | --- | --- |
| AC-01 Amenazas y controles | **Documentado** | Matriz de §4; incluye límites, pruebas requeridas y amenazas residuales. |
| AC-02 Diseñar aislamiento host/HOME/Git/socket | **Diseño documentado; gate operativo pendiente en 01C** | Laboratorio sintético sin mounts comprobó rutas de host ausentes, UID no root y escritura EROFS; pruebas negativas exhaustivas y separación de origen/UID siguen siendo obligatorias en 01C antes de IA real. |
| AC-03 Diseñar defensa ante prompt injection | **Plan documentado; gates operativos pendientes en 01C/PILOT** | Fixtures hostiles, ausencia de tools y postvalidador descritos en §4/§7/§8. No se ejecutó modelo ni parser real: pruebas adversariales de gateway/parser en 01C y piloto con fixtures en QA-PILOT-01. |
| AC-04 Integridad y transporte | **Diseñado / prueba parcial** | SHA de fixture antes/dentro/después PASS; no demuestra procedencia Git, scope real ni protección total TOCTOU. |
| AC-05 Política LLM remoto | **Documentado** | §5 exige autorización humana de proveedor, datos y confidencialidad; ninguna autorización otorgada. |
| AC-06 Hallazgos consultivos | **Documentado / implementación posterior** | §7 contiene formato, severidades, confianza y evidencia; parser y tests quedan para 01C. |
| AC-07 DoR/DoD, stop, rollback | **Documentado** | §8–10; no se ejecutaron cambios productivos por esta revisión. |
| AC-08 Revisión humana | **En curso** | Documento incluido en PR #260, Ready for Review; diff documental cotejado; faltan la revisión y aceptación humanas del contenido. |

**Dictamen:** apto para revisión documental de arquitectura en el PR #260. El propietario autorizó expresamente separar AC-02/AC-03 **de diseño** (en #258) de sus pruebas operativas **aún pendientes** (01C/PILOT). Esta decisión no constituye aceptación formal del contenido, cierre de #258 ni aprobación del runtime. Nunca declarar un PASS que no se ha observado.

**Invariantes de publicación:** incluir solo `docs/engineering/QA_REVIEW_01_ISOLATION_DESIGN.md`; no tocar `main` directamente, no asignar `agent:ready`, no habilitar modelos, no crear políticas, no alterar CI, no publicar código real. La reapertura de #258 y la creación de rama/PR fueron autorizadas; el merge, la aceptación del diseño y el cierre del issue requieren decisiones humanas separadas.

## 12. Referencias de verificación

- GitHub: [issue #258](https://github.com/gclp96/Zaping/issues/258); [QA-BUNDLE V2](https://github.com/gclp96/Zaping/blob/main/docs/engineering/QA_BUNDLE_V2.md); [QA-CONTRACT V1](https://github.com/gclp96/Zaping/blob/main/docs/engineering/QA_CONTRACT_V1.md); [qa-contract.mjs](https://github.com/gclp96/Zaping/blob/main/scripts/agents/qa-contract.mjs); [qa-bundle.mjs](https://github.com/gclp96/Zaping/blob/main/scripts/agents/qa-bundle.mjs).
- Ubuntu: [CVE-2026-87766](https://ubuntu.com/security/CVE-2026-87766); [USN-8779-2](https://ubuntu.com/security/notices/USN-8779-2); [advisory upstream](https://github.com/containers/bubblewrap/security/advisories/GHSA-pxhw-h44j-8pfx).
- Docker: [Engine security](https://docs.docker.com/engine/security/); [seccomp](https://docs.docker.com/engine/security/seccomp/).

**Control de versión:** documento publicado solamente en la rama del PR #260 (Ready for Review), aún no aceptado ni integrado en `main`. Tras cada cambio debe verificarse CI sobre el nuevo HEAD; el CI histórico no se extrapola. No se ejecutaron modelos ni pruebas de propuestas reales. Antes de autorizar 01B deben revisarse los invariantes exactos del productor y formalizar el contrato de ticket.