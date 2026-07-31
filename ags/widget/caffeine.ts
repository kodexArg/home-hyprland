import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createComputed, createState } from "ags"

export type CaffeinePhase =
  | "off"
  | "arming"
  | "on"
  | "disarming"
  | "failed"

const CAFFEINE_WHO = "ags-caffeine"
const TICK_WHILE_WATCHING_MS = 1500
const TICK_WHILE_SETTLED_MS = 10000
const ARM_TIMEOUT_SEC = 3
const DISARM_TIMEOUT_SEC = 3
const FAILED_HOLD_SEC = 2

const [phase, setPhase] = createState<CaffeinePhase>("off")
const [pidCount, setPidCount] = createState(0)
const [foreignIdleHold, setForeignIdleHold] = createState(false)
const [lastError, setLastError] = createState("")

let ownedProc: Gio.Subprocess | null = null
let tickSource: number | null = null
let tickIntervalMs = 0
let reconcileInFlight = false
let phaseSince = 0
let started = false

function nowSec(): number {
  return GLib.get_monotonic_time() / 1_000_000
}

function enter(p: CaffeinePhase): void {
  setPhase(p)
  phaseSince = nowSec()
  ensureTick()
}

export function listCaffeinePids(): number[] {
  try {
    const proc = Gio.Subprocess.new(
      ["ps", "-C", "systemd-inhibit", "-o", "pid=,args="],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, stdout] = proc.communicate_utf8(null, null)
    const out = (stdout ?? "").trim()
    if (!out) return []
    return out
      .split("\n")
      .filter((line) => line.includes(`--who=${CAFFEINE_WHO}`))
      .map((line) => parseInt(line.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 1)
  } catch {
    return []
  }
}

function idleBlockedSystemWide(): boolean {
  try {
    const proc = Gio.Subprocess.new(
      [
        "busctl",
        "get-property",
        "org.freedesktop.login1",
        "/org/freedesktop/login1",
        "org.freedesktop.login1.Manager",
        "BlockInhibited",
      ],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, stdout] = proc.communicate_utf8(null, null)
    return (stdout ?? "").includes("idle")
  } catch {
    return false
  }
}

function killAllInhibitors(): void {
  for (const pid of listCaffeinePids()) {
    try {
      Gio.Subprocess.new(
        ["kill", String(pid)],
        Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
      ).wait(null)
    } catch {}
  }
  if (ownedProc) {
    try {
      ownedProc.force_exit()
    } catch {}
    ownedProc = null
  }
}

function spawnInhibitor(): void {
  try {
    const proc = Gio.Subprocess.new(
      [
        "systemd-inhibit",
        "--what=idle",
        `--who=${CAFFEINE_WHO}`,
        "--why=Caffeine — keep awake",
        "--mode=block",
        "sleep",
        "infinity",
      ],
      Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    ownedProc = proc
    proc.wait_async(null, (_obj, res) => {
      try {
        proc.wait_finish(res)
      } catch {}
      if (ownedProc === proc) ownedProc = null
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        reconcile()
        return GLib.SOURCE_REMOVE
      })
    })
  } catch (e) {
    ownedProc = null
    setLastError(`spawn failed: ${e}`)
    enter("failed")
    printerr(`caffeine: spawn failed: ${e}`)
  }
}

function reconcile(): void {
  const pids = listCaffeinePids()
  setPidCount(pids.length)
  setForeignIdleHold(pids.length === 0 && idleBlockedSystemWide())
  const n = pids.length
  const p = phase.peek()
  const age = nowSec() - phaseSince

  if (p === "arming") {
    if (n >= 1) {
      setLastError("")
      enter("on")
      return
    }
    if (age > ARM_TIMEOUT_SEC) {
      setLastError("arm timeout: no ags-caffeine pid")
      enter("failed")
      printerr("caffeine: arm timeout")
    }
    return
  }

  if (p === "disarming") {
    if (n === 0) {
      enter("off")
      return
    }
    if (age > DISARM_TIMEOUT_SEC) {
      killAllInhibitors()
      const left = listCaffeinePids()
      setPidCount(left.length)
      if (left.length === 0) {
        enter("off")
      } else {
        setLastError(`disarm stuck: ${left.length} pid(s)`)
        enter("failed")
        printerr(`caffeine: disarm stuck pids=${left.join(",")}`)
      }
    }
    return
  }

  if (p === "failed") {
    if (n >= 1) {
      setLastError("")
      enter(n === 1 ? "on" : "arming")
      if (n > 1) {
        killAllInhibitors()
        spawnInhibitor()
      }
      return
    }
    if (age > FAILED_HOLD_SEC) enter("off")
    return
  }

  if (n > 1) {
    printerr(`caffeine: collapsing ${n} inhibitors → 1`)
    killAllInhibitors()
    setLastError("")
    enter("arming")
    spawnInhibitor()
    return
  }

  if (p === "on") {
    if (n === 0) {
      ownedProc = null
      enter("off")
    }
    return
  }

  if (p === "off") {
    if (n === 1) {
      setLastError("")
      enter("on")
    }
  }
}

