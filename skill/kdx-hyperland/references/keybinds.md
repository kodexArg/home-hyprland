# Keybinds — this machine (`hyprland.lua`)

**Source of truth:** `~/.config/hypr/hyprland.lua` (KEYBINDINGS section).  
**mod:** `SUPER` (`mainMod`). Re-read the file if this table drifts.

## Apps / session

| Bind | Action |
|---|---|
| Super+T | Kitty terminal |
| Super+G | Grok CLI (kitty class `grok-cli`, forced to HDMI-A-2) |
| Super+X | Brave browser |
| Super+E | Nautilus |
| Super+R | hyprlauncher |
| Super+SPACE | anyrun (`~/.local/bin/anyrun-launch`) |
| Super+C | Close window |
| Super+CTRL+X | Kill active window |
| Super+M | Exit (`hyprshutdown` if present, else exit dispatcher) |
| Super+V | Toggle float |
| Super+F | Toggle full panel (maximize / restore) |
| Super+P | Pseudo (dwindle) |
| Super+Q | togglesplit (dwindle; needs `preserve_split`) |

## AGS bar

| Bind | Action |
|---|---|
| Super+B | `ags request bar-cycle` — always → temp → hidden |
| Super_L | `ags request bar-peek` — **non_consuming** (does not steal Super+*) |
| Super_R | same as Super_L |

Modes: **always** (transparent chrome) · **temp** (active chrome, auto-hide 2.5s) · **hidden**.  
Temp re-show: cursor top 12px of HDMI-A-2 (transform-aware poll) or Super peek.

## Focus / move / resize

| Bind | Action |
|---|---|
| Super+←↑↓→ | Focus direction |
| Super+Shift+←↑↓→ | Move window (swap / cross monitor) |
| Super+Ctrl+←↑↓→ | Resize ±40px (repeating) |
| Super+Ctrl+Z | Toggle HDMI-A-2 scale **1.5 ↔ 1.0** (`hypr-zoom-toggle`). Sequential modesets + settle delay (batching two monitors races DRM page-flip → cut-off). Toast confirms phase. |

## Workspaces

| Bind | Action |
|---|---|
| Super+1…9,0 | Focus workspace 1–10 |
| Super+Shift+1…9,0 | Move window to workspace 1–10 |
| Super+S | Toggle special workspace `magic` (show/hide) |
| Super+Shift+S | Move window to `special:magic` |
| Super+Ctrl+S | Toggle window on/off `special:magic` |
| Super+A | Reveal all windows (gather every ws → active, exit scratchpad, un-maximize, tile) |
| Super+mouse_down / mouse_up | Workspace e+1 / e−1 |

## Mouse

| Bind | Action |
|---|---|
| Super+LMB (272) | Drag window |
| Super+RMB (273) | Resize window |
| MMB (274) | Drag window (no Super) |

## Screenshots (grim + slurp)

| Bind | Action |
|---|---|
| Print | Focused window → file + clipboard |
| Ctrl+Print | Region (slurp) → file + clipboard |
| Alt+Print | Full desktop (all monitors) → file + clipboard |
| Super+Print | Focused monitor only → file + clipboard |

Files: `~/Pictures/Screenshots/YYYYMMDD-HHMMSS-<pid>-<rand>.png`.  
Helper: `~/.local/bin/hypr-screenshot` (`window` \| `region` \| `full` \| `monitor active` \| `panel …`).

## Media / brightness (locked, repeating where noted)

| Bind | Action |
|---|---|
| XF86AudioRaiseVolume | wpctl sink +5% (cap 100%) |
| XF86AudioLowerVolume | wpctl sink −5% |
| XF86AudioMute | toggle sink mute |
| XF86AudioMicMute | toggle source mute |
| XF86MonBrightnessUp/Down | brightnessctl ±5% |
| XF86AudioNext/Prev/Play/Pause | playerctl |

## Gesture

- 3-finger horizontal → workspace swipe (`hl.gesture`)

## Programs (locals in lua)

| Var | Value |
|---|---|
| terminal | `kitty` |
| fileManager | `nautilus` |
| browser | `brave-browser` |
| menu | `hyprlauncher` |
| anyrun | `/home/kodex/.local/bin/anyrun-launch` |
| grokCli | kitty `--class grok-cli` + `~/.config/kitty/grok.conf` + `~/.local/bin/grok --fullscreen` |
| agsBin | PATH-prefixed `/usr/local/bin/ags` |

## Window rules (related)

- `grok-cli` → monitor HDMI-A-2
- Super+F toggles full panel (compositor maximize). Client Full Screen (YouTube F, F11, …) is confined: layout stays, client still gets FS inside the window.
- XWayland empty drag fix
- `hyprland-run` float near bottom
