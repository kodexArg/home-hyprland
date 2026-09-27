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
2. User part (done 2026-09-27, all symlinks into the repo so `git pull` updates them):
   ```sh
   R=~/home-hyprland; mkdir -p ~/.config/hypr ~/.config/systemd/user ~/.local/bin
   ln -sfn $R/hypr/profiles/zensid.lua          ~/.config/hypr/hyprland.lua
   ln -sfn $R/hypr/profiles/zensid.hypridle.conf ~/.config/hypr/hypridle.conf
   ln -sfn $R/hypr/hyprpaper.conf                ~/.config/hypr/hyprpaper.conf
   ln -sfn $R/ags ~/.config/ags
   for f in $R/bin/*; do ln -sfn "$f" ~/.local/bin/; done
   cp $R/systemd/user/ags-hyprland.service ~/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user enable ags-hyprland.service
   # ags needs dart-sass for style.scss (same as Sid):
   PATH=~/.local/node/bin:$PATH npm install -g --prefix ~/.local sass@1.101.0
   Hyprland --verify-config -c ~/.config/hypr/hyprland.lua   # -> config ok
   ```
3. First Hyprland login: `hyprctl monitors` → replace `tv = "HDMI-A-1"` with `desc:<exact description>`.

## Optional (user-level, not installed)
- anyrun / lan-mouse: need cargo — no rustup/cargo on zensid (2026-09-27). Super+Space falls back to fuzzel/wofi.
- ydotool: package installed by bootstrap; ydotoold needs `/dev/uinput` access (group/udev) — decide later.

## API check
`Hyprland --verify-config` exists in 0.55.2 and reports `config ok` for this profile. Also validated offline against Hyprland v0.55.2 sources (hl.* names + `hl.config` keys from
`src/config/lua/bindings/*` and `src/config/values/ConfigValues.cpp`).

## Stremio options checked (2026-09-27)
- Official `Stremio/stremio-linux-shell` v1.2.0: flatpak bundle only (`com.stremio.Stremio.Devel.flatpak`); flatpak not installed on zensid.
- stremio.com 4.4 .deb: Ubuntu build (legacy deps).
- **Chosen**: vejeta/stremio-debian `stremio-qt6` + `stremio-server` built for trixie; `apt-get install --simulate` = 82 new pkgs, all from trixie.

## Media box: Stremio, Deluge, audio, firewall (2026-09-27, verified on zensid)
- **Stremio**: `stremio-qt6` 4.4.183 runs native Wayland (class `com.stremio.stremio`) — needed
  `qml6-module-qtcore` (missing from the .deb Depends; now in the bootstrap apt list). The shell
  spawns `/usr/bin/node /usr/share/stremio/server.js` (streaming server 4.20.16) itself: no
  autostart unit. Super+Z / menu launch with `CASTING_DISABLED=1`. Cache: `~/.stremio-server`,
  `cacheSize` 10 GiB (`kdx-media-harden`). Only default/official addons; no source addons.
- **Firewall** (`system/zensid/nftables.conf`, bootstrap step `firewall`): server.js hard-codes
  `listen(11470)` / `listen(12470)` on all addresses (no host option) and zensid has a global
  IPv6, so inbound is default-drop (allowed: lo, established, ICMP, DHCP, mDNS, ssh 22).
  Probed from Sid over LAN: 11470/12470 (v4 + v6) time out, loopback answers 200.
- **Deluge** (bootstrap step `torrent`, then `kdx-media-harden`): GTK classic mode (no daemon
  RPC port); Debian's system `deluged.service` disabled. ~/Videos for downloads + completed,
  fixed port 55881 (inbound dropped by nftables: outbound-only peers, fine for a leecher box),
  UPnP / NAT-PMP / LSD off (nothing asks the router to open ports), DHT + PEX on, encryption
  enabled (prefer encrypted), pause at ratio 1.0. No search/indexer plugins.
- **xdg-mime**: `magnet:` + `.torrent` → `deluge.desktop`; `video/*` → `vlc.desktop` (VLC goes
  to the TV via `media-on-tv`).
- **Audio** (`wireplumber/zensid/`, symlinked into `~/.config/wireplumber/wireplumber.conf.d/`):
  PCH card uses `pch-headphones-only.profile-set.conf` (only `analog-output-headphones`, which
  forces ALSA `Speaker` off) → the internal speaker port does not exist. HDMI sinks priority
  2000, headphones 500. Nothing plugged → only "Dummy Output" (silence).
- **TV unplugged**: ws 4 is created on eDP-1 and the media window opens there fullscreen.

