# home-hyprland

Private Hyprland desktop bundle for **debian-sid** (kodexArg).

GNOME remains the daily driver; this is the dual-session experiment
(GDM → Hyprland). Machine skill for agents: `skill/kdx-hyperland/`
(live SSOT on host: `~/Skills/kdx-hyperland` → agent skill links).

## Layout

| Path | Role | Live path on host |
|------|------|-------------------|
| `hypr/` | Hyprland 0.55 Lua + hyprpaper | `~/.config/hypr/` |
| `ags/` | AGS v3 bar (Astal GTK4) | `~/.config/ags/` |
| `kitty/` | Kitty terminal (+ Grok class) | `~/.config/kitty/` |
| `wallpapers/` | Wallpaper media | referenced by hyprpaper |
| `skill/kdx-hyperland/` | Agent skill snapshot | `~/Skills/kdx-hyperland/` |

## Highlights

- Dual monitors: AOC landscape left + ASUS portrait right (`transform 3`) → `--|`
- NVIDIA primary: `AQ_DRM_DEVICES=/dev/dri/card0:/dev/dri/card1`
- Terminal: Kitty · browser Super+X: Brave · Super+G: Grok CLI
- AGS bar on HDMI-A-2 only · Super+B mode cycle · volume icon cycle: **speakers → mute → headphones → speakers**
- Wallpaper: Disco Elysium thought cabinet (AVIF via hyprpaper, `cover`)
- gaps_in / gaps_out = 5 · kdx orange borders

## Install / sync on this host

```bash
# Hypr
cp -a hypr/* ~/.config/hypr/
hyprctl reload   # if already in a Hyprland session

# AGS (no node_modules / @girs in git — ags generates types)
mkdir -p ~/.config/ags
rsync -a --exclude node_modules --exclude @girs ags/ ~/.config/ags/
# first time: cd ~/.config/ags && npm i   # if package deps needed
ags quit
env PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin GSK_RENDERER=gl \
  /usr/local/bin/ags run ~/.config/ags

# Kitty
cp -a kitty/* ~/.config/kitty/

# Skill (optional — machine SSOT is usually ~/Skills/)
# rsync -a skill/kdx-hyperland/ ~/Skills/kdx-hyperland/
```

Or symlink hypr (edits go straight into the repo):

```bash
mkdir -p ~/.config
ln -sfn ~/home-hyprland/hypr ~/.config/hypr
```

## Wallpaper

`hypr/hyprpaper.conf` points at:

```text
/home/kodex/home-hyprland/wallpapers/disco-elysium-thought-cabinet-art-cropped.avif
```

Also in tree: `wallpapers/Makima-dark.png` (spare).

## AGS notes

- Binary: `/usr/local/bin/ags` 3.1.0 · `GSK_RENDERER=gl` on NVIDIA
- Do **not** commit `node_modules/` or `@girs/` (regenerated)
- Volume click cycle: parlante → mute → auris → parlante (see `ags/widget/Bar.tsx`)

## Related (machine vault, not in this repo)

- `~/Documents/System/Desktop.md`
- ADRs: `20260715-hyprland-*`, `20260715-ags-*`
