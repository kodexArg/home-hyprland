# zensid (Asus Zenbook i5-5200U) Hyprland profile

Same idea as Sid/TUF (AGS bar, Super chords, hypr-* helpers, kdx-hypr-control +
HyprControl skills), **own system**: Debian 13 trixie + trixie-backports only.

| Item | Value |
|---|---|
| OS | Debian 13 trixie (stays trixie; no sid/testing pinning) |
| Hyprland | trixie-backports (0.55.2 at 2026-09-27) — profile uses **only 0.55 `hl.*` API** |
| GPU | Intel HD Graphics 5500 (i915, Mesa 25.0) — no NVIDIA, no `AQ_DRM_DEVICES` |
| eDP-1 | 13" 3200x1800 (not 4K) @60 · **scale 2.5 → 1280x720** · `0x0` · ws 1–3 |
| TV | Samsung 54" on `HDMI-A-1` · **1920x1080@60 max** (HDMI 1.4: 4K only @30) · `1280x0` · ws 4–6 |
| AGS | built from source (latest stable tag) under `/usr/local`; env `KDX_BAR_MODEL=EDP`, `KDX_NO_NVIDIA=1`, `GSK_RENDERER=gl` |
| Look | no blur, no shadows, rounding 6, 4 short bezier animations |
| DM | GDM 48 — default session for kodex = Hyprland (uwsm) via AccountsService; GNOME stays as fallback |
| Autostart | Grok Bot (`/usr/bin/grok-bot`, deb) at `hyprland.start`, single instance, lands on ws 1 silent; Super+G focus/open |
| Media | Stremio (`stremio-qt6` 4.4.183 trixie .deb from vejeta/stremio-debian, pinned + sha256) · VLC · mpv → TV ws 4 fullscreen, idle_inhibit; Super+Z = Stremio |
| Power | never suspends: sleep targets masked, logind lid/keys ignore (`nosleep` step), `zensid.hypridle.conf` without listeners |

## Install
1. Root part (Gabriel, once sudo exists): `sudo ~/home-hyprland/bin/kdx-bootstrap-zensid`
   (steps: `apt` → trixie-backports Hyprland stack + trixie deps; `build` → astal io/gtk3/gtk4/wireplumber + ags;
   `dropins` → `/etc/systemd/user/*/hyprland-only.conf`; `stremio`; `nosleep`; `session`). Idempotent.
2. User part (printed at the end of the script): link `profiles/zensid.lua` to `~/.config/hypr/hyprland.lua`,
   copy hypridle/hyprpaper, rsync `ags/`, install `bin/*`, enable `ags-hyprland.service`.
3. First Hyprland login: `hyprctl monitors` → replace `tv = "HDMI-A-1"` with `desc:<exact description>`.

## Optional (user-level, not installed)
- anyrun / lan-mouse: need cargo — no rustup/cargo on zensid (2026-09-27). Super+Space falls back to fuzzel/wofi.
- ydotool: package installed by bootstrap; ydotoold needs `/dev/uinput` access (group/udev) — decide later.

## API check
Profile validated offline against Hyprland v0.55.2 sources (hl.* names + `hl.config` keys from
`src/config/lua/bindings/*` and `src/config/values/ConfigValues.cpp`).

## Stremio options checked (2026-09-27)
- Official `Stremio/stremio-linux-shell` v1.2.0: flatpak bundle only (`com.stremio.Stremio.Devel.flatpak`); flatpak not installed on zensid.
- stremio.com 4.4 .deb: Ubuntu build (legacy deps).
- **Chosen**: vejeta/stremio-debian `stremio-qt6` + `stremio-server` built for trixie; `apt-get install --simulate` = 82 new pkgs, all from trixie.
