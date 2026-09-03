---
name: k-hyprland
description: >
  This-machine Hyprland + AGS operator for kodex debian-sid (not a general
  Hyprland tutorial). Two monitors: left ASUS often rotated 90°, right AOC
  landscape. Catalog of host ADRs, Lua config, and Debian quirks. Use when
  the user runs /k-hyprland, mentions hyprland, hypr, hyprctl, hyprland.lua,
  AGS bar, portrait monitor, hypr-monitor-heal, kdx-share, or this desktop
  session. On every invoke, version-check the skill catalog against
  ~/home-hyprland; if they diverge, refresh from the repo and wiki, then
  still solve the task with whatever knowledge remains if the net fails.
---

# k-hyprland — this computer

Help **this** debian-sid box. GNOME stays the daily driver. Hyprland is the GDM extra session.

The catalog and hardware notes are a floor, not a cage. Invent binds, widgets, layouts, heal tricks — as long as they land on these two panels, this GPU pair, and this Lua file. Do not ship a generic rice for a machine that is not here.

Sibling runbooks (deeper): `~/home-hyprland/skill/kdx-hypr-control/`. Grok-facing catalog is this skill. Do not invent a skill named `kdx-hyprland`.

## Room to play

Facts in `references/` and ADRs are load-bearing (portrait CRTC, `desc:` binds, Lua, GNOME stays). How you get there is open: new AGS chips, zoom variants, workspace theatre, scripts in `~/.local/bin`. Prefer a sharp experiment on this host over a safe no-op. If you break the portrait monitor, heal it (`hypr-monitor-heal`) and write down what you learned.

## Spine (every invoke — then improvise)

```
1. bash <this-skill>/scripts/check_version.sh
2. If exit 2 (mismatch) or hyprctl missing:
     - Re-read ~/home-hyprland/hypr/hyprland.lua and ~/.config/hypr/hyprland.lua (live wins)
     - Fetch wiki.hypr.land if the net works; keep only facts that apply here
     - Update VERSION repo_head / hyprland_tag
     - If fetch or git fails: one line, then continue with references/ + live files
3. Confirm session: $XDG_CURRENT_DESKTOP
4. Inspect with hyprmcp if present, else hyprctl *-j
5. Read references/hardware.md before monitor geometry changes
6. Edit live → reload → verify
7. If the experiment should stick → ADR under ~/Documents/System/ADRs/
```

Skill SSOT: `~/home-hyprland/skill/k-hyprland/`. Grok: `~/.grok/skills/k-hyprland` → that path.

## Stance

1. Never force `XDG_CURRENT_DESKTOP` globally.
2. Lua (`hyprland.lua`). Translate hyprlang examples; do not make `.conf` the edit target.
3. Live `~/.config/hypr` wins; keep `~/home-hyprland` in mind for git.
4. hyprmcp first; `hyprctl` fallback.
5. This GPU pair, these two panels — then be interesting.

## Hardware (load `references/hardware.md`)

Two HDMI panels. **Left ASUS VA27EHF is often rotated 90°** (`transform 1`, logical 1080×1920 at `-1080x0`). Right AOC landscape. That portrait-left layout is **remembered** even when live lua is temporarily both-landscape (`transform 0`, `-1920x0` / `0x0` — see lua comments + git `1c209aa`).

Bind `desc:ASUSTek COMPUTER INC VA27EHF` and `desc:AOC G2790G4`. Connector names move.

## Catalog routing

| Need | File |
|---|---|
| Monitors, NVIDIA+AMD, portrait restore | `references/hardware.md` |
| Host ADRs | `references/adrs.md` then the ADR file |
| Lua / wiki / inspect | `references/hyprland.md` |
| Debian sid, DKMS, AGS path | `references/debian.md` |
| Keybinds / record / AGS widgets | `kdx-hypr-control/references/` |

## Out of scope

Replacing GNOME as the daily driver. Publishing a general Hypr skill for other people. Editing other machines. Keep disk mp4 (`hypr-record`) and transmit (`kdx-share`) as two tools — you can still invent UX around both.
