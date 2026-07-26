# AGS — special section (this machine + latest docs)

**AGS** = Aylur's GTK Shell (v3 = scaffolding CLI over **Astal** + **Gnim**).  
Not Waybar. Global hotkeys stay in Hyprland → `ags request …`.

Scouted **2026-07-16**. Machine: **ags 3.1.0** @ `/usr/local/bin/ags`. Upstream latest noted: **3.1.2** (2026-04-08).

---

## Part A — Latest official documentation

### Version landscape

| Era | Stack | Agent rule |
|---|---|---|
| AGS v1 | JS shell, `config.js` | Ignore patterns (`Widget.Window`, `ags -r`) |
| AGS v2 | Astal, `astal/*` imports | Migrate; don’t paste |
| **AGS v3** (ours) | CLI + Gnim JSX; imports `ags/*` | **Only this tree** |

- **AGS** = CLI (`run`, `request`, `types`, `bundle`, `init`)
- **Astal** = GObject libs (Window/layer-shell, WirePlumber, Hyprland, …)
- **Gnim** = JSX + reactive Accessors for GJS (not React/Node)

### Canonical URLs (AGS v3)

| Page | URL |
|---|---|
| Home | https://aylur.github.io/ags/ |
| Install | https://aylur.github.io/ags/guide/install.html |
| Quick start | https://aylur.github.io/ags/guide/quick-start.html |
| First widgets | https://aylur.github.io/ags/guide/first-widgets.html |
| Theming | https://aylur.github.io/ags/guide/theming.html |
| **App + CLI/IPC** | https://aylur.github.io/ags/guide/app-cli.html |
| Utilities | https://aylur.github.io/ags/guide/utilities.html |
| Intrinsics | https://aylur.github.io/ags/guide/intrinsics.html |
| Migration v1/v2→v3 | https://aylur.github.io/ags/guide/migration-guide.html |
| Examples | https://aylur.github.io/ags/guide/examples.html |
| simple-bar | https://github.com/Aylur/ags/tree/main/examples/gtk4/simple-bar |
| Repo | https://github.com/Aylur/ags |

### Astal / Gnim

| Page | URL |
|---|---|
| Astal intro | https://aylur.github.io/astal/guide/introduction.html |
| Libraries index | https://aylur.github.io/astal/guide/libraries/references.html |
| WirePlumber | https://aylur.github.io/astal/guide/libraries/wireplumber.html · API https://docs.astal.dev/wireplumber |
| Hyprland lib | https://aylur.github.io/astal/guide/libraries/hyprland.html · API https://docs.astal.dev/hyprland |
| Window (layer-shell) | https://aylur.github.io/libastal/astal4/class.Window.html |
| Gnim JSX | https://aylur.github.io/gnim/jsx.html |
| GTK4 CSS | https://docs.gtk.org/gtk4/css-overview.html |

### CLI (v3)

| Command | Role |
|---|---|
| `ags run [dir\|file]` | Bundle → GJS; default `~/.config/ags/app.*` |
| `ags request <argv…>` | IPC to primary instance (`requestHandler`) |
| `ags toggle <name>` | Toggle named window |
| `ags quit` | Quit instance |
| `ags list` / `ags inspect` | Instances / GTK inspector |
| `ags types [-u] -d dir` | Regenerate `@girs` |
| `ags init -d dir` | Scaffold |

**No `ags reload`.** Restart: `ags quit && ags run …`.

### Doc pitfalls

1. GTK4 windows need **`visible`** (start hidden).
2. For `ags toggle`: set `name` **before** `application={app}`.
3. Use **`gdkmonitor`**, not compositor monitor ids.
4. Imports: **`ags/gtk4/app`**, not stale `astal/gtk4/app` snippets.
5. State: `createState` / `createBinding` / `createComputed` (not v2 `Variable`/`bind`).
6. `class=` not `className`; `$={(self)=>…}` not `setup`.
7. `exec` is not a shell (no `$VAR`, no `&&`).
8. Prefer Astal libs over poll/`exec` when possible.
9. **NVIDIA/GSK:** not in AGS docs — host workaround (we use `GSK_RENDERER=gl`).

### Minimum pre-read before editing any bar

1. Live files under `~/.config/ags/` (Part B)
2. https://aylur.github.io/ags/guide/app-cli.html
3. https://aylur.github.io/ags/guide/first-widgets.html
4. https://aylur.github.io/ags/guide/intrinsics.html
5. https://aylur.github.io/gnim/jsx.html
6. Relevant Astal lib (WirePlumber / Hyprland)
7. Migration guide if reading old internet snippets

---

## Part B — Configuration we use here

### Stack (ADR `20260715-ags-hyprland-volume-bar`)

