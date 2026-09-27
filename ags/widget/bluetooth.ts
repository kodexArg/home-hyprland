import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createComputed, createState } from "ags"

export type BtPhase = "connected" | "on" | "off" | "busy"

const TICK_MS = 3000

const [phase, setPhase] = createState<BtPhase>("off")
const [connectedName, setConnectedName] = createState("")
const [activeSnap, setActiveSnap] = createState(false)

let tickSource: number | null = null
let ctlInFlight = false

export function probeBluetooth(): { powered: boolean; connected: string } {
  try {
    const proc = Gio.Subprocess.new(
      ["bluetoothctl", "show"],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, stdout] = proc.communicate_utf8(null, null)
    const powered = (stdout ?? "").includes("Powered: yes")
    if (!powered) return { powered: false, connected: "" }

    const procDev = Gio.Subprocess.new(
      ["bluetoothctl", "devices", "Connected"],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, devOut] = procDev.communicate_utf8(null, null)
    const lines = (devOut ?? "").trim().split("\n").filter(Boolean)
    let dev = ""
    if (lines.length > 0) {
      // Formato: Device MAC DeviceName
      dev = lines[0].replace(/^Device\s+[0-9A-Fa-f:]+\s+/, "").trim()
    }
    return { powered: true, connected: dev }
  } catch {
    return { powered: false, connected: "" }
  }
}

function reconcile(): void {
  const { powered, connected } = probeBluetooth()
  setActiveSnap(powered)
  setConnectedName(connected)

  if (ctlInFlight) {
    setPhase("busy")
    return
  }

  if (powered) {
    setPhase(connected ? "connected" : "on")
  } else {
    setPhase("off")
  }
}

export function startBluetoothWatch(): void {
  if (tickSource !== null) return
  reconcile()
  tickSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
    reconcile()
    return GLib.SOURCE_CONTINUE
  })
}

export function toggleBluetooth(): void {
  if (ctlInFlight) return
  ctlInFlight = true
  setPhase("busy")

  try {
    const proc = Gio.Subprocess.new(
      ["/home/kodex/.local/bin/hypr-bluetooth-toggle"],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    )
    proc.communicate_utf8_async(null, null, (_p, res) => {
      ctlInFlight = false
      try {
        proc.communicate_utf8_finish(res)
      } catch {}
      reconcile()
    })
  } catch {
    ctlInFlight = false
    reconcile()
  }
}

export const bluetoothIconOn = createComputed(() => {
  void activeSnap()
  return activeSnap()
})

export const bluetoothLabel = createComputed(() => {
  void phase()
  void connectedName()
  const p = phase()
  const dev = connectedName()
  if (p === "busy") return "Bluetooth…"
  if (p === "connected") return dev || "Bluetooth ON"
  if (p === "on") return "Bluetooth ON"
  return "Bluetooth OFF"
})

export const bluetoothTip = createComputed(() => {
  void phase()
  void connectedName()
  const p = phase()
  const dev = connectedName()
  if (p === "busy") return "Bluetooth · conmutando estado…"
  if (p === "connected") return `Bluetooth · Conectado a ${dev} — clic para alternar`
  if (p === "on") return "Bluetooth · Encendido (sin conexión) — clic para apagar"
  return "Bluetooth · Apagado — clic para encender"
})

export const bluetoothRowClass = createComputed(() => {
  void phase()
  const p = phase()
  switch (p) {
    case "connected":
      return "SystemMenu-row bluetooth connected"
    case "on":
      return "SystemMenu-row bluetooth on"
    case "busy":
      return "SystemMenu-row bluetooth busy"
    case "off":
    default:
      return "SystemMenu-row bluetooth off"
  }
})

startBluetoothWatch()
