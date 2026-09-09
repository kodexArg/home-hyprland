# Voice Dictation & Cognitive Brain Service (3-Tier FSM Architecture)

> Modern, minimalist, and SOLID voice dictation and cognitive assistant service for Debian SID / Hyprland Wayland desktop with NVIDIA GPU acceleration.

Interactive Architecture Map: [voice-fsm-graphs.html](voice-fsm-graphs.html)

---

## 1. System Overview

The voice service (`mic-dict-brain`) is governed by a **strict vertical hierarchy of three decoupled Finite State Machines (FSMs)**:

```
┌─────────────────────────────────────────────────────────────┐
│ FSM 1: Microphone Stream Gate (Hardware / Audio Gate)        │
│ [MIC_OFF Muted] ◄────────────── Super+D ────────► [MIC_ON] │
└──────────────────────────────┬──────────────────────────────┘
                               │ Audio PCM 16kHz
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ FSM 2: Dictator & Queue Manager (Zero Cognitive Reflection) │
│ [STANDBY] ──► [ACCUMULATING] ──► [QUEUE_MANAGER (Pile 1..5)]│
│      │                                    │                 │
│      └─► [DIRECT_STREAM] (Brain OFF)      ▼                 │
│                                    [DISPATCH_CHUNK]         │
└───────────────────────────────────────────┬─────────────────┘
                                            │ Guard: If Brain in STANDBY
                                            ▼
┌─────────────────────────────────────────────────────────────┐
│ FSM 3: Cognitive Brain (Action Router & Hyprland Dispatcher)│
│ [WAITING_CHUNK] ──► [ACTION_ROUTER] (Thinking :28000)       │
│                            │                                │
│       ┌────────────────────┼────────────────────┐           │
│       ▼                    ▼                    ▼           │
│ [ACTION: WRITE]   [ACTION: HYPRLAND]    [ERROR_RECOVERY]    │
│  (Default text)    (Workspace/Monitors)  (3s Auto-recover)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. The Three State Machines

### **FSM 1: Microphone Stream Gate (`MicrophoneGate`)**
- **Responsibility**: Hardware and software capture gate for the system microphone (`PipeWire` / Logitech Brio 100).
- **States**:
  - `MIC_OFF` *(Dark Gray / Muted)*: Capture muted or inactive.
  - `MIC_ON` *(Light Gray / Streaming)*: Continuous 16kHz PCM audio streaming to FSM 2.
- **Safety**: Dictation will not start if the physical microphone is muted (`is_mic_muted()` via `wpctl`). If muted during an active session, dictation immediately terminates.

---

### **FSM 2: Speech Dictator & Queue Manager (`QueueManager` / `dispatch_to_*`)**
- **Core Principle**: **Manages speech segmentation and queuing, but NEVER generates thoughts.**
- **Unified Audio & Model Pipeline**:
  - Both Stream and Thinking modes share the exact same model (`large-v3-turbo`), greedy decode (`beam_size=1`, `best_of=1`, ~80-120ms decode latency), and natural silence endpointing (`silence_end_sec = 0.8s`).
  - Warmup probe decode is executed upfront during initialization to eliminate cold-start compile freezes.
- **Clean Dual Dispatch Bifurcation**:
  - **`dispatch_to_stream()`** *(Brain OFF)*: Injects recognized speech immediately into the active focused window using `wtype`. Transitions `REC` -> `WRITING` (Green) -> `REC`.
  - **`dispatch_to_thinking()`** *(Brain ON)*: Gathers words in `QueueManager`. Upon detecting natural pause/space boundary (`is_space=True`), pops the consolidated chunk and dispatches all words together to Brain **without client-side analysis**. Transitions Dictator to **Orange** (`PHASE_BUSY` / `DISPATCH_CHUNK`) and immediately returns to `REC`.
- **Critical Dispatch Guard Condition**:
  > **`dispatch_to_thinking()` occurs immediately to FSM 3 if Brain is in `STANDBY`.**
  - If Brain is busy (`THINKING` or `RUNNING`), words safely buffer in `QueueManager` (`pile = 1..5`) with AGS status bar displaying `QUEUED` (Yellow).
  - As soon as Brain completes its action and returns to `STANDBY`, it automatically drains the pending consolidated chunk from `QueueManager`.

---

### **FSM 3: Cognitive Brain (`BrainFSM` & `ActionRouter`)**
- **Core Principle**: **Does NOT manage queues.** Receives a single, clean consolidated chunk, performs cognitive analysis, and dispatches the resolved action.
- **States**:
  - `OFF` *(Dark Gray)*: Brain disabled (`/tmp/dictate_brain_active == "0"`).
  - `WAITING_CHUNK / STANDBY` *(Light Gray)*: Idle, listening for an incoming chunk from FSM 2.
  - `THINKING` *(Green)*: Processing the intent through `ActionRouter` (local LLM on `:28000` or zero-latency fast-path).
  - `RUNNING` *(Orange)*: Executing the resolved action with **Audio Lockout** active (drops incoming microphone frames during execution to prevent typing clicks or acoustic loopback).
  - `ERROR` *(Red)*: Transient failure or timeout; automatically recovers to `STANDBY` after 3.0 seconds, then drains any pending chunks in `QueueManager`.

---

## 3. Cognitive Action Router Specifications

The `ActionRouter` categorizes incoming chunks into two primary tracks:

### **1. Hyprland Desktop Actions & Control Keys**
Executed natively via Hyprland Lua dispatchers (`hyprctl eval`) and direct Wayland input (`wtype`):
- **Workspace Navigation**:
  - `ir al panel 1` / `panel 1` / `workspace 1` / `switch to panel 1`: Switches to Workspace 1 (Vertical ASUS monitor `HDMI-A-2`).
  - `ir al panel 2` / `panel 2` / `workspace 2` / `switch to panel 2`: Switches to Workspace 2.
  - `foco en panel 3` / `panel 3` / `workspace 3` / `foco terminal` / `focus terminal`: Focuses Workspace 3 (Main AGY terminal console).
- **Display & Window Management**:
  - `foco en monitor derecho` / `monitor derecho` / `focus right monitor`: Switches monitor focus to AOC landscape display (`HDMI-A-1`).
  - `foco en panel chromium` / `panel chromium` / `abrir chromium` / `focus chromium`: Focuses the visible Chromium stage window (Workspace 4).
- **Control Keys**:
  - `listo kodex` / `ok kodex` / `dale enter` / `enter` / `press enter`: Presses `Return`.
  - `borra eso` / `borrar` / `backspace` / `delete that`: Presses `Backspace`.
  - `tabular` / `tab`: Presses `Tab`.
  - `escapar` / `escape` / `cancelar`: Presses `Escape`.

### **2. Default Action: Refined Writing with Thinking**
- Spoken text that does not match a navigation or system command is treated as **writing content**.
- Evaluated with the local LLM (:28000) or smart text normalizer to refine punctuation, commas, sentence casing, and clean grammar.
- Typed directly into the target active window using `wtype -s 1 -- <text>`.
- Fully protected by **Audio Lockout** during the entire typing sequence.

---

## 4. Acoustic & Orthographic Filter Pipeline (SOLID / OCP)

To eliminate two pervasive acoustic-streaming artifacts (mid-utterance hesitation dots `...` from Whisper slice boundary predictions and phantom vowel insertions caused by mechanical keyboard switch transients), the service integrates an **Open/Closed Principle (OCP)** filter pipeline:

```
Raw Speech Token / Audio Stream
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│ TextFilterPipeline (f_n ∘ ... ∘ f_1)                        │
│                                                             │
│ 1. AcousticArtifactFilter    [Rejects isolated key clicks]  │
│ 2. HesitationEllipsisFilter  [Strips '...' and '…']         │
│ 3. DuplicatePunctuationFilter[Normalizes ',,' and '..']     │
│ 4. MidSentencePunctuationFilter [Removes pause dots before  │
│                                  lowercase words]           │
│ 5. TrailingPunctuationFilter [Strips trailing '.' on partial│
│                               slices to avoid burned dots]  │
│ 6. PunctuationSpacingFilter  [Enforces RAE typography rules]│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
Clean, Grammatically Sound Normalized Stream / Target Window
```

### **Filter Invariants**
1. **`AcousticArtifactFilter`**: Rejects high-frequency (<30ms) mechanical switch click transients that resonate in the 500 Hz – 2500 Hz spectrum (matching Spanish F1/F2 vowel formants `/a/`, `/e/`, `/o/`). Combined with `MIN_SPEECH_DURATION_SECONDS = 0.25`, mechanical typing is completely isolated from dictation.
2. **`HesitationEllipsisFilter`**: Eliminates decoder cross-attention entropy artifacts (`...`, `…`) generated when speech pauses mid-sentence.
3. **`MidSentencePunctuationFilter`**: Replaces pause-induced full stops (`.\s+[a-z]`) with clean whitespace, preserving genuine sentence boundaries where capitalized words follow.
4. **`TrailingPunctuationFilter`**: Prevents unidirectional `wtype` append-only typing from permanently burning intermediate Whisper trailing periods into active editor buffers during live streaming.
5. **`PunctuationSpacingFilter`**: Enforces strict Spanish typographic spacing around punctuation (`¿`, `?`, `¡`, `!`, `,`, `.`).

### **Extending Filters Without Touching Code (Zero Code Modifications)**
The system adheres to the Open/Closed Principle (OCP) at the configuration and runtime layer via `FilterRegistry` and `RegexFilterRule`. End users can add, toggle, or remove filters declaratively without modifying Python code:

1. **Declarative Configuration File (`~/.config/voice-dictation/filters.json`)**:
   Add custom regular expression transformation rules directly into the JSON configuration:
   ```json
   {
     "name": "censor_filler_words",
     "description": "Strips verbal hesitation fillers",
     "pattern": "\\b(eh|este|o sea)\\b",
     "action": "replace",
     "replacement": "",
     "flags": ["IGNORECASE"],
     "pipeline": "both",
     "enabled": true
   }
   ```

2. **CLI Dynamic Filter Management**:
   ```bash
   dictate filter list                             # Display all active filters and status
   dictate filter add <name> <pattern> [repl]      # Add a new regex rule dynamically
   dictate filter remove <name>                    # Remove a filter by name
   dictate filter test "<sample text>"             # Test transformations on arbitrary text
   dictate filter reload                           # Hot-reload filters from JSON
   ```

---

## 5. Dynamic STT Backend & VRAM Router (Strategy Pattern)

To ensure smooth operation on resource-constrained setups (such as an NVIDIA RTX 2060 SUPER with 8 GB VRAM while running GPU-intensive games like *Hell Let Loose* taking ~4.1 GB), the service implements an **Adaptive STT Strategy Router** (`STTRouter`):

```
┌─────────────────────────────────────────────────────────────┐
│ VRAMMonitor (nvidia-smi Telemetry: used_mb, total_mb, free) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ STTRouter: Dynamic Strategy Selector                        │
│                                                             │
│ Trigger: Occupied VRAM > 2048 MiB (2.0 GB)?                 │
│                                                             │
│   ├── [YES: GPU BUSY / GAMING / COMFYUI ACTIVE]             │
│   │   └── FasterWhisperBackend (CPU int8, 0 MiB VRAM)       │
│   │       ⚡ Notification: "⚠️ STT on CPU (4850M used > 2G)"│
│   │                                                         │
│   └── [NO: GPU IDLE / DESKTOP AVAILABLE]                    │
│       └── FasterWhisperBackend (CUDA float16, 1800 MiB VRAM)│
│           (or Qwen3ASRBackend if configured)                │
│           ⚡ Notification: "⚡ STT on GPU (whisper-cuda)"   │
└─────────────────────────────────────────────────────────────┘
```

### **Routing Invariants & Behavior**
1. **The 2GB Occupied Trigger**:
   - Monitored live via `VRAMMonitor.get_telemetry()`.
   - If `used_mb > 2048 MiB` (default trigger, configurable via `dictate backend trigger <mb>` or `DICTATE_VRAM_TRIGGER_MB`), the system detects an active gaming or high-load process and **strictly routes STT away from GPU** to CPU `int8`.
   - When GPU load drops below the threshold, the router automatically re-engages GPU acceleration (`CUDA float16`).
2. **Immediate Transition Alerts ("pero avisa")**:
   - The desktop environment receives instant visual feedback (`notify()`) when the backend swaps between GPU and CPU.
   - Previous backend models are gracefully unloaded (`unload()`) and memory reclaimed (`torch.cuda.empty_cache()` + `gc.collect()`).
3. **Pluggable Strategies (Open/Closed Principle)**:
   - `FasterWhisperBackend`: High-speed CTranslate2 engine (`cuda` float16 or `cpu` int8).
   - `Qwen3ASRBackend`: Causal speech LLM engine (supports direct execution or isolated Python 3.12 bridge).
   - Easy extension to new models (SenseVoice, Moonshine) by implementing `STTBackend`.

---

## 6. AGS Status Bar Integration & Color Palette

The desktop UI reflects state via two synchronized widgets in Aylur's GTK Shell (AGS):
- **Dictator Bubble (`DictatorIndicator.tsx`)**: Polling `/tmp/dictate_state.json`.
- **Local Brain Indicator (`LocalLlm.tsx`)**: Polling `/tmp/brain_state.json`.

| State | Color Tone | Dictator (FSM 2) | Brain (FSM 3) |
|---|---|---|---|
| **OFF** | Dark Gray (`#a0a0a0`, 20%) | Session ended / Muted | Brain disabled |
| **STANDBY** | Light Gray (`#9a9a9a`, 55%) | Listening for voice presence | Idle waiting for chunk |
| **ACTIVE / THINKING** | Light Green (`#7bc96f`, 100%) | Voice active (`ACCUMULATING`) | Cognitive Router thinking |
| **QUEUED** | Amber Yellow (`#e6b84d`, 100%) | - | Chunks buffered in QueueManager (Pile 1..5) |
| **RUNNING / DISPATCH**| Orange (`#ff8c42`, 100%) | Emitting chunk | Executing action (Audio Lockout) |
| **ERROR** | Bright Red (`#e53935`, 100%) | System error | Timeout / Offline (3s auto-recover) |

