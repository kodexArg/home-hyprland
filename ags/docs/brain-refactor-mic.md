# Pilar Mic — BrainCluster (refactor 3→2 iconos)

**Estado:** diseño acordado (solo documentación). Sin UI todavía.  
**Alcance:** entrada de audio global. El otro icono y la FSM nueva quedan fuera de esta ficha.

## Rol

- Input global del sistema (mismo contrato que hoy).
- Uso simple: mute / unmute; estado visible en el icono.
- Vive en el cluster de la barra AGS (hoy `MicIndicator` + `mic.ts`).

## Gestos

| Gesto | Acción |
|---|---|
| Clic izquierdo | Mute / unmute de la fuente por defecto |
| Clic derecho | Abrir menú de fuentes |

## Menú de fuentes

- Conservar la estética actual del panel (lista LocalLlm-like).
- Mejoras acordadas: un poco más de info por fila, panel más grande/amable (misma familia visual).
- Filas tipicas: Brio, Bluetooth, Easy Effects (si existe), otras sources PipeWire/`pactl`.
- Al elegir una fuente: `set-default-source` + unmute (como hoy).

## Easy Effects (portable)

- Detectar EE solo si existe en la máquina (`which` / unidad / source PipeWire). Si no hay EE: rama ausente, sin error.
- Si hay source Easy Effects disponible: **preferirla como primera opción** de entrada.
- En el menú, mostrar la config EE de forma humana (nombre amable + tip breve), no crudo de PipeWire.
- Quick exit: si EE no está, el menú lista solo sources reales y sigue.

## Implementación (2026-09-13)

- `widget/mic.ts` — sources enriquecidos; `probeEasyEffects()` portable; EE primero en lista; `preferEasyEffectsSource()` al arrancar watch.
- `widget/MicIndicator.tsx` — menú más ancho/amable; bloque EE; filas con título + detalle.
- `style.scss` — `.MicMenu` / `.Mic-ee-*` / `.Mic-source-detail`.
- Evidencia: `docs/mic-menu-ee-evidence.png`

## Fuera de alcance (esta ficha)

- Unificación a 2 iconos del BrainCluster.
- Nueva FSM / locutor / cerebro.
- Implementación de UI.

## Referencias actuales

- `~/.config/ags/widget/MicIndicator.tsx` — icono + panel
- `~/.config/ags/widget/mic.ts` — `pactl` sources, mute, select
- Diagrama Archify: `docs/archify/brain-refactor-mic.workflow.json`
  - HTML: `docs/archify/brain-refactor-mic.html`
  - PNG (light 1440×900): `docs/archify/brain-refactor-mic.png`
  - SVG extraído: `docs/archify/brain-refactor-mic.svg`
  - Viewer UI del HTML en inglés (contenido en español).
