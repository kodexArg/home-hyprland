/**
 * Memory track FSM — three rows (VRAM · RAM · Swap), 5 cells each.
 *
 * SSOT:
 *   VRAM  nvidia-smi memory.used / memory.total  (2060 OC ≈ 8 GiB)
 *   RAM   MemTotal − MemAvailable                (/proc/meminfo)
 *   Swap  SwapTotal − SwapFree                   (/proc/meminfo)
 *         Zswap / Zswapped are tooltip-only (compressed pool vs
 *         uncompressed pages sitting in zswap; still counted in SwapUsed)
 *
 * Fill is warn-ahead, not linear 0–100%:
 *   used/total < floor → 0 cells (idle compositor / residual swap stay empty)
 *   used/total ≥ redAt → 5 cells (red) with headroom still left
 *   between: 1..4
 * Color (per lit cell index):
 *   0–1 green · 2 yellow · 3 orange · 4 red
 *
 * Contract: caffeine template (external SSOT · derived UI · tick reconcile · IPC).
 */
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"

const MEMINFO = "/proc/meminfo"
const TICK_MS = 2000
const GIB = 1024 * 1024 * 1024

/** Cells per row (5×3 grid). */
export const CELLS_PER_ROW = 5

/** Fallback when nvidia-smi total is missing (RTX 2060 OC). */
const VRAM_TOTAL_FALLBACK_GIB = 8

/** used/total floor → 0 cells; redAt → 5th (red) cell. Both < 1 so red is a warning. */
export type WarnScale = { floor: number; redAt: number }

/** VRAM 8 GiB: red at 70% (~5.6 GiB, 2.4 left). */
export const SCALE_VRAM: WarnScale = { floor: 0, redAt: 0.7 }

/** RAM ~15 GiB: 4 GB (~27%) lights 2 green cells; red at 88% (~13.2 used, ~1.8 avail before OOM). */
export const SCALE_RAM: WarnScale = { floor: 0, redAt: 0.88 }

/** Swap 8 GiB: 0 when empty; red at 35% (~2.8 GiB) — paging already hurts. */
export const SCALE_SWAP: WarnScale = { floor: 0, redAt: 0.35 }

const [vramUsedGiB, setVramUsedGiB] = createState(0)
const [vramTotalGiB, setVramTotalGiB] = createState(VRAM_TOTAL_FALLBACK_GIB)
const [vramCells, setVramCells] = createState(0)

const [ramUsedGiB, setRamUsedGiB] = createState(0)
const [ramAvailGiB, setRamAvailGiB] = createState(0)
const [ramTotalGiB, setRamTotalGiB] = createState(0)
const [ramCells, setRamCells] = createState(0)

const [swapUsedGiB, setSwapUsedGiB] = createState(0)
const [swapTotalGiB, setSwapTotalGiB] = createState(0)
const [swapCells, setSwapCells] = createState(0)
const [zswapPoolGiB, setZswapPoolGiB] = createState(0)
const [zswappedGiB, setZswappedGiB] = createState(0)

const [lastError, setLastError] = createState("")
const [ok, setOk] = createState(true)

let tickSource: number | null = null
let started = false
let since = 0

function nowSec(): number {
  return GLib.get_monotonic_time() / 1_000_000
}

/**
 * How many of 5 cells are lit for used/total on a warn-ahead scale.
 * Tiny usage (below floor) is 0 — never light green from ceil(epsilon).
 */
export function cellsFromRatio(
  used: number,
  total: number,
  scale: WarnScale,
): number {
  if (!(total > 0) || !(used > 0) || !Number.isFinite(used) || !Number.isFinite(total))
    return 0
  const r = used / total
  if (r < scale.floor) return 0
  if (r >= scale.redAt) return CELLS_PER_ROW
  const span = scale.redAt - scale.floor
  if (!(span > 0)) return CELLS_PER_ROW
  const t = (r - scale.floor) / span // (0, 1)
  return 1 + Math.floor(t * (CELLS_PER_ROW - 1))
}

export type MemSnap = {
  ramTotalB: number
  ramAvailB: number
  ramUsedB: number
  swapTotalB: number
  swapUsedB: number
  /** Compressed zswap pool in RAM (0 if unused / old kernel). */
  zswapPoolB: number
  /** Uncompressed size of pages stored in zswap. */
  zswappedB: number
}

export function readMeminfo(): MemSnap | null {
  try {
    const [okRead, bytes] = Gio.File.new_for_path(MEMINFO).load_contents(null)
    if (!okRead) return null
    const text = new TextDecoder().decode(bytes)
    let memTotalKb = 0
    let memAvailKb = 0
    let swapTotalKb = 0
    let swapFreeKb = 0
    let zswapKb = 0
    let zswappedKb = 0
    for (const line of text.split("\n")) {
      if (line.startsWith("MemTotal:")) memTotalKb = parseInt(line.split(/\s+/)[1], 10)
      else if (line.startsWith("MemAvailable:"))
        memAvailKb = parseInt(line.split(/\s+/)[1], 10)
      else if (line.startsWith("SwapTotal:"))
        swapTotalKb = parseInt(line.split(/\s+/)[1], 10)
      else if (line.startsWith("SwapFree:"))
        swapFreeKb = parseInt(line.split(/\s+/)[1], 10)
      else if (line.startsWith("Zswap:")) zswapKb = parseInt(line.split(/\s+/)[1], 10)
      else if (line.startsWith("Zswapped:"))
        zswappedKb = parseInt(line.split(/\s+/)[1], 10)
    }
    if (!Number.isFinite(memTotalKb) || memTotalKb <= 0) return null
    if (!Number.isFinite(memAvailKb) || memAvailKb < 0) return null
    if (!Number.isFinite(swapTotalKb) || swapTotalKb < 0) return null
    if (!Number.isFinite(swapFreeKb) || swapFreeKb < 0) return null
    const ramTotalB = memTotalKb * 1024
    const ramAvailB = memAvailKb * 1024
    const swapTotalB = swapTotalKb * 1024
    const swapFreeB = swapFreeKb * 1024
    return {
      ramTotalB,
      ramAvailB,
      ramUsedB: Math.max(0, ramTotalB - ramAvailB),
      swapTotalB,
      swapUsedB: Math.max(0, swapTotalB - swapFreeB),
      zswapPoolB: Number.isFinite(zswapKb) && zswapKb > 0 ? zswapKb * 1024 : 0,
      zswappedB: Number.isFinite(zswappedKb) && zswappedKb > 0 ? zswappedKb * 1024 : 0,
    }
  } catch {
    return null
  }
}

