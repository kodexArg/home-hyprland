import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createPoll } from "ags/time"

/**
 * Super+L LIVE chip — pure projection of /tmp/kdx_live_mode.json.
 * Python worker writes ui.color (orange|green); we never call Python.
 */
const STATE_FILE = "/tmp/kdx_live_mode.json"
const FLAG_FILE = "/tmp/kdx_live_mode"
const MIC_ICON = `${GLib.get_user_config_dir()}/ags/icons/mic-record.svg`

type Snap = {
  on: boolean
  color: "orange" | "green"
  tooltip: string
}

const OFF: Snap = { on: false, color: "orange", tooltip: "" }

function readSnap(): Snap {
  try {
    const stateFile = Gio.File.new_for_path(STATE_FILE)
    if (stateFile.query_exists(null)) {
      const [ok, bytes] = stateFile.load_contents(null)
      if (ok) {
        const data = JSON.parse(new TextDecoder().decode(bytes).trim()) as {
          on?: boolean
          phase?: string
          detail?: string
          ui?: { color?: string }
          color?: string
        }
        const on =
          data.on === true ||
          data.phase === "on" ||
          data.phase === "live" ||
          data.phase === "armed"
        if (!on) return OFF

        const raw = (data.ui?.color ?? data.color ?? "orange").toLowerCase()
        const color: "orange" | "green" = raw === "green" ? "green" : "orange"
        return {
          on: true,
          color,
          tooltip:
            data.detail ||
            "LIVE mode ON — Super+L toggles",
        }
      }
    }
  } catch {}

  try {
    const flag = Gio.File.new_for_path(FLAG_FILE)
    if (!flag.query_exists(null)) return OFF
    return {
      on: true,
      color: "orange",
      tooltip: "LIVE mode ON — Super+L toggles",
    }
  } catch {
    return OFF
  }
}

export default function LiveModeIndicator() {
  const snap = createPoll(OFF, 100, () => readSnap())

  return (
    <box
      class={snap((s) =>
        s.on
          ? `LiveModeIndicator state-on state-${s.color}`
          : "LiveModeIndicator state-off",
      )}
      visible={snap((s) => s.on)}
      valign={Gtk.Align.CENTER}
      spacing={4}
      tooltipText={snap(
        (s) => s.tooltip || "LIVE mode (under construction)",
      )}
    >
      <image file={MIC_ICON} pixelSize={14} />
      <label class="LiveModeIndicator-label" label="LIVE" />
    </box>
  )
}
