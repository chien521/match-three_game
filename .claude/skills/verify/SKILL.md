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
polls a `cmd.json` for `{seq, action: click|drag|wait|eval|reload|exit, x, y,
path, ms, code, name}`, executes it, screenshots to `shot-<name>.png`, and
writes `result.txt` with the seq. `eval` runs `page.evaluate(cmd.code)` (e.g.
to seed `localStorage` progress without playing 17 levels by hand); `reload`
does `page.reload()` to pick that up. Read screenshots with the Read tool to
see the board, then plan the next input. NOTE: node resolves
`playwright-core` relative to the script location — import it via
`createRequire('<repo>/package.json')`.

## Chapters (game/levels.ts's CHAPTERS)

The campaign is split into 3 chapters (`ch1`/`ch2`/`ch3`), each its own full
prologue→4 branches→final-boss graph (17 levels each) — one map screen can't
fit all three, so `ChapterSelectScene` (the game's initial scene) is a picker
with one card per chapter. A chapter unlocks once its first level is
reachable, via the normal `unlockRequires` chain (chapter N's prologue-1
requires chapter N-1's final-boss level) — no separate chapter-unlock state.
`LevelSelectScene` now takes `{ chapterId }` (defaults to `ch1`); it filters
`BRANCHES` down to that chapter and lays out the map exactly like before,
just relative to that chapter's own prologue/branches/final instead of
hardcoded `'prologue'`/`'final'` ids.

To jump straight to chapter 2/3 without clearing chapter 1/2 by hand, seed
`localStorage` then reload:
```json
{"action":"eval","code":"localStorage.setItem('match3-player-data', JSON.stringify({currency:9999,owned:[{id:'firebrand',copies:1}],activeTeamIds:['firebrand'],levelStars:{'final-3':3,'ch2-final-3':3}}))"}
{"action":"reload"}
```
(`final-3` cleared unlocks ch2; `ch2-final-3` cleared unlocks ch3.)

## Key coordinates (800x800 canvas)
- Board: 6 cols x 5 rows, tile 96, origin (112, 230). Cell center:
  `x = 160 + 96*col`, `y = 278 + 96*row`. Enemy emoji sprite at (400, ~176).
- ChapterSelectScene (initial scene): 3 vertical cards, centers y ≈ 170
  (ch1), 304 (ch2), 438 (ch3), each ~560x110. Locked chapters show 🔒 and
  aren't clickable. Clicking an unlocked card starts LevelSelectScene with
  `{ chapterId }`.
- Level-select is a branching campaign map for ONE chapter (GameScene takes
  `{ levelId }`, not an index — chapter membership is derived from the level
  id via `chapterForLevel()`). Prologue nodes (400,706),(400,640); four
  parallel branch columns evenly spread x ≈ 120/307/493/680 with rows y =
  564, 492, 420 (bottom→top; row 420 = branch boss); final branch
  (400,330),(400,256),(400,182). A chapter's final-1 unlocks only after all
  four of that chapter's branch bosses are cleared. Locked levels show 🔒 and
  are not clickable. Column x-positions are computed by `columnX()` in
  LevelSelectScene.ts — evenly spread between margins, so adding/removing a
  branch shifts every column automatically.
  Bottom nav buttons y=764: Chapters x≈217 (back to ChapterSelectScene),
  Gacha x≈400, Collection x≈583 (3 buttons now, auto-centered).
- Clearing a chapter's own final boss routes "Back to Map"/"Back to Menu" to
  ChapterSelectScene (so a newly-unlocked chapter is visible); clearing any
  other level routes back to that level's own chapter's LevelSelectScene.
  Only the LAST chapter's final boss (`ch3-final-3`) triggers the "game
  clear" bonus/splash — earlier chapters' finales are treated as a normal
  chapter-clear, not the campaign ending.
- Story intro "Begin Battle" button: (400, 520). Boss levels play a BOSS
  splash right after dismissing the intro.
- Skill buttons (5-member team) y≈774: x ≈ 93, 246, 399, 553, 706.
- End-of-level results panel buttons y≈514: primary (Next Level) x≈302,
  secondary (Back to Map) x≈498.
- Gacha: Pull x1 button (292, 646), Pull x5 (508, 646); revealed cards line
  up across y≈380; insufficient-funds hint at y≈700.
- Collection: team-slot avatars y≈138; card grid 4 cols starting y≈299
  (card centers ~x 115/305/495/685, row gap 172px). Tapping a grid card opens
  a detail popup (name/rarity/element/level/stats, active skill name+cooldown
  +description, leader skill name+description) centered at (400,400), panel
  560x460 → panel spans x 120-680, y 170-630. Popup has an Add/Remove-Team
  button at y≈573 and a ✕ close at top-right (≈656,186); clicking the dimmed
  backdrop outside the panel also closes it without affecting any card
  underneath. Tapping a filled team-bar slot directly (not via the popup)
  removes that member immediately, in place.

## Flows worth driving
- Removing a team member (via the team bar or the card-detail popup) leaves
  that slot empty — later slots do NOT shift forward, so team order (and
  who's team[0]/leader) stays stable across edits. Adding a character back
  fills the first empty slot, left to right, not necessarily their old slot
  unless it's still the first empty one. `activeTeamIds` in PlayerData can
  contain `''` for an empty slot; `getActiveTeam()` drops those when building
  the battle roster.
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
  removed — story mode is the only game mode.

- Every playable character (CHARACTER_POOL) has a `leaderSkill`, shown as a
  small blue line under the score in battle ("隊長技：{name}——{desc}") when
  `team[0]` has one — which is always true now. Rarer characters have higher
  multipliers (Common ~1.2-1.3x, Rare ~1.4-1.6x, SSR ~1.5-2x); some are
  element-restricted, some are combo-gated (`minCombo`). Only `team[0]`'s
  leader skill applies — set `activeTeamIds` order (via Collection, or the
  seeded-`localStorage` trick above) to put a specific character in the lead.

## Gotchas
- Free-drag: hold gem keeps following pointer; matches resolve on release.
- Turn timer is 5s from pointerdown — keep scripted drags short.
- localStorage persists currency/collection/level-stars between page loads.
