import AstalWp from "gi://AstalWp"
import GLib from "gi://GLib"
import { createState } from "ags"
import { execAsync } from "ags/process"

let cachedSpotifyPid: number | null = null

export function isSpotifyRunning(): boolean {
  if (cachedSpotifyPid !== null) {
    if (GLib.file_test(`/proc/${cachedSpotifyPid}`, GLib.FileTest.EXISTS)) {
      try {
        const [ok, bytes] = GLib.file_get_contents(`/proc/${cachedSpotifyPid}/comm`)
        if (ok && new TextDecoder().decode(bytes).trim().toLowerCase() === "spotify") {
          return true
        }
      } catch (_) {}
    }
    cachedSpotifyPid = null
  }

  try {
    const [ok, out] = GLib.spawn_command_line_sync("pgrep -x spotify")
    if (ok && out && out.length > 0) {
      const pid = parseInt(new TextDecoder().decode(out).trim().split("\n")[0] || "", 10)
      if (!isNaN(pid) && pid > 0) {
        cachedSpotifyPid = pid
        return true
      }
    }
  } catch (_) {}

  return false
}

export const [isSpotifyAppRunning, setIsSpotifyAppRunning] = createState(false)
export const [hasSpotifyStream, setHasSpotifyStream] = createState(false)
export const [spotifyTitle, setSpotifyTitle] = createState("Spotify")
export const [spotifyVolume, setSpotifyVolumeState] = createState(1.0)
export const [spotifyMuted, setSpotifyMuted] = createState(false)

let trackedStreams: AstalWp.Stream[] = []
const connectedSignalIds = new Map<AstalWp.Stream, number[]>()

export function isSpotifyStream(s: AstalWp.Stream): boolean {
  const appName = (s.get_pw_property("application.name") || s.description || "").toLowerCase()
  const nodeName = (s.get_pw_property("node.name") || s.name || "").toLowerCase()
  const binary = (s.get_pw_property("application.process.binary") || "").toLowerCase()
  return appName.includes("spotify") || nodeName.includes("spotify") || binary.includes("spotify")
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

export function syncSpotifyStreams() {
  const wp = AstalWp.get_default()
  if (!wp || !wp.audio) return

  const running = isSpotifyRunning()
  setIsSpotifyAppRunning(running)

  const allStreams = wp.audio.streams || []
  const matches: AstalWp.Stream[] = []

  for (const s of allStreams) {
    if (isSpotifyStream(s)) {
      matches.push(s)
    }
  }

  const isDifferent =
    matches.length !== trackedStreams.length ||
    matches.some((s, idx) => s.id !== trackedStreams[idx]?.id)

  if (isDifferent) {
    clearSignalHandlers()
    trackedStreams = matches

    for (const s of trackedStreams) {
      const ids: number[] = []
      const volId = s.connect("notify::volume", () => {
        acceptStreamVolume(s)
      })
      const muteId = s.connect("notify::mute", () => {
        setSpotifyMuted(s.mute)
      })
      ids.push(volId, muteId)
      connectedSignalIds.set(s, ids)
    }
  }

  if (matches.length > 0) {
    const primary = matches[0]
    setHasSpotifyStream(true)
    setSpotifyMuted(primary.mute)
    if (heldVolume === null) {
      const saved = readHeldFile()
      const live = primary.volume
      if (saved !== null && live >= 0.97 && live - saved >= 0.08) {
        heldVolume = saved
        applyingHold = true
        try {
          primary.set_volume(saved)
        } catch (_) {}
        applyingHold = false
        publishMprisVolume(saved)
      } else {
        heldVolume = live
      }
    }
    acceptStreamVolume(primary)
    if (!mprisOk && heldVolume !== null) publishMprisVolume(heldVolume)
  } else {
    setHasSpotifyStream(false)
  }

  if (running) {
    execAsync(["spotify-ctl", "status"])
      .then((out) => {
        const line = out.trim()
        if (line.includes("] ")) {
          const track = line.split("] ")[1]?.split(" [Vol")[0]?.trim()
          if (track) setSpotifyTitle(track)
        }
      })
      .catch(() => setSpotifyTitle("Spotify"))
  } else {
    setSpotifyTitle("Spotify")
  }
}

export const MAX_SPOTIFY_VOLUME = 1.0

// Spotify reapplies MPRIS Volume onto the PipeWire stream at each track change.
// The slider used to move only the stream, so the client restored 100%.
const HELD_PATH = `${GLib.get_user_state_dir()}/ags-spotify-volume`
let heldVolume: number | null = null
let applyingHold = false
let mprisWanted: number | null = null
let mprisTimer = 0
let mprisOk = false

function readHeldFile(): number | null {
  try {
    const [ok, bytes] = GLib.file_get_contents(HELD_PATH)
    if (!ok || !bytes) return null
    const n = parseFloat(new TextDecoder().decode(bytes).trim())
    if (Number.isNaN(n)) return null
    return Math.max(0, Math.min(1, n))
  } catch (_) {
    return null
  }
}

function writeHeldFile(val: number) {
  try {
    GLib.file_set_contents(HELD_PATH, `${val.toFixed(4)}\n`)
  } catch (_) {}
}

function rememberVolume(val: number) {
  if (heldVolume !== null && Math.abs(heldVolume - val) < 0.005) {
    heldVolume = val
    return
  }
  heldVolume = val
  writeHeldFile(val)
  publishMprisVolume(val)
}

function publishMprisVolume(val: number) {
  mprisWanted = Math.max(0, Math.min(1, val))
  if (mprisTimer) return
  mprisTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
    mprisTimer = 0
    const v = mprisWanted
    mprisWanted = null
    if (v === null) return GLib.SOURCE_REMOVE
    execAsync(["spotify-ctl", "volume", v.toFixed(4)])
      .then(() => {
        mprisOk = true
      })
      .catch(() => undefined)
    return GLib.SOURCE_REMOVE
  })
}

