import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"
import { execAsync } from "ags/process"

export type ClaudeUsageSnap = {
  email: string
  org: string
  tier: string
  rate_limit_tier: string
  five_hour_pct: number
  daily_pct: number
  claude_pct: number
  claude_formatted: string
  tokens_today: number
  messages_today: number
  sessions_today: number
  reset_str: string
  reset_iso?: string
  fetched_at?: number
  /** Desktop-history fallback sample time (s) when the live endpoint fails. */
  sample_at?: number
  source?: "live" | "cache" | "desktop"
  week_pct?: number
  week_reset_str?: string
  week_reset_iso?: string
  updated_at: string
  error: string | null
  stale?: boolean
}

const DEFAULT_SNAP_PERSONAL: ClaudeUsageSnap = {
  email: "gcavedal@gmail.com",
  org: "Gabriel Cavedal",
  tier: "Max",
  rate_limit_tier: "default_claude_max_5x",
  five_hour_pct: 0,
  daily_pct: 0,
  claude_pct: 0,
  claude_formatted: "0%",
  tokens_today: 0,
  messages_today: 0,
  sessions_today: 0,
  reset_str: "5h móvil",
  updated_at: "--:--",
  error: null,
}

const DEFAULT_SNAP_ALVS: ClaudeUsageSnap = {
  email: "gcavedal@alvsgroup.com",
  org: "Alvsgroup",
  tier: "Team Standard",
  rate_limit_tier: "default_raven",
  five_hour_pct: 0,
  daily_pct: 0,
  claude_pct: 0,
  claude_formatted: "0%",
  tokens_today: 0,
  messages_today: 0,
  sessions_today: 0,
  reset_str: "5h móvil",
  updated_at: "--:--",
  error: null,
}

const CACHE_FILE_PERSONAL = `${GLib.get_user_cache_dir()}/kdx/claude_usage.json`
const CACHE_FILE_ALVS = `${GLib.get_user_cache_dir()}/kdx/claude_alvs_usage.json`
const POLL_INTERVAL_MS = 15_000
const SCRIPT = `${GLib.get_home_dir()}/.local/bin/kdx-claude-usage`

function readSnapFile(filePath: string, defaultSnap: ClaudeUsageSnap): ClaudeUsageSnap {
  try {
    const file = Gio.File.new_for_path(filePath)
    if (file.query_exists(null)) {
      const [ok, bytes] = file.load_contents(null)
      if (ok) {
        return { ...defaultSnap, ...JSON.parse(new TextDecoder().decode(bytes).trim()) }
      }
    }
  } catch {}
  return defaultSnap
}

const [claudeSnap, setClaudeSnap] = createState<ClaudeUsageSnap>(
  readSnapFile(CACHE_FILE_PERSONAL, DEFAULT_SNAP_PERSONAL),
)
const [claudeAlvsSnap, setClaudeAlvsSnap] = createState<ClaudeUsageSnap>(
  readSnapFile(CACHE_FILE_ALVS, DEFAULT_SNAP_ALVS),
)

let inFlightPersonal = false
let inFlightAlvs = false
let pollSourcePersonal: number | null = null
let pollSourceAlvs: number | null = null

export function refreshClaudeUsage() {
  if (inFlightPersonal) return
  inFlightPersonal = true

  execAsync(["python3", SCRIPT, "--profile", "personal", "--force"])
    .then((out) => {
      try {
        const data = JSON.parse(out.trim())
        setClaudeSnap(data)
      } catch (e) {
        printerr(`claude-usage (personal): JSON parse error: ${e}`)
      }
    })
    .catch((err) => {
      printerr(`claude-usage (personal): exec error: ${err}`)
      const cached = readSnapFile(CACHE_FILE_PERSONAL, DEFAULT_SNAP_PERSONAL)
      setClaudeSnap({ ...cached, stale: true })
    })
    .finally(() => {
      inFlightPersonal = false
    })
}

export function refreshClaudeAlvsUsage() {
  if (inFlightAlvs) return
  inFlightAlvs = true

  execAsync(["python3", SCRIPT, "--profile", "alvs", "--force"])
    .then((out) => {
      try {
        const data = JSON.parse(out.trim())
        setClaudeAlvsSnap(data)
      } catch (e) {
        printerr(`claude-usage (alvs): JSON parse error: ${e}`)
      }
    })
    .catch((err) => {
      printerr(`claude-usage (alvs): exec error: ${err}`)
      const cached = readSnapFile(CACHE_FILE_ALVS, DEFAULT_SNAP_ALVS)
      setClaudeAlvsSnap({ ...cached, stale: true })
    })
    .finally(() => {
      inFlightAlvs = false
    })
}

export function startClaudeWatch() {
  if (pollSourcePersonal !== null) return
  setClaudeSnap(readSnapFile(CACHE_FILE_PERSONAL, DEFAULT_SNAP_PERSONAL))
  pollSourcePersonal = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_INTERVAL_MS, () => {
    setClaudeSnap(readSnapFile(CACHE_FILE_PERSONAL, DEFAULT_SNAP_PERSONAL))
    return GLib.SOURCE_CONTINUE
  })
}

export function startClaudeAlvsWatch() {
  if (pollSourceAlvs !== null) return
  setClaudeAlvsSnap(readSnapFile(CACHE_FILE_ALVS, DEFAULT_SNAP_ALVS))
  pollSourceAlvs = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_INTERVAL_MS, () => {
    setClaudeAlvsSnap(readSnapFile(CACHE_FILE_ALVS, DEFAULT_SNAP_ALVS))
    return GLib.SOURCE_CONTINUE
  })
}

export const claudeUsageSnap = claudeSnap
export const claudeAlvsUsageSnap = claudeAlvsSnap

/** Tooltip open: re-read the cache files now (no exec, no network). */
export function reloadClaudeUsage() {
  setClaudeSnap(readSnapFile(CACHE_FILE_PERSONAL, DEFAULT_SNAP_PERSONAL))
}

export function reloadClaudeAlvsUsage() {
  setClaudeAlvsSnap(readSnapFile(CACHE_FILE_ALVS, DEFAULT_SNAP_ALVS))
}
