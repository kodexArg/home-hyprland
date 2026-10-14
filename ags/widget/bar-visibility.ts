import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"
import { closeAllClusterMenus } from "./cluster-menu"

const STATE_FILE = `${GLib.get_user_config_dir()}/ags/.bar-visibility.json`

export type BarVisibility = {
  money: boolean
  monitors: boolean
  ram: boolean
  lanMouse: boolean
}

const DEFAULT_STATE: BarVisibility = {
  money: true,
  monitors: true,
  ram: true,
  lanMouse: true,
}

function loadState(): BarVisibility {
  try {
    const f = Gio.File.new_for_path(STATE_FILE)
    if (!f.query_exists(null)) return DEFAULT_STATE
    const [ok, bytes] = f.load_contents(null)
    if (!ok) return DEFAULT_STATE
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<BarVisibility>
    return {
      money: typeof parsed.money === "boolean" ? parsed.money : true,
      monitors: typeof parsed.monitors === "boolean" ? parsed.monitors : true,
      ram: typeof parsed.ram === "boolean" ? parsed.ram : true,
      lanMouse: typeof parsed.lanMouse === "boolean" ? parsed.lanMouse : true,
    }
  } catch {
    return DEFAULT_STATE
  }
}

function persistState(state: BarVisibility) {
  try {
    const data = JSON.stringify(state, null, 2)
    GLib.file_set_contents(STATE_FILE, data)
  } catch (e) {
    printerr(`bar-visibility: failed to save state: ${e}`)
  }
}

const initial = loadState()
export const [moneyVisible, setMoneyVisibleState] = createState(initial.money)
export const [monitorsVisible, setMonitorsVisibleState] = createState(initial.monitors)
export const [ramVisible, setRamVisibleState] = createState(initial.ram)
export const [lanMouseVisible, setLanMouseVisibleState] = createState(initial.lanMouse)

export const [moneyMenuOpen, setMoneyMenuOpen] = createState(false)
export const [monitorsMenuOpen, setMonitorsMenuOpen] = createState(false)
export const [ramMenuOpen, setRamMenuOpen] = createState(false)

function syncPersist() {
  persistState({
    money: moneyVisible.peek(),
    monitors: monitorsVisible.peek(),
    ram: ramVisible.peek(),
    lanMouse: lanMouseVisible.peek(),
  })
}

export function setMoneyVisible(v: boolean): void {
  setMoneyVisibleState(v)
  syncPersist()
}

export function toggleMoneyVisible(): string {
  const next = !moneyVisible.peek()
  setMoneyVisible(next)
  return next ? "money-visible" : "money-hidden"
}

export function setMonitorsVisible(v: boolean): void {
  setMonitorsVisibleState(v)
  syncPersist()
}

export function toggleMonitorsVisible(): string {
  const next = !monitorsVisible.peek()
  setMonitorsVisible(next)
  return next ? "monitors-visible" : "monitors-hidden"
}

export function setRamVisible(v: boolean): void {
  setRamVisibleState(v)
  syncPersist()
}

export function toggleRamVisible(): string {
  const next = !ramVisible.peek()
  setRamVisible(next)
  return next ? "ram-visible" : "ram-hidden"
}

export function setLanMouseVisible(v: boolean): void {
  setLanMouseVisibleState(v)
  syncPersist()
}

export function toggleLanMouseVisible(): string {
  const next = !lanMouseVisible.peek()
  setLanMouseVisible(next)
  return next ? "lanmouse-visible" : "lanmouse-hidden"
}

export function closeAllBarPanels(): void {
  if (moneyMenuOpen.peek()) setMoneyMenuOpen(false)
  if (monitorsMenuOpen.peek()) setMonitorsMenuOpen(false)
  if (ramMenuOpen.peek()) setRamMenuOpen(false)
}

export function openMoneyMenu(): void {
  closeAllClusterMenus()
  if (monitorsMenuOpen.peek()) setMonitorsMenuOpen(false)
  if (ramMenuOpen.peek()) setRamMenuOpen(false)
  setMoneyMenuOpen(!moneyMenuOpen.peek())
}

export function toggleMoneyMenu(): string {
  openMoneyMenu()
  return moneyMenuOpen.peek() ? "money-menu-open" : "money-menu-closed"
}

export function openMonitorsMenu(): void {
  closeAllClusterMenus()
  if (moneyMenuOpen.peek()) setMoneyMenuOpen(false)
  if (ramMenuOpen.peek()) setRamMenuOpen(false)
  setMonitorsMenuOpen(!monitorsMenuOpen.peek())
}

export function toggleMonitorsMenu(): string {
  openMonitorsMenu()
  return monitorsMenuOpen.peek() ? "monitors-menu-open" : "monitors-menu-closed"
}

export function openRamMenu(): void {
  closeAllClusterMenus()
  if (moneyMenuOpen.peek()) setMoneyMenuOpen(false)
  if (monitorsMenuOpen.peek()) setMonitorsMenuOpen(false)
  setRamMenuOpen(!ramMenuOpen.peek())
}

export function toggleRamMenu(): string {
  openRamMenu()
  return ramMenuOpen.peek() ? "ram-menu-open" : "ram-menu-closed"
}
