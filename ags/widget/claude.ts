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

const DEFAULT_SNAP: ClaudeUsageSnap = {
  email: "gcavedal@alvsgroup.com",
  org: "Alvsgroup",
  tier: "Team",
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

/** Written by ~/.local/bin/kdx-claude-usage, run by kdx-claude-usage.timer (systemd --user, 5 min).
 *  The bar only re-reads this small file; it never spawns the script on a tick. */
const CACHE_FILE = `${GLib.get_user_cache_dir()}/kdx/claude_usage.json`
const POLL_INTERVAL_MS = 60_000
const SCRIPT = `${GLib.get_home_dir()}/.local/bin/kdx-claude-usage`

const [claudeSnap, setClaudeSnap] = createState<ClaudeUsageSnap>(readCachedSnap())

let inFlight = false
let pollSource: number | null = null

function readCachedSnap(): ClaudeUsageSnap {
  try {
    const file = Gio.File.new_for_path(CACHE_FILE)
    if (file.query_exists(null)) {
      const [ok, bytes] = file.load_contents(null)
      if (ok) {
        return JSON.parse(new TextDecoder().decode(bytes).trim())
      }
    }
  } catch {}
  return DEFAULT_SNAP
}

export function refreshClaudeUsage() {
  if (inFlight) return
  inFlight = true

  execAsync(["python3", SCRIPT])
    .then((out) => {
      try {
        const data = JSON.parse(out.trim())
        setClaudeSnap(data)
      } catch (e) {
        printerr(`claude-usage: JSON parse error: ${e}`)
      }
    })
    .catch((err) => {
      printerr(`claude-usage: exec error: ${err}`)
      const cached = readCachedSnap()
      setClaudeSnap({ ...cached, stale: true })
    })
    .finally(() => {
      inFlight = false
    })
}

export function startClaudeWatch() {
  if (pollSource !== null) return

  setClaudeSnap(readCachedSnap())

  pollSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_INTERVAL_MS, () => {
    setClaudeSnap(readCachedSnap())
    return GLib.SOURCE_CONTINUE
  })
}

export const claudeUsageSnap = claudeSnap
