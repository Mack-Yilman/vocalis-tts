<#
.SYNOPSIS
    Descargador opcional de voces adicionales para Vocalis TTS.
    Voces: 'sharvard' y 'davefx' (es_ES medium), 'daniela' (es_AR high),
    'lessac' (en_US medium, femenina), 'ryan' (en_US medium, masculina),
    'spanish' (sharvard + davefx) o 'english' (lessac + ryan).
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

# Voz -> ruta dentro de rhasspy/piper-voices (sin extension)
$catalog = @{
    "sharvard" = "es/es_ES/sharvard/medium/es_ES-sharvard-medium"
    "davefx"  = "es/es_ES/davefx/medium/es_ES-davefx-medium"
    "daniela" = "es/es_AR/daniela/high/es_AR-daniela-high"
    "lessac"  = "en/en_US/lessac/medium/en_US-lessac-medium"
    "ryan"    = "en/en_US/ryan/medium/en_US-ryan-medium"
}
$groups = @{ "english" = @("lessac", "ryan"); "spanish" = @("sharvard", "davefx") }

$voices = if ($groups.ContainsKey($Voice)) { $groups[$Voice] } else { @($Voice) }

Write-Host "=== Descargador de Voces para Vocalis TTS ===" -ForegroundColor Cyan
Write-Host "Destino de modelos: $modelsDir" -ForegroundColor Gray

foreach ($v in $voices) {
    if (-not $catalog.ContainsKey($v)) {
        Write-Warning "Voz desconocida: $v. Opciones: sharvard, davefx, daniela, lessac, ryan, spanish, english."
        continue
    }
    $rel = $catalog[$v]
    $name = Split-Path $rel -Leaf
    $baseUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/main/$rel"

    Write-Host "[$v] Descargando configuracion JSON..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "$baseUrl.onnx.json" -OutFile (Join-Path $modelsDir "$name.onnx.json")

    Write-Host "[$v] Descargando modelo ONNX..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "$baseUrl.onnx" -OutFile (Join-Path $modelsDir "$name.onnx")

    Write-Host "[OK] Voz '$name' instalada en piper/models." -ForegroundColor Green
}

Write-Host "El plugin detectara las voces automaticamente en Obsidian." -ForegroundColor Cyan
