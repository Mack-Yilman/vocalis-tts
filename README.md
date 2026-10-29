# Vocalis TTS para Obsidian (Offline, Teleprompter Dual y Memoria)

Plugin de lectura en voz alta (Text-to-Speech) neuronal de alto rendimiento, privacidad absoluta y 100% offline para Obsidian, en **español e inglés**. Integra teleprompter visual sin desfase (tanto en **Modo Edición** como en **Modo Lectura**), velocidad dinámica hasta 2.5x en tiempo real y memoria de posición independiente por cada nota.

Potenciado por el motor de síntesis neuronal de código abierto **Rhasspy Piper TTS**. Publicado bajo **Licencia MIT** por **Mack Chirinos**.

---

## 🌟 Características Principales

- **100% Offline y Privado**: Sin dependencias de la nube, sin claves de API, sin suscripciones ni telemetría. Todo el procesamiento se realiza en tu procesador local.
- **Audio Cristalino sin Residuos**: Síntesis binaria nativa ultra-rápida con ciclo de vida efímero garantizado. El audio se carga directamente a memoria RAM (Blob URL) y el archivo temporal se destruye al instante en el directorio temporal del sistema (`os.tmpdir()`), garantizando cero corrupción acústica por CRLF y cero acumulación de archivos en disco.
- **Teleprompter Dual sin Desfase**:
  - **Modo Edición (Live Preview / Source)**: Selección y centrado automático continuo de la frase locutada.
  - **Modo Lectura (Reading View renderizado)**: Algoritmo de anclaje de texto DOM (`TreeWalker` + `Range`) que resalta con precisión quirúrgica la frase hablada sin romper el diseño ni desfasarse por etiquetas Markdown/HTML.
- **Velocidad Real hasta 2.5x con Tono Preservado**:
  - Escala de velocidades: `0.75x`, `1.0x`, `1.25x`, `1.5x`, `1.75x`, `2.0x`, `2.25x` y `2.5x`.
  - Los cambios de velocidad se aplican **al vuelo en tiempo real**, incluso a mitad de frase, conservando el tono natural de la voz (sin distorsión ni voz de ardilla).
- **Memoria de Lectura Independiente por Nota**:
  - Cada archivo de tu Vault conserva su propio progreso guardado en `data.json`.
  - Puedes pausar en una nota, leer otra diferente y retomar cada una en su frase exacta, incluso tras cerrar y reabrir Obsidian.
- **Detección Inteligente de Inicio**:
  - Si seleccionas un texto o haces clic en una frase con el ratón: inicia inmediatamente desde ese punto.
  - Si no hay selección activa: reanuda desde el progreso guardado de la nota.
- **Panel en la Barra Lateral Derecha**:
  - Reproductor fijo en la barra lateral derecha (como Esquema o Backlinks). Se abre solo al empezar a leer o con el comando *Abrir panel de Vocalis*.
  - Barra de progreso interactiva (Seek-bar): haz clic en cualquier porcentaje para saltar directamente a esa frase.
  - Botones de salto (+/- 1 frase), reinicio de nota (`🔄`), detener, cambio de voz y selector de velocidad.
  - **Continuar escuchando**: lista de las notas con lectura a medias y su porcentaje; un clic abre la nota y reanuda.
- **Memoria que Sigue a tus Notas**: si renombras o mueves una nota, conserva su progreso; si la borras, su memoria se limpia.
- **Lectura Limpia**: se omiten las URLs sueltas (de los enlaces Markdown se lee solo el texto) y las tablas se leen fila por fila, con una pausa entre celdas.
- **Español e Inglés**:
  - En **Ajustes > Vocalis TTS** eliges el *Idioma de lectura* y, para ese idioma, su voz.
  - Una nota puede indicar su propio idioma en el frontmatter (`lang: en` o `lang: es`), sin cambiar el ajuste global.
- **Catálogo de Voces Neuronales en Español**:
  - 🇪🇸 **Sharvard Femenina** (`es_ES-sharvard-medium`, Speaker 1): Tono claro, natural y expresivo.
  - 🇪🇸 **Sharvard Masculina** (`es_ES-sharvard-medium`, Speaker 0): Locución masculina equilibrada.
  - 🇪🇸 **Davefx Masculina** (`es_ES-davefx-medium`): Ideal para audiolibros y resúmenes pausados.
  - 🇦🇷 **Daniela Femenina** (`es_AR-daniela-high`): Voz latinoamericana de alta fidelidad (descarga opcional en 1 clic).
