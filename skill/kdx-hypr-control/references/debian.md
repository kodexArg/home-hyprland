# Debian sid / forky quirks (Sid, TUF)

_Merged from the retired `k-hyprland` skill (2026-09-30). zensid is Debian 13 trixie — see SKILL.md._

- OS: Debian GNU/Linux **forky/sid**.
- Hyprland from Debian, not a random AUR rice. Do not replace with unofficial binaries unless kodex asks.
- AGS is **built** to `/usr/local/bin/ags` (3.1.0), not the Debian package as SSOT.
- NVIDIA DKMS can lag a kernel bump → AMD becomes `card0`, HDMI names swap. Bind `desc:`.
- GDM dual session: Hyprland main, GNOME packages stay as fallback.
- User units: `ags-hyprland.service`, `hypridle.service`, `local-llm.service`.
- GSK: `GSK_RENDERER=gl` for AGS/anyrun on this NVIDIA stack.

If apt/hypr version jumped, re-check `apt-cache policy hyprland` / `hyprctl version` and update the Binaries row in SKILL.md.
