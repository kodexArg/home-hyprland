import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createPoll } from "ags/time"

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const STATE_FILE = `${GLib.get_user_runtime_dir()}/kodexbot_state.json`
const STALE_SEC = 10

const ICON_BY_TONE: Record<string, string> = {
  "tone-idle": `${ICON_DIR}/mic-orange.svg`,
  "tone-voice": `${ICON_DIR}/mic-green.svg`,
  "tone-muted": `${ICON_DIR}/mic-black.svg`,
  "tone-error": `${ICON_DIR}/mic-red.svg`,
  off: `${ICON_DIR}/mic-gray.svg`,
}

type Snap = {
  visible: boolean
  phase: string
  voice: boolean
  muted: boolean
  error: boolean
  fallback: boolean
  tooltip: string
}

const OFF_SNAP: Snap = {
  visible: false,
  phase: "off",
  voice: false,
  muted: false,
  error: false,
  fallback: false,
  tooltip: "",
}

const PHASE_LABEL: Record<string, string> = {
  listening: "listening (commands only)",
  dictating: "dictating at cursor",
}

function pidAlive(pid: number): boolean {
  return Gio.File.new_for_path(`/proc/${pid}`).query_exists(null)
}

function readSnap(): Snap {
  try {
    const f = Gio.File.new_for_path(STATE_FILE)
    if (!f.query_exists(null)) return OFF_SNAP
    const [ok, bytes] = f.load_contents(null)
    if (!ok) return OFF_SNAP
    const d = JSON.parse(new TextDecoder().decode(bytes)) as {
      phase?: string
      detail?: string
      voice?: boolean
      mic?: string
      lane?: string
      resolve?: string | null
      ts?: number
      pid?: number
    }

    const phase = d.phase ?? "off"
    if (phase !== "listening" && phase !== "dictating") return OFF_SNAP

    const voice = d.voice ?? false
    const muted = (d.mic ?? "ok") === "muted"
    const lane = d.lane ?? "ok"
    const fallback = (d.resolve ?? null) === "llm" && phase === "listening"
    const detail = (d.detail ?? "").trim()

    let stale = false
    const tsRaw = Number(d.ts ?? 0)
    const pid = Number(d.pid ?? 0)
    if (tsRaw > 0 && pid > 0) {
      const tsSec = tsRaw > 1e12 ? tsRaw / 1000 : tsRaw
      if (Date.now() / 1000 - tsSec > STALE_SEC && pidAlive(pid)) stale = true
    }

    const error = lane === "error" || stale

    let tooltip = `🎙️ kodexBot — ${PHASE_LABEL[phase]}`
    if (fallback) tooltip += " · LLM FALLBACK (macro)"
    if (voice) tooltip += " · voice heard"
    if (muted) tooltip += " · MIC MUTED"
    if (lane === "error") tooltip += " · LANE ERROR"
    else if (stale) tooltip += " · stale (not processing)"
    if (detail) tooltip += `\n${detail}`

    return { visible: true, phase, voice, muted, error, fallback, tooltip }
  } catch {
    return OFF_SNAP
  }
}

export default function KodexbotChip() {
  const snap = createPoll(OFF_SNAP, 150, () => readSnap())

  const cls = snap((s) => {
    const parts = ["KodexbotChip"]
    if (!s.visible) return parts.join(" ")
    parts.push(s.fallback ? "fallback" : s.phase)
    return parts.join(" ")
  })

  const tone = snap((s) => {
    if (!s.visible) return "off"
    if (s.error) return "tone-error"
    if (s.muted) return "tone-muted"
    if (s.voice) return "tone-voice"
    return "tone-idle"
  })

  return (
    <box
      class={cls}
      visible={snap((s) => s.visible)}
      valign={Gtk.Align.CENTER}
      spacing={4}
      tooltipText={snap((s) => s.tooltip)}
    >
      <image file={tone((t) => ICON_BY_TONE[t])} pixelSize={14} />
    </box>
  )
}
