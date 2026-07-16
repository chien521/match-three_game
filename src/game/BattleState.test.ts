import { describe, expect, it } from 'vitest';
import { BattleState } from './BattleState';
import type { Character } from './team';
import { LEVELS } from './levels';

const testTeam: Character[] = [
  {
    id: 'test-a',
    name: 'Test A',
    rarity: 'Rare',
    element: 0,
    maxHp: 50,
    attack: 40,
    skillName: 'Zap',
    skillCooldownTurns: 2,
    skillEffect: 'damage',
    skillPower: 30,
  },
  {
    id: 'test-b',
    name: 'Test B',
    rarity: 'Rare',
    element: 1,
    maxHp: 60,
    attack: 20,
    skillName: 'Mend',
    skillCooldownTurns: 3,
    skillEffect: 'heal',
    skillPower: 25,
  },
];
describe('BattleState', () => {
  it('sets playerMaxHp/playerHp to the sum of the team HP', () => {
    const battle = new BattleState(0, testTeam);
    expect(battle.playerMaxHp).toBe(110);
    expect(battle.playerHp).toBe(110);
  });

  it('spawns the first enemy of the requested level', () => {
    const battle = new BattleState(0, testTeam);
    const config = LEVELS[0].enemies[0];
    expect(battle.enemy.name).toBe(config.name);
    expect(battle.enemy.maxHp).toBe(config.maxHp);
  });

  it('damageEnemy reduces enemy HP and reports defeat at 0', () => {
    const battle = new BattleState(0, testTeam);
    const defeated = battle.damageEnemy(battle.enemy.maxHp - 1);
    expect(defeated).toBe(false);
    expect(battle.damageEnemy(1)).toBe(true);
    expect(battle.enemy.hp).toBe(0);
  });

  it('damageEnemy never drops enemy HP below 0', () => {
    const battle = new BattleState(0, testTeam);
    battle.damageEnemy(battle.enemy.maxHp + 999);
    expect(battle.enemy.hp).toBe(0);
  });

  it('healPlayer restores HP but caps at playerMaxHp', () => {
    const battle = new BattleState(0, testTeam);
    battle.damagePlayer(50);
    battle.healPlayer(20);
    expect(battle.playerHp).toBe(80);
    battle.healPlayer(999);
    expect(battle.playerHp).toBe(battle.playerMaxHp);
  });

  it('applyEnemyAttack scales by elemental advantage against the leader element', () => {
    // Level 1 enemy (Slime) is Wood(2). Leader (testTeam[0]) is Fire(0), which beats Wood.
    // Fire is resisted by Wood's counter... actually Fire beats Wood, so the *enemy* (Wood)
    // attacking a Fire leader is the unfavorable direction for the enemy: -50%.
    const battle = new BattleState(0, testTeam);
    const baseAttack = battle.enemy.attack;
    battle.applyEnemyAttack();
    const damageTaken = battle.playerMaxHp - battle.playerHp;
    expect(damageTaken).toBe(Math.round(baseAttack * 0.5));
  });

  it('useSkill applies damage, sets cooldown, and blocks reuse until it ticks down', () => {
    const battle = new BattleState(0, testTeam);
    const before = battle.enemy.hp;
    const result = battle.useSkill(0);
    expect(result?.effect).toBe('damage');
    expect(battle.enemy.hp).toBe(before - 30);
    expect(battle.canUseSkill(0)).toBe(false);
    expect(battle.useSkill(0)).toBeNull();

    battle.tickCooldowns();
    expect(battle.canUseSkill(0)).toBe(false); // cooldown is 2 turns
    battle.tickCooldowns();
    expect(battle.canUseSkill(0)).toBe(true);
  });

  it('useSkill applies healing without exceeding playerMaxHp', () => {
    const battle = new BattleState(0, testTeam);
    battle.damagePlayer(10);
    const result = battle.useSkill(1);
    expect(result?.effect).toBe('heal');
    expect(battle.playerHp).toBe(battle.playerMaxHp);
  });

  it('useSkill reports convert with from/to and does not touch HP or the enemy', () => {
    const convertTeam: Character[] = [
      {
        id: 'test-c',
        name: 'Test C',
        rarity: 'Common',
        element: 1,
        maxHp: 40,
        attack: 10,
        skillName: 'Tidal Shift',
        skillCooldownTurns: 2,
        skillEffect: 'convert',
        skillConvertFrom: 1,
        skillConvertTo: 5,
      },
    ];
    const battle = new BattleState(0, convertTeam);
    const hpBefore = battle.playerHp;
    const enemyHpBefore = battle.enemy.hp;

    const result = battle.useSkill(0);
    expect(result).toEqual({ effect: 'convert', from: 1, to: 5, enemyDefeated: false });
    expect(battle.playerHp).toBe(hpBefore);
    expect(battle.enemy.hp).toBe(enemyHpBefore);
    expect(battle.canUseSkill(0)).toBe(false);
  });

  it('useSkill reports extendTime with the bonus ms and does not touch HP or the enemy', () => {
    const timeTeam: Character[] = [
      {
        id: 'test-d',
        name: 'Test D',
        rarity: 'Common',
        element: 3,
        maxHp: 38,
        attack: 10,
        skillName: 'Temporal Boost',
        skillCooldownTurns: 2,
        skillEffect: 'extendTime',
        skillPower: 3000,
      },
    ];
    const battle = new BattleState(0, timeTeam);
    const hpBefore = battle.playerHp;
    const enemyHpBefore = battle.enemy.hp;

    const result = battle.useSkill(0);
    expect(result).toEqual({ effect: 'extendTime', bonusMs: 3000, enemyDefeated: false });
    expect(battle.playerHp).toBe(hpBefore);
    expect(battle.enemy.hp).toBe(enemyHpBefore);
  });

  it('advance() moves to the next enemy within a level, then the next level', () => {
    const battle = new BattleState(1, testTeam); // Level 2 has two enemies
    expect(battle.enemyIndexInLevel).toBe(0);
    const hasNext = battle.advance();
    expect(hasNext).toBe(true);
    expect(battle.enemyIndexInLevel).toBe(1);

    const hasNext2 = battle.advance();
    expect(hasNext2).toBe(true);
    expect(battle.levelIndex).toBe(2);
    expect(battle.enemyIndexInLevel).toBe(0);
  });

  it('advance() returns false after the very last enemy', () => {
    const battle = new BattleState(LEVELS.length - 1, testTeam);
    const lastLevel = LEVELS[LEVELS.length - 1].enemies;
    for (let i = 0; i < lastLevel.length - 1; i++) {
      expect(battle.advance()).toBe(true);
    }
    expect(battle.advance()).toBe(false);
  });

  it('tickEnemyTurn attacks every turn for interval-1 enemies', () => {
    const battle = new BattleState(0, testTeam); // Slime: default interval 1
    expect(battle.enemy.attackInterval).toBe(1);
    expect(battle.tickEnemyTurn().attacks).toBe(true);
    expect(battle.tickEnemyTurn().attacks).toBe(true);
  });

  it('tickEnemyTurn counts down over multiple turns for slower enemies', () => {
    const battle = new BattleState(2, testTeam); // Slime King: attackInterval 2
    expect(battle.enemy.attackCountdown).toBe(2);
    expect(battle.tickEnemyTurn().attacks).toBe(false);
    expect(battle.enemy.attackCountdown).toBe(1);
    expect(battle.tickEnemyTurn().attacks).toBe(true);
    expect(battle.enemy.attackCountdown).toBe(2); // reset after attacking
  });

  it('shield reduces incoming damage while active, then expires', () => {
    const battle = new BattleState(2, testTeam); // Slime King: 50% shield for 3 turns
    expect(battle.enemy.shieldTurns).toBe(3);
    const before = battle.enemy.hp;
    battle.damageEnemy(100);
    expect(before - battle.enemy.hp).toBe(50); // halved by the shield

    battle.tickEnemyTurn();
    battle.tickEnemyTurn();
    battle.tickEnemyTurn();
    expect(battle.enemy.shieldTurns).toBe(0);

    const later = battle.enemy.hp;
    battle.damageEnemy(100);
    expect(later - battle.enemy.hp).toBe(100); // full damage once expired
  });

  it('lock-skill enemies report gems to lock when they attack', () => {
    const battle = new BattleState(5, testTeam); // Goblin Chief: locks 2 gems, charges for 3 turns
    battle.tickEnemyTurn();
    battle.tickEnemyTurn();
    const action = battle.tickEnemyTurn();
    expect(action.attacks).toBe(true);
    expect(action.locksGems).toBe(2);
  });
});

