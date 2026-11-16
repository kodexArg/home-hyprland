import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createComputed, createState } from "ags"

export type CastTarget = "monitor" | "panel" | "area" | null

export type CastPhase =
  | "idle"
  | "target_set"
  | "starting"
  | "recording"
  | "stopping"
  | "failed"

export type HyprMonitorInfo = {
  id: number
  name: string
  make: string
  model: string
  description: string
  width: number
  height: number
  x: number
  y: number
  focused: boolean
}

export type HyprWindowPanel = {
  address: string
  title: string
  class: string
  monitor: number
  monitorName: string
  workspaceName: string
  at: [number, number]
  size: [number, number]
  geom: string
}

const RECONCILE_SETTLED_MS = 1500
const RECONCILE_WATCHING_MS = 250
const START_TIMEOUT_SEC = 5
const STOP_TIMEOUT_SEC = 12
const FAILED_HOLD_SEC = 2.5
const AREA_DELAY_MS = 3000

const HYPR_RECORD = `${GLib.get_home_dir()}/.local/bin/hypr-record`
const RUNTIME_DIR = GLib.getenv("XDG_RUNTIME_DIR") ?? "/tmp"
const STATEFILE = `${RUNTIME_DIR}/hypr-record.state`
const PIDFILE = `${RUNTIME_DIR}/hypr-record.pid`

const [phase, setPhase] = createState<CastPhase>("idle")
const [target, setTargetState] = createState<CastTarget>(null)
const [monitorOutput, setMonitorOutput] = createState<string>("")
const [monitorLabel, setMonitorLabel] = createState<string>("")
const [panelAddress, setPanelAddress] = createState<string>("")
const [panelTitle, setPanelTitle] = createState<string>("")
const [areaGeom, setAreaGeom] = createState<string>("")
const [lastError, setLastError] = createState("")

export const [castPopupOpen, setCastPopupOpen] = createState<boolean>(false)
/** "m:ss" while recording, "" otherwise. */
const [elapsedLabel, setElapsedLabel] = createState("")
/** Audio mode of the live recording as written by hypr-record (both|system|mic|0). */
const [audioMode, setAudioMode] = createState("")

export const castPhase = phase
export const castTarget = target
export const castError = lastError
export const castMonitorOutput = monitorOutput
export const castPanelAddress = panelAddress
export const castWindowTitle = panelTitle
export const castElapsed = elapsedLabel

let reconcileTimer: number | null = null
let reconcileIntervalMs = 0
let areaDelayTimer: number | null = null
let phaseSince = 0
/** Wall-clock start of the live recording (ms since epoch), 0 = unknown. */
let recStartedMs = 0

function nowSec(): number {
  return GLib.get_monotonic_time() / 1_000_000
}

function cancelAreaDelay(): void {
  if (areaDelayTimer !== null) {
    GLib.source_remove(areaDelayTimer)
    areaDelayTimer = null
  }
}

function enterPhase(next: CastPhase, errorMsg = ""): void {
  if (next !== "recording") recStartedMs = 0
  setPhase(next)
  setLastError(errorMsg)
  phaseSince = nowSec()
  ensureReconcileLoop()
}

function readTextFile(path: string): string {
  try {
    const [ok, contents] = GLib.file_get_contents(path)
    return ok && contents ? new TextDecoder().decode(contents).trim() : ""
  } catch {
    return ""
  }
}

/** Same test as `hypr-record status` (pidfile + live pid), without spawning. */
function checkHyprRecordActive(): boolean {
  const pid = readTextFile(PIDFILE)
  return /^\d+$/.test(pid) && GLib.file_test(`/proc/${pid}`, GLib.FileTest.EXISTS)
}

/** hypr-record state: mode|file|started_iso|audio */
function readStateFile(): { file: string; startedMs: number; audio: string } {
  const parts = readTextFile(STATEFILE).split("|")
  const started = Date.parse(parts[2]?.trim() ?? "")
  return {
    file: parts[1]?.trim() ?? "",
    startedMs: Number.isFinite(started) ? started : 0,
    audio: parts[3]?.trim() ?? "",
  }
}

function readStateFilePath(): string {
  return readStateFile().file
}

