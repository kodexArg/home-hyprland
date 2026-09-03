# This host — two panels

Debian GNU/Linux forky/sid. Dual GPU: NVIDIA primary (`card0`) + AMD Renoir (`card1`).
`AQ_DRM_DEVICES=/dev/dri/card0:/dev/dri/card1`.

Bind monitors by **description**, never by HDMI-A-N (names move after NVIDIA DKMS / kernel 7.1.8). ADR `20260818-hypr-monitors-desc-nvidia-dkms-718`.

| Panel | Physical | `desc:` | Role |
|---|---|---|---|
| ASUS VA27EHF | **left** | `desc:ASUSTek COMPUTER INC VA27EHF` | workspaces 1–3, AGS bar lives here when portrait |
| AOC G2790G4 | **right** | `desc:AOC G2790G4` | workspaces 4–6, hypridle/DPMS only this side |

## Remembered layout: left rotated 90°

This is the layout this skill keeps. Live `hyprland.lua` may currently be both-landscape — that is a temporary mode, not amnesia.

**Portrait-left (remembered):**

```lua
local asus = "desc:ASUSTek COMPUTER INC VA27EHF"
local aoc  = "desc:AOC G2790G4"
-- transform 1 = 90° clockwise. scale 1 roomy default.
hl.monitor({ output = asus, mode = "preferred", position = "-1080x0", scale = 1, transform = 1 })
hl.monitor({ output = aoc,  mode = "preferred", position = "0x420",   scale = 1, transform = 0 })
```

Logical: ASUS **1080×1920** @ `-1080x0` · AOC 1920×1080 @ `0x420`.

Git restore point for mixed portrait/landscape: `1c209aa`.

**Both landscape (what repo lua had on 2026-08-28):** ASUS `-1920x0` transform 0 · AOC `0x0` transform 0. Comment in lua says restore transform 1 / `-1080x0` / `0x420` when going back.

**Dense zoom** (Super+Ctrl+Z): portrait scale 1.5 → 720×1280 @ `-720x0`, AOC `0x100`. Sequential `hl.monitor` — never batch two outputs (DRM race). Then wallpaper both + restart AGS.

## Traps on this hardware

- Automatic DPMS **off**. Never `dpms` the portrait CRTC (kills amdgpu). Super+Shift+O / `hypr-monitor-heal`.
- Connector names move; `desc:` does not.
- Dual-GPU: GNOME is daily driver; Hypr is GDM extra session. Do not force `XDG_CURRENT_DESKTOP` in login shell.
- Audio: HDMI/AOC = headphones; MB jack ALC897 = speakers. ADR `20260724-audio-hdmi-headphones-mb-speakers`.