describe('BattleState expanded enemy skills', () => {
  it('spawnEnemy treats a legacy single skill and a skills[] array the same way', () => {
    const legacy = new BattleState(0, testTeam, {
      levels: [[{ name: 'Legacy', maxHp: 100, attack: 10, element: 0, skill: { type: 'lock', lockCount: 2 } }]],
    });
    const modern = new BattleState(0, testTeam, {
      levels: [
        [{ name: 'Modern', maxHp: 100, attack: 10, element: 0, skills: [{ type: 'lock', lockCount: 2 }] }],
      ],
    });
    expect(legacy.enemy.lockCountOnAttack).toBe(2);
    expect(modern.enemy.lockCountOnAttack).toBe(2);
  });

  it('charge skill attacks only after chargeTurns, with a multiplied hit', () => {
    const battle = new BattleState(0, testTeam, {
      levels: [
        [
          {
            name: 'Charger',
            maxHp: 1000,
            attack: 10,
            element: 0,
            skills: [{ type: 'charge', chargeTurns: 3, multiplier: 2.5, interruptRatio: 0.9 }],
          },
        ],
      ],
    });
    expect(battle.enemy.chargeCountdown).toBe(3);
    let action = battle.tickEnemyTurn();
    expect(action.attacks).toBe(false);
    expect(action.chargingTicked).toBe(true);
    action = battle.tickEnemyTurn();
    expect(action.attacks).toBe(false);
    action = battle.tickEnemyTurn();
    expect(action.attacks).toBe(true);
    expect(action.attackMultiplier).toBe(2.5);
    expect(battle.enemy.chargeCountdown).toBe(3); // reset after the big hit
  });

  it('charge is interrupted (no hit) once accumulated damage crosses the interrupt ratio', () => {
    const battle = new BattleState(0, testTeam, {
      levels: [
        [
          {
            name: 'Charger',
            maxHp: 1000,
            attack: 10,
            element: 0,
            skills: [{ type: 'charge', chargeTurns: 3, multiplier: 2.5, interruptRatio: 0.1 }],
          },
        ],
      ],
    });
    battle.damageEnemy(200); // 20% of maxHp, over the 10% interrupt threshold
    const action = battle.tickEnemyTurn();
    expect(action.chargeInterrupted).toBe(true);
    expect(action.attacks).toBe(false);
    expect(battle.enemy.chargeDamageAccum).toBe(0);
    expect(battle.enemy.chargeCountdown).toBe(3);
  });

  it('enrage triggers once permanently when HP drops below the threshold, and boosts attack', () => {
    const battle = new BattleState(0, testTeam, {
      levels: [
        [
          {
            name: 'Berserker',
            maxHp: 100,
            attack: 10,
            element: 0,
            skills: [{ type: 'enrage', hpThreshold: 0.5, attackMultiplier: 2 }],
          },
        ],
      ],
    });
    expect(battle.enemy.enraged).toBe(false);
    battle.damageEnemy(60); // drops to 40/100 hp, under the 50% threshold
    expect(battle.enemy.enraged).toBe(true);
    expect(battle.enemy.attack).toBe(20);
    const action = battle.tickEnemyTurn();
    expect(action.becameEnraged).toBe(true);

    // Further damage does not re-trigger or re-multiply the attack.
    battle.damageEnemy(10);
    expect(battle.enemy.attack).toBe(20);
    const action2 = battle.tickEnemyTurn();
    expect(action2.becameEnraged).toBe(false);
  });

  it('selfHeal restores HP every N turns, capped at maxHp', () => {
    const battle = new BattleState(0, testTeam, {
      levels: [
        [
          {
            name: 'Healer',
            maxHp: 100,
            attack: 10,
            element: 0,
            skills: [{ type: 'selfHeal', amount: 30, everyTurns: 2 }],
          },
        ],
      ],
    });
    battle.damageEnemy(80); // hp = 20
    let action = battle.tickEnemyTurn();
    expect(action.selfHealed).toBe(0);
    action = battle.tickEnemyTurn();
    expect(action.selfHealed).toBe(30);
    expect(battle.enemy.hp).toBe(50);

    battle.damageEnemy(45); // hp = 5
    battle.tickEnemyTurn();
    action = battle.tickEnemyTurn();
    expect(battle.enemy.hp).toBe(35); // capped math: 5 + 30, still under maxHp
  });

  it('poison applies on attack, ticks damage each turn, and expires without stacking', () => {
    const battle = new BattleState(0, testTeam, {
      levels: [
        [
          {
            name: 'Poisoner',
            maxHp: 100,
            attack: 10,
            element: 0,
            attackInterval: 3, // only attacks on turn 3, giving room to observe the tick/expiry alone
            skills: [{ type: 'poison', damagePerTurn: 15, durationTurns: 2 }],
          },
        ],
      ],
    });
    const hpBefore = battle.playerHp;
    expect(battle.tickEnemyTurn().attacks).toBe(false); // turn 1
    expect(battle.tickEnemyTurn().attacks).toBe(false); // turn 2

    const attackAction = battle.tickEnemyTurn(); // turn 3: attacks, applies poison
    expect(attackAction.attacks).toBe(true);
    expect(attackAction.appliesPoison).toEqual({ damagePerTurn: 15, durationTurns: 2 });
    expect(battle.poisonDamagePerTurn).toBe(15);
    expect(battle.poisonTurnsLeft).toBe(2);

    const tick1 = battle.tickEnemyTurn(); // turn 4: no attack, poison ticks
    expect(tick1.attacks).toBe(false);
    expect(tick1.poisonDamage).toBe(15);
    expect(battle.playerHp).toBe(hpBefore - 15);
    expect(battle.poisonTurnsLeft).toBe(1);

    const tick2 = battle.tickEnemyTurn(); // turn 5: no attack, poison ticks and expires
    expect(tick2.attacks).toBe(false);
    expect(tick2.poisonDamage).toBe(15);
    expect(battle.poisonTurnsLeft).toBe(0);

    const tick3 = battle.tickEnemyTurn(); // turn 6: attacks again, but poison already expired before this tick
    expect(tick3.poisonDamage).toBe(0);
    expect(battle.playerHp).toBe(hpBefore - 30);
  });

  it('convertGems/petrify/ignite are only reported on the turn the enemy actually attacks', () => {
    const battle = new BattleState(0, testTeam, {
      levels: [
        [
          {
            name: 'Trickster',
            maxHp: 100,
            attack: 10,
            element: 0,
            attackInterval: 2,
            skills: [
              { type: 'convertGems', from: 0, to: 1, count: 3 },
              { type: 'petrify', count: 2 },
              { type: 'ignite', count: 1, durationTurns: 2 },
            ],
          },
        ],
      ],
    });
    const first = battle.tickEnemyTurn();
    expect(first.attacks).toBe(false);
    expect(first.convertsGems).toBeNull();
    expect(first.petrifies).toBe(0);
    expect(first.ignites).toBeNull();

    const second = battle.tickEnemyTurn();
    expect(second.attacks).toBe(true);
    expect(second.convertsGems).toEqual({ from: 0, to: 1, count: 3 });
    expect(second.petrifies).toBe(2);
    expect(second.ignites).toEqual({ count: 1, durationTurns: 2 });
  });

  it('supports multiple simultaneous skills on one enemy (shield + charge + ignite)', () => {
    const battle = new BattleState(0, testTeam, {
      levels: [
        [
          {
            name: 'Multi',
            maxHp: 1000,
            attack: 10,
            element: 0,
            skills: [
              { type: 'shield', damageReduction: 0.5, durationTurns: 5 },
              { type: 'charge', chargeTurns: 2, multiplier: 3, interruptRatio: 0.9 },
              { type: 'ignite', count: 1, durationTurns: 1 },
            ],
          },
        ],
      ],
    });
    expect(battle.enemy.shieldTurns).toBe(5);
    expect(battle.enemy.chargeTurns).toBe(2);

    battle.tickEnemyTurn();
    const action = battle.tickEnemyTurn();
    expect(action.attacks).toBe(true);
    expect(action.attackMultiplier).toBe(3);
    expect(action.ignites).toEqual({ count: 1, durationTurns: 1 });
    expect(battle.enemy.shieldTurns).toBe(3); // ticked down twice
  });

  it('applyEnemyAttack multiplies damage by the given multiplier on top of elemental scaling', () => {
    const battle = new BattleState(0, testTeam);
    const baseAttack = battle.enemy.attack;
    battle.applyEnemyAttack(2);
    const damageTaken = battle.playerMaxHp - battle.playerHp;
    expect(damageTaken).toBe(Math.round(baseAttack * 0.5 * 2));
  });
});

