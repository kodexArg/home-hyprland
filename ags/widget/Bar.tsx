import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import AstalWp from "gi://AstalWp"
import GLib from "gi://GLib"
import { createBinding, createComputed, createState } from "ags"
import { createPoll } from "ags/time"
import { barModeClass, barVisible, setOverBar } from "./bar-mode"
import LocalLlm from "./LocalLlm"
import DictationIndicator from "./DictationIndicator"
import {
  caffeineShellClass,
  caffeineTooltip,
  caffeineUiOn,
  toggleCaffeine,
} from "./caffeine"

// Re-export for app.ts IPC (single import surface from Bar was legacy).
export {
  toggleCaffeine,
  getCaffeineOn,
  getCaffeineStatus,
  getCaffeineToken,
  requestCaffeineOn,
  requestCaffeineOff,
} from "./caffeine"

const TRACK_W = 140

/**
 * Fixed triple. Mute always slash/X (no headphones-mute).
 *
 * Icons: Adwaita symbolic, vendored cream under icons/ (`image file=`):
 *   speakers   → devices/audio-speakers-symbolic   (parlante only, no waves)
 *   muted      → status/audio-volume-muted-symbolic (parlante + X)
 *   headphones → devices/audio-headphones-symbolic  (auris)
 *
 * Not audio-volume-high (that one has speaker + sound arcs).
 *
 * This host topology (2026-07-24):
 *   HDMI TU106 → AOC G2790G4 (primary) = auriculares
 *   Ryzen ALC897 analog lineout (MB jack) = parlantes
 * Classify from a live defaultSpeaker read (nested route bindings stick).
 */
const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const ICON_SPEAKERS = `${ICON_DIR}/speakers.svg`
const ICON_MUTED = `${ICON_DIR}/muted.svg`
const ICON_HEADPHONES = `${ICON_DIR}/headphones.svg`

function routeLooksLikeHeadphones(
  name: string | null | undefined,
  description: string | null | undefined,
): boolean {
  const hay = `${name ?? ""} ${description ?? ""}`.toLowerCase()
  return (
    hay.includes("headphone") ||
    hay.includes("headset") ||
    hay.includes("auricular")
  )
}

/** HDMI / DP on this host = headphones (jack on primary monitor HDMI). */
function endpointLooksLikeHdmiHeadphones(ep: AstalWp.Endpoint): boolean {
  const d = `${ep.description ?? ""} ${ep.name ?? ""}`.toLowerCase()
  return (
    d.includes("hdmi") ||
    d.includes("displayport") ||
    d.includes("tu106") ||
    d.includes("nvidia")
  )
}

/** Motherboard analog speakers (lineout / ALC897), never HDMI. */
function endpointLooksLikeMbSpeakers(ep: AstalWp.Endpoint): boolean {
  if (endpointLooksLikeHdmiHeadphones(ep)) return false
  const d = `${ep.description ?? ""} ${ep.name ?? ""}`.toLowerCase()
  return (
    d.includes("analog") ||
    d.includes("ryzen") ||
    d.includes("alc897") ||
    d.includes("lineout") ||
    d.includes("line-out")
  )
}

type OutputMode = "speakers" | "mute" | "headphones"

function endpointIsHeadphones(ep: AstalWp.Endpoint): boolean {
  // Primary path on this host: HDMI of AOC G2790G4.
  if (endpointLooksLikeHdmiHeadphones(ep)) return true
  if (endpointLooksLikeMbSpeakers(ep)) return false
  // Fallback: USB/BT jack routes that advertise headphones.
  const r = ep.route
  return routeLooksLikeHeadphones(r?.name, r?.description)
}

function listSpeakers(wp: AstalWp.Wp): AstalWp.Endpoint[] {
  return wp.audio?.speakers ?? []
}

/** Motherboard lineout (this host: Ryzen ALC897 analog-stereo). */
function findSpeakerSink(wp: AstalWp.Wp): AstalWp.Endpoint | null {
  const all = listSpeakers(wp)
  return (
    all.find((s) => endpointLooksLikeMbSpeakers(s)) ??
    all.find((s) => !endpointIsHeadphones(s)) ??
    null
  )
}

/** HDMI headphones sink (this host: TU106 → G2790G4). */
function findHeadphoneSink(wp: AstalWp.Wp): AstalWp.Endpoint | null {
  return listSpeakers(wp).find((s) => endpointIsHeadphones(s)) ?? null
}

/** Classify from a live Endpoint — never from cached route accessors alone. */
function modeOfEndpoint(ep: AstalWp.Endpoint): OutputMode {
  if (ep.mute) return "mute"
  if (endpointIsHeadphones(ep)) return "headphones"
  return "speakers"
}

