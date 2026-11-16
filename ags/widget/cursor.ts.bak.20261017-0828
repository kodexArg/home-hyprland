import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState, createComputed } from "ags"
import { execAsync } from "ags/process"

export type CursorUsageSnap = {
  cursor_pct: number | null
  other_pct: number | null
  cursor_formatted: string
  other_formatted: string
  total_spend?: number
  limit?: number
  remaining?: number
  reset_str: string
  days_left?: number
  display_message?: string
  error: string | null
  stale?: boolean
}

const DEFAULT_SNAP: CursorUsageSnap = {
  cursor_pct: null,
  other_pct: null,
  cursor_formatted: "--%",
  other_formatted: "--%",
  reset_str: "...",
  error: null,
}

const CACHE_FILE = "/tmp/kdx_cursor_usage.json"
const POLL_INTERVAL_MS = 60_000 // Poll Cursor usage every 60s
const SCRIPT = `${GLib.get_home_dir()}/.local/bin/kdx-cursor-usage`

const [cursorSnap, setCursorSnap] = createState<CursorUsageSnap>(readCachedSnap())

let inFlight = false
let pollSource: number | null = null

function readCachedSnap(): CursorUsageSnap {
  try {
    const file = Gio.File.new_for_path(CACHE_FILE)
    if (file.query_exists(null)) {
      const [ok, bytes] = file.load_contents(null)
      if (ok) {
        const parsed = JSON.parse(new TextDecoder().decode(bytes).trim())
        return {
          cursor_pct: typeof parsed.cursor_pct === "number" ? parsed.cursor_pct : null,
          other_pct: typeof parsed.other_pct === "number" ? parsed.other_pct : null,
          cursor_formatted: parsed.cursor_formatted || "--%",
          other_formatted: parsed.other_formatted || "--%",
          total_spend: parsed.total_spend,
          limit: parsed.limit,
          remaining: parsed.remaining,
          reset_str: parsed.reset_str || "...",
          days_left: parsed.days_left,
          display_message: parsed.display_message,
          error: parsed.error || null,
          stale: parsed.stale,
        }
      }
    }
  } catch {}
  return DEFAULT_SNAP
}

export function refreshCursorUsage() {
  if (inFlight) return
  inFlight = true

  execAsync(["python3", SCRIPT])
    .then((out) => {
      try {
        const data = JSON.parse(out.trim())
        setCursorSnap({
          cursor_pct: typeof data.cursor_pct === "number" ? data.cursor_pct : null,
          other_pct: typeof data.other_pct === "number" ? data.other_pct : null,
          cursor_formatted: data.cursor_formatted || "--%",
          other_formatted: data.other_formatted || "--%",
          total_spend: data.total_spend,
          limit: data.limit,
          remaining: data.remaining,
          reset_str: data.reset_str || "...",
          days_left: data.days_left,
          display_message: data.display_message,
          error: data.error || null,
        })
      } catch (e) {
        printerr(`cursor-usage: JSON parse error: ${e}`)
      }
    })
    .catch((err) => {
      printerr(`cursor-usage: exec error: ${err}`)
      const cached = readCachedSnap()
      if (cached.cursor_pct !== null) {
        setCursorSnap({ ...cached, stale: true })
      }
    })
    .finally(() => {
      inFlight = false
    })
}

export function startCursorWatch() {
  if (pollSource !== null) return

  // Initial fetch
  refreshCursorUsage()

  pollSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_INTERVAL_MS, () => {
    refreshCursorUsage()
    return GLib.SOURCE_CONTINUE
  })
}

export const cursorUsageSnap = cursorSnap
