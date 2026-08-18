---
name: kdx-hypr-control
description: >
  Configure Hyprland + AGS (Aylur's GTK Shell bar) on kodex's debian-sid machine.
  Trigger on ANY mention of: hpyr, hypr, hyprland, hyperland, linux desktop,
  AGS bar, hyprland.lua, keybinds/monitors under Hypr, NVIDIA env for Hypr,
  status bar on this host, /kdx-hypr-control, kdx-hypr-control (formerly
  kdx-hyperland). "hpyr" alone is enough — any context. Always re-read live
  config and ADRs before changing; GNOME stays the daily driver.
---

# kdx-hypr-control — Hyprland + AGS on this host

**Spelling:** skill is `/kdx-hypr-control` (formerly `/kdx-hyperland`); compositor is **Hyprland**. **AGS** = Aylur's GTK Shell (bar). GNOME remains daily driver; Hyprland is GDM dual-session experiment.

## Stance (do not violate)

1. **Never force** `XDG_CURRENT_DESKTOP` globally — session/GDM only.
2. **Edit live files**, then keep `~/home-hyprland` in mind if syncing (repo can lag).
3. Prefer **Lua** (`hyprland.lua`). Hyprlang `.conf` is deprecated since 0.55.
4. After Hypr edits: reload via **hyprmcp** when connected, else `hyprctl reload`. After AGS edits: `ags quit &&` re-run (or restart session). **Permissions** need full Hypr restart.
5. Register standing host decisions with `kdx-register-this-configuration` → `~/Documents/System/ADRs/`.
6. **Live compositor state → hyprmcp first** (global strong default MCP). Shell `hyprctl` only when MCP is down, for bulk JSON pipes the tools don't cover, or when the skill explicitly says so.

## hyprmcp (preferred for inspect / dispatch)

Shared MCP server `hyprmcp` (`~/.local/bin/hyprmcp`). Discover schema with `search_tool` then call via `use_tool` (`hyprmcp__…`).

| Need | Tool | Notes |
|------|------|--------|
| Monitors | `list_monitors` | Prefer over `hyprctl monitors -j` |
| Workspaces | `list_workspaces` | Prefer over `hyprctl workspaces -j` |
| Windows | `list_clients` / `get_active_window` | Focus / class / workspace |
| Layers (ags-bar, hyprpaper) | `list_layers` | Verify bar placement after zoom/heal |
| Input devices | `list_devices` | HID / pointer inventory |
| Dispatch (workspace, focus, …) | `dispatch_command` | `dispatch` + `argument` — same surface as `hyprctl dispatch` |
| Runtime keyword | `set_keyword` | Temporary; durable edits stay in `hyprland.lua` |
| Reload config | `reload_config` | After Lua edits when session is Hyprland |
| Version | `get_version` | Sanity |
| Kill-by-click | `enter_kill_mode` | Destructive UI — only if user asked |

**Still shell (not MCP):** AGS (`ags request …`), host helpers (`hypr-zoom-toggle`, `hypr-monitor-heal`, `hypr-screenshot`, `kdx-share`), `systemctl --user`, DRM sysfs, file edits under `~/.config/hypr` / `~/.config/ags`.

**Fallback when hyprmcp missing/failing:** keep the cheatsheet `hyprctl` commands below.

## Paths (this machine)

| Role | Path |
|---|---|
| Hypr config (live) | `~/.config/hypr/hyprland.lua` |
| Wallpaper | `~/.config/hypr/hyprpaper.conf` |
| AGS bar (live) | `~/.config/ags/` (`app.ts`, `widget/`, `icons/`, `style.scss`) |
| Skill (live) | `~/.claude/skills/kdx-hypr-control/` (also `.grok` / gemini) — **not** `~/Skills/` |
| Git SSOT (private) | `~/home-hyprland/` — `hypr/`, `ags/`, `bin/`, `kitty/`, `wallpapers/`, `skill/kdx-hypr-control/` |
| Host helpers | `~/.local/bin/hypr-*` + **`kdx-share`** (`hypr-screenshot`, `hypr-record`, `hypr-reveal-all`, `hypr-zoom-toggle`, `kdx-share`) — **no** `~/Scripts/…/Hyperland/`; mirrored in repo `bin/` |
| Command map | `references/host-commands.md` — caffeine · LLM · k · share · **record** · R-key family |
| **Disk record** | `references/record.md` · narrative `~/Documents/System/hypr-record.md` · ADR `20260806-hypr-record-disk-screencast` |
| Narrative | `~/Documents/System/Desktop.md` |
| ADRs | `~/Documents/System/ADRs/` — hypr/ags incl. `20260807-ags-ram-track`, `20260806-hypr-record-disk-screencast`, `20260726-hyprland-super-ctrl-r-kdx-share`, `20260720-ags-caffeine-toggle`, `20260725-hyprland-super-ctrl-z-zoom-toggle`, `20260726-hyprland-portrait-default-scale-1`, `20260726-ags-surfaces-inventory-capture-parked` |
| Binaries | `hyprland` 0.55.4 · `ags` 3.1.0 @ `/usr/local/bin/ags` |

## Workflow (every invocation)

```
1. Confirm session: echo $XDG_CURRENT_DESKTOP  (expect Hyprland only when testing)
2. Live layout: hyprmcp list_monitors / list_workspaces / list_clients (fallback: hyprctl *-j)
3. READ live hyprland.lua + relevant AGS files BEFORE editing
4. Load references/ as needed (below)
5. Apply minimal change; hyprmcp reload_config (or hyprctl reload)
6. Verify with hyprmcp list_layers / list_monitors
7. If decision is standing → ADR via kdx-register-this-configuration
```

### Reference routing

| Task | Load |
|---|---|
| Keybinds / Super+* map | `references/keybinds.md` |
| Custom commands inventory (caffeine/LLM/k/share/**record**) | `references/host-commands.md` |
| **Disk screencast (`hypr-record`, Super+Shift+R)** | `references/record.md` + `~/Documents/System/hypr-record.md` |
| Transmit / virtual cam (`kdx-share`) | `references/host-commands.md` §kdx-share · skill `/kdx-hypr-video-cast` |
| Monitors, env, NVIDIA, devices, autostart, look | `references/this-machine.md` |
| Upstream Hyprland 0.55 Lua API / wiki | `references/hyprland-docs.md` |
| **AGS bar (docs + our bar)** | `references/ags.md` ← special section |

Do **not** paste hyprlang from old blogs. Translate to `hl.*` using `references/hyprland-docs.md`.

## Quick facts (live, re-verify on edit)

- **Monitors (live):** HDMI-A-2 ASUS portrait **left** (`transform 1`, **default scale 1 roomy** → 1080×1920 @ `-1080x0`) · HDMI-A-1 AOC landscape right (`scale 1`, `0x420`). **Super+Ctrl+Z** toggles roomy↔dense 1.5 (720×1280 @ `-720x0`, AOC `0x100`) + wallpaper/AGS resync. ADRs `20260726-hyprland-portrait-default-scale-1` · `20260725-hyprland-super-ctrl-z-zoom-toggle`
- **Workspaces (2026-08-01):** `hl.workspace_rule` in live `hyprland.lua` — **1,2,3 → HDMI-A-2 (left)**, **4,5,6 → HDMI-A-1 (right)**; `default=true` on **1** and **4**; all six `persistent=true`. Login / heal should show **1 + 4**. Super+1…6 focus/move follow those IDs (and land on the owning monitor).
- **Layout:** dwindle · **mod:** SUPER · **terminal:** kitty · **browser Super+X:** brave-browser
- **AGS:** bar **only on HDMI-A-2** · Super+B always→temp→hidden · Super_L/R peek · first paint `always`
- **Bar contents:** start = Volume · end = KodexbotChip + **RecMode** (Super+M WIP) + **CastRecChip** (while `hypr-record` active) + **RamTrack** (3-pip FSM, left of brain) + LocalLlm brain + Clock + **SystemMenu** sandwich (extreme right). System menu rows: **Gabriel-L2TP** · mic mute · **Cast** (target + disk record via `cast.ts`) · restart · power off. Capture/caffeine/Live/Dictation parked or retired. RecMenu parked.
- **Surfaces:** live = `ags-bar` only · on-demand = `ags-local-llm` (+clickaway), cast popup, Live/Dictation inline (state file ausente = apagado, **no** roto) · **parked** = `ags-capture`, `RecMenu`. ADR `20260726-ags-surfaces-inventory-capture-parked`
- **Bar widget pattern:** FSM + external SSOT + derived UI — template `widget/caffeine.ts` (not bare bools). Live examples: **RamTrack** (`widget/ram.ts`), cast, LocalLlm. Next: **chat UI** follows same contract
- **RAM track:** `widget/ram.ts` + `RamTrack.tsx` · metric **MemTotal − MemAvailable** · phases empty/low/med/high (pips 0–3) · colors gray/green/yellow/red from bar status palette · `ags request ram-status` · ADR `20260807-ags-ram-track`
- **Volume:** speakers / muted / headphones via live `defaultSpeaker`. Audio topology ADR `20260724-audio-hdmi-headphones-mb-speakers` (HDMI=auris, MB jack=parlantes)
- **Caffeine:** `widget/caffeine.ts` · `ags request caffeine` / `caffeine-status` · three states: sin borde = nadie retiene idle · **borde tenue** = lo retiene otro (`foreign=idle`, no la taza) · humo + borde vivo = lo retiene la taza. Receptor = hypridle, **solo HDMI-A-1**; la máquina no suspende. ADRs `20260720-ags-caffeine-toggle` · `20260726-hypridle-dpms-caffeine`
- **Display power:** automatic DPMS **OFF** (dual-GPU). Never DPMS A-2. **Super+Shift+O** / TTY `hypr-monitor-heal`. AGS unit `ags-hyprland.service` Restart=always. ADR `20260727-hypr-monitor-heal-portrait-crtc`
- **Local LLM:** `LocalLlm.tsx` · ready = `127.0.0.1:28000/v1/models` · 8 GB one model · 90 s load kill
- **Screenshots:** Print family → `hypr-screenshot` → `~/Pictures/Screenshots/`. **Reveal:** Super+A → `hypr-reveal-all`. **Zoom:** Super+Ctrl+Z → `hypr-zoom-toggle`.
- **Disk record (mp4):** **`hypr-record`** — Super+Shift+R region · Super+Shift+Alt+R window · SystemMenu **Cast** (arm target) · bar **`[*REC]`** gray=armed / red=live (stop → path clipboard + VLC). Output `~/Videos/Screencasts/`. ADR `20260806-hypr-record-disk-screencast` · runbook `references/record.md` · narrative `~/Documents/System/hypr-record.md`. Physical aliases: `left`/`asus`→HDMI-A-2 · `right`/`aoc`→HDMI-A-1. Super+M = WIP `kdx-rec-mode` chip, **not** screencast.
- **Share / transmit (not mp4):** **Super+Ctrl+R** → `kdx-share` (vertical left · horizontal right · both stack). Super+R stays hyprlauncher. Skill `/kdx-hypr-video-cast`.
- **NVIDIA:** `AQ_DRM_DEVICES=/dev/dri/card0:/dev/dri/card1` · GSK: `GSK_RENDERER=gl`
- **Pointer:** Ducky HID disabled; hardware cursors forced

## Reload cheatsheet

```bash
hyprctl reload
hyprctl version
hyprctl binds -j | head   # inspect binds
# AGS (no built-in reload):
ags quit
env PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin GSK_RENDERER=gl \
  /usr/local/bin/ags run /home/kodex/.config/ags
ags request bar-cycle
ags request bar-peek
ags request bar-mode
ags request bar-set always|temp|hidden
ags request caffeine        # toggle idle/sleep inhibit (FSM snapshot)
ags request caffeine-status # phase + pids (no flip)
ags request caffeine-on|off # force arm/disarm
ags request capture-toggle  # capture panel (currently commented out in Bar.tsx)
ags request ram-status      # RAM track FSM snapshot (used/avail/phase/pips)
ags request ram             # alias

# Portrait zoom (scale 1.5 ↔ 1.0) + layer resync
/bin/bash $HOME/.local/bin/hypr-zoom-toggle
hyprctl layers | awk '/hyprpaper|ags-bar/'

# After blank/sleep: dual-GPU heal (landscape wake + portrait CRTC + AGS)
/bin/bash $HOME/.local/bin/hypr-monitor-heal manual   # also Super+Shift+O
systemctl --user status ags-hyprland.service hypridle.service
for c in /sys/class/drm/card*-HDMI*; do echo "$(basename $c) $(cat $c/enabled) $(cat $c/dpms)"; done

# Local LLM selector plumbing
systemctl --user status local-llm.service
curl -sf --max-time 1 http://127.0.0.1:28000/v1/models   # ready check the bar uses
cat ~/.config/local-llm/selected-model
ls ~/Services/local-llm/models/gguf                       # what the menu lists

# Disk record (Super+Shift+R) — mp4, NOT kdx-share
hypr-record status
hypr-record inventory
hypr-record toggle region|window
hypr-record panel asus|aoc|stop
# REC mode WIP (Super+M) — chip only
kdx-rec-mode status

# kdx-share (Super+Ctrl+R) — transmit picker (not disk)
kdx-share inventory
kdx-share status
kdx-share vertical|horizontal|both|stop
```

## Out of scope

- Replacing GNOME, removing GNOME packages, forcing Hypr env into login shell.
- Installing random rices/skills with failed security audits.
- Classic hyprlang configs as the edit target.
