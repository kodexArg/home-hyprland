# This machine — Hyprland live config

Re-read files before editing. Snapshot below captured for skill authoring (2026-07-16); **live always wins**.

## Stance

- **GNOME + Wayland** = daily driver. **Hyprland** = GDM experiment session.
- ADRs: `20260715-hyprland-gdm-dual-session`, `20260715-hyprland-single-pointer`, AGS ADRs.
- Narrative: `~/Documents/System/Desktop.md`.

## Versions / packages

| Item | Value |
|---|---|
| Hyprland | **0.55.4** (Debian `hyprland 0.55.4+ds-2`) |
| Config language | **Lua only** (`hyprland.lua`) |
| Satellite pkgs | hyprpaper, hypridle, hyprlock, hyprlauncher, hyprpolkitagent, xdg-desktop-portal-hyprland, hyprland-guiutils |
| AGS | **3.1.0** @ `/usr/local/bin/ags` (built to `/usr` libs; see `references/ags.md`) |

## Paths

| Role | Path |
|---|---|
| Live Hypr | `~/.config/hypr/hyprland.lua`, `hyprpaper.conf` |
| Git SSOT | `~/home-hyprland/` (`hypr/`, `ags/`, `kitty/`, `wallpapers/`, `skill/`) |
| AGS | `~/.config/ags/` |
| Wallpaper media | `~/home-hyprland/wallpapers/disco-elysium-thought-cabinet-art-cropped.avif` |

Sync pattern: copy or symlink from `~/home-hyprland` into `~/.config/{hypr,ags,kitty}` — see repo README. After live edits, re-sync into the repo before commit.

## Monitors (rotated-T `--|`)

| Output | Role | transform | scale | position | logical |
|---|---|---|---|---|---|
| HDMI-A-1 | AOC left, landscape | 0 | 1 | `0x100` | 1920×1080 |
| HDMI-A-2 | ASUS right, portrait | **3** (270°) | **1.5** | `1920x0` | **720×1280** |

Mode: `preferred`. Portrait UI zoom is permanent compositor scale (not crop).

## Autostart (`hl.on("hyprland.start")`)

1. `hyprpaper`
2. Kitty terminal (so session is not empty black)
3. `anyrun daemon` with `GSK_RENDERER=gl`
4. AGS:  
   `env PATH=…/.local/bin:… GSK_RENDERER=gl /usr/local/bin/ags run ~/.config/ags`

## Environment

```
XCURSOR_SIZE=24
HYPRCURSOR_SIZE=24
LIBVA_DRIVER_NAME=nvidia
__GLX_VENDOR_LIBRARY_NAME=nvidia
NVD_BACKEND=direct
AQ_DRM_DEVICES=/dev/dri/card0:/dev/dri/card1   # NVIDIA primary, Renoir secondary
```

**Do not** set `XDG_CURRENT_DESKTOP=GNOME` here. GDM DesktopNames owns identity.

## Look (kdx design system tones)

| Setting | Value |
|---|---|
| layout | dwindle · `preserve_split = true` |
| gaps_in / gaps_out | 5 / 5 |
| border_size | 2 |
| active_border | `rgba(ff8c4288)` → `rgba(ffaa7077)` angle 45 |
| inactive_border | `rgba(3a352faa)` |
| rounding | 10 · rounding_power 2 |
| shadow | enabled, ink-1000-ish |
| blur | size 3, passes 1 |
| misc | no logo splash, no default wallpaper force |

## Input / devices

- Keyboard: `us` + `altgr-intl`
- `follow_mouse = 1`
- Hardware cursors: `cursor.no_hardware_cursors = false` (AUTO left ghost cursor on NVIDIA dual-GPU)
- Device disabled: `ducky-ducky-one2-sf-rgb-1` (Ducky One2 SF RGB HID mouse interface — second pointer)
- Real pointer: Logitech G300s (`logitech-g300s-optical-gaming-mouse`) — `accel_profile = flat`, `sensitivity = -0.2` (~**0.8×** linear). ratbag/piper already on host (`thundering-gerbil`, active profile @ 1000dpi; no 800dpi step)


## Related ADRs (in force)

| ADR | Decision |
|---|---|
| `20260715-hyprland-gdm-dual-session` | GNOME daily; Hypr via GDM; no global desktop force |
| `20260715-hyprland-single-pointer` | Ducky disabled; hardware cursors |
| `20260715-ags-hyprland-volume-bar` | AGS v3 shell; WirePlumber volume first |
| `20260715-ags-bar-super-b-three-mode` | Super+B cycle + Super peek + edge poll |

## Edit checklist

1. Read `hyprland.lua` (and AGS files if bar).
2. Minimal change; keep Super+Q/R/M emergency binds.
3. `hyprctl reload` (or full restart for permissions/devices that require it).
4. If standing decision → new ADR under `~/Documents/System/ADRs/`.
5. Optionally sync `~/home-hyprland` if that repo is still the backup SSOT.
