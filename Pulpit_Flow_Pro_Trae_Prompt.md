# Pulpit Flow Pro — Trae Agent Build Prompt
**Version:** 1.0 | **Date:** May 2026 | **Authority:** Single Source of Truth (SSOT) Document

---

## YOUR ROLE

You are a senior full-stack engineer building **Pulpit Flow Pro (PFP)** — a professional-grade Electron desktop application for church live production. You have been given the complete product specification. Your job is to implement it exactly as described — no shortcuts, no omissions, no creative substitutions.

You will build this project **phase by phase**, completing and validating each phase before starting the next. You do not skip phases. You do not defer requirements. If you encounter ambiguity, you resolve it using the logic already established in the specification, not your own assumptions.

---

## THE PRODUCT

**Pulpit Flow Pro** is a church production platform that:

- Runs as an **Electron desktop application** on Windows 10/11 and macOS 12+
- Embeds an **Express + WebSocket server** on `localhost:3000`
- Serves **four independent output screens** as local web pages (congregation display, stream overlay, stage monitor, preacher monitor)
- Provides a **React-based operator dashboard** for controlling all outputs in real time
- Stores all data in a **local SQLite database** (songs, service plans, settings)
- Integrates with **OBS Studio and vMix** via Browser Source pointing to `localhost:3000`
- Optionally integrates with the **OpenAI API (GPT-4o)** for AI-assisted features

---

## ABSOLUTE RULES — READ BEFORE WRITING A SINGLE LINE OF CODE

These rules are non-negotiable. Violating any one of them is a build failure.

1. **Offline-first.** All core functions (Bible lookup, song display, service planner, all outputs) must work with zero internet connection. AI features are the only exception.
2. **OBS/vMix integration works on Day 1.** `localhost:3000/display` must load in OBS Browser Source and update in real time by the end of Phase 1.
3. **Blank All is always one click, always visible.** Never behind a menu. Never behind a dialog. Never hidden. Always on screen during live operation.
4. **Go Live is a master gate.** No content appears on any output screen until the operator explicitly toggles Go Live to ON. All editing and previewing must be safe and silent.
5. **Server shuts down cleanly.** When the Electron app closes, the Express/WebSocket server on port 3000 must terminate. Implement cleanup in the `will-quit` handler. Port 3000 must not remain occupied after exit.
6. **No admin privileges required.** The app must run from the desktop like any normal application.
7. **All data is local.** SQLite only. No cloud. No external database. No user accounts. No telemetry.
8. **OpenAI API key is secure.** Stored in local app settings only. Never logged. Never transmitted except to `api.openai.com`. Never stored in a plain text config file that might be shared or committed.
9. **Response time under 500ms.** From operator action to display update on all outputs, on a standard local network.
10. **Product name is Pulpit Flow Pro.** In all window titles, UI text, installer names, and documentation. Short form `PFP` is acceptable in compact UI contexts only.

---

## TECHNOLOGY STACK — USE EXACTLY THESE, NO SUBSTITUTIONS

| Layer | Technology |
|---|---|
| Desktop wrapper | Electron (latest stable) |
| UI framework | React 18 with Vite |
| Styling | Tailwind CSS |
| Local HTTP server | Express.js |
| Real-time sync | ws (WebSocket library) |
| Database | SQLite via `better-sqlite3` |
| State management | Zustand |
| Icons | Lucide React |
| Bible data | Local JSON files converted to SQLite at build time |
| AI integration | OpenAI API — model: `gpt-4o` |
| Installer | electron-builder (Windows .exe + macOS .dmg) |

Do not substitute React for Vue, Svelte, or anything else. Do not substitute `better-sqlite3` for another ORM. Do not use cloud databases. Do not use `localStorage` or `sessionStorage` as a persistence layer.

---

## PROJECT FILE STRUCTURE — IMPLEMENT EXACTLY