function currentOutputMode(wp: AstalWp.Wp): OutputMode {
  return modeOfEndpoint(wp.defaultSpeaker)
}

function iconFileForMode(mode: OutputMode): string {
  if (mode === "mute") return ICON_MUTED
  if (mode === "headphones") return ICON_HEADPHONES
  return ICON_SPEAKERS
}

function muteAllSinks(wp: AstalWp.Wp) {
  for (const s of listSpeakers(wp)) s.set_mute(true)
}

/**
 * Icon click cycle (fixed order):
 *   parlante → mute → auris → parlante
 */
function cycleOutputMode(wp: AstalWp.Wp) {
  const mode = currentOutputMode(wp)
  const hp = findHeadphoneSink(wp)
  const sp = findSpeakerSink(wp)

  if (mode === "speakers") {
    muteAllSinks(wp)
    return
  }
  if (mode === "mute") {
    // → headphones: default HDMI (AOC), only that sink live
    if (sp) sp.set_mute(true)
    if (hp) {
      hp.set_is_default(true)
      hp.set_mute(false)
    } else {
      wp.defaultSpeaker.set_mute(false)
    }
    return
  }
  // headphones → speakers (motherboard lineout)
  if (hp) hp.set_mute(true)
  if (sp) {
    sp.set_is_default(true)
    sp.set_mute(false)
  } else {
    wp.defaultSpeaker.set_mute(false)
  }
}

/**
 * Volume track: click / drag / scroll — no Gtk.Scale (broken hit-target on
 * layer-shell + GSK gl for us). Fill width mirrors WirePlumber volume.
 */
function VolumeTrack() {
  const wp = AstalWp.get_default()!
  const speaker = () => wp.defaultSpeaker
  const vol = createBinding(wp, "defaultSpeaker", "volume")

  const setFromX = (widget: Gtk.Widget, x: number) => {
    const w = widget.get_allocated_width() || TRACK_W
    const v = Math.max(0, Math.min(1, x / w))
    speaker().set_volume(v)
  }

  const bump = (delta: number) => {
    const s = speaker()
    s.set_volume(Math.max(0, Math.min(1, s.volume + delta)))
  }

  // Fill is a *child* — never rebind css/class on the gesture target itself
  // (that tears down controllers mid-click and feels "not clickable").
  const fillW = vol((v) =>
    Math.max(0, Math.round(Math.max(0, Math.min(1, v)) * TRACK_W)),
  )

  return (
    <box
      class="Volume-track"
      widthRequest={TRACK_W}
      heightRequest={16}
      valign={Gtk.Align.CENTER}
      tooltipText="Drag / click / scroll"
      $={(self) => {
        // Click-to-seek (left button)
        const click = new Gtk.GestureClick()
        click.set_button(1)
        click.connect("pressed", (_g, _n, x) => setFromX(self, x))
        self.add_controller(click)

        // Drag — GJS out-params come back as [ok, x, y]
        const drag = new Gtk.GestureDrag()
        drag.connect("drag-begin", (_g, x) => setFromX(self, x))
        drag.connect("drag-update", (g) => {
          const start = g.get_start_point() as unknown as
            | [boolean, number, number]
            | boolean
          const off = g.get_offset() as unknown as
            | [boolean, number, number]
            | boolean
          if (!Array.isArray(start) || !Array.isArray(off)) return
          const [, sx] = start
          const [, dx] = off
          setFromX(self, sx + dx)
        })
        self.add_controller(drag)

        // Scroll wheel
        const scroll = new Gtk.EventControllerScroll({
          flags:
            Gtk.EventControllerScrollFlags.VERTICAL |
            Gtk.EventControllerScrollFlags.DISCRETE,
        })
        scroll.connect("scroll", (_c, _dx, dy) => {
          // dy > 0 = scroll down = quieter
          bump(dy > 0 ? -0.05 : 0.05)
          return true
        })
        self.add_controller(scroll)
      }}
    >
      <box class="Volume-fill" widthRequest={fillW} hexpand={false} />
    </box>
  )
}