function isSettled(): boolean {
  return phase.peek() === "off"
}

function tickIntervalForPhase(): number {
  return isSettled() ? TICK_WHILE_SETTLED_MS : TICK_WHILE_WATCHING_MS
}

function reconcileOnce(): void {
  reconcileInFlight = true
  try {
    reconcile()
  } finally {
    reconcileInFlight = false
  }
}

function armTick(intervalMs: number): void {
  tickIntervalMs = intervalMs

  tickSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
    reconcileOnce()

    if (tickIntervalForPhase() === tickIntervalMs) return GLib.SOURCE_CONTINUE

    tickSource = null
    ensureTick()
    return GLib.SOURCE_REMOVE
  })
}

function ensureTick(): void {
  if (reconcileInFlight) return

  const wanted = tickIntervalForPhase()
  if (tickSource !== null && tickIntervalMs === wanted) return
  if (tickSource !== null) GLib.source_remove(tickSource)

  armTick(wanted)
}

export function startCaffeine(): void {
  if (started) return
  started = true
  ensureTick()
  reconcile()
}

startCaffeine()

export function requestCaffeineOn(): string {
  ensureTick()
  const n = listCaffeinePids().length
  const p = phase.peek()
  if (n === 1 && (p === "on" || p === "arming" || p === "off" || p === "failed")) {
    setLastError("")
    enter("on")
    setPidCount(1)
    return statusLine()
  }
  if (p === "on" || p === "arming") {
    reconcile()
    return statusLine()
  }
  if (n > 1) killAllInhibitors()
  setLastError("")
  enter("arming")
  spawnInhibitor()
  reconcile()
  return statusLine()
}

export function requestCaffeineOff(): string {
  ensureTick()
  const n = listCaffeinePids().length
  if (n === 0 && phase.peek() === "off") {
    setPidCount(0)
    return statusLine()
  }
  enter("disarming")
  killAllInhibitors()
  reconcile()
  return statusLine()
}

export function toggleCaffeine(): string {
  ensureTick()
  const n = listCaffeinePids().length
  setPidCount(n)
  const p = phase.peek()
  const armed =
    n > 0 || p === "on" || p === "arming" || p === "disarming"
  return armed ? requestCaffeineOff() : requestCaffeineOn()
}

export const caffeineUiOn = createComputed(() => {
  const p = phase()
  if (p === "on" || p === "arming" || p === "disarming") return true
  return pidCount() > 0
})

export const caffeineTooltip = createComputed(() => {
  const p = phase()
  const err = lastError()
  if (p === "arming") return "Caffeine arming… (blocking idle/sleep)"
  if (p === "disarming") return "Caffeine disarming…"
  if (p === "failed")
    return err
      ? `Caffeine failed: ${err}`
      : "Caffeine failed — click to retry"
  if (p === "on" || pidCount() > 0)
    return "Caffeine on — click to allow sleep"
  if (foreignIdleHold())
    return "Caffeine off — but idle is held by another inhibitor (not the cup)"
  return "Caffeine off — click to stay awake"
})

export const caffeineShellClass = createComputed(() => {
  if (caffeineUiOn()) return "ClockCluster caffeine-on"
  return foreignIdleHold() ? "ClockCluster caffeine-foreign" : "ClockCluster"
})

export function getCaffeineOn(): boolean {
  const p = phase.peek()
  if (p === "on" || p === "arming" || p === "disarming") return true
  return pidCount.peek() > 0
}

export function getCaffeinePhase(): CaffeinePhase {
  return phase.peek()
}

export function getCaffeineStatus(): string {
  ensureTick()
  reconcile()
  return statusLine()
}

function statusLine(): string {
  const p = phase.peek()
  const n = pidCount.peek()
  const err = lastError.peek()
  const foreign = foreignIdleHold.peek() ? " foreign=idle" : ""
  const base = `caffeine phase=${p} pids=${n}${foreign}`
  return err ? `${base} err=${err}` : base
}

export function getCaffeineToken(): string {
  const p = phase.peek()
  if (p === "on" || p === "arming" || p === "disarming") return `caffeine-${p}`
  if (p === "failed") return "caffeine-failed"
  return pidCount.peek() > 0 ? "caffeine-on" : "caffeine-off"
}
