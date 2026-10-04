# Trailbrake

Companion for RaceIQ. NPU-only forecast features stay off when Windows ML has no ready NPU provider. GPU and CPU are never used as a fallback.

## Projects

| Project | Purpose |
| --- | --- |
| `Trailbrake.Core` | Shared NPU capability report, RaceIQ client, companion status JSON |
| `Trailbrake.Probe` | CLI to inspect hardware/providers and prepare the recommended NPU EP |
| `Trailbrake.Companion` | Window that requires a ready NPU, links to RaceIQ, writes live status |

Status files live in `%LOCALAPPDATA%\Trailbrake\`:

- `npu-capability.json` — hardware + provider recommendation
- `companion-status.json` — live companion heartbeat for RaceIQ Settings → Trailbrake

## Commands

```powershell
dotnet run --project trailbrake/Trailbrake.Probe
dotnet run --project trailbrake/Trailbrake.Probe -- --ensure-ready
dotnet run --project trailbrake/Trailbrake.Companion
```

RaceIQ must be running locally (`bun run dev` or the installed app). The companion tries `TRAILBRAKE_RACEIQ_URL`, then port `3117`, then the portless proxy on `127.0.0.1:1355` with Host `raceiq.localhost`.
