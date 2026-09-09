#!/usr/bin/env python3
from __future__ import annotations

import abc
import collections
import ctypes
from dataclasses import dataclass
from datetime import datetime
import fcntl
import gc
import glob
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from typing import Any, ClassVar

STATE_FILE = "/tmp/dictate_state.json"
FLAG_FILE = "/tmp/dictate_active"
MODE_FILE = "/tmp/dictate_mode"
PID_FILE = "/tmp/dictate.pid"
STOP_FILE = "/tmp/dictate_stop"
LOG_FILE = "/tmp/dictate.log"
LOG_DIR = os.getenv("DICTATE_LOG_DIR", os.path.expanduser("~/.local/state/voice-dictation/logs"))
FSM1_LOG_PATH = os.path.join(LOG_DIR, "fsm1_mic_gate.log")
FSM2_LOG_PATH = os.path.join(LOG_DIR, "fsm2_dictator_queue.log")
FSM3_LOG_PATH = os.path.join(LOG_DIR, "fsm3_cognitive_brain.log")
FSM_GENERAL_LOG_PATH = os.path.join(LOG_DIR, "fsm_unified_trajectory.log")
DEFAULT_LOG_MAX_BYTES = 5 * 1024 * 1024  # 5 MiB
DEFAULT_LOG_BACKUP_COUNT = 5
BRAIN_ACTIVE_FILE = "/tmp/dictate_brain_active"
LAST_CHUNK_FILE = "/tmp/dictate_last_chunk.json"
BRAIN_STATE_FILE = "/tmp/brain_state.json"
THINKING_FILE = f"{os.getenv('XDG_RUNTIME_DIR', '/run/user/1000')}/local-llm-thinking"

CONFIG_DIR = os.path.expanduser("~/.config/voice-dictation")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")

DEFAULT_SILENCE_END_SECONDS = 0.45
DEFAULT_AUTO_ENTER = True
DEFAULT_BACKEND_MODE = "auto"
DEFAULT_VRAM_OCCUPIED_TRIGGER_MB = 2048
DEFAULT_PREFERRED_GPU_BACKEND = "whisper-cuda"

SAMPLE_RATE = 16000
LLM_URL = "http://127.0.0.1:28000/v1"
TIMED_DURATION_SEC = 5.0
MAX_RECORD_SECONDS = 300.0
MIN_RECORD_SECONDS = 0.15
BOUNCE_GUARD_SECONDS = 1.0
POLL_INTERVAL_SECONDS = 0.05
PRE_ROLL_SECONDS = 0.40
NOISE_CALIBRATION_SECONDS = 0.35
MIN_SPEECH_DURATION_SECONDS = 0.10
SPEECH_RMS_FLOOR = 0.020
SILENCE_RMS_FLOOR = 0.010
FOCUS_SETTLE_SECONDS = 0.20
PASTE_SETTLE_MILLISECONDS = 150
PASTE_ENTER_DELAY_MILLISECONDS = 120
RESULT_FLASH_SECONDS = 0.45
SESSION_END_FLASH_SECONDS = 1.0
MAX_QUEUE_PILE_SIZE = 5

NO_SPEECH_PROBABILITY_THRESHOLD = 0.80
MINIMUM_AVERAGE_LOGPROBABILITY = -1.60
HALLUCINATIONS = frozenset({
    "gracias",
    "thank you",
    "thanks",
    "thanks for watching",
    "gracias por ver el video",
    "gracias por ver",
    "subtítulos por la comunidad de amara.org",
    "subtitles by the amara.org community",
    "subs by www.amara.org",
})

PHASE_IDLE = "idle"
PHASE_ARMING = "arming"
PHASE_LOADING = "loading"
PHASE_REC = "rec"
PHASE_WRITING = "writing"
PHASE_LISTENING = "listening"
PHASE_THINKING = "thinking"
PHASE_BUSY = "busy"
PHASE_STOPPING = "stopping"
PHASE_STT = "stt"
PHASE_REFINE = "refine"
PHASE_PASTE = "paste"
PHASE_OK = "ok"
PHASE_ERR = "err"

ALL_PHASES = frozenset({
    PHASE_IDLE, PHASE_ARMING, PHASE_LOADING, PHASE_REC, PHASE_WRITING, PHASE_LISTENING,
    PHASE_THINKING, PHASE_BUSY, PHASE_STOPPING, PHASE_STT, PHASE_REFINE,
    PHASE_PASTE, PHASE_OK, PHASE_ERR,
})

PHASES_BUSY = frozenset({
    PHASE_LOADING, PHASE_STOPPING, PHASE_STT, PHASE_REFINE, PHASE_PASTE, PHASE_OK,
    PHASE_ERR, PHASE_BUSY, PHASE_THINKING,
})

PHASES_CAN_STOP = frozenset({
    PHASE_ARMING, PHASE_LOADING, PHASE_REC, PHASE_WRITING, PHASE_LISTENING,
})

PHASES_WORKER = frozenset({
    PHASE_ARMING, PHASE_LOADING, PHASE_REC, PHASE_WRITING, PHASE_LISTENING, PHASE_THINKING,
    PHASE_STOPPING, PHASE_STT, PHASE_REFINE, PHASE_PASTE, PHASE_BUSY,
})

UI_PROJECTIONS: dict[str, dict[str, Any]] = {
    PHASE_IDLE:      {"label": "",       "class": "idle",      "visible": False, "tooltip": ""},
    PHASE_ARMING:    {"label": "LOAD",   "class": "loading",   "visible": True,  "tooltip": "🔴 Inicializando stream y cargando modelo…"},
    PHASE_LOADING:   {"label": "LOAD",   "class": "loading",   "visible": True,  "tooltip": "🔴 Cargando modelo STT en GPU (Whisper CUDA)…"},
    PHASE_REC:       {"label": "REC",    "class": "rec",       "visible": True,  "tooltip": "🎙️ Listening — silence auto-commits; Super+D stops"},
    PHASE_WRITING:   {"label": "STREAM", "class": "writing",   "visible": True,  "tooltip": "🎙️ Live dictation streaming…"},
    PHASE_LISTENING: {"label": "HEAR",   "class": "listening", "visible": True,  "tooltip": "🎙️ Listening to utterance…"},
    PHASE_THINKING:  {"label": "···",    "class": "thinking",  "visible": True,  "tooltip": "🟠 Utterance complete — dispatching to Brain…"},
    PHASE_BUSY:      {"label": "···",    "class": "busy",      "visible": True,  "tooltip": "🟠 Message endpoint detected — processing…"},
    PHASE_STOPPING:  {"label": "···",    "class": "stopping",  "visible": True,  "tooltip": "⏹ Finalizing utterance…"},
    PHASE_STT:       {"label": "STT",    "class": "stt",       "visible": True,  "tooltip": "⚡ Transcribing on GPU…"},
    PHASE_REFINE:    {"label": "LLM",    "class": "refine",    "visible": True,  "tooltip": "✨ Cognitive refining…"},
    PHASE_PASTE:     {"label": "OUT",    "class": "paste",     "visible": True,  "tooltip": "📤 Injecting text…"},
    PHASE_OK:        {"label": "OK",     "class": "ok",        "visible": True,  "tooltip": "✅ Text dispatched"},
    PHASE_ERR:       {"label": "ERR",    "class": "err",       "visible": True,  "tooltip": "⚠️ Failure — check /tmp/dictate.log"},
}

TRANSITIONS: dict[str, frozenset[str]] = {
    PHASE_IDLE:      frozenset({PHASE_ARMING, PHASE_LOADING}),
    PHASE_ARMING:    frozenset({PHASE_LOADING, PHASE_REC, PHASE_WRITING, PHASE_LISTENING, PHASE_STOPPING, PHASE_ERR, PHASE_IDLE}),
    PHASE_LOADING:   frozenset({PHASE_REC, PHASE_STOPPING, PHASE_ERR, PHASE_IDLE}),
    PHASE_REC:       frozenset({PHASE_WRITING, PHASE_LISTENING, PHASE_STOPPING, PHASE_ERR, PHASE_BUSY}),
    PHASE_WRITING:   frozenset({PHASE_REC, PHASE_STOPPING, PHASE_ERR, PHASE_OK}),
    PHASE_LISTENING: frozenset({PHASE_THINKING, PHASE_REC, PHASE_STOPPING, PHASE_ERR}),
    PHASE_THINKING:  frozenset({PHASE_REC, PHASE_STOPPING, PHASE_ERR, PHASE_OK}),
    PHASE_BUSY:      frozenset({PHASE_REC, PHASE_STT, PHASE_STOPPING, PHASE_IDLE, PHASE_ERR}),
    PHASE_STOPPING:  frozenset({PHASE_STT, PHASE_ERR, PHASE_OK, PHASE_REC, PHASE_BUSY, PHASE_IDLE}),
    PHASE_STT:       frozenset({PHASE_REFINE, PHASE_PASTE, PHASE_ERR, PHASE_OK}),
    PHASE_REFINE:    frozenset({PHASE_PASTE, PHASE_ERR, PHASE_OK}),
    PHASE_PASTE:     frozenset({PHASE_OK, PHASE_ERR}),
    PHASE_OK:        frozenset({PHASE_IDLE, PHASE_ARMING, PHASE_LOADING, PHASE_REC, PHASE_STOPPING}),
    PHASE_ERR:       frozenset({PHASE_IDLE, PHASE_ARMING, PHASE_LOADING, PHASE_REC, PHASE_STOPPING}),
}

VERBAL_ENTER_TAIL_REGEX = re.compile(
    r"""(?ix)
    [\s,.;:¡!¿?…-]*
    (?:
        (?:listo|ok|okay)\s*,?\s*kodex
      | (?:y\s+)?(?:dale\s+|con\s+)?enter
      | con\s+(?:un\s+)?enter(?:\s+al\s+final)?
      | (?:peg[aá]|mand[aá]|envi[aá]|ingres[aá]|met[eé])\s+
            (?:esto\s+|esta\s+(?:l[ií]nea\s+)?|la\s+(?:l[ií]nea\s+)?)?
            (?:con\s+)?(?:un\s+)?enter(?:\s+al\s+final)?
      | (?:enviar|submit|mandar|envialo)
      | nueva\s+l[ií]nea
      | enter\s+final
      | press\s+enter
      | send\s+message
    )
    [\s.!?…]*$
    """
)

VERBAL_ENTER_ONLY_REGEX = re.compile(
    r"(?ix)^\s*(?:(?:listo|ok|okay)\s*,?\s*kodex|(?:dale\s+|con\s+)?enter|press\s+enter|submit)\s*[.!?…,]*\s*$"
)

SCRIPT_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CUDA_LIBRARIES_PRELOADED = False
CACHED_WHISPER_MODEL = None
STOP_REQUESTED_STATE = {"flag": False}

SNAPSHOT_CACHE: dict[str, Any] = {
    "v": 1,
    "phase": PHASE_IDLE,
    "phase_since": 0.0,
    "pid": None,
    "target_address": None,
    "target_title": None,
    "started_at": None,
    "rec_started_at": None,
    "stop_reason": None,
    "detail": "",
    "ui": UI_PROJECTIONS[PHASE_IDLE],
}


def load_config() -> dict[str, Any]:
    configuration: dict[str, Any] = {
        "silence_sec": DEFAULT_SILENCE_END_SECONDS,
        "auto_enter": DEFAULT_AUTO_ENTER,
        "backend_mode": DEFAULT_BACKEND_MODE,
        "vram_occupied_trigger_mb": DEFAULT_VRAM_OCCUPIED_TRIGGER_MB,
        "preferred_gpu_backend": DEFAULT_PREFERRED_GPU_BACKEND,
        "notify_on_router_switch": True,
        "max_continuous_speech_sec": 6.0,
        "strip_intermediate_dots": True,
        "auto_lowercase_continuation": True,
    }
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8") as file:
                saved_configuration = json.load(file)
                if isinstance(saved_configuration, dict):
                    configuration.update(saved_configuration)
    except (OSError, json.JSONDecodeError):
        pass

    if "DICTATE_SILENCE_SEC" in os.environ:
        try:
            configuration["silence_sec"] = max(0.2, float(os.environ["DICTATE_SILENCE_SEC"]))
        except ValueError:
            pass

    if "DICTATE_AUTO_ENTER" in os.environ:
        configuration["auto_enter"] = os.environ["DICTATE_AUTO_ENTER"].strip().lower() in ("1", "true", "yes", "on")

    if "DICTATE_BACKEND_MODE" in os.environ:
        configuration["backend_mode"] = os.environ["DICTATE_BACKEND_MODE"].strip().lower()

    if "DICTATE_VRAM_TRIGGER_MB" in os.environ:
        try:
            configuration["vram_occupied_trigger_mb"] = int(os.environ["DICTATE_VRAM_TRIGGER_MB"])
        except ValueError:
            pass

    return configuration


def save_config(configuration: dict[str, Any]) -> None:
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        temporary_file = f"{CONFIG_FILE}.tmp.{os.getpid()}"
        with open(temporary_file, "w", encoding="utf-8") as file:
            json.dump(configuration, file, indent=2)
        os.replace(temporary_file, CONFIG_FILE)
    except OSError as error:
        print(f"[dictate.py] configuration save error: {error}", flush=True)


def get_silence_end_sec() -> float:
    return float(load_config().get("silence_sec", DEFAULT_SILENCE_END_SECONDS))


def set_silence_end_sec(seconds: float) -> None:
    configuration = load_config()
    configuration["silence_sec"] = max(0.2, float(seconds))
    save_config(configuration)


def get_auto_enter() -> bool:
    return bool(load_config().get("auto_enter", DEFAULT_AUTO_ENTER))


def set_auto_enter(enabled: bool) -> None:
    configuration = load_config()
    configuration["auto_enter"] = bool(enabled)
    save_config(configuration)


def read_mode() -> str:
    try:
        if os.path.exists(MODE_FILE):
            with open(MODE_FILE, "r", encoding="utf-8") as file:
                mode = file.read().strip().lower()
                if mode in ("stream", "direct", "off"):
                    return mode
    except OSError:
        pass
    return "stream"


def write_mode(mode: str) -> None:
    try:
        with open(MODE_FILE, "w", encoding="utf-8") as file:
            file.write(mode)
    except OSError:
        pass


def is_brain_active() -> bool:
    try:
        if os.path.exists(BRAIN_ACTIVE_FILE):
            with open(BRAIN_ACTIVE_FILE, "r", encoding="utf-8") as file:
                return file.read().strip() == "1"
    except OSError:
        pass
    return False


def set_brain_active(active: bool) -> None:
    try:
        with open(BRAIN_ACTIVE_FILE, "w", encoding="utf-8") as file:
            file.write("1" if active else "0")
    except OSError:
        pass


def toggle_brain_active() -> bool:
    new_active_state = not is_brain_active()
    set_brain_active(new_active_state)
    if new_active_state:
        notify("🧠 Cognitive Brain active: listening for dictation chunks", "process-working-symbolic")
    else:
        notify("🧠 Cognitive Brain deactivated", "process-stop-symbolic")
    print(f"[dictate.py] brain active set to {new_active_state}", flush=True)
    return new_active_state


def is_mic_muted() -> bool:
    try:
        result = subprocess.run(
            ["wpctl", "get-volume", "@DEFAULT_AUDIO_SOURCE@"],
            capture_output=True,
            text=True,
            check=False,
            timeout=0.25,
        )
        return "[MUTED]" in result.stdout
    except (subprocess.SubprocessError, OSError):
        return False


class FSMId:
    """Canonical identifiers for the three Finite State Machines."""

    FSM1_MIC = "FSM1_MIC"
    FSM2_DICTATOR = "FSM2_DICTATOR"
    FSM3_BRAIN = "FSM3_BRAIN"


