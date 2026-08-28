import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createComputed, createState } from "ags"
import { barVisible, setOverBar } from "./bar-mode"
import {
  L2TP_CONN,
  l2tpIconOn,
  l2tpLabel,
  l2tpRowClass,
  l2tpTip,
  toggleL2tp,
} from "./l2tp"
import {
  warpIconOn,
  warpLabel,
  warpRowClass,
  warpTip,
  toggleWarp,
} from "./warp"

import {
  castMic,
  castPopupOpen,
  castTargetLabel,
  fetchHyprlandPanels,
  HyprWindowPanel,
  setCastMic,
  setCastPopupOpen,
  setCastTarget,
} from "./cast"
import {
  micMuted,
  micName,
  refreshMic,
  startMicWatch,
  toggleMicMute,
} from "./mic"

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const ICON_MENU = `${ICON_DIR}/menu.svg`
const ICON_MIC = `${ICON_DIR}/mic.svg`
const ICON_MIC_MUTED = `${ICON_DIR}/mic-muted.svg`
const ICON_REBOOT = `${ICON_DIR}/reboot.svg`
const ICON_POWEROFF = `${ICON_DIR}/poweroff.svg`
const ICON_VPN = `${ICON_DIR}/vpn.svg`
const ICON_VPN_OFF = `${ICON_DIR}/vpn-off.svg`
const ICON_WARP = `${ICON_DIR}/warp.svg`
const ICON_WARP_OFF = `${ICON_DIR}/warp-off.svg`
const ICON_CAST = `${ICON_DIR}/cast.svg`
const ICON_TARGET = `${ICON_DIR}/target-set.svg`
const ICON_STREAM = `${ICON_DIR}/stream-signal.svg`
const ICON_REC_IDLE = `${ICON_DIR}/rec.svg`
const ICON_REC_ON = `${ICON_DIR}/rec-on.svg`
const ICON_SCREEN = `${ICON_DIR}/screen.svg`
const ICON_AREA = `${ICON_DIR}/area.svg`
const ICON_PANEL = `${ICON_DIR}/panel.svg`

/** Fixed label column width — keeps icon | text columns aligned across rows. */
const LABEL_W = 120
const PANEL_GAP = 4
/** Sandwich glyph 1.25× base 16px icons; hitbox stays 22×22. */
const MENU_ICON_PX = 20

type PowerAction = "reboot" | "poweroff"

const [menuOpen, setMenuOpen] = createState(false)
const [pending, setPending] = createState<PowerAction | null>(null)

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

function closeAll() {
  setPending(null)
  setMenuOpen(false)
}

function requestConfirm(action: PowerAction) {
  setPending(action)
}

function cancelConfirm() {
  setPending(null)
}

function runSystemctl(action: PowerAction) {
  closeAll()
  try {
    Gio.Subprocess.new(
      ["systemctl", action],
      Gio.SubprocessFlags.STDERR_SILENCE,
    )
  } catch (e) {
    printerr(`system-menu: systemctl ${action} failed: ${e}`)
  }
}

function SystemClickaway(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT, LEFT, BOTTOM } = Astal.WindowAnchor
  const visible = createComputed(() => menuOpen() && barVisible())

  return (
    <window
      visible={visible}
      name="system-menu-clickaway"
      namespace="ags-system-menu-clickaway"
      class="SystemClickaway"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.IGNORE}
      anchor={TOP | RIGHT | LEFT | BOTTOM}
      layer={Astal.Layer.TOP}
      keymode={Astal.Keymode.NONE}
      application={app}
      $={(self: Gtk.Window) => {
        const click = new Gtk.GestureClick()
        click.set_button(0)
        click.connect("pressed", () => closeAll())
        self.add_controller(click)
      }}
    >
      <box hexpand vexpand />
    </window>
  )
}

