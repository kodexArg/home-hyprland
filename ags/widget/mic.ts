/**
 * Default capture mute & voice activity monitor.
 *
 * SSOT = Pulse/PipeWire via pactl & parec audio stream.
 * Prefer Brio when present (host habit); else @DEFAULT_SOURCE@.
 */
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"

const TICK_MS = 500
const REPROBE_MS = 100
const ACTIVITY_BIN =
  GLib.find_program_in_path("kdx-mic-activity") ??
  `${GLib.get_home_dir()}/.local/bin/kdx-mic-activity`

export type MicTone =
  | "muted"      // Deshabilitado: oscuro como celda de VRAM
  | "unmuted"    // Habilitado en reposo: gris del cerebro (#9a9a9a, 0.55)
  | "voice"      // Escuchando sonido: verde claro (#7bc96f)
  | "busy"       // Naranja (#ff8c42)
  | "recording"  // Rojo (#e53935)
  | "error"      // Rojo (#c45c4a)

const [micMuted, setMicMuted] = createState(true)
const [micName, setMicName] = createState("Microphone")
const [micHearing, setMicHearing] = createState(false)

let tickSource: number | null = null
let started = false
let subscribeProc: Gio.Subprocess | null = null
let activityProc: Gio.Subprocess | null = null

function runSync(argv: string[]): string {
  try {
    const proc = Gio.Subprocess.new(
      argv,
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, stdout] = proc.communicate_utf8(null, null)
    return (stdout ?? "").trim()
  } catch {
    return ""
  }
}

/** Resolve capture source name: Brio if listed, else Pulse default. */
export function resolveSourceName(): string {
  const short = runSync(["pactl", "list", "short", "sources"])
  for (const line of short.split("\n")) {
    // id\tname\t...
    const parts = line.split("\t")
    if (parts.length < 2) continue
    const name = parts[1]
    if (!name || name.endsWith(".monitor")) continue
    if (/brio/i.test(name)) return name
  }
  // pactl default — works even when wpctl default id is -1
  return "@DEFAULT_SOURCE@"
}

export function probeMicMuted(source?: string): boolean {
  const src = source ?? resolveSourceName()
  const out = runSync(["pactl", "get-source-mute", src])
  // "Mute: yes" | "Mute: no"
  return /Mute:\s*yes/i.test(out)
}

export function probeMicDescription(source?: string): string {
  const src = source ?? resolveSourceName()
  if (src === "@DEFAULT_SOURCE@") {
    const info = runSync(["pactl", "info"])
    const m = info.match(/^Default Source:\s*(.+)$/m)
    const real = m?.[1]?.trim()
    if (real) return probeMicDescription(real)
    return "Microphone"
  }
  const block = runSync(["pactl", "list", "sources"])
  // Find the source block by Name:
  const chunks = block.split(/Source #\d+\n/)
  for (const c of chunks) {
    if (!c.includes(`Name: ${src}`)) continue
    const dm = c.match(/Description:\s*(.+)/)
    if (dm) return dm[1].trim()
  }
  return src
}

function snap(): void {
  const src = resolveSourceName()
  const muted = probeMicMuted(src)
  setMicMuted(muted)
  setMicName(probeMicDescription(src))
  if (muted && micHearing.peek()) {
    setMicHearing(false)
  }
}

function ensureTick(): void {
  if (tickSource !== null) return
  tickSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
    snap()
    return GLib.SOURCE_CONTINUE
  })
}

function startSubscribe(): void {
  if (subscribeProc !== null) return
  try {
    subscribeProc = Gio.Subprocess.new(
      ["pactl", "subscribe"],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const pipe = subscribeProc.get_stdout_pipe()
    if (!pipe) return
    const dis = Gio.DataInputStream.new(pipe)
    const readNext = () => {
      dis.read_line_async(GLib.PRIORITY_DEFAULT, null, (_src, res) => {
        try {
          const [line] = dis.read_line_finish_utf8(res)
          if (line !== null) {
            if (line.includes("source") || line.includes("server")) {
              snap()
            }
            readNext()
          } else {
            subscribeProc = null
          }
        } catch {
          subscribeProc = null
        }
      })
    }
    readNext()
  } catch (e) {
    printerr(`mic: pactl subscribe failed: ${e}`)
  }
}

function startActivityMonitor(): void {
  if (activityProc !== null) return
  try {
    activityProc = Gio.Subprocess.new(
      [ACTIVITY_BIN],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const pipe = activityProc.get_stdout_pipe()
    if (!pipe) return
    const dis = Gio.DataInputStream.new(pipe)
    const readNext = () => {
      dis.read_line_async(GLib.PRIORITY_DEFAULT, null, (_src, res) => {
        try {
          const [line] = dis.read_line_finish_utf8(res)
          if (line !== null) {
            const trimmed = line.trim()
            if (!micMuted.peek()) {
              setMicHearing(trimmed === "1")
            } else {
              setMicHearing(false)
            }
            readNext()
          } else {
            activityProc = null
            // Respawn after 1 second if killed
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
              startActivityMonitor()
              return GLib.SOURCE_REMOVE
            })
          }
        } catch {
          activityProc = null
        }
      })
    }
    readNext()
  } catch (e) {
    printerr(`mic: activity monitor failed: ${e}`)
  }
}

export function startMicWatch(): void {
  if (started) return
  started = true
  snap()
  ensureTick()
  startSubscribe()
  startActivityMonitor()
}

/** Force re-read (menu open / after external mute). */
export function refreshMic(): void {
  snap()
  ensureTick()
}

export function toggleMicMute(): void {
  const src = resolveSourceName()
  try {
    Gio.Subprocess.new(
      ["pactl", "set-source-mute", src, "toggle"],
      Gio.SubprocessFlags.STDERR_SILENCE,
    )
  } catch (e) {
    printerr(`mic: pactl set-source-mute failed: ${e}`)
    return
  }
  // Optimistic flip, then re-probe after PipeWire applies
  const next = !micMuted.peek()
  setMicMuted(next)
  if (next) setMicHearing(false)
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, REPROBE_MS, () => {
    snap()
    return GLib.SOURCE_REMOVE
  })
}

export { micMuted, micName, micHearing }