function acceptStreamVolume(s: AstalWp.Stream) {
  if (applyingHold) {
    setSpotifyVolumeState(s.volume)
    return
  }
  const v = s.volume
  if (heldVolume !== null && v >= 0.97 && v - heldVolume >= 0.08) {
    applyingHold = true
    try {
      s.set_volume(heldVolume)
    } catch (_) {}
    applyingHold = false
    publishMprisVolume(heldVolume)
    setSpotifyVolumeState(heldVolume)
    return
  }
  rememberVolume(v)
  setSpotifyVolumeState(v)
}

export function setSpotifyVolume(val: number) {
  const clamped = Math.max(0, Math.min(MAX_SPOTIFY_VOLUME, val))
  heldVolume = clamped
  writeHeldFile(clamped)
  setSpotifyVolumeState(clamped)
  publishMprisVolume(clamped)
  applyingHold = true
  for (const s of trackedStreams) {
    try {
      s.set_volume(clamped)
    } catch (_) {}
  }
  applyingHold = false
}

export function bumpSpotifyVolume(delta: number) {
  setSpotifyVolume(spotifyVolume.peek() + delta)
}

export function toggleSpotifyMute() {
  const next = !spotifyMuted.peek()
  setSpotifyMuted(next)
  for (const s of trackedStreams) {
    try {
      s.set_mute(next)
    } catch (_) {}
  }
}

export function toggleSpotifyPlay() {
  execAsync(["spotify-ctl", "toggle"]).catch(() => undefined)
}

let initialized = false
export function startSpotifyAudioMonitor() {
  if (initialized) return
  initialized = true

  const wp = AstalWp.get_default()
  if (!wp) return

  const connectAudio = () => {
    if (!wp.audio) return
    wp.audio.connect("stream-added", () => syncSpotifyStreams())
    wp.audio.connect("stream-removed", () => syncSpotifyStreams())
    wp.audio.connect("notify::streams", () => syncSpotifyStreams())
    syncSpotifyStreams()
  }

  if (wp.audio) {
    connectAudio()
  } else {
    wp.connect("notify::audio", () => connectAudio())
  }

  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
    syncSpotifyStreams()
    return GLib.SOURCE_CONTINUE
  })
}
