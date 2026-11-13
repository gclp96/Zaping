# INF-CLAMAV-LAB-01 — Laboratorio de análisis de archivos (archivo de cierre)

**Fecha de corte:** 2026-11-13  
**Estado:** VALIDATED (laboratorio) / DROPLET REMOVED (evidencia de consola; verificación de recursos asociados pendiente)  
**Alcance:** Prueba de concepto de ClamAV para Zaping Files. **No** es un despliegue productivo ni una integración funcional con Cloudflare R2.

## 1. Propósito y decisión

Se montó un laboratorio descartable en un Droplet de DigitalOcean para validar el motor ClamAV y la ejecución local mediante socket Unix. La decisión de producto posterior es **posponer el scanner y toda infraestructura recurrente que no sea indispensable** hasta la fase de preparación del despliegue comercial. Zaping Files podrá desarrollarse usando un bucket **privado** de Cloudflare R2 y el backend local de Zaping.

Este documento es un registro técnico reproducible, **no** contiene IPs, claves SSH, tokens de API ni información privada del proveedor.

## 2. Ambiente validado (evidencia de sesión)

| Elemento | Observado |
| --- | --- |
| Sistema operativo | Ubuntu 24.04.5 LTS |
| Kernel tras actualización y reinicio | `6.8.0-149-generic` |
| Capacidad observada | 4 vCPU, aprox. 8 GiB RAM y 160 GB de disco |
| ClamAV | `1.5.4` |
| Paquetes | `clamav`, `clamav-daemon`, `clamav-freshclam`, `clamdscan` |
| Servicios tras reinicio | `clamav-daemon`: active; `clamav-freshclam`: active |
| Transporte del daemon | Socket Unix `/run/clamav/clamd.ctl`; sin listener TCP de análisis detectado |
| Permisos socket | `660 clamav:clamav` |
| Usuario de worker | `zaping-scanner`, de sistema, shell `/usr/sbin/nologin`, miembro del grupo `clamav`, sin `sudo` |
| Directorio de worker | `/var/lib/zaping-scanner`, permisos `700` |
| Actualización de firmas | Bases main/daily/bytecode descargadas; FreshClam activo |

**Advertencia de evidencia:** los datos corresponden a salidas y capturas aportadas durante las pruebas. No son una inspección en vivo del proveedor, ni garantizan el estado posterior a la fecha de corte.

## 3. Configuración de referencia

Ajustes relevantes observados en `/etc/clamav/clamd.conf`:

```ini
LocalSocket /run/clamav/clamd.ctl
LocalSocketGroup clamav
LocalSocketMode 660
User clamav
MaxFileSize 25M
MaxScanSize 100M
StreamMaxLength 25M
MaxRecursion 16
MaxFiles 10000
```

La captura también mostró un límite de tiempo de análisis de 120 segundos. No asumir que todos los parámetros anteriores son adecuados para producción: requieren revisión frente a tamaños de adjuntos, cargas y política de archivos anidados.

En Ubuntu, el generador de `clamav-daemon.socket` tomó `LocalSocketMode` de `clamd.conf`. Después de modificar ese parámetro, se detuvieron el socket y daemon, se ejecutó `systemctl daemon-reload` y se iniciaron nuevamente. Se verificó el modo real con `stat`.

## 4. Pruebas realizadas (PASS)

1. Inicio de sesión SSH por clave con usuario administrativo y validación de `sudo`.
2. `dpkg --audit` sin hallazgos reportados tras actualizar paquetes.
3. Kernel `6.8.0-149-generic` activo; `systemctl is-system-running` devolvió `running`; sin reinicio pendiente.
4. `clamav-daemon` y `clamav-freshclam` permanecieron activos tras reiniciar.
5. `stat` confirmó `660 clamav:clamav` en el socket tras reiniciar.
6. Análisis sin root, ejecutando `clamdscan --fdpass` como `zaping-scanner`:
   - archivo de texto limpio: código de salida `0`;
   - cadena de prueba EICAR (68 bytes): detección `Eicar-Test-Signature FOUND`, código `1`.

**No validado:** conexión R2, colas y reintentos, cargas concurrentes, límites de archivos maliciosamente anidados, observabilidad, restauración automática, aislamiento multiempresa, throughput real y seguridad de la integración NestJS.

