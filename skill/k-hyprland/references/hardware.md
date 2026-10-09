# This host — two panels

Debian GNU/Linux forky/sid. Dual GPU: NVIDIA primary (`card0`) + AMD Renoir (`card1`).
`AQ_DRM_DEVICES=/dev/dri/card0:/dev/dri/card1`.

Bind monitors by **description**, never by HDMI-A-N (names move after NVIDIA DKMS / kernel 7.1.8). ADR `20260818-hypr-monitors-desc-nvidia-dkms-718`.

| Monitor | Physical | `desc:` | Live (2026-10-09) | Role |
|---|---|---|---|---|
| ASUS VA27EHF | **left** | `desc:ASUSTek COMPUTER INC VA27EHF` | 1920×1080@100 at `-1920,0`, transform 0 | panels 1–3, AGS bar lives here |
| AOC G2790G4 | **right** | `desc:AOC G2790G4` | 1920×1080@100 at `0,0`, transform 0 | panels 4–6, hypridle/DPMS only this side |

## Current layout: both landscape

Source of truth is `hyprctl monitors -j` (or hyprmcp `list_monitors`). On 2026-10-09 both monitors are 1080p landscape, scale 1, side by side:

```lua
local asus = "desc:ASUSTek COMPUTER INC VA27EHF"
local aoc  = "desc:AOC G2790G4"
hl.monitor({ output = asus, mode = "1920x1080@100.05", position = "-1920x0", scale = 1, transform = 0 })
hl.monitor({ output = aoc,  mode = "1920x1080@99.93",  position = "0x0",     scale = 1, transform = 0 })
```

**Stale config warning:** `~/.config/hypr/hyprland.lua` and repo `hypr/profiles/debian-sid.lua` still declare the old portrait-left line (ASUS `transform 1`, `-720x0`, scale 1.5; AOC `0x100`). The live state was set at runtime. A `hyprctl reload` or session restart may rotate the ASUS again — verify with `hyprctl monitors -j` and, if it should stick, update the lua (with kodex's OK).

**History (not current):** portrait-left was ASUS `transform 1` 1080×1920 @ `-1080x0`, AOC `0x420`; restore point git `1c209aa`. Dense zoom (Super+Ctrl+Z, `hypr-zoom-toggle`) was written for that portrait ASUS (scale 1.5 → 720×1280 @ `-720x0`). Sequential `hl.monitor` — never batch two outputs (DRM race). Then wallpaper both + restart AGS.

## Traps on this hardware

- Automatic DPMS **off**. Never `dpms` the ASUS CRTC (killed amdgpu when it was portrait). Super+Shift+O / `hypr-monitor-heal`.
- Connector names move; `desc:` does not.
- Dual-GPU: GNOME is daily driver; Hypr is GDM extra session. Do not force `XDG_CURRENT_DESKTOP` in login shell.
- Audio: HDMI/AOC = headphones; MB jack ALC897 = speakers. ADR `20260724-audio-hdmi-headphones-mb-speakers`.
