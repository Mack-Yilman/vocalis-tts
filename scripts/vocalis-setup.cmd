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
    lang = '¿Qué voces quieres? 1 = español, 2 = inglés, 3 = ambos'; dl = 'Descargando'; skip = 'Ya instalado'
    retry = 'No disponible en esta fuente; probando la siguiente...'
    nofile = 'No se pudo obtener un archivo válido de ninguna fuente; no se instaló. Vuelve a intentarlo.'
    busy = 'Piper está en uso. Detén la lectura en Obsidian y vuelve a ejecutar el instalador.'
    fail = 'No se pudo completar la instalación:'; net = 'Comprueba tu conexión a Internet y vuelve a ejecutar el instalador.'
    done = 'Instalación completa. Ya no hace falta Internet para escuchar tus notas.'
    next = 'En Obsidian: activa Vocalis TTS en Plugins de la comunidad y pulsa «Volver a comprobar» en su panel.'
  }
  en = @{
    title = 'Vocalis TTS setup'; noWin = 'Vocalis TTS only works on 64-bit Windows.'
    pick = 'Obsidian vaults found:'; ask = 'Type the vault number or path'; bad = 'That folder could not be found.'
    lang = 'Which voices do you want? 1 = Spanish, 2 = English, 3 = both'; dl = 'Downloading'; skip = 'Already installed'
    retry = 'Not available from this source; trying the next one...'
    nofile = 'A valid file could not be obtained from any source; it was not installed. Please try again.'
    busy = 'Piper is in use. Stop reading in Obsidian and run the installer again.'
    fail = 'The installation could not be completed:'; net = 'Check your internet connection and run the installer again.'
    done = 'Setup complete. You no longer need internet to listen to your notes.'
    next = 'In Obsidian: enable Vocalis TTS in Community plugins and press "Check again" in its panel.'
  }
}[$ui]

# Al cambiar motor o voces: nuevos hash y BUNDLE, igual que ENGINE_BUNDLE en main.js (npm test lo comprueba)
$bundle = 'engine-2023.11.14-2+voices-b4e358ff'
$engineVersion = '2023.11.14-2'
$engineSha = 'f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea'
$engineUrls = @(
  'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
  'https://github.com/Mack-Yilman/vocalis-engine/releases/download/engine-2023.11.14-2/piper_windows_amd64.zip'
)
$voiceSources = @(
  'https://huggingface.co/rhasspy/piper-voices/resolve/b4e358ffcb232591bf73a540e70f7de528e4174a/{path}',
  'https://github.com/Mack-Yilman/vocalis-engine/releases/download/voices-b4e358ff/{file}'
)
$pluginBase = 'https://github.com/Mack-Yilman/vocalis-tts/releases/latest/download'
$voices = @{
  es = @{ path = 'es/es_ES/sharvard/medium/es_ES-sharvard-medium'
          onnx = '40febfb1679c69a4505ff311dc136e121e3419a13a290ef264fdf43ddedd0fb1'
          json = '7438c9b699c72b0c3388dae1b68d3f364dc66a2150fe554a1c11f03372957b2c' }
  en = @{ path = 'en/en_US/ljspeech/medium/en_US-ljspeech-medium'
          onnx = '6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22'
          json = '141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860' }
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

function Test-Sha($file, $sha) {
  return (Test-Path -LiteralPath $file) -and ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -eq $sha.ToUpper())
}

