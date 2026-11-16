import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createComputed, createState } from "ags"
import { execAsync } from "ags/process"

// ASUS (HDMI-A-2, iGPU) on/off para HLL. Estado real desde hyprctl monitors.
const BIN = `${GLib.get_home_dir()}/.local/bin/kdx-asus-toggle`
const [on, setOn] = createState(true)
export const asusOn = on
let busy = false
let poll: number | null = null

function refresh() {
  execAsync([BIN, "status"]).then((o) => setOn(o.trim() === "on")).catch(() => {})
}
export function toggleAsus() {
  if (busy) return
  busy = true
  execAsync([BIN, on.peek() ? "off" : "on"])
    .catch((e) => printerr(`asus toggle: ${e}`))
    .finally(() => { busy = false; refresh() })
}

export function startAsusPoll() {
  if (poll !== null) return
  refresh()
  poll = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => { refresh(); return GLib.SOURCE_CONTINUE })
}

export default function AsusToggle() {
  startAsusPoll()
  const cls = createComputed(() => (on() ? "AsusToggle" : "AsusToggle off"))
  const tip = createComputed(() => `ASUS (HDMI-A-2): ${on() ? "encendido" : "apagado"}\nClic: ${on() ? "apagar" : "encender"}`)
  return (
    <button class={cls} tooltipText={tip} valign={Gtk.Align.CENTER} onClicked={toggleAsus}>
      <label class="AsusToggle-icon" label={createComputed(() => (on() ? "󰍹" : "󰶐"))} />
    </button>
  )
}
