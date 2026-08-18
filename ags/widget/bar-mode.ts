import GLib from "gi://GLib"
import { createState, createComputed } from "ags"
import { exec } from "ags/process"

export type BarMode = "always" | "temp" | "hidden"

const ORDER: BarMode[] = ["always", "temp", "hidden"]
const TEMP_MS = 2500
const BAR_MODEL = "VA27EHF"
const EDGE_PX = 12
const POLL_MS = 80
const MONITOR_GEOMETRY_TTL_MS = 2000

const [mode, setMode] = createState<BarMode>("always")
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

function armHideTimer() {
  clearTempTimer()
  if (overEdge || overBar) return
  tempSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TEMP_MS, () => {
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
    if (tempShown.peek()) armHideTimer()
  }
}

type MonitorGeometry = {
  x: number
  y: number
  width: number
  height: number
}

let cachedGeometry: MonitorGeometry | null = null
let cachedGeometryAt = 0

function nowMs(): number {
  return GLib.get_monotonic_time() / 1000
}

function readMonitorGeometry(): MonitorGeometry | null {
  try {
    const monitors = JSON.parse(exec(["hyprctl", "monitors", "-j"])) as Array<{
      name: string
      model?: string
      description?: string
      x: number
      y: number
      width: number
      height: number
      transform: number
      scale: number
    }>

    const monitor = monitors.find((m) => {
      const model = (m.model || "").toUpperCase()
      const desc = (m.description || "").toUpperCase()
      return model.includes(BAR_MODEL) || desc.includes(BAR_MODEL)
    })
    if (!monitor) return null

    const scale = monitor.scale > 0 ? monitor.scale : 1
    const logicalWidth = monitor.width / scale
    const logicalHeight = monitor.height / scale
    const rotated = monitor.transform === 1 || monitor.transform === 3

    return {
      x: monitor.x,
      y: monitor.y,
      width: rotated ? logicalHeight : logicalWidth,
      height: rotated ? logicalWidth : logicalHeight,
    }
  } catch {
    return null
  }
}

function monitorGeometry(): MonitorGeometry | null {
  const expired = nowMs() - cachedGeometryAt > MONITOR_GEOMETRY_TTL_MS

  if (cachedGeometry === null || expired) {
    const fresh = readMonitorGeometry()

    if (fresh !== null) {
      cachedGeometry = fresh
      cachedGeometryAt = nowMs()
    }
  }

  return cachedGeometry
}

function forgetMonitorGeometry(): void {
  cachedGeometry = null
  cachedGeometryAt = 0
}

function hasUsableArea(geometry: MonitorGeometry): boolean {
  return geometry.width > 0 && geometry.height > 0
}

function readCursorPosition(): { x: number; y: number } | null {
  try {
    const [rawX, rawY] = exec("hyprctl cursorpos").trim().split(",")
    if (rawX === undefined || rawY === undefined) return null

    const x = Number.parseInt(rawX.trim(), 10)
    const y = Number.parseInt(rawY.trim(), 10)
    if (Number.isNaN(x) || Number.isNaN(y)) return null

    return { x, y }
  } catch {
    return null
  }
}

function cursorOnBarMonitorTop(): boolean {
  const geometry = monitorGeometry()
  if (geometry === null || !hasUsableArea(geometry)) return false

  const cursor = readCursorPosition()
  if (cursor === null) return false

  const withinMonitor =
    cursor.x >= geometry.x &&
    cursor.x < geometry.x + geometry.width &&
    cursor.y >= geometry.y &&
    cursor.y < geometry.y + geometry.height

  return withinMonitor && cursor.y - geometry.y < EDGE_PX
}

function pollEdge() {
  if (mode.peek() !== "temp") return GLib.SOURCE_CONTINUE

  const onTop = cursorOnBarMonitorTop()
  if (onTop !== overEdge) {
    overEdge = onTop
    syncHover()
  } else if (onTop && !tempShown.peek()) {
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

export function setOverBar(v: boolean) {
  overBar = v
  syncHover()
}

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
    forgetMonitorGeometry()
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

export const barModeClass = createComputed(() => `Bar mode-${mode()}`)

export const barVisible = createComputed(() => {
  const m = mode()
  if (m === "always") return true
  if (m === "hidden") return false
  return tempShown()
})
