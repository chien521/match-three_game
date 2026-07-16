# Match-Three Game

[![Live Demo](https://img.shields.io/badge/demo-play%20now-39f6ff)](https://chien521.github.io/match-three_game/)

**[▶ Play the live demo](https://chien521.github.io/match-three_game/)** — no install needed.

A Puzzle & Dragons–style match-3 RPG built with **TypeScript**, **Phaser 3**, and **Vite**.

Match colored gems using a free-drag path swap (not just adjacent-tile swaps) to deal elemental damage, build a team of characters pulled from a gacha system, and clear a 9-level story campaign.

## Features

- **Free-drag match-3 board** — drag a gem through any orthogonally-adjacent cell to chain swaps, then release to resolve cascades and combos.
- **Elemental battle system** — Fire/Water/Wood/Light/Dark matchups with bidirectional advantage/resist multipliers, group-size damage bonuses, and Heart orbs for healing.
- **Team building & gacha** — collect characters of varying rarity, form an active team with leader skills, and use active skills with per-character cooldowns.
- **Story campaign** — 9 hand-tuned levels across 3 chapters, each with narrative intros.

## Getting started

```bash
npm install
npm run dev       # start Vite dev server with HMR (http://localhost:5173)
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc`) then build production output to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run unit tests (Vitest) for the game-logic modules |

## Tech stack

- [Phaser 3](https://phaser.io/) for rendering and scene management
- [Vite](https://vitejs.dev/) for dev/build tooling
- TypeScript throughout, with pure/testable game-logic modules (`Board`, `BattleState`, `team`) decoupled from Phaser rendering

## Project structure

See [AGENTS.md](./AGENTS.md) for a detailed architecture breakdown of the game modules and scenes.

## Deployment

The production build (`dist/`) targets deployment as a standalone WebGL/HTML5 app on [VIVERSE](https://developers.viverse.com/).

### Deploying to GitHub Pages

Every push to `main` runs [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml), which builds the project and publishes `/dist` to GitHub Pages automatically — that's what powers the [live demo](https://chien521.github.io/match-three_game/) link above. No manual `gh-pages` branch or build step needed; just push to `main` and the Actions run handles the rest (enable it once under the repo's **Settings → Pages → Source: GitHub Actions**).
