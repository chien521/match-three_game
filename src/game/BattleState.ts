import type { EnemyConfig } from './levels';
import { LEVELS } from './levels';
import type { Character } from './team';
import { DEFAULT_TEAM, elementMultiplier, teamTotalHp } from './team';

export interface EnemyState {
  name: string;
  maxHp: number;
  hp: number;
  attack: number;
  element: number;
  /** Turns between attacks (1 = every turn). */
  attackInterval: number;
  /** Player turns remaining until this enemy attacks. */
  attackCountdown: number;
  /** Player turns the damage shield remains active (0 = no shield). */
  shieldTurns: number;
  /** Fraction of incoming damage absorbed while the shield is up (0-1). */
  shieldReduction: number;
  /** Gems locked per attack (0 = no lock skill). */
  lockCountOnAttack: number;
  /** Boss enemies get a bigger sprite and a BOSS splash on entry. */
  boss: boolean;
}

/** What the enemy does at the end of a player turn. */
export interface EnemyTurnAction {
  attacks: boolean;
  /** Number of random gems to lock (only nonzero when the enemy attacks). */
  locksGems: number;
}

/** Result of activating a team member's skill; shape depends on `effect`. */
export type SkillResult =
  | { effect: 'damage'; amount: number; enemyDefeated: boolean }
  | { effect: 'heal'; amount: number; enemyDefeated: boolean }
  | { effect: 'convert'; from: number; to: number; enemyDefeated: boolean }
  | { effect: 'extendTime'; bonusMs: number; enemyDefeated: boolean };

/**
 * Pure data model for the battle/level flow. No Phaser dependencies, so it
 * stays testable and decoupled from rendering (same principle as Board).
 */
export interface BattleOptions {
  /** Enemy waves to fight instead of the story LEVELS (e.g. a roguelike encounter). */
  levels?: EnemyConfig[][];
  /** Override the player's max HP (e.g. relic bonuses). Defaults to team HP total. */
  maxHp?: number;
  /** Start below full HP (e.g. HP carried across roguelike battles). */
  startHp?: number;
}

export class BattleState {
  team: Character[];
  playerMaxHp: number;
  playerHp: number;

  levels: EnemyConfig[][];
  levelIndex = 0;
  enemyIndexInLevel = 0;
  enemy: EnemyState;

  /** Turns remaining before each team member's skill (by index) is off cooldown. */
  skillCooldowns: number[];

  constructor(startLevelIndex = 0, team: Character[] = DEFAULT_TEAM, options: BattleOptions = {}) {
    this.team = team.length > 0 ? team : DEFAULT_TEAM;
    this.levels = options.levels ?? LEVELS;
    this.playerMaxHp = options.maxHp ?? teamTotalHp(this.team);
    this.playerHp = Math.min(this.playerMaxHp, options.startHp ?? this.playerMaxHp);
    this.skillCooldowns = this.team.map(() => 0);
    this.levelIndex = Math.max(0, Math.min(startLevelIndex, this.levels.length - 1));
    this.enemy = this.spawnEnemy(this.levels[this.levelIndex][0]);
  }

  private spawnEnemy(config: EnemyConfig): EnemyState {
    const attackInterval = Math.max(1, config.attackInterval ?? 1);
    return {
      name: config.name,
      maxHp: config.maxHp,
      hp: config.maxHp,
      attack: config.attack,
      element: config.element,
      attackInterval,
      attackCountdown: attackInterval,
      shieldTurns: config.skill?.type === 'shield' ? config.skill.durationTurns : 0,
      shieldReduction: config.skill?.type === 'shield' ? config.skill.damageReduction : 0,
      lockCountOnAttack: config.skill?.type === 'lock' ? config.skill.lockCount : 0,
      boss: config.boss === true,
    };
  }

  get levelNumber(): number {
    return this.levelIndex + 1;
  }

  /**
   * Applies player-dealt damage to the current enemy, reduced by its shield
   * while active. Returns true if the enemy is defeated.
   */
  damageEnemy(amount: number): boolean {
    const reduced =
      this.enemy.shieldTurns > 0
        ? Math.round(amount * (1 - this.enemy.shieldReduction))
        : amount;
    this.enemy.hp = Math.max(0, this.enemy.hp - reduced);
    return this.enemy.hp <= 0;
  }

