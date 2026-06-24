# Art slots

Drop image files here with these exact names and the game picks them up — no
code changes needed. Until a file exists, the game falls back to a drawn
placeholder so the loop stays fully playable.

PNG with transparency for sprites; the sky may be JPG. Portrait-mobile first.

## In use now

| File | Role | Notes |
| --- | --- | --- |
| `lofi.png` | the yeti | single image; shown on the landing and climbing the tower |
| `sky.jpg` | backdrop | fills the climb behind the building (cover-fit) |
| `building_tier1.png` … `building_tier5.png` | tower landmarks | one fixed building per tier; LOFI climbs its face. Whole-building cutout, transparent background |
| `stone1.png`, `stone2.png` | falling debris | rain down when a call is going against you |
| `token_btc.svg` | BTC icon | shown on the pick screen |

## Optional — extra LOFI poses (swapped per round state)

Single image each is fine. When present, the climb swaps the yeti sprite:

| File | When |
| --- | --- |
| `lofi_climb.png` | price moving your way |
| `lofi_slip.png` | adverse move, losing grip |
| `lofi_fall.png` | wrong call |
| `lofi_cheer.png` | floor reached |

## Optional — PWA icons

| File | Notes |
| --- | --- |
| `icon-192.png`, `icon-512.png` | home-screen / install icons |