function formatElapsed(totalSec: number): string {
  const t = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = String(t % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`
}

function tickElapsed(): void {
  if (phase.peek() !== "recording") {
    if (elapsedLabel.peek() !== "") setElapsedLabel("")
    return
  }
  if (recStartedMs === 0) {
    const st = readStateFile()
    if (st.startedMs === 0) return
    recStartedMs = st.startedMs
    setAudioMode(st.audio)
  }
  const next = formatElapsed((Date.now() - recStartedMs) / 1000)
  if (next !== elapsedLabel.peek()) setElapsedLabel(next)
}

function openVlc(filePath: string): void {
  if (!filePath) return
  try {
    Gio.Subprocess.new(
      ["vlc", "--play-and-exit", filePath],
      Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
  } catch (e) {
    print(`[cast] vlc open failed: ${e}`)
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

function reconcile(): void {
  const isRec = checkHyprRecordActive()
  const cur = phase.peek()
  const elapsed = nowSec() - phaseSince

  switch (cur) {
    case "starting":
      if (isRec) {
        enterPhase("recording")
      } else if (elapsed >= START_TIMEOUT_SEC) {
        enterPhase("failed", "start timeout — encoder never became active")
      }
      break

    case "recording":
      // Recorder gone without our stop (CLI stop, crash): fall back to armed.
      if (!isRec && elapsed >= 1.5) {
        enterPhase(target.peek() ? "target_set" : "idle")
      }
      break

    case "stopping":
      // Normal exit is the `hypr-record stop` callback in stopCastRecord().
      if (elapsed >= STOP_TIMEOUT_SEC) {
        enterPhase("failed", "stop timeout — encoder still running")
      }
      break

    case "failed":
      if (elapsed >= FAILED_HOLD_SEC) {
        enterPhase(target.peek() ? "target_set" : "idle")
      }
      break

    case "idle":
    case "target_set":
      if (isRec) enterPhase("recording")
      break
  }
  tickElapsed()
}

ensureReconcileLoop()

export const hasCastTarget = createComputed(() => target() !== null)

export const castChipVisible = createComputed(() => {
  const t = target()
  const p = phase()
  if (t !== null) return true
  return p === "starting" || p === "recording" || p === "stopping" || p === "failed"
})

export const castChipArmed = createComputed(() => phase() === "target_set")

export const castChipThinking = createComputed(() => {
  const p = phase()
  return p === "starting" || p === "stopping"
})

export const isRecording = createComputed(() => phase() === "recording")

export const isFailed = createComputed(() => phase() === "failed")

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
    case "monitor":
      return `Monitor: ${monitorLabel() || monitorOutput()}`
    case "panel": {
      const title = panelTitle()
      return title ? `Panel: ${title}` : "Panel"
    }
    case "area":
      return `Area (${areaGeom()})`
    default:
      return "No target"
  }
})

function audioLabel(mode: string): string {
  switch (mode) {
    case "both":
      return "audio: desktop + mic (if unmuted)"
    case "system":
      return "audio: desktop"
    case "mic":
      return "audio: mic"
    case "0":
      return "no audio"
    default:
      return "audio"
  }
}

export const castTip = createComputed(() => {
  const p = phase()
  const t = target()
  switch (p) {
    case "starting":
      return "Starting hypr-record…"
    case "recording": {
      const el = elapsedLabel()
      return `Recording${el ? ` ${el}` : "…"} · ${castTargetLabel()} · ${audioLabel(audioMode())}\nClick to stop, copy path & open VLC`
    }
    case "stopping":
      return "Finalizing… saving, copy path, open VLC"
    case "failed":
      return `Cast error: ${lastError() || "unknown"}`
    case "target_set":
      return `Armed: ${castTargetLabel()} · ${audioLabel("both")}\nClick to start · right-click to disarm`
    default:
      if (!t) return "No target — SystemMenu → Cast to select"
      return `Target: ${castTargetLabel()}`
  }
})

export function clearCastTarget(): void {
  cancelAreaDelay()
  const p = phase.peek()
  if (p === "recording" || p === "starting" || p === "stopping") return
  setMonitorOutput("")
  setMonitorLabel("")
  setPanelAddress("")
  setPanelTitle("")
  setAreaGeom("")
  setTargetState(null)
  enterPhase("idle")
}

export function armMonitor(output: string, label?: string): void {
  cancelAreaDelay()
  setPanelAddress("")
  setPanelTitle("")
  setAreaGeom("")
  setMonitorOutput(output)
  setMonitorLabel(label ?? output)
  setTargetState("monitor")
  const p = phase.peek()
  if (p === "recording" || p === "starting" || p === "stopping") return
  enterPhase("target_set")
}

export function armPanel(address: string, title: string): void {
  cancelAreaDelay()
  setMonitorOutput("")
  setMonitorLabel("")
  setAreaGeom("")
  setPanelAddress(address)
  setPanelTitle(title)
  setTargetState("panel")
  const p = phase.peek()
  if (p === "recording" || p === "starting" || p === "stopping") return
  enterPhase("target_set")
}

export function armArea(geom: string): void {
  cancelAreaDelay()
  setMonitorOutput("")
  setMonitorLabel("")
  setPanelAddress("")
  setPanelTitle("")
  setAreaGeom(geom)
  setTargetState("area")
  const p = phase.peek()
  if (p === "recording" || p === "starting" || p === "stopping") return
  enterPhase("target_set")
}

export function selectAreaWithDelay(): void {
  setCastPopupOpen(false)
  clearCastTarget()
  areaDelayTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, AREA_DELAY_MS, () => {
    areaDelayTimer = null
    try {
      const proc = Gio.Subprocess.new(
        ["slurp"],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
      )
      proc.communicate_utf8_async(null, null, (_proc, res) => {
        try {
          const [, stdout] = proc.communicate_utf8_finish(res)
          const geom = (stdout ?? "").trim()
          if (proc.get_successful() && geom) {
            armArea(geom)
          } else {
            clearCastTarget()
          }
        } catch {
          clearCastTarget()
        }
      })
    } catch {
      clearCastTarget()
    }
    return GLib.SOURCE_REMOVE
  })
}

export function setCastTarget(
  t: CastTarget,
  opts?: { output?: string; label?: string; address?: string; title?: string; geom?: string },
): void {
  if (!t) {
    clearCastTarget()
    return
  }
  if (t === "monitor" && opts?.output) {
    armMonitor(opts.output, opts.label)
  } else if (t === "panel" && opts?.address) {
    armPanel(opts.address, opts.title ?? "")
  } else if (t === "area" && opts?.geom) {
    armArea(opts.geom)
  }
}

export function fetchHyprlandMonitors(): HyprMonitorInfo[] {
  try {
    const proc = Gio.Subprocess.new(
      ["hyprctl", "monitors", "-j"],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, out] = proc.communicate_utf8(null, null)
    const raw = JSON.parse(out ?? "[]") as Array<{
      id: number
      name: string
      make?: string
      model?: string
      description?: string
      width: number
      height: number
      x: number
      y: number
      focused?: boolean
      disabled?: boolean
    }>
    return raw
      .filter((m) => !m.disabled)
      .sort((a, b) => (a.x - b.x) || (a.y - b.y))
      .map((m) => ({
        id: m.id,
        name: m.name,
        make: (m.make ?? "").trim(),
        model: (m.model ?? "").trim(),
        description: (m.description ?? "").trim(),
        width: m.width,
        height: m.height,
        x: m.x,
        y: m.y,
        focused: !!m.focused,
      }))
  } catch (e) {
    print(`[cast] fetchHyprlandMonitors error: ${e}`)
    return []
  }
}

export function fetchHyprlandPanels(): HyprWindowPanel[] {
  try {
    const monitors = fetchHyprlandMonitors()
    const monNameMap = new Map<number, string>()
    const monOrderMap = new Map<number, number>()
    monitors.forEach((m, idx) => {
      monNameMap.set(m.id, m.name)
      monOrderMap.set(m.id, idx)
    })

    const procC = Gio.Subprocess.new(
      ["hyprctl", "clients", "-j"],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, outC] = procC.communicate_utf8(null, null)
    const clients = JSON.parse(outC ?? "[]") as Array<{
      address: string
      title?: string
      initialTitle?: string
      class?: string
      initialClass?: string
      monitor: number
      workspace?: { id?: number; name?: string }
      at: [number, number]
      size: [number, number]
    }>

    const res: HyprWindowPanel[] = []
    for (const c of clients) {
      if (!c.address) continue
      const w = c.size?.[0] ?? 0
      const h = c.size?.[1] ?? 0
      if (w <= 0 || h <= 0) continue
      const title =
        (c.title ?? "").trim() ||
        (c.initialTitle ?? "").trim() ||
        (c.class ?? "").trim() ||
        (c.initialClass ?? "").trim() ||
        c.address
      const monName = monNameMap.get(c.monitor) ?? `Monitor ${c.monitor}`
      const wsName = (c.workspace?.name ?? String(c.workspace?.id ?? "")).trim()
      const geom = `${c.at[0]},${c.at[1]} ${w}x${h}`
      res.push({
        address: c.address,
        title,
        class: (c.class ?? "").trim(),
        monitor: c.monitor,
        monitorName: monName,
        workspaceName: wsName,
        at: c.at,
        size: c.size,
        geom,
      })
    }

    res.sort((a, b) => {
      const oa = monOrderMap.get(a.monitor) ?? 99
      const ob = monOrderMap.get(b.monitor) ?? 99
      if (oa !== ob) return oa - ob
      return a.workspaceName.localeCompare(b.workspaceName) || a.title.localeCompare(b.title)
    })

    return res
  } catch (e) {
    print(`[cast] fetchHyprlandPanels error: ${e}`)
    return []
  }
}

export function resolvePanelGeom(address: string): string | null {
  if (!address) return null
  const want = address.trim().toLowerCase()
  const panels = fetchHyprlandPanels()
  const found = panels.find((p) => p.address.trim().toLowerCase() === want)
  return found ? found.geom : null
}

export function launchRecord(args: string[]): void {
  setCastPopupOpen(false)
  // Yellow until the encoder pid is really alive (reconcile → "recording").
  enterPhase("starting")
  try {
    Gio.Subprocess.new(
      [HYPR_RECORD, ...args],
      Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
  } catch (e) {
    enterPhase("failed", String(e))
  }
}

export function startCastRecord(): void {
  const p = phase.peek()
  if (p === "starting" || p === "recording" || p === "stopping") return

  const t = target.peek()
  if (!t) return

  if (t === "monitor") {
    const out = monitorOutput.peek()
    if (!out) {
      clearCastTarget()
      return
    }
    launchRecord(["monitor", out])
    return
  }

  if (t === "panel") {
    const addr = panelAddress.peek()
    const geom = resolvePanelGeom(addr)
    if (!geom) {
      // If the panel no longer exists when pressing REC, exit cleanly
      clearCastTarget()
      return
    }
    launchRecord(["client", addr])
    return
  }

  if (t === "area") {
    const g = areaGeom.peek()
    if (!g) {
      clearCastTarget()
      return
    }
    launchRecord(["geom", g])
    return
  }
}

export function stopCastRecord(): void {
  const p = phase.peek()
  if (p !== "recording" && p !== "starting") return

  const path = readStateFilePath()
  enterPhase("stopping")
  try {
    // `hypr-record stop` returns only after the mp4 is finalized and verified
    // playable (and copies the path), so VLC never opens a half-written file.
    const proc = Gio.Subprocess.new(
      [HYPR_RECORD, "stop"],
      Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    proc.wait_async(null, (_p, res) => {
      let ok = false
      try {
        proc.wait_finish(res)
        ok = proc.get_successful()
      } catch {}
      if (phase.peek() !== "stopping") return
      if (ok && path && GLib.file_test(path, GLib.FileTest.EXISTS)) {
        openVlc(path)
        enterPhase(target.peek() ? "target_set" : "idle")
      } else {
        enterPhase("failed", "recording not saved — see hypr-record.log")
      }
    })
  } catch (e) {
    enterPhase("failed", String(e))
  }
}

/** Right-click on the chip: drop the armed target (no-op while recording). */
export function disarmCast(): void {
  if (phase.peek() === "target_set") clearCastTarget()
}

export function toggleCastRecord(): void {
  const p = phase.peek()
  if (p === "recording") {
    stopCastRecord()
    return
  }
  if (p === "starting" || p === "stopping") {
    return
  }
  startCastRecord()
}
