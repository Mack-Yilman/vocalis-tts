<#
.SYNOPSIS
    Prueba de síntesis local con Piper TTS y los modelos neuronales en español.
#>
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectDir = Split-Path -Parent $scriptDir

$piperExe = Join-Path $projectDir "piper\piper.exe"
$modelSharvard = Join-Path $projectDir "piper\models\es_ES-sharvard-medium.onnx"
$testOutput = Join-Path $projectDir "test_audio.wav"

Write-Host "Comprobando motor Piper en: $piperExe" -ForegroundColor Cyan
if (-not (Test-Path $piperExe)) {
    Write-Error "No se encuentra piper.exe en $piperExe"
    exit 1
}

if (-not (Test-Path $modelSharvard)) {
    Write-Error "No se encuentra el modelo sharvard en $modelSharvard"
    exit 1
}

$phrase = "Prueba de sintesis neuronal con Piper TTS Pro en espanol de Espana. El sistema funciona correctamente."
Write-Host "Sintetizando frase de prueba..." -ForegroundColor Yellow

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $piperExe
$psi.Arguments = "--model `"$modelSharvard`" --output_file `"$testOutput`""
$psi.RedirectStandardInput = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$proc = [System.Diagnostics.Process]::Start($psi)
$utf8NoBom = New-Object System.IO.StreamWriter($proc.StandardInput.BaseStream, [System.Text.Encoding]::UTF8)
$utf8NoBom.Write($phrase)
$utf8NoBom.Close()
$proc.WaitForExit()

if (Test-Path $testOutput) {
    $fileSize = (Get-Item $testOutput).Length
    Write-Host "[OK] Audio sintetizado correctamente ($fileSize bytes) en: $testOutput" -ForegroundColor Green
    Remove-Item $testOutput -Force
    Write-Host "[OK] Limpieza de temporal completada." -ForegroundColor Gray
} else {
    Write-Error "Error: No se genero el archivo de audio."
}