describe('BattleState turn limits', () => {
  it('has no turn limit by default (isOutOfTurns is always false)', () => {
    const battle = new BattleState(0, testTeam);
    expect(battle.turnLimit).toBeUndefined();
    for (let i = 0; i < 10; i++) battle.tickEnemyTurn();
    expect(battle.turnCount).toBe(10);
    expect(battle.isOutOfTurns()).toBe(false);
  });

  it('tracks turnCount and picks up turnLimit from options.rules', () => {
    const battle = new BattleState(0, testTeam, {
      levels: [[{ name: 'Turtle', maxHp: 1000, attack: 5, element: 0 }]],
      rules: { turnLimit: 3 },
    });
    expect(battle.turnLimit).toBe(3);
    expect(battle.turnCount).toBe(0);

    battle.tickEnemyTurn();
    expect(battle.turnCount).toBe(1);
    expect(battle.isOutOfTurns()).toBe(false);

    battle.tickEnemyTurn();
    expect(battle.turnCount).toBe(2);
    expect(battle.isOutOfTurns()).toBe(false);

    battle.tickEnemyTurn();
    expect(battle.turnCount).toBe(3);
    expect(battle.isOutOfTurns()).toBe(true); // limit reached, enemy still alive
  });

  it('clearing the enemy on the last allowed turn is a win, not a loss', () => {
    const battle = new BattleState(0, testTeam, {
      levels: [[{ name: 'Turtle', maxHp: 10, attack: 5, element: 0 }]],
      rules: { turnLimit: 3 },
    });

    battle.tickEnemyTurn();
    battle.tickEnemyTurn();
    battle.tickEnemyTurn(); // turnCount reaches the limit
    expect(battle.turnCount).toBe(3);

    // The enemy is defeated on this very turn (e.g. the player's last match).
    battle.damageEnemy(1000);
    expect(battle.enemy.hp).toBe(0);
    expect(battle.isOutOfTurns()).toBe(false); // won, not out of turns
  });
});