class ConcurrentRotatingFileLogger:
    """Thread-safe and process-safe append-only logger with deterministic Linux file rotation.

    Guarantees:
    1. Atomic append-only writes across concurrent threads and processes via POSIX flock.
    2. Deterministic size-bounded rotation (.log -> .log.1 -> .log.2 ... up to backup_count).
    3. Flushed on every write for immediate observability and zero torn records.
    """

    def __init__(
        self,
        file_path: str,
        max_bytes: int = DEFAULT_LOG_MAX_BYTES,
        backup_count: int = DEFAULT_LOG_BACKUP_COUNT,
    ) -> None:
        self.file_path = file_path
        self.max_bytes = max_bytes
        self.backup_count = backup_count
        self._thread_lock = threading.RLock()
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)

    def rotate(self) -> None:
        """Force a deterministic rotation cycle under exclusive process lock."""
        with self._thread_lock:
            fd = -1
            try:
                fd = os.open(
                    self.file_path,
                    os.O_WRONLY | os.O_CREAT | os.O_APPEND,
                    0o644,
                )
                fcntl.flock(fd, fcntl.LOCK_EX)
                self._rotate_under_lock(fd)
            except OSError as err:
                print(f"[logger] manual rotation error on {self.file_path}: {err}", file=sys.stderr)
            finally:
                if fd != -1:
                    try:
                        fcntl.flock(fd, fcntl.LOCK_UN)
                    except OSError:
                        pass
                    try:
                        os.close(fd)
                    except OSError:
                        pass

    def _rotate_under_lock(self, current_fd: int) -> int:
        """Perform deterministic rotation while holding flock."""
        try:
            for i in range(self.backup_count - 1, 0, -1):
                sfn = f"{self.file_path}.{i}"
                dfn = f"{self.file_path}.{i + 1}"
                if os.path.exists(sfn):
                    if os.path.exists(dfn):
                        os.remove(dfn)
                    os.rename(sfn, dfn)

            dfn = f"{self.file_path}.1"
            if os.path.exists(dfn):
                os.remove(dfn)

            os.close(current_fd)
            if os.path.exists(self.file_path):
                os.rename(self.file_path, dfn)

            new_fd = os.open(
                self.file_path,
                os.O_WRONLY | os.O_CREAT | os.O_APPEND,
                0o644,
            )
            fcntl.flock(new_fd, fcntl.LOCK_EX)
            return new_fd
        except OSError as err:
            print(f"[logger] rotation error on {self.file_path}: {err}", file=sys.stderr)
            return current_fd

    def write_line(self, line: str) -> None:
        """Atomically append a line with newline to the log file."""
        if not line.endswith("\n"):
            line += "\n"
        data = line.encode("utf-8")

        with self._thread_lock:
            fd = -1
            try:
                fd = os.open(
                    self.file_path,
                    os.O_WRONLY | os.O_CREAT | os.O_APPEND,
                    0o644,
                )
                fcntl.flock(fd, fcntl.LOCK_EX)

                stat = os.fstat(fd)
                if stat.st_size + len(data) > self.max_bytes:
                    fd = self._rotate_under_lock(fd)

                os.write(fd, data)
            except OSError as err:
                print(f"[logger] write error on {self.file_path}: {err}", file=sys.stderr)
            finally:
                if fd != -1:
                    try:
                        fcntl.flock(fd, fcntl.LOCK_UN)
                    except OSError:
                        pass
                    try:
                        os.close(fd)
                    except OSError:
                        pass


class FSMLogManager:
    """Central manager for the 4 distinct FSM logs and macro-state trajectory tracking."""

    _instance: ClassVar[FSMLogManager | None] = None

    def __init__(self, log_dir: str | None = None) -> None:
        self.log_dir = log_dir or LOG_DIR
        os.makedirs(self.log_dir, exist_ok=True)

        self.fsm1_logger = ConcurrentRotatingFileLogger(os.path.join(self.log_dir, "fsm1_mic_gate.log"))
        self.fsm2_logger = ConcurrentRotatingFileLogger(os.path.join(self.log_dir, "fsm2_dictator_queue.log"))
        self.fsm3_logger = ConcurrentRotatingFileLogger(os.path.join(self.log_dir, "fsm3_cognitive_brain.log"))
        self.general_logger = ConcurrentRotatingFileLogger(os.path.join(self.log_dir, "fsm_unified_trajectory.log"))

        self._state_lock = threading.Lock()
        self._fsm1_state: str = "MIC_OFF"
        self._fsm2_state: str = "idle"
        self._fsm3_state: str = "off"
        self._seq_file = os.path.join(self.log_dir, ".seq_counter")

        # Symlink /tmp/dictate.log to general trajectory log for backward compatibility
        try:
            if not os.path.islink(LOG_FILE) and not os.path.exists(LOG_FILE):
                os.symlink(self.general_logger.file_path, LOG_FILE)
            elif os.path.islink(LOG_FILE) and os.readlink(LOG_FILE) != self.general_logger.file_path:
                os.remove(LOG_FILE)
                os.symlink(self.general_logger.file_path, LOG_FILE)
        except OSError:
            pass

    @classmethod
    def get_instance(cls) -> FSMLogManager:
        if cls._instance is None:
            cls._instance = FSMLogManager()
        return cls._instance

    def _next_sequence_id(self) -> int:
        """Atomic inter-process monotonic counter."""
        fd = -1
        seq = 1
        try:
            fd = os.open(self._seq_file, os.O_RDWR | os.O_CREAT, 0o644)
            fcntl.flock(fd, fcntl.LOCK_EX)
            content = os.read(fd, 32).decode("utf-8").strip()
            if content.isdigit():
                seq = int(content) + 1
            os.lseek(fd, 0, os.SEEK_SET)
            seq_bytes = f"{seq}\n".encode("utf-8")
            os.write(fd, seq_bytes)
            os.ftruncate(fd, len(seq_bytes))
        except OSError:
            seq = int(time.time() * 1000) % 1000000
        finally:
            if fd != -1:
                try:
                    fcntl.flock(fd, fcntl.LOCK_UN)
                except OSError:
                    pass
                try:
                    os.close(fd)
                except OSError:
                    pass
        return seq

    def get_current_macro_state(self) -> tuple[str, str, str]:
        """Fetch the current composite state vector (S1, S2, S3)."""
        with self._state_lock:
            if self.log_dir == LOG_DIR:
                try:
                    snap = read_snapshot()
                    if snap.get("phase"):
                        self._fsm2_state = str(snap["phase"])
                except Exception:
                    pass

                try:
                    if os.path.exists(BRAIN_STATE_FILE):
                        with open(BRAIN_STATE_FILE, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            if data.get("state"):
                                self._fsm3_state = str(data["state"])
                except Exception:
                    pass

            return (self._fsm1_state, self._fsm2_state, self._fsm3_state)

    def log_fsm1_transition(self, from_state: str, to_state: str, detail: str = "") -> None:
        with self._state_lock:
            self._fsm1_state = to_state
        self._record_transition(FSMId.FSM1_MIC, from_state, to_state, detail)

    def log_fsm2_transition(self, from_state: str, to_state: str, detail: str = "") -> None:
        with self._state_lock:
            self._fsm2_state = to_state
        self._record_transition(FSMId.FSM2_DICTATOR, from_state, to_state, detail)

    def log_fsm3_transition(self, from_state: str, to_state: str, detail: str = "") -> None:
        with self._state_lock:
            self._fsm3_state = to_state
        self._record_transition(FSMId.FSM3_BRAIN, from_state, to_state, detail)

    def _record_transition(
        self,
        fsm_id: str,
        from_state: str,
        to_state: str,
        detail: str = "",
    ) -> None:
        ts = datetime.now().astimezone().isoformat(timespec="milliseconds")
        seq = self._next_sequence_id()
        pid = os.getpid()
        clean_detail = detail.strip()
        detail_part = f" | detail={clean_detail!r}" if clean_detail else ""

        individual_line = (
            f"[{ts}] [#{seq:06d}] [{fsm_id}] {from_state} -> {to_state}{detail_part} | pid={pid}"
        )

        if fsm_id == FSMId.FSM1_MIC:
            self.fsm1_logger.write_line(individual_line)
        elif fsm_id == FSMId.FSM2_DICTATOR:
            self.fsm2_logger.write_line(individual_line)
        elif fsm_id == FSMId.FSM3_BRAIN:
            self.fsm3_logger.write_line(individual_line)

        s1, s2, s3 = self.get_current_macro_state()
        if fsm_id == FSMId.FSM1_MIC:
            s1_repr = f"{from_state}->{to_state}"
            s2_repr = s2
            s3_repr = s3
        elif fsm_id == FSMId.FSM2_DICTATOR:
            s1_repr = s1
            s2_repr = f"{from_state}->{to_state}"
            s3_repr = s3
        else:
            s1_repr = s1
            s2_repr = s2
            s3_repr = f"{from_state}->{to_state}"

        unified_path = f"[{s1_repr} | {s2_repr} | {s3_repr}]"

        general_line = (
            f"[{ts}] [#{seq:06d}] [{fsm_id}] {from_state} -> {to_state} "
            f"| path: {unified_path}{detail_part} | pid={pid}"
        )
        self.general_logger.write_line(general_line)

    def rotate_all(self) -> None:
        """Trigger deterministic rotation across all 4 managed loggers."""
        self.fsm1_logger.rotate()
        self.fsm2_logger.rotate()
        self.fsm3_logger.rotate()
        self.general_logger.rotate()

    def get_log_status(self) -> dict[str, Any]:
        """Inspect the current size and status of all 4 logs."""
        logs = {
            "fsm1_mic_gate": self.fsm1_logger.file_path,
            "fsm2_dictator_queue": self.fsm2_logger.file_path,
            "fsm3_cognitive_brain": self.fsm3_logger.file_path,
            "fsm_unified_trajectory": self.general_logger.file_path,
        }
        info = {}
        for name, path in logs.items():
            exists = os.path.exists(path)
            size = os.path.getsize(path) if exists else 0
            mtime = os.path.getmtime(path) if exists else None
            mtime_str = datetime.fromtimestamp(mtime).astimezone().isoformat(timespec="seconds") if mtime else None
            info[name] = {
                "path": path,
                "exists": exists,
                "size_bytes": size,
                "size_kb": round(size / 1024.0, 2),
                "last_modified": mtime_str,
            }
        return {
            "log_dir": self.log_dir,
            "max_bytes": self.general_logger.max_bytes,
            "backup_count": self.general_logger.backup_count,
            "macro_state": self.get_current_macro_state(),
            "logs": info,
        }


def preload_cuda_libraries() -> None:
    global CUDA_LIBRARIES_PRELOADED
    if CUDA_LIBRARIES_PRELOADED:
        return
    CUDA_LIBRARIES_PRELOADED = True
    site_packages = os.path.join(SCRIPT_DIRECTORY, ".venv/lib")
    if not os.path.exists(site_packages):
        return
    for pattern in ("**/nvidia/cublas/lib/*.so*", "**/nvidia/cudnn/lib/*.so*"):
        for library_path in glob.glob(os.path.join(site_packages, pattern), recursive=True):
            try:
                ctypes.CDLL(library_path, mode=ctypes.RTLD_GLOBAL)
            except OSError:
                pass


def load_audio_libraries():
    try:
        import numpy as np
        import scipy.io.wavfile as wav
        import sounddevice as sd
    except ImportError as error:
        print(f"[dictate.py] missing audio dependency: {error}", file=sys.stderr)
        sys.exit(1)
    return np, sd, wav


def is_pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def read_pid() -> int | None:
    try:
        with open(PID_FILE, encoding="utf-8") as file:
            pid = int(file.read().strip())
        return pid if is_pid_alive(pid) else None
    except (OSError, ValueError):
        return None


def write_pid(pid: int) -> None:
    try:
        with open(PID_FILE, "w", encoding="utf-8") as file:
            file.write(str(pid))
    except OSError:
        pass


def cleanup_runtime_files(*paths: str) -> None:
    for path in paths:
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            pass


def notify(message: str, icon: str = "audio-input-microphone-symbolic", timeout_ms: str = "2000") -> None:
    print(f"[dictate.py] {message}", flush=True)
    if shutil.which("notify-send"):
        subprocess.run(
            ["notify-send", "-t", timeout_ms, "-i", icon, "Voice Dictation", message],
            check=False,
            stderr=subprocess.DEVNULL,
        )


def get_active_window_info() -> tuple[str | None, str]:
    try:
        result = subprocess.run(
            ["hyprctl", "activewindow", "-j"],
            capture_output=True,
            text=True,
            check=True,
            timeout=0.5,
        )
        data = json.loads(result.stdout)
        return data.get("address"), data.get("title", data.get("class", "Window"))
    except (subprocess.SubprocessError, json.JSONDecodeError, OSError):
        return None, "Window"


def get_default_snapshot() -> dict[str, Any]:
    return {
        "v": 1,
        "phase": PHASE_IDLE,
        "mode": "off",
        "phase_since": 0.0,
        "pid": None,
        "target_address": None,
        "target_title": None,
        "started_at": None,
        "rec_started_at": None,
        "stop_reason": None,
        "detail": "",
        "ui": dict(UI_PROJECTIONS[PHASE_IDLE]),
    }


def read_snapshot() -> dict[str, Any]:
    try:
        with open(STATE_FILE, encoding="utf-8") as file:
            data = json.load(file)
        if not isinstance(data, dict):
            return get_default_snapshot()
        phase = data.get("phase") or PHASE_IDLE
        if phase not in ALL_PHASES:
            phase = PHASE_IDLE
        data["phase"] = phase
        data["ui"] = dict(UI_PROJECTIONS.get(phase, UI_PROJECTIONS[PHASE_IDLE]))
        return data
    except (OSError, json.JSONDecodeError):
        try:
            with open(FLAG_FILE, encoding="utf-8") as file:
                word = file.read().strip()
            if word in ALL_PHASES and word != PHASE_IDLE:
                snapshot = get_default_snapshot()
                snapshot["phase"] = word
                snapshot["ui"] = dict(UI_PROJECTIONS[word])
                return snapshot
        except OSError:
            pass
        return get_default_snapshot()


def phase_of() -> str:
    return read_snapshot().get("phase") or PHASE_IDLE


def write_snapshot(snapshot: dict[str, Any]) -> None:
    phase = snapshot.get("phase") or PHASE_IDLE
    configuration = load_config()
    snapshot["mode"] = read_mode() if phase != PHASE_IDLE else "off"
    snapshot["silence_end_sec"] = configuration["silence_sec"]
    snapshot["auto_enter"] = configuration["auto_enter"]
    snapshot["brain_active"] = is_brain_active()
    snapshot["ui"] = dict(UI_PROJECTIONS.get(phase, UI_PROJECTIONS[PHASE_IDLE]))
    snapshot["v"] = 1

    temporary_file = f"{STATE_FILE}.{os.getpid()}.tmp"
    try:
        with open(temporary_file, "w", encoding="utf-8") as file:
            json.dump(snapshot, file, ensure_ascii=False, separators=(",", ":"))
            file.write("\n")
        os.replace(temporary_file, STATE_FILE)
    except OSError as error:
        print(f"[dictate.py] snapshot write error: {error}", file=sys.stderr, flush=True)
        cleanup_runtime_files(temporary_file)

    try:
        if phase == PHASE_IDLE:
            if os.path.exists(FLAG_FILE):
                os.remove(FLAG_FILE)
        else:
            with open(FLAG_FILE, "w", encoding="utf-8") as file:
                file.write(phase)
    except OSError:
        pass


def enter(phase: str, **fields: Any) -> dict[str, Any]:
    global SNAPSHOT_CACHE
    if phase not in ALL_PHASES:
        raise ValueError(f"unknown phase {phase!r}")

    previous_phase = SNAPSHOT_CACHE.get("phase") or PHASE_IDLE
    if previous_phase == PHASE_IDLE and phase != PHASE_ARMING:
        disk_snapshot = read_snapshot()
        if disk_snapshot.get("phase") not in (PHASE_IDLE, None):
            SNAPSHOT_CACHE = disk_snapshot
            previous_phase = SNAPSHOT_CACHE.get("phase") or PHASE_IDLE

    allowed_transitions = TRANSITIONS.get(previous_phase, frozenset())
    if phase not in allowed_transitions and previous_phase != phase:
        print(f"[dictate.py] FSM notice {previous_phase} -> {phase}", flush=True)

    snapshot = dict(SNAPSHOT_CACHE)
    snapshot["phase"] = phase
    snapshot["phase_since"] = time.time()
    for key, value in fields.items():
        if value is not None or key in fields:
            snapshot[key] = value

    if "pid" not in fields:
        snapshot["pid"] = read_pid()

    snapshot["ui"] = dict(UI_PROJECTIONS[phase])
    SNAPSHOT_CACHE = snapshot
    write_snapshot(snapshot)

    detail = snapshot.get("detail") or ""
    detail_string = f" detail={detail!r}" if detail else ""
    print(f"[dictate.py] FSM {previous_phase} -> {phase}{detail_string}", flush=True)
    FSMLogManager.get_instance().log_fsm2_transition(previous_phase, phase, detail=detail)
    return snapshot


def clear_to_idle(detail: str = "") -> None:
    global SNAPSHOT_CACHE
    previous_phase = SNAPSHOT_CACHE.get("phase") or PHASE_IDLE
    snapshot = get_default_snapshot()
    if detail:
        snapshot["detail"] = detail
    SNAPSHOT_CACHE = snapshot
    write_snapshot(snapshot)
    print(f"[dictate.py] FSM -> idle detail={detail!r}", flush=True)
    FSMLogManager.get_instance().log_fsm2_transition(previous_phase, PHASE_IDLE, detail=detail)


def reconcile() -> dict[str, Any]:
    snapshot = read_snapshot()
    phase = snapshot.get("phase") or PHASE_IDLE
    pid = read_pid()

    if phase in PHASES_WORKER and pid is None:
        clear_to_idle(detail=f"stale_phase:{phase}")
        return read_snapshot()

    if phase in (PHASE_OK, PHASE_ERR) and pid is None:
        phase_since = snapshot.get("phase_since") or 0.0
        if phase_since and time.time() - float(phase_since) > RESULT_FLASH_SECONDS + 0.5:
            clear_to_idle(detail="flash_expired")
            return read_snapshot()

    global SNAPSHOT_CACHE
    SNAPSHOT_CACHE = snapshot
    return snapshot


def install_stop_signal_handlers() -> None:
    def on_stop_signal(_signum, _frame):
        STOP_REQUESTED_STATE["flag"] = True

    signal.signal(signal.SIGUSR1, on_stop_signal)
    signal.signal(signal.SIGTERM, on_stop_signal)


def calculate_chunk_rms_normalized(chunk, np) -> float:
    samples = chunk.astype(np.float32).reshape(-1)
    if samples.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(samples))) / 32768.0)


