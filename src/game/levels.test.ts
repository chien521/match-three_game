import { describe, expect, it } from 'vitest';
import { BRANCHES, LEVELS, branchForLevel, levelById, nextLevelIdInBranch } from './levels';
import { GEM_TYPE_COUNT } from './constants';

describe('campaign graph', () => {
  it('level ids are unique', () => {
    const ids = LEVELS.map((level) => level.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every unlockRequires entry names an existing level', () => {
    for (const level of LEVELS) {
      for (const requiredId of level.unlockRequires) {
        expect(levelById(requiredId), `${level.id} requires missing ${requiredId}`).toBeDefined();
      }
    }
  });

  it('the unlock graph has no cycles (every level is reachable)', () => {
    // Walk the graph: repeatedly "clear" every level whose requirements are
    // met. If the graph is acyclic, all levels get cleared eventually.
    const cleared = new Set<string>();
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const level of LEVELS) {
        if (cleared.has(level.id)) continue;
        if (level.unlockRequires.every((id) => cleared.has(id))) {
          cleared.add(level.id);
          progressed = true;
        }
      }
    }
    expect(cleared.size).toBe(LEVELS.length);
  });

  it('the prologue entry is always open', () => {
    expect(levelById('prologue-1')?.unlockRequires).toEqual([]);
  });

  it('the final chapter gate requires exactly the three branch bosses', () => {
    expect(new Set(levelById('final-1')?.unlockRequires)).toEqual(
      new Set(['fire-3', 'water-3', 'wood-3']),
    );
  });

  it('every level belongs to exactly one branch, and branches only name real levels', () => {
    const seen = new Map<string, number>();
    for (const branch of BRANCHES) {
      for (const id of branch.levelIds) {
        expect(levelById(id), `branch ${branch.id} names missing level ${id}`).toBeDefined();
        seen.set(id, (seen.get(id) ?? 0) + 1);
      }
    }
    for (const level of LEVELS) {
      expect(seen.get(level.id), `${level.id} missing from BRANCHES`).toBe(1);
    }
  });

  it('each elemental branch ends in a boss level', () => {
    for (const branch of BRANCHES) {
      if (branch.column === 'single') continue;
      const bossLevel = levelById(branch.levelIds[branch.levelIds.length - 1]);
      expect(bossLevel?.enemies.some((e) => e.boss), `${branch.id} boss`).toBe(true);
    }
  });

  it('branchForLevel / nextLevelIdInBranch navigate within a branch', () => {
    expect(branchForLevel('fire-2')?.id).toBe('fire');
    expect(nextLevelIdInBranch('fire-1')).toBe('fire-2');
    expect(nextLevelIdInBranch('fire-3')).toBeNull(); // branch boss: back to the map
    expect(nextLevelIdInBranch('final-3')).toBeNull();
    expect(nextLevelIdInBranch('nonexistent')).toBeNull();
  });
});

describe('levels schema', () => {
  for (const level of LEVELS) {
    describe(level.name, () => {
      it('has a non-empty name and story', () => {
        expect(level.name.length).toBeGreaterThan(0);
        expect(level.story.length).toBeGreaterThan(0);
      });

      it('has at least one enemy, each with positive stats and a valid element', () => {
        expect(level.enemies.length).toBeGreaterThan(0);
        for (const enemy of level.enemies) {
          expect(enemy.maxHp).toBeGreaterThan(0);
          expect(enemy.attack).toBeGreaterThan(0);
          expect(enemy.element).toBeGreaterThanOrEqual(0);
          expect(enemy.element).toBeLessThan(5); // 0-4: Fire/Water/Wood/Light/Dark
          if (enemy.attackInterval !== undefined) {
            expect(enemy.attackInterval).toBeGreaterThanOrEqual(1);
          }
        }
      });

      it('has skill params in sane ranges', () => {
        for (const enemy of level.enemies) {
          const skills = enemy.skills ?? (enemy.skill ? [enemy.skill] : []);
          for (const skill of skills) {
            switch (skill.type) {
              case 'shield':
                expect(skill.damageReduction).toBeGreaterThan(0);
                expect(skill.damageReduction).toBeLessThanOrEqual(1);
                expect(skill.durationTurns).toBeGreaterThan(0);
                break;
              case 'lock':
                expect(skill.lockCount).toBeGreaterThan(0);
                break;
              case 'charge':
                expect(skill.chargeTurns).toBeGreaterThan(0);
                expect(skill.multiplier).toBeGreaterThan(1);
                expect(skill.interruptRatio).toBeGreaterThan(0);
                expect(skill.interruptRatio).toBeLessThanOrEqual(1);
                break;
              case 'enrage':
                expect(skill.hpThreshold).toBeGreaterThan(0);
                expect(skill.hpThreshold).toBeLessThan(1);
                expect(skill.attackMultiplier).toBeGreaterThan(1);
                break;
              case 'selfHeal':
                expect(skill.amount).toBeGreaterThan(0);
                expect(skill.everyTurns).toBeGreaterThan(0);
                break;
              case 'convertGems':
                expect(skill.from).toBeGreaterThanOrEqual(0);
                expect(skill.from).toBeLessThan(GEM_TYPE_COUNT);
                expect(skill.to).toBeGreaterThanOrEqual(0);
                expect(skill.to).toBeLessThan(GEM_TYPE_COUNT);
                expect(skill.from).not.toBe(skill.to);
                expect(skill.count).toBeGreaterThan(0);
                break;
              case 'poison':
                expect(skill.damagePerTurn).toBeGreaterThan(0);
                expect(skill.durationTurns).toBeGreaterThan(0);
                break;
              case 'petrify':
                expect(skill.count).toBeGreaterThan(0);
                break;
              case 'ignite':
                expect(skill.count).toBeGreaterThan(0);
                expect(skill.durationTurns).toBeGreaterThan(0);
                break;
            }
          }
        }
      });

      it('rules.gemColors (if present) is a subset of 0..GEM_TYPE_COUNT-1 with at least 3 entries', () => {
        const gemColors = level.rules?.gemColors;
        if (gemColors === undefined) return;
        expect(gemColors.length).toBeGreaterThanOrEqual(3);
        expect(new Set(gemColors).size).toBe(gemColors.length); // no duplicates
        for (const type of gemColors) {
          expect(type).toBeGreaterThanOrEqual(0);
          expect(type).toBeLessThan(GEM_TYPE_COUNT);
        }
      });

      it('rules.turnLimit / rules.moveTimeMs (if present) are positive', () => {
        if (level.rules?.turnLimit !== undefined) {
          expect(level.rules.turnLimit).toBeGreaterThan(0);
        }
        if (level.rules?.moveTimeMs !== undefined) {
          expect(level.rules.moveTimeMs).toBeGreaterThan(0);
        }
      });

      it('a "turns" starCriteria has a stricter threeStar threshold than twoStar', () => {
        const criteria = level.starCriteria;
        if (!criteria || criteria.type !== 'turns') return;
        expect(criteria.threeStar).toBeGreaterThan(0);
        expect(criteria.twoStar).toBeGreaterThan(0);
        expect(criteria.threeStar).toBeLessThan(criteria.twoStar);
      });
    });
  }
});
