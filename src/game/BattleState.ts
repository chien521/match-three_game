import type { EnemyConfig, LevelRules } from './levels';
import { LEVELS } from './levels';
import type { Character } from './team';
import { DEFAULT_TEAM, elementMultiplier, teamTotalHp } from './team';

export interface EnemyState {
  name: string;
  maxHp: number;
  hp: number;
  attack: number;
  element: number;
  /** Turns between attacks (1 = every turn). Ignored while a charge skill is active. */
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

  /** Charge skill (0 = no charge skill; replaces the normal attack cycle). */
  chargeTurns: number;
  chargeMultiplier: number;
  chargeInterruptRatio: number;
  chargeCountdown: number;
  /** Damage dealt to the enemy since the current charge window started. */
  chargeDamageAccum: number;

  /** Enrage skill (0 = no enrage skill). One-shot and permanent once triggered. */
  enrageHpThreshold: number;
  enrageAttackMultiplier: number;
  enraged: boolean;
  /** Set the turn enrage triggers; consumed (and cleared) by tickEnemyTurn. */
  enragePending: boolean;

  /** Self-heal skill (0 = no self-heal skill), on its own independent countdown. */
  selfHealAmount: number;
  selfHealEveryTurns: number;
  selfHealCountdown: number;

  /** On-attack board effects: BattleState only reports these, the scene applies them. */
  convertGemsOnAttack: { from: number; to: number; count: number } | null;
  petrifyCountOnAttack: number;
  igniteOnAttack: { count: number; durationTurns: number } | null;
  /** On-attack poison config; BattleState itself applies this to poisonDamagePerTurn/poisonTurnsLeft. */
  poisonOnAttack: { damagePerTurn: number; durationTurns: number } | null;
}

/** What the enemy does at the end of a player turn. */
export interface EnemyTurnAction {
  attacks: boolean;
  /** 1 normally; the charge skill's multiplier on the big hit. */
  attackMultiplier: number;
  /** True if this enemy has an active charge skill that ticked this turn. */
  chargingTicked: boolean;
  /** True if a charge attack was interrupted this turn (no hit landed). */
  chargeInterrupted: boolean;
  /** Number of random gems to lock (only nonzero when the enemy attacks). */
  locksGems: number;
  /** Random gem conversion to apply to the board (only set when the enemy attacks). */
  convertsGems: { from: number; to: number; count: number } | null;
  /** Number of gems to petrify (board effect lands in a later phase). */
  petrifies: number;
  /** Gems to ignite (board effect lands in a later phase). */
  ignites: { count: number; durationTurns: number } | null;
  /** Poison newly applied/refreshed to the player this turn, if any. */
  appliesPoison: { damagePerTurn: number; durationTurns: number } | null;
  /** DoT damage applied to the player this turn from an existing poison, 0 = none. */
  poisonDamage: number;
  /** HP the enemy regained from its self-heal skill this turn, 0 = none. */
  selfHealed: number;
  /** True the turn the enemy's enrage skill triggers (one-shot). */
  becameEnraged: boolean;
}

