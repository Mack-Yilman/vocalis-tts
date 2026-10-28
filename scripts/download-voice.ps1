<#
.SYNOPSIS
    Descargador opcional de voces adicionales para Piper TTS Pro.
    Permite descargar la voz femenina latinoamericana (Argentina) 'daniela' en calidad 'high'.
#>
param(
    [string]$Voice = "daniela"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectDir = Split-Path -Parent $scriptDir
$modelsDir = Join-Path $projectDir "piper\models"

if (-not (Test-Path $modelsDir)) {
    New-Item -ItemType Directory -Force -Path $modelsDir | Out-Null
}

Write-Host "=== Descargador de Voces para Piper TTS Pro ===" -ForegroundColor Cyan
Write-Host "Destino de modelos: $modelsDir" -ForegroundColor Gray

if ($Voice -eq "daniela") {
    $onnxUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx"
    $jsonUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx.json"
    
    $onnxDest = Join-Path $modelsDir "es_AR-daniela-high.onnx"
    $jsonDest = Join-Path $modelsDir "es_AR-daniela-high.onnx.json"

    Write-Host "[1/2] Descargando configuracion JSON de Daniela..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $jsonUrl -OutFile $jsonDest
    
    Write-Host "[2/2] Descargando modelo ONNX de Daniela (~114 MB)..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $onnxUrl -OutFile $onnxDest

    Write-Host "`n[OK] Voz 'es_AR-daniela-high' instalada con exito en piper/models." -ForegroundColor Green
    Write-Host "El plugin detectara la voz automaticamente en Obsidian." -ForegroundColor Cyan
} else {
    Write-Warning "Voz desconocida: $Voice. Opciones disponibles: 'daniela'."
}

