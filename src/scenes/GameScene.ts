import Phaser from 'phaser';
import { Board } from '../game/Board';
import type { Vec2 } from '../game/Board';
import { BattleState } from '../game/BattleState';
import { branchForLevel, levelById, nextLevelIdInBranch } from '../game/levels';
import type { LevelConfig } from '../game/levels';
import {
  CURRENCY_GAME_CLEAR_BONUS,
  CURRENCY_PER_ENEMY_DEFEAT,
  CURRENCY_PER_LEVEL_CLEAR,
  addCurrency,
  getActiveTeam,
  loadPlayerData,
  savePlayerData,
} from '../game/playerData';
import { computeGroupBaseDamage, computeHealAmount, computeMatchDamage, elementName } from '../game/team';
import type { MatchGroup } from '../game/team';
import {
  BOARD_COLS,
  BOARD_MARGIN,
  BOARD_ROWS,
  BURN_DAMAGE_PER_CELL,
  ENEMY_ATTACK_DELAY_MS,
  GEM_COLORS,
  HEART_TYPE,
  STONE,
  TILE_SIZE,
  TURN_TIME_MS,
} from '../game/constants';
import { createGemTextures } from './gemArt';
import {
  EnemySprite,
  burstAt,
  drawThemedBackground,
  fireProjectile,
  flashDangerEdges,
  showBanner,
  showBossSplash,
  themeForBranch,
} from './battleFx';
import type { BattleTheme } from './battleFx';
import { recordLevelClear, starsForLevel } from '../game/playerData';
import { LEVELS } from '../game/levels';
import { t, tr } from '../game/i18n';
import type { UiKey } from '../game/i18n';
import { carryCooldownsForward, takeCarriedCooldowns } from '../game/storyCooldowns';
import { drawAvatar } from './avatarUi';
import { drawLanguageToggle } from './langToggle';

const HP_BAR_WIDTH = 320;
const HP_BAR_HEIGHT = 18;

/** Screen position of the enemy emoji sprite (between the HP bar and the board). */
const ENEMY_SPRITE_Y = 176;

/**
 * Main gameplay scene: renders the board and handles the Puzzle & Dragons
 * style free-drag input (pick up a gem, drag it through the grid, other gems
 * shift out of the way, release to lock it in and resolve matches/combos).
 * Also drives a simple turn-based battle: matched gems damage the current
 * enemy, and the enemy retaliates against the player after each turn.
 */
export class GameScene extends Phaser.Scene {
  private board!: Board;
  private gems: (Phaser.GameObjects.Image | undefined)[][] = [];
  /** Burning-cell glow underlays, keyed by "row,col" (fixed to the cell, not the gem). */
  private burningUnderlays: Map<string, Phaser.GameObjects.Image> = new Map();

  private boardOriginX = 0;
  private boardOriginY = 0;

  private dragging = false;
  private heldCell: Vec2 | null = null;
  private resolving = false;
  private storyDismissed = false;
  private turnEndTime = 0;
  private turnTimerBarFill!: Phaser.GameObjects.Graphics;
  private turnTimerBarX = 0;
  private turnTimerBarY = 0;

  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private score = 0;

  private battle!: BattleState;
  private gameEnded = false;

  private enemyNameText!: Phaser.GameObjects.Text;
  private enemyStatusText!: Phaser.GameObjects.Text;
  private turnCounterText!: Phaser.GameObjects.Text;
  private enemyHpBarFill!: Phaser.GameObjects.Graphics;
  private enemyHpText!: Phaser.GameObjects.Text;
  private enemyHpBarX = 0;
  private enemyHpBarY = 0;

  private playerHpBarFill!: Phaser.GameObjects.Graphics;
  private playerHpText!: Phaser.GameObjects.Text;
  private playerStatusText!: Phaser.GameObjects.Text;
  private playerHpBarX = 0;
  private playerHpBarY = 0;
  private rosterTexts: Phaser.GameObjects.Text[] = [];
  private rosterButtons: Phaser.GameObjects.Rectangle[] = [];
  private rosterAvatars: Phaser.GameObjects.Container[] = [];

  private startLevelIndex = 0;
  /** Story level id being played. */
  private levelId = '';
  private currentLevel: LevelConfig | null = null;
  /** Restricted gem-type palette for this level's board (undefined = all types). */
  private gemColors?: number[];

  private turnTimeMs = TURN_TIME_MS;

  private enemySprite!: EnemySprite;
  private theme!: BattleTheme;