/** Volume: output icon (speakers / mute / headphones), track, ±. First control on the bar. */
function Volume() {
  const wp = AstalWp.get_default()!
  // Always resolve default sink (HDMI auris vs Ryzen MB parlantes).
  const speaker = () => wp.defaultSpeaker

  // Recompute when default sink identity / mute / description change.
  // Classification uses a *live* defaultSpeaker read (see modeOfEndpoint) —
  // nested route bindings were sticky after sink switches.
  const mute = createBinding(wp, "defaultSpeaker", "mute")
  const sinkId = createBinding(wp, "defaultSpeaker", "id")
  const sinkDesc = createBinding(wp, "defaultSpeaker", "description")
  // Light poll catches route jack changes without relying on nested accessors.
  const routePulse = createPoll(0, 250, () => {
    const s = AstalWp.get_default()?.defaultSpeaker
    const r = s?.route
    // cheap fingerprint
    return `${s?.id ?? 0}|${s?.mute ? 1 : 0}|${r?.name ?? ""}`.length
  })

  const outputIconFile = createComputed(() => {
    void mute()
    void sinkId()
    void sinkDesc()
    void routePulse()
    return iconFileForMode(modeOfEndpoint(wp.defaultSpeaker))
  })

  const iconTip = createComputed(() => {
    void mute()
    void sinkId()
    void routePulse()
    const mode = modeOfEndpoint(wp.defaultSpeaker)
    if (mode === "mute") return "Muted → headphones"
    if (mode === "headphones") return "Headphones → speakers"
    return "Speakers → mute"
  })

  const bump = (delta: number) => {
    const s = speaker()
    s.set_volume(Math.max(0, Math.min(1, s.volume + delta)))
  }

  return (
    <box
      class="Volume"
      spacing={1}
      tooltipText={sinkDesc((d) => d || "Volume")}
      $={(self) => {
        // Scroll anywhere on the volume group
        const scroll = new Gtk.EventControllerScroll({
          flags:
            Gtk.EventControllerScrollFlags.VERTICAL |
            Gtk.EventControllerScrollFlags.DISCRETE,
        })
        scroll.connect("scroll", (_c, _dx, dy) => {
          bump(dy > 0 ? -0.05 : 0.05)
          return true
        })
        self.add_controller(scroll)
      }}
    >
      <button
        class="Volume-mute"
        tooltipText={iconTip}
        onClicked={() => cycleOutputMode(wp)}
      >
        {/* file= bypasses icon themes — flat cream monochrome SVGs */}
        {/* 80% of original 20px (not an 80% reduction) */}
        <image file={outputIconFile} pixelSize={16} />
      </button>

      <button
        class="Volume-step"
        tooltipText="-5%"
        onClicked={() => bump(-0.05)}
      >
        <label label="−" />
      </button>

      <VolumeTrack />

      <button
        class="Volume-step"
        tooltipText="+5%"
        onClicked={() => bump(0.05)}
      >
        <label label="+" />
      </button>
    </box>
  )
}

// Capture cluster icons (cream monochrome, same pipeline as volume)
const ICON_SCREEN = `${ICON_DIR}/screen.svg` // video-display — screenshot
const ICON_RECORD = `${ICON_DIR}/record.svg` // camera-video — screen record

/**
 * Gap under the exclusive bar strip. Exclusive zone already reserves ~52px;
 * only a small extra margin is needed so the panel sits just below chrome.
 * (marginTop=52 was stacking → panel at y≈104.)
 */
const CAPTURE_GAP = 4

/** Shared so bar button + IPC (`ags request capture-toggle`) stay in sync. */
const [captureOpen, setCaptureOpen] = createState(false)

export function toggleCapture(): string {
  setCaptureOpen(!captureOpen.peek())
  return captureOpen.peek() ? "capture-open" : "capture-closed"
}

export function getCaptureOpen(): boolean {
  return captureOpen.peek()
}

/** Fixed 26×26 chip; image expands+centers so the glyph sits in the square. */
function CaptureIcon({ file }: { file: string }) {
  return (
    <box
      class="Capture-icon"
      widthRequest={26}
      heightRequest={26}
      hexpand={false}
      vexpand={false}
      halign={Gtk.Align.CENTER}
      valign={Gtk.Align.CENTER}
    >
      <image
        file={file}
        pixelSize={14}
        hexpand
        vexpand
        halign={Gtk.Align.CENTER}
        valign={Gtk.Align.CENTER}
      />
    </box>
  )
}

/**
 * Floating capture panel — separate layer-shell window (Gtk.Popover is flaky
 * on gtk4-layer-shell / NVIDIA+GSK). Anchored top-right, just below the bar.
 */
