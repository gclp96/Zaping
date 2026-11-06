# ZFILES-R2-03B1 — ClamAV INSTREAM en laboratorio aislado

**Estado:** laboratorio por revisar, no activado. **Issue #209.**

## Alcance y límites de confianza

El PR #206 ya demostró escritura y relectura privada QA del PDF sintético de **110 bytes** en `zaping-quarantine-qa`. Eso prueba transporte e integridad, **no seguridad antimalware**. Este incremento introduce únicamente el cliente de protocolo ClamAV `INSTREAM` en `app/api/src/config`, **sin registrarlo como proveedor de NestJS, sin acceso R2, Prisma, controladores ni servicios de usuario**.

El cliente consume bytes sintéticos exclusivamente en pruebas; interpreta **solo** las respuestas:
- `stream: OK\0` → `CLAMD_OK_UNATTESTED` (resultado **no confiable** para autorizar descarga).
- `stream: <nombre> FOUND\0` → `MALWARE_DETECTED` (indicador de detección sin exponer la firma).
- Respuesta ambigua, ERROR, socket inalcanzable, desconexión, tamaño excedido o timeout → **error fail-closed**.

No se genera `CLEAN`, no se escribe estado `AVAILABLE`, no se emiten certificados, y **no se promueve ni elimina un objeto**.

## Protocolo y límites

- Unix-domain socket absoluto, sin TCP a clamd y sin rutas proporcionadas por el usuario.
- `zINSTREAM\0`, frames con prefijo de **4 bytes big-endian**, payload máximo **64 KiB** por frame y frame terminal de longitud cero. La documentación de ClamAV exige este framing.
- Entrada estrictamente `Buffer`, entre **1 B** y **10 MiB**, consistente con el límite de Zaping Files V1.
- Timeout por escaneo, tope de respuesta de 512 bytes, respuesta terminada en NUL. Las excepciones solo contienen mensajes fijos, sin nombre de malware, paths, claves de objeto ni bytes.
- Un socket local no demuestra aislamiento de contenedor ni autorización de procesos. Las pruebas unitarias simulan el protocolo con un daemon falso. **No ejecutan ClamAV real** ni prueban firmas actualizadas.

## Diseño pendiente para R2-03B2 y 03B3

1. **R2-03B2 — Real ClamAV QA:** servicio oficial ClamAV aislado (imagen fijada por versión/digest revisado; no puertos públicos), socket compartido con cliente de laboratorio; tests reales PDF/JPEG sintéticos, EICAR inofensivo, daemon ausente, límites de INSTREAM y readiness `PING/VERSION`. La imagen oficial requiere memoria de varios GiB; el contenedor debe restringir procesos, red y recursos.
2. **R2-03B3 — Scanner de cuarentena:** identidad de servicio independiente y token **Object Read only**, limitado a **`zaping-quarantine-qa`** (distinto del token RW del laboratorio y del token private QA). Recuperar bytes por clave `quarantine/<company>/<document>/<attachment>` desde un job verificado, cotejar tamaño/SHA antes del escaneo, no fiarse de metadata R2 ni del resultado previo del upload.
3. **Gate de seguridad posterior:** comprobar ClamAV/freshclam **antes y después** con política de engine/version/actualización y procedencia de firmas; job y nonce de un uso ligado a Company y hash; evidencia firmada verificable, roles PostgreSQL independientes y permisos positivos mínimos. Los PR antiguos #160–#166 son fuentes de diseño, **no están listos para merge directo**.
4. **Promoción separada:** solo un verificador autorizado puede permitir `AVAILABLE` después de copia/lectura comparada al bucket privado, con transacción protegida, auditoría y reconciliación. Resultado `CLAMD_OK_UNATTESTED` nunca es permiso de descarga.

## Validación de este PR

- Tests Unix socket ficticio: framing, tamaño, corrupción de resultado, desconexión, parámetros no válidos y malware conocido simulado.
- CI API/Web/Historical PostgreSQL.
- Sin cambios SQL, semántica de recepciones ni endpoints.

## Referencias

- [ClamD Protocol — INSTREAM](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
- [Official ClamAV Docker Images](https://docs.clamav.net/manual/Installing/Docker.html)
- PR históricos de Zaping: #154 (adapter), #158 (readiness), #162 (worker de evidencia), #166 (matriz negativa de roles).
