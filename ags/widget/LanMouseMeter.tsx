import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createComputed, createState } from "ags"
import { execAsync } from "ags/process"

const ICON_LAN_MOUSE = `${GLib.get_user_config_dir()}/ags/icons/lan-mouse-gray.svg`
const CONFIG = `${GLib.get_user_config_dir()}/lan-mouse/config.toml`
const POLL_MS = 3000

const [active, setActive] = createState(false)
let busy = false
let pollSource: number | null = null

function clientInfo(): string {
  try {
    const [ok, bytes] = GLib.file_get_contents(CONFIG)
    if (!ok) return ""
    const txt = new TextDecoder().decode(bytes)
    const pos = txt.match(/^\s*position\s*=\s*"([^"]+)"/m)?.[1]
    const host = txt.match(/^\s*hostname\s*=\s*"([^"]+)"/m)?.[1]
    return [host, pos && `(${pos})`].filter(Boolean).join(" ")
  } catch {
    return ""
  }
}

function refresh() {
  execAsync(["sh", "-c", "systemctl --user is-active lan-mouse || true"])
    .then((out) => setActive(out.trim() === "active"))
    .catch(() => setActive(false))
}

function toggle() {
  if (busy) return
  busy = true
  execAsync(["systemctl", "--user", active.peek() ? "stop" : "start", "lan-mouse"])
    .catch((e) => printerr(`lan-mouse toggle: ${e}`))
    .finally(() => {
      busy = false
      refresh()
    })
}

export default function LanMouseMeter() {
  if (pollSource === null) {
    refresh()
    pollSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, () => {
      refresh()
      return GLib.SOURCE_CONTINUE
    })
  }

  const client = clientInfo()
  const tip = createComputed(() =>
    [`Lan Mouse: ${active() ? "activo" : "inactivo"}`, client && `Client: ${client}`, "Clic: start/stop"]
      .filter(Boolean)
      .join("\n"),
  )
  const valClass = createComputed(() => (active() ? "LanMouse-val" : "LanMouse-val off"))
  const valText = createComputed(() => (active() ? "on" : "off"))

  return (
    <button
      class="LanMouseMeter"
      tooltipText={tip}
      valign={Gtk.Align.CENTER}
      $={(self: Gtk.Button) => {
        const click = new Gtk.GestureClick()
        click.set_button(1)
        click.connect("pressed", () => toggle())
        self.add_controller(click)
      }}
    >
      <box spacing={3} valign={Gtk.Align.CENTER} class="LanMouseMeter-inner">
        <image file={ICON_LAN_MOUSE} pixelSize={13} class="LanMouse-icon" />
        <label class={valClass} label={valText} />
      </box>
    </button>
  )
}
