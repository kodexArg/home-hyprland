import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createPoll } from "ags/time"

/** Super+M REC mode (under construction) — UI chip only. */
const STATE_FILE = "/tmp/kdx_rec_mode.json"
const FLAG_FILE = "/tmp/kdx_rec_mode"
const ICON_MIC_RECORD = `${GLib.get_user_config_dir()}/ags/icons/mic-record.svg`

type Snap = {
  on: boolean
  label: string
  tooltip: string
}

const OFF: Snap = {
  on: false,
  label: "",
  tooltip: "",
}

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
        }
        const on =
          data.on === true ||
          data.phase === "on" ||
          data.phase === "rec" ||
          data.phase === "armed"
        if (on) {
          return {
            on: true,
            label: "REC",
            tooltip:
              data.detail ||
              "REC mode ON (under construction) — Super+M toggles",
          }
        }
        return OFF
      }
    }
  } catch {}

  try {
    const flag = Gio.File.new_for_path(FLAG_FILE)
    if (!flag.query_exists(null)) return OFF
    return {
      on: true,
      label: "REC",
      tooltip: "REC mode ON (under construction) — Super+M toggles",
    }
  } catch {
    return OFF
  }
}

export default function RecModeIndicator() {
  const snap = createPoll(OFF, 150, () => readSnap())

  return (
    <box
      class={snap((s) =>
        s.on ? "RecModeIndicator state-on" : "RecModeIndicator state-off",
      )}
      visible={snap((s) => s.on)}
      valign={Gtk.Align.CENTER}
      spacing={4}
      tooltipText={snap(
        (s) => s.tooltip || "REC mode (under construction)",
      )}
    >
      <image file={ICON_MIC_RECORD} pixelSize={14} />
      <label class="RecModeIndicator-label" label="REC" />
    </box>
  )
}
