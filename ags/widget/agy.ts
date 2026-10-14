import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"
import { execAsync } from "ags/process"

export type AgyUsageSnap = {
  model: string
  model_short: string
  /** Gemini group, percent USED (100 - remaining). */
  five_hour_pct?: number | null
  week_pct?: number | null
  reset_iso?: string | null
  week_reset_iso?: string | null
  /** Claude/GPT group inside Antigravity, percent used. */
  other_five_hour_pct?: number | null
  other_week_pct?: number | null
  other_group?: string
  /** Model names exactly as agy's /quota reports them for the non-Gemini group. */
  other_models?: string[]
  other_reset_iso?: string | null
  other_week_reset_iso?: string | null
  /** false: /quota only gives a shared group figure, not per-model numbers. */
  other_per_model?: boolean
  fetched_at?: number
  updated_at: string
  error: string | null
  stale?: boolean
}

const DEFAULT_SNAP: AgyUsageSnap = { model: "?", model_short: "--", updated_at: "--:--", error: null }

/** Written by ~/.local/bin/kdx-agy-usage, run by kdx-agy-usage.timer (systemd --user, 15 min).
 *  The bar only re-reads this small file; agy runs only from the timer or a click. */
const CACHE_FILE = `${GLib.get_user_cache_dir()}/kdx/agy_usage.json`
const POLL_INTERVAL_MS = 60_000
const SCRIPT = `${GLib.get_home_dir()}/.local/bin/kdx-agy-usage`

const [agySnap, setAgySnap] = createState<AgyUsageSnap>(readCachedSnap())

let inFlight = false
let pollSource: number | null = null

function readCachedSnap(): AgyUsageSnap {
  try {
    const file = Gio.File.new_for_path(CACHE_FILE)
    if (file.query_exists(null)) {
      const [ok, bytes] = file.load_contents(null)
      if (ok) return { ...DEFAULT_SNAP, ...JSON.parse(new TextDecoder().decode(bytes).trim()) }
    }
  } catch {}
  return DEFAULT_SNAP
}

/** Click: force a refresh (the script still throttles agy to once per 2 min). */
export function refreshAgyUsage() {
  if (inFlight) return
  inFlight = true
  execAsync(["python3", SCRIPT, "--force"])
    .catch((err) => printerr(`agy-usage: exec error: ${err}`))
    .finally(() => {
      inFlight = false
      setAgySnap(readCachedSnap())
    })
}

export function startAgyWatch() {
  if (pollSource !== null) return
  setAgySnap(readCachedSnap())
  pollSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_INTERVAL_MS, () => {
    setAgySnap(readCachedSnap())
    return GLib.SOURCE_CONTINUE
  })
}

export const agyUsageSnap = agySnap
