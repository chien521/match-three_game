# AGENTS.md

Match-3 puzzle game (Puzzle & Dragons / 神魔之塔 style) built with **TypeScript + Phaser 3 + Vite**, targeting deployment as a standalone WebGL/HTML5 app on [VIVERSE](https://developers.viverse.com/).

## Commands

- `npm run dev` — start Vite dev server with HMR (http://localhost:5173)
- `npm run build` — type-check (`tsc`) then production build to `dist/`
- `npm run preview` — preview the production build locally
- `npm test` — run unit tests (Vitest) for the pure game-logic modules (`Board`, `team.ts`, `BattleState`)

## Architecture

- `src/game/constants.ts` — board size, tile size, gem colors/element names, battle timing (tune gameplay here).
- `src/game/Board.ts` — pure data model (grid, match detection, gravity/refill). No Phaser/rendering dependencies; keep it that way so logic stays testable in isolation.
- `src/game/team.ts` — `Character` roster (id, rarity, element, HP, attack, active skill, optional `leaderSkill`), elemental-advantage math (`elementMultiplier`, bidirectional: resisted matchups deal -50%), group-size damage bonus (`groupSizeMultiplier`), and `computeMatchDamage`/`computeHealAmount` which turn matched gem groups into damage/healing. `DEFAULT_TEAM` is the 5 starter characters every player owns.
- `src/game/characterPool.ts` — `CHARACTER_POOL` = starters + gacha-only characters (Common/Rare/SSR), used by the gacha.
- `src/game/gacha.ts` — `rollGacha()` draws a random character weighted by rarity (`PULL_COST` currency per pull).
- `src/game/playerData.ts` — localStorage-backed save data: currency, owned characters (`copies` = level, scales stats via `leveledCharacter`), and `activeTeamIds` (the battle team, max `MAX_TEAM_SIZE`). `getActiveTeam()` feeds `BattleState`.
- `src/game/levels.ts` — level structure: ordered list of enemies (`EnemyConfig`, each with an element) per level, hand-tuned per level (no global difficulty multiplier — the 9-level story campaign IS the difficulty curve), `LEVEL_NAMES`/`LEVEL_STORY` (narration shown before each level) and `CHAPTERS` (groups levels for the level-select map).
- `src/game/BattleState.ts` — pure data model for the battle flow (team, player HP, enemy HP/attack/element, skill cooldowns, level progression). Also decoupled from Phaser.
- `src/scenes/LevelSelectScene.ts` — level-select menu: a story campaign map grouped into `CHAPTERS`, each a short vertical chain of level nodes; buttons to reach the Gacha/Collection scenes; starts `GameScene` with `{ levelIndex }`.
- `src/scenes/GachaScene.ts` — spend currency to pull a random character (`rollGacha`) into the player's collection.
- `src/scenes/CollectionScene.ts` — combined character codex + team-formation screen: lists owned characters and toggles which are in the active battle team.
- `src/scenes/GameScene.ts` — Phaser scene: renders gems as placeholder colored circles, renders HP bars/turn timer/roster, handles input, and syncs Phaser sprites to the `Board`/`BattleState` data models. Loads the active team via `playerData.getActiveTeam()`.
- `src/main.ts` — Phaser game bootstrap (800x800 canvas, `LevelSelectScene` then `GameScene`).

## Core mechanic: free-drag path swap

Unlike classic match-3 (swap only two adjacent tiles), this game uses the P&D-style mechanic: pointer down picks up a gem, `pointermove` swaps it through any orthogonally-adjacent cell it passes over (see `GameScene.swapHeldWith`), and `pointerup` (or the turn timer expiring, see `GameScene.update`) locks it in and triggers cascade resolution (`GameScene.resolveBoard`). Combo count increases score multiplier per chain. Each turn is time-limited by `TURN_TIME_MS`.

## Battle system: team, elements, skills

Gem colors 0-4 map 1:1 to elements (Fire/Water/Wood/Light/Dark, see `ELEMENT_NAMES`); gem type 5 is the non-elemental Heart orb that heals instead of damaging. Each matched *connected group* of same-color gems contributes damage = sum of attack from team members sharing that element × group size × combo × elemental-advantage multiplier × group-size bonus (`computeMatchDamage`/`Board.groupMatches` in `game/team.ts` and `game/Board.ts`); Fire>Wood>Water>Fire, Light/Dark deal mutual bonus damage, and matchups are bidirectional (attacking into a resisted matchup deals -50%). Groups of 4 gems deal +25% damage, 5+ deal double (`groupSizeMultiplier`) — a simplified stand-in for P&D's 4/5-match and cross/L "jewel combo" bonuses. The team's leader (`team[0].leaderSkill`) can apply a further passive multiplier (e.g. restricted to one element or a minimum combo). Player max HP is the sum of the team's HP.

If the enemy survives a turn, it retaliates after `ENEMY_ATTACK_DELAY_MS` via `BattleState.applyEnemyAttack()`, which also applies the bidirectional elemental multiplier against the team leader's element. Defeating the last enemy in a level advances to the next level (`BattleState.advance`); defeating the last enemy overall wins. Each of the 9 levels (3 chapters of 3) has hand-tuned enemy stats forming the difficulty curve directly — there is no separate difficulty toggle.

Each level opens with a narration overlay (`GameScene.showStoryIntro`, text from `LEVEL_STORY`) that blocks input (`storyDismissed` flag) until the player taps "Begin Battle".

Defeating an enemy also earns gacha currency (`GameScene.handleEnemyDefeated`): `CURRENCY_PER_ENEMY_DEFEAT` per kill, plus `CURRENCY_PER_LEVEL_CLEAR` for the level's last enemy (`BattleState.isFinalEnemyInLevel`), plus `CURRENCY_GAME_CLEAR_BONUS` on beating the final level — this is currently the only way to earn currency for the gacha.

Each character also has an active skill (damage or heal) with a cooldown in turns, shown/clickable in the roster row below the player HP bar (`GameScene.useSkill` / `BattleState.useSkill`) — buttons visually gray out and stop being interactive while on cooldown. Activating a skill does not consume the turn; cooldowns tick down once per completed turn (`BattleState.tickCooldowns`).

## Conventions

- Gem art is placeholder-generated at runtime via `Graphics.generateTexture` (see `createGemTextures`) — no external art assets yet. Replace with real sprite sheets later by swapping the texture keys (`gem-0`..`gem-N`).
- Board logic (`Board`) and rendering/input (`GameScene`) are intentionally decoupled — add new board rules in `Board`, not in the scene. Same principle applies to `BattleState`/`team.ts` vs. `GameScene`.
- tsconfig enables `erasableSyntaxOnly` + `verbatimModuleSyntax` — avoid TS parameter-property constructor shorthand and use `import type` for type-only imports.
- `GameScene` instances are reused by Phaser across `scene.start()` calls — reset any per-run mutable state (score, flags) at the top of `create()`.

## Deployment

Publish the `dist/` output to VIVERSE as a Standalone App (WebGL/HTML5) — see [VIVERSE docs](https://docs.viverse.com/) for the publishing CLI.
