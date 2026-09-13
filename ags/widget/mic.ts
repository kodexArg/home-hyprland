import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"

const TICK_MS = 15000
const REPROBE_MS = 100
const PACTL_TIMEOUT_SEC = "1"
const ACTIVITY_BIN =
  GLib.find_program_in_path("kdx-mic-activity") ??
  `${GLib.get_home_dir()}/.local/bin/kdx-mic-activity`

export type MicTone =
  | "muted"
  | "unmuted"
  | "voice"
  | "busy"
  | "recording"
  | "error"

const [micMuted, setMicMuted] = createState(true)
const [micName, setMicName] = createState("Microphone")
const [micHearing, setMicHearing] = createState(false)

let tickSource: number | null = null
let started = false
let subscribeProc: Gio.Subprocess | null = null
let activityProc: Gio.Subprocess | null = null
let activityBackoffMs = 1000
let cachedSource = ""
let cachedDescription = "Microphone"

function runSync(argv: string[]): string {
  try {
    const proc = Gio.Subprocess.new(
      ["timeout", PACTL_TIMEOUT_SEC, ...argv],
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    const [, stdout] = proc.communicate_utf8(null, null)
    return (stdout ?? "").trim()
  } catch {
    return ""
  }
}

export interface MicSource {
  name: string
  description: string
  /** Short human title for the menu row. */
  title: string
  /** Secondary line: bus · rate · channels · mute. */
  detail: string
  kind: "easyeffects" | "usb" | "bluetooth" | "analog" | "other"
  isDefault: boolean
  isMuted: boolean
  isEasyEffects: boolean
}

export interface EasyEffectsInfo {
  /** Binary or PipeWire source present. */
  available: boolean
  sourceName: string | null
  preset: string | null
  plugins: string[]
  inputDevice: string | null
  /** One human line for the menu. */
  summary: string
}

export function resolveSourceName(): string {
  const info = runSync(["pactl", "info"])
  const m = info.match(/^Default Source:\s*(.+)$/m)
  const real = m?.[1]?.trim()
  if (real && !real.endsWith(".monitor")) return real
  return "@DEFAULT_SOURCE@"
}

function kindOfSource(name: string, chunk: string): MicSource["kind"] {
  if (name === "easyeffects_source" || /easyeffects/i.test(name)) return "easyeffects"
  if (/bluetooth|bluez/i.test(name) || /bluetooth|bluez/i.test(chunk)) return "bluetooth"
  if (/device\.bus = "usb"/i.test(chunk) || /\.usb-/i.test(name)) return "usb"
  if (/analog|pci-/i.test(name)) return "analog"
  return "other"
}

function titleOfSource(kind: MicSource["kind"], description: string, name: string): string {
  if (kind === "easyeffects") return "Easy Effects"
  const d = description.trim()
  if (d && d !== name) return d.replace(/\s+Mono$/i, "").trim() || d
  return name
}

function detailOfSource(chunk: string, kind: MicSource["kind"], isMuted: boolean): string {
  const bits: string[] = []
  if (kind === "usb") bits.push("USB")
  else if (kind === "bluetooth") bits.push("Bluetooth")
  else if (kind === "easyeffects") bits.push("efectos")
  else if (kind === "analog") bits.push("analógico")
  const spec = chunk.match(/Sample Specification:\s*(\S+)\s+(\d+)ch\s+(\d+)Hz/i)
  if (spec) {
    const ch = Number(spec[2])
    bits.push(ch <= 1 ? "mono" : `${ch} ch`)
    bits.push(`${Math.round(Number(spec[3]) / 1000)} kHz`)
  }
  const vol = chunk.match(/Volume:[^\n]*?(\d+)%/)
  if (vol) bits.push(`${vol[1]}%`)
  bits.push(isMuted ? "silenciado" : "activo")
  return bits.join(" · ")
}

/** Portable EE probe: missing binary + missing source → quick empty. Prefer local rc over CLI. */
export function probeEasyEffects(): EasyEffectsInfo {
  const empty: EasyEffectsInfo = {
    available: false,
    sourceName: null,
    preset: null,
    plugins: [],
    inputDevice: null,
    summary: "",
  }
  const bin = GLib.find_program_in_path("easyeffects")
  const listOut = runSync(["pactl", "list", "short", "sources"])
  const hasSource = /(?:^|\n)\d+\s+easyeffects_source\b/.test(listOut)
  if (!bin && !hasSource) return empty

  const sourceName = hasSource ? "easyeffects_source" : null
  let preset: string | null = null
  let plugins: string[] = []
  let inputDevice: string | null = null

  const rc = `${GLib.get_home_dir()}/.config/easyeffects/db/easyeffectsrc`
  try {
    const [, bytes] = GLib.file_get_contents(rc)
    if (bytes) {
      const text = new TextDecoder().decode(bytes)
      const pm = text.match(/^lastLoadedInputPreset=(.+)$/m)
      if (pm) preset = pm[1].trim() || null
      const plug = text.match(/^plugins=(.+)$/m)
      if (plug) {
        plugins = plug[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => s.replace(/#\d+$/, ""))
      }
      const ind = text.match(/^inputDevice=(.+)$/m)
      if (ind) inputDevice = ind[1].trim() || null
    }
  } catch {}

  if (!preset && bin) {
    const cli = runSync(["easyeffects", "-a", "input"])
    if (cli && !/error|usage/i.test(cli)) preset = cli.split("\n")[0].trim() || null
  }

  const pluginLabel = plugins.length
    ? plugins.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" + ")
    : "sin plugins listados"
  const presetLabel = preset || "preset por defecto"
  const srcHint = inputDevice
    ? inputDevice.replace(/^alsa_input\./, "").replace(/_/g, " ").slice(0, 42)
    : null
  const summary = srcHint
    ? `Preset «${presetLabel}» · ${pluginLabel} · entra desde ${srcHint}`
    : `Preset «${presetLabel}» · ${pluginLabel}`

  return {
    available: true,
    sourceName,
    preset,
    plugins,
    inputDevice,
    summary,
  }
}

export function listMicrophoneSources(): MicSource[] {
  const info = runSync(["pactl", "info"])
  const defMatch = info.match(/^Default Source:\s*(.+)$/m)
  const defaultSource = defMatch?.[1]?.trim() ?? ""

  const out = runSync(["pactl", "list", "sources"])
  const sources: MicSource[] = []
  const chunks = out.split(/Source #\d+\n/)
  for (const c of chunks) {
    if (!c.trim()) continue
    const nameMatch = c.match(/Name:\s*(.+)/)
    const descMatch = c.match(/Description:\s*(.+)/)
    const muteMatch = c.match(/Mute:\s*(yes|no)/i)
    if (nameMatch) {
      const name = nameMatch[1].trim()
      if (name.endsWith(".monitor")) continue
      const description = descMatch ? descMatch[1].trim() : name
      const isMuted = muteMatch ? /yes/i.test(muteMatch[1]) : false
      const isDefault = name === defaultSource
      const kind = kindOfSource(name, c)
      const isEasyEffects = kind === "easyeffects"
      sources.push({
        name,
        description,
        title: titleOfSource(kind, description, name),
        detail: detailOfSource(c, kind, isMuted),
        kind,
        isDefault,
        isMuted,
        isEasyEffects,
      })
    }
  }

  // Prefer Easy Effects as first option when its source exists.
  sources.sort((a, b) => {
    if (a.isEasyEffects !== b.isEasyEffects) return a.isEasyEffects ? -1 : 1
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    return a.title.localeCompare(b.title)
  })
  return sources
}

export function selectMicrophoneSource(name: string): void {
  try {
    Gio.Subprocess.new(["pactl", "set-default-source", name], Gio.SubprocessFlags.STDERR_SILENCE)
    Gio.Subprocess.new(["pactl", "set-source-mute", name, "0"], Gio.SubprocessFlags.STDERR_SILENCE)
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
      snap()
      return GLib.SOURCE_REMOVE
    })
  } catch (e) {
    printerr(`mic: select source failed: ${e}`)
  }
}


/** If EE source exists and is not default, set it as default (preferred input). */
export function preferEasyEffectsSource(): boolean {
  const ee = probeEasyEffects()
  if (!ee.available || !ee.sourceName) return false
  const cur = resolveSourceName()
  if (cur === ee.sourceName) return false
  selectMicrophoneSource(ee.sourceName)
  return true
}

export function turnOffMicrophone(): void {
  try {
    Gio.Subprocess.new(["pactl", "set-source-mute", "@DEFAULT_SOURCE@", "1"], Gio.SubprocessFlags.STDERR_SILENCE)
    setMicMuted(true)
    setMicHearing(false)
    stopDictationIfActive()
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
      snap()
      return GLib.SOURCE_REMOVE
    })
  } catch (e) {
    printerr(`mic: turn off failed: ${e}`)
  }
}

