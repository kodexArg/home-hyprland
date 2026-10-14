import { Gtk } from "ags/gtk4"
import { createComputed, For, type Accessor } from "ags"
import { createPoll } from "ags/time"
import { exec, execAsync } from "ags/process"
import GLib from "gi://GLib"
import Gdk from "gi://Gdk?version=4.0"
import GdkPixbuf from "gi://GdkPixbuf"
import Gio from "gi://Gio"
import { findApp } from "./apps-index"
import { isZoomDense } from "./zoom"

const POLL_MS = 500
const SHORT = 13
const LONG = 22

type Phase = "empty" | "occupied"

type WinBox = {
  x: number
  y: number
  w: number
  h: number
  appClass: string
  title: string
  fullscreen: boolean
}

const ICON_DIR = `${GLib.get_user_config_dir()}/ags/icons`
const LOG_DIR = `${GLib.get_user_state_dir()}/ags-icons`
const LOG_FILE = `${LOG_DIR}/unknown.tsv`

type Look = { bg: string; brand: string; icon: string | null; letter: string }

const hexRGB = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
]

function hashColor(name: string): { bg: string; brand: string } {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hue = h % 360
  const hsl = (l: number) => {
    const s = 0.55
    const f = (n: number) => {
      const k = (n + hue / 30) % 12
      const v = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
      return Math.round(v * 255).toString(16).padStart(2, "0")
    }
    return `#${f(0)}${f(8)}${f(4)}`
  }
  return { bg: hsl(0.18), brand: hsl(0.72) }
}

function desktopIcon(appClass: string): string | null {
  const c = appClass.toLowerCase()
  let info: Gio.AppInfo | null = null
  for (const id of [`${appClass}.desktop`, `${c}.desktop`]) {
    try { info = Gio.DesktopAppInfo.new(id); if (info) break } catch { info = null }
  }
  if (!info) {
    info = Gio.AppInfo.get_all().find((a) =>
      (a as Gio.DesktopAppInfo).get_startup_wm_class?.()?.toLowerCase() === c) ?? null
  }
  const icon = info?.get_icon()
  if (!icon) return null
  if (icon instanceof Gio.FileIcon) return icon.get_file().get_path()
  if (icon instanceof Gio.ThemedIcon) return icon.get_names()[0] ?? null
  return null
}

const logged = new Set<string>()
function logUnknown(appClass: string, title: string, icon: string | null) {
  if (logged.has(appClass)) return
  logged.add(appClass)
  try {
    GLib.mkdir_with_parents(LOG_DIR, 0o755)
    const line = `${GLib.DateTime.new_now_local().format("%F %T")}\t${appClass}\t${title.slice(0, 60)}\t${icon ?? "-"}\n`
    const f = Gio.File.new_for_path(LOG_FILE)
    const s = f.append_to(Gio.FileCreateFlags.NONE, null)
    s.write_all(new TextEncoder().encode(line), null)
    s.close(null)
  } catch {}
}

const lookCache = new Map<string, Look>()
function resolveLook(appClass: string, title: string): Look {
  const app = findApp(appClass, title)
  const key = app ? `#${app.id}` : appClass
  const hit = lookCache.get(key)
  if (hit) return hit
  const name = appClass || "?"
  let look: Look
  if (app) {
    look = { bg: app.bg, brand: app.brand, icon: app.icon, letter: name[0].toUpperCase() }
  } else {
    const icon = appClass ? desktopIcon(appClass) : null
    logUnknown(name, title, icon)
    look = { ...hashColor(name), icon, letter: name.replace(/^.*[.-]/, "")[0]?.toUpperCase() ?? "?" }
  }
  lookCache.set(key, look)
  return look
}

const FS_COUNT_CLIENT = true
function isFullscreenClient(c: { fullscreen?: number; fullscreenClient?: number }): boolean {
  return (c.fullscreen ?? 0) >= 2 || (FS_COUNT_CLIENT && (c.fullscreenClient ?? 0) >= 2)
}

const ICON_OVERSAMPLE = 4
const iconCache = new Map<string, GdkPixbuf.Pixbuf | null>()

function iconPath(icon: string, px: number): string | null {
  if (icon.startsWith("/")) return icon
  if (/\.(svg|png)$/.test(icon)) return `${ICON_DIR}/${icon}`
  const display = Gdk.Display.get_default()
  if (!display) return null
  const theme = Gtk.IconTheme.get_for_display(display)
  if (!theme.has_icon(icon)) return null
  return theme.lookup_icon(icon, null, px, 1, Gtk.TextDirection.NONE, 0).get_file()?.get_path() ?? null
}