- **Catálogo de Voces Neuronales en Inglés** (descarga opcional):
  - 🇺🇸 **Lessac Femenina** (`en_US-lessac-medium`): Voz clara y natural.
  - 🇺🇸 **Ryan Masculina** (`en_US-ryan-medium`): Locución masculina natural.

---

## 📁 Estructura del Repositorio

```text
Vocalis TTS/
├── LICENSE                       # Licencia MIT (Mack Chirinos, 2026)
├── README.md                     # Documentación de usuario y despliegue
├── manifest.json                 # Manifiesto del plugin para Obsidian
├── styles.css                    # Estilos CSS del panel lateral y teleprompter
├── main.js                       # Código fuente del plugin para Obsidian
├── package.json                  # Metadatos del paquete npm
├── .gitignore                    # Reglas de exclusión para Git (archivos de contexto y temporales)
├── piper/                        # Motor Piper standalone y modelos locales
│   ├── piper.exe                 # Ejecutable nativo C++ para Windows x64
│   ├── *.dll                     # Bibliotecas dinámicas (ONNX Runtime, espeak-ng, etc.)
│   ├── espeak-ng-data/           # Diccionarios y datos fonéticos
│   └── models/                   # Modelos neuronales ONNX (.onnx y .json)
│       ├── es_ES-sharvard-medium.onnx (+ .json)
│       ├── es_ES-davefx-medium.onnx (+ .json)
│       ├── es_AR-daniela-high.onnx (+ .json)
│       ├── en_US-lessac-medium.onnx (+ .json)
│       └── en_US-ryan-medium.onnx (+ .json)
└── scripts/
    ├── download-voice.ps1        # Descarga de voces adicionales (Daniela, Lessac, Ryan)
    ├── install-to-vault.ps1      # Despliegue y sincronización rápida en un Vault de Obsidian
    └── test-piper.ps1            # Test de síntesis de voz en PowerShell
```

---

## ⌨️ Atajos de Teclado y Controles

| Atajo | Acción | Descripción |
| :--- | :--- | :--- |
| `Alt + E` | **Play / Pausa / Reanudar** | Inicia desde la selección o reanuda la memoria de la nota activa |
| `Alt + D` | **Detener Lectura** | Detiene el audio y cancela la síntesis (el panel queda abierto) |
| `Alt + Flecha Derecha` | **Frase Siguiente** | Salta a la siguiente oración con scroll y teleprompter |
| `Alt + Flecha Izquierda` | **Frase Anterior** | Retrocede a la oración previa |
| `Alt + R` | **Reiniciar Nota** | Reinicia la lectura desde la primera frase del documento |

*También puedes hacer clic en el icono de volumen en la barra Ribbon izquierda o en el menú contextual del editor. El comando* Abrir panel de Vocalis *muestra el panel lateral.*

---

## 🚀 Instalación y Despliegue en Obsidian

### Opción 1: Despliegue Automático con PowerShell
Ejecuta el script proporcionado indicando la ruta de tu Vault:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-to-vault.ps1 -VaultPath "C:\Ruta\A\Tu\Vault"
```

### Opción 2: Instalación Manual
1. Crea la carpeta `vocalis-tts` dentro de tu Vault en:
   `<Tu_Vault>/.obsidian/plugins/vocalis-tts/`
2. Copia los archivos `main.js`, `manifest.json`, `styles.css` y la carpeta `piper/` dentro de dicha ubicación.
3. Abre Obsidian, ve a **Ajustes > Plugins de la comunidad** y activa **Vocalis TTS**.

---

## 🎙️ Descargar Voces Adicionales (Opcional)

| Voz | Comando | Tamaño |
| :--- | :--- | :--- |
| Daniela (es_AR, high) | `-Voice daniela` | ~114 MB |
| Lessac (en_US, medium) | `-Voice lessac` | ~63 MB |
| Ryan (en_US, medium) | `-Voice ryan` | ~63 MB |
| Lessac + Ryan | `-Voice english` | ~126 MB |

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\download-voice.ps1 -Voice english
```
Luego ejecuta `install-to-vault.ps1`: copia al vault los modelos que falten. El plugin los detecta solo; las voces no instaladas aparecen marcadas en Ajustes.

---

## 🎖️ Reconocimientos y Autoría (Credits & Attribution)

Vocalis TTS es posible gracias al trabajo de creadores y proyectos de código abierto excepcionales:

