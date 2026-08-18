/**
 * Cloudflare WARP FSM — SSOT = warp-cli status.
 * Toggle: warp-cli --accept-tos connect|disconnect
 *
 * Normal/Default: connected -> "CloudFlare WARP" (sin resaltar, opaque icon)
 * Paused/Disconnected: "WARP Paused" (resaltado / highlighted, grey icon)
 */
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createComputed, createState } from "ags"

export type WarpPhase =
  | "connected"
  | "connecting"
  | "disconnected"
  | "disconnecting"
  | "failed"

const TICK_SETTLED_MS = 2500
const TICK_BUSY_MS = 400
const CONNECT_TIMEOUT_SEC = 30
const DISCONNECT_TIMEOUT_SEC = 15
const FAILED_HOLD_SEC = 4

const [phase, setPhase] = createState<WarpPhase>("connected")
const [lastError, setLastError] = createState("")
const [activeSnap, setActiveSnap] = createState(true)

let tickSource: number | null = null
let tickIntervalMs = 0
let phaseSince = 0
let ctlInFlight = false
let started = false

function nowSec(): number {
  return GLib.get_monotonic_time() / 1_000_000
}

function enter(p: WarpPhase): void {
  setPhase(p)
  phaseSince = nowSec()
  ensureTick()
}

/** True when Cloudflare WARP is Connected. */
export function probeWarpActive(): boolean {
  try {
    const proc = Gio.Subprocess.new(
      ["warp-cli", "--accept-tos", "--json", "status"],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, stdout] = proc.communicate_utf8(null, null)
    const data = JSON.parse((stdout ?? "").trim())
    return data.status === "Connected"
  } catch {
    try {
      const proc = Gio.Subprocess.new(
        ["warp-cli", "--accept-tos", "status"],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
      )
      const [, stdout] = proc.communicate_utf8(null, null)
      const text = (stdout ?? "").trim()
      return text.includes("Connected") && !text.includes("Disconnected") && !text.includes("Connecting")
    } catch {
      return false
    }
  }
}

function runWarpCli(
  action: "connect" | "disconnect",
  onDone: (ok: boolean, err: string) => void,
): void {
  if (ctlInFlight) return
  ctlInFlight = true
  try {
    const proc = Gio.Subprocess.new(
      ["warp-cli", "--accept-tos", action],
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
  const live = probeWarpActive()
  setActiveSnap(live)
  const p = phase.peek()
  const age = nowSec() - phaseSince

  if (p === "connecting") {
    if (live) {
      setLastError("")
      enter("connected")
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
      enter("disconnected")
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
      enter(live ? "connected" : "disconnected")
    }
    return
  }

  // settled: follow reality
  if (live && p !== "connected") enter("connected")
  else if (!live && p !== "disconnected") enter("disconnected")
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

export function startWarpWatch(): void {
  if (started) return
  started = true
  const live = probeWarpActive()
  setActiveSnap(live)
  setPhase(live ? "connected" : "disconnected")
  phaseSince = nowSec()
  ensureTick()
}

/** Toggle from UI reality, not from a cached bool. */
export function toggleWarp(): void {
  startWarpWatch()
  const live = probeWarpActive()
  setActiveSnap(live)
  const p = phase.peek()

  if (p === "connecting" || p === "disconnecting" || ctlInFlight) return

  if (live || p === "connected") {
    setLastError("")
    enter("disconnecting")
    runWarpCli("disconnect", (ok, err) => {
      if (!ok) {
        if (probeWarpActive()) {
          setLastError(err || "warp-cli disconnect failed")
          enter("failed")
        } else {
          setLastError("")
          enter("disconnected")
        }
      }
      reconcile()
    })
    return
  }

  // disconnected / failed -> connect
  setLastError("")
  enter("connecting")
  runWarpCli("connect", (ok, err) => {
    if (!ok) {
      if (probeWarpActive()) {
        setLastError("")
        enter("connected")
      } else {
        setLastError(err || "warp-cli connect failed")
        enter("failed")
      }
    }
    reconcile()
  })
}

export function getWarpPhase(): WarpPhase {
  return phase.peek()
}

export function getWarpActive(): boolean {
  return activeSnap.peek()
}

export const warpPhase = phase
export const warpActive = activeSnap
export const warpError = lastError

export const warpIconOn = createComputed(() => {
  void phase()
  void activeSnap()
  const p = phase()
  return p === "connected"
})

export const warpLabel = createComputed(() => {
  void phase()
  switch (phase()) {
    case "connected":
      return "CloudFlare WARP"
    case "connecting":
      return "Connecting…"
    case "disconnecting":
      return "Pausing…"
    case "failed":
      return "Retry WARP"
    case "disconnected":
    default:
      return "WARP Paused"
  }
})

export const warpTip = createComputed(() => {
  void phase()
  void lastError()
  void activeSnap()
  const p = phase()
  const err = lastError()
  const base = "Cloudflare WARP"
  if (p === "connected") return `${base} · active (connected) — click to pause`
  if (p === "connecting") return `${base} · connecting…`
  if (p === "disconnecting") return `${base} · pausing…`
  if (p === "failed")
    return err ? `${base} · error: ${err} — click to retry` : `${base} · error — click to retry`
  return `${base} · paused (disconnected) — click to activate`
})

export const warpRowClass = createComputed(() => {
  void phase()
  switch (phase()) {
    case "connected":
      return "SystemMenu-row warp connected"
    case "connecting":
    case "disconnecting":
      return "SystemMenu-row warp busy"
    case "failed":
      return "SystemMenu-row warp failed"
    case "disconnected":
    default:
      return "SystemMenu-row warp paused"
  }
})

// boot watch as soon as module loads (bar import)
startWarpWatch()
