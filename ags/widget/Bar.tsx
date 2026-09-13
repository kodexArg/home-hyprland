import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import AstalWp from "gi://AstalWp"
import GLib from "gi://GLib"
import { createBinding, createComputed, createState } from "ags"
import { createPoll } from "ags/time"
import { barModeClass, barVisible, setOverBar } from "./bar-mode"
import RamTrack from "./RamTrack"
import SystemMenu from "./SystemMenu"
import WorkspacePeek from "./WorkspacePeek"
import LiveIndicator from "./LiveIndicator"
import KodexbotChip from "./KodexbotChip"
import RecModeIndicator from "./RecModeIndicator"
import CastRecChip from "./CastRecChip"
import MicIndicator from "./MicIndicator"
import GameVolume from "./GameVolume"
import { ensureGameStreamsFollowDefault } from "./game-audio"

const TRACK_W = 140

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const ICON_SPEAKERS = `${ICON_DIR}/speakers.svg`
const ICON_MUTED = `${ICON_DIR}/muted.svg`
const ICON_HEADPHONES = `${ICON_DIR}/headphones.svg`
const ICON_BLUETOOTH = `${ICON_DIR}/bluetooth.svg`

const OUTPUT_PENDING_MS = 2000

function isVirtualEndpoint(ep: AstalWp.Endpoint): boolean {
  const d = `${ep.description ?? ""} ${ep.name ?? ""}`.toLowerCase()
  return (
    d.includes("easy effects") ||
    d.includes("easyeffects") ||
    d.includes("echo-cancel")
  )
}

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

function endpointLooksLikeHdmiHeadphones(ep: AstalWp.Endpoint): boolean {
  if (isVirtualEndpoint(ep)) return false
  const d = `${ep.description ?? ""} ${ep.name ?? ""}`.toLowerCase()
  return (
    d.includes("auricular") ||
    d.includes("headphone") ||
    d.includes("headset") ||
    d.includes("g2790g4") ||
    d.includes("aoc") ||
    d.includes("tu106") ||
    (d.includes("hdmi") && !d.includes("asus"))
  )
}

function endpointLooksLikeMbSpeakers(ep: AstalWp.Endpoint): boolean {
  if (isVirtualEndpoint(ep)) return false
  if (endpointLooksLikeHdmiHeadphones(ep)) return false
  const d = `${ep.description ?? ""} ${ep.name ?? ""}`.toLowerCase()
  return (
    d.includes("parlante") ||
    d.includes("motherboard") ||
    d.includes("analog") ||
    d.includes("ryzen") ||
    d.includes("alc897") ||
    d.includes("lineout") ||
    d.includes("line-out") ||
    d.includes("family 17h") ||
    d.includes("starship")
  )
}

type OutputMode = "speakers" | "mute" | "headphones" | "bluetooth"

function endpointLooksLikeBluetooth(ep: AstalWp.Endpoint): boolean {
  if (isVirtualEndpoint(ep)) return false
  const d = `${ep.description ?? ""} ${ep.name ?? ""}`.toLowerCase()
  return (
    d.includes("bluez") ||
    d.includes("bluetooth") ||
    d.includes("jbl") ||
    d.includes("bluetooth_output")
  )
}

function endpointIsHeadphones(ep: AstalWp.Endpoint): boolean {
  if (isVirtualEndpoint(ep)) return false
  if (endpointLooksLikeBluetooth(ep)) return false
  if (endpointLooksLikeHdmiHeadphones(ep)) return true
  if (endpointLooksLikeMbSpeakers(ep)) return false
  const r = ep.route
  return routeLooksLikeHeadphones(r?.name, r?.description)
}

function listSpeakers(wp: AstalWp.Wp): AstalWp.Endpoint[] {
  return (wp.audio?.speakers ?? []).filter((s) => !isVirtualEndpoint(s))
}

function findSpeakerSink(wp: AstalWp.Wp): AstalWp.Endpoint | null {
  const all = listSpeakers(wp)
  return (
    all.find(
      (s) => endpointLooksLikeMbSpeakers(s) && !endpointLooksLikeBluetooth(s),
    ) ??
    all.find(
      (s) => !endpointIsHeadphones(s) && !endpointLooksLikeBluetooth(s),
    ) ??
    null
  )
}

function findHeadphoneSink(wp: AstalWp.Wp): AstalWp.Endpoint | null {
  const all = listSpeakers(wp)
  return (
    all.find(
      (s) =>
        endpointLooksLikeHdmiHeadphones(s) && !endpointLooksLikeBluetooth(s),
    ) ??
    all.find((s) => endpointIsHeadphones(s)) ??
    null
  )
}

