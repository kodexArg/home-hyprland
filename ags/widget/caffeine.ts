/**
 * Caffeine — logind idle+sleep inhibit (Hyprland / no gnome-session).
 *
 * ## Design contract (bar widget pattern — replicate this)
 *
 * 1. **SSOT is outside AGS memory.** Truth = process table:
 *      `systemd-inhibit … --who=ags-caffeine`
 *    Never trust a lone `createState` bool for "is sleep blocked".
 *
 * 2. **UI is derived.** Icon / class / tooltip project `(phase × pids)`.
 *    They never decide the next toggle direction alone.
 *
 * 3. **Explicit FSM.** Named phases + one reconcile path. Side effects only
 *    from transitions (spawn / kill), never from render.
 *
 * 4. **Tick reconcile.** Drift (orphan after crash, external kill, multi-PID)
 *    self-heals without a user click.
 *
 * 5. **IPC reports verified snapshot**, not the caller's desire string alone.
 *
 * ## FSM
 *
 * ```
 *   off ──requestOn──► arming ──pid≥1──► on
 *    ▲                   │fail/timeout      │
 *    │                   └──────► failed ───┤
 *    │                                      │
 *    └──── pids=0 ◄── disarming ◄──requestOff┘
 *
 *   tick (steady):
 *     on  + pids=0      → off
 *     off + pids=1      → on   (adopt orphan)
 *     *   + pids>1      → kill-all → arming (single actor)
 * ```
 *
 * Mechanism: held child
 *   systemd-inhibit --what=idle:sleep --who=ags-caffeine --mode=block sleep infinity
 * Gtk.Application.inhibit is a no-op here (no session manager → logind).
 *
 * ADR: ~/Documents/System/ADRs/20260720-ags-caffeine-toggle.md
 */
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
const TICK_MS = 1500
const ARM_TIMEOUT_SEC = 3
const DISARM_TIMEOUT_SEC = 3
/** After failed with no pids, collapse to off so the cup is clickable again. */
const FAILED_HOLD_SEC = 2

const [phase, setPhase] = createState<CaffeinePhase>("off")
const [pidCount, setPidCount] = createState(0)
const [lastError, setLastError] = createState("")

/** Owned child only (orphans live in the process table without a handle). */
let ownedProc: Gio.Subprocess | null = null
let tickSource: number | null = null
let phaseSince = 0
let started = false

function nowSec(): number {
  return GLib.get_monotonic_time() / 1_000_000
}

function enter(p: CaffeinePhase): void {
  setPhase(p)
  phaseSince = nowSec()
}

/** PIDs of live `systemd-inhibit … --who=ags-caffeine` (may be orphans). */
export function listCaffeinePids(): number[] {
  try {
    // ps -C = real binary only — not pgrep -f (agents / tooling false-positives).
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

function killAllInhibitors(): void {
  for (const pid of listCaffeinePids()) {
    try {
      Gio.Subprocess.new(
        ["kill", String(pid)],
        Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
      ).wait(null)
    } catch {
      /* already gone */
    }
  }
  if (ownedProc) {
    try {
      ownedProc.force_exit()
    } catch {
      /* already dead */
    }
    ownedProc = null
  }
}

function spawnInhibitor(): void {
  try {
    const proc = Gio.Subprocess.new(
      [
        "systemd-inhibit",
        "--what=idle:sleep",
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
      } catch {
        /* exit status / already reaped */
      }
      if (ownedProc === proc) ownedProc = null
      // Child gone → let reconcile decide (on→off, or orphan still holds).
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

/**
 * Single reconcile path. Call after transitions, on tick, and on child exit.
 * Reality (pid count) wins over steady UI phases.
 */
function reconcile(): void {
  const pids = listCaffeinePids()
  setPidCount(pids.length)
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
      // Reality still blocking — adopt rather than lie with empty cup.
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

  // Multi-PID anywhere in steady state → collapse to exactly one.
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
      // Orphan from prior AGS death — adopt, show ON.
      setLastError("")
      enter("on")
    }
  }
}

function ensureTick(): void {
  if (tickSource !== null) return
  tickSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
    reconcile()
    return GLib.SOURCE_CONTINUE
  })
}

/** Boot: start tick + adopt any orphan left by a previous AGS instance. */
export function startCaffeine(): void {
  if (started) return
  started = true
  ensureTick()
  reconcile()
}

// Module load = app imported Bar → caffeine. Safe: no window deps.
startCaffeine()

// ─── commands (bar click + IPC) ─────────────────────────────────────────────

/**
 * Desire ON. Idempotent if already armed / arming.
 * Returns verified status line after reconcile.
 */
export function requestCaffeineOn(): string {
  ensureTick()
  const n = listCaffeinePids().length
  const p = phase.peek()
  // Already blocking (owned or orphan): adopt / stay on — no second spawn.
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

/**
 * Desire OFF. Always kills reality — even if phase thinks `off` (stale UI
 * while an orphan still holds logind). Idempotent when nothing is blocking.
 */
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

/**
 * Toggle from **reality + phase**, never from a naked UI bool.
 * Re-list pids here so direction is never based on a stale pidCount.
 */
export function toggleCaffeine(): string {
  ensureTick()
  const n = listCaffeinePids().length
  setPidCount(n)
  const p = phase.peek()
  const armed =
    n > 0 || p === "on" || p === "arming" || p === "disarming"
  return armed ? requestCaffeineOff() : requestCaffeineOn()
}

// ─── UI projections ─────────────────────────────────────────────────────────

/**
 * Cup + steam / warm chip when sleep is blocked by us or we are mid-transition
 * that still means "blocking or about to". failed → empty (error in tooltip).
 */
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
  return "Caffeine off — click to stay awake"
})

export const caffeineShellClass = createComputed(() =>
  caffeineUiOn() ? "ClockCluster caffeine-on" : "ClockCluster",
)

export function getCaffeineOn(): boolean {
  const p = phase.peek()
  if (p === "on" || p === "arming" || p === "disarming") return true
  return pidCount.peek() > 0
}

export function getCaffeinePhase(): CaffeinePhase {
  return phase.peek()
}

/** Snapshot after reconcile — never return a stale phase/pidCount. */
export function getCaffeineStatus(): string {
  ensureTick()
  reconcile()
  return statusLine()
}

function statusLine(): string {
  const p = phase.peek()
  const n = pidCount.peek()
  const err = lastError.peek()
  const base = `caffeine phase=${p} pids=${n}`
  return err ? `${base} err=${err}` : base
}

/** Compact token for scripts that only need on/off-ish. Caller should reconcile first (status/on/off/toggle do). */
export function getCaffeineToken(): string {
  const p = phase.peek()
  if (p === "on" || p === "arming" || p === "disarming") return `caffeine-${p}`
  if (p === "failed") return "caffeine-failed"
  return pidCount.peek() > 0 ? "caffeine-on" : "caffeine-off"
}
