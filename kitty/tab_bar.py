"""Custom kitty tab bar with inverted slant direction."""

from kitty.fast_data_types import Screen, get_options
from kitty.tab_bar import DrawData, ExtraData, TabBarData, as_rgb
from kitty.utils import color_as_int


def draw_tab(
    draw_data: DrawData,
    screen: Screen,
    tab: TabBarData,
    before: int,
    max_tab_length: int,
    index: int,
    is_last: bool,
    extra_data: ExtraData,
) -> int:
    opts = get_options()

    if tab.is_active:
        fg = as_rgb(color_as_int(draw_data.active_fg))
        bg = as_rgb(color_as_int(draw_data.active_bg))
    else:
        fg = as_rgb(color_as_int(draw_data.inactive_fg))
        bg = as_rgb(color_as_int(draw_data.inactive_bg))

    default_bg = as_rgb(color_as_int(opts.color_table[0]))

    # Previous tab bg
    if index == 1:
        prev_bg = default_bg
    else:
        prev_tab = extra_data.prev_tab
        if prev_tab and prev_tab.is_active:
            prev_bg = as_rgb(color_as_int(draw_data.active_bg))
        else:
            prev_bg = as_rgb(color_as_int(draw_data.inactive_bg))

    # Leading separator:  (U+E0B2) — inverted direction
    # fg = current tab bg (the filled part), bg = previous tab bg
    screen.cursor.fg = bg
    screen.cursor.bg = prev_bg
    screen.draw("\ue0b2")

    # Tab title
    title = f" {tab.tab_id}: {tab.title} "
    if len(title) > max_tab_length - 2:
        title = title[: max_tab_length - 3] + "…"

    screen.cursor.fg = fg
    screen.cursor.bg = bg
    screen.draw(title)

    # Trailing separator for last tab
    if is_last:
        screen.cursor.fg = default_bg
        screen.cursor.bg = bg
        screen.draw("\ue0b2")

    return screen.cursor.x