```
pulpit-flow-pro/
├── electron/
│   ├── main.js           ← App entry, window management, server startup
│   ├── server.js         ← Express + WebSocket server
│   ├── database.js       ← SQLite connection and query helpers
│   ├── bible.js          ← Bible lookup logic
│   └── ai.js             ← OpenAI API integration
├── src/
│   ├── App.jsx           ← Root component with layout zones
│   ├── components/       ← Reusable UI components
│   ├── panels/           ← Left / Center / Right panel components
│   ├── views/            ← Song view, Scripture view, Announcement view, etc.
│   └── store/            ← Zustand state stores
├── outputs/
│   ├── display.html      ← Congregation screen
│   ├── stream.html       ← OBS/vMix overlay (transparent background)
│   ├── stage.html        ← Stage monitor for worship team
│   ├── preacher.html     ← Pastor confidence monitor
│   ├── remote.html       ← Phone/tablet remote control
│   └── preview.html      ← Tech team live preview
├── data/
│   └── bible/            ← Bible JSON source files by translation
├── assets/
│   └── backgrounds/      ← Default backgrounds, logos
├── scripts/
│   └── import-bible.js   ← Script to load Bible JSON into SQLite
├── package.json
└── electron-builder.yml
```

---

## DATABASE SCHEMA — IMPLEMENT ALL TABLES EXACTLY

### `songs`
```sql
CREATE TABLE songs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  artist       TEXT,
  ccli_number  TEXT,
  key_sig      TEXT,
  tempo        TEXT,
  tags         TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME
);
```

### `song_sections`
```sql
CREATE TABLE song_sections (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id   INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  type      TEXT NOT NULL,
  label     TEXT NOT NULL,
  lyrics    TEXT,
  chords    TEXT,
  position  INTEGER NOT NULL,
  locked    INTEGER DEFAULT 0
);
```

### `service_plans`
```sql
CREATE TABLE service_plans (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  service_date DATE,
  template     INTEGER DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `service_blocks`
```sql
CREATE TABLE service_blocks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id        INTEGER NOT NULL REFERENCES service_plans(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  position       INTEGER NOT NULL,
  song_id        INTEGER REFERENCES songs(id),
  scripture_ref  TEXT,
  custom_data    TEXT,
  notes          TEXT,
  completed      INTEGER DEFAULT 0
);
```

### `settings`
```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

Default settings rows to insert on first launch:
- `church_name` → `'My Church'`
- `primary_color` → `'#1B2A4A'`
- `secondary_color` → `'#C9A84C'`
- `default_translation` → `'KJV'`
- `server_port` → `'3000'`
- `remote_pin` → `'0000'`
- `go_live` → `'false'`

---

## WEBSOCKET MESSAGE PROTOCOL — IMPLEMENT ALL TYPES

Every WebSocket message is a JSON string with this envelope:

```json
{
  "type": "MESSAGE_TYPE",
  "payload": {},
  "timestamp": 1234567890
}
```

Implement handlers for ALL of the following message types on both the server (broadcast) and every output screen (receive + render):

| Type | Payload |
|---|---|
| `DISPLAY_VERSE` | `{ text, reference, translation, secondText?, secondTranslation?, theme }` |
| `DISPLAY_LYRICS` | `{ songTitle, artist, sectionLabel, lines[], nextSectionLabel?, nextLines?, theme }` |
| `DISPLAY_SLIDE` | `{ title?, body?, background?, type: 'announcement'|'custom'|'blank' }` |
| `DISPLAY_BLANK` | `{}` — blanks all outputs immediately |
| `DISPLAY_CLEAR` | `{}` — returns all outputs to standby/logo |
| `THEME_CHANGE` | `{ themeName, primaryColor, secondaryColor, backgroundUrl? }` |
| `SERVICE_ADVANCE` | `{ blockIndex, blockType, blockTitle }` |
| `GO_LIVE` | `{ live: true|false }` |
| `STAGE_CHORD_MODE` | `{ enabled: true|false }` |
| `PREACHER_NOTE` | `{ note }` — rendered only on `/preacher` |
| `PING` | `{}` — clients respond with `PONG` |

**Rule:** Every output screen must handle unknown message types gracefully — log and ignore. Never crash on unrecognized types.

---

## OUTPUT SCREENS — IMPLEMENT ALL SIX

Each is a standalone HTML page served by Express and connected to the WebSocket server.

