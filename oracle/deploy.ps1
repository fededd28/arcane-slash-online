# Sube el juego a la maquina de Oracle y reinicia el servicio.
# Uso (desde la carpeta del proyecto):  .\oracle\deploy.ps1
param(
  [string]$Ip  = "146.181.34.17",
  [string]$Key = "$env:USERPROFILE\.ssh\ssh-key-2026-11-15.key"
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$tgz  = Join-Path $env:TEMP "arcane-deploy.tgz"
$ssh  = @("-i", $Key, "-o", "BatchMode=yes", "ubuntu@$Ip")

# Solo lo que necesita la VM (sin node_modules)
tar -czf $tgz -C $root public src/sim.js src/room-node.js oracle/server.ts oracle/package.json oracle/arcane.service
scp -i $Key -o BatchMode=yes $tgz "ubuntu@${Ip}:/tmp/arcane-deploy.tgz"

$remote = @'
set -e
mkdir -p ~/arcane && cd ~/arcane
chmod -R u+w ~/arcane 2>/dev/null || true
rm -rf public src oracle/server.ts server.ts room.js
tar --warning=no-timestamp -xzf /tmp/arcane-deploy.tgz
cd oracle && npm install --omit=dev --no-audit --no-fund --loglevel=error
sudo cp arcane.service /etc/systemd/system/arcane.service
sudo systemctl daemon-reload && sudo systemctl enable arcane >/dev/null 2>&1
sudo systemctl restart arcane && sleep 2
systemctl is-active arcane && curl -s localhost:8787/health && echo
'@
$sh = Join-Path $env:TEMP "arcane-remote.sh"
[IO.File]::WriteAllText($sh, ($remote -replace "`r",""), (New-Object Text.UTF8Encoding $false))
scp -i $Key -o BatchMode=yes $sh "ubuntu@${Ip}:/tmp/arcane-remote.sh"
ssh @ssh "bash /tmp/arcane-remote.sh"
Write-Host "Listo: http://${Ip}:8787"