/** One row: [icon] [fixed-width text button]. Whole row is the hit target. */
function MenuRow({
  iconFile,
  label,
  tip,
  rowClass,
  onClicked,
}: {
  iconFile: string | ReturnType<typeof createComputed<string>>
  label: string | ReturnType<typeof createComputed<string>>
  tip: string | ReturnType<typeof createComputed<string>>
  rowClass: string | ReturnType<typeof createComputed<string>>
  onClicked: () => void
}) {
  return (
    <button class={rowClass} tooltipText={tip} onClicked={onClicked}>
      <box spacing={10} valign={Gtk.Align.CENTER} hexpand>
        <image file={iconFile} pixelSize={16} />
        <label
          class="SystemMenu-label"
          label={label}
          xalign={0}
          widthRequest={LABEL_W}
          hexpand={false}
        />
      </box>
    </button>
  )
}

function MicRow() {
  // SSOT = pactl (see widget/mic.ts). AstalWp defaultMicrophone is often a
  // stub when WirePlumber has no live default.audio.source.
  startMicWatch()

  const iconFile = createComputed(() =>
    micMuted() ? ICON_MIC_MUTED : ICON_MIC,
  )

  const label = createComputed(() =>
    micMuted() ? "Unmute mic" : "Mute mic",
  )

  const tip = createComputed(() => {
    const name = micName()
    return micMuted()
      ? `${name} muted — click to unmute`
      : `${name} live — click to mute`
  })

  const rowClass = createComputed(() =>
    micMuted() ? "SystemMenu-row muted" : "SystemMenu-row",
  )

  return (
    <MenuRow
      iconFile={iconFile}
      label={label}
      tip={tip}
      rowClass={rowClass}
      onClicked={() => toggleMicMute()}
    />
  )
}

/** Gabriel-L2TP — cream when up, grey when down; click toggles via nmcli. */
function VpnRow() {
  const iconFile = createComputed(() =>
    l2tpIconOn() ? ICON_VPN : ICON_VPN_OFF,
  )

  return (
    <MenuRow
      iconFile={iconFile}
      label={l2tpLabel}
      tip={l2tpTip}
      rowClass={l2tpRowClass}
      onClicked={() => toggleL2tp()}
    />
  )
}

/** Cloudflare WARP — cream when connected, grey when disconnected; click toggles via warp-cli. */
function WarpRow() {
  const iconFile = createComputed(() =>
    warpIconOn() ? ICON_WARP : ICON_WARP_OFF,
  )

  return (
    <MenuRow
      iconFile={iconFile}
      label={warpLabel}
      tip={warpTip}
      rowClass={warpRowClass}
      onClicked={() => toggleWarp()}
    />
  )
}

function ConfirmView() {
  const action = createComputed(() => pending())
  const isPoweroff = createComputed(() => action() === "poweroff")

  const title = createComputed(() =>
    isPoweroff() ? "Power off?" : "Restart?",
  )
  const body = createComputed(() =>
    isPoweroff()
      ? "Shut down this machine now."
      : "Reboot this machine now.",
  )
  const confirmLabel = createComputed(() =>
    isPoweroff() ? "Power off" : "Restart",
  )
  const confirmClass = createComputed(() =>
    isPoweroff()
      ? "SystemMenu-confirm-ok poweroff"
      : "SystemMenu-confirm-ok reboot",
  )
  const iconFile = createComputed(() =>
    isPoweroff() ? ICON_POWEROFF : ICON_REBOOT,
  )

  return (
    <box
      class="SystemMenu-confirm"
      orientation={Gtk.Orientation.VERTICAL}
      spacing={8}
    >
      <box spacing={10} valign={Gtk.Align.CENTER}>
        <image file={iconFile} pixelSize={18} />
        <label
          class="SystemMenu-confirm-title"
          label={title}
          xalign={0}
          hexpand
        />
      </box>

      <label
        class="SystemMenu-confirm-body"
        label={body}
        xalign={0}
        wrap
      />

      <box spacing={6} hexpand class="SystemMenu-confirm-actions">
        <button
          class="SystemMenu-confirm-cancel"
          tooltipText="Cancel — return to menu"
          hexpand
          onClicked={() => cancelConfirm()}
        >
          <label label="Cancel" />
        </button>
        <button
          class={confirmClass}
          tooltipText={createComputed(() =>
            isPoweroff() ? "Confirm systemctl poweroff" : "Confirm systemctl reboot",
          )}
          hexpand
          onClicked={() => {
            const a = pending.peek()
            if (a) runSystemctl(a)
          }}
        >
          <label label={confirmLabel} />
        </button>
      </box>
    </box>
  )
}

