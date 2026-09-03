import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState, createComputed } from "ags"

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const STATE_FILE = "/tmp/dictate_state.json"
const FLAG_FILE = "/tmp/dictate_active"
const DICTATOR_BIN =
  GLib.find_program_in_path("kdx-dictator") ??
  GLib.find_program_in_path("dictate") ??
  `${GLib.get_home_dir()}/.local/bin/kdx-dictator`

export type DictatorTone = "muted" | "direct" | "ai" | "error"

/**
 * 3-State Dictation FSM (user spec):
 * - deshabilitado (OFF) -> gris oscuro (#a0a0a0, 0.20 opacity) -> dictate-bubble-dark.svg
 * - transcripción directa (STREAM) -> gris claro (#9a9a9a, 0.55 opacity) -> dictate-bubble-gray.svg
 * - transcripción interpretada con AI (LLM) -> naranja (#ff8c42, 1.0 opacity) -> dictate-bubble-orange.svg
 * - error -> rojo -> dictate-bubble-red.svg
 */
const ICONS: Record<DictatorTone, string> = {
  muted: `${ICON_DIR}/dictate-bubble-dark.svg`,
  direct: `${ICON_DIR}/dictate-bubble-gray.svg`,
  ai: `${ICON_DIR}/dictate-bubble-orange.svg`,
  error: `${ICON_DIR}/dictate-bubble-red.svg`,
}

const [dictatorPhase, setDictatorPhase] = createState("idle")
const [dictatorMode, setDictatorMode] = createState("off")
const [dictatorDetail, setDictatorDetail] = createState("")

let timerId: number | null = null

function snap(): void {
  try {
    const file = Gio.File.new_for_path(STATE_FILE)
    if (file.query_exists(null)) {
      const [ok, bytes] = file.load_contents(null)
      if (ok) {
        const text = new TextDecoder().decode(bytes).trim()
        const data = JSON.parse(text)
        const p = (data.phase || "idle").toLowerCase().trim()
        const m = (data.mode || (p === "idle" ? "off" : "direct")).toLowerCase().trim()
        setDictatorPhase(p)
        setDictatorMode(m)
        setDictatorDetail(data.detail || "")
        return
      }
    }
    const flag = Gio.File.new_for_path(FLAG_FILE)
    if (flag.query_exists(null)) {
      const [ok, bytes] = flag.load_contents(null)
      if (ok) {
        const word = new TextDecoder().decode(bytes).toLowerCase().trim()
        setDictatorPhase(word)
        setDictatorMode("direct")
        return
      }
    }
  } catch {}
  setDictatorPhase("idle")
  setDictatorMode("off")
  setDictatorDetail("")
}

function startWatching(): void {
  if (timerId !== null) return
  snap()
  timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
    snap()
    return GLib.SOURCE_CONTINUE
  })
}

export function toggleDictation(): void {
  try {
    Gio.Subprocess.new(
      [DICTATOR_BIN, "toggle"],
      Gio.SubprocessFlags.STDERR_SILENCE,
    )
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
      snap()
      return GLib.SOURCE_REMOVE
    })
  } catch (e) {
    printerr(`dictator: toggle failed: ${e}`)
  }
}

export default function DictatorIndicator() {
  startWatching()

  // 3-State FSM Tone resolution:
  // 1. Deshabilitado / OFF -> muted (gris oscuro)
  // 2. Transcripción directa (sin AI) -> direct (gris claro)
  // 3. Transcripción con AI (refinado con LLM) -> ai (naranja)
  const tone = createComputed((): DictatorTone => {
    const p = dictatorPhase()
    const m = dictatorMode()

    if (p === "idle" || !p || m === "off") {
      return "muted"
    }
    if (p === "err") {
      return "error"
    }
    if (m === "ai") {
      return "ai"
    }
    return "direct"
  })

  const iconFile = createComputed(() => {
    const t = tone()
    return ICONS[t] || ICONS.muted
  })

  const tip = createComputed(() => {
    const p = dictatorPhase()
    const t = tone()
    if (t === "muted") {
      return "💬 Dictado: Deshabilitado (clic o Super+D: Iniciar Transcripción Directa)"
    }
    if (t === "direct") {
      return `💬 Dictado Directo: 🎙️ Escuchando... (transcripción rápida sin IA; clic o Super+D: Cambiar a Modo IA)`
    }
    if (t === "ai") {
      return `💬 Dictado con IA: ✨ Escuchando... (transcribe y cura con LLM local; clic o Super+D: Deshabilitar)`
    }
    return `💬 Dictado: ⚠️ Error en /tmp/dictate.log`
  })

  const cls = createComputed(() => {
    const p = dictatorPhase()
    const t = tone()
    return `DictatorIndicator ${t} phase-${p}`
  })

  return (
    <button
      class={cls}
      tooltipText={tip}
      onClicked={() => toggleDictation()}
    >
      <image
        file={iconFile}
        pixelSize={16}
      />
    </button>
  )
}
