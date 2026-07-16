// Auto-commit: stages everything, commits with a timestamped message, and
// pushes to the remote. Shared by both AI workflows:
//   - Claude Code runs it from the Stop hook in .claude/settings.json
//   - GitHub Copilot runs it per .github/copilot-instructions.md
// Always exits 0 — a failed push (offline, auth) must never block the agent.
import { execSync } from 'node:child_process';

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

try {
  // Skip mid-merge/rebase states — committing there could bake in conflict markers.
  const gitDir = git('rev-parse --git-dir');
  const { existsSync } = await import('node:fs');
  if (existsSync(`${gitDir}/MERGE_HEAD`) || existsSync(`${gitDir}/rebase-merge`) || existsSync(`${gitDir}/rebase-apply`)) {
    console.log('autocommit: merge/rebase in progress, skipping');
    process.exit(0);
  }

  const status = git('status --porcelain');
  if (status.length > 0) {
    const fileCount = status.split('\n').length;
    git('add -A');
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    execSync(`git commit -m "Auto-commit: ${stamp} (${fileCount} files)"`, { stdio: 'inherit' });
  }

  // Push even when there was nothing new to commit — an earlier push may have failed.
  let needsPush;
  try {
    needsPush = git('rev-list @{u}..HEAD').length > 0;
  } catch {
    needsPush = true; // no upstream configured yet
  }
  if (needsPush) {
    try {
      execSync('git push', { stdio: 'inherit' });
    } catch {
      execSync('git push -u origin HEAD', { stdio: 'inherit' });
    }
  }
} catch (error) {
  console.error(`autocommit: skipped (${error.message.split('\n')[0]})`);
}
process.exit(0);
