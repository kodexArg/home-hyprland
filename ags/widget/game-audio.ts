import AstalWp from "gi://AstalWp"
import GLib from "gi://GLib"
import { createState } from "ags"

export type GameDetection = {
  isGame: boolean
  title: string
}

export type GameOutputMode = "headphones" | "speakers" | "mute"

const pidCache = new Map<number, GameDetection>()

function inspectPid(pid: number, appName: string, binary: string): GameDetection {
  if (pidCache.has(pid)) return pidCache.get(pid)!

  const lowerApp = appName.toLowerCase()
  if (
    lowerApp === "steam" ||
    lowerApp.includes("steamwebhelper") ||
    lowerApp.includes("gameoverlayui") ||
    lowerApp.includes("brave") ||
    lowerApp.includes("chromium") ||
    lowerApp.includes("firefox") ||
    lowerApp.includes("vlc") ||
    lowerApp.includes("spotify") ||
    lowerApp.includes("discord") ||
    lowerApp.includes("parec") ||
    lowerApp.includes("systemd")
  ) {
    const res: GameDetection = { isGame: false, title: "" }
    pidCache.set(pid, res)
    return res
  }

  const isWine = /wine(64)?-preloader/i.test(binary) || /proton/i.test(binary)

  try {
    const [ok, bytes] = GLib.file_get_contents(`/proc/${pid}/environ`)
    if (ok) {
      const text = new TextDecoder().decode(bytes)
      if (
        text.includes("SteamAppId=") ||
        text.includes("STEAM_COMPAT_") ||
        text.includes("STEAM_RUNTIME") ||
        text.includes("/steamapps/")
      ) {
        let title = appName
        if (!title || title === binary || isWine) {
          try {
            const [cmdOk, cmdBytes] = GLib.file_get_contents(`/proc/${pid}/cmdline`)
            if (cmdOk) {
              const cmd = new TextDecoder().decode(cmdBytes)
              const match = cmd.match(/([^\\/]+)\.exe/i)
              if (match) title = match[1]
            }
          } catch (_) {}
        }
        const res: GameDetection = {
          isGame: true,
          title: title || "Steam Game",
        }
        pidCache.set(pid, res)
        return res
      }
    }
  } catch (_) {}

  try {
    const [cmdOk, cmdBytes] = GLib.file_get_contents(`/proc/${pid}/cmdline`)
    if (cmdOk) {
      const cmd = new TextDecoder().decode(cmdBytes)
      if (cmd.includes("steamapps") || cmd.includes("pressure-vessel")) {
        const res: GameDetection = {
          isGame: true,
          title: appName || "Steam Game",
        }
        pidCache.set(pid, res)
        return res
      }
    }
  } catch (_) {}

  if (isWine) {
    const res: GameDetection = { isGame: true, title: appName || "Wine Game" }
    pidCache.set(pid, res)
    return res
  }

  const res: GameDetection = { isGame: false, title: "" }
  pidCache.set(pid, res)
  return res
}

export function isSteamGameStream(s: AstalWp.Stream): GameDetection {
  const appName = s.get_pw_property("application.name") || s.description || ""
  const nodeName = s.get_pw_property("node.name") || s.name || ""
  const binary = s.get_pw_property("application.process.binary") || ""
  const pidStr = s.get_pw_property("application.process.id")

  if (
    /hell\s*let\s*loose/i.test(appName) ||
    /hell\s*let\s*loose/i.test(nodeName) ||
    /HLL-Win64-Shipping/i.test(appName) ||
    /HLL-Win64-Shipping/i.test(nodeName)
  ) {
    return { isGame: true, title: "Hell Let Loose" }
  }

  if (/^steam$/i.test(appName) || /steamwebhelper/i.test(appName) || /steamwebhelper/i.test(binary)) {
    return { isGame: false, title: "" }
  }

  if (pidStr) {
    const pid = parseInt(pidStr, 10)
    if (!isNaN(pid) && pid > 0) {
      return inspectPid(pid, appName, binary)
    }
  }

  if (/wine(64)?-preloader/i.test(binary) || /proton/i.test(binary)) {
    return { isGame: true, title: appName || "Wine Game" }
  }

  return { isGame: false, title: "" }
}

export function endpointLooksLikeMbSpeakers(ep: AstalWp.Endpoint): boolean {
  const d = (ep.description ?? "").toLowerCase()
  return (
    d.includes("parlantes") ||
    d.includes("motherboard") ||
    d.includes("analog") ||
    d.includes("family 17h") ||
    d.includes("starship")
  )
}

export function endpointLooksLikeHdmiHeadphones(ep: AstalWp.Endpoint): boolean {
  const d = (ep.description ?? "").toLowerCase()
  return (
    d.includes("auriculares") ||
    d.includes("g2790g4") ||
    d.includes("aoc") ||
    (d.includes("hdmi") && !d.includes("asus"))
  )
}