function pickTarget(
  t: "panel-left" | "panel-right" | "screen-region" | "screen-full" | "window-geom",
  opts?: { geom?: string; title?: string },
): void {
  setCastTarget(t, opts)
  setCastPopupOpen(false)
}

function rebuildPanelList(self: Gtk.Box): void {
  let child = self.get_first_child()
  while (child) {
    const next = child.get_next_sibling()
    self.remove(child)
    child = next
  }

  const list = fetchHyprlandPanels()
  // Physical: HDMI-A-2 ASUS LEFT, HDMI-A-1 AOC RIGHT
  const left = list.filter(
    (p) => p.monitorName.includes("HDMI-A-2") || p.monitorName.includes("ASUS"),
  )
  const right = list.filter(
    (p) => p.monitorName.includes("HDMI-A-1") || p.monitorName.includes("AOC"),
  )
  // Fallback if name map failed: use remaining by monitor id heuristic
  const used = new Set([...left, ...right].map((p) => p.address))
  const leftover = list.filter((p) => !used.has(p.address))
  // Prefer x coord: negative x → left
  for (const p of leftover) {
    if (p.at[0] < 0) left.push(p)
    else right.push(p)
  }

  if (left.length === 0 && right.length === 0) {
    self.append(
      new Gtk.Label({
        label: "No open window panels detected",
        xalign: 0.5,
        css_classes: ["CastPopup-sub-header"],
        visible: true,
      }),
    )
    return
  }

  const appendGroup = (heading: string, panels: HyprWindowPanel[]) => {
    if (panels.length === 0) return
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 4,
      hexpand: true,
      visible: true,
    })
    box.append(
      new Gtk.Label({
        label: heading,
        xalign: 0,
        css_classes: ["CastPopup-sub-header"],
        visible: true,
      }),
    )
    for (const p of panels) {
      const btn = new Gtk.Button({
        css_classes: ["CastPopup-panel-line"],
        tooltip_text: `Arm window target: ${p.title} — then click [*REC]`,
        visible: true,
        hexpand: true,
      })
      btn.set_child(
        new Gtk.Label({
          label: p.title.length > 42 ? `${p.title.slice(0, 40)}…` : p.title,
          xalign: 0,
          css_classes: ["CastPopup-panel-title"],
          visible: true,
          hexpand: true,
        }),
      )
      btn.connect("clicked", () =>
        pickTarget("window-geom", { geom: p.geom, title: p.title }),
      )
      box.append(btn)
    }
    self.append(box)
  }

  appendGroup("ASUS (Left · HDMI-A-2)", left)
  appendGroup("AOC (Right · HDMI-A-1)", right)
}

