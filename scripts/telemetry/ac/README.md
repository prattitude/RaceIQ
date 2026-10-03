# Assetto Corsa diagnostics

Capture tools for original Assetto Corsa (`acs.exe`) Windows shared-memory pages, used to build and verify the AC adapter against real data.

## Commands

| Command | Required input | Output |
| --- | --- | --- |
| `bun scripts/telemetry/ac/capture.ts [--out <dir>]` | Assetto Corsa running with `Local\\acpmf_*` pages | Kunos `.bin` capture (default `%USERPROFILE%\RaceIQ-captures\ac`), live rate and identity log |

## Boundaries and verification

The capture copies physics (up to 1024 bytes), graphics (up to 2048 bytes), and static (up to 2048 bytes, deduplicated) pages raw in the existing `ACCTEST` frame format, so recording tools under `scripts/telemetry/recordings/` can read it. Physics and graphics frames are written only when their packet id changes and the session status is live or paused; replays and menus are skipped.

Original AC shares the `acpmf_*` mapping names with ACC, so the capture will not attach while ACC is running. It finalizes when `acs.exe` exits or on Ctrl+C. Live capture requires the game and is not a CI check.