| Piece | Value |
|---|---|
| Binary | `/usr/local/bin/ags` **3.1.0** |
| Config root | `~/.config/ags/` |
| Runtime | GJS + Gnim JSX + GTK4 + gtk4-layer-shell |
| Libs | `libastal-io`, `libastal-4`, `libastal-wireplumber` (source build under `/usr`) |
| SCSS | `sass` on `PATH` via `~/.local/bin` (dart-sass npm prefix) |
| Autostart | From `hyprland.lua` with `GSK_RENDERER=gl` and extended PATH |
| package.json | deps: `ags`, `gnim` |

### Layout (files that matter)

```
~/.config/ags/
  app.ts              # entry: monitors filter + requestHandler
  style.scss          # kdx chrome tokens; never fully transparent windows
  package.json
  tsconfig.json
  env.d.ts
  @girs/              # generated types
  icons/              # cream monochrome SVGs (image file=, no icon theme)
  widget/
    Bar.tsx           # Volume + LocalLlm + Clock chip layout
    caffeine.ts       # caffeine FSM (SSOT=process table, tick reconcile)
    bar-mode.ts       # always | temp | hidden + edge poll + peek
    LocalLlm.tsx      # brain menu: GGUF model picker + local-llm.service FSM
```

### Monitor policy

- Bar **only on HDMI-A-2** (portrait ASUS). Never on HDMI-A-1.
- Filter in `app.ts`: `mon.connector === "HDMI-A-2"`.
- Same constant in `bar-mode.ts` as `BAR_MONITOR` for edge cursor math.

### IPC (must match Hypr binds)

| Request | Handler | Hypr bind |
|---|---|---|
| `bar-cycle` / `bar` | `cycleBarMode()` | Super+B |
| `bar-peek` / `peek` | `peekTemp()` | Super_L / Super_R (`non_consuming`) |
| `bar-mode` | `getBarMode()` | (debug) |
| `bar-set <mode>` | `setBarMode()` | (scripted) |
| `caffeine` / `caffeine-toggle` | `toggleCaffeine()` | (bar click) |
| `capture-toggle` / `capture` | `toggleCapture()` | (widget commented out) |

Implemented in `app.ts` → `requestHandler`.

`app.ts` also re-spawns the bar on `notify::monitors` plus one 400 ms retry —
otherwise an `ags` restart could leave IPC up with no window (hotplug race).

### Three modes (ADR `20260715-ags-bar-super-b-three-mode`)

| Mode | CSS class | Behavior |
|---|---|---|
| `always` | `mode-always` | Visible; inactive-window chrome (dark gray rim) |
| `temp` | `mode-temp` | Active chrome (orange rim); auto-hide **2.5s** unless hover/edge |
| `hidden` | `mode-hidden` | Invisible |

**Temp re-show:**

1. Poll `hyprctl cursorpos` every 80ms against **top 12px** of HDMI-A-2 (transform 1/3 swaps w/h).
2. Super_L/R → `bar-peek` (non_consuming so Super+Q etc. still work).
3. Pointer enter/leave on the bar itself holds visibility.

Default first paint: **`always`** mode — the edge poll does not run until you cycle into `temp` (see the trailing comment in `bar-mode.ts`).

### Bar widgets (`Bar.tsx`)

| Region | Content |
|---|---|
| start | **Volume** first: output icon, −, custom track, + (AstalWp `defaultSpeaker`) |
| center | empty |
| end | **LocalLlm** brain button + **ClockCaffeine** cluster (`%H:%M` + Calendar popover + cup) |

`CaptureToggle` / `CapturePanel` are written but **commented out in the `end` box
since 2026-07-17** — both buttons were mocks; the real work is the `Print` binds
on `hypr-screenshot`. Code kept for when it gets wired.

**Volume output icon (triple, not volume ladder):**

| State | Icon | When |
|---|---|---|
| Speakers | `icons/speakers.svg` | Adwaita `audio-speakers-symbolic` — parlante only (no waves) |
| Muted | `icons/muted.svg` | Adwaita `audio-volume-muted-symbolic` — parlante + X |
| Headphones | `icons/headphones.svg` | Adwaita `audio-headphones-symbolic` |

Cream monochrome vendored under `~/.config/ags/icons/` (`image file=`). Not `audio-volume-high` (waves).

**Icon click cycle:** `parlante → mute → auris → parlante`  
(mute all · default→HDMI auris unmute · default→MB lineout unmute).

**Bug fixed:** nested `createBinding(wp, "defaultSpeaker", "route", …)` could stick after sink switch. Classify with a **live** `defaultSpeaker` read after mute/id notify + light route poll.

This host (2026-07-24): HDMI TU106 → AOC G2790G4 = **auriculares** · Ryzen ALC897 `analog-output-lineout` (MB jack) = **parlantes**. ADR `20260724-audio-hdmi-headphones-mb-speakers`.

**Volume track:** custom box + GestureClick/Drag/Scroll — **not** `Gtk.Scale` (broken hit-target on layer-shell + GSK gl here). Fill width mirrors WirePlumber volume; fill is a **child** (do not rebind class on gesture target mid-click).

