/**
 * Gabriel-L2TP FSM — SSOT = NetworkManager active connections.
 * Toggle: nmcli connection up|down id "Gabriel-L2TP"
 *
 * Phases: off | connecting | on | disconnecting | failed
 * UI: cream vpn.svg when on; grey vpn-off.svg otherwise.
 */
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createComputed, createState } from "ags"

export type L2tpPhase =
  | "off"
  | "connecting"
  | "on"
  | "disconnecting"
  | "failed"

/** Only VPN profile on this host (nmcli connection show). */
export const L2TP_CONN = "Gabriel-L2TP"

const TICK_SETTLED_MS = 2500
const TICK_BUSY_MS = 400
const CONNECT_TIMEOUT_SEC = 45
const DISCONNECT_TIMEOUT_SEC = 20
const FAILED_HOLD_SEC = 4

const [phase, setPhase] = createState<L2tpPhase>("off")
const [lastError, setLastError] = createState("")
const [activeSnap, setActiveSnap] = createState(false)

let tickSource: number | null = null
let tickIntervalMs = 0
let phaseSince = 0
let ctlInFlight = false
let started = false

function nowSec(): number {
  return GLib.get_monotonic_time() / 1_000_000
}

function enter(p: L2tpPhase): void {
  setPhase(p)
  phaseSince = nowSec()
  ensureTick()
}

/** True when Gabriel-L2TP is among NM active connections. */
export function probeL2tpActive(): boolean {
  try {
    const proc = Gio.Subprocess.new(
      ["nmcli", "-t", "-f", "NAME,TYPE", "connection", "show", "--active"],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, stdout] = proc.communicate_utf8(null, null)
    const lines = (stdout ?? "").trim().split("\n").filter(Boolean)
    for (const line of lines) {
      // NAME:TYPE — NAME may contain colons rarely; match exact name + vpn type
      const idx = line.lastIndexOf(":")
      if (idx < 0) continue
      const name = line.slice(0, idx)
      const type = line.slice(idx + 1)
      if (name === L2TP_CONN && type === "vpn") return true
    }
    return false
  } catch {
    return false
  }
}

function runNmcli(
  action: "up" | "down",
  onDone: (ok: boolean, err: string) => void,
): void {
  if (ctlInFlight) return
  ctlInFlight = true
  try {
    const proc = Gio.Subprocess.new(
      ["nmcli", "connection", action, "id", L2TP_CONN],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    )
    proc.communicate_utf8_async(null, null, (_p, res) => {
      ctlInFlight = false
      try {
        const [, , stderr] = proc.communicate_utf8_finish(res)
        const ok = proc.get_successful()
        const err = (stderr ?? "").trim()
        onDone(ok, err)
      } catch (e) {
        onDone(false, String(e))
      }
      ensureTick()
    })
  } catch (e) {
    ctlInFlight = false
    onDone(false, String(e))
  }
}

function reconcile(): void {
  const live = probeL2tpActive()
  setActiveSnap(live)
  const p = phase.peek()
  const age = nowSec() - phaseSince

  if (p === "connecting") {
    if (live) {
      setLastError("")
      enter("on")
      return
    }
    if (age >= CONNECT_TIMEOUT_SEC && !ctlInFlight) {
      setLastError(`connect timeout ${CONNECT_TIMEOUT_SEC}s`)
      enter("failed")
      return
    }
    return
  }

  if (p === "disconnecting") {
    if (!live) {
      setLastError("")
      enter("off")
      return
    }
    if (age >= DISCONNECT_TIMEOUT_SEC && !ctlInFlight) {
      setLastError(`disconnect timeout ${DISCONNECT_TIMEOUT_SEC}s`)
      enter("failed")
      return
    }
    return
  }

  if (p === "failed") {
    if (age >= FAILED_HOLD_SEC) {
      enter(live ? "on" : "off")
    }
    return
  }

  // settled: follow reality (external nmcli / GNOME panel)
  if (live && p !== "on") enter("on")
  else if (!live && p !== "off") enter("off")
}