### `/display` — Congregation Screen
- Full 1920×1080 viewport
- Full-screen background (color, image, or looping video)
- Large centered text — minimum `64px` for lyrics, `48px` for verse text
- Strong text shadow or outline for readability over any background
- Renders: `DISPLAY_VERSE`, `DISPLAY_LYRICS`, `DISPLAY_SLIDE`, `DISPLAY_BLANK`, `DISPLAY_CLEAR`
- Goes completely dark/black on `DISPLAY_BLANK`
- Returns to church logo/standby on `DISPLAY_CLEAR`

### `/stream` — OBS/vMix Overlay
- Transparent background (`background: transparent; background-color: rgba(0,0,0,0)`)
- `body { background: transparent !important }`
- Default mode: lower-third (content in bottom 25% of screen)
- Full-screen mode toggle available
- Text must always be readable over any video background — use shadow + semi-transparent backing bar
- Renders same message types as `/display` with overlay-appropriate layout

### `/stage` — Stage Monitor
- Dark background, high contrast
- Two-zone layout: current section (large, top 60%) + next section preview (smaller, bottom 40%)
- Section label (e.g., "CHORUS", "VERSE 2") displayed prominently
- Chord chart mode: when `STAGE_CHORD_MODE { enabled: true }` is received, show chords above lyrics
- Font minimum `36px` for lyrics — readable from 10 feet

### `/preacher` — Confidence Monitor
- Dark background, minimal distraction
- Current content displayed large (verse text or song section)
- Service position indicator at top: "Block 3 of 8 — Worship Song"
- Private notes area: renders `PREACHER_NOTE` payload only (not shown on any other output)
- Goes blank on `DISPLAY_BLANK`

### `/remote` — Phone Remote Control
- Mobile-first responsive layout
- Shows: current service block name, current slide content (truncated)
- Buttons: Previous Slide, Next Slide (large, thumb-friendly)
- Status indicator: Go Live ON/OFF
- PIN-protected: prompt for 4-digit PIN on first load (compare against `settings.remote_pin`)
- Sends commands back to server via WebSocket

### `/preview` — Tech Team Preview
- Shows thumbnail previews of all four main outputs in a 2×2 grid
- Labels each: "CONGREGATION", "STREAM", "STAGE", "PREACHER"
- Updates in real time as content changes
- Read-only — no controls

---

## OPERATOR DASHBOARD — IMPLEMENT EXACTLY AS SPECIFIED

### Layout (four persistent zones)

```
┌─────────────────────────────────────────────────────────┐
│  TOP BAR: App name | Service status | Theme | Settings  │
├──────────────┬──────────────────────┬───────────────────┤
│              │                      │                   │
│  LEFT PANEL  │   CENTER PANEL       │   RIGHT PANEL     │
│  Service     │   Active content     │   Live preview    │
│  Plan List   │   (changes by type)  │   thumbnails      │
│              │                      │   (4 outputs)     │
│              │                      │                   │
├──────────────┴──────────────────────┴───────────────────┤
│  BOTTOM BAR: ◀ Prev | ▶ Next | ⬛ BLANK ALL | Go Live  │
└─────────────────────────────────────────────────────────┘
```

### Top Bar
- App name: "Pulpit Flow Pro"
- Service status pill: "● LIVE" (green) or "○ STANDBY" (gray)
- Active theme name
- Settings button (gear icon)

### Left Panel — Service Plan
- Scrollable ordered list of blocks
- Each block shows: type icon, block title, status (pending / active / completed)
- Active block is highlighted
- Click any block to make it active
- Drag-and-drop reordering

### Center Panel — Active Content View
- **Song View:** Song title, artist, section list (clickable), current section lyrics (large), next section preview (smaller), Prev/Next Section buttons, chord chart toggle
- **Scripture View:** Translation dropdown, Book/Chapter/Verse cascading pickers, direct text input ("John 3:16"), verse range toggle, second translation toggle, live render preview
- **Announcement View:** Title, body text, background picker, duration, Send to Display button
- **Blank/Custom View:** Send Blank, Send Clear, custom text input

### Right Panel — Live Preview
- Four small iframes or canvas previews labeled CONGREGATION, STREAM, STAGE, PREACHER
- Updates in real time

