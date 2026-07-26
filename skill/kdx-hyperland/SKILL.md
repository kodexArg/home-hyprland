---
name: kdx-hyperland
description: >
  Configure Hyprland + AGS (Aylur's GTK Shell bar) on kodex's debian-sid machine.
  Use when the user invokes /kdx-hyperland, says hyperland/hyprland/ags bar, edits
  hyprland.lua, keybinds, monitors, NVIDIA env, or the status bar. Always re-read
  live config and ADRs before changing; GNOME stays the daily driver.
---

# kdx-hyperland — Hyprland + AGS on this host

**Spelling:** skill is `/kdx-hyperland`; compositor is **Hyprland**. **AGS** = Aylur's GTK Shell (bar). GNOME remains daily driver; Hyprland is GDM dual-session experiment.

## Stance (do not violate)

1. **Never force** `XDG_CURRENT_DESKTOP` globally — session/GDM only.
2. **Edit live files**, then keep `~/home-hyprland` in mind if syncing (repo can lag).
3. Prefer **Lua** (`hyprland.lua`). Hyprlang `.conf` is deprecated since 0.55.
4. After Hypr edits: `hyprctl reload` if session is Hyprland. After AGS edits: `ags quit &&` re-run (or restart session). **Permissions** need full Hypr restart.
5. Register standing host decisions with `kdx-register-this-configuration` → `~/Documents/System/ADRs/`.

## Paths (this machine)

| Role | Path |
|---|---|
| Hypr config (live) | `~/.config/hypr/hyprland.lua` |
| Wallpaper | `~/.config/hypr/hyprpaper.conf` |
| AGS bar (live) | `~/.config/ags/` (`app.ts`, `widget/`, `icons/`, `style.scss`) |
| Skill (live) | `~/.claude/skills/kdx-hyperland/` — **not** `~/Skills/` (does not exist) |
| Git SSOT (private) | `~/home-hyprland/` — `hypr/`, `ags/`, `bin/`, `kitty/`, `wallpapers/`, `skill/kdx-hyperland/` |
| Host helpers | `~/.local/bin/hypr-*` (`hypr-screenshot`, `hypr-record`, `hypr-reveal-all`, `hypr-zoom-toggle`) — **no** `~/Scripts/…/Hyperland/`; mirrored in repo `bin/` |
| Narrative | `~/Documents/System/Desktop.md` |
| ADRs | `~/Documents/System/ADRs/` — hypr/ags incl. `20260720-ags-caffeine-toggle`, `20260721-hyprland-portrait-scale-1.5`, `20260725-hyprland-super-ctrl-z-zoom-toggle` |
| Binaries | `hyprland` 0.55.4 · `ags` 3.1.0 @ `/usr/local/bin/ags` |

## Workflow (every invocation)

```
1. Confirm session: echo $XDG_CURRENT_DESKTOP  (expect Hyprland only when testing)
2. READ live hyprland.lua + relevant AGS files BEFORE editing
3. Load references/ as needed (below)
4. Apply minimal change; reload
5. If decision is standing → ADR via kdx-register-this-configuration
```

### Reference routing

| Task | Load |
|---|---|
| Keybinds / Super+* map | `references/keybinds.md` |
| Monitors, env, NVIDIA, devices, autostart, look | `references/this-machine.md` |
| Upstream Hyprland 0.55 Lua API / wiki | `references/hyprland-docs.md` |
| **AGS bar (docs + our bar)** | `references/ags.md` ← special section |

Do **not** paste hyprlang from old blogs. Translate to `hl.*` using `references/hyprland-docs.md`.

## Quick facts (live, re-verify on edit)

- **Monitors (live):** HDMI-A-2 ASUS portrait **left** (`transform 1`, scale **1.5** dense → 720×1280 @ `-720x0`) · HDMI-A-1 AOC landscape right (`scale 1`, `0x100`). **Super+Ctrl+Z** toggles dense↔roomy (+ wallpaper/AGS resync). ADR `20260725-hyprland-super-ctrl-z-zoom-toggle`
- **Layout:** dwindle · **mod:** SUPER · **terminal:** kitty · **browser Super+X:** brave-browser
- **AGS:** bar **only on HDMI-A-2** · Super+B always→temp→hidden · Super_L/R peek · first paint `always`
- **Bar contents:** start = Volume · end = DictationIndicator + LocalLlm brain + Clock/Caffeine. Capture caret commented out since 2026-07-17
- **Bar widget pattern:** FSM + external SSOT + derived UI — template `widget/caffeine.ts` (not bare bools). Next: **chat UI** follows same contract
- **Volume:** speakers / muted / headphones via live `defaultSpeaker`. Audio topology ADR `20260724-audio-hdmi-headphones-mb-speakers` (HDMI=auris, MB jack=parlantes)
- **Caffeine:** `widget/caffeine.ts` · `ags request caffeine` / `caffeine-status` · ADR `20260720-ags-caffeine-toggle`
- **Local LLM:** `LocalLlm.tsx` · ready = `127.0.0.1:28000/v1/models` · 8 GB one model · 90 s load kill
- **Screenshots / recording:** `hypr-screenshot` · `hypr-record` · `hypr-reveal-all` (Super+A) · **zoom:** `hypr-zoom-toggle`
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

# Portrait zoom (scale 1.5 ↔ 1.0) + layer resync
/bin/bash $HOME/.local/bin/hypr-zoom-toggle
hyprctl layers | awk '/hyprpaper|ags-bar/'

# Local LLM selector plumbing
systemctl --user status local-llm.service
curl -sf --max-time 1 http://127.0.0.1:28000/v1/models   # ready check the bar uses
cat ~/.config/local-llm/selected-model
ls ~/Services/local-llm/models/gguf                       # what the menu lists
```

## Out of scope

- Replacing GNOME, removing GNOME packages, forcing Hypr env into login shell.
- Installing random rices/skills with failed security audits.
- Classic hyprlang configs as the edit target.
