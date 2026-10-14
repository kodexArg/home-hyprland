import GLib from "gi://GLib"
import { createComputed } from "ags"
import { createPoll } from "ags/time"

/** SSOT: hypr-zoom-toggle → $XDG_RUNTIME_DIR/hypr-zoom.phase (dense|roomy|arming|failed). */
const PHASE_PATH = `${GLib.getenv("XDG_RUNTIME_DIR") || "/tmp"}/hypr-zoom.phase`

export function readZoomPhase(): string {
  try {
    const [, bytes] = GLib.file_get_contents(PHASE_PATH)
    if (!bytes) return "dense"
    const text = new TextDecoder().decode(bytes).trim()
    return text || "dense"
  } catch {
    return "dense"
  }
}

export const zoomPhase = createPoll("dense", 400, () => readZoomPhase())

/** Preferred zoom (Super+Ctrl+Z dense = portrait scale 1.5). */
export const isZoomDense = createComputed(() => {
  const p = zoomPhase()
  return p === "dense" || p === "arming"
})

export function zoomVal<T>(roomy: T, dense: T): T {
  return isZoomDense() ? dense : roomy
}

export function zoomScale(roomy: number, dense: number) {
  return createComputed(() => (isZoomDense() ? dense : roomy))
}


/** Usage-meter chips (Grok, Cursor, Claude, OpenRouter, LanMouse): icon a hair under the DSEG7 digits. */
export const meterIconPx = zoomScale(11, 8)
export const meterSpacing = zoomScale(3, 2)