export function endpointIsHeadphones(ep: AstalWp.Endpoint): boolean {
  if (endpointLooksLikeHdmiHeadphones(ep)) return true
  if (endpointLooksLikeMbSpeakers(ep)) return false
  const r = ep.route
  const name = (r?.name ?? "").toLowerCase()
  const desc = (r?.description ?? "").toLowerCase()
  return name.includes("headphone") || desc.includes("headphone") || desc.includes("auriculares")
}

export function listSpeakers(wp: AstalWp.Wp): AstalWp.Endpoint[] {
  return wp.audio?.speakers ?? []
}

export function findSpeakerSink(wp: AstalWp.Wp): AstalWp.Endpoint | null {
  const all = listSpeakers(wp)
  return (
    all.find((s) => endpointLooksLikeMbSpeakers(s)) ??
    all.find((s) => !endpointIsHeadphones(s)) ??
    null
  )
}

export function findHeadphoneSink(wp: AstalWp.Wp): AstalWp.Endpoint | null {
  return listSpeakers(wp).find((s) => endpointIsHeadphones(s)) ?? null
}

// Reactive state
export const [hasGameStream, setHasGameStream] = createState(false)
export const [gameTitle, setGameTitle] = createState("Steam Game")
export const [gameVolume, setGameVolumeState] = createState(1.0)
export const [gameMuted, setGameMuted] = createState(false)

let trackedStreams: AstalWp.Stream[] = []
const connectedSignalIds = new Map<AstalWp.Stream, number[]>()

export function ensureGameStreamsFollowDefault() {
  for (const s of trackedStreams) {
    try {
      s.set_target_endpoint(null)
    } catch (_) {}
  }
}

function clearSignalHandlers() {
  for (const [stream, ids] of connectedSignalIds.entries()) {
    for (const id of ids) {
      try {
        stream.disconnect(id)
      } catch (_) {}
    }
  }
  connectedSignalIds.clear()
}

export function syncGameStreams() {
  const wp = AstalWp.get_default()
  if (!wp || !wp.audio) return

  const allStreams = wp.audio.streams || []
  const matches: { stream: AstalWp.Stream; title: string }[] = []

  for (const s of allStreams) {
    const det = isSteamGameStream(s)
    if (det.isGame) {
      matches.push({ stream: s, title: det.title })
    }
  }

  const newStreams = matches.map((m) => m.stream)
  const isDifferent =
    newStreams.length !== trackedStreams.length ||
    newStreams.some((s, idx) => s.id !== trackedStreams[idx]?.id)

  if (isDifferent) {
    clearSignalHandlers()
    trackedStreams = newStreams

    for (const s of trackedStreams) {
      try {
        // En tándem con la salida del sistema: liberar cualquier endpoint fijo
        s.set_target_endpoint(null)
      } catch (_) {}

      const ids: number[] = []
      const volId = s.connect("notify::volume", () => {
        setGameVolumeState(s.volume)
      })
      const muteId = s.connect("notify::mute", () => {
        setGameMuted(s.mute)
      })
      ids.push(volId, muteId)
      connectedSignalIds.set(s, ids)
    }
  }

  if (matches.length > 0) {
    const primary = matches[0]
    setHasGameStream(true)
    setGameTitle(matches.length > 1 ? `${primary.title} (+${matches.length - 1})` : primary.title)
    setGameVolumeState(primary.stream.volume)
    setGameMuted(primary.stream.mute)
  } else {
    setHasGameStream(false)
  }
}

export const MAX_GAME_VOLUME = 1.3

export function setGameVolume(val: number) {
  const clamped = Math.max(0, Math.min(MAX_GAME_VOLUME, val))
  setGameVolumeState(clamped)
  for (const s of trackedStreams) {
    try {
      s.set_volume(clamped)
    } catch (_) {}
  }
}

export function bumpGameVolume(delta: number) {
  setGameVolume(gameVolume.peek() + delta)
}

export function toggleGameMute() {
  const next = !gameMuted.peek()
  setGameMuted(next)
  for (const s of trackedStreams) {
    try {
      s.set_mute(next)
    } catch (_) {}
  }
}

let initialized = false
export function startGameAudioMonitor() {
  if (initialized) return
  initialized = true

  const wp = AstalWp.get_default()
  if (!wp) return

  const connectAudio = () => {
    if (!wp.audio) return
    wp.audio.connect("stream-added", () => syncGameStreams())
    wp.audio.connect("stream-removed", () => syncGameStreams())
    wp.audio.connect("notify::streams", () => syncGameStreams())
    syncGameStreams()
  }

  if (wp.audio) {
    connectAudio()
  } else {
    wp.connect("notify::audio", () => connectAudio())
  }

  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
    syncGameStreams()
    return GLib.SOURCE_CONTINUE
  })
}
