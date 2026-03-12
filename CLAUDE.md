# Child Lab Annotator

Cross-platform desktop app (Tauri v2 + Svelte 5 + TypeScript) for manual head-position and head-orientation annotation on top-down videos of mother-infant interactions.

## Tech stack

- **Desktop**: Tauri v2 (Rust backend, OS webview frontend)
- **Frontend**: Svelte 5 (runes mode) + TypeScript
- **Bundler**: Vite
- **File I/O**: Custom Tauri commands (`write_text_file`, `read_text_file`) in `src-tauri/src/lib.rs` — NOT the `@tauri-apps/plugin-fs` module (it has scope issues)
- **Dialogs**: `@tauri-apps/plugin-dialog` for native open/save file pickers

## Commands

```bash
npm run tauri dev      # Dev mode (Vite on :1420 + Tauri hot-reload)
npm run tauri build    # Production build → .app/.dmg (macOS), .msi (Windows), .AppImage (Linux)
npm run build          # Frontend-only build (Vite → dist/)
```

## Project structure

```
src/
  main.ts                         # Svelte mount
  App.svelte                      # Root: file I/O, auto-save, state wiring
  app.css                         # Dark theme, CSS vars
  lib/
    types.ts                      # AnnotationRow, Target, Phase, shape sizes, colors
    components/
      Toolbar.svelte              # Load Video/CSV, target/phase radios, Export, status
      VideoPlayer.svelte          # <video> + CanvasOverlay, FPS detection, frame callback
      CanvasOverlay.svelte        # Draggable shapes, annotation recording, canvas rendering
      Controls.svelte             # Play/pause (Space), seek bar, speed slider (0.1x–2.0x)
    stores/
      annotations.ts              # Svelte writable stores for annotation data + completed phases
    utils/
      csv.ts                      # toCSV / fromCSV serialization
      geometry.ts                 # angleDeg, handlePoint, dist, ellipse math
src-tauri/
  src/lib.rs                      # Rust: write_text_file, read_text_file commands
  src/main.rs                     # Entry point
  tauri.conf.json                 # Window 1280×800, asset protocol, CSP
  capabilities/default.json       # Permissions: core:default, dialog:allow-open/save
```

## Architecture notes

- **Coordinates** are normalized (0–1) relative to video dimensions, so annotations are resolution-independent.
- **Frame indexing** uses `Math.round(mediaTime * detectedFps)` — NOT `presentedFrames` (which is cumulative and doesn't reset on replay). FPS is auto-detected from the first 10 frame intervals.
- **Reactive loop prevention**: The CanvasOverlay uses `untrack()` from Svelte when reading `annotationRows` in the sync/record effect, and `untrack()` around `recordCurrentState()` calls, to avoid store-update → prop-change → effect-retrigger loops.
- **Orientation phase**: The ellipse center follows positions recorded in phase 1 (read-only). The long axis (semi-major `a`) aligns with the yaw direction; the handle sits at the long-axis tip. Ellipse rotation = `(yaw + 90)°`.
- **Video resets** to 0:00 and pauses whenever the user switches target or phase.
- **Auto-save** writes CSV next to the video (`<videoname>_annotations.csv`) when a phase completes (video `ended` event).

## CSV format

```
frame,timestamp,infant_x,infant_y,infant_yaw,mother_x,mother_y,mother_yaw
0,0.0000,0.4500,0.3200,,,,
1,0.0333,0.4510,0.3210,45.0000,,,
```

Null values are empty fields. Numeric precision: 4 decimal places.

## Shape sizes

| Target   | Circle (phase 1) | Ellipse (phase 2)      |
|----------|-------------------|------------------------|
| Infant   | r = 25px          | a = 29px, b = 22px     |
| Mother   | r = 35px          | a = 40px, b = 31px     |

Colors: infant = `#3b82f6` (blue), mother = `#22c55e` (green), inactive = `#9ca3af` (gray).