def record_fixed(duration_seconds: float = TIMED_DURATION_SEC) -> str | None:
    _np, sd, wav = load_audio_libraries()
    enter(PHASE_ARMING, started_at=time.time(), detail="timed")
    try:
        audio = sd.rec(
            int(duration_seconds * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="int16",
        )
        enter(PHASE_REC, rec_started_at=time.time(), detail=f"timed_{duration_seconds:.0f}s")
        notify(f"🎙️ Recording {duration_seconds:.0f}s…", "media-record-symbolic")
        sd.wait()
    except Exception:
        enter(PHASE_ERR, detail="timed_record_failed")
        raise

    enter(PHASE_STOPPING, stop_reason="timed", detail="timed_done")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temporary_wav:
        temporary_wav_name = temporary_wav.name
    wav.write(temporary_wav_name, SAMPLE_RATE, audio)
    return temporary_wav_name


def normalize_hallucination_candidate(text: str) -> str:
    cleaned = "".join(char if char.isalnum() or char.isspace() else " " for char in text.casefold())
    return " ".join(cleaned.split())


def is_hallucination_solo(text: str) -> bool:
    return normalize_hallucination_candidate(text) in HALLUCINATIONS


@dataclass(frozen=True)
class VRAMTelemetry:
    """Snapshot of GPU memory metrics in megabytes (MiB)."""

    used_mb: int
    total_mb: int
    free_mb: int

    def is_occupied(self, threshold_mb: int = DEFAULT_VRAM_OCCUPIED_TRIGGER_MB) -> bool:
        """Return True if occupied VRAM exceeds the given threshold."""
        return self.used_mb > threshold_mb

    @property
    def used_gb(self) -> float:
        return self.used_mb / 1024.0

    @property
    def free_gb(self) -> float:
        return self.free_mb / 1024.0

    @property
    def total_gb(self) -> float:
        return self.total_mb / 1024.0

    @property
    def used_percentage(self) -> float:
        return (self.used_mb / self.total_mb * 100.0) if self.total_mb > 0 else 0.0


class VRAMMonitor:
    """Queries GPU memory telemetry via nvidia-smi with safe exception handling."""

    @staticmethod
    def get_telemetry() -> VRAMTelemetry | None:
        try:
            output = subprocess.run(
                ["nvidia-smi", "--query-gpu=memory.used,memory.total,memory.free", "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                check=True,
                timeout=2.0,
            )
            first_line = (output.stdout or "").strip().splitlines()[0]
            parts = [segment.strip() for segment in first_line.split(",")]
            if len(parts) >= 3:
                return VRAMTelemetry(
                    used_mb=int(float(parts[0])),
                    total_mb=int(float(parts[1])),
                    free_mb=int(float(parts[2])),
                )
        except (subprocess.SubprocessError, ValueError, OSError, IndexError):
            pass
        return None


class STTBackend(abc.ABC):
    """Abstract Strategy interface for speech-to-text inference engines."""

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Identifier name of the backend (e.g. 'whisper-cuda', 'whisper-cpu', 'qwen3-asr')."""
        ...

    @property
    @abc.abstractmethod
    def device(self) -> str:
        """Target execution device ('cuda' or 'cpu')."""
        ...

    @property
    @abc.abstractmethod
    def compute_type(self) -> str:
        """Precision / compute quantization type (e.g. 'float16', 'int8')."""
        ...

    @property
    @abc.abstractmethod
    def vram_requirement_mb(self) -> int:
        """Estimated VRAM needed to run on GPU (0 for CPU)."""
        ...

    @abc.abstractmethod
    def is_available(self) -> bool:
        """Check whether runtime dependencies and model artifacts are available."""
        ...

    @abc.abstractmethod
    def is_loaded(self) -> bool:
        """Check whether the model weights are loaded in memory."""
        ...

    @abc.abstractmethod
    def load(self) -> None:
        """Load model into target memory/device."""
        ...

    @abc.abstractmethod
    def unload(self) -> None:
        """Unload model and free GPU/CPU memory."""
        ...

    @abc.abstractmethod
    def transcribe(
        self,
        audio_input: Any,
        language: str = "es",
        vad_filter: bool = False,
        without_timestamps: bool = True,
    ) -> list[str]:
        """Transcribe audio input into recognized segment texts."""
        ...


class FasterWhisperBackend(STTBackend):
    """Strategy implementation using Faster-Whisper (CTranslate2)."""

    def __init__(
        self,
        model_size: str = "large-v3-turbo",
        device: str = "cuda",
        compute_type: str = "float16",
    ) -> None:
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._model: Any = None

    @property
    def name(self) -> str:
        return f"whisper-{self._device}"

    @property
    def device(self) -> str:
        return self._device

    @property
    def compute_type(self) -> str:
        return self._compute_type

    @property
    def vram_requirement_mb(self) -> int:
        return 1800 if self._device == "cuda" else 0

    def is_available(self) -> bool:
        try:
            import faster_whisper  # noqa: F401
            return True
        except ImportError:
            return False

    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        if self._model is not None:
            return
        if self._device == "cuda":
            preload_cuda_libraries()
        from faster_whisper import WhisperModel
        self._model = WhisperModel(
            self._model_size,
            device=self._device,
            compute_type=self._compute_type,
        )
        # Warmup probe to compile CUDA kernels and force CuBLAS context upfront
        try:
            import numpy as np
            dummy_pcm = np.zeros(1600, dtype=np.float32)
            list(self._model.transcribe(
                dummy_pcm,
                language="es",
                beam_size=1,
                without_timestamps=True,
            )[0])
        except Exception as probe_error:
            print(f"[dictate.py] faster-whisper warmup probe note: {probe_error}", flush=True)

    def unload(self) -> None:
        if self._model is not None:
            del self._model
            self._model = None
            gc.collect()

    def transcribe(
        self,
        audio_input: Any,
        language: str = "es",
        vad_filter: bool = False,
        without_timestamps: bool = True,
    ) -> list[str]:
        if self._model is None:
            self.load()

        if hasattr(audio_input, "reshape"):
            audio_input = audio_input.reshape(-1)
        if hasattr(audio_input, "size") and audio_input.size == 0:
            return []

        segments, _ = self._model.transcribe(
            audio_input,
            language=language,
            beam_size=1,
            best_of=1,
            patience=1.0,
            vad_filter=vad_filter,
            without_timestamps=without_timestamps,
            condition_on_previous_text=False,
            no_speech_threshold=0.8,
            compression_ratio_threshold=2.4,
        )

        accepted_segments: list[str] = []
        for segment in segments:
            if segment.no_speech_prob > NO_SPEECH_PROBABILITY_THRESHOLD:
                continue
            if segment.avg_logprob < MINIMUM_AVERAGE_LOGPROBABILITY:
                continue
            text = segment.text.strip()
            if text:
                accepted_segments.append(text)
        return accepted_segments

    def get_raw_model(self) -> Any:
        if self._model is None:
            self.load()
        return self._model


class Qwen3ASRBackend(STTBackend):
    """Strategy implementation for Qwen3-ASR (Alibaba).

    Supports direct execution or bridge execution via the dedicated Python 3.12 environment.
    """

    BRIDGE_PYTHON_PATH: ClassVar[str] = "/home/kodex/Services/qwen3-asr/.venv/bin/python"

    def __init__(
        self,
        model_path: str = "Qwen/Qwen3-ASR-1.7B",
        device: str = "cuda",
        compute_type: str = "bfloat16",
    ) -> None:
        self._model_path = model_path
        self._device = device
        self._compute_type = compute_type
        self._model: Any = None

    @property
    def name(self) -> str:
        return "qwen3-asr"

    @property
    def device(self) -> str:
        return self._device

    @property
    def compute_type(self) -> str:
        return self._compute_type

    @property
    def vram_requirement_mb(self) -> int:
        return 4000 if self._device == "cuda" else 0

    def is_available(self) -> bool:
        try:
            import qwen_asr  # noqa: F401
            return True
        except ImportError:
            return os.path.exists(self.BRIDGE_PYTHON_PATH)

    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        if self._model is not None:
            return
        try:
            import qwen_asr
            import torch
            self._model = qwen_asr.Qwen3ASRModel.from_pretrained(
                self._model_path,
                dtype=getattr(torch, self._compute_type, torch.bfloat16),
                device_map=self._device,
            )
        except ImportError:
            self._model = "bridge"

    def unload(self) -> None:
        if self._model is not None:
            del self._model
            self._model = None
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass
            gc.collect()

    def transcribe(
        self,
        audio_input: Any,
        language: str = "es",
        vad_filter: bool = False,
        without_timestamps: bool = True,
    ) -> list[str]:
        if self._model is None:
            self.load()

        temp_wav_path: str | None = None
        if isinstance(audio_input, str):
            wav_path = audio_input
        else:
            temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            temp_wav_path = temp_wav.name
            temp_wav.close()
            import scipy.io.wavfile as wav
            wav.write(temp_wav_path, SAMPLE_RATE, audio_input)
            wav_path = temp_wav_path

        try:
            if self._model != "bridge":
                results = self._model.transcribe(
                    audio=wav_path,
                    language="Spanish" if language == "es" else language,
                )
                text = " ".join(r.text for r in results if r.text).strip()
                return [text] if text else []
            else:
                script = (
                    "import sys, qwen_asr, json\n"
                    f"asr = qwen_asr.Qwen3ASRModel.from_pretrained('{self._model_path}', device_map='cuda:0')\n"
                    f"res = asr.transcribe(audio=sys.argv[1], language='Spanish')\n"
                    "print(json.dumps([r.text for r in res if r.text]))\n"
                )
                output = subprocess.run(
                    [self.BRIDGE_PYTHON_PATH, "-c", script, wav_path],
                    capture_output=True,
                    text=True,
                    check=True,
                    timeout=30.0,
                )
                raw_json = (output.stdout or "").strip().splitlines()[-1]
                texts = json.loads(raw_json)
                return [t.strip() for t in texts if t.strip()]
        except (subprocess.SubprocessError, ValueError, OSError, IndexError) as err:
            print(f"[dictate.py] Qwen3ASRBackend error: {err}", file=sys.stderr)
            return []
        finally:
            if temp_wav_path and os.path.exists(temp_wav_path):
                cleanup_runtime_files(temp_wav_path)


class STTRouter:
    """Strategy Context and dynamic VRAM-aware backend router.

    Monitors GPU memory utilization against the occupied trigger threshold (default 2048 MiB / 2 GB).
    When occupied VRAM > trigger_mb:
        Routes to CPU backend (FasterWhisper CPU int8) to protect gaming / GPU workloads.
        Dispatches system notifications on state transition ("pero avisa").
    When occupied VRAM <= trigger_mb:
        Routes to GPU backend (FasterWhisper CUDA float16, or Qwen3 if configured).
        Dispatches system notification on state transition.
    """

    _instance: ClassVar[STTRouter | None] = None

    def __init__(self) -> None:
        self._backends: dict[str, STTBackend] = {
            "whisper-cuda": FasterWhisperBackend(device="cuda", compute_type="float16"),
            "qwen3-asr": Qwen3ASRBackend(device="cuda", compute_type="bfloat16"),
        }
        self._active_backend: STTBackend | None = None
        self._last_routed_name: str | None = None
        self._occupied_trigger_mb: int = DEFAULT_VRAM_OCCUPIED_TRIGGER_MB
        self._backend_mode: str = "whisper-cuda"
        self._preferred_gpu: str = DEFAULT_PREFERRED_GPU_BACKEND
        self._notify_on_switch: bool = True
        self.reload_config()

    @classmethod
    def get_instance(cls) -> STTRouter:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def occupied_trigger_mb(self) -> int:
        return self._occupied_trigger_mb

    @property
    def backend_mode(self) -> str:
        return self._backend_mode

    @property
    def preferred_gpu(self) -> str:
        return self._preferred_gpu

    def register_backend(self, backend: STTBackend) -> None:
        """Register a new STTBackend strategy in adherence to Open/Closed Principle (OCP)."""
        self._backends[backend.name] = backend

    def get_backend_by_name(self, name: str) -> STTBackend | None:
        return self._backends.get(name)

    def reload_config(self) -> None:
        config = load_config()
        self._backend_mode = str(config.get("backend_mode", "whisper-cuda")).lower()
        if self._backend_mode == "whisper-cpu":
            self._backend_mode = "whisper-cuda"
        self._occupied_trigger_mb = int(config.get("vram_occupied_trigger_mb", DEFAULT_VRAM_OCCUPIED_TRIGGER_MB))
        self._preferred_gpu = str(config.get("preferred_gpu_backend", DEFAULT_PREFERRED_GPU_BACKEND)).lower()
        self._notify_on_switch = bool(config.get("notify_on_router_switch", True))

    def set_backend_mode(self, mode: str) -> None:
        valid_modes = ("auto", "whisper-cuda", "qwen3-asr", "qwen3")
        if mode not in valid_modes:
            raise ValueError(f"Invalid mode {mode!r}. Valid options: {valid_modes}")
        config = load_config()
        config["backend_mode"] = mode
        save_config(config)
        self.reload_config()

    def set_occupied_trigger_mb(self, trigger_mb: int) -> None:
        if trigger_mb < 256:
            raise ValueError(f"Trigger must be at least 256 MiB (got {trigger_mb})")
        config = load_config()
        config["vram_occupied_trigger_mb"] = trigger_mb
        save_config(config)
        self.reload_config()

    def decide_backend(self, telemetry: VRAMTelemetry | None = None) -> tuple[STTBackend, str]:
        """Evaluate configuration to select GPU backend strategy (CPU fallback permanently eliminated)."""
        # Manual override modes
        if self._backend_mode == "whisper-cuda":
            if self._backends.get("whisper-cuda") and self._backends["whisper-cuda"].is_available():
                return self._backends["whisper-cuda"], "manual config override (whisper-cuda)"
            raise RuntimeError("whisper-cuda is not available on this host")
        if self._backend_mode in ("qwen3", "qwen3-asr"):
            if self._backends.get("qwen3-asr") and self._backends["qwen3-asr"].is_available():
                return self._backends["qwen3-asr"], "manual config override (qwen3-asr)"
            raise RuntimeError("qwen3-asr is not available on this host")

        # Mode == "auto" (Strict GPU routing)
        target_gpu = self._preferred_gpu if self._preferred_gpu in self._backends else "whisper-cuda"
        if target_gpu in self._backends and self._backends[target_gpu].is_available():
            reason = f"GPU backend active ({target_gpu})"
            return self._backends[target_gpu], reason

        for b_name, backend in self._backends.items():
            if backend.is_available():
                return backend, f"GPU fallback to registered backend ({b_name})"

        raise RuntimeError(f"GPU STT backend {target_gpu} is unavailable (CPU fallback disabled)")

    def resolve_backend(self) -> STTBackend:
        """Resolve the active backend strategy."""
        telemetry = VRAMMonitor.get_telemetry()
        backend, reason = self.decide_backend(telemetry)

        # Detect transition / switch
        if self._last_routed_name is None:
            self._last_routed_name = backend.name
            print(f"[dictate.py] STT Router active backend: {backend.name} ({reason})", flush=True)
            if self._notify_on_switch:
                notify(f"⚡ STT on GPU ({backend.name})", "emblem-ok-symbolic")
        elif self._last_routed_name != backend.name:
            old_name = self._last_routed_name
            self._last_routed_name = backend.name
            print(f"[dictate.py] STT Router switched: {old_name} -> {backend.name} ({reason})", flush=True)

            if old_name in self._backends:
                self._backends[old_name].unload()

            if self._notify_on_switch:
                notify(f"⚡ STT switched to GPU ({backend.name})", "emblem-ok-symbolic")

        self._active_backend = backend
        return backend

    def get_status_dict(self) -> dict[str, Any]:
        telemetry = VRAMMonitor.get_telemetry()
        backend, reason = self.decide_backend(telemetry)
        return {
            "vram_telemetry": {
                "used_mb": telemetry.used_mb if telemetry else None,
                "free_mb": telemetry.free_mb if telemetry else None,
                "total_mb": telemetry.total_mb if telemetry else None,
                "used_gb": round(telemetry.used_gb, 2) if telemetry else None,
                "free_gb": round(telemetry.free_gb, 2) if telemetry else None,
                "total_gb": round(telemetry.total_gb, 2) if telemetry else None,
                "used_percentage": round(telemetry.used_percentage, 1) if telemetry else None,
            },
            "occupied_trigger_mb": self._occupied_trigger_mb,
            "is_occupied": telemetry.is_occupied(self._occupied_trigger_mb) if telemetry else None,
            "backend_mode": self._backend_mode,
            "preferred_gpu": self._preferred_gpu,
            "routed_backend": backend.name,
            "routed_device": backend.device,
            "routed_compute_type": backend.compute_type,
            "decision_reason": reason,
            "registered_backends": {
                name: {
                    "device": b.device,
                    "compute_type": b.compute_type,
                    "available": b.is_available(),
                    "loaded": b.is_loaded(),
                    "vram_mb": b.vram_requirement_mb,
                }
                for name, b in self._backends.items()
            },
        }


def get_free_vram_megabytes() -> int | None:
    telemetry = VRAMMonitor.get_telemetry()
    return telemetry.free_mb if telemetry is not None else None


def get_whisper_model():
    global CACHED_WHISPER_MODEL
    router = STTRouter.get_instance()
    backend = router.resolve_backend()
    if isinstance(backend, FasterWhisperBackend):
        CACHED_WHISPER_MODEL = backend.get_raw_model()
        return CACHED_WHISPER_MODEL
    backend.load()
    return backend



class TextFilter(abc.ABC):
    r"""Abstract base class defining the contract for acoustic and orthographic text transformations.

    Follows the Open/Closed Principle (OCP): the text normalization pipeline is closed for
    invasive modification but perpetually open for extension via concrete filter subclasses.
    Each filter adheres strictly to the Single Responsibility Principle (SRP) by applying
    a mathematically defined, isolated deterministic transduction f: \Sigma^* \to \Sigma^*.
    """

    @abc.abstractmethod
    def filter(self, text: str) -> str:
        r"""Apply the filter transformation to the given text string.

        Args:
            text: Raw or intermediate transcription string to process.

        Returns:
            Normalized or filtered string adhering to the filter's linguistic invariants.
        """
        ...


class AcousticArtifactFilter(TextFilter):
    r"""Filters transient non-speech acoustic artifacts, specifically mechanical keyboard clicks.

    Linguistic & Acoustic Rationale:
        When a typist depresses or releases mechanical key switches (e.g. Cherry MX, Gateron,
        Kailh tactile or clicky switches) while an open microphone is active, high-frequency
        impact transients (<30 ms duration) produce acoustic resonance in the 500 Hz – 2500 Hz spectrum.
        Because these transient peaks coincide with the first and second formants (F1, F2) of
        Spanish open vowels (/a/, /e/, /o/), autoregressive ASR models like Whisper erroneously
        decode isolated switch strikes as monosyllabic vowels or phantom hesitation particles
        ('a', 'e', 'o', 'ah', 'eh', 'u').

    Mathematical Transduction:
        Given an input string s \in \Sigma^*, define predicate \Phi_{artifact}(s) matching
        isolated single/double vocalic tokens or phantom affirmative monosyllables:
            \Phi_{artifact}(s) \iff s \in L( ^\s*(?:[aeiouáéíóú]\.?|[aeiouáéíóú]{2}\.?|eh\.?|ah\.?|oh\.?|uh\.?)\s*$ )
        f(s) = "" if \Phi_{artifact}(s) else s

    Regular Expression:
        Pattern: ^\s*(?:[aeiouáéíóú]\.?|[aeiouáéíóú]{2}\.?|eh\.?|ah\.?|oh\.?|uh\.?)\s*$
        Flags:   re.IGNORECASE

    Examples:
        - "a"      -> ""
        - "e."     -> ""
        - "ah"     -> ""
        - "o."     -> ""
        - "hola"   -> "hola" (preserved)
        - "sí"     -> "sí"   (preserved)
    """

    REGEX = re.compile(
        r"^\s*(?:[aeiouáéíóú]\.?|[aeiouáéíóú]{2}\.?|eh\.?|ah\.?|oh\.?|uh\.?)\s*$",
        re.IGNORECASE,
    )

    def filter(self, text: str) -> str:
        if self.REGEX.match(text.strip()):
            return ""
        return text


class HesitationEllipsisFilter(TextFilter):
    r"""Eliminates hesitation ellipsis tokens emitted by autoregressive decoders during acoustic pauses.

    Linguistic & Acoustic Rationale:
        In continuous speech recognition, when a speaker pauses prosodically (inter-phrase pause
        t_{pause} \in [150, 600] ms) or when an audio window is sliced mid-sentence, the decoder's
        cross-attention entropy spikes over trailing acoustic silence frames. Under beam search
        or greedy decoding, OpenAI Whisper models frequently emit hesitation tokens
        (Unicode HORIZONTAL ELLIPSIS U+2026 '…' or ASCII period runs '...', '..') representing
        prosodic suspense rather than orthographic punctuation.
        Because unidirectional live injection (via wtype / Wayland virtual keyboard) cannot
        retroactively backspace pasted characters, intermediate hesitation marks become
        permanently burned into the target buffer.

    Mathematical Transduction:
        s \mapsto \text{sub}( r"(?:\.{2,}|…)", "", s )
        Removes any sequence of two or more consecutive periods or Unicode ellipsis glyphs.

    Regular Expression:
        Pattern: (?:\.{2,}|…)
        Action:  Replace with empty string ""

    Examples:
        - "prueba de... dictado" -> "prueba de dictado"
        - "saber… qué está pasando" -> "saber qué está pasando"
        - "un... pregunta" -> "un pregunta"
    """

    REGEX = re.compile(r"(?:\.{2,}|…)")

    def filter(self, text: str) -> str:
        return self.REGEX.sub("", text)


class MidSentencePunctuationFilter(TextFilter):
    r"""Cures pause-induced mid-sentence periods and semicolons followed by lowercase continuations.

    Linguistic & Acoustic Rationale:
        Under Spanish prescriptive orthography (Real Academia Española - RAE), a period
        terminates an autonomous orthographic sentence and MUST be followed by an uppercase
        letter or a terminal punctuation delimiter.
        However, Whisper's acoustic VAD boundaries segment speech during respiratory pauses,
        prompting the language model head to insert full stops ('.') prior to clitic pronouns,
        prepositions, or conjunctions that are phonologically and syntactically subordinate
        to the preceding verb phrase (e.g. 'pasando. con los... puntos. suspensivos').
        This filter identifies full stops or semicolons that immediately precede a lowercase
        character, replacing the erroneous terminal with a normal inter-word whitespace delimiter.
        Legitimate sentence boundaries (where the subsequent word begins with an uppercase letter
        or Spanish inverted punctuation '¿', '¡') are strictly preserved.

    Mathematical Transduction:
        Let c_{term} \in \{ '.', ';' \}, w_{next} \in [a-zñáéíóúü]:
        s \mapsto \text{sub}( r"[.;]\s+([a-zñáéíóúü])", r" \1", s )

    Regular Expression:
        Pattern: [.;]\s+([a-zñáéíóúü])
        Action:  Replace with " \1" (single space followed by captured lowercase letter)

    Examples:
        - "qué está pasando. con los puntos" -> "qué está pasando con los puntos"
        - "puntos. suspensivos" -> "puntos suspensivos"
        - "Ahí lo hiciste. bien" -> "Ahí lo hiciste bien"
        - "Hola, hola. Me gustaría" -> "Hola, hola. Me gustaría" (Preserved! Capital 'M')
    """

    REGEX = re.compile(r"[.;]\s+([a-zñáéíóúü])")

    def filter(self, text: str) -> str:
        return self.REGEX.sub(r" \1", text)


class TrailingPunctuationFilter(TextFilter):
    r"""Strips uncommitted trailing punctuation from intermediate streaming audio slices.

    Linguistic & Acoustic Rationale:
        During live incremental dictation, Whisper transcribes overlapping audio buffers every
        ~280 ms. On almost every isolated audio segment, Whisper's language model terminates
        the phrase with a period ('.') or comma (',').
        If pasted immediately via append-only streaming mechanisms (compute_stream_delta + wtype),
        the trailing period is committed to the application window. When the speaker articulates
        the next word in the same sentence, that word is pasted AFTER the period, creating
        fragmented, dotted text.
        This filter strips trailing periods, commas, and semicolons from intermediate streaming
        deltas, deferring final sentence termination to the full utterance commit phase.

    Mathematical Transduction:
        s \mapsto \text{sub}( r"[\s.,;:]+$", "", s )

    Regular Expression:
        Pattern: [\s.,;:]+$
        Action:  Strip matched trailing punctuation characters

    Examples:
        - "Hola, hola." -> "Hola, hola"
        - "prueba de dictado." -> "prueba de dictado"
        - "¿Puedes interpretar una pregunta?" -> "¿Puedes interpretar una pregunta?" (Preserved: question mark intact)
    """

    REGEX = re.compile(r"[\s.,;:]+$")

    def filter(self, text: str) -> str:
        return self.REGEX.sub("", text)


class DuplicatePunctuationFilter(TextFilter):
    r"""Consolidates redundant contiguous punctuation runs generated by boundary concatenation.

    Linguistic & Acoustic Rationale:
        When audio slices are concatenated or when hesitation markers collide with sentence
        delimiters, duplicate punctuation runs such as ',,', '..', or ',.' can emerge.
        This filter normalizes contiguous duplicate punctuation into its canonical single-glyph
        representation while respecting valid Spanish interrogation and exclamation boundaries.

    Mathematical Transduction:
        s \mapsto \text{sub}( r",+", ",", s )
        s \mapsto \text{sub}( r"\.{2,}", ".", s )
        s \mapsto \text{sub}( r"!{2,}", "!", s )
        s \mapsto \text{sub}( r"\?{2,}", "?", s )

    Examples:
        - "hola,, amigo" -> "hola, amigo"
        - "bien.. gracias" -> "bien. gracias"
    """

    COMMA_REGEX = re.compile(r",+")
    PERIOD_REGEX = re.compile(r"\.{2,}")
    EXCLAMATION_REGEX = re.compile(r"!{2,}")
    QUESTION_REGEX = re.compile(r"\?{2,}")

    def filter(self, text: str) -> str:
        text = self.COMMA_REGEX.sub(",", text)
        text = self.PERIOD_REGEX.sub(".", text)
        text = self.EXCLAMATION_REGEX.sub("!", text)
        return self.QUESTION_REGEX.sub("?", text)


class PunctuationSpacingFilter(TextFilter):
    r"""Enforces standardized typographic whitespace invariants around punctuation marks.

    Linguistic & Acoustic Rationale:
        In Spanish typography and universal typesetting norms:
        1. Terminal punctuation marks ('.', ',', ';', ':', '!', '?') MUST NOT be preceded
           by whitespace (no orphan punctuation).
        2. Terminal punctuation marks MUST be followed by whitespace unless followed by another
           closing delimiter, quote, or end-of-string.
        3. Spanish opening punctuation marks ('¿', '¡') MUST NOT be followed by whitespace,
           and MUST be preceded by whitespace (or begin at string start).
        4. Multiple contiguous whitespace characters must collapse to a single space U+0020.

    Mathematical Transduction:
        1. Collapse whitespace: \s+ \mapsto " "
        2. Remove leading space before terminal punctuation: \s+([.,;:!?]) \mapsto \1
        3. Ensure trailing space after terminal punctuation: ([.,;:!?])(?=[^\s.,;:!?0-9]) \mapsto \1 + " "
        4. Remove trailing space after opening punctuation: ([¿¡])\s+ \mapsto \1
        5. Trim outer margins: strip()

    Examples:
        - "hola , que tal ?" -> "hola, que tal?"
        - "pregunta.¿Puedes" -> "pregunta. ¿Puedes"
        - "¿ Puedes entrar ?" -> "¿Puedes entrar?"
    """

    WHITESPACE_REGEX = re.compile(r"\s+")
    LEADING_SPACE_REGEX = re.compile(r"\s+([.,;:!?])")
    TRAILING_SPACE_REGEX = re.compile(r"([.,;:!?])(?=[^\s.,;:!?0-9])")
    INVERTED_OPENING_REGEX = re.compile(r"([¿¡])\s+")

    def filter(self, text: str) -> str:
        text = self.WHITESPACE_REGEX.sub(" ", text)
        text = self.LEADING_SPACE_REGEX.sub(r"\1", text)
        text = self.TRAILING_SPACE_REGEX.sub(r"\1 ", text)
        text = self.INVERTED_OPENING_REGEX.sub(r"\1", text)
        return text.strip()



class RegexFilterRule(TextFilter):
    r"""Declarative regular-expression transformation rule complying with the Open/Closed Principle.

    Linguistic & Architectural Rationale:
        Under strict SOLID / OCP design, adding new orthographic corrections, lexical filters,
        or acoustic noise suppressors must not necessitate source code modifications.
        RegexFilterRule encapsulates an atomic, configurable transduction rule loaded directly
        from external declarative configuration files (filters.json) or runtime CLI commands.

    Transduction Mapping:
        Given an input string s \in \Sigma^*, a regular expression pattern P with compilation
        flags F, an action A \in \{ \text{"replace"}, \text{"drop_match"}, \text{"strip_trailing"} \},
        and a replacement string R \in \Sigma^*:
            - If not enabled or s = \varepsilon: f(s) = s
            - If A = "drop_match":
                  f(s) = "" \text{ if } s \in L(P) \text{ else } s
            - If A = "replace":
                  f(s) = \text{sub}(P, R, s)
            - If A = "strip_trailing":
                  f(s) = \text{sub}(P, "", s) \text{ (anchored to string terminus)}

    Parameters:
        name: Mnemonic identifier of the filter.
        pattern: Standard regular expression pattern string.
        action: Operational mode ("replace", "drop_match", "strip_trailing").
        replacement: Substitution string when action is "replace" (supports backreferences).
        flags: List of flag names (e.g. ["IGNORECASE"]).
        pipeline: Target execution scope ("both", "streaming", "commit").
        enabled: Boolean switch to activate or deactivate the rule dynamically.
        description: Technical documentation explaining the rule's rationale.
    """

    def __init__(
        self,
        name: str,
        pattern: str,
        action: str = "replace",
        replacement: str = "",
        flags: list[str] | None = None,
        pipeline: str = "both",
        enabled: bool = True,
        description: str = "",
    ) -> None:
        self.name = name
        self.raw_pattern = pattern
        self.action = action.lower()
        self.replacement = replacement
        self.flags_list = flags or []
        self.pipeline = pipeline.lower()
        self.enabled = enabled
        self.description = description

        compiled_flags = 0
        for flag_name in self.flags_list:
            compiled_flags |= getattr(re, flag_name.upper(), 0)

        self._compiled: re.Pattern = re.compile(pattern, compiled_flags)

    def filter(self, text: str) -> str:
        if not self.enabled or not text:
            return text

        if self.action == "drop_match":
            if self._compiled.match(text.strip()):
                return ""
            return text

        if self.action == "replace":
            return self._compiled.sub(self.replacement, text)

        if self.action == "strip_trailing":
            return self._compiled.sub("", text)

        return text

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "pattern": self.raw_pattern,
            "action": self.action,
            "replacement": self.replacement,
            "flags": self.flags_list,
            "pipeline": self.pipeline,
            "enabled": self.enabled,
        }


class TextFilterPipeline(TextFilter):
    r"""Composite Pipeline orchestrating an ordered sequence of TextFilter transformations.

    Design Pattern:
        Implements the Pipeline / Filter Chain pattern and the Composite pattern.
        Adheres to OCP by allowing dynamic assembly, reordering, or injection of custom
        filters without altering the execution harness.

    Execution Invariant:
        Given an ordered sequence of filters F = [f_1, f_2, ..., f_n], the pipeline
        computes the function composition:
            (f_n \circ ... \circ f_2 \circ f_1)(s) = f_n(...(f_2(f_1(s)))...)
        If any filter produces an empty string (e.g. AcousticArtifactFilter detecting
        a keyboard transient), the pipeline short-circuits and immediately returns "".
    """

    def __init__(self, filters: list[TextFilter] | None = None) -> None:
        self._filters: list[TextFilter] = filters if filters is not None else []

    def add_filter(self, text_filter: TextFilter) -> TextFilterPipeline:
        self._filters.append(text_filter)
        return self

    def filter(self, text: str) -> str:
        current = text
        for text_filter in self._filters:
            if not current:
                return ""
            current = text_filter.filter(current)
        return current

    def execute(self, text: str) -> str:
        return self.filter(text)


class FilterRegistry:
    r"""Central repository and pipeline factory for declarative TextFilter rules.

    Design Pattern:
        Implements the Registry, Repository, and Factory patterns.
        Enforces the Open/Closed Principle (OCP) by decoupling filter definitions from code.
        Rule definitions are sourced hierarchically from:
            1. User configuration: ~/.config/voice-dictation/filters.json (SSOT if present)
            2. System / Repository default: Services/voice-dictation/filters.json
            3. In-memory canonical defaults (failsafe zero-downtime bootstrap)

    Extensibility without Code Modifications:
        Users and automation scripts can add, delete, test, or reconfigure filters
        via CLI (`dictate filter add/remove/list/test`) or by editing `filters.json`.
        Changes are loaded at startup or reloaded dynamically without editing `dictate.py`.
    """

    DEFAULT_RULES: ClassVar[list[dict[str, Any]]] = [
        {
            "name": "acoustic_artifact_filter",
            "description": "Rejects isolated mechanical switch click transients that resonate in vowel formants (500Hz-2500Hz)",
            "pattern": r"^\s*(?:[aeiouáéíóú]\.?|[aeiouáéíóú]{2}\.?|eh\.?|ah\.?|oh\.?|uh\.?)\s*$",
            "action": "drop_match",
            "replacement": "",
            "flags": ["IGNORECASE"],
            "pipeline": "both",
            "enabled": True,
        },
        {
            "name": "hesitation_ellipsis_filter",
            "description": "Eliminates cross-attention entropy hesitation dots (...) and Unicode ellipsis glyphs (…)",
            "pattern": r"(?:\.{2,}|…)",
            "action": "replace",
            "replacement": "",
            "flags": [],
            "pipeline": "both",
            "enabled": True,
        },
        {
            "name": "duplicate_punctuation_filter",
            "description": "Consolidates runs of repeated punctuation marks into canonical single glyphs",
            "pattern": r"([.,!?:;])\1+",
            "action": "replace",
            "replacement": r"\1",
            "flags": [],
            "pipeline": "both",
            "enabled": True,
        },
        {
            "name": "mid_sentence_pause_punctuation_filter",
            "description": "Replaces pause-induced full stops or semicolons before lowercase continuations with whitespace",
            "pattern": r"[.;]\s+([a-zñáéíóúü])",
            "action": "replace",
            "replacement": r" \1",
            "flags": [],
            "pipeline": "both",
            "enabled": True,
        },
        {
            "name": "trailing_slice_punctuation_filter",
            "description": "Strips uncommitted trailing punctuation on intermediate streaming slices to prevent burned dots",
            "pattern": r"[\s.,;:]+$",
            "action": "strip_trailing",
            "replacement": "",
            "flags": [],
            "pipeline": "streaming",
            "enabled": True,
        },
        {
            "name": "punctuation_leading_whitespace_filter",
            "description": "Removes erroneous whitespace before terminal punctuation marks",
            "pattern": r"\s+([.,;:!?])",
            "action": "replace",
            "replacement": r"\1",
            "flags": [],
            "pipeline": "both",
            "enabled": True,
        },
        {
            "name": "punctuation_trailing_whitespace_filter",
            "description": "Ensures standard whitespace follows terminal punctuation marks",
            "pattern": r"([.,;:!?])(?=[^\s.,;:!?0-9])",
            "action": "replace",
            "replacement": r"\1 ",
            "flags": [],
            "pipeline": "both",
            "enabled": True,
        },
        {
            "name": "inverted_spanish_punctuation_filter",
            "description": "Removes whitespace after Spanish opening punctuation marks (¿, ¡)",
            "pattern": r"([¿¡])\s+",
            "action": "replace",
            "replacement": r"\1",
            "flags": [],
            "pipeline": "both",
            "enabled": True,
        },
        {
            "name": "whitespace_normalization_filter",
            "description": "Collapses contiguous whitespace into a single space and strips outer padding",
            "pattern": r"\s+",
            "action": "replace",
            "replacement": " ",
            "flags": [],
            "pipeline": "both",
            "enabled": True,
        },
    ]

    _instance: FilterRegistry | None = None

    def __init__(self) -> None:
        self.config_file = os.path.join(CONFIG_DIR, "filters.json")
        self.default_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "filters.json")
        self._rules: list[RegexFilterRule] = []
        self.reload()

    @classmethod
    def get_instance(cls) -> FilterRegistry:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_active_config_path(self) -> str:
        if os.path.exists(self.config_file):
            return self.config_file
        if os.path.exists(self.default_file):
            return self.default_file
        return self.config_file

    def reload(self) -> None:
        rules_data = self._load_raw_rules()
        loaded_rules: list[RegexFilterRule] = []
        for item in rules_data:
            try:
                rule = RegexFilterRule(
                    name=item["name"],
                    pattern=item["pattern"],
                    action=item.get("action", "replace"),
                    replacement=item.get("replacement", ""),
                    flags=item.get("flags", []),
                    pipeline=item.get("pipeline", "both"),
                    enabled=item.get("enabled", True),
                    description=item.get("description", ""),
                )
                loaded_rules.append(rule)
            except (re.error, KeyError, ValueError, TypeError) as error:
                print(f"[dictate.py] FilterRegistry error compiling rule {item.get('name')}: {error}", file=sys.stderr)

        self._rules = loaded_rules

    def _load_raw_rules(self) -> list[dict[str, Any]]:
        path = self.get_active_config_path()
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as file:
                    data = json.load(file)
                    if isinstance(data, list):
                        return data
            except (OSError, json.JSONDecodeError) as error:
                print(f"[dictate.py] FilterRegistry read error ({path}): {error}", file=sys.stderr)

        self.save_raw_rules(self.DEFAULT_RULES)
        return list(self.DEFAULT_RULES)

    def save_raw_rules(self, raw_rules: list[dict[str, Any]]) -> None:
        try:
            os.makedirs(CONFIG_DIR, exist_ok=True)
            temp_path = f"{self.config_file}.tmp.{os.getpid()}"
            with open(temp_path, "w", encoding="utf-8") as file:
                json.dump(raw_rules, file, indent=2, ensure_ascii=False)
            os.replace(temp_path, self.config_file)
        except OSError as error:
            print(f"[dictate.py] FilterRegistry save error: {error}", file=sys.stderr)

    def get_rules(self) -> list[RegexFilterRule]:
        return list(self._rules)

    def add_rule(self, rule_dict: dict[str, Any]) -> None:
        current_raw = [r.to_dict() for r in self._rules]
        existing_index = next((i for i, r in enumerate(current_raw) if r["name"] == rule_dict["name"]), None)
        if existing_index is not None:
            current_raw[existing_index] = rule_dict
        else:
            current_raw.append(rule_dict)
        self.save_raw_rules(current_raw)
        self.reload()

    def remove_rule(self, rule_name: str) -> bool:
        current_raw = [r.to_dict() for r in self._rules]
        new_raw = [r for r in current_raw if r["name"] != rule_name]
        if len(new_raw) == len(current_raw):
            return False
        self.save_raw_rules(new_raw)
        self.reload()
        return True

    def get_pipeline_filters(self) -> tuple[list[TextFilter], list[TextFilter]]:
        streaming_filters: list[TextFilter] = []
        commit_filters: list[TextFilter] = []

        for rule in self._rules:
            if not rule.enabled:
                continue
            if rule.pipeline in ("streaming", "both"):
                streaming_filters.append(rule)
            if rule.pipeline in ("commit", "both"):
                commit_filters.append(rule)

        return streaming_filters, commit_filters

    def build_pipelines(self) -> tuple[TextFilterPipeline, TextFilterPipeline]:
        streaming_filters, commit_filters = self.get_pipeline_filters()
        return TextFilterPipeline(streaming_filters), TextFilterPipeline(commit_filters)


STREAMING_SLICE_PIPELINE, UTTERANCE_COMMIT_PIPELINE = FilterRegistry.get_instance().build_pipelines()


def update_pipelines_in_place() -> None:
    streaming_filters, commit_filters = FilterRegistry.get_instance().get_pipeline_filters()
    STREAMING_SLICE_PIPELINE._filters = streaming_filters
    UTTERANCE_COMMIT_PIPELINE._filters = commit_filters



def transcribe(wav_path: str) -> str:
    router = STTRouter.get_instance()
    backend = router.resolve_backend()
    enter(PHASE_STT, detail=f"{backend.name}_decode")
    notify("⚡ Transcribing audio…", "process-working-symbolic")
    accepted_segments = backend.transcribe(
        wav_path,
        language="es",
        vad_filter=True,
    )
    consolidated_text = " ".join(accepted_segments).strip()
    cleanup_runtime_files(wav_path)

    if consolidated_text and is_hallucination_solo(consolidated_text):
        return ""
    return UTTERANCE_COMMIT_PIPELINE.execute(consolidated_text)


def transcribe_audio_array(
    audio_float32,
    vad_filter: bool = False,
    without_timestamps: bool = True,
    is_partial_slice: bool = False,
) -> str:
    try:
        if hasattr(audio_float32, "reshape"):
            audio_float32 = audio_float32.reshape(-1)
        if hasattr(audio_float32, "size") and audio_float32.size == 0:
            return ""

        router = STTRouter.get_instance()
        backend = router.resolve_backend()
        accepted_segments = backend.transcribe(
            audio_float32,
            language="es",
            vad_filter=vad_filter,
            without_timestamps=without_timestamps,
        )

        consolidated_text = " ".join(accepted_segments).strip()
        if consolidated_text and is_hallucination_solo(consolidated_text):
            return ""
        if is_partial_slice:
            return STREAMING_SLICE_PIPELINE.execute(consolidated_text)
        return UTTERANCE_COMMIT_PIPELINE.execute(consolidated_text)
    except (RuntimeError, ValueError, OSError) as error:
        print(f"[dictate.py] transcribe_audio_array error: {error}", flush=True)
        return ""


def compute_stream_delta(committed_text: str, new_text: str) -> tuple[str, str]:
    committed_clean = committed_text.strip()
    new_clean = new_text.strip()
    if not new_clean:
        return "", committed_text
    if not committed_clean:
        return new_clean, new_clean

    if new_clean.startswith(committed_clean):
        delta = new_clean[len(committed_clean):]
        return delta, new_clean

    committed_words = committed_clean.split()
    new_words = new_clean.split()

    def normalize_word(word: str) -> str:
        return re.sub(r"[\W_]+", "", word.lower())

    matching_word_count = 0
    while matching_word_count < len(committed_words) and matching_word_count < len(new_words):
        if normalize_word(committed_words[matching_word_count]) == normalize_word(new_words[matching_word_count]):
            matching_word_count += 1
        else:
            break

    if matching_word_count >= len(committed_words):
        additional_words = new_words[matching_word_count:]
        if additional_words:
            delta = " " + " ".join(additional_words)
            return delta, " ".join(new_words)
        return "", committed_clean

    if matching_word_count > 0 and len(new_words) > len(committed_words):
        additional_words = new_words[len(committed_words):]
        if additional_words:
            delta = " " + " ".join(additional_words)
            return delta, " ".join(new_words)

    index = new_clean.lower().find(committed_clean.lower())
    if index != -1:
        end_index = index + len(committed_clean)
        delta = new_clean[end_index:]
        return delta, new_clean

    return "", committed_clean


def extract_verbal_enter(text: str) -> tuple[str, bool]:
    stripped_text = text.strip()
    if not stripped_text:
        return "", False

    if VERBAL_ENTER_ONLY_REGEX.match(stripped_text):
        return "", True

    match = VERBAL_ENTER_TAIL_REGEX.search(stripped_text)
    if match:
        body = stripped_text[: match.start()].rstrip(" 	,.;:…-")
        return body, True

    return stripped_text, False


def is_brain_loaded() -> bool:
    try:
        request = urllib.request.Request(f"{LLM_URL}/models")
        with urllib.request.urlopen(request, timeout=0.3) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                return bool(data.get("data"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        pass
    return False


class BrainState:
    OFF = "off"
    STANDBY = "standby"
    THINKING = "thinking"
    QUEUED = "queued"
    RUNNING = "running"
    ERROR = "error"


class ActionType:
    WRITE = "write"
    HYPRLAND = "hyprland"
    KEY = "key"
    NONE = "none"


class ActionRouter:
    @staticmethod
    def resolve_action(text: str) -> dict[str, Any]:
        raw_text = text.strip()
        normalized_text = raw_text.lower()

        if re.search(r"\b(ir\s+al\s+panel\s+1|panel\s+1|workspace\s+1|pantalla\s+1|escritorio\s+1|switch\s+to\s+panel\s+1)\b", normalized_text):
            return {
                "action": ActionType.HYPRLAND,
                "target": "workspace_1",
                "lua": "hl.dispatch(hl.dsp.focus({ workspace = 1 }))",
                "label": "Switch to Panel 1 (Workspace 1)",
            }

        if re.search(r"\b(ir\s+al\s+panel\s+2|panel\s+2|workspace\s+2|pantalla\s+2|escritorio\s+2|switch\s+to\s+panel\s+2)\b", normalized_text):
            return {
                "action": ActionType.HYPRLAND,
                "target": "workspace_2",
                "lua": "hl.dispatch(hl.dsp.focus({ workspace = 2 }))",
                "label": "Switch to Panel 2 (Workspace 2)",
            }

        if re.search(r"\b(foco\s+(?:en\s+)?panel\s+3|panel\s+3|workspace\s+3|foco\s+terminal|foco\s+consola|ir\s+al\s+panel\s+3|focus\s+terminal)\b", normalized_text):
            return {
                "action": ActionType.HYPRLAND,
                "target": "workspace_3",
                "lua": "hl.dispatch(hl.dsp.focus({ workspace = 3 }))",
                "label": "Focus Panel 3 (Workspace 3 Terminal)",
            }

        if re.search(r"\b(foco\s+(?:en\s+)?monitor\s+derecho|monitor\s+derecho|pantalla\s+derecha|segundo\s+monitor|focus\s+right\s+monitor)\b", normalized_text):
            return {
                "action": ActionType.HYPRLAND,
                "target": "monitor_right",
                "lua": 'hl.dispatch(hl.dsp.focus({ monitor = "HDMI-A-1" }))',
                "label": "Focus Right Monitor (HDMI-A-1 AOC)",
            }

        if re.search(r"\b(foco\s+(?:en\s+)?panel\s+chromium|panel\s+chromium|foco\s+chromium|abrir\s+chromium|ver\s+en\s+chromium|focus\s+chromium)\b", normalized_text):
            return {
                "action": ActionType.HYPRLAND,
                "target": "chromium",
                "lua": 'for _, w in ipairs(hl.get_windows()) do if w.class and string.lower(w.class):find("chromium") then hl.dispatch(hl.dsp.focus({ window = w })) end end return "ok"',
                "label": "Focus Chromium Stage Window (Workspace 4)",
            }

        if re.search(r"\b(listo\s+kodex|ok\s+kodex|dale\s+enter|presion[aá]\s+enter|dar\s+enter|apret[aá]\s+enter|press\s+enter)\b", normalized_text) or normalized_text in ("enter", "listo", "enviar", "submit"):
            return {"action": ActionType.KEY, "target": "Return", "label": "Press Return"}

        if re.search(r"\b(borra\s+eso|borrar\s+eso|borrar|backspace|delete\s+that)\b", normalized_text):
            return {"action": ActionType.KEY, "target": "Backspace", "label": "Press Backspace"}

        if re.search(r"\b(tabular|tabulaci[oó]n|tab)\b", normalized_text):
            return {"action": ActionType.KEY, "target": "Tab", "label": "Press Tab"}

        if re.search(r"\b(escapar|escape|cancelar)\b", normalized_text):
            return {"action": ActionType.KEY, "target": "Escape", "label": "Press Escape"}

        refined_text = ActionRouter._refine_text_with_thinking(raw_text)
        return {
            "action": ActionType.WRITE,
            "target": refined_text,
            "label": f"Write text ({len(refined_text)} chars)",
        }

    @staticmethod
    def _refine_text_with_thinking(text: str) -> str:
        trimmed = text.strip()
        if not trimmed:
            return ""

        capitalized_fallback = trimmed[0].upper() + trimmed[1:] if not trimmed[0].isupper() else trimmed

        if not is_brain_loaded():
            return capitalized_fallback

        system_prompt = (
            "You are an expert voice dictation assistant on Linux Hyprland.\n"
            "Format the given spoken sentence with clean punctuation, proper casing, and grammar.\n"
            "Output ONLY the final punctuated text without markdown or commentary."
        )
        payload = {
            "model": "local-model",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            "temperature": 0.0,
            "max_tokens": 160,
        }
        try:
            req = urllib.request.Request(
                f"{LLM_URL}/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=2.5) as response:
                if response.status == 200:
                    response_data = json.loads(response.read().decode("utf-8"))
                    content = response_data["choices"][0]["message"]["content"].strip()
                    if content.startswith('"') and content.endswith('"'):
                        content = content[1:-1].strip()
                    if content:
                        return content
        except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError) as error:
            print(f"[router] LLM refinement fallback ({error})", flush=True)

        return capitalized_fallback

    @staticmethod
    def execute_action(action: dict[str, Any], target_address: str | None = None, target_name: str = "") -> None:
        action_type = action.get("action")
        target = action.get("target", "")

        if action_type == ActionType.HYPRLAND:
            lua_code = action.get("lua", "")
            if lua_code:
                print(f"[router] Hyprland action: {action.get('label')}", flush=True)
                subprocess.run(["hyprctl", "eval", lua_code], check=False, capture_output=True)
                notify(f"🖥️ Hyprland: {action.get('label')}", "preferences-system-windows-symbolic")
            return

        if target_address and shutil.which("hyprctl"):
            subprocess.run(
                ["hyprctl", "dispatch", "focuswindow", f"address:{target_address}"],
                check=False,
                capture_output=True,
            )
            time.sleep(FOCUS_SETTLE_SECONDS)

        if action_type == ActionType.KEY:
            print(f"[router] Key action: {target}", flush=True)
            if shutil.which("wtype"):
                subprocess.run(["wtype", "-k", target], check=False)
            notify(f"🧠 Key: {target}", "input-keyboard-symbolic")

        elif action_type == ActionType.WRITE:
            print(f"[router] Write action: {target!r}", flush=True)
            if shutil.which("wtype"):
                subprocess.run(["wtype", "-s", "1", "--", target], check=False)
            notify(f"✍️ Typed: {target[:35]}...", "document-edit-symbolic")


class QueueManager:
    _instance: QueueManager | None = None

    @classmethod
    def get_instance(cls) -> QueueManager:
        if cls._instance is None:
            cls._instance = QueueManager()
        return cls._instance

    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.accumulated_text: str = ""
        self.pile: int = 0
        self.target_address: str | None = None
        self.target_name: str = ""

    def push(self, text: str, target_address: str | None = None, target_name: str = "") -> int:
        clean_text = text.strip()
        if not clean_text:
            return self.pile
        with self.lock:
            if not self.accumulated_text:
                self.accumulated_text = clean_text
            else:
                self.accumulated_text = f"{self.accumulated_text} {clean_text}".strip()
            self.pile = min(self.pile + 1, MAX_QUEUE_PILE_SIZE)
            self.target_address = target_address or self.target_address
            self.target_name = target_name or self.target_name
            FSMLogManager.get_instance().log_fsm2_transition(
                "ACCUMULATING",
                f"QUEUE_MANAGER(pile={self.pile})",
                detail=f"queued_chunk: {clean_text[:35]!r}",
            )
            return self.pile

    def has_pending(self) -> bool:
        with self.lock:
            return bool(self.accumulated_text) and self.pile > 0

    def pop_consolidated(self) -> tuple[str, str | None, str]:
        with self.lock:
            old_pile = self.pile
            consolidated_text = self.accumulated_text
            address = self.target_address
            name = self.target_name
            self.accumulated_text = ""
            self.pile = 0
            self.target_address = None
            self.target_name = ""
            FSMLogManager.get_instance().log_fsm2_transition(
                f"QUEUE_MANAGER(pile={old_pile})",
                "DISPATCH_CHUNK",
                detail=f"dispatched_chunk: {consolidated_text[:35]!r}",
            )
            return consolidated_text, address, name

    def clear(self) -> None:
        with self.lock:
            self.accumulated_text = ""
            self.pile = 0
            self.target_address = None
            self.target_name = ""


class BrainFSM:
    _instance: BrainFSM | None = None

    @classmethod
    def get_instance(cls) -> BrainFSM:
        if cls._instance is None:
            cls._instance = BrainFSM()
        return cls._instance

    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.state = BrainState.STANDBY if is_brain_active() else BrainState.OFF
        self.pile = 0
        self.detail = ""
        self.generation = 0
        self.is_running_lock = False
        self._last_logged_state = self.state
        self.write_state("initialized")

    def sync_active(self) -> None:
        active = is_brain_active()
        with self.lock:
            if not active and self.state != BrainState.OFF:
                self.state = BrainState.OFF
                self.pile = 0
                self.is_running_lock = False
                self.write_state("brain_disabled")
            elif active and self.state == BrainState.OFF:
                self.state = BrainState.STANDBY
                self.pile = 0
                self.write_state("brain_enabled")

    def set_active(self, active: bool) -> None:
        set_brain_active(active)
        self.sync_active()

    def is_running_locked(self) -> bool:
        with self.lock:
            return self.is_running_lock or self.state == BrainState.RUNNING

    def can_receive_chunk(self) -> bool:
        with self.lock:
            self.sync_active()
            return self.state == BrainState.STANDBY and not self.is_running_lock

    def get_state_dict(self) -> dict[str, Any]:
        self.sync_active()
        return {
            "brain_active": is_brain_active(),
            "state": self.state,
            "pile": self.pile,
            "brain_thinking": self.state in (BrainState.THINKING, BrainState.QUEUED),
            "brain_running": self.state == BrainState.RUNNING,
            "brain_loaded": is_brain_loaded(),
            "detail": self.detail,
        }

    def write_state(self, detail: str = "", state_override: str | None = None, pile: int | None = None) -> None:
        if detail:
            self.detail = detail
        current_state = state_override or self.state
        current_pile = self.pile if pile is None else pile
        previous_state = getattr(self, "_last_logged_state", None) or self.state
        self._last_logged_state = current_state
        FSMLogManager.get_instance().log_fsm3_transition(
            previous_state,
            current_state,
            detail=f"pile={current_pile} {self.detail}".strip(),
        )
        payload = {
            "state": current_state,
            "pile": current_pile,
            "detail": self.detail,
            "timestamp": time.time(),
        }
        try:
            temporary_file = f"{BRAIN_STATE_FILE}.tmp.{os.getpid()}"
            with open(temporary_file, "w", encoding="utf-8") as file:
                json.dump(payload, file, ensure_ascii=False)
            os.replace(temporary_file, BRAIN_STATE_FILE)
        except OSError as error:
            print(f"[brain] state write error: {error}", flush=True)

        try:
            if current_state in (BrainState.THINKING, BrainState.QUEUED):
                with open(THINKING_FILE, "w", encoding="utf-8") as file:
                    file.write("1\n")
            elif os.path.exists(THINKING_FILE):
                os.remove(THINKING_FILE)
        except OSError:
            pass

    def sync_queue_status(self, pile: int) -> None:
        with self.lock:
            self.pile = pile
            if self.state in (BrainState.THINKING, BrainState.RUNNING):
                self.write_state(detail=f"queued_pile_{pile}", state_override=BrainState.QUEUED, pile=pile)

    def dispatch_direct(self, chunk: str, target_address: str | None, target_name: str) -> bool:
        """Receive consolidated chunk from FSM 2, set Brain to THINKING (Green), and launch worker."""
        with self.lock:
            self.sync_active()
            if self.state == BrainState.OFF:
                return False
            self.state = BrainState.THINKING
            self.pile = 1
            self.generation += 1
            current_generation = self.generation
            self.write_state(f"thinking:{chunk[:25]}", pile=1)
            print(f"[brain] FSM 3 -> THINKING (Green) chunk={chunk!r}", flush=True)

        threading.Thread(
            target=self._worker,
            args=(chunk, current_generation, target_address, target_name, QueueManager.get_instance()),
            daemon=True,
            name=f"brain-worker-gen{current_generation}",
        ).start()
        return True

    def dispatch_from_queue(self, queue_manager: QueueManager) -> bool:
        with self.lock:
            if not self.can_receive_chunk() or not queue_manager.has_pending():
                return False
            chunk, address, name = queue_manager.pop_consolidated()
        return self.dispatch_direct(chunk, address, name)

    def _worker(self, chunk: str, generation: int, target_address: str | None, target_name: str, queue_manager: QueueManager) -> None:
        try:
            action = ActionRouter.resolve_action(chunk)
        except (RuntimeError, ValueError, OSError, json.JSONDecodeError) as error:
            print(f"[brain] ActionRouter resolution error: {error}", flush=True)
            self.trigger_error(detail=f"router_error:{str(error)[:25]}", generation=generation, queue_manager=queue_manager)
            return

        with self.lock:
            if generation != self.generation:
                return
            self.state = BrainState.RUNNING
            self.is_running_lock = True
            self.write_state(f"running_{action.get('action')}", pile=1)
            print(f"[brain] FSM 3 -> RUNNING (Orange) action={action}", flush=True)
            FSMLogManager.get_instance().log_fsm1_transition(
                "MIC_ON",
                "MIC_ON(LOCKOUT)",
                detail=f"action_lockout_engaged:{action.get('action')}",
            )

        try:
            ActionRouter.execute_action(action, target_address, target_name)
        except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
            print(f"[brain] action execution error: {error}", flush=True)
        finally:
            with self.lock:
                self.is_running_lock = False
                self.pile = 0
                self.state = BrainState.STANDBY
                self.write_state("standby_ready", pile=0)
                print("[brain] FSM 3 -> STANDBY (Light Gray)", flush=True)
                FSMLogManager.get_instance().log_fsm1_transition(
                    "MIC_ON(LOCKOUT)",
                    "MIC_ON",
                    detail="action_lockout_released",
                )

            if queue_manager.has_pending():
                print("[brain] draining queued chunks accumulated during execution", flush=True)
                self.dispatch_from_queue(queue_manager)

    def trigger_error(self, detail: str = "error", generation: int | None = None, queue_manager: QueueManager | None = None) -> None:
        with self.lock:
            if generation is not None and generation != self.generation:
                return
            self.state = BrainState.ERROR
            self.pile = 0
            self.is_running_lock = False
            self.write_state(detail, pile=0)
            print(f"[brain] FSM 3 -> ERROR (Red) detail={detail}", flush=True)

        notify(f"⚠️ Brain: {detail} (recovering in 3s)", "dialog-warning-symbolic")

        def recover():
            time.sleep(3.0)
            with self.lock:
                if self.state == BrainState.ERROR:
                    self.pile = 0
                    self.state = BrainState.STANDBY
                    self.write_state("recovered_ready", pile=0)
                    print("[brain] FSM 3 -> auto-recovered to STANDBY", flush=True)
            if queue_manager and queue_manager.has_pending():
                self.dispatch_from_queue(queue_manager)

        threading.Thread(target=recover, daemon=True).start()


def dispatch_chunk_to_brain_async(
    chunk_text: str,
    raw_text: str,
    paste_address: str | None,
    paste_name: str,
    *,
    is_end_of_message: bool = False,
    enter_pressed: bool = False,
) -> None:
    chunk_payload = {
        "text": chunk_text,
        "raw_text": raw_text,
        "timestamp": time.time(),
        "target_address": paste_address,
        "target_name": paste_name,
        "is_end_of_message": is_end_of_message,
        "enter_pressed": enter_pressed,
        "brain_active": is_brain_active(),
    }
    try:
        temporary_file = f"{LAST_CHUNK_FILE}.tmp.{os.getpid()}"
        with open(temporary_file, "w", encoding="utf-8") as file:
            json.dump(chunk_payload, file, ensure_ascii=False)
        os.replace(temporary_file, LAST_CHUNK_FILE)
    except OSError as error:
        print(f"[dictate.py] error saving last chunk: {error}", flush=True)

    hook_scripts = [
        os.getenv("DICTATE_BRAIN_HOOK"),
        os.path.join(CONFIG_DIR, "brain_hook.sh"),
        os.path.join(CONFIG_DIR, "brain_hook"),
        os.path.expanduser("~/.local/bin/kdx-dictate-brain"),
        os.path.expanduser("~/.local/bin/dictate-brain"),
    ]
    for hook in hook_scripts:
        if hook and os.path.isfile(hook) and os.access(hook, os.X_OK):
            try:
                subprocess.Popen(
                    [hook, LAST_CHUNK_FILE],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                print(f"[dictate.py] external brain hook executed: {hook}", flush=True)
                break
            except OSError as error:
                print(f"[dictate.py] brain hook error {hook}: {error}", flush=True)


def paste_to_target_window(
    text: str,
    target_address: str | None,
    target_name: str,
    press_enter: bool = False,
) -> bool:
    if not text and not press_enter:
        return False

    live_address, _ = get_active_window_info()
    if target_address and target_address != live_address and shutil.which("hyprctl"):
        subprocess.run(
            ["hyprctl", "dispatch", "focuswindow", f"address:{target_address}"],
            check=False,
            capture_output=True,
        )
        time.sleep(FOCUS_SETTLE_SECONDS)

    if not text and press_enter:
        enter(PHASE_PASTE, detail=f"enter_only->{target_name[:40]}")
        if shutil.which("wtype"):
            subprocess.run(["wtype", "-s", str(PASTE_SETTLE_MILLISECONDS), "-k", "Return"], check=False)
        notify(f"✅ Return -> {target_name}", "emblem-ok-symbolic")
        return True

    enter(PHASE_PASTE, detail=f"to:{target_name[:40]} enter={press_enter}")

    if shutil.which("wl-copy"):
        try:
            subprocess.run(["wl-copy"], input=text.encode("utf-8"), check=False, timeout=1.0)
        except (subprocess.SubprocessError, OSError):
            pass

    if shutil.which("wtype"):
        if text:
            subprocess.run(["wtype", "-s", "1", "--", text], check=False)
        if press_enter:
            if text:
                time.sleep(PASTE_ENTER_DELAY_MILLISECONDS / 1000.0)
            subprocess.run(["wtype", "-k", "Return"], check=False)

    suffix = " + Return" if press_enter else ""
    notify(f'✅ Dispatched{suffix} to {target_name}: "{text}"', "emblem-ok-symbolic")
    return True


def dispatch_to_stream(
    text: str,
    target_address: str | None,
    target_name: str,
    verbal_enter: bool = False,
) -> bool:
    """Stream mode (Brain OFF): writes directly to the focused target window via wtype."""
    clean_text = text.strip()
    if not clean_text and not verbal_enter:
        return False
    live_address, live_name = get_active_window_info()
    address = live_address or target_address
    name = live_name or target_name

    enter(PHASE_WRITING, detail=f"streaming_live:{clean_text[:25]}")
    payload = f"{clean_text} " if clean_text else ""
    pasted = paste_to_target_window(payload, address, name, press_enter=verbal_enter)
    enter(PHASE_REC, detail="standby_listening")
    return pasted


def dispatch_to_thinking(
    text: str,
    target_address: str | None,
    target_name: str,
    is_space: bool = False,
) -> bool:
    """Thinking mode (Brain ON): accumulates words in QueueManager; on space/silence sends all words to Brain without analysis."""
    queue_manager = QueueManager.get_instance()
    brain = BrainFSM.get_instance()

    clean_text = text.strip()
    if clean_text:
        pile = queue_manager.push(clean_text, target_address, target_name)
        if brain.state != BrainState.STANDBY:
            brain.sync_queue_status(pile)

    if is_space and queue_manager.has_pending():
        if brain.can_receive_chunk():
            chunk, address, name = queue_manager.pop_consolidated()
            # Dictator indicator transitions to ORANGE (busy / dispatching)
            enter(PHASE_BUSY, detail=f"dispatched_to_brain:{chunk[:25]}")
            # Direct dispatch to Brain without client analysis; Brain turns GREEN upon receipt
            dispatched = brain.dispatch_direct(chunk, address, name)
            enter(PHASE_REC, detail="standby_listening")
            return dispatched
        else:
            brain.sync_queue_status(queue_manager.pile)
            print(f"[queue_manager] words buffered in queue (pile={queue_manager.pile}): Brain busy", flush=True)
            return True
    return False


def cmd_start() -> None:
    if is_mic_muted():
        notify("⚠️ Microphone is muted — unmute before dictating", "dialog-warning-symbolic")
        print("[dictate.py] start blocked: microphone muted", flush=True)
        return

    write_mode("stream")
    snapshot = reconcile()
    phase = snapshot.get("phase") or PHASE_IDLE
    if phase in PHASES_WORKER or read_pid() is not None:
        print(f"[dictate.py] start ignored (phase={phase} pid={read_pid()})", flush=True)
        return

    if phase in (PHASE_OK, PHASE_ERR):
        clear_to_idle(detail="preempt_flash")

    cleanup_runtime_files(STOP_FILE)
    target_address, target_name = get_active_window_info()
    started = time.time()
    enter(
        PHASE_LOADING,
        started_at=started,
        rec_started_at=None,
        stop_reason=None,
        target_address=target_address,
        target_title=target_name,
        detail="loading_model",
        pid=None,
    )

    with open(LOG_FILE, "a", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "worker"],
            start_new_session=True,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            close_fds=True,
        )

    write_pid(process.pid)
    enter(PHASE_LOADING, pid=process.pid, detail="loading_model")
    FSMLogManager.get_instance().log_fsm1_transition("MIC_OFF", "MIC_ON", detail=f"worker_spawned pid={process.pid}")
    configuration = load_config()
    notify(
        f"🎙️ Continuous dictation ({configuration['silence_sec']:.1f}s silence auto-commits, Super+D stops)",
        "media-record-symbolic",
        timeout_ms="2500",
    )


def cmd_stop(force: bool = False) -> None:
    snapshot = reconcile()
    phase = snapshot.get("phase") or PHASE_IDLE
    pid = read_pid()

    if pid is None:
        if phase in PHASES_CAN_STOP or phase in PHASES_BUSY:
            clear_to_idle(detail="stop_no_pid")
        FSMLogManager.get_instance().log_fsm1_transition("MIC_ON", "MIC_OFF", detail="stop_no_pid")
        return

    if phase in PHASES_BUSY:
        reason = "force" if force else "toggle"
        FSMLogManager.get_instance().log_fsm1_transition("MIC_ON", "MIC_OFF", detail=f"stop_requested reason={reason}")
        try:
            with open(STOP_FILE, "w", encoding="utf-8") as file:
                file.write(reason)
        except OSError:
            pass
        try:
            os.kill(pid, signal.SIGUSR1)
        except OSError:
            pass
        print(f"[dictate.py] stop deferred (phase={phase} reason={reason})", flush=True)
        return

    if phase not in PHASES_CAN_STOP and not force:
        if phase in (PHASE_OK, PHASE_ERR):
            reason = "force" if force else "toggle"
            try:
                with open(STOP_FILE, "w", encoding="utf-8") as file:
                    file.write(reason)
            except OSError:
                pass
            try:
                os.kill(pid, signal.SIGUSR1)
            except OSError:
                pass
            print(f"[dictate.py] stop during flash phase={phase}", flush=True)
            return
        print(f"[dictate.py] stop ignored (phase={phase})", flush=True)
        return

    if not force:
        started_at = snapshot.get("started_at")
        if isinstance(started_at, (int, float)) and time.time() - started_at < BOUNCE_GUARD_SECONDS:
            print("[dictate.py] stop ignored (bounce guard)", flush=True)
            return

    reason = "force" if force else "toggle"
    try:
        with open(STOP_FILE, "w", encoding="utf-8") as file:
            file.write(reason)
    except OSError:
        pass
    try:
        os.kill(pid, signal.SIGUSR1)
    except OSError:
        pass
    enter(PHASE_STOPPING, stop_reason=reason, detail="stop_signaled")


def cmd_cycle() -> None:
    snapshot = reconcile()
    phase = snapshot.get("phase") or PHASE_IDLE
    current_mode = read_mode()
    print(f"[dictate.py] cycle current_phase={phase} current_mode={current_mode}", flush=True)

    if phase == PHASE_IDLE or current_mode == "off":
        if is_mic_muted():
            notify("⚠️ Microphone is muted — unmute before dictating", "dialog-warning-symbolic")
            print("[dictate.py] cycle blocked: microphone muted", flush=True)
            return
        write_mode("stream")
        cmd_start()
        notify("🎙️ Dictation active (Stream)", "audio-input-microphone-symbolic")
        return

    write_mode("off")
    cmd_stop(force=phase not in PHASES_CAN_STOP)
    notify("⏹ Dictation stopped", "process-stop-symbolic")


def cmd_toggle() -> None:
    cmd_cycle()


def cmd_worker() -> None:
    if is_mic_muted():
        print("[dictate.py] worker abort: microphone muted", flush=True)
        clear_to_idle(detail="mic_muted_start")
        return

    global SNAPSHOT_CACHE
    install_stop_signal_handlers()
    write_pid(os.getpid())
    SNAPSHOT_CACHE = read_snapshot()
    enter(PHASE_LOADING, pid=os.getpid(), detail="loading_model")

    target_address, target_name = get_active_window_info()
    enter(
        PHASE_LOADING,
        target_address=target_address,
        target_title=target_name,
        pid=os.getpid(),
        detail="loading_model",
    )

    router = STTRouter.get_instance()
    backend = router.resolve_backend()
    backend.load()

    brain = BrainFSM.get_instance()
    brain.sync_active()

    enter(PHASE_REC, detail="standby_listening")

    np, sd, _ = load_audio_libraries()

    silence_end_sec = get_silence_end_sec()
    preroll_length = max(4, int(PRE_ROLL_SECONDS / POLL_INTERVAL_SECONDS))
    preroll_buffer: collections.deque = collections.deque(maxlen=preroll_length)
    incoming_audio_queue: list = []

    def audio_callback(indata, _frames, _time_info, status):
        if status:
            print(f"[dictate.py] audio status: {status}", file=sys.stderr, flush=True)
        raw_samples = indata.copy()
        incoming_audio_queue.append((raw_samples, calculate_chunk_rms_normalized(raw_samples, np)))

    speech_heard = False
    speech_accumulated_seconds = 0.0
    last_speech_monotonic: float | None = None
    last_mute_check_monotonic = 0.0
    noise_samples: list[float] = []
    speech_rms = SPEECH_RMS_FLOOR
    silence_rms = SILENCE_RMS_FLOOR
    calibration_done = False
    prev_chunk_ended_sentence = True

    utterance_chunks: list = []
    stop_reason = "unknown"
    configuration = load_config()
    max_continuous_sec = float(configuration.get("max_continuous_speech_sec", 6.0))
    strip_intermediate_dots = bool(configuration.get("strip_intermediate_dots", True))
    auto_lowercase = bool(configuration.get("auto_lowercase_continuation", True))

    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="int16",
            callback=audio_callback,
            blocksize=int(SAMPLE_RATE * POLL_INTERVAL_SECONDS),
        ):
            print("[dictate.py] audio stream opened, entering worker loop", flush=True)
            while True:
                current_time = time.monotonic()

                if current_time - last_mute_check_monotonic >= 0.15:
                    last_mute_check_monotonic = current_time
                    if is_mic_muted():
                        stop_reason = "mic_muted"
                        print("[dictate.py] microphone muted detected, cutting session", flush=True)
                        break

                if STOP_REQUESTED_STATE["flag"] or os.path.exists(STOP_FILE):
                    stop_reason = "toggle"
                    if os.path.exists(STOP_FILE):
                        try:
                            with open(STOP_FILE, encoding="utf-8") as file:
                                file_reason = file.read().strip()
                            if file_reason in ("toggle", "max", "force", "mic_muted"):
                                stop_reason = file_reason
                        except OSError:
                            pass
                    break

                brain_active = is_brain_active()
                brain.sync_active()
                if brain_active and brain.is_running_locked():
                    incoming_audio_queue.clear()
                    preroll_buffer.clear()
                    utterance_chunks.clear()
                    speech_heard = False
                    speech_accumulated_seconds = 0.0
                    time.sleep(POLL_INTERVAL_SECONDS)
                    continue

                while incoming_audio_queue:
                    chunk_raw, rms = incoming_audio_queue.pop(0)
                    block_delta = POLL_INTERVAL_SECONDS

                    if not calibration_done:
                        preroll_buffer.append(chunk_raw)
                        noise_samples.append(rms)
                        if len(noise_samples) >= int(NOISE_CALIBRATION_SECONDS / POLL_INTERVAL_SECONDS):
                            noise_sorted = sorted(noise_samples)
                            noise_mid = noise_sorted[len(noise_sorted) // 2]
                            speech_rms = max(SPEECH_RMS_FLOOR, noise_mid * 2.8)
                            silence_rms = max(SILENCE_RMS_FLOOR, noise_mid * 1.4)
                            speech_rms = max(speech_rms, silence_rms + 0.008)
                            calibration_done = True
                            print(f"[dictate.py] VAD calibrated: noise={noise_mid:.4f} speech>={speech_rms:.4f}", flush=True)
                        continue

                    if not speech_heard:
                        preroll_buffer.append(chunk_raw)
                        if rms >= speech_rms:
                            speech_accumulated_seconds += block_delta
                            last_speech_monotonic = time.monotonic()
                            if speech_accumulated_seconds >= MIN_SPEECH_DURATION_SECONDS:
                                speech_heard = True
                                utterance_chunks.extend(preroll_buffer)
                                preroll_buffer.clear()
                                if brain_active:
                                    enter(PHASE_LISTENING, detail="listening_utterance")
                                else:
                                    enter(PHASE_WRITING, detail="streaming_live")
                        else:
                            speech_accumulated_seconds = max(0.0, speech_accumulated_seconds - block_delta * 0.5)
                    else:
                        utterance_chunks.append(chunk_raw)
                        if rms >= speech_rms:
                            speech_accumulated_seconds += block_delta
                            last_speech_monotonic = time.monotonic()

                if not calibration_done:
                    time.sleep(POLL_INTERVAL_SECONDS)
                    continue

                if speech_heard:
                    chunk_duration = len(utterance_chunks) * POLL_INTERVAL_SECONDS
                    is_silence = False
                    quiet_duration = 0.0
                    if last_speech_monotonic is not None:
                        quiet_duration = time.monotonic() - last_speech_monotonic
                        if quiet_duration >= silence_end_sec:
                            is_silence = True

                    # Natural pause (silence detected >= silence_end_sec)
                    # OR soft inter-word boundary during continuous speech without clipping words
                    is_soft_boundary = False
                    if chunk_duration >= 2.5 and quiet_duration >= 0.18:
                        is_soft_boundary = True
                    elif chunk_duration >= max_continuous_sec:
                        is_soft_boundary = True

                    if is_silence or is_soft_boundary:
                        if utterance_chunks:
                            audio_float32 = np.concatenate(utterance_chunks, axis=0).reshape(-1).astype(np.float32) / 32768.0
                        else:
                            audio_float32 = np.zeros(0, dtype=np.float32)

                        if is_soft_boundary and not is_silence and len(utterance_chunks) > 4:
                            # Preserve last 200ms as overlap to avoid syllable truncation on continuous speech
                            preroll_slice = list(utterance_chunks)[-4:]
                            utterance_chunks.clear()
                            utterance_chunks.extend(preroll_slice)
                        else:
                            utterance_chunks.clear()

                        speech_heard = not is_silence
                        speech_accumulated_seconds = 0.0
                        last_speech_monotonic = None if is_silence else time.monotonic()

                        if audio_float32.size >= int(SAMPLE_RATE * 0.10):
                            recognized_text = transcribe_audio_array(
                                audio_float32,
                                vad_filter=False,
                                without_timestamps=True,
                                is_partial_slice=not is_silence,
                            )
                            if recognized_text and not is_hallucination_solo(recognized_text):
                                clean_text, verbal_enter = extract_verbal_enter(recognized_text)
                                if not verbal_enter:
                                    clean_text = clean_text or recognized_text

                                # When continuing an ongoing utterance, prevent mid-sentence capitalization
                                if auto_lowercase and not prev_chunk_ended_sentence and clean_text:
                                    if clean_text[0].isupper() and not (len(clean_text) > 1 and clean_text[1].isupper()):
                                        clean_text = clean_text[0].lower() + clean_text[1:]

                                # Strip trailing dots from intermediate cuts during continuous speech
                                if strip_intermediate_dots and not is_silence:
                                    clean_text = re.sub(r"[\s.,;:]+$", "", clean_text)

                                if clean_text:
                                    prev_chunk_ended_sentence = clean_text.rstrip().endswith((".", "!", "?", ":"))
                                elif verbal_enter:
                                    prev_chunk_ended_sentence = True

                                live_address, live_name = get_active_window_info()
                                current_address = live_address or target_address
                                current_name = live_name or target_name

                                if not brain_active:
                                    dispatch_to_stream(
                                        clean_text,
                                        current_address,
                                        current_name,
                                        verbal_enter=verbal_enter,
                                    )
                                else:
                                    dispatch_to_thinking(
                                        clean_text,
                                        current_address,
                                        current_name,
                                        is_space=is_silence,
                                    )

                time.sleep(POLL_INTERVAL_SECONDS)
    finally:
        cleanup_runtime_files(PID_FILE, STOP_FILE)
        write_mode("off")
        clear_to_idle(detail=f"stop_{stop_reason}")
        print(f"[dictate.py] worker stopped: reason={stop_reason}", flush=True)


def cmd_timed() -> None:
    if is_mic_muted():
        notify("⚠️ Microphone is muted — unmute before dictating", "dialog-warning-symbolic")
        print("[dictate.py] timed recording blocked: microphone muted", flush=True)
        return

    try:
        snapshot = reconcile()
        if snapshot.get("phase") in PHASES_WORKER or read_pid() is not None:
            print("[dictate.py] timed ignored: worker process already active", flush=True)
            return

        target_address, target_name = get_active_window_info()
        enter(
            PHASE_ARMING,
            started_at=time.time(),
            target_address=target_address,
            target_title=target_name,
            detail="timed_start",
            pid=os.getpid(),
        )
        write_pid(os.getpid())

        wav_path = record_fixed(TIMED_DURATION_SEC)
        if wav_path and os.path.exists(wav_path):
            transcribed_text = transcribe(wav_path)
            if not transcribed_text:
                enter(PHASE_OK, detail="timed_empty")
                return
            body_text, verbal_enter = extract_verbal_enter(transcribed_text)
            should_enter = verbal_enter or get_auto_enter()
            paste_to_target_window(body_text, target_address, target_name, press_enter=should_enter)
            dispatch_chunk_to_brain_async(
                chunk_text=body_text,
                raw_text=transcribed_text,
                paste_address=target_address,
                paste_name=target_name,
                is_end_of_message=True,
                enter_pressed=should_enter,
            )
            enter(PHASE_OK, detail=f"timed_typed:{len(body_text)}chars")
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
        notify(f"❌ Error: {error}", "dialog-error-symbolic")
        print(f"[dictate.py] timed error: {error}", file=sys.stderr, flush=True)
        enter(PHASE_ERR, detail=str(error)[:120])
    finally:
        cleanup_runtime_files(PID_FILE, STOP_FILE)
        time.sleep(RESULT_FLASH_SECONDS)
        clear_to_idle()


def cmd_status() -> None:
    snapshot = reconcile()
    phase = snapshot.get("phase") or PHASE_IDLE
    pid = read_pid()
    current_timestamp = time.time()
    started = snapshot.get("started_at")
    recorded_at = snapshot.get("rec_started_at")
    elapsed_total = (current_timestamp - started) if isinstance(started, (int, float)) else None
    elapsed_rec = (current_timestamp - recorded_at) if isinstance(recorded_at, (int, float)) and phase in (PHASE_REC, PHASE_WRITING, PHASE_LISTENING) else None
    configuration = load_config()
    brain_info = BrainFSM.get_instance().get_state_dict()
    output = {
        "phase": phase,
        "mode": read_mode(),
        "silence_end_sec": configuration["silence_sec"],
        "auto_enter": configuration["auto_enter"],
        "brain": brain_info,
        "brain_active": brain_info["brain_active"],
        "brain_thinking": brain_info["brain_thinking"],
        "brain_running": brain_info["brain_running"],
        "brain_loaded": brain_info["brain_loaded"],
        "pid": pid,
        "elapsed_total_sec": round(elapsed_total, 2) if elapsed_total is not None else None,
        "elapsed_rec_sec": round(elapsed_rec, 2) if elapsed_rec is not None else None,
        "bounce_guard": (
            isinstance(started, (int, float)) and (current_timestamp - started) < BOUNCE_GUARD_SECONDS
            and phase in PHASES_CAN_STOP
        ),
        "ui": snapshot.get("ui"),
        "detail": snapshot.get("detail"),
        "stop_reason": snapshot.get("stop_reason"),
        "target_title": snapshot.get("target_title"),
        "max_rec_sec": MAX_RECORD_SECONDS,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


def cmd_filter(args: list[str]) -> None:
    registry = FilterRegistry.get_instance()
    subcommand = (args[0] if args else "list").lower()

    if subcommand in ("list", "ls", "status"):
        rules = registry.get_rules()
        print(f"Config file: {registry.get_active_config_path()}")
        print(f"Total active filters: {len(rules)}\n")
        header = f"{'NAME':<36} {'SCOPE':<11} {'ACTION':<15} {'PATTERN':<30} {'REPL'}"
        print(header)
        print("-" * len(header))
        for r in rules:
            status_mark = "✓" if r.enabled else "✗"
            print(f"{status_mark} {r.name:<34} {r.pipeline:<11} {r.action:<15} {r.raw_pattern[:28]:<30} {r.replacement}")

    elif subcommand == "add":
        if len(args) < 3:
            print(
                "usage: dictate filter add <name> <pattern> [replacement] [--scope both|streaming|commit] [--action replace|drop_match|strip_trailing]",
                file=sys.stderr,
            )
            sys.exit(2)
        name = args[1]
        pattern = args[2]
        replacement = args[3] if len(args) > 3 and not args[3].startswith("--") else ""
        scope = "both"
        action = "replace"

        for i, a in enumerate(args):
            if a in ("--scope", "--pipeline", "--target") and i + 1 < len(args):
                scope = args[i + 1].lower()
            elif a == "--action" and i + 1 < len(args):
                action = args[i + 1].lower()

        rule_dict = {
            "name": name,
            "pattern": pattern,
            "action": action,
            "replacement": replacement,
            "flags": [],
            "pipeline": scope,
            "enabled": True,
            "description": "User-defined filter rule",
        }
        registry.add_rule(rule_dict)
        update_pipelines_in_place()
        print(f"✅ Filter {name!r} added to {registry.config_file}")

    elif subcommand in ("remove", "rm", "delete", "del"):
        if len(args) < 2:
            print("usage: dictate filter remove <name>", file=sys.stderr)
            sys.exit(2)
        name = args[1]
        if registry.remove_rule(name):
            update_pipelines_in_place()
            print(f"✅ Filter {name!r} removed from {registry.config_file}")
        else:
            print(f"⚠️ Filter {name!r} not found", file=sys.stderr)
            sys.exit(1)

    elif subcommand == "test":
        if len(args) < 2:
            print("usage: dictate filter test \"<sample text>\"", file=sys.stderr)
            sys.exit(2)
        test_text = " ".join(args[1:])
        print(f"Input text:       {test_text!r}")
        streaming_out = STREAMING_SLICE_PIPELINE.execute(test_text)
        commit_out = UTTERANCE_COMMIT_PIPELINE.execute(test_text)
        print(f"Streaming slice:  {streaming_out!r}")
        print(f"Commit utterance: {commit_out!r}")

    elif subcommand in ("reload", "r"):
        registry.reload()
        update_pipelines_in_place()
        print(f"✅ Reloaded {len(registry.get_rules())} filters from {registry.get_active_config_path()}")

    else:
        print(f"usage: dictate filter [list|add|remove|test|reload] (got {subcommand!r})", file=sys.stderr)
        sys.exit(2)


def cmd_backend(args: list[str]) -> None:
    subcommand = (args[0] if args else "status").lower()
    router = STTRouter.get_instance()

    if subcommand in ("status", "st"):
        status = router.get_status_dict()
        telemetry = status["vram_telemetry"]
        print("=" * 55)
        print("⚡ STT Router & VRAM Telemetry Status")
        print("=" * 55)
        if telemetry["used_mb"] is not None:
            print("GPU Memory (nvidia-smi):")
            print(f"  Used:  {telemetry['used_mb']} MiB ({telemetry['used_gb']} GiB) [{telemetry['used_percentage']}%]")
            print(f"  Free:  {telemetry['free_mb']} MiB ({telemetry['free_gb']} GiB)")
            print(f"  Total: {telemetry['total_mb']} MiB ({telemetry['total_gb']} GiB)")
        else:
            print("GPU Memory: Telemetry unavailable (no nvidia-smi)")

        trigger_mb = status["occupied_trigger_mb"]
        state_str = "OCCUPIED (> trigger)" if status["is_occupied"] else "AVAILABLE (<= trigger)"
        print("\nVRAM Occupied Trigger:")
        print(f"  Threshold:     {trigger_mb} MiB ({trigger_mb / 1024.0:.2f} GiB)")
        print(f"  Current State: {state_str}")

        print("\nRouting Policy:")
        print(f"  Configured Mode: {status['backend_mode']}")
        print(f"  Preferred GPU:   {status['preferred_gpu']}")

        print("\nActive Strategy:")
        print(f"  Routed Backend:  {status['routed_backend']} ({status['routed_device']} {status['routed_compute_type']})")
        print(f"  Decision Reason: {status['decision_reason']}")

        print("\nRegistered Backends:")
        for name, info in status["registered_backends"].items():
            avail = "✅ available" if info["available"] else "❌ not found"
            loaded = " [loaded]" if info["loaded"] else ""
            print(f"  - {name:<14} | device: {info['device']:<4} | vram: {info['vram_mb']:>4} MiB | {avail}{loaded}")
        print("=" * 55)

    elif subcommand in ("set", "mode"):
        if len(args) < 2:
            print(f"usage: dictate backend set <auto|whisper-cuda|qwen3-asr> (current: {router.backend_mode})", file=sys.stderr)
            sys.exit(2)
        target_mode = args[1].lower()
        try:
            router.set_backend_mode(target_mode)
            print(f"✅ Backend mode set to: {router.backend_mode}")
            notify(f"⚡ STT backend mode: {router.backend_mode}", "preferences-system-symbolic")
        except ValueError as err:
            print(f"error: {err}", file=sys.stderr)
            sys.exit(2)

    elif subcommand in ("trigger", "threshold"):
        if len(args) < 2:
            print(f"vram_occupied_trigger_mb: {router.occupied_trigger_mb} MiB ({router.occupied_trigger_mb / 1024.0:.2f} GiB)")
            return
        try:
            new_val = int(args[1])
            router.set_occupied_trigger_mb(new_val)
            print(f"✅ VRAM occupied trigger set to: {new_val} MiB ({new_val / 1024.0:.2f} GiB)")
            notify(f"⚡ STT trigger: {new_val} MiB", "preferences-system-symbolic")
        except ValueError as err:
            print(f"error: invalid trigger value {args[1]!r}: {err}", file=sys.stderr)
            sys.exit(2)

    elif subcommand in ("test", "evaluate"):
        telemetry = VRAMMonitor.get_telemetry()
        backend, reason = router.decide_backend(telemetry)
        print("[TEST EVALUATION]")
        if telemetry:
            print(f"VRAM: used={telemetry.used_mb}MiB, free={telemetry.free_mb}MiB, trigger={router.occupied_trigger_mb}MiB")
        print(f"Backend Selection -> {backend.name} ({backend.device} {backend.compute_type})")
        print(f"Reason: {reason}")

    elif subcommand in ("list", "ls"):
        status = router.get_status_dict()
        for name, info in status["registered_backends"].items():
            avail = "✅ available" if info["available"] else "❌ not found"
            print(f"- {name:<14} (device={info['device']}, vram={info['vram_mb']}MiB): {avail}")

    else:
        print(f"usage: dictate backend [status|set|trigger|test|list] (got {subcommand!r})", file=sys.stderr)
        sys.exit(2)


def cmd_log(args: list[str]) -> None:
    subcommand = (args[0] if args else "status").lower()
    mgr = FSMLogManager.get_instance()

    if subcommand in ("status", "st"):
        st = mgr.get_log_status()
        print("=" * 60)
        print("📋 4-Tier FSM Logging Subsystem Status")
        print("=" * 60)
        print(f"Log Directory:    {st['log_dir']}")
        print(f"Rotation Limits:  max_size={st['max_bytes'] / (1024 * 1024):.1f} MiB, backups={st['backup_count']}")
        s1, s2, s3 = st["macro_state"]
        print(f"Current Macro:    [FSM1: {s1} | FSM2: {s2} | FSM3: {s3}]\n")
        print("Managed Log Files:")
        for name, info in st["logs"].items():
            exists_str = f"{info['size_kb']} KB" if info["exists"] else "not created yet"
            mtime_str = f"(modified: {info['last_modified']})" if info["last_modified"] else ""
            print(f"  • {name:<23}: {exists_str:>10} {mtime_str}")
            print(f"    Path: {info['path']}")
        print("=" * 60)

    elif subcommand in ("tail", "view", "cat"):
        target = (args[1] if len(args) > 1 and not args[1].startswith("-") else "general").lower()
        lines_count = 20
        if "-n" in args:
            idx = args.index("-n")
            if idx + 1 < len(args) and args[idx + 1].isdigit():
                lines_count = int(args[idx + 1])

        target_map = {
            "general": mgr.general_logger.file_path,
            "trajectory": mgr.general_logger.file_path,
            "fsm1": mgr.fsm1_logger.file_path,
            "mic": mgr.fsm1_logger.file_path,
            "fsm2": mgr.fsm2_logger.file_path,
            "dictator": mgr.fsm2_logger.file_path,
            "queue": mgr.fsm2_logger.file_path,
            "fsm3": mgr.fsm3_logger.file_path,
            "brain": mgr.fsm3_logger.file_path,
        }
        chosen_path = target_map.get(target, mgr.general_logger.file_path)
        if not os.path.exists(chosen_path):
            print(f"Log file not yet generated: {chosen_path}")
            return

        print(f"--- Last {lines_count} lines of {os.path.basename(chosen_path)} ---")
        try:
            with open(chosen_path, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
                for line in lines[-lines_count:]:
                    print(line.rstrip())
        except OSError as err:
            print(f"error reading {chosen_path}: {err}", file=sys.stderr)

    elif subcommand in ("rotate", "r"):
        mgr.rotate_all()
        print("✅ Deterministic rotation executed on all 4 FSM log files.")
        notify("🔄 FSM Logs rotated deterministically", "emblem-ok-symbolic")

    elif subcommand in ("path", "dir"):
        print(mgr.log_dir)

    else:
        print(f"usage: dictate log [status|tail|rotate|path] (got {subcommand!r})", file=sys.stderr)
        sys.exit(2)


def main() -> None:
    command = (sys.argv[1] if len(sys.argv) > 1 else "toggle").lower()

    if command in ("log", "logs"):
        cmd_log(sys.argv[2:])
        return

    if command in ("backend", "backends", "router"):
        cmd_backend(sys.argv[2:])
        return

    if command in ("filter", "filters"):
        cmd_filter(sys.argv[2:])
        return

    if command == "brain":
        subcommand = (sys.argv[2] if len(sys.argv) > 2 else "toggle").lower()
        brain = BrainFSM.get_instance()
        if subcommand in ("toggle", "t"):
            active = not is_brain_active()
            brain.set_active(active)
            if active:
                notify("🧠 Cognitive Brain active: listening for dictation chunks", "process-working-symbolic")
            else:
                notify("🧠 Cognitive Brain deactivated", "process-stop-symbolic")
            print(f"brain_active: {active}")
        elif subcommand in ("on", "1", "enable", "start"):
            brain.set_active(True)
            notify("🧠 Cognitive Brain active: listening for dictation chunks", "process-working-symbolic")
            print("brain_active: True")
        elif subcommand in ("off", "0", "disable", "stop"):
            brain.set_active(False)
            notify("🧠 Cognitive Brain deactivated", "process-stop-symbolic")
            print("brain_active: False")
        elif subcommand in ("status", "st"):
            print(json.dumps(brain.get_state_dict(), ensure_ascii=False, indent=2))
        else:
            print(f"usage: dictate brain [toggle|on|off|status] (got {subcommand!r})", file=sys.stderr)
            sys.exit(2)
        return

    if command in ("timeout", "silence"):
        if len(sys.argv) > 2:
            try:
                new_value = float(sys.argv[2])
                set_silence_end_sec(new_value)
                print(f"silence_end_sec: {new_value:.2f}s")
                notify(f"⏱️ Silence timeout: {new_value:.2f}s", "preferences-system-time-symbolic")
            except ValueError:
                print(f"error: invalid timeout value {sys.argv[2]!r}", file=sys.stderr)
                sys.exit(2)
        else:
            print(f"silence_end_sec: {get_silence_end_sec():.2f}s")
        return

    if command in ("enter", "auto-enter"):
        if len(sys.argv) > 2:
            subcommand = sys.argv[2].lower()
            if subcommand in ("on", "1", "true", "yes", "enable"):
                set_auto_enter(True)
                print("auto_enter: True")
                notify("↩️ Auto-Enter: Enabled", "emblem-ok-symbolic")
            elif subcommand in ("off", "0", "false", "no", "disable"):
                set_auto_enter(False)
                print("auto_enter: False")
                notify("↩️ Auto-Enter: Disabled", "process-stop-symbolic")
            elif subcommand in ("toggle", "t"):
                current_state = get_auto_enter()
                set_auto_enter(not current_state)
                print(f"auto_enter: {not current_state}")
            elif subcommand in ("status", "st"):
                print(f"auto_enter: {get_auto_enter()}")
            else:
                print(f"usage: dictate enter [on|off|toggle|status] (got {subcommand!r})", file=sys.stderr)
                sys.exit(2)
        else:
            print(f"auto_enter: {get_auto_enter()}")
        return

    if command in ("toggle", "t", "cycle", "c"):
        cmd_cycle()
    elif command in ("direct", "stream"):
        if is_mic_muted():
            notify("⚠️ Microphone is muted — unmute before dictating", "dialog-warning-symbolic")
            return
        write_mode("stream")
        snapshot = reconcile()
        if snapshot.get("phase") == PHASE_IDLE:
            cmd_start()
        else:
            snapshot["mode"] = "stream"
            write_snapshot(snapshot)
            notify("🎙️ Dictation active (Stream)", "audio-input-microphone-symbolic")
    elif command in ("start", "press", "down"):
        cmd_start()
    elif command in ("stop", "release", "up", "off"):
        write_mode("off")
        cmd_stop(force=True)
    elif command == "worker":
        cmd_worker()
    elif command in ("timed", "once", "fixed"):
        cmd_timed()
    elif command in ("status", "st"):
        cmd_status()
    else:
        print(
            f"usage: dictate [toggle|start|stop|stream|brain|timeout|enter|timed|status|filter|backend|log] (got {command!r})",
            file=sys.stderr,
        )
        sys.exit(2)


if __name__ == "__main__":
    main()
