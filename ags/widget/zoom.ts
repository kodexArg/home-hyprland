import GLib from "gi://GLib"
import { createComputed } from "ags"
import { createPoll } from "ags/time"

/** SSOT: hypr-zoom-toggle → $XDG_RUNTIME_DIR/hypr-zoom.phase (dense|roomy|arming|failed). */
const PHASE_PATH = `${GLib.getenv("XDG_RUNTIME_DIR") || "/tmp"}/hypr-zoom.phase`

export function readZoomPhase(): string {
  try {
    const [, bytes] = GLib.file_get_contents(PHASE_PATH)
    if (!bytes) return "roomy"
    const text = new TextDecoder().decode(bytes).trim()
    return text || "roomy"
  } catch {
    return "roomy"
  }
}

export const zoomPhase = createPoll("roomy", 400, () => readZoomPhase())

/** Preferred zoom (Super+Ctrl+Z dense = portrait scale 1.5). */
export const isZoomDense = createComputed(() => {
  const p = zoomPhase()
  return p === "dense" || p === "arming"
})
