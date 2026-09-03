# Hyprland on this host (not a wiki dump)

Package: Debian `hyprland` **0.56.2+ds-1**. Config is **Lua only** (`~/.config/hypr/hyprland.lua`). hyprlang `.conf` is not the edit target.

Live always wins over the git copy. After edits: hyprmcp `reload_config` if connected, else `hyprctl reload`.

## Inspect

Prefer hyprmcp (`list_monitors`, `list_workspaces`, `list_clients`, `list_layers`, `dispatch_command`, `set_keyword`, `reload_config`, `get_version`). Shell `hyprctl` only if MCP is down.

## Upstream when catalog is stale

If `scripts/check_version.sh` mismatches or `hyprctl version` ≠ stamp:

1. https://wiki.hypr.land/Configuring/ (Lua / monitors / binds)
2. https://wiki.hyprland.org/ (legacy host; follow redirects)
3. `man hyprland` / `hyprctl version`

Cache notes into this file only if they apply **here** (NVIDIA+AMD, two HDMI, Lua 0.55+). Drop generic ricing.

## Sibling runbooks (do not duplicate)

`~/home-hyprland/skill/kdx-hypr-control/references/` — keybinds, host-commands, record, ags, this-machine, hyprland-docs.

Helpers: `hypr-screenshot` `hypr-record` `hypr-reveal-all` `hypr-zoom-toggle` `hypr-monitor-heal` `kdx-share` `kdx-rec-mode`.