/** Result of activating a team member's skill; shape depends on `effect`. */
export type SkillResult =
  | { effect: 'damage'; amount: number; enemyDefeated: boolean }
  | { effect: 'heal'; amount: number; enemyDefeated: boolean }
  | { effect: 'convert'; from: number; to: number; enemyDefeated: boolean }
  | { effect: 'extendTime'; bonusMs: number; enemyDefeated: boolean }
  | { effect: 'shieldSelf'; turns: number; reduction: number; enemyDefeated: boolean }
  | { effect: 'teamBuff'; multiplier: number; turns: number; enemyDefeated: boolean }
  | { effect: 'stunEnemy'; turns: number; enemyDefeated: boolean }
  | { effect: 'cleanse'; enemyDefeated: boolean };

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
  /** Board/turn rules for the current level (turnLimit); omit for no turn limit. */
  rules?: LevelRules;
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

  /** Poison DoT currently affecting the player (0 = none). Doesn't stack — see tickEnemyTurn. */
  poisonDamagePerTurn = 0;
  poisonTurnsLeft = 0;

  /** Player "shieldSelf" active-skill state: reduces incoming enemy attack
   * damage by `playerShieldReduction` for the next `playerShieldTurns`
   * attacks. Checked and ticked entirely inside applyEnemyAttack(), so it's
   * self-contained regardless of call order elsewhere. */
  playerShieldTurns = 0;
  playerShieldReduction = 0;

  /** Player "teamBuff" active-skill state: multiplies match damage by
   * `attackBuffMultiplier` for the next `attackBuffTurns` player turns.
   * Ticked in tickCooldowns() — safe because the current turn's damage is
   * always computed before tickCooldowns() runs. */
  attackBuffMultiplier = 1;
  attackBuffTurns = 0;

  /** Completed player turns so far this battle (incremented once per tickEnemyTurn call). */
  turnCount = 0;
  /** Turn limit for the current level (undefined = no limit), from BattleOptions.rules. */
  turnLimit?: number;

  constructor(startLevelIndex = 0, team: Character[] = DEFAULT_TEAM, options: BattleOptions = {}) {
    this.team = team.length > 0 ? team : DEFAULT_TEAM;
    this.levels = options.levels ?? LEVELS.map((level) => level.enemies);
    this.playerMaxHp = options.maxHp ?? teamTotalHp(this.team);
    this.playerHp = Math.min(this.playerMaxHp, options.startHp ?? this.playerMaxHp);
    this.skillCooldowns = this.team.map(() => 0);
    this.turnLimit = options.rules?.turnLimit;
    this.levelIndex = Math.max(0, Math.min(startLevelIndex, this.levels.length - 1));
    this.enemy = this.spawnEnemy(this.levels[this.levelIndex][0]);
  }

  private spawnEnemy(config: EnemyConfig): EnemyState {
    const attackInterval = Math.max(1, config.attackInterval ?? 1);
    const skills = config.skills ?? (config.skill ? [config.skill] : []);

    let shieldTurns = 0;
    let shieldReduction = 0;
    let lockCountOnAttack = 0;
    let chargeTurns = 0;
    let chargeMultiplier = 1;
    let chargeInterruptRatio = 1;
    let enrageHpThreshold = 0;
    let enrageAttackMultiplier = 1;
    let selfHealAmount = 0;
    let selfHealEveryTurns = 0;
    let convertGemsOnAttack: EnemyState['convertGemsOnAttack'] = null;
    let petrifyCountOnAttack = 0;
    let igniteOnAttack: EnemyState['igniteOnAttack'] = null;
    let poisonOnAttack: EnemyState['poisonOnAttack'] = null;

    for (const skill of skills) {
      switch (skill.type) {
        case 'shield':
          shieldTurns = skill.durationTurns;
          shieldReduction = skill.damageReduction;
          break;
        case 'lock':
          lockCountOnAttack = skill.lockCount;
          break;
        case 'charge':
          chargeTurns = skill.chargeTurns;
          chargeMultiplier = skill.multiplier;
          chargeInterruptRatio = skill.interruptRatio;
          break;
        case 'enrage':
          enrageHpThreshold = skill.hpThreshold;
          enrageAttackMultiplier = skill.attackMultiplier;
          break;
        case 'selfHeal':
          selfHealAmount = skill.amount;
          selfHealEveryTurns = skill.everyTurns;
          break;
        case 'convertGems':
          convertGemsOnAttack = { from: skill.from, to: skill.to, count: skill.count };
          break;
        case 'petrify':
          petrifyCountOnAttack = skill.count;
          break;
        case 'ignite':
          igniteOnAttack = { count: skill.count, durationTurns: skill.durationTurns };
          break;
        case 'poison':
          poisonOnAttack = { damagePerTurn: skill.damagePerTurn, durationTurns: skill.durationTurns };
          break;
      }
    }

    return {
      name: config.name,
      maxHp: config.maxHp,
      hp: config.maxHp,
      attack: config.attack,
      element: config.element,
      attackInterval,
      attackCountdown: chargeTurns > 0 ? chargeTurns : attackInterval,
      shieldTurns,
      shieldReduction,
      lockCountOnAttack,
      boss: config.boss === true,
      chargeTurns,
      chargeMultiplier,
      chargeInterruptRatio,
      chargeCountdown: chargeTurns,
      chargeDamageAccum: 0,
      enrageHpThreshold,
      enrageAttackMultiplier,
      enraged: false,
      enragePending: false,
      selfHealAmount,
      selfHealEveryTurns,
      selfHealCountdown: selfHealEveryTurns,
      convertGemsOnAttack,
      petrifyCountOnAttack,
      igniteOnAttack,
      poisonOnAttack,
    };
  }

  get levelNumber(): number {
    return this.levelIndex + 1;
  }

  /**
   * Applies player-dealt damage to the current enemy, reduced by its shield
   * while active. Also accumulates damage toward the charge-interrupt
   * threshold (if charging) and checks the one-shot enrage trigger. Returns
   * true if the enemy is defeated.
   */
  damageEnemy(amount: number): boolean {
    const reduced =
      this.enemy.shieldTurns > 0
        ? Math.round(amount * (1 - this.enemy.shieldReduction))
        : amount;
    this.enemy.hp = Math.max(0, this.enemy.hp - reduced);

    if (this.enemy.chargeTurns > 0) {
      this.enemy.chargeDamageAccum += reduced;
    }

    if (
      this.enemy.enrageHpThreshold > 0 &&
      !this.enemy.enraged &&
      this.enemy.hp / this.enemy.maxHp < this.enemy.enrageHpThreshold
    ) {
      this.enemy.enraged = true;
      this.enemy.enragePending = true;
      this.enemy.attack = Math.round(this.enemy.attack * this.enemy.enrageAttackMultiplier);
    }

    return this.enemy.hp <= 0;
  }

  /** Applies the enemy's attack to the player. Returns true if the player is defeated. */
  damagePlayer(amount: number): boolean {
    this.playerHp = Math.max(0, this.playerHp - amount);
    return this.playerHp <= 0;
  }

  /**
   * Applies the enemy's attack to the player, scaled by elemental
   * advantage/resistance between the enemy's element and the team leader's
   * element (the leader represents the team's defensive identity), and by
   * `multiplier` (1 normally; the charge skill's multiplier on its big hit).
   * Returns true if the player is defeated.
   */
  applyEnemyAttack(multiplier = 1): boolean {
    const leaderElement = this.team[0]?.element ?? this.enemy.element;
    const elementMult = elementMultiplier(this.enemy.element, leaderElement);
    let amount = Math.round(this.enemy.attack * elementMult * multiplier);

    // Self-contained shield check + consume: reduces this attack, then ticks
    // down by one so a shield lasts for exactly the number of attacks it was
    // cast for, independent of tickCooldowns() timing.
    if (this.playerShieldTurns > 0) {
      amount = Math.round(amount * (1 - this.playerShieldReduction));
      this.playerShieldTurns--;
      if (this.playerShieldTurns <= 0) this.playerShieldReduction = 0;
    }

    return this.damagePlayer(amount);
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
      case 'shieldSelf':
        this.playerShieldTurns = character.skillShieldTurns;
        this.playerShieldReduction = character.skillShieldReduction;
        return {
          effect: 'shieldSelf',
          turns: character.skillShieldTurns,
          reduction: character.skillShieldReduction,
          enemyDefeated: false,
        };
      case 'teamBuff':
        this.attackBuffMultiplier = character.skillBuffMultiplier;
        this.attackBuffTurns = character.skillBuffTurns;
        return {
          effect: 'teamBuff',
          multiplier: character.skillBuffMultiplier,
          turns: character.skillBuffTurns,
          enemyDefeated: false,
        };
      case 'stunEnemy':
        this.enemy.attackCountdown += character.skillStunTurns;
        if (this.enemy.chargeTurns > 0) this.enemy.chargeCountdown += character.skillStunTurns;
        return { effect: 'stunEnemy', turns: character.skillStunTurns, enemyDefeated: false };
      case 'cleanse':
        this.poisonTurnsLeft = 0;
        this.poisonDamagePerTurn = 0;
        return { effect: 'cleanse', enemyDefeated: false };
    }
  }

  /** Ticks down all skill cooldowns and the team-buff timer by one turn.
   * Call once per completed turn. (playerShieldTurns is NOT ticked here —
   * see applyEnemyAttack().) */
  tickCooldowns(): void {
    this.skillCooldowns = this.skillCooldowns.map((cd) => Math.max(0, cd - 1));
    if (this.attackBuffTurns > 0) {
      this.attackBuffTurns--;
      if (this.attackBuffTurns <= 0) this.attackBuffMultiplier = 1;
    }
  }

  /**
   * Advances the enemy's per-turn state at the end of a player turn: ticks
   * poison on the player, consumes any pending enrage trigger, ticks
   * self-heal, ticks the shield, then advances either the charge cycle (if
   * the enemy has one — it replaces the normal attack cycle entirely) or the
   * normal attack countdown. Reports everything the scene needs to react to
   * (attacks, locks/converts/petrifies/ignites, poison applied/ticked,
   * self-heal, enrage, charge state). Only call while the enemy is alive.
   */
  tickEnemyTurn(): EnemyTurnAction {
    const enemy = this.enemy;
    this.turnCount++;

    let poisonDamage = 0;
    if (this.poisonTurnsLeft > 0) {
      poisonDamage = this.poisonDamagePerTurn;
      this.damagePlayer(poisonDamage);
      this.poisonTurnsLeft--;
      if (this.poisonTurnsLeft <= 0) {
        this.poisonDamagePerTurn = 0;
      }
    }

    let becameEnraged = false;
    if (enemy.enragePending) {
      enemy.enragePending = false;
      becameEnraged = true;
    }

    let selfHealed = 0;
    if (enemy.selfHealAmount > 0) {
      enemy.selfHealCountdown--;
      if (enemy.selfHealCountdown <= 0) {
        const before = enemy.hp;
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.selfHealAmount);
        selfHealed = enemy.hp - before;
        enemy.selfHealCountdown = enemy.selfHealEveryTurns;
      }
    }

    if (enemy.shieldTurns > 0) enemy.shieldTurns--;

    let attacks = false;
    let attackMultiplier = 1;
    let chargingTicked = false;
    let chargeInterrupted = false;

    if (enemy.chargeTurns > 0) {
      chargingTicked = true;
      enemy.chargeCountdown--;
      const interruptThreshold = enemy.chargeInterruptRatio * enemy.maxHp;
      if (enemy.chargeDamageAccum >= interruptThreshold) {
        chargeInterrupted = true;
        enemy.chargeCountdown = enemy.chargeTurns;
        enemy.chargeDamageAccum = 0;
      } else if (enemy.chargeCountdown <= 0) {
        attacks = true;
        attackMultiplier = enemy.chargeMultiplier;
        enemy.chargeCountdown = enemy.chargeTurns;
        enemy.chargeDamageAccum = 0;
      }
    } else {
      enemy.attackCountdown--;
      if (enemy.attackCountdown <= 0) {
        attacks = true;
        enemy.attackCountdown = enemy.attackInterval;
      }
    }

    let appliesPoison: EnemyTurnAction['appliesPoison'] = null;
    if (attacks && enemy.poisonOnAttack) {
      this.poisonDamagePerTurn = Math.max(this.poisonDamagePerTurn, enemy.poisonOnAttack.damagePerTurn);
      this.poisonTurnsLeft = enemy.poisonOnAttack.durationTurns;
      appliesPoison = enemy.poisonOnAttack;
    }

    return {
      attacks,
      attackMultiplier,
      chargingTicked,
      chargeInterrupted,
      locksGems: attacks ? enemy.lockCountOnAttack : 0,
      convertsGems: attacks ? enemy.convertGemsOnAttack : null,
      petrifies: attacks ? enemy.petrifyCountOnAttack : 0,
      ignites: attacks ? enemy.igniteOnAttack : null,
      appliesPoison,
      poisonDamage,
      selfHealed,
      becameEnraged,
    };
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

  /**
   * True once a level's turn limit has been exhausted without defeating the
   * current enemy (clearing the enemy on the very last allowed turn is a
   * win, not a loss — checked via the enemy's remaining HP, not turn order).
   */
  isOutOfTurns(): boolean {
    return this.turnLimit !== undefined && this.turnCount >= this.turnLimit && this.enemy.hp > 0;
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