export function probeMicMuted(source?: string): boolean {
  const src = source ?? resolveSourceName()
  const out = runSync(["pactl", "get-source-mute", src])
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
  const chunks = block.split(/Source #\d+\n/)
  for (const c of chunks) {
    if (!c.includes(`Name: ${src}`)) continue
    const dm = c.match(/Description:\s*(.+)/)
    if (dm) return dm[1].trim()
  }
  return src
}

function stopDictationIfActive(): void {
  try {
    const dictatorBin =
      GLib.find_program_in_path("kdx-dictator") ??
      `${GLib.get_home_dir()}/.local/bin/kdx-dictator`
    Gio.Subprocess.new([dictatorBin, "stop"], Gio.SubprocessFlags.STDERR_SILENCE)
  } catch {}
}

function snap(refreshName = false): void {
  const src = resolveSourceName()
  const muted = probeMicMuted(src)
  const prevMuted = micMuted.peek()
  setMicMuted(muted)
  if (refreshName || src !== cachedSource || cachedDescription === "Microphone") {
    cachedSource = src
    cachedDescription = probeMicDescription(src)
  }
  setMicName(cachedDescription)
  if (muted && micHearing.peek()) {
    setMicHearing(false)
  }
  if (muted && !prevMuted) {
    stopDictationIfActive()
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

function stopActivityMonitor(): void {
  if (activityProc !== null) {
    try {
      activityProc.force_exit()
    } catch {}
    activityProc = null
  }
}

/** Best-effort: kill leftover activity monitors left by SIGKILL of AGS. */
function reapOrphanActivity(): void {
  try {
    Gio.Subprocess.new(
      ["pkill", "-x", "kdx-mic-activity"],
      Gio.SubprocessFlags.STDERR_SILENCE,
    )
  } catch {}
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
            activityBackoffMs = 1000
            const trimmed = line.trim()
            if (!micMuted.peek()) {
              setMicHearing(trimmed === "1")
            } else {
              setMicHearing(false)
            }
            readNext()
          } else {
            stopActivityMonitor()
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, activityBackoffMs, () => {
              startActivityMonitor()
              return GLib.SOURCE_REMOVE
            })
            activityBackoffMs = Math.min(activityBackoffMs * 2, 30000)
          }
        } catch {
          stopActivityMonitor()
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
  snap(true)
  // Prefer EE source when present (portable; no-op if absent).
  preferEasyEffectsSource()
  ensureTick()
  startSubscribe()
  reapOrphanActivity()
  startActivityMonitor()
}

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
  const next = !micMuted.peek()
  setMicMuted(next)
  if (next) {
    setMicHearing(false)
    stopDictationIfActive()
  }
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, REPROBE_MS, () => {
    snap()
    return GLib.SOURCE_REMOVE
  })
}

export { micMuted, micName, micHearing }
