import GLib from "gi://GLib"
import { createState, createComputed } from "ags"
import { exec } from "ags/process"

/** Super+B cycles: always → temp → hidden → always */
export type BarMode = "always" | "temp" | "hidden"

const ORDER: BarMode[] = ["always", "temp", "hidden"]
/** How long "temp" stays on screen after leave / reveal */
const TEMP_MS = 5000
/** Portrait ASUS — same as app.ts bar filter */
const BAR_MONITOR = "HDMI-A-2"
/** Logical pixels from monitor top that count as "tope" */
const EDGE_PX = 12
/** Cursor poll while temp mode is active */
const POLL_MS = 80

const [mode, setMode] = createState<BarMode>("temp")
const [tempShown, setTempShown] = createState(true)

let tempSource: number | null = null
let pollSource: number | null = null
let overEdge = false
let overBar = false

function clearTempTimer() {
  if (tempSource !== null) {
    GLib.source_remove(tempSource)
    tempSource = null
  }
}

/** Show bar and schedule auto-hide (unless pointer is holding it). */
function armHideTimer() {
  clearTempTimer()
  if (overEdge || overBar) return
  tempSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TEMP_MS, () => {
    // Stale hover must not block a later re-open
    overBar = false
    overEdge = false
    setTempShown(false)
    tempSource = null
    return GLib.SOURCE_REMOVE
  })
}

function showTemp() {
  setTempShown(true)
  armHideTimer()
}

function syncHover() {
  if (mode.peek() !== "temp") return
  if (overEdge || overBar) {
    clearTempTimer()
    setTempShown(true)
  } else {
    // was holding; restart hide countdown
    if (tempShown.peek()) armHideTimer()
  }
}

/** True if cursor is on the top edge of the bar monitor (layout coords). */
function cursorOnBarMonitorTop(): boolean {
  try {
    const pos = exec("hyprctl cursorpos").trim() // "x, y"
    const parts = pos.split(",")
    if (parts.length < 2) return false
    const cx = Number.parseInt(parts[0]!.trim(), 10)
    const cy = Number.parseInt(parts[1]!.trim(), 10)
    if (Number.isNaN(cx) || Number.isNaN(cy)) return false

    const mons = JSON.parse(exec(["hyprctl", "monitors", "-j"])) as Array<{
      name: string
      x: number
      y: number
      width: number
      height: number
      transform: number
    }>
    const mon = mons.find((m) => m.name === BAR_MONITOR)
    if (!mon) return false

    // transform 1/3 swap layout width/height
    const rot = mon.transform === 1 || mon.transform === 3
    const lw = rot ? mon.height : mon.width
    const lh = rot ? mon.width : mon.height
    const rx = cx - mon.x
    const ry = cy - mon.y
    return rx >= 0 && rx < lw && ry >= 0 && ry < EDGE_PX && ry < lh
  } catch {
    return false
  }
}

function pollEdge() {
  if (mode.peek() !== "temp") return GLib.SOURCE_CONTINUE

  const onTop = cursorOnBarMonitorTop()
  if (onTop !== overEdge) {
    overEdge = onTop
    syncHover()
  } else if (onTop && !tempShown.peek()) {
    // edge held but bar still hidden (e.g. race after timer) → force show
    setTempShown(true)
    clearTempTimer()
  }
  return GLib.SOURCE_CONTINUE
}

function startEdgePoll() {
  if (pollSource !== null) return
  pollSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, pollEdge)
}

function stopEdgePoll() {
  if (pollSource !== null) {
    GLib.source_remove(pollSource)
    pollSource = null
  }
  overEdge = false
}

/** Bar chrome: pointer entered/left the bar itself. */
export function setOverBar(v: boolean) {
  overBar = v
  syncHover()
}

/**
 * Peek the bar while in temp mode (auto-hide).
 * Used by Super_L/R (non-consuming) and any external `ags request bar-peek`.
 */
export function peekTemp(): string {
  if (mode.peek() !== "temp") return getBarMode()
  showTemp()
  return "temp-peek"
}

export function setBarMode(next: BarMode) {
  clearTempTimer()
  overEdge = false
  overBar = false
  setMode(next)
  if (next === "temp") {
    startEdgePoll()
    showTemp()
  } else {
    stopEdgePoll()
    if (next === "always") setTempShown(true)
    else setTempShown(false)
  }
}

export function cycleBarMode(): BarMode {
  const i = ORDER.indexOf(mode.peek())
  const next = ORDER[(i + 1) % ORDER.length]!
  setBarMode(next)
  return next
}

export function getBarMode(): BarMode {
  return mode.peek()
}

/** Reactive mode for CSS class: Bar mode-always | mode-temp | mode-hidden */
export const barModeClass = createComputed(() => `Bar mode-${mode()}`)

/** Reactive visibility from mode + temp timer / hover / Super peek */
export const barVisible = createComputed(() => {
  const m = mode()
  if (m === "always") return true
  if (m === "hidden") return false
  return tempShown()
})

// First paint in temp
startEdgePoll()
showTemp()
