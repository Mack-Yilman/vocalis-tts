<# : batch
@echo off
rem Vocalis TTS setup: installs the Piper engine and voices into an Obsidian vault.
rem Double-click to run. No administrator rights needed. Readable text: review it if you wish.
set "VOCALIS_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression (Get-Content -LiteralPath $env:VOCALIS_SELF -Raw -Encoding UTF8)"
set "VOCALIS_EXIT=%ERRORLEVEL%"
if not defined VOCALIS_VAULT pause
exit /b %VOCALIS_EXIT%
#>

# Sin preguntas (usuarios avanzados): VOCALIS_VAULT=<carpeta del vault> y VOCALIS_LANG=es|en|both
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ui = if ((Get-UICulture).TwoLetterISOLanguageName -eq 'es') { 'es' } else { 'en' }
$T = @{
  es = @{
    title = 'Instalador de Vocalis TTS'; noWin = 'Vocalis TTS solo funciona en Windows de 64 bits.'
    pick = 'Vaults de Obsidian encontrados:'; ask = 'Escribe el número o la ruta del vault'; bad = 'No se encuentra esa carpeta.'
    lang = '¿Qué voces quieres? 1 = español, 2 = inglés, 3 = ambos'; dl = 'Descargando'; ok = 'Listo'; skip = 'Ya instalado'
    hash = 'El archivo descargado no coincide con el esperado; no se instaló nada. Vuelve a intentarlo.'
    fail = 'No se pudo completar la instalación:'; net = 'Comprueba tu conexión a Internet y vuelve a ejecutar el instalador.'
    done = 'Instalación completa. Ya no hace falta Internet para escuchar tus notas.'
    next = 'En Obsidian: activa Vocalis TTS en Plugins de la comunidad y pulsa «Volver a comprobar» en su panel.'
  }
  en = @{
    title = 'Vocalis TTS setup'; noWin = 'Vocalis TTS only works on 64-bit Windows.'
    pick = 'Obsidian vaults found:'; ask = 'Type the vault number or path'; bad = 'That folder could not be found.'
    lang = 'Which voices do you want? 1 = Spanish, 2 = English, 3 = both'; dl = 'Downloading'; ok = 'Done'; skip = 'Already installed'
    hash = 'The downloaded file does not match the expected one; nothing was installed. Please try again.'
    fail = 'The installation could not be completed:'; net = 'Check your internet connection and run the installer again.'
    done = 'Setup complete. You no longer need internet to listen to your notes.'
    next = 'In Obsidian: enable Vocalis TTS in Community plugins and press "Check again" in its panel.'
  }
}[$ui]

$engineUrl = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip'
$engineSha = 'f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea'
$voiceBase = 'https://huggingface.co/rhasspy/piper-voices/resolve/b4e358ffcb232591bf73a540e70f7de528e4174a'
$pluginBase = 'https://github.com/Mack-Yilman/vocalis-tts/releases/latest/download'
$voices = @{
  es = @{ path = 'es/es_ES/sharvard/medium/es_ES-sharvard-medium'
          onnx = '40febfb1679c69a4505ff311dc136e121e3419a13a290ef264fdf43ddedd0fb1'
          json = '7438c9b699c72b0c3388dae1b68d3f364dc66a2150fe554a1c11f03372957b2c' }
  en = @{ path = 'en/en_US/lessac/medium/en_US-lessac-medium'
          onnx = '5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f'
          json = 'efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0' }
}

function Get-File($url, $dest) {
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    & $curl.Source -L --fail --retry 2 --progress-bar -o $dest $url
    if ($LASTEXITCODE -ne 0) { throw "$url (curl $LASTEXITCODE)" }
  } else {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
  }
}

