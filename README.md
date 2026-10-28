# Piper TTS Pro para Obsidian (Offline, Teleprompter Dual y Memoria)

Plugin de texto a voz (TTS) neuronal de alto rendimiento, privacidad absoluta y 100% offline para Obsidian. Integra el motor local **Rhasspy Piper**, seguimiento visual de lectura tipo teleprompter en tiempo real (tanto en **Modo Edición** como en **Modo Lectura**) y memoria persistente independiente por cada nota.

Publicado bajo **Licencia MIT** por **Mack Chirinos**.

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
TTS - Piper Pro/
├── LICENSE                       # Licencia MIT (Mack Chirinos, 2026)
├── README.md                     # Documentación de usuario y despliegue
├── manifest.json                 # Manifiesto del plugin para Obsidian
├── styles.css                    # Estilos CSS del reproductor flotante y teleprompter
├── main.js                       # Código fuente del plugin para Obsidian
├── package.json                  # Dependencias npm y scripts de empaquetado
├── tsconfig.json                 # Configuración opcional para TypeScript
├── esbuild.config.mjs            # Empaquetador esbuild
├── .gitignore                    # Reglas de exclusión para Git (archivos de contexto y temporales)
├── piper/                        # Motor Piper standalone y modelos locales
│   ├── piper.exe                 # Ejecutable nativo C++ para Windows x64
│   ├── *.dll                     # Bibliotecas dinámicas (ONNX Runtime, espeak-ng, etc.)
│   ├── espeak-ng-data/           # Diccionarios y datos fonéticos
│   └── models/                   # Modelos neuronales ONNX (.onnx y .json)
│       ├── es_ES-sharvard-medium.onnx
│       ├── es_ES-sharvard-medium.onnx.json
│       ├── es_ES-davefx-medium.onnx
│       └── es_ES-davefx-medium.onnx.json
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
1. Crea la carpeta `piper-tts-pro` dentro de tu Vault en:
   `<Tu_Vault>/.obsidian/plugins/piper-tts-pro/`
2. Copia los archivos `main.js`, `manifest.json`, `styles.css` y la carpeta `piper/` dentro de dicha ubicación.
3. Abre Obsidian, ve a **Ajustes > Plugins de la comunidad** y activa **Piper TTS Pro**.

---

## 🎙️ Descargar Voces Adicionales (Opcional)

Para instalar la voz femenina latinoamericana (`es_AR-daniela-high`, ~114 MB), ejecuta:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\download-voice.ps1 -Voice daniela
```
El plugin detectará el nuevo modelo automáticamente en Obsidian sin necesidad de reiniciar.

---

## 📄 Licencia

Este proyecto está bajo la [Licencia MIT](LICENSE) - creado y mantenido por **Mack Chirinos** (2026).
