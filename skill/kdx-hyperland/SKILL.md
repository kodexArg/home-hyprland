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
| AGS bar (live) | `~/.config/ags/` (`app.ts`, `widget/`, `style.scss`) |
| Git SSOT (private) | `~/home-hyprland/` — `hypr/`, `ags/`, `kitty/`, `wallpapers/`, `skill/kdx-hyperland/` |
| Host helpers | `~/.local/bin/hypr-*` (e.g. `hypr-screenshot`) — **no** `~/Scripts/…/Hyperland/` |
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

- **Monitors:** HDMI-A-1 AOC landscape left · HDMI-A-2 ASUS portrait (`transform 3`) right — layout `--|`
- **Layout:** dwindle · **mod:** SUPER · **terminal:** kitty · **browser Super+X:** brave-browser
- **AGS:** bar **only on HDMI-A-2** · Super+B cycles always→temp→hidden · Super_L/R peek (non_consuming)
- **Volume icon (triple):** speakers · muted (speaker-slash) · headphones — no headphones-mute. Logic in `widget/Bar.tsx` via AstalWp `defaultSpeaker.route` (not shell scripts).
- **Audio on this host:** default sink HDMI (`TU106` / AOC) = speakers · Ryzen analog `analog-output-headphones` = headphones
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
```

## Out of scope

- Replacing GNOME, removing GNOME packages, forcing Hypr env into login shell.
- Installing random rices/skills with failed security audits.
- Classic hyprlang configs as the edit target.
