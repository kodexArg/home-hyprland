import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createComputed } from "ags"
import {
  startMicWatch,
  toggleMicMute,
  micMuted,
  micName,
  micHearing,
  type MicTone,
} from "./mic"

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`

/**
 * Classic vintage metallic broadcast microphone (Shure 55 / vintage studio mic):
 * - muted: dark (tan oscuro como una celda del VRAM) -> vintage-mic-dark.svg
 * - unmuted / idle: brain gray (#9a9a9a, 0.55 opacity) -> vintage-mic-gray.svg
 * - voice / hearing: light green (#7bc96f, 1.0 opacity, same as RAM / brain on) -> vintage-mic-green.svg
 * - busy / listening: orange (#ff8c42) -> vintage-mic-orange.svg
 * - recording / rec: red (#e53935) -> vintage-mic-red.svg
 * - error: red (#c45c4a) -> vintage-mic-red.svg
 */
const ICON_BY_TONE: Record<MicTone, string> = {
  muted: `${ICON_DIR}/vintage-mic-dark.svg`,
  unmuted: `${ICON_DIR}/vintage-mic-gray.svg`,
  voice: `${ICON_DIR}/vintage-mic-green.svg`,
  busy: `${ICON_DIR}/vintage-mic-orange.svg`,
  recording: `${ICON_DIR}/vintage-mic-red.svg`,
  error: `${ICON_DIR}/vintage-mic-red.svg`,
}

export default function MicIndicator() {
  startMicWatch()

  // FSM tone resolution:
  // 1. Muted -> dark like VRAM cell
  // 2. Unmuted + hearing sound/voice -> green pulse
  // 3. Unmuted + idle -> brain gray
  const tone = createComputed((): MicTone => {
    if (micMuted()) return "muted"
    if (micHearing()) return "voice"
    return "unmuted"
  })

  const iconFile = createComputed(() => {
    const t = tone()
    return ICON_BY_TONE[t] || ICON_BY_TONE.muted
  })

  const tip = createComputed(() => {
    const name = micName()
    const t = tone()
    if (t === "muted") {
      return `🎙️ ${name} — Silenciado (clic para activar)`
    }
    if (t === "voice") {
      return `🎙️ ${name} — 🟢 Escuchando audio/voz (clic para silenciar)`
    }
    return `🎙️ ${name} — Habilitado en espera (clic para silenciar)`
  })

  const cls = createComputed(() => {
    const t = tone()
    return `MicIndicator ${t} ${t === "voice" ? "hearing live" : t === "unmuted" ? "idle" : "muted"}`.trim()
  })

  return (
    <button
      class={cls}
      tooltipText={tip}
      onClicked={() => toggleMicMute()}
    >
      <image file={iconFile} pixelSize={16} />
    </button>
  )
}
