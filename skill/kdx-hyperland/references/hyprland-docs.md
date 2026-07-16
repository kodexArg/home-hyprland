# Hyprland documentation (0.55.x Lua)

Scouted **2026-07-16** from [wiki.hypr.land](https://wiki.hypr.land/) (pages dated 2026-07-15) and [GitHub releases](https://github.com/hyprwm/Hyprland/releases).  
Machine: **Hyprland 0.55.4** — matches latest stable.

## Version landscape

| Item | Fact |
|---|---|
| Latest stable | **v0.55.4** (2026-06-11) |
| Config | `~/.config/hypr/hyprland.lua` |
| Rule | **Since 0.55, hyprlang is deprecated in favor of Lua.** |
| Legacy wiki | [0.54.0](https://wiki.hypr.land/0.54.0/) (hyprlang only — translate, don’t paste) |
| Official example | [example/hyprland.lua](https://github.com/hyprwm/Hyprland/blob/main/example/hyprland.lua) |
| Lua stubs | `/usr/share/hypr/stubs/` |

### 0.55.0 breaking (agents)

- `dwindle:pseudotile` removed
- `decoration:shadow:ignore_window` removed
- `render:cm_fs_passthrough` → `render:cm_auto_hdr`
- Gesture: `workspace_swipe*` removed → `hl.gesture({...})`

## Canonical wiki URLs

| Topic | URL |
|---|---|
| Home | https://wiki.hypr.land/ |
| Start / Lua | https://wiki.hypr.land/Configuring/Start/ |
| Variables | https://wiki.hypr.land/Configuring/Basics/Variables/ |
| Monitors | https://wiki.hypr.land/Configuring/Basics/Monitors/ |
| Binds | https://wiki.hypr.land/Configuring/Basics/Binds/ |
| Dispatchers | https://wiki.hypr.land/Configuring/Basics/Dispatchers/ |
| Window rules | https://wiki.hypr.land/Configuring/Basics/Window-Rules/ |
| Workspace rules | https://wiki.hypr.land/Configuring/Basics/Workspace-Rules/ |
| Autostart | https://wiki.hypr.land/Configuring/Basics/Autostart/ |
| Env vars | https://wiki.hypr.land/Configuring/Advanced-and-Cool/Environment-variables/ |
| Permissions | https://wiki.hypr.land/Configuring/Advanced-and-Cool/Permissions/ |
| Devices | https://wiki.hypr.land/Configuring/Advanced-and-Cool/Devices/ |
| Animations | https://wiki.hypr.land/Configuring/Advanced-and-Cool/Animations/ |
| Dwindle | https://wiki.hypr.land/Configuring/Layouts/Dwindle-Layout/ |
| Tag 0.55.0 | https://wiki.hypr.land/0.55.0/Configuring/Start/ |
| Release 0.55.4 | https://github.com/hyprwm/Hyprland/releases/tag/v0.55.4 |

## Lua essentials (`hl.*`)

```lua
hl.config({ general = { layout = "dwindle", gaps_in = 5 }, dwindle = { preserve_split = true } })
hl.monitor({ output = "HDMI-A-1", mode = "preferred", position = "0x0", scale = 1, transform = 0 })
hl.env("XCURSOR_SIZE", "24")
hl.on("hyprland.start", function() hl.exec_cmd("hyprpaper") end)

hl.bind("SUPER + Q", hl.dsp.exec_cmd("kitty"))
hl.bind("SUPER + mouse:272", hl.dsp.window.drag(), { mouse = true })
hl.bind(keys, fn, { locked = true, repeating = true, non_consuming = true })

hl.dsp.focus({ direction = "left" })
hl.dsp.window.move({ workspace = 2 })
hl.dsp.layout("togglesplit")
hl.dispatch(hl.dsp.window.float({ action = "toggle" }))

hl.window_rule({ name = "x", match = { class = "kitty" }, monitor = "HDMI-A-2" })
hl.device({ name = "device-name", enabled = false })
hl.gesture({ fingers = 3, direction = "horizontal", action = "workspace" })
hl.curve("easy", { type = "spring", mass = 1, stiffness = 71.26, dampening = 15.83 })
hl.animation({ leaf = "windows", enabled = true, speed = 4.79, spring = "easy" })
hl.permission({ binary = "/usr/bin/grim", type = "screencopy", mode = "allow" })
```

**Colors:** `"rgba(ff8c4288)"`, hex, or ARGB int. Gradients: `{ colors = {...}, angle = 45 }`.  
**Permissions:** not live-reloaded — full restart.

## Pitfalls

1. Edit **`.lua` only** on 0.55; community dots may still be hyprlang.
2. Syntax errors abort the failing file scope.
3. Dispatchers are **tables** until `hl.bind` / `hl.dispatch`.
4. Static window rules match initial class/title; use events for title changes.
5. Rule order: last match wins; named rules before anonymous.
6. RE2 regex; negate with `"negative:…"`.
7. `togglesplit` needs `preserve_split = true`.
8. Monitor scale should yield integer logical pixels.
9. Workspace IDs: 1…2147483647 (no 0).
10. Prefer versioned wiki if git docs drift; always translate hyprlang → `hl.*`.

## Load when…

| Task | Open |
|---|---|
| First Lua edit | Start + official example |
| Gaps/blur/input | Variables |
| Monitors/HDR/VRR | Monitors |
| Keybinds | Binds + Dispatchers |
| App-specific float/opacity | Window Rules |
| Login apps | Autostart |
| NVIDIA/cursor/env | Env vars + this-machine.md |
| Per-device input | Devices |
| Old `bind=` blogs | 0.54 wiki → translate |