### Bottom Bar
- **◀ Prev Slide** — go to previous section or block
- **▶ Next Slide** — go to next section or block
- **⬛ BLANK ALL** — red button, always visible, sends `DISPLAY_BLANK` to all outputs instantly
- **Go Live toggle** — green when ON, gray when OFF, sends `GO_LIVE` message on toggle

### Keyboard Shortcuts (all must work)
| Key | Action |
|---|---|
| `Space` or `→` | Next slide |
| `←` | Previous slide |
| `B` | Blank all outputs |
| `L` | Toggle Go Live |
| `Escape` | Clear (standby) |
| `Ctrl+F` | Open Bible search |
| `Ctrl+S` | Save service plan |
| `F11` | Toggle fullscreen |

---

## FEATURE MODULES — IMPLEMENT ALL EIGHT

### Module 1 — Bible Engine
- KJV stored locally in SQLite (Phase 1); NIV, ESV, NKJV, AMP, NLT added in Phase 3
- Reference lookup resolves in under 500ms
- Full-text keyword search across all loaded translations
- Verse range support: "Romans 8:28-30" displays as one block
- Side-by-side dual translation display
- Works 100% offline

### Module 2 — Song Library
- Full CRUD: create, read, update, delete songs
- Songs stored in SQLite with sections
- Search by title, artist, CCLI number, lyrics keyword
- Section locking (admin toggle)
- Next-slide section preview in operator view
- Import from plain text with section labels (e.g., `[Verse 1]`, `[Chorus]`)
- Auto-retrieve lyrics via web fetch (requires internet, gracefully disabled offline)

### Module 3 — Service Planner
- Build ordered list of blocks before service
- Block types: Welcome, Song, Scripture, Sermon, Offering, Prayer, Announcement, Video, Custom, Blank
- Drag-and-drop reordering
- Each block pre-configurable (e.g., Song block has a song pre-selected)
- Save and load service templates
- Operator advances with Next Block — correct content loads automatically
- Service history: plans saved with date, searchable
- Export/import as `.pfp` JSON files

### Module 4 — Multi-Output Display Engine
- All six output URLs operational
- All outputs receive the same WebSocket broadcast and render their own layout
- Freeze mode: operator can freeze one output while advancing another
- `/stream` has lower-third mode toggle

### Module 5 — Theme & Branding Engine
- Church name, logo, colors set once in Settings, applied globally
- Built-in themes: Worship (dark), Scripture (light), Sermon (neutral), Announcement (bold), Blank (black)
- One-click theme switching during live service
- Per-output theme override
- Background types: solid color, static image, looping video (MP4)
- Font selector (curated set: Montserrat, Open Sans, Playfair Display, Noto Sans)
- Custom themes saveable with name

### Module 6 — Announcements & Media
- Announcement slide builder: title, body, image, background, duration
- Auto-advancing announcement playlist
- Countdown timer slide with live countdown
- Giving/QR code slide generator
- Social media handle slide
- Video file playback with play/pause/stop controls in dashboard
- Lower-third announcement overlay mode

### Module 7 — Network & Remote Control
- `/remote` accessible on any phone on same WiFi
- PIN protection (4-digit, set in Settings)
- Worship leader mode (song sections only)
- Pastor mode (sermon points + next scripture only)
- Network IP address displayed in app settings for easy device connection
- Live preview at `/preview` for tech team

### Module 8 — AI Integration (OpenAI GPT-4o)
- Powered by OpenAI API, model `gpt-4o`
- API key stored in `settings` table, encrypted at rest
- All API calls made in Electron main process via `electron/ai.js` — never in renderer
- Features:
  - **Scripture Suggester:** operator types a sermon topic → GPT-4o returns 3–5 relevant Bible verses with references
  - **Sermon-to-Slides:** operator pastes a sermon outline → GPT-4o returns structured point slides
  - **Lyric Cleaner:** imported lyrics → GPT-4o corrects capitalization, line breaks, spacing
  - **Announcement Writer:** operator types event details → GPT-4o generates clean announcement slide text
  - **Related Passage Finder:** given an open scripture → GPT-4o suggests thematically related passages
- All AI features gracefully disabled and clearly labeled when API key is not set
- Show loading state during API calls; never block the operator dashboard

---

## DESIGN SYSTEM — IMPLEMENT EXACTLY

