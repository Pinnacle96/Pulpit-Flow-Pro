# Pulpit Flow Pro — Multi-Screen Church Production Platform

Pulpit Flow Pro (PFP) is a modern, offline-first church production platform built for live services. It drives multiple screens at the same time (congregation, stream overlay, stage, preacher confidence monitor) from one operator dashboard, with real-time sync over WebSockets.

## Preview

### Fresh Look (Add screenshots later)

(Add image here)

### Core Workflows (Add screenshots later)

(Add image here)

## Get Started

👉 Download the latest version: (Add GitHub Releases link here)  
👉 Watch demo: (Add YouTube demo link here)

## Features

- Multi-output engine (served locally for stable OBS/vMix inputs)
  - Congregation: `/display`
  - Stream overlay: `/stream` (transparent by default; lower-third or full-screen)
  - Stage monitor: `/stage` (current + next; chord mode)
  - Preacher monitor: `/preacher` (private notes + service position)
  - Remote control: `/remote` (PIN-protected; multiple modes)
  - Tech preview: `/preview` (read-only grid)
- Safety-first live workflow
  - Go Live is the master gate for content broadcast
  - Blank All is always one click and bypasses the gate
- Bible engine (offline)
  - Fast reference lookup (e.g., `John 3:16`)
  - Verse ranges (e.g., `Romans 8:28-30`)
  - Full-text search (SQLite FTS)
  - Dual translation display
- XML Bible pipeline (offline import)
  - Imports local Bible XML files into SQLite for offline use
- Song library
  - Full CRUD, structured sections, chords (stage-only), section locking
  - Plain-text import with section headers (e.g., `[Verse 1]`, `[Chorus]`)
  - Auto-fetch lyrics (internet-only, optional) + AI lyric cleaner (optional)
- Service planner
  - Drag-and-drop blocks, templates, history
  - Export/import as `.pfp`
  - Print service order
- Announcements & media
  - Slide builder + auto-advancing playlist
  - Countdown, Giving/QR, Social slides
  - Video playback controls (play/pause/seek/stop)
  - Lower-third announcement overlay option
- AI integration (optional)
  - OpenAI GPT‑4o features run only in the Electron main process
  - Disabled automatically when no key is configured

## Setup (2 Minutes)

1. Install and open Pulpit Flow Pro
2. Open **Output Previews** in the dashboard and verify outputs are loading
3. Add output URLs to OBS/vMix as Browser Sources
4. Toggle **Go Live** only when you are ready to broadcast content

## Output URLs

When the app is running, outputs are served locally:

- Main display: `http://localhost:3000/display`
- Stream overlay: `http://localhost:3000/stream`
- Stage monitor: `http://localhost:3000/stage`
- Preacher monitor: `http://localhost:3000/preacher`
- Remote control: `http://localhost:3000/remote`
- Tech preview: `http://localhost:3000/preview`

## OBS / vMix

### OBS Browser Source

1. Add a **Browser Source**
2. Set URL:
   - Livestream overlay: `http://localhost:3000/stream`
   - Full congregation output: `http://localhost:3000/display`
3. Set resolution: `1920×1080`
4. Disable “Shutdown source when not visible”

`/stream` is transparent by default for compositing and supports lower-third vs full-screen mode.

## How It Works

- Operator dashboard (Electron + React) is the control surface
- Local server (Express) serves output pages and exposes local APIs
- Real-time sync uses WebSockets (`ws`)
- SQLite stores everything locally (songs, service plans, settings, Bible)
- Outputs are dumb renderers (no independent state); they only render messages received from the server

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `→` or `Space` | Next slide / next block |
| `←` | Previous slide / previous block |
| `B` | Blank all outputs |
| `L` | Toggle Go Live |
| `Escape` | Clear display |
| `Ctrl+F` | Focus Bible search |
| `Ctrl+S` | Save service plan |
| `F11` | Toggle fullscreen |

## AI Features (Optional)

Provider: OpenAI  
Model: `gpt-4o`

Available features:

- Scripture suggester (topic → 3–5 references)
- Sermon-to-slides (outline → point slides)
- Lyric cleaner (normalize projection-ready lyrics)
- Announcement writer (event details → slide-ready text)
- Related passage finder (open passage → related references)

Security model:

- API key stored encrypted at rest
- Calls run in Electron main process only (never in output pages / renderer)

## Development

Install:

```bash
npm install
```

Run dev (Vite + Electron):

```bash
npm run electron-dev
```

Dev services:

- UI: `http://localhost:5173`
- Outputs/API: `http://localhost:3000`

## Build (Installers)

```bash
npm run electron-build
```

This packages the app via `electron-builder` and bundles output screens for deployment.

## Project Structure

```
pulpit-flow-pro/
├── electron/              # Electron main process
│   ├── main.js           # App entry point
│   ├── server.js         # Express + WebSocket server
│   ├── database.js       # SQLite schema + settings
│   ├── bibleImport.js    # XML Bible importer
│   ├── ai.js             # OpenAI integration (main process)
│   └── preload.js        # Context isolation bridge
├── src/                   # React operator dashboard
├── outputs/               # Output screen HTML (WebSocket clients)
└── package.json
```

## Known Limitations

- Planning Center import and SongSelect integration are not included by default (requires API availability, credentials, and licensing/terms compliance).

## Troubleshooting

### Port 3000 already in use

```powershell
netstat -ano | findstr :3000
```

Change the server port in Settings, or stop the conflicting process.

### Outputs not updating

- Confirm server health: `http://localhost:3000/health`
- Ensure Go Live is ON for gated content
- Ensure firewall rules allow local network devices (for `/remote`)

## Credits

Developed by **Noah Abayomi Ogunniran** (CEO, Pinnacle Tech Hub)  
Phone: **+2347032078859**  
Email: **info.pinnacletechhub@gmail.com**

## Support

Support this project: https://paystack.shop/pay/pfp_support

## License

Internal / Proprietary (church use). Contact the developer for commercial licensing and global church deployment partnerships.
