# Verify: 轉珠 Match-3 (Phaser browser game)

## Build / launch
- `npm test` — vitest unit tests for pure logic (Board/BattleState/team/levels).
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
- Level-select is a branching campaign map (GameScene takes `{ levelId }`,
  not an index). Prologue nodes (400,706),(400,640); four parallel branch
  columns evenly spread x ≈ 120 (fire), 307 (water), 493 (wood), 680 (sky)
  with rows y = 564, 492, 420 (bottom→top; row 420 = branch boss); final
  chapter (400,330),(400,256),(400,182). final-1 unlocks only after
  fire-3/water-3/wood-3/sky-3 are all cleared. Locked levels show 🔒 and are
  not clickable. Column x-positions are computed by `columnX()` in
  LevelSelectScene.ts — evenly spread between margins, so adding/removing a
  branch shifts every column automatically.
  Bottom nav buttons y=764: Gacha x≈309, Collection x≈491 (only 2 buttons
  now — no roguelike tower entry exists anywhere in the game).
- Story intro "Begin Battle" button: (400, 520). Boss levels play a BOSS
  splash right after dismissing the intro.
- Skill buttons (5-member team) y≈774: x ≈ 93, 246, 399, 553, 706.
- End-of-level results panel buttons y≈514: primary (Next Level) x≈302,
  secondary (Back to Map) x≈498.
- Gacha: Pull x1 button (292, 646), Pull x5 (508, 646); revealed cards line
  up across y≈380; insufficient-funds hint at y≈700.
- Collection: team-slot avatars y≈138; card grid 4 cols starting y≈300
  (card centers ~x 118/307/496/685), tap card to toggle team membership.

## Flows worth driving
- Drag a gem along cell centers (50ms per step) to make a match; a no-match
  move ends the turn and lets the enemy act (verifies ATK countdown/lock).
- Enemy status line under the HP bar shows `ATK in N`, shield 🛡 and lock 🔒.
- Locked gems render gray-tinted and cannot be picked up or displaced.

- Language toggle (EN/中 pill): top-left ~(36,30) on map/gacha/collection
  scenes (restarts the scene); top-right ~(755,20) in battle (live refresh, no
  reset). Headless Edge auto-detects zh — screens may boot in Chinese.

- Skill cooldowns now persist across story "Next Level ▶" transitions within
  a branch (see game/storyCooldowns.ts) — a level cleared with a skill on
  cooldown should show it still cooling down in the next level's
  intro/roster, not reset to Ready. Any other entry into GameScene (map
  click, retry after defeat) starts with fresh (zeroed) cooldowns.

- The roguelike tower mode (RunMapScene/game/run.ts/game/relics.ts) was
  removed — story mode is the only game mode. The campaign map now has four
  parallel branches (fire/water/wood/sky) instead of three, converging into
  the final chapter once all four branch bosses are cleared.

## Gotchas
- Free-drag: hold gem keeps following pointer; matches resolve on release.
- Turn timer is 5s from pointerdown — keep scripted drags short.
- localStorage persists currency/collection/level-stars between page loads.