# Prueba cada fuente en orden; solo mueve el archivo al destino si el SHA-256 coincide
function Install-Verified($urls, $sha, $dest) {
  $tmp = "$dest.download"
  foreach ($url in $urls) {
    try {
      Get-File $url $tmp
      if (Test-Sha $tmp $sha) {
        Move-Item -LiteralPath $tmp -Destination $dest -Force
        return
      }
    } catch { }
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    Write-Host $T.retry -ForegroundColor Yellow
  }
  throw $T.nofile
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

# Sustituye el motor de una vez y conserva las voces; si algo falla, restaura el anterior
function Install-Engine($plugin, $piper) {
  $zip = Join-Path $env:TEMP "vocalis-piper-$PID.zip"
  $unzipped = Join-Path $env:TEMP "vocalis-piper-$PID"
  $old = "$piper.old"
  try {
    Install-Verified $engineUrls $engineSha $zip
    Expand-Archive -LiteralPath $zip -DestinationPath $unzipped -Force
    $fresh = Join-Path $unzipped 'piper'
    if (-not (Test-Path -LiteralPath (Join-Path $fresh 'piper.exe'))) { throw $T.nofile }
    if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Recurse -Force }
    if (Test-Path -LiteralPath $piper) {
      try { Rename-Item -LiteralPath $piper -NewName (Split-Path $old -Leaf) } catch { throw $T.busy }
    }
    try {
      Copy-Item -LiteralPath $fresh -Destination $piper -Recurse -Force
      $oldModels = Join-Path $old 'models'
      if (Test-Path -LiteralPath $oldModels) {
        $models = Join-Path $piper 'models'
        if (Test-Path -LiteralPath $models) { Remove-Item -LiteralPath $models -Recurse -Force }
        Move-Item -LiteralPath $oldModels -Destination $models
      }
    } catch {
      Remove-Item -LiteralPath $piper -Recurse -Force -ErrorAction SilentlyContinue
      if (Test-Path -LiteralPath $old) { Rename-Item -LiteralPath $old -NewName (Split-Path $piper -Leaf) }
      throw
    }
    if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Recurse -Force }
  } finally {
    Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $unzipped -Recurse -Force -ErrorAction SilentlyContinue
  }
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
  $markFile = Join-Path $piper 'vocalis-engine.json'
  New-Item -ItemType Directory -Force -Path $plugin | Out-Null

  # Plugin: solo si aún no está (normalmente ya vino del directorio de Obsidian)
  foreach ($file in 'main.js', 'manifest.json', 'styles.css') {
    $dest = Join-Path $plugin $file
    if (-not (Test-Path -LiteralPath $dest)) {
      Write-Host "$($T.dl) $file"
      Get-File "$pluginBase/$file" $dest
    }
  }

  # Marca de versión. Sin marca, un piper.exe existente es de 2023.11.14-2, la única versión distribuida hasta 1.4.0
  $installedEngine = $null
  if (Test-Path -LiteralPath $markFile) {
    try { $installedEngine = (Get-Content -LiteralPath $markFile -Raw -Encoding UTF8 | ConvertFrom-Json).engine } catch { }
  }
  $hasExe = Test-Path -LiteralPath (Join-Path $piper 'piper.exe')
  if ($hasExe -and -not $installedEngine) { $installedEngine = '2023.11.14-2' }

  if ($hasExe -and $installedEngine -eq $engineVersion) {
    Write-Host "$($T.skip): Piper"
  } else {
    Write-Host "$($T.dl) Piper (22 MB)"
    Install-Engine $plugin $piper
  }

  # Voces: el SHA-256 decide si hay que bajarlas, con o sin marca previa
  New-Item -ItemType Directory -Force -Path $models | Out-Null
  foreach ($language in $languages) {
    $voice = $voices[$language]
    $name = Split-Path $voice.path -Leaf
    $onnx = Join-Path $models "$name.onnx"
    $json = "$onnx.json"
    if ((Test-Sha $onnx $voice.onnx) -and (Test-Sha $json $voice.json)) {
      Write-Host "$($T.skip): $name"
      continue
    }
    Write-Host "$($T.dl) $name"
    $sources = { param($suffix) $voiceSources | ForEach-Object { $_.Replace('{path}', "$($voice.path)$suffix").Replace('{file}', "$name$suffix") } }
    if (-not (Test-Sha $json $voice.json)) { Install-Verified (& $sources '.onnx.json') $voice.json $json }
    if (-not (Test-Sha $onnx $voice.onnx)) { Install-Verified (& $sources '.onnx') $voice.onnx $onnx }
  }

  # Sin BOM: el plugin lee este archivo con JSON.parse
  $mark = @{ bundle = $bundle; engine = $engineVersion } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($markFile, $mark)

  Write-Host ''
  Write-Host $T.done -ForegroundColor Green
  Write-Host $T.next
} catch {
  Write-Host ''
  Write-Host "$($T.fail) $($_.Exception.Message)" -ForegroundColor Red
  if ($_.Exception.Message -ne $T.busy) { Write-Host $T.net }
  exit 1
}
