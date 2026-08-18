import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createPoll } from "ags/time"

const STATE_FILE = "/tmp/voice_live_state.json"
const FLAG_FILE = "/tmp/voice_live_active"
const MIC_ICON = `${GLib.get_user_config_dir()}/ags/icons/mic-live.svg`

const UI: Record<
  string,
  { cls: string; visible: boolean; tooltip: string }
> = {
  off: { cls: "idle", visible: false, tooltip: "" },
  idle: { cls: "idle", visible: false, tooltip: "" },
  paused: {
    cls: "mic-paused",
    visible: true,
    tooltip: "⚪ LIVE pausado — Super+L resume",
  },
  stream: {
    cls: "mic-green",
    visible: true,
    tooltip: "🟢 LIVE — hablando · escribe al cursor",
  },
  silence: {
    cls: "mic-yellow",
    visible: true,
    tooltip: "🟡 LIVE — silencio · action LLM en background",
  },
  stt: {
    cls: "mic-green",
    visible: true,
    tooltip: "🟢 LIVE — transcribiendo…",
  },
  ok: {
    cls: "mic-yellow",
    visible: true,
    tooltip: "🟡 LIVE — listo",
  },
  err: {
    cls: "mic-err",
    visible: true,
    tooltip: "⚠️ LIVE — /tmp/voice_live.log",
  },
  error: {
    cls: "mic-err",
    visible: true,
    tooltip: "⚠️ LIVE",
  },
  listen: {
    cls: "mic-green",
    visible: true,
    tooltip: "🟢 LIVE — escuchando",
  },
  think: {
    cls: "mic-yellow",
    visible: true,
    tooltip: "🟡 LIVE — action LLM…",
  },
  refine: {
    cls: "mic-yellow",
    visible: true,
    tooltip: "🟡 LIVE — action LLM…",
  },
  paste: {
    cls: "mic-green",
    visible: true,
    tooltip: "🟢 LIVE — escribiendo…",
  },
  arming: { cls: "mic-green", visible: true, tooltip: "🟢 LIVE" },
  rec: { cls: "mic-green", visible: true, tooltip: "🟢 LIVE" },
  stopping: { cls: "mic-yellow", visible: true, tooltip: "🟡 LIVE" },
}

type Snap = {
  phase: string
  cls: string
  visible: boolean
  tooltip: string
}

const IDLE: Snap = {
  phase: "off",
  cls: "idle",
  visible: false,
  tooltip: "",
}

function project(phaseRaw: string, detail: string, color?: string): Snap {
  let phase = (phaseRaw || "off").trim()
  if (phase === "idle") phase = "off"
  if (phase === "error") phase = "err"
  if (color === "green") phase = phase === "off" ? "stream" : phase
  if (color === "yellow" && (phase === "listen" || phase === "ok")) phase = "silence"
  const ui = UI[phase] ?? UI.off
  let cls = ui.cls
  if (color === "green") cls = "mic-green"
  if (color === "yellow") cls = "mic-yellow"
  if (color === "grey" || color === "gray") cls = "mic-paused"
  if (color === "red") cls = "mic-err"
  const tooltip = detail ? `${ui.tooltip}\n${detail}` : ui.tooltip
  return {
    phase,
    cls,
    visible:
      ui.visible ||
      color === "green" ||
      color === "yellow" ||
      color === "grey" ||
      color === "gray",
    tooltip,
  }
}

function readSnap(): Snap {
  try {
    const f = Gio.File.new_for_path(STATE_FILE)
    if (f.query_exists(null)) {
      const [ok, bytes] = f.load_contents(null)
      if (ok) {
        const data = JSON.parse(new TextDecoder().decode(bytes).trim()) as {
          phase?: string
          detail?: string
          ui?: { color?: string }
        }
        return project(
          data.phase ?? "off",
          data.detail ?? "",
          data.ui?.color,
        )
      }
    }
  } catch {}
  try {
    const flag = Gio.File.new_for_path(FLAG_FILE)
    if (!flag.query_exists(null)) return IDLE
    const [ok, bytes] = flag.load_contents(null)
    if (!ok) return IDLE
    return project(new TextDecoder().decode(bytes).trim(), "")
  } catch {
    return IDLE
  }
}

export default function LiveIndicator() {
  const snap = createPoll(IDLE, 120, () => readSnap())

  return (
    <box
      class={snap((s) => `LiveIndicator state-${s.cls}`)}
      visible={snap((s) => s.visible)}
      valign={Gtk.Align.CENTER}
      spacing={0}
      tooltipText={snap((s) => s.tooltip || "LIVE")}
    >
      <image
        class="LiveIndicator-mic"
        file={MIC_ICON}
        pixelSize={14}
      />
    </box>
  )
}
