$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Start-Node {
    param(
        [string]$name,
        [string]$port,
        [string]$scriptPath
    )
    Write-Host "Starting $name on port $port..."
    Start-Process -FilePath "conda" `
        -WorkingDirectory $root `
        -ArgumentList "run", "-n", "llm-agent-env", "python", $scriptPath `
        -WindowStyle Normal
}

Start-Node -name "NodeA" -port "8001" -scriptPath "nodes\\node_a\\main.py"
Start-Node -name "NodeB" -port "8002" -scriptPath "nodes\\node_b\\main.py"
Start-Node -name "NodeC" -port "8003" -scriptPath "nodes\\node_c\\main.py"
Start-Node -name "NodeD" -port "8004" -scriptPath "nodes\\node_d\\main.py"

Write-Host "Starting Edge Worker..."
Start-Process -FilePath "cmd.exe" `
    -WorkingDirectory (Join-Path $root "edge-worker") `
    -ArgumentList "/c", "npx", "wrangler", "dev", "--local" `
    -WindowStyle Normal
