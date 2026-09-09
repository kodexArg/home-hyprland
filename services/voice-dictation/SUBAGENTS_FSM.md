# FSM Node Architecture — Voice System (Microphone, Dictator & Cognitive Brain)

This document specifies the formal decoupled architecture, Single Responsibility Principle (SRP) domain boundaries, and inter-node communication contracts for the three core nodes of the Linux Hyprland / Debian SID voice dictation ecosystem: **`mic-dict-brain`**.

---

## 1. Architectural Philosophy & Node Roles

1. **Node 1: Microphone Stream Gate (`vox-microphone`)**:
   - **Hardware Essence**: Acts as the physical and software audio capture gate.
   - **Domain**: PipeWire / WirePlumber (`wpctl`), 16kHz PCM audio stream output, and hardware mute detection.
   - **Safety Contract**: Capture immediately halts if the system microphone is muted in PipeWire (`is_mic_muted()`).

2. **Node 2: Speech Dictator & Queue Manager (`vox-dictator`)**:
   - **Real-Time Passthrough**: Powered by `faster-whisper` on NVIDIA GPU (`float16` CUDA).
   - **Zero Thought Generation**: Does not invoke cognitive reasoning, execute LLM thinking loops, or backspace characters. Streams forward directly into the focused window using `wtype`.
   - **Queue Manager**: When Cognitive Brain mode is enabled, it buffers and concatenates utterances into a thread-safe pile (`pile = 1..5`) without reflection.
   - **Observer Event Tap**: Atomically publishes the latest speech chunk to `/tmp/dictate_last_chunk.json` for asynchronous sidecars, hooks, and external tooling.

3. **Node 3: Cognitive Brain (`vox-brain`)**:
   - **1-Click Modular Sidecar**: Enabled on-demand via the desktop AGS bar (`LocalLlm`) or CLI (`dictate brain toggle`).
   - **Queue-Free Consumer**: Does not manage speech buffers or slicing. Receives a single consolidated chunk from `QueueManager` only when in `STANDBY`.
   - **Strict Action Routing**:
     - **Hyprland Workspace & Focus**: Emits native Lua window dispatchers (`hl.dispatch(hl.dsp.focus({...}))` via `hyprctl eval`).
     - **Key Commands**: Emits immediate keystrokes (`Return`, `Backspace`, `Tab`, `Escape`).
     - **Default Writing with Thinking**: Enriches spoken text with punctuation, capitalization, and formatting via local LLM (:28000), protected by Audio Lockout.
     - **Automatic Queue Drain**: Upon returning to `STANDBY`, immediately drains any chunks accumulated in `QueueManager` while busy.

---

## 2. Topology & Data Pipeline

```mermaid
graph LR
    subgraph Hardware [1. Hardware Stream Gate]
        MIC[🎙️ vox-microphone<br/>16kHz PCM Stream / wpctl Gate]
    end

    subgraph Dictator [2. Speech Dictator & Queue Engine]
        DICT[⚡ vox-dictator<br/>Faster-Whisper CUDA FP16<br/>Zero Thought]
        QUEUE[📦 QueueManager<br/>Thread-Safe Pile 1..5]
        STREAM_WIN[💻 Focused Window<br/>wtype Live Stream (Brain OFF)]
    end

    subgraph Cognitive [3. Cognitive Brain Sidecar]
        TAP[(📄 Observer Tap<br/>/tmp/dictate_last_chunk.json)]
        BRAIN{🧠 vox-brain<br/>ActionRouter :28000}
        EXEC_HYPR[🖥️ hyprctl eval<br/>Workspaces & Windows]
        EXEC_KEY[⌨️ wtype -k<br/>Control Keystrokes]
        EXEC_WRITE[✍️ wtype -s 1<br/>Refined Writing]
    end

    MIC -->|PCM Audio Frames| DICT
    DICT -->|Brain OFF Live Delta| STREAM_WIN
    DICT -->|Utterance Chunk| QUEUE
    DICT -.->|Observer Event| TAP
    QUEUE -->|If Brain in Standby| BRAIN
    BRAIN -->|Hyprland Action| EXEC_HYPR
    BRAIN -->|Key Action| EXEC_KEY
    BRAIN -->|Default Writing| EXEC_WRITE

    classDef hw fill:#2a2d37,stroke:#5c6370,stroke-width:2px,color:#fff;
    classDef st fill:#1e3a29,stroke:#50a14f,stroke-width:2px,color:#fff;
    classDef cog fill:#3e2723,stroke:#d19a66,stroke-width:2px,color:#fff;
    class MIC hw;
    class DICT,QUEUE,STREAM_WIN st;
    class TAP,BRAIN,EXEC_HYPR,EXEC_KEY,EXEC_WRITE cog;
```