function findBluetoothSink(wp: AstalWp.Wp): AstalWp.Endpoint | null {
  const all = listSpeakers(wp)
  return all.find((s) => endpointLooksLikeBluetooth(s)) ?? null
}

function modeOfEndpoint(ep: AstalWp.Endpoint): OutputMode {
  if (!ep || ep.mute) return "mute"
  if (endpointLooksLikeBluetooth(ep)) return "bluetooth"
  if (endpointIsHeadphones(ep)) return "headphones"
  return "speakers"
}

function currentOutputMode(wp: AstalWp.Wp): OutputMode {
  const def = wp.defaultSpeaker
  if (!def) return "speakers"
  if (def.mute) return "mute"
  if (isVirtualEndpoint(def)) {
    const bt = findBluetoothSink(wp)
    const sp = findSpeakerSink(wp)
    const hp = findHeadphoneSink(wp)
    if (bt && !bt.mute) return "bluetooth"
    if (hp && !hp.mute) return "headphones"
    if (sp && !sp.mute) return "speakers"
    return "mute"
  }
  return modeOfEndpoint(def)
}

function outputModeOrder(wp: AstalWp.Wp): OutputMode[] {
  const order: OutputMode[] = ["speakers", "mute", "headphones"]
  if (findBluetoothSink(wp)) order.push("bluetooth")
  return order
}

function nextOutputMode(wp: AstalWp.Wp, from: OutputMode): OutputMode {
  const order = outputModeOrder(wp)
  const i = order.indexOf(from)
  const idx = i < 0 ? 0 : (i + 1) % order.length
  return order[idx]!
}

function iconFileForMode(mode: OutputMode): string {
  if (mode === "mute") return ICON_MUTED
  if (mode === "headphones") return ICON_HEADPHONES
  if (mode === "bluetooth") return ICON_BLUETOOTH
  return ICON_SPEAKERS
}

function tipForMode(mode: OutputMode, wp: AstalWp.Wp): string {
  const nxt = nextOutputMode(wp, mode)
  const label: Record<OutputMode, string> = {
    speakers: "Parlantes",
    mute: "Silencio",
    headphones: "Auriculares",
    bluetooth: "Bluetooth",
  }
  return `${label[mode]} → ${label[nxt]}`
}

function unmuteVirtual(wp: AstalWp.Wp) {
  for (const s of wp.audio?.speakers ?? []) {
    if (isVirtualEndpoint(s)) s.set_mute(false)
  }
}

function muteEndpoint(ep: AstalWp.Endpoint | null) {
  if (ep) ep.set_mute(true)
}

function applyOutputMode(wp: AstalWp.Wp, mode: OutputMode) {
  const hp = findHeadphoneSink(wp)
  const sp = findSpeakerSink(wp)
  const bt = findBluetoothSink(wp)

  if (mode === "mute") {
    muteEndpoint(sp)
    muteEndpoint(hp)
    muteEndpoint(bt)
    ensureGameStreamsFollowDefault()
    return
  }

  if (mode === "headphones") {
    muteEndpoint(sp)
    muteEndpoint(bt)
    if (hp) {
      hp.set_is_default(true)
      hp.set_mute(false)
    } else {
      wp.defaultSpeaker?.set_mute(false)
    }
    unmuteVirtual(wp)
    ensureGameStreamsFollowDefault()
    return
  }

  if (mode === "bluetooth") {
    muteEndpoint(sp)
    muteEndpoint(hp)
    if (bt) {
      bt.set_is_default(true)
      bt.set_mute(false)
    } else {
      applyOutputMode(wp, "speakers")
      return
    }
    unmuteVirtual(wp)
    ensureGameStreamsFollowDefault()
    return
  }

  muteEndpoint(hp)
  muteEndpoint(bt)
  if (sp) {
    sp.set_is_default(true)
    sp.set_mute(false)
  } else {
    wp.defaultSpeaker?.set_mute(false)
  }
  unmuteVirtual(wp)
  ensureGameStreamsFollowDefault()
}

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
        const click = new Gtk.GestureClick()
        click.set_button(1)
        click.connect("pressed", (_g, _n, x) => setFromX(self, x))
        self.add_controller(click)

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
      <box class="Volume-fill" widthRequest={fillW} hexpand={false} />
    </box>
  )
}

