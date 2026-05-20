[OPEN] Debug Session: bible-import-hang

## Symptoms
- Importing a Bible XML shows “Imported 0 translation(s)”.
- The app becomes “Not responding” during/after selecting the XML file.

## Hypotheses (falsifiable)
- H1: The desktop import path blocks the renderer thread (sync IPC / heavy parsing on UI thread), causing “Not responding”.
- H2: The XML parsing fails (invalid schema/encoding/too large), so import returns `{ ok:false }` and the UI reports 0 imports.
- H3: Translation name extraction returns empty/unknown, so data inserts but under unexpected key; UI counts as 0 due to error path.
- H4: The import runs, but the DB transaction is extremely slow (indexes/PRAGMA, large file size), causing long freeze and eventual failure.
- H5: Browser-mode import hits request/body limits or timeouts, causing server to reject silently.

## Evidence to Collect
- Desktop: file sizes, timing (read, parse, DB insert), per-file result `{ ok, translation, versesInserted, error }`.
- UI: which import path is used (Electron IPC vs browser upload), start/end timestamps, error surface.
- Server: request received for `/api/bible/import`, payload size, parse outcomes, DB insert timings.

## Runs
- pre: pending
- post: pending

## Status
- Next: Start debug server and add instrumentation only (no logic fixes yet).
