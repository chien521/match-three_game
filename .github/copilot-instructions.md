# Repository instructions for AI coding agents

## Auto-commit after every completed task (required)

After you finish each assigned task (all code changes made and verified), you MUST run:

```
npm run autocommit
```

This stages all changes, creates a timestamped commit, and pushes to GitHub
(`scripts/autocommit.mjs`). Run it exactly once per completed task, as your
final step. If you already made a well-described commit yourself, still run it
— it is a no-op when the tree is clean and it ensures the push happened.

Do not skip this step, and do not use `git push --force`.

## Project conventions

- Pure game logic lives in `src/game/` (unit-tested with Vitest, no Phaser
  imports); rendering lives in `src/scenes/`.
- Run `npm test` and `npm run build` before finishing any task — both must pass.