Window props:

- `namespace="ags-bar"`, `name="bar"`
- `exclusivity=EXCLUSIVE`, `layer=TOP`, `anchor=TOP|LEFT|RIGHT`
- `keymode=NONE` (pointer only — ON_DEMAND steals keys)
- `visible={barVisible}`, `class={barModeClass}`

### Caffeine (`widget/caffeine.ts` + `ClockCaffeine` in Bar)

Cup glued to the clock in one chip (`ClockCluster`): left half = calendar
menubutton, right half = caffeine toggle. No vertical rule — spacing separates
the hit targets.

**Pattern (replicate for other bar controls):** SSOT = process table
(`--who=ags-caffeine`), not a UI bool. Explicit FSM
`off|arming|on|disarming|failed` + ~1.5 s tick reconcile. UI projections
(`caffeineUiOn`, tooltip, shell class) derive from phase × pids. Toggle
direction from reality, not `!uiBool`. IPC returns verified snapshot.

- Mechanism: `systemd-inhibit --what=idle:sleep --who=ags-caffeine --mode=block sleep infinity`
  (`Gtk.Application.inhibit` is a no-op without gnome-session).
- Icons: `icons/caffeine-on.svg` / `caffeine-off.svg` · class `ClockCluster caffeine-on`.
- IPC: `ags request caffeine` | `caffeine-status` | `caffeine-on` | `caffeine-off`.
- ADR: `~/Documents/System/ADRs/20260720-ags-caffeine-toggle.md` (updated 2026-07-25).

Verify: `systemd-inhibit --list | grep ags-caffeine`.

### Local LLM selector (`LocalLlm.tsx`)

Brain button → layer-shell menu: status header, one button per `.gguf`, `OFF`.
Plus a full-monitor **clickaway** window underneath (GSK needs non-zero alpha to
hit-test) and Esc handling.

| Piece | Value |
|---|---|
| Model dir | `~/Services/local-llm/models/gguf` (re-scanned every 5 s; `*embedding*` skipped) |
| Selection file | `~/.config/local-llm/selected-model` |
| Unit | `local-llm.service` (systemd **--user**) |
| Ready probe | `curl -sf --max-time 1 http://127.0.0.1:28000/v1/models` |
| Tick | 400 ms FSM tick · VRAM via `nvidia-smi` every 2 s hot / 8 s cold |

**FSM:** `idle → unload (red on the outgoing model) → load (amber on the
incoming) → idle`. Only one model fits in 8 GB, so switching always unloads first.

- **Ready ≠ unit active.** A `running` unit with no `/v1/models` answer means
  weights are still mapping — paint amber, not on. This distinction is the whole
  point of the widget; do not "simplify" it to `systemctl is-active`.
- Timeouts: load **90 s** (2 × the 45 s budget measured on densenet 9B Q4),
  unload **30 s**. Both end in `systemctl --user kill -s SIGKILL` — a hybrid MoE
  thrashing on mmap ignores polite SIGTERM.
- Hybrid MoE (`/35B|A3B|MoE/`) rows are labelled `· hybrid`; ~21 GB on disk is
  not a pure 8 GB load. Archived ones live in `models/gguf-archive/` (not scanned).
- Brain tone: `on` (orange) only when ready **and** VRAM ≥ 7 GiB used; ready with
  headroom (< 7 GiB) stays amber. Red = unloading or failed.

### Style rules we learned the hard way (`style.scss`)

- **Never fully transparent** window background under GSK `gl` — empty input region, clicks pass through. Keep tiny alpha (`rgba(12,11,9,0.01–0.02)`).
- Chrome mirrors Hypr borders: inactive ink-600 rim / active orange-500@alpha; gaps 5, radius 10, border 2 (kdx-design-system).
- Super+B visual: always = inactive window look; temp = active window look.

### Autostart line (from hyprland.lua)

```lua
hl.exec_cmd("env PATH=/home/kodex/.local/bin:/usr/local/bin:/usr/bin GSK_RENDERER=gl /usr/local/bin/ags run /home/kodex/.config/ags")
```

### Edit / reload procedure

```bash
# 1. edit files under ~/.config/ags
# 2. restart AGS (no hot reload)
ags quit
env PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin GSK_RENDERER=gl \
  /usr/local/bin/ags run /home/kodex/.config/ags

# 3. smoke
ags request bar-mode
ags request bar-cycle
ags request bar-peek
```

If types break after new GIR: `ags types -u -d ~/.config/ags`.

### Standing ADRs

| ADR | Decision |
|---|---|
| `20260715-ags-hyprland-volume-bar` | AGS v3 shell; WirePlumber volume first control; GSK=gl + sass PATH |
| `20260715-ags-bar-super-b-three-mode` | Super+B cycle; Super peek non_consuming; edge poll on HDMI-A-2 |

New bar policy → register ADR; do not “just leave it in chat.”