function CastPopupModal(gdkmonitor: Gdk.Monitor) {
  const visible = createComputed(() => castPopupOpen() && barVisible())
  const targetHint = createComputed(() => {
    const label = castTargetLabel()
    return label === "No target" ? "Pick a target — [*REC] appears gray on the bar" : `Armed: ${label}`
  })

  return (
    <window
      visible={visible}
      name="cast-popup-modal"
      namespace="ags-cast-popup-modal"
      class="CastPopupModal"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.IGNORE}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
      $={(self: Gtk.Window) => {
        const key = new Gtk.EventControllerKey()
        key.connect("key-pressed", (_c, keyval) => {
          if (keyval === Gdk.KEY_Escape) {
            setCastPopupOpen(false)
            return true
          }
          return false
        })
        self.add_controller(key)
      }}
    >
      <box
        class="CastPopup-overlay"
        hexpand
        vexpand
        valign={Gtk.Align.CENTER}
        halign={Gtk.Align.CENTER}
      >
        <box
          class="CastPopup-card"
          orientation={Gtk.Orientation.VERTICAL}
          spacing={12}
          valign={Gtk.Align.CENTER}
          halign={Gtk.Align.CENTER}
        >
          <label class="CastPopup-title" label="Cast & Screen Capture" />
          <label class="CastPopup-sub-header" label={targetHint} />

          {/* Section 1: Screen (whole outputs) */}
          <box orientation={Gtk.Orientation.VERTICAL} spacing={6} halign={Gtk.Align.CENTER}>
            <box spacing={6} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER}>
              <image file={ICON_SCREEN} pixelSize={14} />
              <label class="CastPopup-section-label" label="Screen" />
            </box>
            <box spacing={6} halign={Gtk.Align.CENTER}>
              <button
                class="CastPopup-opt"
                tooltipText="Arm LEFT screen — ASUS VA27EHF (HDMI-A-2). Click [*REC] to start."
                onClicked={() => pickTarget("panel-left")}
              >
                <label label="Left (ASUS)" />
              </button>
              <button
                class="CastPopup-opt"
                tooltipText="Arm RIGHT screen — AOC G2790G4 (HDMI-A-1). Click [*REC] to start."
                onClicked={() => pickTarget("panel-right")}
              >
                <label label="Right (AOC)" />
              </button>
              <button
                class="CastPopup-opt"
                tooltipText="Arm both displays (one video). Click [*REC] to start."
                onClicked={() => pickTarget("screen-full")}
              >
                <label label="All" />
              </button>
            </box>
          </box>

          {/* Audio: mic mixed into the mp4 (desktop stays). Default ON. */}
          <box orientation={Gtk.Orientation.VERTICAL} spacing={6} halign={Gtk.Align.CENTER}>
            <box spacing={6} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER}>
              <image file={ICON_MIC} pixelSize={14} />
              <label class="CastPopup-section-label" label="Audio" />
            </box>
            <box spacing={6} halign={Gtk.Align.CENTER}>
              <button
                class={createComputed(() =>
                  castMic() ? "CastPopup-opt active" : "CastPopup-opt",
                )}
                tooltipText={createComputed(() =>
                  castMic()
                    ? "Voice ON — Brio + desktop mixed into the mp4. Click to drop the mic."
                    : "Voice OFF — desktop audio only. Click to add Brio.",
                )}
                onClicked={() => setCastMic(!castMic.peek())}
              >
                <label
                  label={createComputed(() =>
                    castMic() ? "Mic ON (voice + desktop)" : "Mic OFF (desktop only)",
                  )}
                />
              </button>
            </box>
          </box>

          {/* Section 2: Area */}
          <box orientation={Gtk.Orientation.VERTICAL} spacing={6} halign={Gtk.Align.CENTER}>
            <box spacing={6} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER}>
              <image file={ICON_AREA} pixelSize={14} />
              <label class="CastPopup-section-label" label="Area" />
            </box>
            <box spacing={6} halign={Gtk.Align.CENTER}>
              <button
                class="CastPopup-opt"
                tooltipText="Arm region capture — [*REC] opens slurp, then records."
                onClicked={() => pickTarget("screen-region")}
              >
                <label label="Select Area" />
              </button>
            </box>
          </box>

          {/* Section 3: Window panels */}
          <box orientation={Gtk.Orientation.VERTICAL} spacing={6} halign={Gtk.Align.FILL} hexpand>
            <box spacing={6} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER}>
              <image file={ICON_PANEL} pixelSize={14} />
              <label class="CastPopup-section-label" label="Panel" />
            </box>

            <box
              orientation={Gtk.Orientation.VERTICAL}
              spacing={8}
              class="CastPopup-panel-list"
              hexpand
              halign={Gtk.Align.FILL}
              $={(self: Gtk.Box) => {
                const refresh = () => {
                  if (!castPopupOpen.peek()) return
                  rebuildPanelList(self)
                }
                // Immediate if already open when $ mounts; every open thereafter
                if (castPopupOpen.peek()) refresh()
                castPopupOpen.subscribe((isOpen) => {
                  if (isOpen) refresh()
                })
              }}
            />
          </box>

          <button
            class="CastPopup-close"
            onClicked={() => setCastPopupOpen(false)}
          >
            <label label="Close" />
          </button>
        </box>
      </box>
    </window>
  )
}

function CastRow() {
  return (
    <MenuRow
      iconFile={ICON_CAST}
      label="Cast"
      tip="Cast & Screen Capture — click to select target & record"
      rowClass="SystemMenu-row"
      onClicked={() => {
        closeAll()
        setCastPopupOpen(true)
      }}
    />
  )
}

