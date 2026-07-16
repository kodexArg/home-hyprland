# home-hyprland

Private Hyprland config for **debian-sid** (kodexArg).

GNOME remains the daily driver; this is the dual-session experiment config
(GDM → Hyprland). Live path on the machine:

```text
~/.config/hypr/
```

## Layout

| File | Role |
|------|------|
| `hypr/hyprland.lua` | Monitors, binds, env, autostart (Hyprland 0.55 Lua) |
| `hypr/hyprpaper.conf` | Wallpaper (same image as GNOME) |

## Highlights (as of first snapshot)

- Dual monitors: AOC landscape left + ASUS portrait right (`transform 3`) → `--|`
- NVIDIA primary: `AQ_DRM_DEVICES=/dev/dri/card0:/dev/dri/card1`
- Terminal: Kitty · launcher: hyprlauncher
- Super+arrows focus · Super+Shift+arrows move · Super+Ctrl+arrows resize (±40)
- Wallpaper: Disco Elysium thought cabinet (AVIF via hyprpaper, `cover`)
- gaps_in / gaps_out = 5

## Install / sync on this host

```bash
# copy into place
cp -a hypr/* ~/.config/hypr/
hyprctl reload   # if already in a Hyprland session
```

Or symlink (edits go straight into the repo):

```bash
mkdir -p ~/.config
ln -sfn ~/home-hyprland/hypr ~/.config/hypr
```

## Wallpaper path

`hyprpaper.conf` points at:

`/home/kodex/Pictures/Kdx/disco-elysium-thought-cabinet-art-cropped.avif`

That file is **not** in this repo (personal media).

## Related

- Machine docs: `~/Documents/System/Desktop.md`, `Catalog/Software.md`
- ADR: dual session GNOME + Hyprland via GDM
