/**
 * Default capture mute — SSOT = Pulse/PipeWire via pactl.
 *
 * Why not AstalWp defaultMicrophone alone:
 * WirePlumber often leaves default.audio.source unset (wpctl @DEFAULT_AUDIO_SOURCE@
 * → id -1). AstalWp then exposes a stub endpoint (id=0, mute stuck true, name null)
 * and set_mute is a no-op. pactl still has a working Default Source.
 *
 * Prefer Brio when present (host habit); else @DEFAULT_SOURCE@.
 */
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"

const TICK_MS = 2000
const REPROBE_MS = 100

const [micMuted, setMicMuted] = createState(true)
const [micName, setMicName] = createState("Microphone")

let tickSource: number | null = null
let started = false

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
  setMicMuted(probeMicMuted(src))
  setMicName(probeMicDescription(src))
}

function ensureTick(): void {
  if (tickSource !== null) return
  tickSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
    snap()
    return GLib.SOURCE_CONTINUE
  })
}

export function startMicWatch(): void {
  if (started) return
  started = true
  snap()
  ensureTick()
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
  setMicMuted(!micMuted.peek())
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, REPROBE_MS, () => {
    snap()
    return GLib.SOURCE_REMOVE
  })
}

export { micMuted, micName }
