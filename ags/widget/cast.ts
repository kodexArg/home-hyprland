import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createComputed, createState } from "ags"

export type CastTarget =
  | "panel-left"
  | "panel-right"
  | "panel-focused"
  | "screen-region"
  | "screen-full"
  | "window-geom"
  | null

/**
 * Cast FSM (caffeine-family: external SSOT + derived UI).
 *
 *   idle ──set target──► target_set ──click REC──► starting ──hypr-record──► recording
 *     ▲                      │                       │                         │
 *     │                   clear │                 timeout/fail              click stop
 *     │                      ▼                       ▼                         ▼
 *     └────────────────── failed ◄───────────────────┴────────────────── stopping
 *                              │                                              │
 *                              └──── target kept? → target_set : idle ◄───────┘
 *
 * SSOT while live: `hypr-record status` (string contains "recording").
 * Yellow chip = transitional (starting | stopping) — "thinking".
 */
export type CastPhase =
  | "idle"
  | "target_set"
  | "starting"
  | "recording"
  | "stopping"
  | "failed"

export type HyprWindowPanel = {
  address: string
  title: string
  class: string
  monitor: number
  monitorName: string
  at: [number, number]
  size: [number, number]
  geom: string
}

const RECONCILE_SETTLED_MS = 1500
const RECONCILE_WATCHING_MS = 250
const START_TIMEOUT_SEC = 8
const STOP_TIMEOUT_SEC = 12
const FAILED_HOLD_SEC = 2.5
const HYPR_RECORD = "/home/kodex/.local/bin/hypr-record"
const STATEFILE = `${GLib.getenv("XDG_RUNTIME_DIR") ?? "/tmp"}/hypr-record.state`

const [phase, setPhase] = createState<CastPhase>("idle")
const [target, setTargetState] = createState<CastTarget>(null)
const [windowGeom, setWindowGeom] = createState<string | null>(null)
const [windowTitle, setWindowTitle] = createState<string>("")
const [lastError, setLastError] = createState("")
export const [castPopupOpen, setCastPopupOpen] = createState<boolean>(false)

export const castPhase = phase
export const castTarget = target
export const castError = lastError
export const castWindowTitle = windowTitle

let reconcileTimer: number | null = null
let reconcileIntervalMs = 0
let phaseSince = 0

function nowSec(): number {
  return GLib.get_monotonic_time() / 1_000_000
}

function enterPhase(next: CastPhase, errorMsg = ""): void {
  setPhase(next)
  setLastError(errorMsg)
  phaseSince = nowSec()
  ensureReconcileLoop()
}

function checkHyprRecordActive(): boolean {
  try {
    const proc = Gio.Subprocess.new(
      [HYPR_RECORD, "status"],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, stdout] = proc.communicate_utf8(null, null)
    const out = (stdout ?? "").trim()
    return out.includes("recording")
  } catch {
    return false
  }
}

function readStateFilePath(): string {
  try {
    const f = Gio.File.new_for_path(STATEFILE)
    const [ok, contents] = f.load_contents(null)
    if (!ok) return ""
    const text = new TextDecoder().decode(contents).trim()
    // mode|file|started_iso
    const parts = text.split("|")
    return parts[1]?.trim() ?? ""
  } catch {
    return ""
  }
}

