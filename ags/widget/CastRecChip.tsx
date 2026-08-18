import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { createComputed } from "ags"
import {
  castChipClass,
  castChipVisible,
  castTip,
  isRecording,
  toggleCastRecord,
} from "./cast"

const ICON_REC_ON = `${GLib.get_user_config_dir()}/ags/icons/rec-on.svg`
const ICON_REC_IDLE = `${GLib.get_user_config_dir()}/ags/icons/rec.svg`

export default function CastRecChip() {
  const visible = createComputed(() => castChipVisible())
  const chipClass = createComputed(() => castChipClass())
  const iconFile = createComputed(() =>
    isRecording() ? ICON_REC_ON : ICON_REC_IDLE,
  )
  const tip = createComputed(() => castTip())

  return (
    <button
      class={chipClass}
      visible={visible}
      valign={Gtk.Align.CENTER}
      tooltipText={tip}
      onClicked={() => toggleCastRecord()}
    >
      <box spacing={0} valign={Gtk.Align.CENTER}>
        <label class="CastRecChip-bracket" label="[" />
        <image file={iconFile} pixelSize={9} class="CastRecChip-dot" />
        <label class="CastRecChip-text" label="REC]" />
      </box>
    </button>
  )
}