## 5. Reconstrucción futura (guía; no ejecutar ahora)

1. Aprovisionar una VM nueva de Ubuntu LTS según dimensionamiento y presupuesto vigentes; usar firewall de proveedor de mínimo privilegio. No asumir que el proveedor ni la IP serán los mismos.
2. Crear y probar una cuenta administrativa por clave SSH antes de endurecer o restringir el acceso root. Mantener una vía de recuperación.
3. Actualizar el sistema de forma controlada y reiniciar cuando corresponda. Evitar forzar cambios de release o kernel sin revisión.
4. Instalar los paquetes:
   ```bash
   sudo apt-get update
   sudo apt-get install clamav clamav-daemon clamav-freshclam clamdscan
   ```
5. Configurar exclusivamente socket Unix local; no publicar el puerto TCP `3310`. Establecer `LocalSocketMode 660`, `LocalSocketGroup clamav` y revisar los límites de análisis.
6. Habilitar los servicios y comprobar el socket:
   ```bash
   sudo systemctl enable --now clamav-freshclam clamav-daemon.socket clamav-daemon
   sudo stat -c '%a %U:%G %n' /run/clamav/clamd.ctl
   ```
   Si se modificó `clamd.conf` después de iniciar, regenerar unidades con `systemctl daemon-reload` y recrear el socket de manera controlada.
7. Crear el usuario de sistema (si aún no existe) y su directorio:
   ```bash
   sudo useradd --system --user-group --home-dir /var/lib/zaping-scanner --shell /usr/sbin/nologin --groups clamav zaping-scanner
   sudo install -d -m 0700 -o zaping-scanner -g zaping-scanner /var/lib/zaping-scanner
   ```
8. Repetir pruebas con archivo limpio y EICAR como `zaping-scanner`, también tras reinicio. No utilizar malware real.
9. Crear y someter a revisión las políticas de monitoreo, alertas, actualización de firmas, rotación de secretos, endurecimiento del worker, recuperación, rollback y validación de producción.

## 6. Checklist de decomisión del laboratorio

- [ ] Confirmar que el Droplet está dedicado al laboratorio y **no** aloja servicios o datos de clientes.
- [x] Guardar este registro técnico y comprobar que no incluye secretos.
- [ ] Revisar en DigitalOcean si hay snapshots, discos/volúmenes, IPs reservadas, balanceadores, DNS u otros recursos dependientes.
- [x] Retirar el Droplet dedicado: el usuario compartió captura de la página Droplets sin instancias listadas (evidencia de consola, 2026-11-13).
- [ ] Decidir explícitamente si se eliminan snapshots/volúmenes asociados; los que permanezcan pueden seguir generando cargos.
- [ ] Revisar backups retenidos por DigitalOcean y cualquier recurso con facturación independiente.
- [x] Comprobar en la captura que la lista Droplets aparece vacía y el panel Billing muestra **saldo estimado US$0.00** para noviembre. Este dato **no** es liquidación final; la interfaz indica actualización diaria.
- [x] Registrar fecha (2026-11-13) y evidencia textual de las capturas aportadas en el chat, sin publicar capturas con identificadores de cuenta.

**Importante:** apagar la VM no detiene su facturación; destruirla elimina irreversiblemente su disco y libera su IP. El firewall cloud asociado puede ser un recurso independiente. Nunca borrar un recurso cuyo uso no esté confirmado.

## 7. Registro de retirada — 2026-11-13

El usuario mostró la vista de Droplets sin instancias y Billing con estimación **US$0.00** para el periodo actual. Se interpreta que el Droplet del laboratorio fue retirado. **No se ha verificado** mediante API de DigitalOcean la ausencia de recursos con facturación independiente (snapshots, backups, volúmenes, IPs reservadas, otros). Los checks correspondientes permanecen abiertos y requieren inspección manual. No volver a crear el laboratorio por esta tarea.

## 8. Reapertura

Reabrir esta iniciativa cuando el MVP/piloto necesite recepción de archivos de terceros con verificación antivirus, o antes del lanzamiento público si la evaluación de riesgos lo exige. Revalidar versiones, precios, capacidades y dependencias. El laboratorio no establece por sí mismo un proveedor obligatorio para producción.