---

## 7. 4-Tier Concurrent FSM Logging Subsystem & Deterministic Rotation

To ensure complete observability and post-mortem tracing across asynchronous worker threads and child processes without lock contention or log tearing, the service implements a **4-tier POSIX-atomic concurrent logging architecture** (`ConcurrentRotatingFileLogger` and `FSMLogManager`):

```
┌─────────────────────────────────────────────────────────────┐
│ 3 Independent FSM State Engines                             │
│  ├── FSM 1: Microphone Stream Gate                          │
│  ├── FSM 2: Speech Dictator & Queue Manager                 │
│  └── FSM 3: Cognitive Brain & Action Router                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ fsm1_mic_gate.log│ │fsm2_dictator_que.│ │fsm3_cogn_brain.  │
│ [State Changes]  │ │[State & Chunks]  │ │[Actions & Errors]│
└──────────┬───────┘ └─────────┬────────┘ └─────────┬────────┘
           │                   │                    │
           └───────────────────┼────────────────────┘
                               ▼
            ┌────────────────────────────────────────┐
            │ fsm_unified_trajectory.log             │
            │ (Consolidated Macro-State Vector Path) │
            │ seq=128 path=[MIC_ON|REC|STANDBY]      │
            └────────────────────────────────────────┘
```

### **Logging Invariants & Design Principles**
1. **Four Dedicated Append-Only Streams**:
   - `fsm1_mic_gate.log`: Hardware capture gate state transitions (`MIC_OFF`, `MIC_ON`, `MIC_ON(LOCKOUT)`), volume levels, and mute interrupts.
   - `fsm2_dictator_queue.log`: Utterance accumulation, VAD triggering, chunk piling (`QUEUE_MANAGER (pile=N)`), and dispatch events.
   - `fsm3_cognitive_brain.log`: Cognitive action lifecycle (`OFF`, `STANDBY`, `THINKING`, `QUEUED`, `RUNNING`, `ERROR`) and LLM dispatch timings.
   - `fsm_unified_trajectory.log`: Global chronological event stream tracking composite macro-state vector transitions (`path: [FSM1: ... | FSM2: ... | FSM3: ...]`) with monotonic sequence numbers (`seq=N`) and ISO 8601 millisecond timestamps.
