# Vocalis TTS para Obsidian (Offline, Teleprompter Dual y Memoria)

Plugin de lectura en voz alta (Text-to-Speech) neuronal de alto rendimiento, privacidad absoluta y 100% offline para Obsidian. Integra teleprompter visual sin desfase (tanto en **Modo Edición** como en **Modo Lectura**), velocidad dinámica hasta 2.5x en tiempo real y memoria de posición independiente por cada nota.

Potenciado por el motor de síntesis neuronal de código abierto **Rhasspy Piper TTS**. Publicado bajo **Licencia MIT** por **Mack Chirinos**.

---

## 🌟 Características Principales

- **100% Offline y Privado**: Sin dependencias de la nube, sin claves de API, sin suscripciones ni telemetría. Todo el procesamiento se realiza en tu procesador local.
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
- **Reproductor Flotante Autónomo y Reactivo**:
  - Widget moderno arrastrable en pantalla con botones que responden de inmediato (sin depender de dónde esté el foco del cursor).
  - Barra de progreso interactiva (Seek-bar): haz clic en cualquier porcentaje para saltar directamente a esa frase.
  - Botones de salto (+/- 1 frase), reinicio de nota (`🔄`), cambio de voz y selector de velocidad.
- **Catálogo de Voces Neuronales en Español**:
  - 🇪🇸 **Sharvard Femenina** (`es_ES-sharvard-medium`, Speaker 1): Tono claro, natural y expresivo.
  - 🇪🇸 **Sharvard Masculina** (`es_ES-sharvard-medium`, Speaker 0): Locución masculina equilibrada.
  - 🇪🇸 **Davefx Masculina** (`es_ES-davefx-medium`): Ideal para audiolibros y resúmenes pausados.
  - 🇦🇷 **Daniela Femenina** (`es_AR-daniela-high`): Voz latinoamericana de alta fidelidad (descarga opcional en 1 clic).

---

## 📁 Estructura del Repositorio

```text
Vocalis TTS/
├── LICENSE                       # Licencia MIT (Mack Chirinos, 2026)
├── README.md                     # Documentación de usuario y despliegue
├── manifest.json                 # Manifiesto del plugin para Obsidian
├── styles.css                    # Estilos CSS del reproductor flotante y teleprompter
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
│       └── es_AR-daniela-high.onnx (+ .json)
└── scripts/
    ├── download-voice.ps1        # Script para descargar voces adicionales (ej. Daniela Latam)
    ├── install-to-vault.ps1      # Despliegue y sincronización rápida en un Vault de Obsidian
    └── test-piper.ps1            # Test de síntesis de voz en PowerShell
```

---

## ⌨️ Atajos de Teclado y Controles

| Atajo | Acción | Descripción |
| :--- | :--- | :--- |
| `Alt + E` | **Play / Pausa / Reanudar** | Inicia desde la selección o reanuda la memoria de la nota activa |
| `Alt + D` | **Detener Lectura** | Detiene el audio, cancela síntesis y cierra el reproductor |
| `Alt + Flecha Derecha` | **Frase Siguiente** | Salta a la siguiente oración con scroll y teleprompter |
| `Alt + Flecha Izquierda` | **Frase Anterior** | Retrocede a la oración previa |
| `Alt + R` | **Reiniciar Nota** | Reinicia la lectura desde la primera frase del documento |

*También puedes hacer clic en el icono de volumen en la barra Ribbon izquierda o en el menú contextual del editor.*

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

Para descargar o actualizar la voz femenina latinoamericana (`es_AR-daniela-high`, ~114 MB), ejecuta:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\download-voice.ps1 -Voice daniela
```
El plugin detectará el nuevo modelo automáticamente en Obsidian sin necesidad de reiniciar.

---

## 🎖️ Reconocimientos y Autoría (Credits & Attribution)

Vocalis TTS es posible gracias al trabajo de creadores y proyectos de código abierto excepcionales:

- **[Rhasspy Piper TTS](https://github.com/rhasspy/piper)**: Motor neuronal rápido y local desarrollado por **Michael Hansen** ([@synesthesiam](https://github.com/synesthesiam)) y la comunidad de Rhasspy / Nabu Casa. Licenciado bajo MIT y Apache 2.0.
- **[eSpeak-NG](https://github.com/espeak-ng/espeak-ng)**: Motor de fonemización y reglas fonéticas de texto a habla.
- **Datasets y Modelos Neuronales**:
  - **Sharvard**: Conjunto de frases fonéticas Spanish Harvard Sentences, entrenado para Piper con locutores femenino y masculino de España.
  - **Davefx**: Modelo narrativo de locutor masculino en español de España.
  - **Daniela**: Modelo neuronal de locutora femenina en español latinoamericano (Argentina).
- **[Obsidian](https://obsidian.md)**: Plataforma de gestión del conocimiento extensible desarrollada por Dynalist Inc.

---

## 📄 Licencia

Este proyecto está distribuido bajo la [Licencia MIT](LICENSE) - creado y mantenido por **Mack Chirinos** (2026).