### Color Palette (CSS Variables)
```css
:root {
  --color-navy:       #1B2A4A;
  --color-gold:       #C9A84C;
  --color-blue:       #2E5FA3;
  --color-light-bg:   #EEF3FB;
  --color-mid-bg:     #D4E0F5;
  --color-white:      #FFFFFF;
  --color-gray:       #666666;
  --color-border:     #C0CBDB;
  --color-danger:     #C0392B;
  --color-success:    #1E7E34;
  --color-text-main:  #FFFFFF;
  --color-text-dim:   #AAAAAA;
}
```

### Typography
- Dashboard UI: `'DM Sans'` or `'Figtree'` — clean, modern, distinct from generic Inter/Roboto
- Display headings (outputs): `'Montserrat'` Bold
- Display body (outputs): `'Open Sans'` or `'Noto Sans'`
- Monospace: `'JetBrains Mono'` for settings/debug panels

### Dashboard Aesthetic
- Dark theme throughout (operator booth is dim)
- High contrast — all UI readable at a glance in low light
- Minimal chrome — content areas dominate
- Smooth transitions on state changes (100–200ms)
- Active/selected states always obvious
- No modal dialogs during live service mode

### Output Screen Aesthetic
- Congregation screen: cinematic, polished, broadcast-quality
- Text always has shadow or outline — readable over any background
- Smooth slide-in/fade transitions between content changes (300ms max)
- No UI chrome on output screens — pure content only

---

## BUILD PHASE SEQUENCE — FOLLOW STRICTLY

### Phase 1 — Foundation (Build This First)

**Deliverables:**
1. Electron app boots, opens the operator dashboard window
2. Express server starts on `localhost:3000` on app launch — logged to console
3. `localhost:3000/display` renders correctly in a browser
4. `/display` loads in OBS Browser Source at 1920×1080 and updates in real time
5. SQLite database created on first launch in `userData` directory
6. Bible data (KJV) imported into SQLite from JSON source
7. Operator types `John 3:16` → verse appears on `/display` in under 500ms
8. Go Live toggle works — `/display` shows nothing when Go Live is OFF
9. Blank All button sends `DISPLAY_BLANK` → `/display` goes black instantly
10. App closes cleanly — port 3000 released

**Phase 1 is NOT complete until every item above passes manually.**

---

### Phase 2 — Core Production

**Deliverables:**
1. Song library with full CRUD persists in SQLite across app restarts
2. Service planner builds, saves, and loads plans
3. Operator runs a full mock Sunday service start to finish
4. `/stream` renders transparent-background overlay correctly in OBS
5. `/stage` shows current + next section preview correctly
6. All keyboard shortcuts work
7. Drag-and-drop block reordering works in service planner

**Phase 2 is NOT complete until every item above passes manually.**

---

### Phase 3 — Full Platform

**Deliverables:**
1. All 6 output URLs live and functional
2. `/remote` accessible and functional on a phone browser on same WiFi
3. `/preacher` shows private notes separate from all other outputs
4. Announcement playlist auto-advances on timer
5. Video file playback controlled from dashboard
6. Motion background video loops on `/display` without stuttering
7. All Bible translations (KJV, NIV, ESV, NKJV, AMP, NLT) loaded and switchable
8. Custom themes save and reload correctly
9. `.pfp` service plan export and import works

---

### Phase 4 — Intelligence Layer

**Deliverables:**
1. OpenAI API key saved and retrieved from encrypted settings
2. Scripture Suggester returns relevant results for a sermon topic
3. Sermon-to-Slides produces usable slides from a sermon outline
4. Lyric Cleaner improves pasted lyrics correctly
5. All AI features show clear disabled state when no API key is set
6. No AI call blocks the operator dashboard (all async with loading indicators)

---

## DEVELOPMENT RULES FOR TRAE

1. **Read the spec before writing any module.** The SSOT document contains the authoritative definition. If this prompt and the SSOT conflict, the SSOT wins — flag it before proceeding.

2. **Build incrementally.** Complete Phase 1 fully before touching Phase 2 code. Never write placeholder stubs and move on — if a Phase 1 requirement isn't working, fix it now.

3. **Test after every module.** After completing each module, manually verify all its requirements before marking it done.