function MenuList() {
  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={2}>
      <label
        class="SystemMenu-status"
        label="SYSTEM"
        xalign={0}
        tooltipText={`${L2TP_CONN} · WARP · Mic · Cast · Restart · Power off · outside/Esc closes`}
      />

      <box class="SystemMenu-sep" heightRequest={1} hexpand />

      <VpnRow />
      <WarpRow />
      <MicRow />
      <CastRow />

      <box class="SystemMenu-sep" heightRequest={1} hexpand />

      {/* Bottom: restart | poweroff — icon only, side by side */}
      <box
        class="SystemMenu-power"
        spacing={6}
        halign={Gtk.Align.CENTER}
        hexpand
      >
        <button
          class="SystemMenu-power-btn reboot"
          tooltipText="Restart — asks for confirmation"
          onClicked={() => requestConfirm("reboot")}
        >
          <image file={ICON_REBOOT} pixelSize={18} />
        </button>
        <button
          class="SystemMenu-power-btn poweroff"
          tooltipText="Power off — asks for confirmation"
          onClicked={() => requestConfirm("poweroff")}
        >
          <image file={ICON_POWEROFF} pixelSize={18} />
        </button>
      </box>
    </box>
  )
}

function SystemPanel(gdkmonitor: Gdk.Monitor) {
  const { TOP, RIGHT } = Astal.WindowAnchor
  const panelVisible = createComputed(() => menuOpen() && barVisible())
  const bodyClass = createComputed(() =>
    pending() ? "SystemMenu-menu confirming" : "SystemMenu-menu",
  )

  SystemClickaway(gdkmonitor)

  return (
    <window
      visible={panelVisible}
      name="system-menu"
      namespace="ags-system-menu"
      class="SystemPanel"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.NORMAL}
      anchor={TOP | RIGHT}
      layer={Astal.Layer.OVERLAY}
      marginTop={PANEL_GAP}
      marginRight={8}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
      $={(self: Gtk.Window) => {
        const key = new Gtk.EventControllerKey()
        key.connect("key-pressed", (_c, keyval) => {
          if (keyval === Gdk.KEY_Escape) {
            if (pending.peek()) cancelConfirm()
            else closeAll()
            return true
          }
          return false
        })
        self.add_controller(key)
      }}
    >
      <box
        class={bodyClass}
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
        {/* Both views stay mounted; CSS/visible toggles which is shown */}
        <box
          visible={createComputed(() => !pending())}
          orientation={Gtk.Orientation.VERTICAL}
        >
          <MenuList />
        </box>
        <box
          visible={createComputed(() => !!pending())}
          orientation={Gtk.Orientation.VERTICAL}
        >
          <ConfirmView />
        </box>
      </box>
    </window>
  )
}

export default function SystemMenu({
  gdkmonitor,
}: {
  gdkmonitor: Gdk.Monitor
}) {
  SystemPanel(gdkmonitor)
  CastPopupModal(gdkmonitor)

  const cls = createComputed(() => {
    const parts = ["SystemMenu"]
    if (menuOpen()) parts.push("open")
    return parts.join(" ")
  })

  const tip = createComputed(() => {
    if (pending()) {
      return pending() === "poweroff"
        ? "Confirm power off — or Esc to cancel"
        : "Confirm restart — or Esc to cancel"
    }
    return menuOpen()
      ? "System menu open — click to close"
      : "System menu — L2TP · mic · restart · power off"
  })

  return (
    <button
      class={cls}
      tooltipText={tip}
      onClicked={() => {
        if (menuOpen.peek()) closeAll()
        else {
          setPending(null)
          refreshMic()
          setMenuOpen(true)
        }
      }}
    >
      <image file={ICON_MENU} pixelSize={MENU_ICON_PX} />
    </button>
  )
}

export function getSystemMenuOpen(): boolean {
  return menuOpen.peek()
}

export function toggleSystemMenu(): string {
  if (menuOpen.peek()) {
    closeAll()
    return "system-menu-closed"
  }
  setPending(null)
  setMenuOpen(true)
  return "system-menu-open"
}
