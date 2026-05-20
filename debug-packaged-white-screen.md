[OPEN] Debug Session: packaged-white-screen

## Symptom
- Packaged/installed Windows build opens a blank white window (no UI).
- Dev mode (`npm run electron-dev`) works normally.

## Expected
- Packaged app should load the React dashboard UI and start the local server like dev mode.

## Environment
- OS: Windows
- Build: electron-builder (NSIS + portable)
- Electron: 31.x (per build logs)

## Hypotheses (Falsifiable)
- **A**: Vite production build uses absolute asset paths (e.g. `/assets/...`) that break under `file://` in packaged app, causing the renderer to fail to load JS/CSS.
- **B**: The packaged app cannot find `dist/index.html` at the expected path (packaging layout/path resolution issue).
- **C**: Preload script fails or is not loaded, causing the renderer to crash early.
- **D**: Electron main process starts but the renderer process crashes (runtime JS error) and the app silently shows a blank window.
- **E**: Local server start or resource/static paths fail in production and the dashboard depends on it in a way that prevents rendering.

## Instrumentation Plan
- Add main-process instrumentation for:
  - computed `startUrl`, file existence checks (B)
  - `did-fail-load`, `render-process-gone`, and `console-message` capture (A/C/D)
  - key app paths (`app.getAppPath()`, `process.resourcesPath`) (B/E)
- Add preload instrumentation for:
  - window `error` and `unhandledrejection` (C/D)

## Runs
- pre-fix: pending evidence
- post-fix: pending evidence

