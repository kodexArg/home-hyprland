# Hyprland profiles (one Lua per host)

| Host (hostname) | Machine | Profile |
|---|---|---|
| `debian-sid` | Sid desktop (NVIDIA, ASUS VA27EHF + AOC G2790G4) | `debian-sid.lua` |
| `kdxsid` | Asus TUF laptop (NVIDIA + Renoir, eDP-1) | `kdxsid-tuf.lua` |
| `zensid` | Asus Zenbook i5-5200U (Intel HD 5500, eDP-1 3200x1800 + Samsung 54" TV), trixie + Hyprland 0.55 backports | `zensid.lua` (written from scratch for 0.55; see `README-zensid.md`) |

- Each profile is a complete, self-contained `hyprland.lua` (KISS: no includes).
- `hypr/hyprland.lua` is a compat symlink to `profiles/debian-sid.lua` (reference host).
- Live config: `~/.config/hypr/hyprland.lua` = copy of (or, later, symlink to) the host profile:
  `ln -sfn ~/home-hyprland/hypr/profiles/<profile>.lua ~/.config/hypr/hyprland.lua`
- Sync rule: edit live → copy back to `profiles/<profile>.lua` → commit.
