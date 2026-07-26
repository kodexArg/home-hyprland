# home-hyprland

Bundle privado de escritorio Hyprland para **debian-sid** (kodexArg).

GNOME sigue siendo el daily driver; esto es el experimento de sesión dual
(GDM → Hyprland). Compositor **Hyprland 0.55** configurado en **Lua**
(no hyprlang), barra **AGS 3.1** (Aylur's GTK Shell / Astal GTK4).

---

## Qué hay en la barra (lo importante primero)

La barra AGS vive **solo en el monitor vertical** (`HDMI-A-2`) y trae cuatro
controles propios, escritos en TypeScript/JSX contra Astal — sin scripts shell
de por medio:

### ☕ Caffeine — inhibir idle/suspend

Taza junto al reloj. Encendida = la máquina no se duerme. No usa
`Gtk.Application.inhibit` (es no-op sin gnome-session en esta sesión): sostiene
un proceso `systemd-inhibit --what=idle:sleep --mode=block` y lo mata al apagar.

- Click en la taza, o `ags request caffeine`
- Código: `ags/widget/Bar.tsx` → `applyCaffeine()` / `toggleCaffeine()`
- Iconos: `ags/icons/caffeine-on.svg` (con vapor) / `caffeine-off.svg`

### 🧠 Selector de agentes / LLM local

Icono de cerebro → menú con **un modelo GGUF por fila** + `OFF`. Escanea
`~/Services/local-llm/models/gguf`, escribe la elección en
`~/.config/local-llm/selected-model` y maneja `local-llm.service` (systemd
--user) como una FSM: `unload` (rojo) → `load` (ámbar) → `ready` (naranja).

- **"Listo" = la API OpenAI responde** (`GET 127.0.0.1:28000/v1/models`), no que
  la unit esté `active`. Es la diferencia entre "arrancó" y "los pesos están en VRAM".
- Un modelo por vez: 8 GB de VRAM (RTX 2060 SUPER). Timeout de carga 90 s
  (2 × el budget de 45 s medido con densenet 9B Q4) → `SIGKILL` y stop.
- Header en vivo con VRAM: `nvidia-smi` cada 2 s en caliente, 8 s en frío.
  < 7 GiB usados → ámbar (hay aire); ≥ 7 GiB → naranja (justo).
- Los MoE híbridos (~21 GB en disco) se marcan `· hybrid` — riesgo de thrash.
- Código: `ags/widget/LocalLlm.tsx` · icono `ags/icons/brain.svg`

### 🔊 Volumen

Grupo a la izquierda de la barra: icono de salida + `−` + track + `+`.

- El track **no es `Gtk.Scale`** (hit-target roto sobre layer-shell + GSK gl
  acá): es una caja con `GestureClick` + `GestureDrag` + scroll, y el relleno es
  un hijo — nunca se re-bindea la clase del target del gesto, eso desarma los
  controllers a mitad del click.
- Scroll en cualquier parte del grupo: ±5 %.
- Fuente de verdad: WirePlumber vía AstalWp.

### 🔀 El switch de tres botones

Dos ciclos de tres estados, ambos con orden fijo:

| Switch | Estados | Cómo |
|---|---|---|
| **Salida de audio** (icono de volumen) | parlantes → **mute** → auriculares → parlantes | click en el icono |
| **Modo de barra** | `always` → `temp` → `hidden` → `always` | `Super+B` o `ags request bar-cycle` |

- **Salida de audio** (2026-07-24): HDMI (`TU106` → AOC G2790G4) = **auriculares**;
  jack motherboard Ryzen ALC897 (`analog-output-lineout`) = **parlantes**. Mute
  siempre pinta parlante-tachado (no existe "auriculares muteados").
  Clasificación con lectura **viva** de `defaultSpeaker`.
- **Modo de barra**: en `temp` la barra se auto-oculta a los 2.5 s y reaparece
  al llevar el cursor al borde superior (poll de `hyprctl cursorpos` cada 80 ms,
  12 px de zona) o con `Super_L`/`Super_R` (bind `non_consuming`).

---

## Layout del repo

| Path | Rol | Path vivo en el host |
|------|-----|----------------------|
| `hypr/` | Hyprland 0.55 Lua + hyprpaper | `~/.config/hypr/` |
| `ags/` | Barra AGS v3 (Astal GTK4) + iconos | `~/.config/ags/` |
| `bin/` | Helpers `hypr-*` (captura, grabación, reveal-all) | `~/.local/bin/` |
| `kitty/` | Kitty (+ perfil `grok`) | `~/.config/kitty/` |
| `wallpapers/` | Media del wallpaper | referenciado por hyprpaper |
| `skill/kdx-hyperland/` | Skill de agentes (snapshot) | `~/.claude/skills/kdx-hyperland/` |

## Scripts (`bin/`)

| Script | Qué hace | Keybind |
|---|---|---|
| `hypr-screenshot` | grim + slurp: `window` / `region` / `full` / `monitor <n>` / `panel <left\|right\|bar>` | `Print` · `Ctrl+Print` · `Alt+Print` |
| `hypr-record` | wf-recorder + slurp, con `toggle`/`stop`/`status`, audio de sistema o mic | `Super+Shift+R` (región) · `Super+Shift+Alt+R` (ventana) |
| `hypr-reveal-all` | "mostrá todo": junta los clientes del workspace activo, saca fullscreen, cierra el scratchpad | `Super+A` |

Para agentes: `HYPR_SHOT_AGENT=1` (o `--agent`) corre en foreground e imprime la
ruta absoluta del PNG en stdout, en vez de irse por `setsid`.

## Este host

- **Monitores**: AOC landscape izquierda (`HDMI-A-1`, scale 1) + ASUS retrato
  derecha (`HDMI-A-2`, `transform 3`, scale 1.5 → 720×1280 lógicos) → layout `--|`
- **NVIDIA**: `AQ_DRM_DEVICES=/dev/dri/card0:/dev/dri/card1` · `GSK_RENDERER=gl`
  para AGS/anyrun
- **Layout** dwindle · mod `SUPER` · `gaps_in`/`gaps_out` = 5 · bordes naranja kdx
- Terminal Kitty (`Super+T`) · Brave (`Super+X`) · Grok CLI (`Super+G`) ·
  anyrun (`Super+Space`) · hyprlauncher (`Super+R`)
- Wallpaper: Disco Elysium thought cabinet (AVIF por hyprpaper, `cover`)

## Instalar / sincronizar en este host

```bash
# Hypr
cp -a hypr/* ~/.config/hypr/
hyprctl reload                       # sólo si ya estás en sesión Hyprland

# AGS — node_modules/ y @girs/ no van a git (ags los regenera)
mkdir -p ~/.config/ags
rsync -a --exclude node_modules --exclude @girs ags/ ~/.config/ags/
ags quit
env PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin GSK_RENDERER=gl \
  /usr/local/bin/ags run ~/.config/ags

# Scripts
install -m 755 bin/hypr-* ~/.local/bin/

# Kitty
cp -a kitty/* ~/.config/kitty/

# Skill de agentes
rsync -a skill/kdx-hyperland/ ~/.claude/skills/kdx-hyperland/
```

AGS **no tiene reload**: hay que `ags quit` y volver a levantarlo. Cambios de
`permission`/monitores en Hyprland sí requieren reinicio completo de sesión.

O symlinkear hypr, para que los edits caigan directo en el repo:

```bash
ln -sfn ~/home-hyprland/hypr ~/.config/hypr
```

## Notas AGS

- Binario `/usr/local/bin/ags` 3.1.0 · `GSK_RENDERER=gl` obligatorio en NVIDIA
- No commitear `node_modules/` ni `@girs/` (se regeneran)
- Iconos: SVG monocromos crema en `ags/icons/`, cargados con `image file=` —
  **sin icon theme** de por medio
- IPC disponible: `ags request bar-cycle | bar-peek | bar-mode | bar-set <modo> |
  caffeine | capture-toggle`
- El panel de captura (`CaptureToggle`) está **comentado desde 2026-07-17**:
  los botones eran mocks; los binds `Print` hacen el trabajo real

## Fuera de este repo (vault de la máquina)

- `~/Documents/System/Desktop.md`
- ADRs: `~/Documents/System/ADRs/20260715-hyprland-*`, `20260715-ags-*`