- **[Rhasspy Piper TTS](https://github.com/rhasspy/piper)**: Motor neuronal rápido y local desarrollado por **Michael Hansen** ([@synesthesiam](https://github.com/synesthesiam)) y la comunidad de Rhasspy / Nabu Casa. Licenciado bajo MIT y Apache 2.0.
- **[eSpeak-NG](https://github.com/espeak-ng/espeak-ng)**: Motor de fonemización y reglas fonéticas de texto a habla.
- **Datasets y Modelos Neuronales**:
  - **Sharvard**: Conjunto de frases fonéticas Spanish Harvard Sentences, entrenado para Piper con locutores femenino y masculino de España.
  - **Davefx**: Modelo narrativo de locutor masculino en español de España.
  - **Daniela**: Modelo neuronal de locutora femenina en español latinoamericano (Argentina).
  - **Lessac** y **Ryan**: Modelos en inglés de Estados Unidos (locutora femenina y locutor masculino).
- **[Obsidian](https://obsidian.md)**: Plataforma de gestión del conocimiento extensible desarrollada por Dynalist Inc.

---

## 🔄 Historial de Versiones

### v1.1.0
- **Voces en inglés** (Lessac y Ryan) y **selector de idioma** en Ajustes, con la voz elegida por idioma. Las notas pueden fijar su idioma con `lang:` en el frontmatter.
- **Panel en la barra lateral derecha** en lugar del reproductor flotante, con la lista **Continuar escuchando**.
- La memoria de lectura sobrevive a renombrar o mover notas y se limpia al borrarlas.
- No se leen las URLs sueltas; las tablas se leen por filas.
- **Corrección**: la detección automática de `piper.exe` y de la carpeta de modelos ahora encuentra la carpeta del plugin dentro del vault.
- **Corrección**: pausar justo cuando arranca una frase ya no salta a la siguiente.

### v1.0.3
- **Prefetching Asíncrono (Latencia Cero entre Frases)**: Síntesis anticipada en segundo plano de la siguiente frase mientras se reproduce la actual. Elimina completamente las pausas muertas entre frases en voces pesadas de alta fidelidad como Daniela (Argentina High), permitiendo transiciones instantáneas y fluidas.
- **Teleprompter Universal Infalible**: Algoritmo de mapeo DOM con colapso de espacios en blanco en Modo Lectura, eliminando pérdidas de resaltado causadas por saltos de línea internos o etiquetas Markdown anidadas (`<strong>`, `<em>`, `<a>`). Soporte de resaltado continuo en elementos contenedores y eventos dinámicos de cambio de vista.
- **Reactividad Instantánea en Controles**: Cancelación inmediata de procesos huérfanos de Piper al saltar, pausar o usar la barra de progreso (seek-bar), liberando la CPU al 100% de inmediato.
- **Depuración de Metadatos Markdown**: Filtrado automático de cabeceras de callouts (`> [!NOTE]`) y símbolos sintácticos huérfanos para una locución auditiva limpia.

### v1.0.2
- **Corrección Crítica de Audio (Fidelidad Cristalina)**: Solución definitiva al problema de distorsión y ruido parasitario en Windows provocado por la traducción CRLF en el `stdout` de C++. Se implementa síntesis binaria nativa directa con ciclo de vida efímero en `os.tmpdir()` y limpieza inmediata al pasar a memoria RAM (Blob URL).
- **Gestión de Memoria y Recursos**: Revocación proactiva de objetos Blob URL (`URL.revokeObjectURL`) en pausas y cambios de frase para evitar fugas de memoria en Chromium/Obsidian.

### v1.0.1
- **Síntesis en Memoria (Zero Disk I/O)**: Transmisión directa del audio sintetizado a la memoria RAM vía `stdout` de Piper. Se elimina la creación, lectura y borrado de archivos `.wav` temporales en disco.
- **CSS Linter Compliance**: Eliminación total de declaraciones `!important` en `styles.css` mediante selectores de mayor especificidad para máxima compatibilidad con temas de la comunidad.
- **Seguridad**: Validación estricta de rutas ejecutables y aislamiento seguro de argumentos en `child_process.spawn`.
- **Atestación Criptográfica**: Configuración de GitHub Actions para firma de procedencia (*Artifact Attestations*).

### v1.0.0
- Lanzamiento inicial con teleprompter dual (Modo Edición y Modo Lectura), velocidad en tiempo real de 0.75x a 2.5x con pitch preservado, memoria independiente por nota y voces neuronales en español.

---

## 📄 Licencia

Este proyecto está distribuido bajo la [Licencia MIT](LICENSE) - creado y mantenido por **Mack Chirinos** (2026).
