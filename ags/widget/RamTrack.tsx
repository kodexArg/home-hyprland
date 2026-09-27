import { Gtk } from "ags/gtk4"
import { createComputed } from "ags"
import {
  CELLS_PER_ROW,
  SCALE_CPU,
  SCALE_RAM,
  SCALE_VRAM,
  startRamTrack,
  trackCpuCells,
  trackCpuRatio,
  trackRamAvailGiB,
  trackRamCells,
  trackRamTotalGiB,
  trackRamUsedGiB,
  trackVramCells,
  trackVramTotalGiB,
  trackVramUsedGiB,
} from "./ram"

startRamTrack()

const CELL_IDX = [0, 1, 2, 3, 4] as const

type RowKey = "cpu" | "ram" | "vram"

function Row({
  rowKey,
  label,
  lit,
}: {
  rowKey: RowKey
  label: string
  lit: () => number
}) {
  return (
    <box
      class={`RamTrack-row row-${rowKey}`}
      orientation={Gtk.Orientation.HORIZONTAL}
      spacing={2}
      halign={Gtk.Align.END}
      valign={Gtk.Align.CENTER}
      hexpand={true}
      vexpand={false}
    >
      <label
        class="RamTrack-label"
        label={label}
        halign={Gtk.Align.END}
        valign={Gtk.Align.CENTER}
        hexpand={true}
      />
      <box
        orientation={Gtk.Orientation.HORIZONTAL}
        spacing={1}
        halign={Gtk.Align.END}
        hexpand={false}
        vexpand={false}
      >
        {CELL_IDX.map((i) => {
          const klass = createComputed(() => {
            const n = lit()
            if (i >= n) return "RamTrack-cell"
            return `RamTrack-cell on b${i}`
          })
          return <box class={klass} hexpand={false} vexpand={false} />
        })}
      </box>
    </box>
  )
}

export default function RamTrack() {
  const tip = createComputed(() => {
    const cu = trackCpuRatio()
    const cc = trackCpuCells()
    const vu = trackVramUsedGiB()
    const vt = trackVramTotalGiB()
    const vc = trackVramCells()
    const ru = trackRamUsedGiB()
    const ra = trackRamAvailGiB()
    const rt = trackRamTotalGiB()
    const rc = trackRamCells()
    const vf = Math.max(0, vt - vu)
    return (
      `CPU   ${(cu * 100).toFixed(0)}% · ${cc}/${CELLS_PER_ROW}\n` +
      `RAM   ${ru.toFixed(2)} / ${rt.toFixed(2)} GiB · free ${ra.toFixed(2)} · ${rc}/${CELLS_PER_ROW}\n` +
      `VRAM  ${vu.toFixed(2)} / ${vt.toFixed(2)} GiB · free ${vf.toFixed(2)} · ${vc}/${CELLS_PER_ROW}\n` +
      `0 cells = idle/empty · 5th cell (red) = warning before full\n` +
      `red warning: CPU ≥${Math.round(SCALE_CPU.redAt * 100)}% · RAM ≥${Math.round(SCALE_RAM.redAt * 100)}% · VRAM ≥${Math.round(SCALE_VRAM.redAt * 100)}%`
    )
  })

  return (
    <box
      class="RamTrack"
      halign={Gtk.Align.END}
      valign={Gtk.Align.CENTER}
      tooltipText={tip}
      orientation={Gtk.Orientation.VERTICAL}
      spacing={2}
      hexpand={false}
      vexpand={false}
    >
      <Row rowKey="cpu" label="CPU" lit={trackCpuCells} />
      <Row rowKey="ram" label="RAM" lit={trackRamCells} />
      <Row rowKey="vram" label="VRAM" lit={trackVramCells} />
    </box>
  )
}
