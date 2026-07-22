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
| Host helpers | `~/.local/bin/hypr-*` (`hypr-screenshot`, `hypr-record`, `hypr-reveal-all`) — **no** `~/Scripts/…/Hyperland/`; mirrored in repo `bin/` |
| Narrative | `~/Documents/System/Desktop.md` |
| ADRs | `~/Documents/System/ADRs/20260715-hyprland-*`, `20260715-ags-*` |
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

- **Monitors:** HDMI-A-1 AOC landscape left (`scale 1`, `0x100`) · HDMI-A-2 ASUS portrait (`transform 3`, **`scale 1.5`** → logical 720×1280) right — layout `--|`
- **Layout:** dwindle · **mod:** SUPER · **terminal:** kitty · **browser Super+X:** brave-browser
- **AGS:** bar **only on HDMI-A-2** · Super+B cycles always→temp→hidden · Super_L/R peek (non_consuming) · **first paint = `always`** (edge poll only starts once you cycle into `temp`)
- **Bar contents:** start = Volume · end = **LocalLlm brain** + **Clock/Caffeine** cluster. Capture caret is commented out since 2026-07-17 (buttons were mocks).
- **Volume icon (triple):** speakers · muted (speaker-slash) · headphones — no headphones-mute. Logic in `widget/Bar.tsx` via AstalWp `defaultSpeaker.route` (not shell scripts).
- **Audio on this host:** default sink HDMI (`TU106` / AOC) = speakers · Ryzen analog `analog-output-headphones` = headphones
- **Caffeine:** cup next to clock; holds a `systemd-inhibit --what=idle:sleep --mode=block` child process (`Gtk.Application.inhibit` is a no-op here — no gnome-session). `ags request caffeine`.
- **Local LLM selector:** brain icon → GGUF model list + OFF (`widget/LocalLlm.tsx`). Drives `local-llm.service` (systemd --user); **ready = `127.0.0.1:28000/v1/models` answers**, not unit `active`. One model at a time on 8 GB; load timeout 90 s → SIGKILL. VRAM header from `nvidia-smi`.
- **Screenshots / recording:** `hypr-screenshot` (Print / Ctrl+Print / Alt+Print) · `hypr-record` (Super+Shift+R region, +Alt window) · `hypr-reveal-all` (Super+A)
- **NVIDIA:** `AQ_DRM_DEVICES=/dev/dri/card0:/dev/dri/card1` · GSK for AGS/anyrun: `GSK_RENDERER=gl`
- **Pointer:** Ducky HID mouse disabled; hardware cursors forced

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
ags request caffeine        # toggle idle/sleep inhibit
ags request capture-toggle  # capture panel (currently commented out in Bar.tsx)

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