---

## 3. Finite State Machines (FSM)

### 3.1 Node 1: `vox-microphone` (Hardware Stream Gate)

```
[MIC_OFF Muted] ◄────(Super+D / wpctl mute)────► [MIC_ON Streaming]
                                                        │
                                                 (16kHz PCM Frames)
                                                        ▼
                                             (Towards vox-dictator)
```

- **`MIC_OFF`**: Hardware capture silenced in WirePlumber.
- **`MIC_ON`**: Active 16kHz audio stream delivering PCM chunks to the speech dictator.

### 3.2 Node 2: `vox-dictator` (Speech Dictator & Queue Manager)

```
[IDLE] ──(Super+D)──► [ARMING] ──► [STANDBY / REC]
  ▲                                       │
  │                              (Voice Detected)
  │                                       ▼
  │                        ┌──────────────┴──────────────┐
  │                 (Brain OFF)                     (Brain ON)
  │                        ▼                             ▼
  │                 [DIRECT_STREAM]                [ACCUMULATING]
  │                 (wtype Live)                         │
  │                        │                       (1.5s Silence)
  │                        ▼                             ▼
  │                 [STANDBY / REC]               [QUEUE_MANAGER]
  │                                                (Pile 1..5)
  │                                                      │
  │                                           (If Brain is STANDBY)
  │                                                      ▼
  │                                               [DISPATCH_CHUNK]
  │                                                      │
  └───────(Super+D / Stop)◄──────────────────────────────┘
```

- **`IDLE`**: Service inactive, zero background resource consumption.
- **`ARMING`**: Worker process initialization, target active window resolution.
- **`STANDBY / REC`**: Passive listening in circular pre-roll buffer (400ms, <50KB RAM, 0% GPU).
- **`DIRECT_STREAM`**: Brain disabled (`is_brain_active() == False`). Emits token deltas directly into active window.
- **`ACCUMULATING`**: Brain enabled. Accumulates voice PCM frames until silence endpoint is detected.
- **`QUEUE_MANAGER`**: Transcribes utterance on Faster-Whisper GPU, pushes chunk to pile (1..5), and concatenates text.
- **`DISPATCH_CHUNK`**: Emits consolidated chunk to Cognitive Brain only if Brain is in `STANDBY`.

### 3.3 Node 3: `vox-brain` (Cognitive Brain & Action Router)

```
[OFF] ◄────(Click Brain / dictate brain toggle)────► [STANDBY] ◄────────────────┐
                                                        │                        │
                                                (Chunk Dispatched)               │
                                                        ▼                        │
                                                [ACTION_ROUTER]                  │
                                                 (Thinking :28000)               │
                                                        │                        │
                                      ┌─────────────────┼─────────────────┐      │
                                      ▼                 ▼                 ▼      │
                                 [WRITE]           [HYPRLAND]          [ERROR]   │
                                 Refined Text      Workspaces/Monitor  3s Recover│
                                      │                 │                 │      │
                                      └─────────────────┴─────────────────┴──────┘
```

- **`OFF`**: Brain disabled (`/tmp/dictate_brain_active = 0`). Dark gray icon in AGS bar.
- **`STANDBY`**: Brain listening and ready for incoming chunk (`/tmp/brain_state.json -> standby`). Light gray icon.
- **`ACTION_ROUTER`**: Evaluating intent via local LLM (:28000) or zero-latency regex fast-path (`thinking`). Green icon.
- **`RUNNING`**: Executing resolved action with Audio Lockout active (`running`). Orange icon.
- **`ERROR`**: Transient error or timeout. Automatically self-recovers to `STANDBY` after 3.0 seconds (`error`). Red icon.

---

## 4. CLI Control Interface

- `dictate toggle` (or `Super + D`): Starts or stops continuous dictation session.
- `dictate brain toggle`: Toggles Cognitive Brain mode ON / OFF.
- `dictate brain [on|off|status]`: Direct state control and inspection of FSM 3.
- `dictate timeout [seconds]`: Gets or sets silence cutoff threshold (default: 1.5s).
- `dictate enter [on|off|toggle|status]`: Configures automatic trailing Enter injection.
- `dictate timed`: Records a 5-second fixed sample for testing and verification.
- `dictate status`: Emits complete runtime SSOT snapshot in JSON.
