# Paneles y barra por PC (Sid, TUF, Zen)

Un solo AGS y un solo `panels.lua` en el seed; lo único propio de cada PC es
`~/.config/kodex/local.env` (fuera del seed, no versionado: actualizar el seed no lo pisa).

## Qué lee qué
- `~/home-hyprland/hypr/panels.lua`: cada perfil de Hyprland lo carga con `dofile`.
  Lee `KDX_PANELS` y crea las reglas de paneles (persistentes, 1..N de izquierda a derecha).
  Sin `local.env` usa `HDMI-A-2:3,HDMI-A-1:3`.
- `~/home-hyprland/ags/widget/local-env.ts`: AGS lee `KDX_BAR_HIDE`.
  WorkspacePeek muestra lo que diga `hyprctl workspaces -j`, sin copia propia.
- Plantilla: `~/home-hyprland/kodex/local.env.example` (formato y nombres de ítems).

## Aplicar en una PC
```bash
cd ~/home-hyprland && git pull
mkdir -p ~/.config/kodex
[ -f ~/.config/kodex/local.env ] || cp kodex/local.env.example ~/.config/kodex/local.env
$EDITOR ~/.config/kodex/local.env           # KDX_PANELS / KDX_BAR_HIDE de esta PC
mv ~/.config/ags ~/.config/ags.pre-seed-$(date +%Y%m%d)   # si no es symlink
ln -sfn ~/home-hyprland/ags ~/.config/ags
# el perfil de Hyprland debe tener: dofile("/home/kodex/home-hyprland/hypr/panels.lua")
hyprctl reload       # ojo: reaplica hl.monitor del perfil
systemctl --user restart ags-hyprland.service
```

## Valores por PC
- Sid (`debian-sid`): `KDX_PANELS="desc:ASUSTek COMPUTER INC VA27EHF:3,desc:AOC G2790G4:3"`
- TUF (`kdxsid`, Tuffy): `KDX_PANELS="eDP-1:1"`
- Zen (`zensid`, Zeni): `KDX_PANELS="<izquierdo>:1,<derecho>:1"`. Zeni confirma los nombres
  con `hyprctl monitors -j | jq -r '.[]|"\(.x) \(.name) \(.description)"'` (por x ascendente;
  hoy el perfil usa `eDP-1` y `HDMI-A-1`). Preferí `desc:` si el conector cambia de nombre.
- Zen: los íconos de contraste propios se descartan; el AGS canónico es el de la Sid y
  el symlink al seed los sobrescribe.

## Ocultar ítems de la barra
`KDX_BAR_HIDE="ram,clock"` (separados por coma). Nombres: `volume`, `game-volume`,
`spotify-volume`, `panels`, `kodexbot`, `rec-mode`, `cast-rec`, `grokbot`, `grokbuild`,
`cursor`, `claude`, `agy`, `agy-other`, `openrouter`, `lanmouse`, `mic`, `ram`, `clock`, `menu`.
Se aplica al reiniciar `ags-hyprland.service`.

## Verificar
```bash
readlink ~/.config/ags                         # → ~/home-hyprland/ags
hyprctl configerrors                           # vacío
hyprctl workspacerules -j | jq -c '.[]|[.workspaceString,.monitor]'
hyprctl workspaces -j | jq -c '[.[]|select(.id>0)|[.id,.monitor]]|sort'
systemctl --user is-active ags-hyprland.service
journalctl --user -u ags-hyprland.service --since -1min | grep -iE 'error|warn'
```
Reportar a Comendador con esa salida. Sin commit/push sin su OK.