function openVlc(filePath: string): void {
  if (!filePath) return
  try {
    const vlc = GLib.find_program_in_path("vlc") ?? "/usr/bin/vlc"
    Gio.Subprocess.new(
      [vlc, "--play-and-exit", filePath],
      Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
  } catch (e) {
    print(`[cast] vlc open failed: ${e}`)
  }
}

function copyPath(filePath: string): void {
  if (!filePath) return
  try {
    const wl = GLib.find_program_in_path("wl-copy") ?? "/usr/bin/wl-copy"
    const proc = Gio.Subprocess.new(
      [wl],
      Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    proc.communicate_utf8(filePath, null)
  } catch (e) {
    print(`[cast] wl-copy failed: ${e}`)
  }
}

function watchingPhases(p: CastPhase): boolean {
  return p === "starting" || p === "stopping" || p === "recording" || p === "failed"
}

function ensureReconcileLoop(): void {
  const want = watchingPhases(phase.peek())
    ? RECONCILE_WATCHING_MS
    : RECONCILE_SETTLED_MS
  if (reconcileTimer !== null && reconcileIntervalMs === want) return
  if (reconcileTimer !== null) {
    GLib.source_remove(reconcileTimer)
    reconcileTimer = null
  }
  reconcileIntervalMs = want
  reconcileTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, want, () => {
    reconcile()
    // interval may change after phase flip
    const nextWant = watchingPhases(phase.peek())
      ? RECONCILE_WATCHING_MS
      : RECONCILE_SETTLED_MS
    if (nextWant !== reconcileIntervalMs) {
      reconcileTimer = null
      reconcileIntervalMs = 0
      ensureReconcileLoop()
      return GLib.SOURCE_REMOVE
    }
    return GLib.SOURCE_CONTINUE
  })
}

/** Last file path captured at stop request (SSOT may clear before finalize). */
let pendingStopPath = ""

function reconcile(): void {
  const isRec = checkHyprRecordActive()
  const cur = phase.peek()
  const elapsed = nowSec() - phaseSince

  switch (cur) {
    case "starting":
      if (isRec) {
        enterPhase("recording")
        return
      }
      if (elapsed >= START_TIMEOUT_SEC) {
        enterPhase("failed", "start timeout — encoder never became active")
      }
      return

    case "recording":
      if (!isRec) {
        // External stop (hotkey / CLI)
        enterPhase(target.peek() ? "target_set" : "idle")
      }
      return

    case "stopping":
      if (isRec) {
        if (elapsed >= STOP_TIMEOUT_SEC) {
          enterPhase("failed", "stop timeout — encoder still running")
        }
        return
      }
      // Encoder gone — finalize UX (clipboard already done by hypr-record; VLC here)
      {
        const path = pendingStopPath || readStateFilePath()
        pendingStopPath = ""
        if (path && GLib.file_test(path, GLib.FileTest.EXISTS)) {
          copyPath(path)
          openVlc(path)
        }
        enterPhase(target.peek() ? "target_set" : "idle")
      }
      return

    case "failed":
      if (elapsed >= FAILED_HOLD_SEC) {
        enterPhase(target.peek() ? "target_set" : "idle")
      }
      return

    case "idle":
    case "target_set":
      // External start (hotkey) while we had a target or not
      if (isRec) enterPhase("recording")
      return
  }
}

// Boot reconcile loop
ensureReconcileLoop()

export const hasCastTarget = createComputed(() => target() !== null)

/** Visible: any non-idle phase, or target armed. */
export const castChipVisible = createComputed(() => {
  const t = target()
  const p = phase()
  if (t !== null) return true
  return p === "starting" || p === "recording" || p === "stopping" || p === "failed"
})

/** Gray — target selected, settled, ready to click. */
export const castChipArmed = createComputed(() => phase() === "target_set")

/** Yellow — transitional thinking (starting encoder / stopping+finalize). */
export const castChipThinking = createComputed(() => {
  const p = phase()
  return p === "starting" || p === "stopping"
})

export const isRecording = createComputed(() => phase() === "recording")

export const isFailed = createComputed(() => phase() === "failed")

/** Chip CSS modifier from FSM phase only. */
export const castChipClass = createComputed(() => {
  const p = phase()
  switch (p) {
    case "target_set":
      return "CastRecChip armed"
    case "starting":
    case "stopping":
      return "CastRecChip thinking"
    case "recording":
      return "CastRecChip recording"
    case "failed":
      return "CastRecChip failed"
    default:
      return "CastRecChip"
  }
})

export const castTargetLabel = createComputed(() => {
  const t = target()
  if (!t) return "No target"
  switch (t) {
    case "panel-left":
      return "ASUS Left Panel"
    case "panel-right":
      return "AOC Right Panel"
    case "panel-focused":
      return "Focused Panel"
    case "screen-region":
      return "Screen Region"
    case "screen-full":
      return "Full Screen (All)"
    case "window-geom": {
      const title = windowTitle()
      return title ? `Window: ${title}` : "Window"
    }
    default:
      return String(t)
  }
})

export const castTip = createComputed(() => {
  const p = phase()
  const t = target()
  switch (p) {
    case "starting":
      return "Starting recorder…"
    case "recording":
      return "Recording… click [*REC] to stop, copy path & open VLC"
    case "stopping":
      return "Finalizing… saving, copy path, open VLC"
    case "failed":
      return `Cast error: ${lastError() || "unknown"}`
    case "target_set":
      return `Armed: ${castTargetLabel()} — click [*REC] to start`
    default:
      if (!t) return "No target — SystemMenu → Cast to select"
      return `Target: ${castTargetLabel()}`
  }
})

export function setCastTarget(t: CastTarget, opts?: { geom?: string; title?: string }): void {
  if (t === "window-geom") {
    setWindowGeom(opts?.geom ?? null)
    setWindowTitle(opts?.title ?? "")
  } else {
    setWindowGeom(null)
    setWindowTitle("")
  }
  setTargetState(t)
  const p = phase.peek()
  if (p === "recording" || p === "starting" || p === "stopping") return
  enterPhase(t ? "target_set" : "idle")
}

export function clearCastTarget(): void {
  const p = phase.peek()
  if (p === "recording" || p === "starting" || p === "stopping") return
  setWindowGeom(null)
  setWindowTitle("")
  setTargetState(null)
  enterPhase("idle")
}

export function fetchHyprlandPanels(): HyprWindowPanel[] {
  try {
    const hyprctlBin = GLib.find_program_in_path("hyprctl") ?? "/usr/bin/hyprctl"
    const procM = Gio.Subprocess.new(
      [hyprctlBin, "monitors", "-j"],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, outM] = procM.communicate_utf8(null, null)
    const monitors = JSON.parse(outM ?? "[]") as Array<{ id: number; name: string }>
    const monMap = new Map<number, string>()
    for (const m of monitors) {
      monMap.set(m.id, m.name)
    }

    const procC = Gio.Subprocess.new(
      [hyprctlBin, "clients", "-j"],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, outC] = procC.communicate_utf8(null, null)
    const clients = JSON.parse(outC ?? "[]") as Array<{
      address: string
      title: string
      class: string
      monitor: number
      at: [number, number]
      size: [number, number]
      mapped: boolean
      hidden: boolean
    }>

    const res: HyprWindowPanel[] = []
    for (const c of clients) {
      if (!c.mapped || c.hidden) continue
      const title = (c.title ?? "").trim() || c.class || "untitled"
      const monName = monMap.get(c.monitor) ?? `Monitor ${c.monitor}`
      const geom = `${c.at[0]},${c.at[1]} ${c.size[0]}x${c.size[1]}`
      res.push({
        address: c.address,
        title,
        class: c.class,
        monitor: c.monitor,
        monitorName: monName,
        at: c.at,
        size: c.size,
        geom,
      })
    }
    return res
  } catch (e) {
    print(`[cast] fetchHyprlandPanels error: ${e}`)
    return []
  }
}

function targetArgs(): string[] | null {
  const t = target.peek()
  if (!t) return null
  switch (t) {
    case "panel-left":
      return ["panel", "asus"]
    case "panel-right":
      return ["panel", "aoc"]
    case "panel-focused":
      return ["panel", "focused"]
    case "screen-region":
      return ["region"]
    case "screen-full":
      return ["full"]
    case "window-geom": {
      const g = windowGeom.peek()
      if (!g) return null
      return ["geom", g]
    }
    default:
      return null
  }
}

/** Immediate start — no artificial delay (REC click is the commit). */
export function launchRecord(args: string[]): void {
  setCastPopupOpen(false)
  enterPhase("starting")
  try {
    Gio.Subprocess.new(
      [HYPR_RECORD, ...args],
      Gio.SubprocessFlags.STDERR_SILENCE,
    )
  } catch (e) {
    enterPhase("failed", String(e))
  }
  // Phase stays "starting" until reconcile sees hypr-record status=recording
}

/** @deprecated use launchRecord — kept name for any external callers */
export function launchRecordWithDelay(args: string[]): void {
  launchRecord(args)
}

export function startCastRecord(): void {
  const p = phase.peek()
  if (p === "starting" || p === "recording" || p === "stopping") return

  const args = targetArgs()
  if (!args) {
    enterPhase("failed", "No target selected")
    return
  }
  launchRecord(args)
}

export function stopCastRecord(): void {
  const p = phase.peek()
  if (p === "stopping") return
  if (p !== "recording" && p !== "starting") return

  pendingStopPath = readStateFilePath()
  enterPhase("stopping")
  try {
    Gio.Subprocess.new(
      [HYPR_RECORD, "stop"],
      Gio.SubprocessFlags.STDERR_SILENCE,
    )
  } catch (e) {
    enterPhase("failed", String(e))
  }
  // Finalize + VLC happens in reconcile when SSOT goes idle
}

export function toggleCastRecord(): void {
  const p = phase.peek()
  if (p === "recording") {
    stopCastRecord()
    return
  }
  if (p === "starting" || p === "stopping") {
    // Transitional — ignore click (yellow thinking)
    return
  }
  startCastRecord()
}
