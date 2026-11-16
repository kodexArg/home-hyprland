import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"
import { execAsync } from "ags/process"

export type GrokBuildUsageSnap = {
  grok_pct: number | null
  grok_pct_raw?: number
  grok_formatted: string
  plan: string
  cursor_plan?: string
  has_available?: boolean
  reset_str: string
  days_left?: number
  reset_iso?: string
  build_pct?: number | null
  error: string | null
  stale?: boolean
}

const DEFAULT_SNAP: GrokBuildUsageSnap = {
  grok_pct: null,
  grok_formatted: "--%",
  plan: "Grok Build",
  reset_str: "...",
  error: null,
}

const CACHE_FILE = "/tmp/kdx_grokbuild_usage.json"
const POLL_INTERVAL_MS = 60_000 // Poll Grok Build usage every 60s
const SCRIPT = `${GLib.get_home_dir()}/.local/bin/kdx-grokbuild-usage`

const [grokSnap, setGrokSnap] = createState<GrokBuildUsageSnap>(readCachedSnap())

let inFlight = false
let pollSource: number | null = null

function readCachedSnap(): GrokBuildUsageSnap {
  try {
    const file = Gio.File.new_for_path(CACHE_FILE)
    if (file.query_exists(null)) {
      const [ok, bytes] = file.load_contents(null)
      if (ok) {
        const parsed = JSON.parse(new TextDecoder().decode(bytes).trim())
        return {
          grok_pct: typeof parsed.grok_pct === "number" ? parsed.grok_pct : null,
          grok_pct_raw: parsed.grok_pct_raw,
          grok_formatted: parsed.grok_formatted || "--%",
          plan: parsed.plan || "Grok Build",
          cursor_plan: parsed.cursor_plan,
          has_available: parsed.has_available,
          reset_str: parsed.reset_str || "...",
          days_left: parsed.days_left,
          reset_iso: parsed.reset_iso,
          build_pct: parsed.build_pct,
          error: parsed.error || null,
          stale: parsed.stale,
        }
      }
    }
  } catch {}
  return DEFAULT_SNAP
}

export function refreshGrokBuildUsage() {
  if (inFlight) return
  inFlight = true

  execAsync(["python3", SCRIPT])
    .then((out) => {
      try {
        const data = JSON.parse(out.trim())
        setGrokSnap({
          grok_pct: typeof data.grok_pct === "number" ? data.grok_pct : null,
          grok_pct_raw: data.grok_pct_raw,
          grok_formatted: data.grok_formatted || "--%",
          plan: data.plan || "Grok Build",
          cursor_plan: data.cursor_plan,
          has_available: data.has_available,
          reset_str: data.reset_str || "...",
          days_left: data.days_left,
          reset_iso: data.reset_iso,
          build_pct: data.build_pct,
          error: data.error || null,
        })
      } catch (e) {
        printerr(`grokbuild-usage: JSON parse error: ${e}`)
      }
    })
    .catch((err) => {
      printerr(`grokbuild-usage: exec error: ${err}`)
      const cached = readCachedSnap()
      if (cached.grok_pct !== null) {
        setGrokSnap({ ...cached, stale: true })
      }
    })
    .finally(() => {
      inFlight = false
    })
}

export function startGrokBuildWatch() {
  if (pollSource !== null) return

  // Initial fetch
  refreshGrokBuildUsage()

  pollSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_INTERVAL_MS, () => {
    refreshGrokBuildUsage()
    return GLib.SOURCE_CONTINUE
  })
}

export const grokBuildUsageSnap = grokSnap
