# Disk record — hypr-record (this host)

**Narrative SSOT:** `~/Documents/System/hypr-record.md`  
**ADR:** `~/Documents/System/ADRs/20260806-hypr-record-disk-screencast.md`  
**Binary:** `~/.local/bin/hypr-record` (repo mirror: `~/home-hyprland/bin/`)

> Do **not** confuse with **`kdx-share`** (Super+Ctrl+R → transmit / v4l2). That is `/kdx-hypr-video-cast`.  
> Do **not** confuse with **Super+M / `kdx-rec-mode`** (WIP REC chip; not mp4).

---

## R-key family (locked)

| Bind | Tool | Role |
|---|---|---|
| **Super+R** | `hyprlauncher` | App launcher — **keep free** |
| Super+Shift+R | `hypr-record toggle region` | Disk record region |
| Super+Shift+Alt+R | `hypr-record toggle window` | Disk record focused window |
| **Super+Ctrl+R** | **`kdx-share` menu** | Transmit panels — **not** mp4 |

Exit is **Super+Shift+E**. Super+M is REC mode WIP, not exit.

---

## CLI

```bash
hypr-record status
hypr-record inventory
hypr-record toggle region          # hotkey default
hypr-record toggle window
hypr-record region|window|full
hypr-record panel asus|aoc|bar|HDMI-A-2|HDMI-A-1
hypr-record stop
hypr-record --no-audio|--mic|--system-audio region
hypr-record --agent status         # scripts/agents: no setsid
```

| Item | Path / value |
|---|---|
| Output dir | `~/Videos/Screencasts/` |
| State | `$XDG_RUNTIME_DIR/hypr-record.{pid,state,log}` |
| Engine | `wf-recorder` (+ PipeWire/Pulse audio optional) |
| Default audio | system (`sink.monitor`) |

Env: `HYPR_REC_AUDIO` · `HYPR_REC_FPS` (default 30) · `HYPR_REC_CODEC` · `HYPR_REC_AGENT` · `HYPR_REC_DAMAGE=1` (opt-in; default continuous `-D`).

**Idle AOC pitfall (fixed 2026-08-06):** damage-only capture on a quiet HDMI-A-1 often yields 1 frame + hang on stop → unplayable mp4. Default is now `-D` + CFR 30.

---

## Panel aliases

Physical (SSOT — re-verify live):

| Physical | Connector | Prefer |
|---|---|---|
| **Left** portrait + AGS bar | HDMI-A-2 ASUS | `left` · `asus` · `bar` · `HDMI-A-2` |
| **Right** landscape | HDMI-A-1 AOC | `right` · `aoc` · `HDMI-A-1` |

Left/right follow **physical** side (fixed 2026-08-06). Brand aliases still preferred in automation.

---

## AGS surfaces

| UI | File | Live? |
|---|---|---|
| SystemMenu **Cast** row | `widget/SystemMenu.tsx` + `cast.ts` | ✅ drives `hypr-record` |
| `CastRecChip` | `CastRecChip.tsx` | ✅ stop while recording |
| `RecModeIndicator` | Super+M chip | ✅ WIP mode only |
| `RecMenu` | `RecMenu.tsx` | ❌ parked (not mounted in `Bar.tsx`) |
| `ags request rec-menu` | `app.ts` | routes; avoid relying |
| Capture panel | parked | ADR `20260726-ags-surfaces-inventory-capture-parked` |

`cast.ts` phases: `idle` · `target_set` · `recording` · `stopping` · `failed`.  
Reconcile: poll `hypr-record status` every 1.5s (external SSOT).

---

## Super+M REC mode (separate)

```bash
kdx-rec-mode toggle|on|off|status
# SSOT: /tmp/kdx_rec_mode.json  (+ flag /tmp/kdx_rec_mode)
# Worker: ~/Dev/this-computer/kdx-home-voice/Scripts/rec.py  (lifecycle only; no STT yet)
```

Not a replacement for `hypr-record`. Chip only until productized.

---

## Voice Lane B

Host catalog action `record` → `hypr-record` toggle/stop.  
`share` → `kdx-share` (different).

---

## Agent workflow

```
1. hypr-record status          # idle before start
2. Prefer CLI with brand aliases (asus|aoc) or region/window
3. After start: hypr-record status | grep recording
4. Stop: hypr-record stop  (or CastRecChip / toggle again)
5. Files land in ~/Videos/Screencasts/
6. Never use kdx-share for “save a video”
```

If binds missing after a lua edit: live file is law — re-add Super+Shift(+Alt)+R next to Print binds; `local rec` must point at `~/.local/bin/hypr-record`.