function ensureTick(): void {
  const busy =
    phase.peek() === "connecting" ||
    phase.peek() === "disconnecting" ||
    ctlInFlight
  const want = busy ? TICK_BUSY_MS : TICK_SETTLED_MS
  if (tickSource !== null && tickIntervalMs === want) return
  if (tickSource !== null) {
    GLib.source_remove(tickSource)
    tickSource = null
  }
  tickIntervalMs = want
  tickSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, want, () => {
    reconcile()
    // interval may need to change after reconcile
    const stillBusy =
      phase.peek() === "connecting" ||
      phase.peek() === "disconnecting" ||
      ctlInFlight
    const next = stillBusy ? TICK_BUSY_MS : TICK_SETTLED_MS
    if (next !== tickIntervalMs) {
      tickSource = null
      tickIntervalMs = 0
      ensureTick()
      return GLib.SOURCE_REMOVE
    }
    return GLib.SOURCE_CONTINUE
  })
}

export function startL2tpWatch(): void {
  if (started) return
  started = true
  const live = probeL2tpActive()
  setActiveSnap(live)
  setPhase(live ? "on" : "off")
  phaseSince = nowSec()
  ensureTick()
}

/** Toggle from UI reality, not from a cached bool. */
export function toggleL2tp(): void {
  startL2tpWatch()
  const live = probeL2tpActive()
  setActiveSnap(live)
  const p = phase.peek()

  if (p === "connecting" || p === "disconnecting" || ctlInFlight) return

  if (live || p === "on") {
    setLastError("")
    enter("disconnecting")
    runNmcli("down", (ok, err) => {
      if (!ok) {
        // still up?
        if (probeL2tpActive()) {
          setLastError(err || "nmcli down failed")
          enter("failed")
        } else {
          setLastError("")
          enter("off")
        }
      }
      // success: wait for reconcile to see inactive
      reconcile()
    })
    return
  }

  // off / failed → connect
  setLastError("")
  enter("connecting")
  runNmcli("up", (ok, err) => {
    if (!ok) {
      if (probeL2tpActive()) {
        setLastError("")
        enter("on")
      } else {
        setLastError(err || "nmcli up failed")
        enter("failed")
      }
    }
    reconcile()
  })
}

export function getL2tpPhase(): L2tpPhase {
  return phase.peek()
}

export function getL2tpActive(): boolean {
  return activeSnap.peek()
}

export const l2tpPhase = phase
export const l2tpActive = activeSnap
export const l2tpError = lastError

export const l2tpIconOn = createComputed(() => {
  void phase()
  void activeSnap()
  const p = phase()
  return p === "on"
})

export const l2tpLabel = createComputed(() => {
  void phase()
  switch (phase()) {
    case "on":
      return "Disconnect"
    case "connecting":
      return "Connecting…"
    case "disconnecting":
      return "Disconnecting…"
    case "failed":
      return "Retry L2TP"
    default:
      return "Connect L2TP"
  }
})

export const l2tpTip = createComputed(() => {
  void phase()
  void lastError()
  void activeSnap()
  const p = phase()
  const err = lastError()
  const base = `${L2TP_CONN} · nmcli`
  if (p === "on") return `${base} · connected — click to disconnect`
  if (p === "connecting") return `${base} · connecting…`
  if (p === "disconnecting") return `${base} · disconnecting…`
  if (p === "failed")
    return err ? `${base} · failed: ${err}` : `${base} · failed — click to retry`
  return `${base} · disconnected — click to connect`
})

export const l2tpRowClass = createComputed(() => {
  void phase()
  switch (phase()) {
    case "on":
      return "SystemMenu-row vpn on"
    case "connecting":
    case "disconnecting":
      return "SystemMenu-row vpn busy"
    case "failed":
      return "SystemMenu-row vpn failed"
    default:
      return "SystemMenu-row vpn off"
  }
})

// boot watch as soon as module loads (bar import)
startL2tpWatch()