  private leaderText: Phaser.GameObjects.Text | null = null;
  /** Rebuilds whatever overlay (story intro / end panel) is currently shown, in the current language. */
  private activeOverlayRedraw: (() => void) | null = null;
  private introObjects: Phaser.GameObjects.GameObject[] = [];
  private endPanelObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('GameScene');
  }

  init(data: { levelId?: string }): void {
    this.levelId = data?.levelId ?? 'prologue-1';
  }

  preload(): void {
    createGemTextures(this);
  }

  create(): void {
    // Reset per-run state in case this scene instance is restarted (e.g. from the level menu).
    this.dragging = false;
    this.heldCell = null;
    this.resolving = false;
    this.gameEnded = false;
    this.storyDismissed = false;
    this.score = 0;
    this.burningUnderlays = new Map();
    this.leaderText = null;
    this.activeOverlayRedraw = null;
    this.introObjects = [];
    this.endPanelObjects = [];

    const boardPixelWidth = BOARD_COLS * TILE_SIZE;
    const boardPixelHeight = BOARD_ROWS * TILE_SIZE;
    this.boardOriginX = (this.scale.width - boardPixelWidth) / 2;
    // Board sits low enough to leave room for the enemy sprite above it.
    this.boardOriginY = (this.scale.height - boardPixelHeight) / 2 + 70;

    this.currentLevel = levelById(this.levelId) ?? null;
    // BattleState still indexes into the flat LEVELS array internally.
    this.startLevelIndex = Math.max(0, LEVELS.findIndex((level) => level.id === this.levelId));
    this.theme = themeForBranch(branchForLevel(this.levelId)?.id);
    drawThemedBackground(this, this.theme);

    this.drawBoardBackground(boardPixelWidth, boardPixelHeight);

    this.gemColors = this.currentLevel?.rules?.gemColors;

    this.board = new Board(BOARD_COLS, BOARD_ROWS);
    this.board.fillRandomNoMatches(undefined, this.gemColors);
    this.buildSprites();

    this.scoreText = this.add.text(BOARD_MARGIN, BOARD_MARGIN, t('score', { n: 0 }), {
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    // Combo counter sits below the language toggle pill (top-right corner).
    this.comboText = this.add
      .text(this.scale.width - BOARD_MARGIN, BOARD_MARGIN + 26, '', {
        fontSize: '22px',
        color: '#ffe066',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);
    drawLanguageToggle(this, this.scale.width - 62, 8, () => this.refreshLanguage());

    this.turnTimeMs = this.currentLevel?.rules?.moveTimeMs ?? TURN_TIME_MS;
    const playerData = loadPlayerData();
    this.battle = new BattleState(this.startLevelIndex, getActiveTeam(playerData), {
      rules: this.currentLevel?.rules,
    });
    // Skill cooldowns persist across "Next Level ▶" within a branch chain
    // (see storyCooldowns.ts); every other entry point (map click, retry
    // after defeat) never wrote this, so it's null there — fresh cooldowns.
    const carried = takeCarriedCooldowns();
    if (carried) this.battle.skillCooldowns = carried.slice(0, this.battle.team.length);

    this.enemySprite = new EnemySprite(this, this.scale.width / 2, ENEMY_SPRITE_Y);
    this.createHpBars();
    this.createTurnTimerBar(boardPixelWidth);

    const leaderSkill = this.battle.team[0]?.leaderSkill;
    if (leaderSkill) {
      this.leaderText = this.add
        .text(BOARD_MARGIN, BOARD_MARGIN + 34, this.leaderLineText(), {
          fontSize: '14px',
          color: '#7dd3fc',
        });
    }

    this.setupInput();
    this.showStoryIntro();
  }

  /** Blocks input behind a narration overlay before the battle begins.
   * Re-entrant: calling it again tears down the previous overlay and
   * rebuilds it (used by the language toggle). */
  private showStoryIntro(): void {
    for (const obj of this.introObjects) obj.destroy();
    this.introObjects = [];
    this.storyDismissed = false;
    this.activeOverlayRedraw = () => this.showStoryIntro();

    const overlay = this.add.rectangle(
      this.scale.width / 2,
      this.scale.height / 2,
      this.scale.width,
      this.scale.height,
      0x000000,
      0.75,
    ).setDepth(200);

    const title = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 90, tr(this.currentLevel?.name ?? ''), {
        fontSize: '26px',
        color: '#ffe066',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(201);

    const story = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 30, tr(this.currentLevel?.story ?? ''), {
        fontSize: '16px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: this.scale.width - 120 },
      })
      .setOrigin(0.5, 0)
      .setDepth(201);

    const button = this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2 + 120, 220, 50, 0x2a2f45)
      .setStrokeStyle(2, 0x5a6cad)
      .setDepth(201)
      .setInteractive({ useHandCursor: true });
    const buttonText = this.add
      .text(this.scale.width / 2, this.scale.height / 2 + 120, t('beginBattle'), {
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(201);

    this.introObjects = [overlay, title, story, button, buttonText];

    button.on('pointerover', () => button.setFillStyle(0x394162));
    button.on('pointerout', () => button.setFillStyle(0x2a2f45));
    button.on('pointerdown', () => {
      for (const obj of this.introObjects) obj.destroy();
      this.introObjects = [];
      this.activeOverlayRedraw = null;
      void this.introduceEnemy();
      // Defer one tick so the same click can't fall through to the board
      // and start (and instantly waste) a turn.
      this.time.delayedCall(0, () => {
        this.storyDismissed = true;
      });
    });
  }

  /** Re-renders every visible string in the newly selected language without
   * touching battle state (board, HP, cooldowns, turn count all survive). */
  private refreshLanguage(): void {
    this.scoreText.setText(t('score', { n: this.score }));
    this.leaderText?.setText(this.leaderLineText());
    this.refreshHpBars(); // also refreshes the roster
    this.activeOverlayRedraw?.();
  }

  private leaderLineText(): string {
    const leaderSkill = this.battle.team[0]?.leaderSkill;
    if (!leaderSkill) return '';
    return t('leaderLine', { name: tr(leaderSkill.name), desc: tr(leaderSkill.description) });
  }

  // ---------------------------------------------------------------------
  // Setup helpers
  // ---------------------------------------------------------------------

  /** Plays the new enemy's entrance (with a BOSS splash when flagged). */
  private async introduceEnemy(): Promise<void> {
    if (this.battle.enemy.boss) {
      await showBossSplash(this);
    }
    await this.enemySprite.spawn(this.battle.enemy);
  }

  private drawBoardBackground(width: number, height: number): void {
    const g = this.add.graphics();

    // Outer glow frame in the theme's accent color, then the board panel.
    g.lineStyle(8, this.theme.ambient, 0.14);
    g.strokeRoundedRect(this.boardOriginX - 12, this.boardOriginY - 12, width + 24, height + 24, 16);
    g.fillStyle(0x151827, 0.92);
    g.fillRoundedRect(this.boardOriginX - 8, this.boardOriginY - 8, width + 16, height + 16, 12);
    g.lineStyle(2, 0x5a6cad, 0.55);
    g.strokeRoundedRect(this.boardOriginX - 8, this.boardOriginY - 8, width + 16, height + 16, 12);

    // Subtle checkerboard instead of hard grid lines.
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        if ((r + c) % 2 === 0) continue;
        g.fillStyle(0xffffff, 0.035);
        g.fillRect(
          this.boardOriginX + c * TILE_SIZE,
          this.boardOriginY + r * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE,
        );
      }
    }
  }

  private buildSprites(): void {
    this.gems = [];
    for (let r = 0; r < BOARD_ROWS; r++) {
      const row: (Phaser.GameObjects.Image | undefined)[] = [];
      for (let c = 0; c < BOARD_COLS; c++) {
        row.push(this.createGemSprite(r, c, this.board.get(r, c)));
      }
      this.gems.push(row);
    }
  }

  private createHpBars(): void {
    // Enemy header (name/HP bar/status) sits above the enemy sprite.
    this.enemyHpBarX = (this.scale.width - HP_BAR_WIDTH) / 2;
    this.enemyHpBarY = 96;

    this.enemyNameText = this.add
      .text(this.scale.width / 2, this.enemyHpBarY - 24, '', {
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    this.add
      .rectangle(
        this.enemyHpBarX + HP_BAR_WIDTH / 2,
        this.enemyHpBarY + HP_BAR_HEIGHT / 2,
        HP_BAR_WIDTH,
        HP_BAR_HEIGHT,
        0x2a2f45,
      )
      .setStrokeStyle(2, 0x394162);
    this.enemyHpBarFill = this.add.graphics();

    this.enemyHpText = this.add
      .text(this.scale.width / 2, this.enemyHpBarY + HP_BAR_HEIGHT / 2, '', {
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.enemyStatusText = this.add
      .text(this.scale.width / 2, this.enemyHpBarY + HP_BAR_HEIGHT + 4, '', {
        fontSize: '13px',
        color: '#9aa3c7',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    this.turnCounterText = this.add
      .text(this.scale.width / 2, this.enemyHpBarY + HP_BAR_HEIGHT + 22, '', {
        fontSize: '13px',
        color: '#9aa3c7',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setVisible(false);

    // Player HP bar sits below the board (no title — the bar itself is clear).
    this.playerHpBarX = (this.scale.width - HP_BAR_WIDTH) / 2;
    this.playerHpBarY = this.boardOriginY + BOARD_ROWS * TILE_SIZE + 16;

    this.add
      .rectangle(
        this.playerHpBarX + HP_BAR_WIDTH / 2,
        this.playerHpBarY + HP_BAR_HEIGHT / 2,
        HP_BAR_WIDTH,
        HP_BAR_HEIGHT,
        0x2a2f45,
      )
      .setStrokeStyle(2, 0x394162);
    this.playerHpBarFill = this.add.graphics();

    this.playerHpText = this.add
      .text(this.scale.width / 2, this.playerHpBarY + HP_BAR_HEIGHT / 2, '', {
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.playerStatusText = this.add
      .text(this.scale.width / 2, this.playerHpBarY - 12, '', {
        fontSize: '13px',
        color: '#c9a8ff',
      })
      .setOrigin(0.5)
      .setVisible(false);

    const rosterY = this.playerHpBarY + HP_BAR_HEIGHT + 10;
    const rosterWidth = this.scale.width - BOARD_MARGIN * 2;
    const slotWidth = rosterWidth / this.battle.team.length;
    const buttonWidth = slotWidth - 8;
    const buttonHeight = 46;
    this.rosterButtons = [];
    this.rosterAvatars = [];
    this.rosterTexts = this.battle.team.map((character, index) => {
      const x = BOARD_MARGIN + slotWidth * (index + 0.5);
      const centerY = rosterY + buttonHeight / 2 - 2;

      const button = this.add
        .rectangle(x, centerY, buttonWidth, buttonHeight, 0x2a2f45)
        .setStrokeStyle(1, 0x394162);
      this.rosterButtons.push(button);

      const avatar = drawAvatar(this, x - buttonWidth / 2 + 24, centerY, character, 15);
      this.rosterAvatars.push(avatar);

      const text = this.add
        .text(x - buttonWidth / 2 + 44, centerY, '', {
          fontSize: '11px',
          color: '#9aa3c7',
          lineSpacing: 2,
        })
        .setOrigin(0, 0.5);

      button.on('pointerdown', () => this.useSkill(index));
      return text;
    });
    this.refreshRoster();

    this.refreshHpBars();
  }

  private createTurnTimerBar(boardPixelWidth: number): void {
    this.turnTimerBarX = this.boardOriginX;
    this.turnTimerBarY = this.boardOriginY - 12;

    this.add
      .rectangle(
        this.turnTimerBarX + boardPixelWidth / 2,
        this.turnTimerBarY + 4,
        boardPixelWidth,
        8,
        0x2a2f45,
      )
      .setStrokeStyle(1, 0x394162);
    this.turnTimerBarFill = this.add.graphics();
  }

  update(time: number): void {
    if (!this.dragging) return;

    const remaining = Math.max(0, this.turnEndTime - time);
    const ratio = remaining / this.turnTimeMs;

    this.turnTimerBarFill.clear();
    this.turnTimerBarFill.fillStyle(ratio < 0.25 ? 0xe74c3c : 0xffe066, 1);
    this.turnTimerBarFill.fillRect(
      this.turnTimerBarX,
      this.turnTimerBarY,
      (this.boardOriginX + BOARD_COLS * TILE_SIZE - this.boardOriginX) * ratio,
      8,
    );

    if (remaining <= 0) {
      this.endDrag();
    }
  }

  private refreshHpBars(): void {
    const enemyRatio = this.battle.enemy.hp / this.battle.enemy.maxHp;
    this.enemyHpBarFill.clear();
    this.enemyHpBarFill.fillStyle(0xe74c3c, 1);
    this.enemyHpBarFill.fillRect(
      this.enemyHpBarX,
      this.enemyHpBarY,
      HP_BAR_WIDTH * Phaser.Math.Clamp(enemyRatio, 0, 1),
      HP_BAR_HEIGHT,
    );
    const prefix = this.storyPrefix();
    this.enemyNameText.setText(
      `${prefix}  ${tr(this.battle.enemy.name)} (${tr(elementName(this.battle.enemy.element))})`,
    );
    this.enemyHpText.setText(`${this.battle.enemy.hp} / ${this.battle.enemy.maxHp}`);

    const enemy = this.battle.enemy;
    const countdown = enemy.chargeTurns > 0 ? enemy.chargeCountdown : enemy.attackCountdown;
    const status: string[] = [
      enemy.chargeTurns > 0 ? t('bigAtkIn', { n: countdown }) : t('atkIn', { n: countdown }),
    ];
    if (enemy.shieldTurns > 0) {
      status.push(t('shieldStatus', { p: Math.round(enemy.shieldReduction * 100), t: enemy.shieldTurns }));
    }
    if (enemy.lockCountOnAttack > 0) {
      status.push(t('lockStatus', { n: enemy.lockCountOnAttack }));
    }
    if (enemy.enraged) {
      status.push(t('enraged'));
    }
    if (enemy.selfHealAmount > 0) {
      status.push(t('selfHealStatus', { a: enemy.selfHealAmount, t: enemy.selfHealEveryTurns }));
    }
    this.enemyStatusText.setText(status.join('    '));
    this.enemyStatusText.setColor(countdown <= 1 ? '#ff7b7b' : '#9aa3c7');

    if (this.battle.turnLimit !== undefined) {
      const remaining = this.battle.turnLimit - this.battle.turnCount;
      this.turnCounterText.setText(t('turnCounter', { c: this.battle.turnCount, l: this.battle.turnLimit }));
      this.turnCounterText.setColor(remaining <= 3 ? '#ff5555' : '#9aa3c7');
      this.turnCounterText.setVisible(true);
    } else {
      this.turnCounterText.setVisible(false);
    }

    const playerRatio = this.battle.playerHp / this.battle.playerMaxHp;
    this.playerHpBarFill.clear();
    this.playerHpBarFill.fillStyle(0x2ecc71, 1);
    this.playerHpBarFill.fillRect(
      this.playerHpBarX,
      this.playerHpBarY,
      HP_BAR_WIDTH * Phaser.Math.Clamp(playerRatio, 0, 1),
      HP_BAR_HEIGHT,
    );
    this.playerHpText.setText(`${this.battle.playerHp} / ${this.battle.playerMaxHp}`);

    const playerStatus: string[] = [];
    if (this.battle.poisonTurnsLeft > 0) {
      playerStatus.push(t('poisonStatus', { d: this.battle.poisonDamagePerTurn, t: this.battle.poisonTurnsLeft }));
    }
    if (this.battle.playerShieldTurns > 0) {
      playerStatus.push(
        t('playerShieldStatus', {
          p: Math.round(this.battle.playerShieldReduction * 100),
          t: this.battle.playerShieldTurns,
        }),
      );
    }
    if (this.battle.attackBuffTurns > 0) {
      playerStatus.push(
        t('attackBuffStatus', { m: this.battle.attackBuffMultiplier, t: this.battle.attackBuffTurns }),
      );
    }
    if (playerStatus.length > 0) {
      this.playerStatusText.setText(playerStatus.join('    '));
      this.playerStatusText.setVisible(true);
    } else {
      this.playerStatusText.setVisible(false);
    }
    this.refreshRoster();
  }


  /** Compact campaign-position tag for the enemy header, e.g. "🔥 2/3" or "序章 1/2". */
  private storyPrefix(): string {
    const branch = branchForLevel(this.levelId);
    if (!branch) return '';
    const position = branch.levelIds.indexOf(this.levelId) + 1;
    const tag = t(`branchTag.${branch.id}` as UiKey);
    return `${tag} ${position}/${branch.levelIds.length}`;
  }

  private refreshRoster(): void {
    this.battle.team.forEach((character, index) => {
      const cooldown = this.battle.skillCooldowns[index];
      const ready = cooldown === 0 && !this.gameEnded;
      const label = cooldown > 0
        ? `${tr(character.skillName)}\n${t('skillCd', { n: cooldown })}`
        : `${tr(character.skillName)}\n${t('skillReady')}`;
      const text = this.rosterTexts[index];
      text.setText(label);
      text.setColor(ready ? '#ffe066' : '#5a6280');

      const button = this.rosterButtons[index];
      button.setFillStyle(ready ? 0x33406b : 0x1e2233);
      button.setStrokeStyle(1, ready ? 0x5a6cad : 0x2a2f45);
      this.rosterAvatars[index]?.setAlpha(ready ? 1 : 0.45);
      if (ready) {
        button.setInteractive({ useHandCursor: true });
      } else {
        button.disableInteractive();
      }
    });
  }

  /** Activates a team member's skill. Does not consume the player's turn. */
  private useSkill(memberIndex: number): void {
    if (this.gameEnded || this.resolving) return;
    const result = this.battle.useSkill(memberIndex);
    if (!result) return;

    this.refreshHpBars();

    if (result.effect === 'convert') {
      this.applyConvertSkill(result.from, result.to);
    } else if (result.effect === 'extendTime') {
      this.turnTimeMs += result.bonusMs;
    } else if (result.effect === 'damage') {
      const caster = this.battle.team[memberIndex];
      this.enemySprite.hit(caster?.element ?? 0);
      this.spawnFloatingText(this.enemySprite.x, this.enemySprite.y - 44, `${result.amount}`, 0xffffff, 26);
    } else if (result.effect === 'shieldSelf') {
      this.spawnFloatingText(
        this.playerHpBarX + HP_BAR_WIDTH / 2,
        this.playerHpBarY - 24,
        t('shieldUpFloat'),
        0x7dd3fc,
        18,
      );
    } else if (result.effect === 'teamBuff') {
      this.spawnFloatingText(
        this.scale.width / 2,
        this.playerHpBarY - 24,
        t('buffUpFloat'),
        0xffe066,
        18,
      );
    } else if (result.effect === 'stunEnemy') {
      this.spawnFloatingText(this.enemySprite.x, this.enemySprite.y - 60, t('stunnedFloat'), 0x9aa3c7, 18);
      this.refreshHpBars(); // the enemy's "ATK in N" countdown just jumped — show it immediately
    } else if (result.effect === 'cleanse') {
      const unlocked = this.board.clearAllLocks();
      const extinguished = this.board.extinguishAllBurning();
      if (unlocked.length > 0 || extinguished.length > 0) this.refreshCellStateVisuals();
      this.spawnFloatingText(
        this.playerHpBarX + HP_BAR_WIDTH / 2,
        this.playerHpBarY - 24,
        t('cleansedFloat'),
        0x2ecc71,
        18,
      );
      this.refreshHpBars(); // poison indicator just cleared
    }

    if (result.enemyDefeated) {
      void this.handleEnemyDefeated();
    }
  }

  /** Retextures every gem of `from` to `to` with a brief scale/flash tween. Doesn't trigger match resolution. */
  private applyConvertSkill(from: number, to: number): void {
    const changed = this.board.convertGems(from, to);
    for (const { row, col } of changed) {
      const sprite = this.gems[row][col];
      if (!sprite) continue;
      sprite.setTexture(`gem-${to}`);
      sprite.setData('type', to);
      sprite.setScale(1.3);
      sprite.setAlpha(0.3);
      this.tweens.add({
        targets: sprite,
        scale: 1,
        alpha: 1,
        duration: 220,
        ease: 'Back.easeOut',
      });
    }
  }

  /** Picks the gem texture variant for a cell: bomb takes priority over enhanced. */
  private gemTextureKey(row: number, col: number, type: number): string {
    if (this.board.isBomb(row, col)) return `gem-bomb-${type}`;
    if (this.board.isEnhanced(row, col)) return `gem-enh-${type}`;
    return `gem-${type}`;
  }

  private createGemSprite(row: number, col: number, type: number): Phaser.GameObjects.Image {
    const { x, y } = this.cellToPixel(row, col);
    const sprite = this.add.image(x, y, this.gemTextureKey(row, col, type));
    sprite.setData('type', type);
    sprite.setDepth(10);
    return sprite;
  }

  /** A petrified cell renders as an immovable stone in place of a gem. */
  private createStoneSprite(row: number, col: number): Phaser.GameObjects.Image {
    const { x, y } = this.cellToPixel(row, col);
    const sprite = this.add.image(x, y, 'gem-stone');
    sprite.setData('type', STONE);
    sprite.setDepth(10);
    return sprite;
  }

  /** Looping alpha-pulse glow rendered beneath the gem occupying a burning cell. */
  private createBurningUnderlay(row: number, col: number): Phaser.GameObjects.Image {
    const { x, y } = this.cellToPixel(row, col);
    const underlay = this.add.image(x, y, 'cell-burning').setDepth(5);
    this.burningUnderlays.set(`${row},${col}`, underlay);
    this.tweens.add({
      targets: underlay,
      alpha: 0.45,
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return underlay;
  }

  // ---------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------

  private cellToPixel(row: number, col: number): { x: number; y: number } {
    return {
      x: this.boardOriginX + col * TILE_SIZE + TILE_SIZE / 2,
      y: this.boardOriginY + row * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  private pixelToCell(x: number, y: number): Vec2 {
    const col = Math.floor((x - this.boardOriginX) / TILE_SIZE);
    const row = Math.floor((y - this.boardOriginY) / TILE_SIZE);
    return {
      row: Phaser.Math.Clamp(row, 0, BOARD_ROWS - 1),
      col: Phaser.Math.Clamp(col, 0, BOARD_COLS - 1),
    };
  }

  // ---------------------------------------------------------------------
  // Input: free-drag path swapping (Puzzle & Dragons style)
  // ---------------------------------------------------------------------

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.resolving || this.gameEnded || !this.storyDismissed) return;
      const cell = this.pixelToCell(pointer.x, pointer.y);
      if (!this.isWithinBoard(pointer.x, pointer.y)) return;
      if (this.board.isLocked(cell.row, cell.col)) return; // locked gems can't be picked up
      if (this.board.isPetrified(cell.row, cell.col)) return; // stones can't be picked up
      this.dragging = true;
      this.heldCell = cell;
      this.turnEndTime = this.time.now + this.turnTimeMs;
      const sprite = this.gems[cell.row][cell.col];
      if (sprite) this.children.bringToTop(sprite);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging || !this.heldCell) return;

      const heldSprite = this.gems[this.heldCell.row][this.heldCell.col];
      if (heldSprite) {
        heldSprite.x = Phaser.Math.Clamp(
          pointer.x,
          this.boardOriginX + TILE_SIZE / 2,
          this.boardOriginX + BOARD_COLS * TILE_SIZE - TILE_SIZE / 2,
        );
        heldSprite.y = Phaser.Math.Clamp(
          pointer.y,
          this.boardOriginY + TILE_SIZE / 2,
          this.boardOriginY + BOARD_ROWS * TILE_SIZE - TILE_SIZE / 2,
        );
      }

      const targetCell = this.pixelToCell(pointer.x, pointer.y);
      if (
        (targetCell.row !== this.heldCell.row || targetCell.col !== this.heldCell.col) &&
        this.board.isNeighbor8(this.heldCell, targetCell) &&
        !this.board.isLocked(targetCell.row, targetCell.col) && // locked gems can't be displaced
        !this.board.isPetrified(targetCell.row, targetCell.col) // stones block the drag path like walls
      ) {
        this.swapHeldWith(targetCell);
      }
    });

    this.input.on('pointerup', () => {
      this.endDrag();
    });
  }

  /** Locks the held gem into place and kicks off cascade resolution. Called
   * on pointerup, or automatically when the turn timer runs out. */
  private endDrag(): void {
    if (!this.dragging || !this.heldCell) return;
    this.dragging = false;
    this.turnTimerBarFill.clear();
    const heldSprite = this.gems[this.heldCell.row][this.heldCell.col];
    const target = this.cellToPixel(this.heldCell.row, this.heldCell.col);
    if (heldSprite) {
      this.tweens.add({
        targets: heldSprite,
        x: target.x,
        y: target.y,
        duration: 120,
        ease: 'Quad.easeOut',
      });
    }
    this.heldCell = null;
    void this.resolveBoard();
  }

  private isWithinBoard(x: number, y: number): boolean {
    return (
      x >= this.boardOriginX &&
      x <= this.boardOriginX + BOARD_COLS * TILE_SIZE &&
      y >= this.boardOriginY &&
      y <= this.boardOriginY + BOARD_ROWS * TILE_SIZE
    );
  }

  /** Moves the gem currently at `target` into the held slot, and moves the
   * held cell reference to `target` (the held sprite keeps following the pointer). */
  private swapHeldWith(target: Vec2): void {
    if (!this.heldCell) return;
    const from = this.heldCell;

    this.board.swap(from, target);

    const displaced = this.gems[target.row][target.col];
    const held = this.gems[from.row][from.col];

    this.gems[from.row][from.col] = displaced;
    this.gems[target.row][target.col] = held;

    if (displaced) {
      const pixel = this.cellToPixel(from.row, from.col);
      this.tweens.add({
        targets: displaced,
        x: pixel.x,
        y: pixel.y,
        duration: 100,
        ease: 'Quad.easeOut',
      });
    }

    this.heldCell = target;
  }

  // ---------------------------------------------------------------------
  // Match resolution / cascades
  // ---------------------------------------------------------------------

  private async resolveBoard(): Promise<void> {
    this.resolving = true;
    // Every connected matched group counts as one combo (P&D style), including
    // groups cleared by cascades — a planned multi-match move earns multiple
    // combos at once.
    const allGroups: MatchGroup[] = [];
    // One projectile launch point per damaging group (its centroid on screen).
    const hitPoints: { x: number; y: number; element: number }[] = [];

    for (;;) {
      const matches = this.board.findMatches();
      if (matches.size === 0) break;

      const groups = this.board.groupMatches(matches);

      // Bombs caught in this wave's matches explode before anything else
      // clears; the blast may also swallow cells outside the matched groups.
      const explosion = this.board.explodeBombs(matches);
      const destroyedStoneKeys = new Set(explosion.destroyedStones.map(({ row, col }) => `${row},${col}`));

      // Stones adjacent to anything cleared this wave (regular matches OR
      // the blast) shatter too.
      const allClearedCells = new Set<string>([...matches, ...explosion.blastCells]);
      const adjacentShattered = this.board.destroyAdjacentStones(allClearedCells);

      // Big (5+) matches leave a bomb behind at the cell nearest their
      // centroid instead of being cleared — compute this before clearCells().
      const bombSpawnCells = this.board.spawnBombsForGroups(groups);
      const bombSpawnKeys = new Set(bombSpawnCells.map(({ row, col }) => `${row},${col}`));

      // The blast's extra cleared cells (beyond the regular matched groups
      // and any stones it shattered) become one synthetic "explosion" group
      // worth +1 combo, flowing through the normal damage pipeline.
      if (explosion.firstBombElement !== null) {
        const extraCells: Vec2[] = [];
        for (const key of explosion.blastCells) {
          if (matches.has(key) || destroyedStoneKeys.has(key)) continue;
          const [row, col] = key.split(',').map(Number);
          extraCells.push({ row, col });
        }
        if (extraCells.length > 0) {
          groups.push({
            element: explosion.firstBombElement,
            size: extraCells.length,
            cells: extraCells,
            enhancedCount: 0,
          });
        }
      }

      allGroups.push(...groups);
      const combo = allGroups.length;

      for (const group of groups) {
        let sumX = 0;
        let sumY = 0;
        for (const cell of group.cells) {
          const pixel = this.cellToPixel(cell.row, cell.col);
          sumX += pixel.x;
          sumY += pixel.y;
        }
        hitPoints.push({
          x: sumX / group.cells.length,
          y: sumY / group.cells.length,
          element: group.element,
        });
      }

      this.score += Math.round(matches.size * 10 * combo);
      this.scoreText.setText(t('score', { n: this.score }));
      const bigMatch = groups.some((g) => g.size >= 4);
      this.comboText.setText(
        combo > 1
          ? `${t('combo', { n: combo })}${bigMatch ? ` ${t('bigMatch')}` : ''}`
          : bigMatch
            ? t('bigMatch')
            : '',
      );
      this.pulseComboText(combo);
      this.spawnGroupDamageTexts(groups);

      // Cells that visually burst-and-clear this wave: regular matches
      // (minus any that survived as a new bomb) plus the blast's extra gem
      // cells (stones get a separate gray shatter effect below).
      const cellsToBurst = new Set<string>();
      for (const key of matches) {
        if (!bombSpawnKeys.has(key)) cellsToBurst.add(key);
      }
      for (const key of explosion.blastCells) {
        if (!destroyedStoneKeys.has(key) && !bombSpawnKeys.has(key)) cellsToBurst.add(key);
      }

      if (explosion.blastCells.size > 0) {
        this.cameras.main.shake(120, 0.006); // bomb detonation
      }

      await this.playMatchClearAnimation(cellsToBurst);
      const cellsToClear = new Set<string>();
      for (const key of matches) {
        if (!bombSpawnKeys.has(key)) cellsToClear.add(key);
      }
      this.board.clearCells(cellsToClear);

      for (const cell of bombSpawnCells) {
        const sprite = this.gems[cell.row][cell.col];
        const type = this.board.get(cell.row, cell.col);
        if (sprite) {
          sprite.setTexture(this.gemTextureKey(cell.row, cell.col, type));
          this.tweens.add({ targets: sprite, scale: 1.25, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
        }
      }

      const allShatteredStones = [...explosion.destroyedStones, ...adjacentShattered];
      for (const { row, col } of allShatteredStones) {
        const sprite = this.gems[row][col];
        if (sprite) {
          burstAt(this, sprite.x, sprite.y, 0, 8, 0x9aa3b2);
          sprite.destroy();
        }
        this.gems[row][col] = undefined;
      }

      const { moves, spawns } = this.board.applyGravityAndRefill(undefined, { gemTypes: this.gemColors });
      await this.applyGravityToSprites(moves, spawns);
      this.refreshCellStateVisuals(); // locks travel with falling gems; reconciles stones/burning too
    }


    const combo = allGroups.length;
    if (combo === 0) {
      this.comboText.setText('');
    }
    if (combo >= 5) {
      this.cameras.main.shake(130, 0.004);
    }

    const totalDamage = computeMatchDamage(
      allGroups,
      combo,
      this.battle.team,
      this.battle.enemy.element,
      this.battle.attackBuffMultiplier,
    );
    const totalHeal = computeHealAmount(allGroups, combo);

    await this.applyTurnResult(totalDamage, totalHeal, hitPoints);
    this.resolving = false;
  }

  // ---------------------------------------------------------------------
  // Combat feedback ("juice") — visual only, no effect on damage/heal math.
  // ---------------------------------------------------------------------

  /** Scales the combo counter 1 -> 1.4 -> 1, and intensifies its look at 5+ combo. */
  private pulseComboText(combo: number): void {
    this.comboText.setColor(combo >= 5 ? '#ff5555' : '#ffe066');
    this.comboText.setFontSize(combo >= 5 ? 26 : 22);
    this.comboText.setScale(1);
    this.tweens.add({
      targets: this.comboText,
      scale: 1.4,
      duration: 150,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** Spawns a floating "+N" damage number at each matched group's centroid, colored by its gem color. */
  private spawnGroupDamageTexts(groups: (MatchGroup & { cells: Vec2[] })[]): void {
    for (const group of groups) {
      const amount = Math.round(
        computeGroupBaseDamage(group, this.battle.team, this.battle.enemy.element),
      );
      if (amount <= 0) continue;

      let sumX = 0;
      let sumY = 0;
      for (const cell of group.cells) {
        const pixel = this.cellToPixel(cell.row, cell.col);
        sumX += pixel.x;
        sumY += pixel.y;
      }
      const centroidX = sumX / group.cells.length;
      const centroidY = sumY / group.cells.length;

      this.spawnFloatingText(centroidX, centroidY, `+${amount}`, GEM_COLORS[group.element] ?? 0xffffff);
    }
  }

  /** Generic floating text that rises ~40px and fades over ~500ms, then destroys itself. */
  private spawnFloatingText(x: number, y: number, text: string, color: number, fontSize = 20): void {
    const label = this.add
      .text(x, y, text, {
        fontSize: `${fontSize}px`,
        color: `#${color.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(150);

    this.tweens.add({
      targets: label,
      y: y - 40,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** Briefly flashes a white/colored overlay over an HP bar to sell an impact. */
  private flashBar(x: number, y: number, width: number, height: number, color: number): void {
    const flash = this.add
      .rectangle(x + width / 2, y + height / 2, width, height, color, 0.85)
      .setDepth(120);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  /** Applies the player's damage to the enemy, any healing from Heart orbs,
   * handles level progression, then lets the enemy retaliate (unless defeated). */
  private async applyTurnResult(
    totalDamage: number,
    totalHeal: number,
    hitPoints: { x: number; y: number; element: number }[] = [],
  ): Promise<void> {
    if (this.gameEnded) return;

    this.battle.tickCooldowns();
    this.refreshRoster();

    // Burning cells (enemy "ignite" skill) tick once per completed player
    // turn, independent of whether the turn scored a match.
    const burningCells = this.board.tickBurning();
    if (burningCells > 0) {
      const burnDamage = burningCells * BURN_DAMAGE_PER_CELL;
      this.battle.damagePlayer(burnDamage);
      this.refreshHpBars();
      this.spawnFloatingText(
        this.playerHpBarX + HP_BAR_WIDTH / 2,
        this.playerHpBarY - 8,
        `-${burnDamage}`,
        0xff6a00,
        22,
      );
      this.refreshCellStateVisuals();
    }

    if (totalHeal > 0) {
      this.battle.healPlayer(totalHeal);
      this.refreshHpBars();
      this.spawnFloatingText(
        this.playerHpBarX + HP_BAR_WIDTH / 2,
        this.playerHpBarY - 6,
        `+${totalHeal}`,
        0x2ecc71,
      );
    }

    let enemyDefeated = false;
    if (totalDamage > 0) {
      // Fire one projectile per damaging group (capped) at the enemy sprite,
      // then land the damage when the volley arrives.
      const shots = hitPoints
        .filter((p) => p.element !== HEART_TYPE)
        .slice(0, 8);
      if (shots.length > 0) {
        await Promise.all(
          shots.map((p, i) =>
            fireProjectile(this, p, { x: this.enemySprite.x, y: this.enemySprite.y }, p.element, i * 70),
          ),
        );
        this.enemySprite.hit(shots[shots.length - 1].element);
      }

      enemyDefeated = this.battle.damageEnemy(totalDamage);
      this.refreshHpBars();
      this.flashBar(this.enemyHpBarX, this.enemyHpBarY, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0xffffff);
      this.spawnFloatingText(
        this.enemySprite.x,
        this.enemySprite.y - 44,
        `${totalDamage}`,
        0xffffff,
        30,
      );
    }

    if (enemyDefeated) {
      await this.handleEnemyDefeated();
      return;
    }

    // The enemy acts on its own countdown (attackInterval turns, or its
    // charge cycle if it has one — see BattleState.tickEnemyTurn).
    const action = this.battle.tickEnemyTurn();
    this.refreshHpBars();

    if (this.battle.isOutOfTurns()) {
      this.endGame('outOfTurns', true);
      return;
    }

    if (action.poisonDamage > 0) {
      this.spawnFloatingText(
        this.playerHpBarX + HP_BAR_WIDTH / 2,
        this.playerHpBarY - 8,
        `-${action.poisonDamage}`,
        0x9b59b6,
        20,
      );
    }

    if (action.selfHealed > 0) {
      this.spawnFloatingText(this.enemySprite.x, this.enemySprite.y - 44, `+${action.selfHealed}`, 0x2ecc71, 24);
    }

    if (action.becameEnraged) {
      await showBanner(this, t('enraged'), 0xff5555);
      if (this.gameEnded) return;
    }

    if (action.chargeInterrupted) {
      this.spawnFloatingText(this.enemySprite.x, this.enemySprite.y - 60, t('chargeInterrupted'), 0xffe066, 18);
    }

    if (!action.attacks) return;

    await this.delay(ENEMY_ATTACK_DELAY_MS);
    if (this.gameEnded) return;
    await this.enemySprite.lunge();
    if (this.gameEnded) return;
    const hpBeforeAttack = this.battle.playerHp;
    const playerDefeated = this.battle.applyEnemyAttack(action.attackMultiplier);
    if (this.battle.playerHp < hpBeforeAttack) {
      this.flashBar(this.playerHpBarX, this.playerHpBarY, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0xff3333);
      flashDangerEdges(this);
      this.cameras.main.shake(150, 0.005);
      this.spawnFloatingText(
        this.playerHpBarX + HP_BAR_WIDTH / 2,
        this.playerHpBarY - 8,
        `-${hpBeforeAttack - this.battle.playerHp}`,
        0xff5555,
        24,
      );
    }
    if (action.convertsGems) {
      const { from, to, count } = action.convertsGems;
      const changed = this.board.convertRandomGems(from, to, count);
      for (const { row, col } of changed) {
        const sprite = this.gems[row][col];
        if (!sprite) continue;
        sprite.setTexture(`gem-${to}`);
        sprite.setData('type', to);
      }
    }
    if (action.petrifies > 0) {
      this.board.petrifyRandomCells(action.petrifies);
      this.refreshCellStateVisuals();
    }
    if (action.ignites) {
      this.board.igniteRandomCells(action.ignites.count, action.ignites.durationTurns);
      this.refreshCellStateVisuals();
    }
    if (action.appliesPoison) {
      this.spawnFloatingText(
        this.playerHpBarX + HP_BAR_WIDTH / 2,
        this.playerHpBarY - 24,
        t('poisonedFloat'),
        0x9b59b6,
        16,
      );
    }
    if (action.locksGems > 0) {
      this.board.lockRandomCells(action.locksGems);
      this.refreshCellStateVisuals();
    }
    this.refreshHpBars();

    if (playerDefeated) {
      this.endGame('gameOver', true);
    }
  }

  /**
   * Reconciles all cell-fixed visual state after gravity (or a board effect
   * that doesn't already handle its own sprites): locked-gem tint, stone
   * sprites standing in for petrified cells, and burning underlays.
   */
  private refreshCellStateVisuals(): void {
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const key = `${r},${c}`;
        let sprite = this.gems[r][c];

        if (this.board.isPetrified(r, c)) {
          if (!sprite || sprite.getData('type') !== STONE) {
            sprite?.destroy();
            sprite = this.createStoneSprite(r, c);
            this.gems[r][c] = sprite;
          }
        } else if (sprite && sprite.getData('type') === STONE) {
          // Defensive: a stone that's no longer petrified shouldn't linger.
          // destroyAdjacentStones() already removes its own sprites, so this
          // normally never fires.
          sprite.destroy();
          this.gems[r][c] = undefined;
          sprite = undefined;
        }

        if (sprite) {
          if (this.board.isLocked(r, c)) {
            sprite.setTint(0x8a8a8a);
            sprite.setAlpha(0.85);
          } else {
            sprite.clearTint();
            sprite.setAlpha(1);
          }
        }

        const isBurning = this.board.isBurning(r, c);
        const underlay = this.burningUnderlays.get(key);
        if (isBurning && !underlay) {
          this.createBurningUnderlay(r, c);
        } else if (!isBurning && underlay) {
          underlay.destroy();
          this.burningUnderlays.delete(key);
        }
      }
    }
  }

  /** Plays the death animation, awards currency, then advances to the next
   * wave (with a banner) or ends the level battle with a results panel. */
  private async handleEnemyDefeated(): Promise<void> {
    const defeatedElement = this.battle.enemy.element;
    await this.enemySprite.die(defeatedElement);
    if (this.gameEnded) return;

    // A battle covers exactly one selected level. Clearing its
    // last enemy ends the battle with stars + progress; otherwise the next
    // wave of the same level rolls in.
    savePlayerData(addCurrency(loadPlayerData(), CURRENCY_PER_ENEMY_DEFEAT));

    if (!this.battle.isFinalEnemyInLevel()) {
      this.battle.advance();
      await this.showNextWave();
      return;
    }

    this.handleStoryVictory();
  }

  /** Wave transition: banner + entrance animation for the freshly spawned enemy. */
  private async showNextWave(): Promise<void> {
    this.refreshHpBars();
    const total = this.battle.levels[this.battle.levelIndex].length;
    await showBanner(
      this,
      t('wave', { x: this.battle.enemyIndexInLevel + 1, y: total, name: tr(this.battle.enemy.name) }),
      this.theme.ambient,
    );
    if (this.gameEnded) return;
    await this.introduceEnemy();
  }

  /** Story-mode level clear: stars by the level's star criteria, progress + currency, results panel. */
  private handleStoryVictory(): void {
    this.gameEnded = true;

    const hpRatio = this.battle.playerHp / this.battle.playerMaxHp;
    const stars = starsForLevel(this.currentLevel?.starCriteria, {
      hpRatio,
      turnsUsed: this.battle.turnCount,
    });
    const branch = branchForLevel(this.levelId);
    const nextLevelId = nextLevelIdInBranch(this.levelId);
    const isCampaignFinale = branch?.id === 'final' && nextLevelId === null;
    const isBranchBossClear = branch !== undefined && !isCampaignFinale && nextLevelId === null;
    const currencyEarned =
      CURRENCY_PER_LEVEL_CLEAR + (isCampaignFinale ? CURRENCY_GAME_CLEAR_BONUS : 0);

    let data = loadPlayerData();
    data = addCurrency(data, currencyEarned);
    data = recordLevelClear(data, this.levelId, stars);
    savePlayerData(data);

    // Composed as a closure so the language toggle can rebuild the panel.
    const show = () => {
      // Auto-continue only within a branch; a branch boss sends the player
      // back to the map to pick their next front.
      const buttons: { label: string; onClick: () => void }[] = [];
      if (nextLevelId) {
        buttons.push({
          label: t('nextLevel'),
          onClick: () => {
            carryCooldownsForward(this.battle.skillCooldowns);
            this.scene.restart({ levelId: nextLevelId });
          },
        });
      }
      buttons.push({ label: t('backToMap'), onClick: () => this.scene.start('LevelSelectScene') });

      this.showEndPanel({
        title: t('levelClear'),
        titleColor: '#ffe066',
        stars,
        lines: [
          t('score', { n: this.score }),
          t('reward', { n: currencyEarned }),
          isCampaignFinale ? t('gameClearLine') : '',
          isBranchBossClear ? t('branchClearLine', { branch: tr(branch?.title ?? '') }) : '',
        ].filter(Boolean),
        buttons,
      });
    };
    this.activeOverlayRedraw = show;
    show();
  }

  /** Structured end-of-battle results panel (victory or defeat).
   * Takes a title KEY (not text) so the language toggle can rebuild it. */
  private endGame(titleKey: UiKey, isDefeat: boolean): void {
    this.gameEnded = true;

    const show = () => {
      this.showEndPanel({
        title: t(titleKey),
        titleColor: isDefeat ? '#ff5555' : '#ffe066',
        lines: [],
        buttons: [{ label: t('backToMenu'), onClick: () => this.scene.start('LevelSelectScene') }],
      });
    };
    this.activeOverlayRedraw = show;
    show();
  }

  /** Draws the shared results panel: dark overlay, framed card, title, optional stars, lines, buttons. */
  private showEndPanel(opts: {
    title: string;
    titleColor: string;
    lines: string[];
    stars?: number;
    buttons: { label: string; onClick: () => void }[];
  }): void {
    this.gameEnded = true;
    // Tear down any previous panel first — the language toggle rebuilds the
    // panel in place by calling the composing closure again.
    for (const obj of this.endPanelObjects) obj.destroy();
    this.endPanelObjects = [];
    const track = <T extends Phaser.GameObjects.GameObject>(obj: T): T => {
      this.endPanelObjects.push(obj);
      return obj;
    };
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    track(
      this.add
        .rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.7)
        .setDepth(300)
        .setInteractive(), // swallow clicks below
    );

    const bodyLines = opts.lines.filter(Boolean);
    const panelHeight =
      150 + (opts.stars !== undefined ? 56 : 0) + bodyLines.length * 24 + 64;
    const panel = track(
      this.add
        .rectangle(cx, cy, 460, panelHeight, 0x1b1f2e, 0.97)
        .setStrokeStyle(2, 0x5a6cad)
        .setDepth(301),
    );
    panel.setScale(0.8);
    panel.setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });

    let y = cy - panelHeight / 2 + 52;
    track(
      this.add
        .text(cx, y, opts.title, {
          fontSize: '34px',
          color: opts.titleColor,
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(302),
    );
    y += 44;

    if (opts.stars !== undefined) {
      const starText = '★'.repeat(opts.stars) + '☆'.repeat(Math.max(0, 3 - opts.stars));
      const starsLabel = track(
        this.add
          .text(cx, y + 14, starText, { fontSize: '40px', color: '#ffe066' })
          .setOrigin(0.5)
          .setDepth(302)
          .setScale(0),
      );
      this.tweens.add({
        targets: starsLabel,
        scale: 1,
        duration: 320,
        delay: 180,
        ease: 'Back.easeOut',
      });
      y += 56;
    }

    for (const line of bodyLines) {
      track(
        this.add
          .text(cx, y + 10, line, {
            fontSize: '16px',
            color: '#c6cdea',
            align: 'center',
            wordWrap: { width: 420 },
          })
          .setOrigin(0.5, 0)
          .setDepth(302),
      );
      y += 24;
    }

    const buttonY = cy + panelHeight / 2 - 44;
    const buttonWidth = 180;
    const gap = 16;
    const totalWidth = opts.buttons.length * buttonWidth + (opts.buttons.length - 1) * gap;
    opts.buttons.forEach((button, index) => {
      const x = cx - totalWidth / 2 + buttonWidth / 2 + index * (buttonWidth + gap);
      const rect = track(
        this.add
          .rectangle(x, buttonY, buttonWidth, 44, index === 0 ? 0x33406b : 0x2a2f45)
          .setStrokeStyle(2, 0x5a6cad)
          .setDepth(302)
          .setInteractive({ useHandCursor: true }),
      );
      track(
        this.add
          .text(x, buttonY, button.label, { fontSize: '17px', color: '#ffffff', fontStyle: 'bold' })
          .setOrigin(0.5)
          .setDepth(303),
      );
      rect.on('pointerover', () => rect.setFillStyle(0x435180));
      rect.on('pointerout', () => rect.setFillStyle(index === 0 ? 0x33406b : 0x2a2f45));
      rect.on('pointerdown', button.onClick);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }

  private playMatchClearAnimation(matches: Set<string>): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const key of matches) {
      const [r, c] = key.split(',').map(Number);
      const sprite = this.gems[r][c];
      if (!sprite) continue;
      burstAt(this, sprite.x, sprite.y, (sprite.getData('type') as number) ?? 0, 5);
      promises.push(
        new Promise((resolve) => {
          this.tweens.add({
            targets: sprite,
            scale: 0,
            alpha: 0,
            duration: 150,
            ease: 'Back.easeIn',
            onComplete: () => {
              sprite.destroy();
              resolve();
            },
          });
        }),
      );
      this.gems[r][c] = undefined;
    }
    return Promise.all(promises).then(() => undefined);
  }

  private applyGravityToSprites(
    moves: { from: Vec2; to: Vec2 }[],
    spawns: Vec2[],
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const move of moves) {
      const sprite = this.gems[move.from.row][move.from.col];
      this.gems[move.from.row][move.from.col] = undefined;
      this.gems[move.to.row][move.to.col] = sprite;
      if (!sprite) continue;
      const pixel = this.cellToPixel(move.to.row, move.to.col);
      promises.push(
        new Promise((resolve) => {
          this.tweens.add({
            targets: sprite,
            y: pixel.y,
            duration: 180,
            ease: 'Bounce.easeOut',
            onComplete: () => resolve(),
          });
        }),
      );
    }

    for (const spawn of spawns) {
      const type = this.board.get(spawn.row, spawn.col);
      const sprite = this.createGemSprite(spawn.row, spawn.col, type);
      const startPixel = this.cellToPixel(spawn.row, spawn.col);
      sprite.y = startPixel.y - TILE_SIZE * (spawn.row + 1);
      this.gems[spawn.row][spawn.col] = sprite;
      promises.push(
        new Promise((resolve) => {
          this.tweens.add({
            targets: sprite,
            y: startPixel.y,
            duration: 220,
            ease: 'Bounce.easeOut',
            onComplete: () => resolve(),
          });
        }),
      );
    }

    return Promise.all(promises).then(() => undefined);
  }
}
