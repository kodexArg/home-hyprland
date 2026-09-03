# Debian sid / forky — only what this desktop needs

- OS: Debian GNU/Linux **forky/sid**.
- Hyprland from Debian, not a random AUR rice. Do not replace with unofficial binaries unless kodex asks.
- AGS is **built** to `/usr/local/bin/ags` (3.1.0), not the Debian package as SSOT.
- NVIDIA DKMS can lag a kernel bump → AMD becomes `card0`, HDMI names swap. Bind `desc:`.
- GDM dual session. GNOME packages stay.
- User units: `ags-hyprland.service`, `hypridle.service`, `local-llm.service`.
- GSK: `GSK_RENDERER=gl` for AGS/anyrun on this NVIDIA stack.

If apt/hypr version jumped, refresh `VERSION` `hyprland_tag` after checking `apt-cache policy hyprland`.
