# Keybinds — this machine (`hyprland.lua`)

**Source of truth:** `~/.config/hypr/hyprland.lua` (KEYBINDINGS section).  
**mod:** `SUPER` (`mainMod`). Re-read the file if this table drifts.

## Apps / session

| Bind | Action |
|---|---|
| Super+T | Kitty terminal |
| Super+G | Grok CLI (kitty class `grok-cli`, forced to HDMI-A-2) |
| Super+Shift+G | Grok Web (Brave PWA `ggjocahimgaohmigbfhghnlfcnjemagj` · grok.com) |
| Super+N | AGY CLI (Antigravity CLI, kitty class `agy-cli`, forced to right monitor) |
| Super+X | Brave browser |
| Super+H | Deepseek Harness (`dsh-web-session`: start `dsh-web.service`, Chromium F11 on `127.0.0.1:3080`, stop unit on close) |
| Super+W | WhatsApp Web (Brave PWA) |
| Super+Y | YouTube (Brave PWA `agimnkijcaahngcdmfeangaknmldooml`) |
| Super+E | Nautilus |
| Super+R | hyprlauncher (**do not steal** — share is Super+Ctrl+R) |
| Super+Shift+R | `hypr-record toggle region` — **disk** screencast (mp4) |
| Super+Shift+Alt+R | `hypr-record toggle window` — disk record focused window |
| Super+Ctrl+R | `kdx-share menu` — **transmit** picker (vertical / horizontal / both stack) — not mp4 |
| Super+SPACE | anyrun (`~/.local/bin/anyrun-launch`) |
| Super+C | **Close** window (graceful — app can save/prompt) |
| Super+Ctrl+C | **Force kill** active window (compositor kills client; no prompt) |
| Super+Ctrl+X | Force kill (alias of Super+Ctrl+C) |
| Super+M | `kdx-rec-mode toggle` — WIP REC mode chip (not exit, not mp4) |
| Super+Shift+E | Session exit (`hyprshutdown` if present, else exit dispatcher) |
| Super+V | Toggle float |
| Super+F | Toggle full panel (maximize / restore — keeps AGS bar) |
| Super+Shift+F | **True Fullscreen** (bypass confinement, 0 gaps, covers AGS bar) |
| Super+K | Toggle pointer confine on the focused window (`confine_pointer` Wayland) |
| Super+P | Pseudo (dwindle) |
| Super+Q | togglesplit (dwindle; needs `preserve_split`) |
| Super+D | `kdx-dictator toggle` — continuous voice dictation (speech-to-text at cursor) |

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
| Super+Ctrl+R | **kdx-share** menu — which panel(s) to transmit (portal share prep). Not Super+R. See `references/host-commands.md`. |

## Workspaces

**Pinned (2026-08-01):** 1–3 → HDMI-A-2 left · 4–6 → HDMI-A-1 right · defaults **1** and **4** · `persistent`. See `references/this-machine.md`.

| Bind | Action |
|---|---|
| Super+1…9,0 | Focus workspace 1–10 (1–3 left, 4–6 right) |
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
| Super+MMB (274) | Drag window (plain MMB = real middle-click) |

## Screenshots (grim + slurp)

| Bind | Action |
|---|---|
| Print | Focused window → file + clipboard |
| Ctrl+Print | Region (slurp) → file + clipboard |
| Alt+Print | Full desktop (all monitors) → file + clipboard |
| Super+Print | Focused monitor only → file + clipboard |

Files: `~/Pictures/Screenshots/YYYYMMDD-HHMMSS-<pid>-<rand>.png`.  
Helper: `~/.local/bin/hypr-screenshot` (`window` \| `region` \| `full` \| `monitor active` \| `panel …`).

## Disk record (wf-recorder → mp4)

| Bind | Action |
|---|---|
| Super+Shift+R | `hypr-record toggle region` |
| Super+Shift+Alt+R | `hypr-record toggle window` |

Files: `~/Videos/Screencasts/`. Helper: `~/.local/bin/hypr-record`.  
Also: SystemMenu → **Cast** · CLI · voice action `record`.  
**Not** Super+Ctrl+R (`kdx-share`). Runbook: `references/record.md` · ADR `20260806-hypr-record-disk-screencast`.

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
| grokWeb | Brave PWA app-id `ggjocahimgaohmigbfhghnlfcnjemagj` (Grok Web / grok.com) |
| dshWeb | `/home/kodex/.local/bin/dsh-web-session` (Deepseek Harness · Super+H) |
| agsBin | PATH-prefixed `/usr/local/bin/ags` |

## Window rules (related)

- `grok-cli` → monitor HDMI-A-2
- Super+F toggles full panel (compositor maximize). Client Full Screen (YouTube F, F11, …) is confined: layout stays, client still gets FS inside the window.
- XWayland empty drag fix
- `hyprland-run` float near bottom
