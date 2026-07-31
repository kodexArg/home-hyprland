---
name: kdx-hypr-control
description: >
  Configure Hyprland + AGS (Aylur's GTK Shell bar) on kodex's debian-sid machine.
  Use when the user invokes /kdx-hypr-control or kdx-hypr-control, says hyperland/
  hyprland/ags bar, edits hyprland.lua, keybinds, monitors, NVIDIA env, or the
  status bar (formerly kdx-hyperland). Always re-read live config and ADRs before
  changing; GNOME stays the daily driver.
---

# kdx-hypr-control — Hyprland + AGS on this host

**Spelling:** skill is `/kdx-hypr-control` (formerly `/kdx-hyperland`); compositor is **Hyprland**. **AGS** = Aylur's GTK Shell (bar). GNOME remains daily driver; Hyprland is GDM dual-session experiment.

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
| Skill (live) | `~/.claude/skills/kdx-hypr-control/` (also `.grok` / gemini) — **not** `~/Skills/` |
| Git SSOT (private) | `~/home-hyprland/` — `hypr/`, `ags/`, `bin/`, `kitty/`, `wallpapers/`, `skill/kdx-hypr-control/` |
| Host helpers | `~/.local/bin/hypr-*` + **`kdx-share`** (`hypr-screenshot`, `hypr-record`, `hypr-reveal-all`, `hypr-zoom-toggle`, `kdx-share`) — **no** `~/Scripts/…/Hyperland/`; mirrored in repo `bin/` |
| Command map | `references/host-commands.md` — caffeine · LLM · k · share · R-key family |
| Narrative | `~/Documents/System/Desktop.md` |
| ADRs | `~/Documents/System/ADRs/` — hypr/ags incl. `20260720-ags-caffeine-toggle`, `20260725-hyprland-super-ctrl-z-zoom-toggle`, `20260726-hyprland-portrait-default-scale-1` (supersede `20260721-…scale-1.5`), `20260726-ags-surfaces-inventory-capture-parked` |
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
| Custom commands inventory (caffeine/LLM/k/share) | `references/host-commands.md` |
| Monitors, env, NVIDIA, devices, autostart, look | `references/this-machine.md` |
| Upstream Hyprland 0.55 Lua API / wiki | `references/hyprland-docs.md` |
| **AGS bar (docs + our bar)** | `references/ags.md` ← special section |

Do **not** paste hyprlang from old blogs. Translate to `hl.*` using `references/hyprland-docs.md`.

## Quick facts (live, re-verify on edit)

- **Monitors (live):** HDMI-A-2 ASUS portrait **left** (`transform 1`, **default scale 1 roomy** → 1080×1920 @ `-1080x0`) · HDMI-A-1 AOC landscape right (`scale 1`, `0x420`). **Super+Ctrl+Z** toggles roomy↔dense 1.5 (720×1280 @ `-720x0`, AOC `0x100`) + wallpaper/AGS resync. ADRs `20260726-hyprland-portrait-default-scale-1` · `20260725-hyprland-super-ctrl-z-zoom-toggle`
- **Layout:** dwindle · **mod:** SUPER · **terminal:** kitty · **browser Super+X:** brave-browser
- **AGS:** bar **only on HDMI-A-2** · Super+B always→temp→hidden · Super_L/R peek · first paint `always`
- **Bar contents:** start = Volume · end = LiveIndicator + DictationIndicator + LocalLlm brain + Clock/Caffeine. Capture caret commented out since 2026-07-17
- **Surfaces:** live = `ags-bar` only · on-demand = `ags-local-llm` (+clickaway), Live/Dictation inline (state file ausente = apagado, **no** roto) · **parked** = `ags-capture` (nunca monta; `ags request capture-toggle` es no-op que igual responde éxito). ADR `20260726-ags-surfaces-inventory-capture-parked`
- **Bar widget pattern:** FSM + external SSOT + derived UI — template `widget/caffeine.ts` (not bare bools). Next: **chat UI** follows same contract
- **Volume:** speakers / muted / headphones via live `defaultSpeaker`. Audio topology ADR `20260724-audio-hdmi-headphones-mb-speakers` (HDMI=auris, MB jack=parlantes)
- **Caffeine:** `widget/caffeine.ts` · `ags request caffeine` / `caffeine-status` · three states: sin borde = nadie retiene idle · **borde tenue** = lo retiene otro (`foreign=idle`, no la taza) · humo + borde vivo = lo retiene la taza. Receptor = hypridle, **solo HDMI-A-1**; la máquina no suspende. ADRs `20260720-ags-caffeine-toggle` · `20260726-hypridle-dpms-caffeine`
- **Display power:** automatic DPMS **OFF** (dual-GPU). Never DPMS A-2. **Super+Shift+O** / TTY `hypr-monitor-heal`. AGS unit `ags-hyprland.service` Restart=always. ADR `20260727-hypr-monitor-heal-portrait-crtc`
- **Local LLM:** `LocalLlm.tsx` · ready = `127.0.0.1:28000/v1/models` · 8 GB one model · 90 s load kill
- **Screenshots / recording:** `hypr-screenshot` · `hypr-record` · `hypr-reveal-all` (Super+A) · **zoom:** `hypr-zoom-toggle`
- **Share / transmit:** **Super+Ctrl+R** → `kdx-share` (vertical left · horizontal right · both stack on headless). Super+R stays hyprlauncher.
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

# After blank/sleep: dual-GPU heal (landscape wake + portrait CRTC + AGS)
/bin/bash $HOME/.local/bin/hypr-monitor-heal manual   # also Super+Shift+O
systemctl --user status ags-hyprland.service hypridle.service
for c in /sys/class/drm/card*-HDMI*; do echo "$(basename $c) $(cat $c/enabled) $(cat $c/dpms)"; done

# Local LLM selector plumbing
systemctl --user status local-llm.service
curl -sf --max-time 1 http://127.0.0.1:28000/v1/models   # ready check the bar uses
cat ~/.config/local-llm/selected-model
ls ~/Services/local-llm/models/gguf                       # what the menu lists

# kdx-share (Super+Ctrl+R) — transmit picker
kdx-share inventory
kdx-share status
kdx-share vertical|horizontal|both|stop
```

## Out of scope

- Replacing GNOME, removing GNOME packages, forcing Hypr env into login shell.
- Installing random rices/skills with failed security audits.
- Classic hyprlang configs as the edit target.