  /** Applies the enemy's attack to the player. Returns true if the player is defeated. */
  damagePlayer(amount: number): boolean {
    this.playerHp = Math.max(0, this.playerHp - amount);
    return this.playerHp <= 0;
  }

  /**
   * Applies the enemy's standard attack to the player, scaled by elemental
   * advantage/resistance between the enemy's element and the team leader's
   * element (the leader represents the team's defensive identity). Returns
   * true if the player is defeated.
   */
  applyEnemyAttack(): boolean {
    const leaderElement = this.team[0]?.element ?? this.enemy.element;
    const multiplier = elementMultiplier(this.enemy.element, leaderElement);
    return this.damagePlayer(Math.round(this.enemy.attack * multiplier));
  }

  /** Restores player HP (e.g. from matched Heart orbs), capped at max. */
  healPlayer(amount: number): void {
    this.playerHp = Math.min(this.playerMaxHp, this.playerHp + amount);
  }

  /** True if the given team member's skill is ready to use. */
  canUseSkill(memberIndex: number): boolean {
    return this.skillCooldowns[memberIndex] === 0;
  }

  /**
   * Activates a team member's skill (does not consume a turn). Returns the
   * effect applied so the caller can update UI/HP bars/board, or null if on
   * cooldown. 'convert' and 'extendTime' don't touch the board or timer
   * themselves — the scene applies them using the returned from/to or
   * bonusMs, consistent with how 'damage'/'heal' never trigger match
   * resolution on their own.
   */
  useSkill(memberIndex: number): SkillResult | null {
    if (!this.canUseSkill(memberIndex)) return null;
    const character = this.team[memberIndex];
    this.skillCooldowns[memberIndex] = character.skillCooldownTurns;

    switch (character.skillEffect) {
      case 'damage': {
        const enemyDefeated = this.damageEnemy(character.skillPower);
        return { effect: 'damage', amount: character.skillPower, enemyDefeated };
      }
      case 'heal': {
        const before = this.playerHp;
        this.playerHp = Math.min(this.playerMaxHp, this.playerHp + character.skillPower);
        return { effect: 'heal', amount: this.playerHp - before, enemyDefeated: false };
      }
      case 'convert':
        return {
          effect: 'convert',
          from: character.skillConvertFrom,
          to: character.skillConvertTo,
          enemyDefeated: false,
        };
      case 'extendTime':
        return { effect: 'extendTime', bonusMs: character.skillPower, enemyDefeated: false };
    }
  }

  /** Ticks down all skill cooldowns by one turn. Call once per completed turn. */
  tickCooldowns(): void {
    this.skillCooldowns = this.skillCooldowns.map((cd) => Math.max(0, cd - 1));
  }

  /**
   * Advances the enemy's per-turn state at the end of a player turn: ticks
   * the shield and the attack countdown, and reports whether the enemy
   * attacks now (and how many gems it locks). Only call while the enemy is
   * alive.
   */
  tickEnemyTurn(): EnemyTurnAction {
    if (this.enemy.shieldTurns > 0) this.enemy.shieldTurns--;

    this.enemy.attackCountdown--;
    if (this.enemy.attackCountdown > 0) {
      return { attacks: false, locksGems: 0 };
    }
    this.enemy.attackCountdown = this.enemy.attackInterval;
    return { attacks: true, locksGems: this.enemy.lockCountOnAttack };
  }

  /** True if there are no more enemies after the current one (across all levels). */
  isFinalEnemy(): boolean {
    return (
      this.levelIndex === this.levels.length - 1 &&
      this.enemyIndexInLevel === this.levels[this.levelIndex].length - 1
    );
  }

  /** True if the current enemy is the last one in its level (defeating it clears the level). */
  isFinalEnemyInLevel(): boolean {
    return this.enemyIndexInLevel === this.levels[this.levelIndex].length - 1;
  }

  /** Advances to the next enemy/level. Returns false if there are no more enemies (game clear). */
  advance(): boolean {
    if (this.isFinalEnemy()) return false;

    const currentLevel = this.levels[this.levelIndex];
    if (this.enemyIndexInLevel < currentLevel.length - 1) {
      this.enemyIndexInLevel++;
    } else {
      this.levelIndex++;
      this.enemyIndexInLevel = 0;
    }

    this.enemy = this.spawnEnemy(this.levels[this.levelIndex][this.enemyIndexInLevel]);
    return true;
  }
}