4. **No hardcoded content.** Church name, colors, and logo come from the `settings` table. Never hardcode "My Church" or any color value outside the CSS variable system.

5. **Error handling everywhere.** The app runs during live church services. A crash or hang is a ministry disaster. Wrap all database calls, WebSocket handlers, and API calls in try/catch. Log errors clearly. Never let an error propagate uncaught to the user.

6. **WebSocket reconnection.** All output screens must auto-reconnect to the WebSocket server if the connection drops. Use exponential backoff (max 5 retries, then show a reconnecting indicator).

7. **Electron IPC is the bridge.** The React renderer process communicates with the Electron main process (and the database/server) via `ipcRenderer.invoke` and `ipcMain.handle`. Never access SQLite directly from the renderer. Never expose Node.js APIs to the renderer via `nodeIntegration: true` — use `contextBridge` and a `preload.js`.

8. **Security first.** `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true` in all Electron `BrowserWindow` configs. Preload script uses `contextBridge.exposeInMainWorld` to expose only the specific IPC channels needed.

9. **Commit per phase.** When Phase 1 is complete, commit with message `feat: Phase 1 complete — Foundation`. Same for each phase. Do not mix phase work in commits.

10. **Document the IP address display.** In the Settings screen, show the machine's local network IP address clearly (e.g., `192.168.1.105`) so operators can easily direct phones to `http://192.168.1.105:3000/remote`. Auto-detect using Node.js `os.networkInterfaces()`.

---

## FIRST ACTIONS — START HERE

Execute these steps in order. Do not jump ahead.

```
Step 1: Initialize the project
  - Run: npm create vite@latest pulpit-flow-pro -- --template react
  - Install Electron: npm install --save-dev electron electron-builder
  - Install dependencies: npm install express ws better-sqlite3 zustand lucide-react
  - Install dev: npm install --save-dev tailwindcss postcss autoprefixer
  - Configure Tailwind
  - Set up electron/main.js with basic BrowserWindow

Step 2: Set up the Express + WebSocket server (electron/server.js)
  - Express serves static files from /outputs/
  - WebSocket server broadcasts messages to all connected clients
  - Server starts on port 3000
  - Server exposes a broadcast() function

Step 3: Set up SQLite (electron/database.js)
  - Connect to database in userData directory
  - Run CREATE TABLE IF NOT EXISTS for all five tables
  - Insert default settings on first launch
  - Export query helper functions

Step 4: Import Bible data (scripts/import-bible.js)
  - Download or include KJV JSON source
  - Parse and insert all verses into a `bible_verses` table
  - Schema: (id, translation, book, chapter, verse, text)
  - Run this script once: node scripts/import-bible.js

Step 5: Build the basic /display output (outputs/display.html)
  - Connect to WebSocket on ws://localhost:3000
  - Handle DISPLAY_VERSE, DISPLAY_LYRICS, DISPLAY_BLANK, DISPLAY_CLEAR
  - Style with large centered text, dark background

Step 6: Build the operator dashboard shell (src/App.jsx)
  - Four-zone layout (Top Bar, Left, Center, Right, Bottom)
  - Go Live toggle in bottom bar
  - Blank All button (red) in bottom bar

Step 7: Wire Bible search in the dashboard → sends DISPLAY_VERSE → updates /display

Step 8: Verify Phase 1 exit criteria — all 10 items pass
```

---

## WHAT DONE LOOKS LIKE

The project is complete when:

- A volunteer with no technical training can open the app, load a Sunday service plan, and run an entire church service — songs, scriptures, announcements, and sermon — without touching a terminal or browser
- The congregation projector, the livestream (OBS/vMix), the stage monitor, and the pastor's tablet all show the correct content for their audience simultaneously
- The pastor can advance slides from their phone while walking the stage
- The worship leader's stage monitor shows chords while the congregation sees only lyrics
- The app has never crashed, never frozen, and has never let content appear on the congregation screen unexpectedly
- Everything above works with the WiFi router unplugged from the internet

---

*This prompt is the complete and authoritative build specification for Pulpit Flow Pro. Implement everything described. Nothing is optional except AI features when the API key is not set. When in doubt, refer to the SSOT document.*
