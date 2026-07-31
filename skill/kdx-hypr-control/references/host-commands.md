# Host custom commands — ordered map (this machine)

**Scope:** Hyprland session helpers + CLI peers that live next to caffeine / Local LLM / `k`.  
**Live binds:** `~/.config/hypr/hyprland.lua` · **Helpers:** `~/.local/bin/` · **AGS IPC:** `ags request …`

Do **not** steal **Super+R** (hyprlauncher). New share picker is **Super+Ctrl+R**.

---

## 1. Family map (by layer)

```
┌─────────────────────────────────────────────────────────────────┐
│ AGS bar (HDMI-A-2) — FSM + external SSOT                         │
│   caffeine  ·  Local LLM brain  ·  clock  ·  volume              │
│   LiveIndicator  ·  DictationIndicator                           │
│   (parked) RecMenu · CapturePanel                                │
├─────────────────────────────────────────────────────────────────┤
│ Hypr keybinds → host helpers                                     │
│   Print family     → hypr-screenshot                             │
│   Super+Shift+R*   → hypr-record                                 │
│   Super+Ctrl+Z     → hypr-zoom-toggle                            │
│   Super+Ctrl+R     → kdx-share                                   │
│   Super+Shift+O    → hypr-monitor-heal  (post-blank dual-GPU)    │
│   Super+D / Super+L→ dictate / voice-live                        │
│   Super+A          → hypr-reveal-all                             │
│   Super+R          → hyprlauncher       (reserved)               │
│   Super+SPACE      → anyrun                                      │
├─────────────────────────────────────────────────────────────────┤
│ CLI (no hotkey)                                                  │
│   k / k-agent      → terminal agent inject                       │
│   kdx-voice-live   → wrapper → voice-live                        │
│   kdx-bot-token    → secrets helper (no desktop)                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. R-key family (do not collide)

| Bind | Tool | Role |
|---|---|---|
| **Super+R** | `hyprlauncher` | App launcher — **keep free of share/record** |
| Super+Shift+R | `hypr-record toggle region` | Record region → `~/Videos/Screencasts/` |
| Super+Shift+Alt+R | `hypr-record toggle window` | Record focused window |
| **Super+Ctrl+R** | **`kdx-share` menu** | **Pick panel(s) to transmit (portal share prep)** |

---

## 3. Peer features (caffeine · LLM · share · k)

| Feature | Entry | SSOT / state | UI |
|---|---|---|---|
| **Caffeine** | bar click · `ags request caffeine` | process table + FSM phases | AGS `widget/caffeine.ts` |
| **Local LLM** | bar brain click | `~/.config/local-llm/selected-model` + unit | AGS `LocalLlm.tsx` overlay |
| **kdx-share** | **Super+Ctrl+R** · `kdx-share` | `$XDG_RUNTIME_DIR/kdx-share.state` | GTK4/Adw: surface OBS + opt-in cam `/dev/video10` |
| **k** | CLI `k ?` / `k !` | `k-agent.service` + sock | Kitty inject (no desktop shell) |
| **Dictation** | Super+D | `/tmp/dictate_state.json` | AGS DictationIndicator |
| **Voice live** | Super+L | `/tmp/voice_live_state.json` | AGS LiveIndicator |
| **Zoom** | Super+Ctrl+Z | modeset roomy↔dense | toast via hyprctl |
| **Monitor heal** | Super+Shift+O · hypridle resume | dual-GPU CRTC + AGS | notify; log `$XDG_RUNTIME_DIR/hypr-monitor-heal.log` |
| **Record** | Super+Shift+R… | `$XDG_RUNTIME_DIR/hypr-record.*` | (RecMenu parked) |

---

## 4. Panel aliases (physical layout)

**Live:** portrait **LEFT** · landscape **RIGHT** (verify `hyprctl monitors`).

| Alias | Output | Role |
|---|---|---|
| `vertical` `left` `portrait` `asus` `bar` | **HDMI-A-2** | ASUS VA27EHF · transform 1 · AGS bar |
| `horizontal` `right` `landscape` `aoc` | **HDMI-A-1** | AOC G2790G4 |
| `both` `stack` | headless **kdxShare** | H full-width top + V native width bottom (1920×3000) |

> Note: some older docs used left=AOC; **physical left is ASUS portrait**. Prefer names `vertical`/`horizontal` in new code.

---

## 5. Binaries (`~/.local/bin`)

| Binary | Purpose |
|---|---|
| `hypr-screenshot` | grim/slurp capture |
| `hypr-record` | wf-recorder session |
| `hypr-zoom-toggle` | portrait scale 1↔1.5 + layer resync |
| `hypr-monitor-heal` | wake A-1 + soft-hotplug A-2 CRTC + AGS (never DPMS A-2) |
| `hypr-reveal-all` | Super+A gather windows |
| **`kdx-share`** | **transmit picker + mirror/composite** |
| `dictate` | STT batch |
| `voice-live` / `kdx-voice-live` | live dual pipeline |
| `k` → `~/Scripts/k` | terminal agent CLI |

Repo mirror (may lag live): `~/home-hyprland/bin/`.

---

## 6. AGS request surface (reachable only)

| Request | Effect |
|---|---|
| `bar-cycle` / `bar-peek` / `bar-mode` / `bar-set` | bar visibility FSM |
| `caffeine` / `caffeine-status` / `on`/`off` | idle inhibit FSM |
| `rec-menu` | RecMenu (widget parked — avoid relying) |
| `capture-toggle` | **no-op success** — parked (ADR 20260726 surfaces) |

Rule: every surface must be reachable or its IPC deleted. ADR `20260726-ags-surfaces-inventory-capture-parked`.

---

## 7. kdx-share — desktop as video input (hybrid)

**Goal:** chosen panel(s) → OBS input, and optionally a **virtual camera**.

| Sink | Default | What | Consumer |
|---|---|---|---|
| **surface** | ON | wl-mirror / headless stack | OBS Window or Output Capture |
| **camera** | OFF (opt-in) | `wf-recorder` → ffmpeg → **`/dev/video10`** (`kdx-share`) | OBS V4L2, browser, apps that only list cams |

```bash
kdx-share                      # menu Super+Ctrl+R
kdx-share vertical             # surface only
kdx-share horizontal --camera  # surface + cam
kdx-share both --camera        # stack + cam @ 960×1500 / 12fps
kdx-share horizontal --no-surface --camera   # cam only (cheaper)
kdx-share stop | status | inventory
```

**Resources (defaults):** single cam 15 fps native · both 12 fps scale 0.5 · NV12/yuv420p.  
Env: `KDX_SHARE_FPS`, `KDX_SHARE_FPS_BOTH`, `KDX_SHARE_BOTH_SCALE`, `KDX_SHARE_V4L2`.  
**Not** hypr-record (that writes mp4). Loopback: `v4l2loopback` video_nr=10, udev + modules-load.  
Log: `$XDG_RUNTIME_DIR/kdx-share.log`. ADR: `20260726-hyprland-super-ctrl-r-kdx-share`.
