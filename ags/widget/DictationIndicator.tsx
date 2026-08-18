import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createPoll } from "ags/time"

const ICON_MIC_RECORD = `${GLib.get_user_config_dir()}/ags/icons/mic-record.svg`
const STATE_FILE = "/tmp/dictate_state.json"
const FLAG_FILE = "/tmp/dictate_active"

const UI: Record<
  string,
  { label: string; cls: string; visible: boolean; tooltip: string }
> = {
  idle: { label: "", cls: "idle", visible: false, tooltip: "" },
  arming: {
    label: "···",
    cls: "arming",
    visible: true,
    tooltip: "🎙️ Abriendo micrófono — esperá REC",
  },
  rec: {
    label: "REC",
    cls: "rec",
    visible: true,
    tooltip: "🎙️ Escuchando — 3s silencio → texto; «Listo/Ok, kodex» = Enter; Super+D apaga",
  },
  stopping: {
    label: "···",
    cls: "stopping",
    visible: true,
    tooltip: "⏹ Cerrando utterance…",
  },
  stt: {
    label: "STT",
    cls: "stt",
    visible: true,
    tooltip: "⚡ Transcribiendo (Whisper GPU)…",
  },
  refine: {
    label: "LLM",
    cls: "refine",
    visible: true,
    tooltip: "✨ Limpiando/traduciendo con LLM local…",
  },
  paste: {
    label: "OUT",
    cls: "paste",
    visible: true,
    tooltip: "📤 Pegando en la ventana…",
  },
  ok: { label: "OK", cls: "ok", visible: true, tooltip: "✅ Pegado — sigue escuchando" },
  err: {
    label: "ERR",
    cls: "err",
    visible: true,
    tooltip: "⚠️ Fallo — /tmp/dictate.log",
  },
  busy: {
    label: "STT",
    cls: "stt",
    visible: true,
    tooltip: "⚡ Procesando…",
  },
}

type PhaseSnap = {
  phase: string
  label: string
  cls: string
  visible: boolean
  tooltip: string
  detail: string
  elapsedRec: string
}

const IDLE_SNAP: PhaseSnap = {
  phase: "idle",
  label: "",
  cls: "idle",
  visible: false,
  tooltip: "",
  detail: "",
  elapsedRec: "",
}

function project(phaseRaw: string, detail: string, recStartedAt: number | null): PhaseSnap {
  let phase = (phaseRaw || "idle").trim()
  if (phase === "busy") phase = "stt"
  const ui = UI[phase] ?? UI.idle
  let elapsedRec = ""
  if (phase === "rec" && typeof recStartedAt === "number" && recStartedAt > 0) {
    const sec = Math.max(0, Date.now() / 1000 - recStartedAt)
    elapsedRec = sec >= 60 ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}` : `${Math.floor(sec)}s`
  }
  const tooltip =
    phase === "rec" && elapsedRec
      ? `${ui.tooltip} (${elapsedRec})`
      : detail
        ? `${ui.tooltip}\n${detail}`
        : ui.tooltip
  return {
    phase,
    label: phase === "rec" && elapsedRec ? `REC ${elapsedRec}` : ui.label,
    cls: ui.cls,
    visible: ui.visible,
    tooltip,
    detail,
    elapsedRec,
  }
}

function readSnap(): PhaseSnap {
  try {
    const stateFile = Gio.File.new_for_path(STATE_FILE)
    if (stateFile.query_exists(null)) {
      const [ok, bytes] = stateFile.load_contents(null)
      if (ok) {
        const text = new TextDecoder().decode(bytes).trim()
        const data = JSON.parse(text) as {
          phase?: string
          detail?: string
          rec_started_at?: number
          ui?: { label?: string }
        }
        return project(
          data.phase ?? "idle",
          data.detail ?? "",
          typeof data.rec_started_at === "number" ? data.rec_started_at : null,
        )
      }
    }
  } catch {}

  try {
    const flag = Gio.File.new_for_path(FLAG_FILE)
    if (!flag.query_exists(null)) return IDLE_SNAP
    const [ok, bytes] = flag.load_contents(null)
    if (!ok) return IDLE_SNAP
    const word = new TextDecoder().decode(bytes).trim()
    return project(word, "", null)
  } catch {
    return IDLE_SNAP
  }
}

export default function DictationIndicator() {
  const snap = createPoll(IDLE_SNAP, 150, () => readSnap())

  return (
    <box
      class={snap((s) => `DictationIndicator state-${s.cls}`)}
      visible={snap((s) => s.visible)}
      valign={Gtk.Align.CENTER}
      spacing={4}
      tooltipText={snap((s) => s.tooltip || "🎙️ Dictado de voz")}
    >
      <image file={ICON_MIC_RECORD} pixelSize={14} />
      <label
        class="DictationIndicator-label"
        label={snap((s) => s.label || "REC")}
      />
    </box>
  )
}
