import { createState } from "ags"
import GLib from "gi://GLib"
import Gio from "gi://Gio"

export const [brainMenuOpen, setBrainMenuOpen] = createState(false)
export const [micMenuOpen, setMicMenuOpen] = createState(false)
export const [dictatorMenuOpen, setDictatorMenuOpen] = createState(false)

export function openBrainMenu(): void {
  if (micMenuOpen.peek()) setMicMenuOpen(false)
  if (dictatorMenuOpen.peek()) setDictatorMenuOpen(false)
  setBrainMenuOpen(!brainMenuOpen.peek())
}

export function openMicMenu(): void {
  if (brainMenuOpen.peek()) setBrainMenuOpen(false)
  if (dictatorMenuOpen.peek()) setDictatorMenuOpen(false)
  setMicMenuOpen(!micMenuOpen.peek())
}

export function openDictatorMenu(): void {
  if (brainMenuOpen.peek()) setBrainMenuOpen(false)
  if (micMenuOpen.peek()) setMicMenuOpen(false)
  setDictatorMenuOpen(!dictatorMenuOpen.peek())
}

export function toggleBrainMenu(): string {
  openBrainMenu()
  return brainMenuOpen.peek() ? "brain-menu-open" : "brain-menu-closed"
}

export function toggleMicMenu(): string {
  openMicMenu()
  return micMenuOpen.peek() ? "mic-menu-open" : "mic-menu-closed"
}

export function toggleDictatorMenu(): string {
  openDictatorMenu()
  return dictatorMenuOpen.peek() ? "dictator-menu-open" : "dictator-menu-closed"
}

export function closeAllClusterMenus(): void {
  if (brainMenuOpen.peek()) setBrainMenuOpen(false)
  if (micMenuOpen.peek()) setMicMenuOpen(false)
  if (dictatorMenuOpen.peek()) setDictatorMenuOpen(false)
}

const HOME = GLib.get_home_dir()
export const LOGS_DIR = `${HOME}/.local/state/voice-dictation/logs`
export const FSM1_LOG = `${LOGS_DIR}/fsm1_mic_gate.log`
export const FSM2_LOG = `${LOGS_DIR}/fsm2_dictator_queue.log`
export const FSM3_LOG = `${LOGS_DIR}/fsm3_cognitive_brain.log`

export function readLastLogLine(filePath: string): string {
  try {
    const file = Gio.File.new_for_path(filePath)
    if (!file.query_exists(null)) return "(sin registros)"
    const [ok, bytes] = file.load_contents(null)
    if (!ok) return "(sin registros)"
    const text = new TextDecoder().decode(bytes).trim()
    const lines = text.split("\n").filter(Boolean)
    if (lines.length === 0) return "(sin registros)"
    const last = lines[lines.length - 1].trim()
    const cleaned = last.replace(/^\[\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})\.\d+[^\]]*\]/, "[$1]")
    return cleaned.length > 70 ? `${cleaned.slice(0, 67)}…` : cleaned
  } catch {
    return "(sin registros)"
  }
}
