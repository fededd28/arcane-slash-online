# Servidor de Oracle: todo lo que hay que saber para agregar otro juego

Guía para otra sesión de Claude (o para vos). Explica cómo está armada la máquina virtual y cómo poner un juego nuevo.
**No hay claves ni tokens acá, y no deben pegarse nunca en el chat.**

## Cómo trabajar con el dueño
- Español rioplatense, respuestas cortas, cada comando en su propio bloque (PowerShell).
- Los pasos en páginas web (Oracle, DuckDNS) los hace el dueño; vos guialo por pasos. Lo demás (SSH, instalar, configurar) lo hace Claude desde su PC.
- No hacer `git push` ni publicar sin que lo pida. Probar antes de decir "listo".

## La máquina
| Dato | Valor |
|---|---|
| Proveedor | Oracle Cloud (cuenta gratis, región **sa-santiago-1**, Chile) |
| Tipo | VM.Standard.E2.1.Micro (Always Free): **1 CPU, 1 GB de RAM**, no se puede cambiar |
| Sistema | Ubuntu 24.04 (x86_64), usuario `ubuntu` |
| IP pública | `146.181.34.17` (**efímera**: cambia si se recrea la máquina) |
| Clave SSH (privada) | `C:\Users\fede_\.ssh\ssh-key-2026-11-15.key` (PC del dueño). Otra máquina Windows (Antigravity): key propia `antigravity-deploy`, ya autorizada en la VM |
| Extras | Swap de 2 GB en `/swapfile` (en `/etc/fstab`), Node.js 22 |

Conectarse:
```powershell
ssh -i "$env:USERPROFILE\.ssh\ssh-key-2026-11-15.key" ubuntu@146.181.34.17
```
Para correr comandos sin entrar: `ssh -i <clave> -o BatchMode=yes ubuntu@146.181.34.17 "comando"`.

## Qué corre hoy
- **Arcane Slash Online**: carpeta `~/arcane/oracle` (servidor Node + Express + ws), servicio `arcane` (systemd), puerto interno **8787**.
  - Ver estado/logs: `systemctl is-active arcane`, `sudo journalctl -u arcane -n 20`.
  - Se actualiza con `.\oracle\deploy.ps1` (en la carpeta del proyecto). Desde otra máquina Windows: `.\oracle\deploy.ps1 -Key "$env:USERPROFILE\.ssh\antigravity-deploy"`.
- **Caddy** (servidor web, certificados HTTPS gratis de Let's Encrypt, se renuevan solos). Config: `/etc/caddy/Caddyfile`.
  - `arcaneslash.duckdns.org` → `reverse_proxy localhost:8787`.
  - Recargar: `sudo systemctl reload caddy`. Logs: `sudo journalctl -u caddy -n 20`.
- Nombre: **DuckDNS** (gratis), cuenta del dueño (entra con Google). El nombre apunta a la IP de arriba.

## Puertos (hay DOS firewalls, hay que abrir en los dos)
1. **Oracle** (web): VCN `vcn-20261115-1736` → Security → Default Security List → Ingress. Abiertos: 22 (SSH), 80, 443, 8787. (Eso lo hace el dueño en la web.)
2. **Dentro de Ubuntu** (iptables). Abiertos: 22, 80, 443, 8787. Para abrir otro puerto (se inserta ANTES de la regla REJECT, por eso la posición 5):
```bash
sudo iptables -I INPUT 5 -p tcp --dport PUERTO -j ACCEPT
sudo netfilter-persistent save
```
Con Caddy **no hace falta abrir puertos nuevos**: todo entra por el 443.

## Cómo agregar otro juego (receta)
1. **Nombre nuevo**: el dueño crea otro subdominio en duckdns.org con la **misma IP** (`146.181.34.17`). Comprobar: `Resolve-DnsName nombre.duckdns.org`.
2. **Subir el juego** a `~/otrojuego` (comprimir con `tar -czf`, `scp` a la VM, descomprimir con `tar --warning=no-timestamp -xzf`). Sin `node_modules`; instalar en la VM con `npm install --omit=dev`.
3. **Puerto interno distinto** (8788, 8789...). El 8787 ya está usado. El juego tiene que leer el puerto de `process.env.PORT` y escuchar en `0.0.0.0` (o `localhost`).
4. **Servicio systemd**: copiar `~/arcane/oracle/arcane.service` (o `oracle/arcane.service` del repo) a `/etc/systemd/system/otrojuego.service`, cambiando `WorkingDirectory`, `Environment=PORT` y el comando. Luego:
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now otrojuego
```
5. **Caddy**: agregar un bloque nuevo al final de `/etc/caddy/Caddyfile` y recargar:
```
otrojuego.duckdns.org {
	reverse_proxy localhost:8788
}
```
6. **Probar desde afuera** (no solo desde la VM): `Invoke-WebRequest https://otrojuego.duckdns.org/` y, si usa WebSocket, probar la conexión `wss://`.

Si el juego usa WebSocket, el cliente debe usar `wss://` cuando la página es `https` (en Arcane Slash: `location.protocol === 'https:' ? 'wss' : 'ws'`). Caddy deja pasar WebSocket sin configuración extra.

## Límites y cuidados
- **1 GB de RAM**: dos juegos livianos entran (hay swap), pero con muchos jugadores a la vez se pone lento. Revisar con `free -m`.
- Si Oracle da "Out of capacity" para la máquina Ampere A1 (4 CPU / 24 GB gratis), se puede reintentar más adelante y migrar.
- La IP es efímera. Si cambia, hay que actualizarla en DuckDNS (el dueño) y por ahí en esta guía.
- La región gratis es solo Chile. Un servidor gratis en EE. UU. requeriría la cuenta de otra persona (con su región de origen en EE. UU.).

## Trampas que ya nos pasaron (PowerShell 5.1)
- **No pasar scripts por tubería a ssh** (`Get-Content x | ssh ...` o `$s | ssh`): agrega un carácter oculto (BOM) y falla ("command not found" en la primera línea). **Escribir el script a un archivo UTF-8 sin BOM, `scp` a la VM y ejecutarlo con `ssh ... "bash /tmp/script.sh"`** (así lo hace `oracle/deploy.ps1`).
- Los archivos con saltos de línea de Windows (CRLF) rompen archivos de Linux (por ejemplo el `.service`). Escribirlos con LF.
- SSH desde Windows exige que la clave sea solo del usuario: si dice "UNPROTECTED PRIVATE KEY FILE", `icacls <clave> /inheritance:r` y `icacls <clave> /grant:r "$($env:USERNAME):(R)"`.
- `tar` avisa "time stamp is in the future" por diferencia de reloj: es inofensivo (se silencia con `--warning=no-timestamp`).
- El `.service` usa `node server.ts` (Node 22 ejecuta TypeScript simple sin compilar).
