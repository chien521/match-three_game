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
    const config = LEVELS[0][0];
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
    const lastLevel = LEVELS[LEVELS.length - 1];
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
    const battle = new BattleState(5, testTeam); // Goblin Chief: locks 2 gems
    const action = battle.tickEnemyTurn();
    expect(action.attacks).toBe(true);
    expect(action.locksGems).toBe(2);
  });
});
