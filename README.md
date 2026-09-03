# home-hyprland

[![Hyprland](https://img.shields.io/badge/Hyprland-0.55.4%20(Lua)-blue.svg?style=flat-square)](https://hyprland.org)
[![AGS](https://img.shields.io/badge/AGS-3.1%20(Astal%20GTK4)-orange.svg?style=flat-square)](https://github.com/Aylur/ags)
[![PipeWire](https://img.shields.io/badge/Audio-PipeWire%20%2B%20WirePlumber-brightgreen.svg?style=flat-square)](https://pipewire.org)
[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-Standard%20Ready-purple.svg?style=flat-square)](./skills)

A modern, highly modular, Lua-configured **Hyprland** desktop environment with an **Astal (AGS v3 / GTK4)** status bar, real-time audio voice detection, local LLM switcher, hardware mouse mapping, and built-in **Agent Skills** for AI pair programming.

---

## 🌟 Key Highlights & Features

### 🎙️ 1. Vintage Metallic Mic FSM (Real-Time Voice Reactive)
A permanent, classic 1940s-style broadcast microphone widget in the bar with a dedicated Finite State Machine (FSM):
* **Muted / Disabled**: Dark faint tone (matches inactive VRAM cells).
* **Unmuted / Idle**: Calm brain-gray (`#9a9a9a` @ 55% opacity).
* **Hearing Voice / Audio**: Lights up and flickers in real-time in **light green** (`#7bc96f`, matching active RAM).
* **Engine (`bin/kdx-mic-activity`)**: Runs a lightweight PCM stream via `parec` (40 ms chunks, 0.0% CPU) with adaptive dynamic noise floor tracking and natural speech envelope hold (~200 ms).

### 🧠 2. Local LLM Brain Controller
Integrated local AI model selector positioned right beside the microphone (clustered tightly with 2 px spacing):
* Scans local GGUF models (`~/Services/local-llm/models/gguf`).
* FSM lifecycle manager: `unload` (red) $\rightarrow$ `load` (amber) $\rightarrow$ `ready` (green).
* Connects to local OpenAI-compatible API (`127.0.0.1:28000/v1/models`).
* Live VRAM budget awareness with `nvidia-smi` hot/cold polling.

### 📊 3. 5×3 RamTrack (Warn-Ahead Memory Grid)
Compact 5×3 cell visual grid for system resources:
* Rows: **VRAM** (8 GB), **RAM**, and **SWAP** (with ZSwap compression metrics).
* **Warn-ahead progressive scale**: 0 cells at 0 GiB, green for healthy load, yellow/orange for medium, and red 5th cell warning before reaching physical limits.

### 🔊 4. Audio Output & Volume Cycler
* **Output Cycler**: Single-click cycling between Speakers $\leftrightarrow$ Headphones $\leftrightarrow$ Mute.
* **Volume Track**: Custom GTK gesture drag/scroll bar (not `Gtk.Scale`, avoiding layer-shell hit-target desync).

### 🖱️ 5. Hardware Mouse Integration (`libratbag` / `ratbagctl`)
Dedicated on-board hardware mouse profiles (Logitech G300s or any multi-button gaming mouse):
* **G4 (Top-Left Button)** $\rightarrow$ Mapped to `KEY_MICMUTE` (toggles PipeWire microphone mute via compositor).
* **G6 (Top-Right Button)** $\rightarrow$ Mapped to `KEY_LEFTMETA` (Super / Windows key modifier).

### 🤖 6. Agent Skills Included (`skills/`)
Contains standardized **Agent Skills** (`skills/k-hyprland` and `skills/kdx-hypr-control`) complying with the universal Agent Skills specification. When opening this repository with Antigravity, Claude Code, Cursor, or Copilot, the AI assistant automatically understands the architecture, keybindings, and system commands.

---

## 📁 Repository Layout

```text
home-hyprland/
├── hypr/
│   ├── hyprland.lua          # Compositor config in Lua (binds, window rules, monitors)
│   ├── hypridle.conf         # DPMS and idle management
│   └── hyprpaper.conf        # Multi-monitor wallpaper controller
├── ags/                      # Astal (GTK4) status bar
│   ├── app.ts                # Application entrypoint & IPC request handlers
│   ├── style.scss            # Nautilus/Orange theme token system
│   ├── widget/
│   │   ├── Bar.tsx           # Bar layout with BrainCluster (mic + brain)
│   │   ├── MicIndicator.tsx  # Vintage Mic FSM component
│   │   ├── mic.ts            # PipeWire audio watcher & event stream
│   │   ├── LocalLlm.tsx      # Brain local LLM controller panel
│   │   ├── RamTrack.tsx      # 5x3 VRAM/RAM/SWAP widget
│   │   └── SystemMenu.tsx    # Extreme-right system sandwich panel
│   └── icons/                # Pixel-crisp baked SVG icon set
├── bin/                      # Desktop helpers & CLI utilities
│   ├── kdx-mic-activity      # 0.0% CPU real-time voice activity detector
│   ├── hypr-record           # Disk screencaster (wf-recorder -> mp4)
│   ├── hypr-screenshot       # Region / window / full screenshot tool (grim + slurp)
│   ├── hypr-monitor-heal     # Multi-GPU / portrait CRTC recovery helper
│   ├── hypr-zoom-toggle      # Instant display scale toggle (1.0 <-> 1.5)
│   └── kdx-share             # Display transmission picker
├── kitty/                    # Kitty terminal profiles
├── skills/                   # AI Agent Skills (k-hyprland, kdx-hypr-control)
└── wallpapers/               # Desktop background assets
```

---

## 📦 Prerequisites

* **Operating System**: Linux (Debian Sid / Arch / Fedora / Ubuntu)
* **Compositor**: `hyprland` $\ge 0.55$ (with Lua plugin support enabled)
* **Status Bar**: `ags` $\ge 3.1.0$ ([Aylur/ags](https://github.com/Aylur/ags) with Astal GTK4)
* **Audio**: `pipewire`, `wireplumber`, `pipewire-pulse` (`pactl`, `parec`, `wpctl`)
* **Utilities**: `python3`, `sass` (Dart Sass), `grim`, `slurp`, `wf-recorder`, `playerctl`, `brightnessctl`
* **Mouse Config (Optional)**: `libratbag-tools` (`ratbagctl`)

---

## 🚀 Installation & Setup

### 1. Clone the repository
```bash
git clone https://github.com/kodexArg/home-hyprland.git ~/home-hyprland
```

### 2. Link or Copy Configurations
```bash
# Hyprland config (Lua)
mkdir -p ~/.config/hypr
ln -sfn ~/home-hyprland/hypr/hyprland.lua ~/.config/hypr/hyprland.lua
ln -sfn ~/home-hyprland/hypr/hypridle.conf ~/.config/hypr/hypridle.conf
ln -sfn ~/home-hyprland/hypr/hyprpaper.conf ~/.config/hypr/hyprpaper.conf

# AGS Bar
mkdir -p ~/.config/ags
rsync -a --exclude node_modules --exclude @girs ~/home-hyprland/ags/ ~/.config/ags/

# Helper Binaries
mkdir -p ~/.local/bin
install -m 755 ~/home-hyprland/bin/* ~/.local/bin/

# Kitty Terminal
mkdir -p ~/.config/kitty
cp -a ~/home-hyprland/kitty/* ~/.config/kitty/
```

### 3. Setup Supervised AGS Systemd Unit
Create or link the user service so AGS automatically starts and recovers on monitor events:
```bash
mkdir -p ~/.config/systemd/user
cp ~/home-hyprland/systemd/user/ags-hyprland.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now ags-hyprland.service
```

### 4. Configure Mouse Buttons (Optional)
If using a Logitech G300s (or any mouse supported by libratbag):
```bash
# Find device identifier
ratbagctl list

# Assign G4 (Button 3) to Microphone Mute
ratbagctl <device_name> button 3 action set macro KEY_MICMUTE

# Assign G6 (Button 5) to Super (Windows) Key
ratbagctl <device_name> button 5 action set macro KEY_LEFTMETA
```

---

## ⌨️ Keybindings Cheatsheet

**Main Modifier (`mainMod`)**: `SUPER`

### Applications & Launchers
| Shortcut | Action |
| :--- | :--- |
| `Super + T` | Terminal (Kitty) |
| `Super + X` | Web Browser (Brave) |
| `Super + E` | File Manager (Nautilus) |
| `Super + Space` | Application Launcher (`anyrun`) |
| `Super + R` | Menu Launcher (`hyprlauncher`) |
| `Super + G` | Grok CLI Terminal |
| `Super + N` | AGY CLI Terminal |
| `Super + W` | WhatsApp Web PWA |
| `Super + Y` | YouTube PWA |

### Window Management & Workspaces
| Shortcut | Action |
| :--- | :--- |
| `Super + C` | Close active window (polite) |
| `Super + Ctrl + C` | Force kill active window (`kill`) |
| `Super + V` | Toggle floating mode |
| `Super + F` | Maximize / Restore window (keeps bar visible) |
| `Super + Shift + F` | **True Fullscreen** (0 gaps, covers bar) |
| `Super + K` | **Toggle Pointer Confinement** (traps/frees cursor in window) |
| `Super + A` | **Reveal All** (gathers windows to active workspace & tiles) |
| `Super + S` | Toggle special scratchpad workspace (`magic`) |
| `Super + 1..0` | Switch to Workspace 1–10 |
| `Super + Shift + 1..0` | Move focused window to Workspace 1–10 |
| `Super + Ctrl + Arrows` | Resize window by 40 px |

### Screen Capture & Recording
| Shortcut | Action |
| :--- | :--- |
| `Print` | Screenshot focused window |
| `Ctrl + Print` | Screenshot selected region |
| `Alt + Print` | Screenshot full desktop |
| `Super + Shift + R` | Toggle screencast recording (Region $\rightarrow$ `.mp4`) |
| `Super + Shift + Alt + R` | Toggle screencast recording (Window $\rightarrow$ `.mp4`) |
| `Super + Ctrl + R` | Open `kdx-share` screen transmit picker |

### Audio & System
| Shortcut | Action |
| :--- | :--- |
| `XF86AudioMicMute` / Mouse G4 | **Toggle Microphone Mute** |
| `XF86AudioRaiseVolume` | Increase volume +5% |
| `XF86AudioLowerVolume` | Decrease volume -5% |
| `XF86AudioMute` | Toggle speaker mute |
| `Super + B` | Cycle AGS bar mode (`always` $\rightarrow$ `temp` $\rightarrow$ `hidden`) |
| `Super + Shift + E` | Logout / Session Shutdown |
| `Super + Shift + O` | Soft-heal & re-layout dual displays (`hypr-monitor-heal`) |

---

## 🤝 AI Agent Collaboration

This repository includes custom agent skills in the [`skills/`](./skills) directory:
* [`skills/k-hyprland`](./skills/k-hyprland/SKILL.md): ADRs, hardware map, and Debian quirks catalog.
* [`skills/kdx-hypr-control`](./skills/kdx-hypr-control/SKILL.md): Direct operator instructions, bar widget contracts, and compositor rule management.

---

## 📄 License

MIT © [Gabriel Cavedal (kodexArg)](https://github.com/kodexArg)
