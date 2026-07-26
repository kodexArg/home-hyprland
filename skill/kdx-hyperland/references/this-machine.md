# This machine — Hyprland live config

Re-read files before editing. Snapshot **2026-07-25**; **live always wins** (`hyprctl monitors`).

## Stance

- **GNOME + Wayland** = daily driver. **Hyprland** = GDM experiment session.
- ADRs: `20260715-hyprland-gdm-dual-session`, `20260715-hyprland-single-pointer`, AGS ADRs, zoom + caffeine (below).
- Narrative: `~/Documents/System/Desktop.md`.

## Versions / packages

| Item | Value |
|---|---|
| Hyprland | **0.55.4** (Debian `hyprland 0.55.4+ds-2`) |
| Config language | **Lua only** (`hyprland.lua`) — no legacy `keyword monitor` for runtime |
| Satellite pkgs | hyprpaper, hypridle, hyprlock, hyprlauncher, hyprpolkitagent, xdg-desktop-portal-hyprland, hyprland-guiutils |
| AGS | **3.1.0** @ `/usr/local/bin/ags` (built to `/usr` libs; see `references/ags.md`) |

## Paths

| Role | Path |
|---|---|
| Live Hypr | `~/.config/hypr/hyprland.lua`, `hyprpaper.conf` |
| Git SSOT | `~/home-hyprland/` (`hypr/`, `ags/`, `bin/`, `kitty/`, `wallpapers/`, `skill/`) |
| AGS | `~/.config/ags/` |
| Zoom helper | `~/.local/bin/hypr-zoom-toggle` |
| Wallpaper media | `~/home-hyprland/wallpapers/disco-elysium-thought-cabinet-art-cropped.avif` |

Sync pattern: live edits → re-sync `~/home-hyprland` → commit. Last related commit: `8b1cac3` (caffeine FSM + zoom).

## Monitors (portrait LEFT, landscape RIGHT)

| Output | Role | transform | scale (dense) | position (dense) | logical (dense) |
|---|---|---|---|---|---|
| HDMI-A-2 | ASUS VA27EHF **left**, portrait | **1** (90°) | **1.5** | `-720x0` | **720×1280** |
| HDMI-A-1 | AOC G2790G4 right, landscape | 0 | 1 | `0x100` | 1920×1080 |

Mode: `preferred` / explicit `1920x1080@60` in zoom script.

**Super+Ctrl+Z** toggles dense (1.5) ↔ roomy (1.0). Roomy: portrait `-1080x0` scale 1 · AOC `0x420`.  
ADR: `20260725-hyprland-super-ctrl-z-zoom-toggle` · default dense: `20260721-hyprland-portrait-scale-1.5`.

### Zoom FSM + layer resync (do not skip)

```
dense ──Super+Ctrl+Z──► arming ──modesets sequential──► roomy
  ▲                                                      │
  └──────────────── Super+Ctrl+Z ────────────────────────┘
```

1. Sequential `hyprctl eval hl.monitor(…)` — **never batch** two monitors (DRM page-flip race).
2. After apply: re-wallpaper **both** outputs + **restart AGS**.
3. Verify: `hyprctl layers` xywh must match monitor layout (hyprpaper + ags-bar).

## Autostart (`hl.on("hyprland.start")`)

1. `hyprpaper`
2. Kitty terminal
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
- Hardware cursors: `cursor.no_hardware_cursors = false`
- Device disabled: `ducky-ducky-one2-sf-rgb-1`
- Real pointer: Logitech G300s — `accel_profile = flat`, `sensitivity = -0.2`

## AGS bar (pattern for new widgets)

**Template:** `widget/caffeine.ts` FSM — SSOT outside AGS memory, UI derived, tick reconcile, module boundary. ADR `20260720-ags-caffeine-toggle`.

| Piece | Notes |
|---|---|
| Bar only HDMI-A-2 | `app.ts` + `bar-mode.ts` `BAR_MONITOR` |
| Edge poll | use **phys/scale** then transform swap (`bar-mode.ts`) |
| Caffeine | `ags request caffeine` / `caffeine-status` |
| Local LLM | `LocalLlm.tsx` FSM; ready = HTTP `/v1/models` not unit active |
| **Chat UI (next)** | treat as bar/shell surface; same FSM contract; no bool-only state |

## Related ADRs (in force)

| ADR | Decision |
|---|---|
| `20260715-hyprland-gdm-dual-session` | GNOME daily; Hypr via GDM |
| `20260715-hyprland-single-pointer` | Ducky disabled; HW cursors |
| `20260715-ags-hyprland-volume-bar` | AGS v3; WirePlumber volume |
| `20260715-ags-bar-super-b-three-mode` | Super+B + peek + edge |
| `20260720-ags-caffeine-toggle` | Caffeine FSM template |
| `20260721-hyprland-portrait-scale-1.5` | Default dense scale 1.5 |
| `20260724-audio-hdmi-headphones-mb-speakers` | HDMI=auris, MB=parlantes |
| `20260725-hyprland-super-ctrl-z-zoom-toggle` | Super+Ctrl+Z zoom + layer resync |

## Edit checklist

1. Read live `hyprland.lua` / AGS files.
2. Minimal change; keep emergency binds.
3. `hyprctl reload` (or full restart for devices/permissions).
4. Scale/position change → wallpaper reapply + AGS restart.
5. Standing decision → ADR under `~/Documents/System/ADRs/`.
6. Sync + commit `~/home-hyprland` when durable.
