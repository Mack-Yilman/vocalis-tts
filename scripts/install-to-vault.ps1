param(
    [string]$VaultPath = "C:\Users\Yilman\Desktop\Second Brain"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Instalador / Desplegador de Vocalis TTS ===" -ForegroundColor Cyan

if (-not (Test-Path $VaultPath)) {
    Write-Error "No se encuentra el Vault de Obsidian en la ruta: $VaultPath"
    exit 1
}

$pluginsDir = Join-Path $VaultPath ".obsidian\plugins"
if (-not (Test-Path $pluginsDir)) {
    New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null
}

$pluginTargetDir = Join-Path $pluginsDir "vocalis-tts"
if (-not (Test-Path $pluginTargetDir)) {
    New-Item -ItemType Directory -Force -Path $pluginTargetDir | Out-Null
    Write-Host "[+] Creado directorio de plugin: $pluginTargetDir" -ForegroundColor Green
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectDir = Split-Path -Parent $scriptDir

$filesToCopy = @("main.js", "manifest.json", "styles.css")
foreach ($file in $filesToCopy) {
    $srcFile = Join-Path $projectDir $file
    if (Test-Path $srcFile) {
        Copy-Item -Path $srcFile -Destination $pluginTargetDir -Force
        Write-Host "[OK] Sincronizado: $file" -ForegroundColor Green
    } else {
        Write-Warning "No se encontro el fichero origen: $srcFile"
    }
}

$targetPiper = Join-Path $pluginTargetDir "piper"
$srcPiper = Join-Path $projectDir "piper"
if ((-not (Test-Path $targetPiper)) -and (Test-Path $srcPiper)) {
    Write-Host "[+] Copiando motor Piper al plugin en el Vault (primera instalacion)..." -ForegroundColor Yellow
    Copy-Item -Path $srcPiper -Destination $pluginTargetDir -Recurse -Force
    Write-Host "[OK] Motor Piper y modelos sincronizados en el Vault." -ForegroundColor Green
}

Write-Host "`nPlugin desplegado correctamente en: $pluginTargetDir" -ForegroundColor Cyan
Write-Host "Recuerda recargar los plugins en Obsidian (Ctrl + R o 'Recargar plugins sin guardar')." -ForegroundColor Yellow
