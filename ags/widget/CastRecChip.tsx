import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createComputed } from "ags"
import {
  castChipClass,
  castChipVisible,
  castElapsed,
  castTip,
  disarmCast,
  isRecording,
  toggleCastRecord,
} from "./cast"
import { isZoomDense } from "./zoom"

const ICON_REC_ON = `${GLib.get_user_config_dir()}/ags/icons/rec-on.svg`
const ICON_REC_IDLE = `${GLib.get_user_config_dir()}/ags/icons/rec.svg`

export default function CastRecChip() {
  const visible = createComputed(() => castChipVisible())
  const chipClass = createComputed(() => castChipClass())
  const iconFile = createComputed(() =>
    isRecording() ? ICON_REC_ON : ICON_REC_IDLE,
  )
  const tip = createComputed(() => castTip())
  const text = createComputed(() => {
    const el = castElapsed()
    return el ? `REC ${el}]` : "REC]"
  })

  return (
    <button
      class={chipClass}
      visible={visible}
      valign={Gtk.Align.CENTER}
      tooltipText={tip}
      onClicked={() => toggleCastRecord()}
      $={(self: Gtk.Button) => {
        const rightClick = new Gtk.GestureClick()
        rightClick.set_button(3)
        rightClick.connect("pressed", () => disarmCast())
        self.add_controller(rightClick)
      }}
    >
      <box spacing={0} valign={Gtk.Align.CENTER}>
        <label class="CastRecChip-bracket" label="[" />
        <image file={iconFile} pixelSize={isZoomDense() ? 6 : 9} class="CastRecChip-dot" />
        <label class="CastRecChip-text" label={text} />
      </box>
    </button>
  )
}
