# Voice Dictation & Cognitive Brain (`mic-dict-brain`)

Continuous voice dictation and cognitive assistant service on Debian SID / Hyprland Wayland with NVIDIA GPU acceleration.

- **Directory**: `~/Services/voice-dictation`
- **Python Environment**: `~/Services/voice-dictation/.venv` (`uv`)
- **STT**: `faster-whisper` (`whisper-large-v3-turbo` on CUDA `float16`) — cached model per continuous session
- **LLM Cognitive Router**: `http://127.0.0.1:28000/v1` (`local-llm.service`) — minimal punctuation refinement + action router
- **Key & Text Injection**: `wtype` directly to focused window (`wl-copy` clipboard backup)
- **CLI Wrappers**: `dictate` and `kdx-dictator`

## Product & Hardware Microphone Contract

| State / Rule | Operational Behavior |
|---|---|
| **Microphone Muted (`[MUTED]`)** | **Dictation CANNOT be started**. `cmd_start`, `cmd_cycle`, and AGS widget block initiation with notification. |
| **Microphone Muted While Dictating** | **Dictation SHUTS OFF immediately**. Worker terminates the loop within 150ms, discards partial audio, and returns to `idle`. |
| **Microphone Unmuted** | **Dictation can be toggled** at user discretion via `Super+D` or AGS bar click. |
| **Dictation ON + Silence (No Speech)** | **Zero waste**: Pre-roll circular ring buffer (400ms), flat memory (<50KB), 0% GPU. Faster-Whisper is idle until voice is detected. |
| **Dictation ON + Speech Detected** | **Natural cadence streaming**: Silence threshold (default 1.5s, configurable) auto-commits speech chunk, executes actions or streams text. |

## Decoupled 3-Tier FSM Architecture

1. **Node 1: Microphone Stream Gate (`vox-microphone`)**:
   - Hardware capture gate via WirePlumber (`wpctl get-volume @DEFAULT_AUDIO_SOURCE@`).
   - States: `MIC_OFF` (Muted) <-> `MIC_ON` (16kHz PCM streaming).

2. **Node 2: Speech Dictator & Queue Manager (`vox-dictator`)**:
   - Manages Silero VAD speech segmentation and Faster-Whisper GPU transcription.
   - Brain OFF: `DIRECT_STREAM` forward typing character-by-character into focused window via `wtype`.
   - Brain ON: `ACCUMULATING` raw PCM frames, transcribed upon silence endpoint and pushed into `QueueManager` (`pile = 1..5`).
   - Dispatches chunk to Brain ONLY IF Brain is in `STANDBY`.

3. **Node 3: Cognitive Brain (`vox-brain`)**:
   - Action Router receiving a single consolidated chunk without queue overhead.
   - Evaluates intent: Hyprland workspace/window dispatchers (`hyprctl eval`), control keys (`wtype -k`), or default refined writing (`wtype -s 1`).
   - Audio Lockout: Drops incoming microphone frames during action execution (`RUNNING`, orange).
   - Auto-Recovery: 3.0s timeout to `STANDBY` on error. Automatically drains pending chunks in `QueueManager` upon returning to `STANDBY`.

## Runtime SSOT Files

| Path | Purpose |
|---|---|
| `/tmp/dictate_state.json` | SSOT state snapshot for FSM 2 |
| `/tmp/dictate_active` | Mirror phase word (AGS legacy/fast-poll) |
| `/tmp/dictate_brain_active` | Cognitive Brain enable flag (`1` or `0`) |
| `/tmp/brain_state.json` | FSM 3 Cognitive Brain state snapshot |
| `/tmp/dictate_last_chunk.json` | Observer Event Tap for external tools and hooks |
| `/tmp/dictate.pid` | Worker process PID |
| `/tmp/dictate_stop` | IPC stop signal (`toggle` / `max` / `force`) |
| `/tmp/dictate.log` | Worker standard output and error log |

## Keyboard Shortcuts (`~/.config/hypr/hyprland.lua`)

- **`Super + D`**: `dictate toggle` (Toggles continuous dictation session).
- Debounce guard: **1.0s**.