2. **POSIX Atomic Append & Concurrency Safety**:
   - Combines Python `threading.RLock()` for intra-process thread safety with Linux `fcntl.flock(LOCK_EX)` and standard `O_APPEND` filesystem semantics for multi-process concurrency.
   - Zero tearing, corruption, or interleaved lines under high-throughput concurrent load.
3. **Deterministic Rotation**:
   - Size-bounded rotation (`max_bytes = 5 MiB`, `backup_count = 5`) moving `.log` -> `.log.1` -> `.log.2` -> ... -> `.log.N`.
   - Backward compatible: `/tmp/dictate.log` is maintained as a symbolic link pointing to `~/.local/state/voice-dictation/logs/fsm_unified_trajectory.log`.
4. **Native Linux `logrotate` Compatibility**:
   - Standard `/home/kodex/.config/voice-dictation/voice-dictation.logrotate` provided for system logrotate daemons using `copytruncate`.

---

## 8. CLI Reference

The service is managed through `dictate` (`~/.local/bin/dictate` or `kdx-dictator`):

```bash
# Toggle dictation session on/off (bound to Super+D in Hyprland)
dictate toggle

# Direct start/stop/stream
dictate start
dictate stop
dictate stream

# Cognitive Brain controls
dictate brain toggle      # Toggle Brain mode ON/OFF
dictate brain on          # Enable Brain mode
dictate brain off         # Disable Brain mode (Pure dictation stream)
dictate brain status      # Print FSM 3 snapshot JSON

# Parameters
dictate timeout [seconds] # View or set silence endpointing threshold (default 1.5s)
dictate enter [on|off]    # Toggle automatic trailing Enter key on final utterance
dictate timed             # 5s fixed test recording
dictate status            # Print complete runtime SSOT snapshot

# STT Backend & VRAM Router
dictate backend status    # View GPU telemetry, active routed backend, and trigger state
dictate backend set <mode># Override mode (auto | whisper-cuda | whisper-cpu | qwen3-asr)
dictate backend trigger <mb> # Set occupied VRAM threshold in MiB (default: 2048)
dictate backend test      # Simulate router decision against live VRAM metrics
dictate backend list      # List registered backend strategies and availability

# Declarative Filters (Zero Code Modification)
dictate filter list       # Print table of active regex rules
dictate filter add <name> <pattern> [repl] # Add rule dynamically
dictate filter remove <name>               # Remove rule dynamically
dictate filter test "<text>"               # Test transformations on arbitrary text
dictate filter reload     # Reload filters from JSON

# 4-Tier FSM Logging Subsystem
dictate log status        # Inspect log files, sizes, active macro-state, and rotation limits
dictate log tail [target] # Tail stream in real-time (target: fsm1, fsm2, fsm3, or general)
dictate log rotate        # Force immediate deterministic rotation on all managed log files
dictate log path [target] # Print absolute path to specified log file or log directory
```

---

## 9. Architecture Diagrams

The interactive, showcase-validated architecture specification is delivered at:
- **Interactive HTML**: [`voice-fsm-graphs.html`](voice-fsm-graphs.html)
- **JSON Specification**: [`voice-fsm-graphs.architecture.json`](voice-fsm-graphs.architecture.json)

