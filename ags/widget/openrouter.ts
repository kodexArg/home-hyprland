import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState, createComputed } from "ags"
import { execAsync } from "ags/process"

export type OpenRouterCreditSnap = {
  balance: number | null
  formatted: string
  total_credits?: number
  total_usage?: number
  error: string | null
  stale?: boolean
}

const DEFAULT_SNAP: OpenRouterCreditSnap = {
  balance: null,
  formatted: "...",
  error: null,
}

const CACHE_FILE = "/tmp/kdx_openrouter_credits.json"
const POLL_INTERVAL_MS = 60_000 // Poll OpenRouter credits every 60s
const SCRIPT = `${GLib.get_home_dir()}/.local/bin/kdx-openrouter-credits`

const [creditSnap, setCreditSnap] = createState<OpenRouterCreditSnap>(readCachedSnap())

let inFlight = false
let pollSource: number | null = null

function readCachedSnap(): OpenRouterCreditSnap {
  try {
    const file = Gio.File.new_for_path(CACHE_FILE)
    if (file.query_exists(null)) {
      const [ok, bytes] = file.load_contents(null)
      if (ok) {
        const parsed = JSON.parse(new TextDecoder().decode(bytes).trim())
        return {
          balance: typeof parsed.balance === "number" ? parsed.balance : null,
          formatted: parsed.formatted || "---",
          total_credits: parsed.total_credits,
          total_usage: parsed.total_usage,
          error: parsed.error || null,
          stale: parsed.stale,
        }
      }
    }
  } catch {}
  return DEFAULT_SNAP
}

export function refreshCredits() {
  if (inFlight) return
  inFlight = true

  execAsync(["python3", SCRIPT])
    .then((out) => {
      try {
        const data = JSON.parse(out.trim())
        setCreditSnap({
          balance: typeof data.balance === "number" ? data.balance : null,
          formatted: data.formatted || "---",
          total_credits: data.total_credits,
          total_usage: data.total_usage,
          error: data.error || null,
        })
      } catch (e) {
        printerr(`openrouter-credits: JSON parse error: ${e}`)
      }
    })
    .catch((err) => {
      printerr(`openrouter-credits: exec error: ${err}`)
      const cached = readCachedSnap()
      if (cached.balance !== null) {
        setCreditSnap({ ...cached, stale: true })
      }
    })
    .finally(() => {
      inFlight = false
    })
}

export function startOpenRouterWatch() {
  if (pollSource !== null) return

  // Initial fetch
  refreshCredits()

  pollSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_INTERVAL_MS, () => {
    refreshCredits()
    return GLib.SOURCE_CONTINUE
  })
}

export const openRouterSnap = creditSnap
export const openRouterFormatted = createComputed(() => creditSnap().formatted)
export const openRouterBalance = createComputed(() => creditSnap().balance)
export const openRouterHasError = createComputed(() => Boolean(creditSnap().error))