# Descarga a un temporal y solo la mueve al destino si el SHA-256 coincide
function Install-Verified($url, $sha, $dest) {
  $tmp = "$dest.download"
  Get-File $url $tmp
  if ((Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash -ne $sha.ToUpper()) {
    Remove-Item -LiteralPath $tmp -Force
    throw $T.hash
  }
  Move-Item -LiteralPath $tmp -Destination $dest -Force
}

function Select-Vault {
  if ($env:VOCALIS_VAULT) { return $env:VOCALIS_VAULT }
  $known = @()
  $config = Join-Path $env:APPDATA 'obsidian\obsidian.json'
  if (Test-Path -LiteralPath $config) {
    $data = Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($p in $data.vaults.PSObject.Properties) {
      if (Test-Path -LiteralPath $p.Value.path) { $known += $p.Value.path }
    }
  }
  if ($known.Count -gt 0) {
    Write-Host $T.pick
    for ($i = 0; $i -lt $known.Count; $i++) { Write-Host ("  {0}. {1}" -f ($i + 1), $known[$i]) }
  }
  while ($true) {
    $answer = (Read-Host "$($T.ask) [1]").Trim().Trim('"')
    if (-not $answer -and $known.Count -gt 0) { return $known[0] }
    $n = 0
    if ([int]::TryParse($answer, [ref]$n) -and $n -ge 1 -and $n -le $known.Count) { return $known[$n - 1] }
    if ($answer -and (Test-Path -LiteralPath $answer)) { return $answer }
    Write-Host $T.bad -ForegroundColor Yellow
  }
}

function Select-Languages {
  $choice = $env:VOCALIS_LANG
  if (-not $choice) {
    $default = if ($ui -eq 'es') { '1' } else { '2' }
    $answer = (Read-Host "$($T.lang) [$default]").Trim()
    if (-not $answer) { $answer = $default }
    $choice = @{ '1' = 'es'; '2' = 'en'; '3' = 'both' }[$answer]
  }
  switch ($choice) { 'es' { return @('es') } 'en' { return @('en') } default { return @('es', 'en') } }
}

try {
  Write-Host "=== $($T.title) ===" -ForegroundColor Cyan
  if (-not [Environment]::Is64BitOperatingSystem) { throw $T.noWin }

  $vault = Select-Vault
  if (-not (Test-Path -LiteralPath $vault)) { throw "$($T.bad) $vault" }
  $languages = Select-Languages

  $plugin = Join-Path $vault '.obsidian\plugins\vocalis-tts'
  $piper = Join-Path $plugin 'piper'
  $models = Join-Path $piper 'models'
  New-Item -ItemType Directory -Force -Path $plugin | Out-Null

  # Plugin: solo si aún no está (normalmente ya vino del directorio de Obsidian)
  foreach ($file in 'main.js', 'manifest.json', 'styles.css') {
    $dest = Join-Path $plugin $file
    if (-not (Test-Path -LiteralPath $dest)) {
      Write-Host "$($T.dl) $file"
      Get-File "$pluginBase/$file" $dest
    }
  }

  # Motor: el ZIP trae una carpeta piper/ en la raíz
  if (Test-Path -LiteralPath (Join-Path $piper 'piper.exe')) {
    Write-Host "$($T.skip): Piper"
  } else {
    Write-Host "$($T.dl) Piper (22 MB)"
    $zip = Join-Path $env:TEMP "vocalis-piper-$PID.zip"
    $unzipped = Join-Path $env:TEMP "vocalis-piper-$PID"
    try {
      Install-Verified $engineUrl $engineSha $zip
      Expand-Archive -LiteralPath $zip -DestinationPath $unzipped -Force
      New-Item -ItemType Directory -Force -Path $piper | Out-Null
      Copy-Item -Path (Join-Path $unzipped 'piper\*') -Destination $piper -Recurse -Force
    } finally {
      Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $unzipped -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  # Voces
  New-Item -ItemType Directory -Force -Path $models | Out-Null
  foreach ($language in $languages) {
    $voice = $voices[$language]
    $name = Split-Path $voice.path -Leaf
    $onnx = Join-Path $models "$name.onnx"
    $json = "$onnx.json"
    if ((Test-Path -LiteralPath $onnx) -and (Test-Path -LiteralPath $json)) {
      Write-Host "$($T.skip): $name"
      continue
    }
    Write-Host "$($T.dl) $name"
    Install-Verified "$voiceBase/$($voice.path).onnx.json" $voice.json $json
    Install-Verified "$voiceBase/$($voice.path).onnx" $voice.onnx $onnx
  }

  Write-Host ''
  Write-Host $T.done -ForegroundColor Green
  Write-Host $T.next
} catch {
  Write-Host ''
  Write-Host "$($T.fail) $($_.Exception.Message)" -ForegroundColor Red
  Write-Host $T.net
  exit 1
}