function loadIcon(icon: string, brand: string, px: number): GdkPixbuf.Pixbuf | null {
  const key = `${icon}|${brand}|${px}`
  if (iconCache.has(key)) return iconCache.get(key) ?? null
  let pb: GdkPixbuf.Pixbuf | null = null
  try {
    const path = iconPath(icon, px)
    if (path && path.startsWith(ICON_DIR) && path.endsWith(".svg")) {
      const [, bytes] = GLib.file_get_contents(path)
      const svg = new TextDecoder().decode(bytes).replaceAll("currentColor", brand)
      const loader = GdkPixbuf.PixbufLoader.new()
      loader.set_size(px, px)
      loader.write(new TextEncoder().encode(svg))
      loader.close()
      pb = loader.get_pixbuf()
    } else if (path) {
      pb = GdkPixbuf.Pixbuf.new_from_file_at_size(path, px, px)
    }
  } catch {
    pb = null
  }
  iconCache.set(key, pb)
  return pb
}

export function drawWins(
  cr: any,
  width: number,
  height: number,
  wins: WinBox[],
) {
  const pad = 1
  const bw = Math.max(1, width - pad * 2)
  const bh = Math.max(1, height - pad * 2)
  const ordered = [...wins].sort((a, b) => Number(a.fullscreen) - Number(b.fullscreen))

  for (const win of ordered) {
    const r = {
      x: pad + win.x * bw,
      y: pad + win.y * bh,
      w: Math.max(2, win.w * bw),
      h: Math.max(2, win.h * bh),
    }
    const look = resolveLook(win.appClass, win.title)
    const [br, bg, bb] = hexRGB(look.brand)

    cr.setSourceRGBA(...hexRGB(look.bg), win.fullscreen ? 0.95 : 0.85)
    cr.rectangle(r.x, r.y, r.w, r.h)
    cr.fill()

    cr.setLineWidth(0.5)
    if (win.fullscreen) cr.setSourceRGBA(br, bg, bb, 0.6)
    else cr.setSourceRGBA(14 / 255, 13 / 255, 11 / 255, 1)
    cr.rectangle(r.x + 0.25, r.y + 0.25, r.w - 0.5, r.h - 0.5)
    cr.stroke()

    const m = Math.min(r.w, r.h)
    if (m < 5.5) continue
    const s = Math.max(4, Math.floor(m - 1.5))
    const pb = look.icon ? loadIcon(look.icon, look.brand, s * ICON_OVERSAMPLE) : null
    if (pb) {
      cr.save()
      cr.translate(r.x + (r.w - s) / 2, r.y + (r.h - s) / 2)
      cr.scale(1 / ICON_OVERSAMPLE, 1 / ICON_OVERSAMPLE)
      Gdk.cairo_set_source_pixbuf(cr, pb, 0, 0)
      cr.paint()
      cr.restore()
    } else {
      cr.selectFontFace("Sans", 0, 1)
      cr.setFontSize(s + 1)
      const ext = cr.textExtents(look.letter)
      cr.setSourceRGBA(br, bg, bb, 1)
      cr.moveTo(r.x + (r.w - ext.width) / 2 - ext.xBearing, r.y + (r.h - ext.height) / 2 - ext.yBearing)
      cr.showText(look.letter)
    }
  }
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
      class?: string
      initialClass?: string
      title?: string
      fullscreen?: number
      fullscreenClient?: number
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
        appClass: c.class || c.initialClass || "",
        title: c.title || "",
        fullscreen: isFullscreenClient(c),
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

  const shortPx = isZoomDense() ? 9 : SHORT
  const longPx = isZoomDense() ? 14 : LONG
  const tw = rotate ? longPx : shortPx
  const th = rotate ? shortPx : longPx

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
              drawWins(cr, width, height, last)
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
    <box
      class="WsPeek"
      spacing={isZoomDense() ? 4 : 6}
      valign={Gtk.Align.CENTER}
      hexpand={false}
    >
      <For each={screens} id={(s) => s.name}>
        {(screen) => <ScreenGroup screen={screen} screens={screens} />}
      </For>
    </box>
  )
}
