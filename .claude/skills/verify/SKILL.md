# Verify: 轉珠 Match-3 (Phaser browser game)

## Build / launch
- `npm test` — vitest unit tests for pure logic (Board/BattleState/team/run).
- `npm run dev` — vite dev server at http://localhost:5173 (run in background).
- `npm run build` — tsc + vite; catches type errors.

## Drive the running game (no Playwright browsers installed)
`playwright-core` is a devDependency; use the system Edge via
`chromium.launch({ channel: 'msedge', headless: true })`. Set viewport to
exactly 800x800 so the centered canvas sits at (0,0) and game coordinates ==
page coordinates.

A file-based interactive driver works well: a background node script that
polls a `cmd.json` for `{seq, action: click|drag|wait|exit, x, y, path, ms,
name}`, executes it, screenshots to `shot-<name>.png`, and writes `result.txt`
with the seq. Read screenshots with the Read tool to see the board, then plan
the next input. NOTE: node resolves `playwright-core` relative to the script
location — import it via `createRequire('<repo>/package.json')`.

## Key coordinates (800x800 canvas)
- Board: 6 cols x 5 rows, tile 96, origin (112, 230). Cell center:
  `x = 160 + 96*col`, `y = 278 + 96*row`. Enemy emoji sprite at (400, ~176).
- Level-select world map: zigzag path, level i node at
  x = [220,400,580,580,400,220,220,400,580][i], y = 668 - i*62 (level 1 at
  bottom). Locked levels show 🔒 and are not clickable.
  Bottom nav buttons y=764: Roguelike Tower x=218, Gacha x=400, Collection x=582.
- Story intro "Begin Battle" button: (400, 520). Boss levels play a BOSS
  splash right after dismissing the intro.
- Skill buttons (5-member team) y≈774: x ≈ 93, 246, 399, 553, 706.
- End-of-level results panel buttons y≈514: primary (Next Level) x≈302,
  secondary (Back to Map) x≈498.
- Run map: rows bottom-up, node y = 660 - row*115; x spread evenly per row
  width. Reward overlay choices at y ≈ 260/370/480, Skip below.
- Gacha: Pull x1 button (292, 646), Pull x5 (508, 646); revealed cards line
  up across y≈380; insufficient-funds hint at y≈700.
- Collection: team-slot avatars y≈138; card grid 4 cols starting y≈300
  (card centers ~x 118/307/496/685), tap card to toggle team membership.

## Flows worth driving
- Drag a gem along cell centers (50ms per step) to make a match; a no-match
  move ends the turn and lets the enemy act (verifies ATK countdown/lock).
- Enemy status line under the HP bar shows `ATK in N`, shield 🛡 and lock 🔒.
- Locked gems render gray-tinted and cannot be picked up or displaced.
- Roguelike run: menu → Roguelike Tower → click highlighted node → battle →
  reward overlays (relic/recruit) → boss → next floor.

## Gotchas
- Free-drag: hold gem keeps following pointer; matches resolve on release.
- Turn timer is 5s from pointerdown — keep scripted drags short.
- localStorage persists currency/collection between page loads; run state is
  in-memory only (module singleton) and dies on reload.
