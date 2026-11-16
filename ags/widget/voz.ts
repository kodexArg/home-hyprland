// voz.ts — estado del daemon de voz para AGS.
//
// Fuente: hyprland-whisper/ags/voz.ts (se copia a ~/.config/ags/widget/ con install.sh).
// Habla con el daemon por $XDG_RUNTIME_DIR/voz.sock: recibe el estado completo
// en JSON por línea, y manda órdenes de texto (mode <m>, toggle, reload).
// Sin procesos hijos y sin polling: si el daemon no está, reintenta solo.

import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"

export type VozMode = "comando" | "dictado" | "off"

export interface VozState {
  mode: VozMode
  /** loading | ready | stt | llm | error */
  phase: string
  /** hay voz en el micrófono ahora */
  hearing: boolean
  /** se dijo la palabra de activación y espera la orden */
  armed: boolean
  /** última frase oída */
  text: string
  /** comando | respuesta | dictado | armado | oido | nada | error */
  kind: string
  /** qué se hizo con esa frase */
  did: string
  ms: number
  /** sube con cada frase procesada */
  seq: number
  laya: boolean
  /** hay LLM disponible (clave y saldo) */
  llm: boolean
  /** USD gastados en el LLM */
  spent: number
  wake: string
  model: string
}

const SOCKET = `${GLib.get_user_runtime_dir()}/voz.sock`
const RETRY_MS = 2000
const DOWN: VozState = {
  mode: "off", phase: "down", hearing: false, armed: false,
  text: "", kind: "", did: "", ms: 0, seq: 0, laya: false, llm: false, spent: 0, wake: "", model: "",
}
const TOAST_MS = 2600
const TOAST_MS_PER_CHAR = 55 // una respuesta larga se queda más tiempo
const TOAST_MAX_MS = 14000
const TOAST_MARK: Record<string, string> = {
  comando: "✓", respuesta: "💬", nada: "?", error: "✗", armado: "🎙",
}

const [voz, setVoz] = createState<VozState>(DOWN)
const [vozUp, setVozUp] = createState(false)
/** Aviso breve con lo último que hizo ("" = oculto). No hay daemon de notificaciones: el aviso es esto. */
const [vozToast, setVozToast] = createState("")

let conn: Gio.SocketConnection | null = null
let started = false
let lastSeq = -1
let toastTimer: number | null = null

function toast(st: VozState): void {
  const first = lastSeq < 0
  const fresh = st.seq !== lastSeq
  lastSeq = st.seq
  if (first || !fresh || !(st.kind in TOAST_MARK)) return
  setVozToast(`${TOAST_MARK[st.kind]}  ${st.did}`)
  if (toastTimer !== null) GLib.source_remove(toastTimer)
  const ms = Math.min(TOAST_MAX_MS, TOAST_MS + TOAST_MS_PER_CHAR * Math.max(0, st.did.length - 30))
  toastTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    toastTimer = null
    setVozToast("")
    return GLib.SOURCE_REMOVE
  })
}

function drop(): void {
  try {
    conn?.close(null)
  } catch {}
  conn = null
  lastSeq = -1
  if (vozUp.peek()) setVozUp(false)
  setVoz(DOWN)
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, RETRY_MS, () => {
    connect()
    return GLib.SOURCE_REMOVE
  })
}

function connect(): void {
  const client = new Gio.SocketClient()
  client.connect_async(Gio.UnixSocketAddress.new(SOCKET), null, (_c, res) => {
    try {
      conn = client.connect_finish(res)
    } catch {
      drop()
      return
    }
    const mine = conn
    const lines = new Gio.DataInputStream({ base_stream: mine.get_input_stream() })
    const next = () => {
      lines.read_line_async(GLib.PRIORITY_DEFAULT, null, (_s, r) => {
        if (conn !== mine) return
        try {
          const [line] = lines.read_line_finish_utf8(r)
          if (line === null) throw new Error("eof")
          const st: VozState = JSON.parse(line)
          setVoz(st)
          toast(st)
          if (!vozUp.peek()) setVozUp(true)
          next()
        } catch {
          drop()
        }
      })
    }
    next()
  })
}

export function startVoz(): void {
  if (started) return
  started = true
  connect()
}

/** Manda una orden al daemon: "mode dictado", "toggle", "reload"... */
export function vozSend(command: string): void {
  if (!conn) return
  try {
    conn.get_output_stream().write_all(new TextEncoder().encode(`${command}\n`), null)
  } catch {
    drop()
  }
}

export { voz, vozUp, vozToast }