function CapturePanel(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT } = Astal.WindowAnchor
  // Hide with the bar (temp/hidden); do not leave a stray overlay.
  const panelVisible = createComputed(() => captureOpen() && barVisible())

  return (
    <window
      visible={panelVisible}
      name="capture"
      namespace="ags-capture"
      class="CapturePanel"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.NORMAL}
      anchor={TOP | RIGHT}
      layer={Astal.Layer.OVERLAY}
      marginTop={CAPTURE_GAP}
      marginRight={8}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
    >
      <box
        class="Capture-actions"
        orientation={Gtk.Orientation.VERTICAL}
        spacing={2}
        valign={Gtk.Align.CENTER}
        $={(self) =>
          attachMotion(
            self,
            () => setOverBar(true),
            () => setOverBar(false),
          )
        }
      >
        <button
          class="Capture-action"
          tooltipText="Capture screen (mock)"
          onClicked={() => {
            // mock — wire to hypr-screenshot later
            setCaptureOpen(false)
          }}
        >
          <box spacing={10} valign={Gtk.Align.CENTER}>
            <CaptureIcon file={ICON_SCREEN} />
            <label class="Capture-label" label="Capture screen" xalign={0} />
          </box>
        </button>
        <button
          class="Capture-action"
          tooltipText="Record screen (mock)"
          onClicked={() => {
            // mock — wire to recorder later
            setCaptureOpen(false)
          }}
        >
          <box spacing={10} valign={Gtk.Align.CENTER}>
            <CaptureIcon file={ICON_RECORD} />
            <label class="Capture-label" label="Record screen" xalign={0} />
          </box>
        </button>
      </box>
    </window>
  )
}

/**
 * Arrow left of clock. Closed: ▸. Click → ▾ and floating panel just below.
 */
function CaptureToggle({ gdkmonitor }: { gdkmonitor: Gdk.Monitor }) {
  const toggleClass = captureOpen((o) =>
    o ? "Capture Capture-toggle open" : "Capture Capture-toggle",
  )

  // Sibling top-level window (not nested under the bar surface).
  CapturePanel(gdkmonitor)

  return (
    <button
      class={toggleClass}
      tooltipText={captureOpen((o) =>
        o ? "Hide capture tools" : "Capture tools",
      )}
      onClicked={() => setCaptureOpen(!captureOpen.peek())}
    >
      <label label={captureOpen((o) => (o ? "▾" : "▸"))} />
    </button>
  )
}

// Caffeine icons — FSM lives in ./caffeine.ts (SSOT = process table).
const ICON_CAFFEINE_ON = `${ICON_DIR}/caffeine-on.svg`
const ICON_CAFFEINE_OFF = `${ICON_DIR}/caffeine-off.svg`

/**
 * One visual chip: HH:MM ☕
 * Shared chrome; left = calendar menubutton, right = caffeine toggle.
 * State/icon/class come from caffeine.ts projections — not a local bool.
 */
function ClockCaffeine({ timeFormat = "%H:%M" }) {
  const time = createPoll("", 1000, () =>
    GLib.DateTime.new_now_local().format(timeFormat)!,
  )
  const iconFile = caffeineUiOn((on) =>
    on ? ICON_CAFFEINE_ON : ICON_CAFFEINE_OFF,
  )

  return (
    <box class={caffeineShellClass} spacing={0} valign={Gtk.Align.CENTER}>
      <menubutton class="ClockCluster-time" tooltipText="Calendar">
        <label class="Clock-time" label={time} />
        <popover>
          <Gtk.Calendar />
        </popover>
      </menubutton>

      <button
        class="ClockCluster-cup"
        tooltipText={caffeineTooltip}
        onClicked={() => toggleCaffeine()}
      >
        <image file={iconFile} pixelSize={14} />
      </button>
    </box>
  )
}

function attachMotion(
  widget: Gtk.Widget,
  onEnter: () => void,
  onLeave: () => void,
) {
  const motion = new Gtk.EventControllerMotion()
  motion.connect("enter", onEnter)
  motion.connect("leave", onLeave)
  widget.add_controller(motion)
}

export default function Bar(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible={barVisible}
      name="bar"
      namespace="ags-bar"
      class={barModeClass}
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      layer={Astal.Layer.TOP}
      // Pointer only — ON_DEMAND can steal keys; NONE still receives clicks.
      keymode={Astal.Keymode.NONE}
      application={app}
      $={(self) =>
        attachMotion(
          self,
          () => setOverBar(true),
          () => setOverBar(false),
        )
      }
    >
      <centerbox cssName="centerbox">
        <box $type="start" spacing={8} class="Bar-start">
          <Volume />
        </box>
        <box $type="center" />
        <box $type="end" spacing={0} class="Bar-end">
          {/* Capture caret + panel — paused 2026-07-17 (cut here; re-enable later)
          <CaptureToggle gdkmonitor={gdkmonitor} />
          */}
          <DictationIndicator />
          <LocalLlm gdkmonitor={gdkmonitor} />
          <ClockCaffeine />
        </box>
      </centerbox>
    </window>
  )
}
