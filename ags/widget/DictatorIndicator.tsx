import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createPoll } from "ags/time"

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const STATE_FILE = "/tmp/dictate_state.json"
const FLAG_FILE = "/tmp/dictate_active"
const DICTATOR_BIN =
  GLib.find_program_in_path("kdx-dictator") ??
  GLib.find_program_in_path("dictate") ??
  `${GLib.get_home_dir()}/.local/bin/kdx-dictator`

export type DictatorTone = "muted" | "idle" | "active" | "busy" | "error"

const ICONS: Record<DictatorTone, string> = {
  muted: `${ICON_DIR}/speaker-man-dark.svg`,
  idle: `${ICON_DIR}/speaker-man-gray.svg`,
  active: `${ICON_DIR}/speaker-man-green.svg`,
  busy: `${ICON_DIR}/speaker-man-orange.svg`,
  error: `${ICON_DIR}/speaker-man-red.svg`,
}

export function toggleDictation(): void {
  try {
    Gio.Subprocess.new(
      [DICTATOR_BIN, "toggle"],
      Gio.SubprocessFlags.STDERR_SILENCE,
    )
  } catch (e) {
    printerr(`dictator: toggle failed: ${e}`)
  }
}

interface DictatorState {
  phase: string
  tone: DictatorTone
  tooltip: string
  detail: string
}

function readDictatorState(): DictatorState {
  let phase = "idle"
  let detail = ""

  try {
    const file = Gio.File.new_for_path(STATE_FILE)
    if (file.query_exists(null)) {
      const [ok, bytes] = file.load_contents(null)
      if (ok) {
        const text = new TextDecoder().decode(bytes).trim()
        const data = JSON.parse(text)
        phase = (data.phase || "idle").toLowerCase().trim()
        detail = data.detail || ""
      }
    } else {
      const flagFile = Gio.File.new_for_path(FLAG_FILE)
      if (flagFile.query_exists(null)) {
        const [ok, bytes] = flagFile.load_contents(null)
        if (ok) {
          phase = new TextDecoder().decode(bytes).toLowerCase().trim()
        }
      }
    }
  } catch {
    phase = "idle"
  }

  // Tone resolution:
  // - "idle": Muted total (dark)
  // - "arming" / "rec": Active standby (brain gray)
  // - "stt" / "refine" / "paste" / "ok": Processing/writing (green or orange)
  // - "err": Error (red)
  if (phase === "idle" || !phase) {
    return {
      phase: "idle",
      tone: "muted",
      tooltip: "🗣️ Dictado continuo — Deshabilitado (clic para activar)",
      detail,
    }
  }

  if (phase === "arming" || phase === "rec") {
    return {
      phase,
      tone: "idle", // Brain gray
      tooltip: "🗣️ Dictado continuo — 🎙️ Escuchando... (3s silencio transcribe al cursor; clic para detener)",
      detail,
    }
  }

  if (phase === "stt" || phase === "paste" || phase === "ok") {
    return {
      phase,
      tone: "active", // Light green
      tooltip: `🗣️ Dictado — 🟢 Transcribiendo / Escribiendo en ventana activa (${phase.toUpperCase()})`,
      detail,
    }
  }

  if (phase === "refine" || phase === "stopping" || phase === "busy") {
    return {
      phase,
      tone: "busy", // Orange
      tooltip: `🗣️ Dictado — ⚡ Refinando con LLM local (${phase.toUpperCase()})...`,
      detail,
    }
  }

  if (phase === "err") {
    return {
      phase: "err",
      tone: "error",
      tooltip: `🗣️ Dictado — ⚠️ Error en /tmp/dictate.log`,
      detail,
    }
  }

  return {
    phase,
    tone: "idle",
    tooltip: `🗣️ Dictado — ${phase}`,
    detail,
  }
}

export default function DictatorIndicator() {
  const state = createPoll(
    {
      phase: "idle",
      tone: "muted" as DictatorTone,
      tooltip: "🗣️ Dictado continuo — Deshabilitado (clic para activar)",
      detail: "",
    },
    150,
    () => readDictatorState(),
  )

  return (
    <button
      class={state((s) => `DictatorIndicator ${s.tone} phase-${s.phase}`)}
      tooltipText={state((s) => s.tooltip)}
      onClicked={() => toggleDictation()}
    >
      <image
        file={state((s) => ICONS[s.tone] || ICONS.muted)}
        pixelSize={16}
      />
    </button>
  )
}
