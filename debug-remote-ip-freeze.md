[OPEN] Debug Session: remote-ip-freeze

## Symptoms
- Local IP shown in Settings is wrong (remote URL points to non-working IP).
- Freeze/Unfreeze does not work reliably.
- Installed app “not installed properly” (details needed from runtime logs).

## Hypotheses
- H1: `getLocalIPv4()` selects a VPN/virtual adapter (WARP/WSL) instead of Wi‑Fi hotspot interface.
- H2: Freeze/Unfreeze messages are not being broadcast by server or are gated/overwritten by other state sync messages.
- H3: Output pages receive `OUTPUT_FREEZE` but fail to update `frozen` state or reconnect logic drops messages.
- H4: Remote page can’t connect due to hotspot client isolation or Windows Firewall blocking inbound on the server port.
- H5: Packaged build has different `os.networkInterfaces()` names/ordering, causing different IP selection than expected.

## Evidence to Collect
- Server-side: interfaces list + chosen IP + freeze state transitions + broadcast events.
- Client-side: UI freeze button clicks + server responses + output pages receiving `OUTPUT_FREEZE`.
- Remote: verify-pin HTTP reachability + WS connect/disconnect + host used.

## Runs
- pre: pending
- post: pending

## Status
- Next: Start debug server and add instrumentation (no functional fixes yet).
