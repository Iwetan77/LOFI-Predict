# Art slots

Drop image files here with these exact names and the game picks them up — no
code changes needed. Until a file exists, the game renders a labelled
placeholder rectangle so the loop is fully playable.

All sprites: PNG with transparency, `image-rendering: pixelated` friendly
(crisp edges, no anti-aliasing). Portrait-mobile first.

## LOFI the yeti (sprite sheets, horizontal strips ok)

| File | Frames | Suggested size | Used in |
| --- | --- | --- | --- |
| `lofi_idle.png` | 4–8 | 128×128 / frame | between rounds, BOOT |
| `lofi_climb.png` | 6–8 | 128×128 / frame | price moving your way |
| `lofi_slip.png` | 4 | 128×128 / frame | adverse move, losing grip |
| `lofi_fall.png` | 4–6 | 128×128 / frame | wrong call |
| `lofi_cheer.png` | 4–6 | 128×128 / frame | floor reached |

## Buildings (tileable façade + roof cap)

| File | Notes |
| --- | --- |
| `building_tier1_facade.png` | tileable vertically, ~256px wide |
| `building_tier1_roof.png` | roof cap, same width |
| `building_tier2_facade.png` / `_roof.png` | neon mid-rise |
| `building_tier3_facade.png` / `_roof.png` | glass/chrome high-rise |

## FX

| File | Notes |
| --- | --- |
| `stone.png` | falling brick/debris, ~48×48 |
| `dust.png` | climb dust puff, ~32×32 |
| `confetti.png` | floor-cleared sparkle atlas |
| `ledge_grab.png` | cash-out / grab-the-ledge pose |

If you provide a single sprite sheet, also add a `<name>.json` (frame count +
size) next to it; otherwise the loader assumes a single-row strip of equal
frames inferred from height.
