/**
 * Memory track — left of LocalLlm brain.
 *
 * KISS 5×3 grid (rows top→bottom):
 *   VRAM · RAM · SWAP labels (very light cream / brain color)
 *   + 5 cells fill L→R by used/total
 * cell gap 1px · row gap 2px · cell 6px
 * Color bands (first two green): b0–b1 green · b2 yellow · b3 orange · b4 red
 * Fill: 0 cells below floor; red (5) at redAt < 100% — see SCALE_* in ram.ts.
 * Logic: ./ram.ts only. This file is pure projection.
 */
import { Gtk } from "ags/gtk4"
import { createComputed } from "ags"
import {
  CELLS_PER_ROW,
  SCALE_RAM,
  SCALE_SWAP,
  SCALE_VRAM,
  startRamTrack,
  trackRamAvailGiB,
  trackRamCells,
  trackRamTotalGiB,
  trackRamUsedGiB,
  trackSwapCells,
  trackSwapTotalGiB,
  trackSwapUsedGiB,
  trackVramCells,
  trackVramTotalGiB,
  trackVramUsedGiB,
} from "./ram"

startRamTrack()

const CELL_IDX = [0, 1, 2, 3, 4] as const

type RowKey = "vram" | "ram" | "swap"

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
        xalign={1}
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
    const vu = trackVramUsedGiB()
    const vt = trackVramTotalGiB()
    const vc = trackVramCells()
    const ru = trackRamUsedGiB()
    const ra = trackRamAvailGiB()
    const rt = trackRamTotalGiB()
    const rc = trackRamCells()
    const su = trackSwapUsedGiB()
    const st = trackSwapTotalGiB()
    const sc = trackSwapCells()
    return (
      `VRAM ${vu.toFixed(2)} / ${vt.toFixed(2)} GiB · ${vc}/${CELLS_PER_ROW} · empty <${Math.round(SCALE_VRAM.floor * 100)}% · red ≥${Math.round(SCALE_VRAM.redAt * 100)}%\n` +
      `RAM  ${ru.toFixed(2)} / ${rt.toFixed(2)} GiB · avail ${ra.toFixed(2)} · ${rc}/${CELLS_PER_ROW} · empty <${Math.round(SCALE_RAM.floor * 100)}% · red ≥${Math.round(SCALE_RAM.redAt * 100)}%\n` +
      `SWAP ${su.toFixed(2)} / ${st.toFixed(2)} GiB · ${sc}/${CELLS_PER_ROW} · empty <${Math.round(SCALE_SWAP.floor * 100)}% · red ≥${Math.round(SCALE_SWAP.redAt * 100)}%\n` +
      `rows VRAM · RAM · SWAP · 0 gray → red warning before full`
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
      <Row rowKey="vram" label="VRAM" lit={trackVramCells} />
      <Row rowKey="ram" label="RAM" lit={trackRamCells} />
      <Row rowKey="swap" label="SWAP" lit={trackSwapCells} />
    </box>
  )
}
