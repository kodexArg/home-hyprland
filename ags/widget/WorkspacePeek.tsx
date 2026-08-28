import { Gtk } from "ags/gtk4"
import { createComputed, type Accessor } from "ags"
import { createPoll } from "ags/time"
import { exec } from "ags/process"

const LEFT = [1, 2, 3] as const
const RIGHT = [4, 5, 6] as const
const POLL_MS = 400
const SHORT = 12
const LONG = 20

type Phase = "idle" | "active"

function readActiveId(): number {
  try {
    const ws = JSON.parse(exec(["hyprctl", "activeworkspace", "-j"])) as {
      id?: number
    }
    return typeof ws.id === "number" ? ws.id : 0
  } catch {
    return 0
  }
}

function focusWorkspace(id: number) {
  try {
    exec(["hyprctl", "dispatch", "workspace", String(id)])
  } catch {
    /* ignore */
  }
}

function WsRect({
  id,
  rotate = false,
  activeId,
}: {
  id: number
  rotate?: boolean
  activeId: Accessor<number>
}) {
  const klass = createComputed(() => {
    const phase: Phase = activeId() === id ? "active" : "idle"
    return `WsRect${rotate ? " rot" : ""} ${phase}`
  })

  const w = rotate ? LONG : SHORT
  const h = rotate ? SHORT : LONG

  return (
    <button
      class={klass}
      tooltipText={`${id}`}
      onClicked={() => focusWorkspace(id)}
      hexpand={false}
      vexpand={false}
      halign={Gtk.Align.CENTER}
      valign={Gtk.Align.CENTER}
      widthRequest={w}
      heightRequest={h}
    />
  )
}

export default function WorkspacePeek() {
  const activeId = createPoll(0, POLL_MS, readActiveId)

  return (
    <box class="WsPeek" spacing={4} valign={Gtk.Align.CENTER} hexpand={false}>
      <box spacing={2} hexpand={false} valign={Gtk.Align.CENTER}>
        {LEFT.map((id) => (
          <WsRect id={id} activeId={activeId} />
        ))}
      </box>
      <box spacing={2} hexpand={false} valign={Gtk.Align.CENTER}>
        {RIGHT.map((id) => (
          <WsRect id={id} rotate activeId={activeId} />
        ))}
      </box>
    </box>
  )
}
