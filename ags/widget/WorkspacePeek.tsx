import { Gtk } from "ags/gtk4"
import { createComputed, For, type Accessor } from "ags"
import { createPoll } from "ags/time"
import { exec, execAsync } from "ags/process"

const POLL_MS = 500
const SHORT = 12
const LONG = 20

type Phase = "empty" | "occupied"

type WinBox = {
  x: number
  y: number
  w: number
  h: number
}

type Screen = {
  name: string
  shown: number
  workspaces: number[]
  landscape: boolean
  wins: Record<number, WinBox[]>
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function readScreens(): Screen[] {
  try {
    const monitors = JSON.parse(exec(["hyprctl", "monitors", "-j"])) as Array<{
      id: number
      name: string
      x: number
      y: number
      width: number
      height: number
      transform?: number
      scale?: number
      activeWorkspace?: { id?: number }
    }>
    const workspaces = JSON.parse(
      exec(["hyprctl", "workspaces", "-j"]),
    ) as Array<{
      id: number
      monitor?: string
    }>
    const clients = JSON.parse(exec(["hyprctl", "clients", "-j"])) as Array<{
      mapped?: boolean
      hidden?: boolean
      at?: [number, number]
      size?: [number, number]
      workspace?: { id: number }
      monitor?: number
    }>

    const idsByMonitor = new Map<string, number[]>()
    for (const ws of workspaces) {
      if (ws.id < 1) continue
      const list = idsByMonitor.get(ws.monitor ?? "") ?? []
      list.push(ws.id)
      idsByMonitor.set(ws.monitor ?? "", list)
    }

    const geo = new Map<
      number,
      { x: number; y: number; w: number; h: number }
    >()
    for (const mon of monitors) {
      const t = mon.transform ?? 0
      const portrait = t === 1 || t === 3 || t === 5 || t === 7
      const scale = mon.scale || 1
      geo.set(mon.id, {
        x: mon.x,
        y: mon.y,
        w: (portrait ? mon.height : mon.width) / scale,
        h: (portrait ? mon.width : mon.height) / scale,
      })
    }

    const winsByMonWs = new Map<string, WinBox[]>()
    for (const c of clients) {
      if (c.mapped === false || c.hidden) continue
      const wsId = c.workspace?.id
      if (wsId == null || wsId < 1) continue
      const g = geo.get(c.monitor ?? -1)
      if (!g || g.w <= 1 || g.h <= 1) continue
      const [ax, ay] = c.at ?? [0, 0]
      const [sw, sh] = c.size ?? [0, 0]
      const rw = clamp01(sw / g.w)
      const rh = clamp01(sh / g.h)
      if (rw < 0.02 || rh < 0.02) continue
      const key = `${c.monitor ?? -1}:${wsId}`
      const list = winsByMonWs.get(key) ?? []
      list.push({
        x: clamp01((ax - g.x) / g.w),
        y: clamp01((ay - g.y) / g.h),
        w: rw,
        h: rh,
      })
      winsByMonWs.set(key, list)
    }

    return [...monitors]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map((mon) => {
        const t = mon.transform ?? 0
        const portrait = t === 1 || t === 3 || t === 5 || t === 7
        const workspacesOnMon = (idsByMonitor.get(mon.name) ?? []).sort(
          (a, b) => a - b,
        )
        const wins: Record<number, WinBox[]> = {}
        for (const wsId of workspacesOnMon) {
          wins[wsId] = winsByMonWs.get(`${mon.id}:${wsId}`) ?? []
        }
        return {
          name: mon.name,
          shown: mon.activeWorkspace?.id ?? 0,
          workspaces: workspacesOnMon,
          landscape: !portrait,
          wins,
        }
      })
      .filter((screen) => screen.workspaces.length > 0)
  } catch {
    return []
  }
}

function switchTo(id: number) {
  execAsync([
    "hyprctl",
    "eval",
    `hl.dispatch(hl.dsp.focus({ workspace = ${id} }))`,
  ]).catch(() => undefined)
}

function WsRect({
  id,
  rotate = false,
  wins,
  onScreen,
}: {
  id: number
  rotate?: boolean
  wins: Accessor<WinBox[]>
  onScreen: Accessor<boolean>
}) {
  const klass = createComputed(() => {
    const phase: Phase = wins().length > 0 ? "occupied" : "empty"
    return `WsRect${rotate ? " rot" : ""} ${phase}`
  })
  const underKlass = createComputed(() =>
    onScreen() ? "WsRect-under on" : "WsRect-under",
  )

  const tw = rotate ? LONG : SHORT
  const th = rotate ? SHORT : LONG

  return (
    <box
      orientation={Gtk.Orientation.VERTICAL}
      spacing={1}
      hexpand={false}
      vexpand={false}
      halign={Gtk.Align.CENTER}
      valign={Gtk.Align.END}
    >
      <button
        class={klass}
        tooltipText={`${id}`}
        onClicked={() => switchTo(id)}
        hexpand={false}
        vexpand={false}
        widthRequest={tw}
        heightRequest={th}
      >
        <Gtk.DrawingArea
          hexpand={false}
          vexpand={false}
          widthRequest={tw}
          heightRequest={th}
          canTarget={false}
          $={(da: Gtk.DrawingArea) => {
            let last = wins()
            da.set_content_width(tw)
            da.set_content_height(th)
            da.set_draw_func((_area, cr, width, height) => {
              const pad = 1
              const bw = Math.max(1, width - pad * 2)
              const bh = Math.max(1, height - pad * 2)
              const rects = last.map((win) => ({
                x: pad + win.x * bw,
                y: pad + win.y * bh,
                w: Math.max(2, win.w * bw),
                h: Math.max(2, win.h * bh),
              }))
              cr.setSourceRGBA(0.93, 0.91, 0.88, 0.16)
              for (const r of rects) {
                cr.rectangle(r.x, r.y, r.w, r.h)
                cr.fill()
              }
              cr.setLineWidth(0.5)
              cr.setSourceRGBA(14 / 255, 13 / 255, 11 / 255, 1)
              for (const r of rects) {
                cr.rectangle(r.x + 0.25, r.y + 0.25, r.w - 0.5, r.h - 0.5)
                cr.stroke()
              }
            })
            const unsub = wins.subscribe(() => {
              last = wins()
              da.queue_draw()
            })
            da.connect("destroy", () => unsub())
          }}
        />
      </button>
      <box
        class={underKlass}
        hexpand={false}
        vexpand={false}
        widthRequest={tw}
        heightRequest={2}
      />
    </box>
  )
}

function ScreenGroup({
  screen,
  screens,
}: {
  screen: Screen
  screens: Accessor<Screen[]>
}) {
  return (
    <box spacing={2} hexpand={false} valign={Gtk.Align.END}>
      {screen.workspaces.map((id) => {
        const wins = createComputed(() => {
          const hit = screens().find((s) => s.name === screen.name)
          return hit?.wins[id] ?? []
        })
        const onScreen = createComputed(() => {
          const hit = screens().find((s) => s.name === screen.name)
          return hit?.shown === id
        })
        return (
          <WsRect
            id={id}
            rotate={screen.landscape}
            wins={wins}
            onScreen={onScreen}
          />
        )
      })}
    </box>
  )
}

export default function WorkspacePeek() {
  const screens = createPoll([] as Screen[], POLL_MS, readScreens)

  return (
    <box class="WsPeek" spacing={4} valign={Gtk.Align.CENTER} hexpand={false}>
      <For each={screens} id={(s) => s.name}>
        {(screen) => <ScreenGroup screen={screen} screens={screens} />}
      </For>
    </box>
  )
}