function Volume() {
  const wp = AstalWp.get_default()!
  const speaker = () => wp.defaultSpeaker

  const mute = createBinding(wp, "defaultSpeaker", "mute")
  const sinkId = createBinding(wp, "defaultSpeaker", "id")
  const sinkDesc = createBinding(wp, "defaultSpeaker", "description")
  const routePulse = createPoll(0, 1000, () => {
    const w = AstalWp.get_default()
    const s = w?.defaultSpeaker
    const r = s?.route
    const sp = w ? findSpeakerSink(w) : null
    const hp = w ? findHeadphoneSink(w) : null
    const bt = w ? findBluetoothSink(w) : null
    return `${s?.id ?? 0}|${s?.mute ? 1 : 0}|${sp?.mute ? 1 : 0}|${hp?.mute ? 1 : 0}|${bt?.mute ? 1 : 0}|${bt?.id ?? 0}|${r?.name ?? ""}`.length
  })

  const [pendingMode, setPendingMode] = createState<OutputMode | null>(null)
  const [applyingMode, setApplyingMode] = createState<OutputMode | null>(null)
  let settleSource: number | null = null
  let applyPollSource: number | null = null

  function clearSettleTimer() {
    if (settleSource !== null) {
      GLib.source_remove(settleSource)
      settleSource = null
    }
  }

  function clearApplyPoll() {
    if (applyPollSource !== null) {
      GLib.source_remove(applyPollSource)
      applyPollSource = null
    }
  }

  function finishApplying() {
    clearApplyPoll()
    setApplyingMode(null)
  }

  function watchApply(want: OutputMode) {
    clearApplyPoll()
    const started = GLib.get_monotonic_time()
    const budgetUs = 2_000_000
    applyPollSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
      const cur = currentOutputMode(wp)
      const elapsed = GLib.get_monotonic_time() - started
      if (cur === want || elapsed >= budgetUs) {
        applyPollSource = null
        setApplyingMode(null)
        return GLib.SOURCE_REMOVE
      }
      return GLib.SOURCE_CONTINUE
    })
  }

  function armSettleTimer() {
    clearSettleTimer()
    settleSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, OUTPUT_PENDING_MS, () => {
      settleSource = null
      const want = pendingMode.peek()
      setPendingMode(null)
      if (want === null) return GLib.SOURCE_REMOVE
      const cur = currentOutputMode(wp)
      if (want === cur) {
        setApplyingMode(null)
        return GLib.SOURCE_REMOVE
      }
      setApplyingMode(want)
      applyOutputMode(wp, want)
      watchApply(want)
      return GLib.SOURCE_REMOVE
    })
  }

  function onOutputIconClick() {
    clearApplyPoll()
    setApplyingMode(null)
    const shown =
      pendingMode.peek() ?? applyingMode.peek() ?? currentOutputMode(wp)
    const next = nextOutputMode(wp, shown)
    setPendingMode(next)
    armSettleTimer()
  }

  const displayMode = createComputed(() => {
    void mute()
    void sinkId()
    void sinkDesc()
    void routePulse()
    void pendingMode()
    void applyingMode()
    return pendingMode() ?? applyingMode() ?? currentOutputMode(wp)
  })

  const outputIconFile = createComputed(() => iconFileForMode(displayMode()))

  const iconTip = createComputed(() => {
    void mute()
    void sinkId()
    void routePulse()
    void pendingMode()
    void applyingMode()
    const mode = displayMode()
    const base = tipForMode(mode, wp)
    if (pendingMode() !== null) return `${base} · preview (2s)`
    if (applyingMode() !== null) return `${base} · aplicando…`
    return base
  })

  const muteBtnClass = createComputed(() => {
    void pendingMode()
    void applyingMode()
    if (pendingMode() !== null) return "Volume-mute pending"
    if (applyingMode() !== null) return "Volume-mute applying"
    return "Volume-mute"
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
        class={muteBtnClass}
        tooltipText={iconTip}
        onClicked={() => onOutputIconClick()}
      >
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

function Clock({ timeFormat = "%H:%M" }) {
  const time = createPoll("", 1000, () =>
    GLib.DateTime.new_now_local().format(timeFormat)!,
  )

  return (
    <menubutton class="Clock" tooltipText="Calendar" valign={Gtk.Align.CENTER}>
      <label class="Clock-time" label={time} />
      <popover>
        <Gtk.Calendar />
      </popover>
    </menubutton>
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
          <GameVolume />
        </box>
        <box $type="center">
          <WorkspacePeek />
        </box>
        <box $type="end" spacing={10} class="Bar-end">
          <KodexbotChip />
          <RecModeIndicator />
          <CastRecChip />
          <box spacing={2} class="BrainCluster" valign={Gtk.Align.CENTER}>
            <MicIndicator gdkmonitor={gdkmonitor} />
          </box>
          <RamTrack />
          <Clock />
          <SystemMenu gdkmonitor={gdkmonitor} />
        </box>
      </centerbox>
    </window>
  )
}