/** VRAM used/total in GiB from nvidia-smi. null on failure. */
export function readVramGiB(): { used: number; total: number } | null {
  try {
    const proc = Gio.Subprocess.new(
      [
        "nvidia-smi",
        "--query-gpu=memory.used,memory.total",
        "--format=csv,noheader,nounits",
      ],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [okProc, stdout] = proc.communicate_utf8(null, null)
    if (!okProc) return null
    const line = (stdout ?? "").trim().split("\n")[0] ?? ""
    const parts = line.split(",").map((s) => parseInt(s.trim(), 10))
    const usedMib = parts[0]
    const totalMib = parts[1]
    if (!Number.isFinite(usedMib) || usedMib < 0) return null
    const total =
      Number.isFinite(totalMib) && totalMib > 0
        ? totalMib / 1024
        : VRAM_TOTAL_FALLBACK_GIB
    return { used: usedMib / 1024, total }
  } catch {
    return null
  }
}

function reconcile(): void {
  const mem = readMeminfo()
  if (!mem) {
    setLastError("meminfo read failed")
    setOk(false)
    return
  }

  const ramU = mem.ramUsedB / GIB
  const ramA = mem.ramAvailB / GIB
  const ramT = mem.ramTotalB / GIB
  const swapU = mem.swapUsedB / GIB
  const swapT = mem.swapTotalB / GIB

  setRamUsedGiB(ramU)
  setRamAvailGiB(ramA)
  setRamTotalGiB(ramT)
  setRamCells(cellsFromRatio(ramU, ramT, SCALE_RAM))

  setSwapUsedGiB(swapU)
  setSwapTotalGiB(swapT)
  setSwapCells(cellsFromRatio(swapU, swapT, SCALE_SWAP))
  setZswapPoolGiB(mem.zswapPoolB / GIB)
  setZswappedGiB(mem.zswappedB / GIB)

  const vram = readVramGiB()
  if (vram) {
    setVramUsedGiB(vram.used)
    setVramTotalGiB(vram.total)
    setVramCells(cellsFromRatio(vram.used, vram.total, SCALE_VRAM))
    setLastError("")
    setOk(true)
  } else {
    // Keep last VRAM numbers; still show RAM/Swap. Mark soft error.
    setLastError("nvidia-smi vram failed")
    setOk(true) // mem path ok
    setVramCells(
      cellsFromRatio(
        vramUsedGiB(),
        vramTotalGiB() || VRAM_TOTAL_FALLBACK_GIB,
        SCALE_VRAM,
      ),
    )
  }
}

function ensureTick(): void {
  if (tickSource !== null) return
  tickSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
    reconcile()
    return GLib.SOURCE_CONTINUE
  })
}

export function startRamTrack(): void {
  if (started) return
  started = true
  since = nowSec()
  reconcile()
  ensureTick()
}

export function getRamStatus(): string {
  const age = (nowSec() - since).toFixed(1)
  const err = lastError()
  const errPart = err ? ` err=${err}` : ""
  return (
    `vram=${vramUsedGiB().toFixed(2)}/${vramTotalGiB().toFixed(2)} cells=${vramCells()} ` +
    `ram=${ramUsedGiB().toFixed(2)}/${ramTotalGiB().toFixed(2)} avail=${ramAvailGiB().toFixed(2)} cells=${ramCells()} ` +
    `swap=${swapUsedGiB().toFixed(2)}/${swapTotalGiB().toFixed(2)} cells=${swapCells()} ` +
    `zswap=${zswapPoolGiB().toFixed(2)} zswapped=${zswappedGiB().toFixed(2)} ` +
    `ok=${ok()}${errPart} age_s=${age}`
  )
}

/** Reactive accessors for the widget. */
export const trackVramUsedGiB = vramUsedGiB
export const trackVramTotalGiB = vramTotalGiB
export const trackVramCells = vramCells
export const trackRamUsedGiB = ramUsedGiB
export const trackRamAvailGiB = ramAvailGiB
export const trackRamTotalGiB = ramTotalGiB
export const trackRamCells = ramCells
export const trackSwapUsedGiB = swapUsedGiB
export const trackSwapTotalGiB = swapTotalGiB
export const trackSwapCells = swapCells
export const trackZswapPoolGiB = zswapPoolGiB
export const trackZswappedGiB = zswappedGiB
export const trackOk = ok
