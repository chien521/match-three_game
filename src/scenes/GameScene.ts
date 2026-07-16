import Phaser from 'phaser';
import { Board } from '../game/Board';
import type { Vec2 } from '../game/Board';
import { BattleState } from '../game/BattleState';
import { LEVEL_NAMES, LEVEL_STORY } from '../game/levels';
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
import type { RunStats } from '../game/run';
import {
  RUN_LOSS_CURRENCY,
  RUN_WIN_CURRENCY,
  advanceFloor,
  findNode,
  generateEncounter,
  getActiveRun,
  isLastFloor,
  persistRun,
  recordVictory,
  runTeamMaxHp,
  setActiveRun,
} from '../game/run';
import { aggregateRelics } from '../game/relics';
import type { RelicModifiers } from '../game/relics';
import {
  BOARD_COLS,
  BOARD_MARGIN,
  BOARD_ROWS,
  ENEMY_ATTACK_DELAY_MS,
  GEM_COLORS,
  HEART_TYPE,
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
  themeForChapter,
} from './battleFx';
import type { BattleTheme } from './battleFx';
import { recordLevelClear, starsForClear } from '../game/playerData';
import { LEVELS } from '../game/levels';
import { drawAvatar } from './avatarUi';

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
  private enemyHpBarFill!: Phaser.GameObjects.Graphics;
  private enemyHpText!: Phaser.GameObjects.Text;
  private enemyHpBarX = 0;
  private enemyHpBarY = 0;

  private playerHpBarFill!: Phaser.GameObjects.Graphics;
  private playerHpText!: Phaser.GameObjects.Text;
  private playerHpBarX = 0;
  private playerHpBarY = 0;
  private rosterTexts: Phaser.GameObjects.Text[] = [];
  private rosterButtons: Phaser.GameObjects.Rectangle[] = [];
  private rosterAvatars: Phaser.GameObjects.Container[] = [];

  private startLevelIndex = 0;

  /** True when this battle belongs to a roguelike run (see game/run.ts). */
  private runMode = false;
  private relicMods: RelicModifiers | null = null;
  private turnTimeMs = TURN_TIME_MS;

  private enemySprite!: EnemySprite;
  private theme!: BattleTheme;

  constructor() {
    super('GameScene');
  }

  init(data: { levelIndex?: number; mode?: 'run' }): void {
    this.startLevelIndex = data?.levelIndex ?? 0;
    this.runMode = data?.mode === 'run' && getActiveRun() !== null;
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

    const boardPixelWidth = BOARD_COLS * TILE_SIZE;
    const boardPixelHeight = BOARD_ROWS * TILE_SIZE;
    this.boardOriginX = (this.scale.width - boardPixelWidth) / 2;
    // Board sits low enough to leave room for the enemy sprite above it.
    this.boardOriginY = (this.scale.height - boardPixelHeight) / 2 + 70;

    const chapter = this.runMode
      ? getActiveRun()?.floor ?? 0
      : Math.floor(this.startLevelIndex / 3);
    this.theme = themeForChapter(chapter);
    drawThemedBackground(this, this.theme);

    this.drawBoardBackground(boardPixelWidth, boardPixelHeight);

    this.board = new Board(BOARD_COLS, BOARD_ROWS);
    this.board.fillRandomNoMatches();
    this.buildSprites();

    this.scoreText = this.add.text(BOARD_MARGIN, BOARD_MARGIN, 'Score: 0', {
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    this.comboText = this.add
      .text(this.scale.width - BOARD_MARGIN, BOARD_MARGIN, '', {
        fontSize: '22px',
        color: '#ffe066',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);

    const run = this.runMode ? getActiveRun() : null;
    if (run && run.currentNodeId) {
      const node = findNode(run.map, run.currentNodeId)!;
      const encounter = generateEncounter(run, node);
      this.relicMods = aggregateRelics(run.relics);
      this.turnTimeMs = TURN_TIME_MS + this.relicMods.moveTimeBonusMs;
      this.battle = new BattleState(0, run.team, {
        levels: [encounter],
        maxHp: runTeamMaxHp(run),
        startHp: run.teamHp,
      });
    } else {
      this.runMode = false;
      this.relicMods = null;
      this.turnTimeMs = TURN_TIME_MS;
      const playerData = loadPlayerData();
      this.battle = new BattleState(this.startLevelIndex, getActiveTeam(playerData));
    }
    this.enemySprite = new EnemySprite(this, this.scale.width / 2, ENEMY_SPRITE_Y);
    this.createHpBars();
    this.createTurnTimerBar(boardPixelWidth);
    // Run battles start immediately; story battles introduce the enemy only
    // after the narration overlay is dismissed (see showStoryIntro).
    if (this.runMode) void this.introduceEnemy();

    const leaderSkill = this.battle.team[0]?.leaderSkill;
    if (leaderSkill) {
      this.add
        .text(BOARD_MARGIN, BOARD_MARGIN + 34, `Leader: ${leaderSkill.name} — ${leaderSkill.description}`, {
          fontSize: '14px',
          color: '#7dd3fc',
        });
    }

    this.setupInput();
    if (this.runMode) {
      this.storyDismissed = true; // run battles start immediately, no narration
    } else {
      this.showStoryIntro();
    }
  }

  /** Blocks input behind a narration overlay before the battle begins. */
  private showStoryIntro(): void {
    this.storyDismissed = false;
    const overlay = this.add.rectangle(
      this.scale.width / 2,
      this.scale.height / 2,
      this.scale.width,
      this.scale.height,
      0x000000,
      0.75,
    ).setDepth(200);

    const title = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 90, LEVEL_NAMES[this.startLevelIndex] ?? '', {
        fontSize: '26px',
        color: '#ffe066',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(201);

    const story = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 30, LEVEL_STORY[this.startLevelIndex] ?? '', {
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
      .text(this.scale.width / 2, this.scale.height / 2 + 120, 'Begin Battle', {
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(201);

    button.on('pointerover', () => button.setFillStyle(0x394162));
    button.on('pointerout', () => button.setFillStyle(0x2a2f45));
    button.on('pointerdown', () => {
      overlay.destroy();
      title.destroy();
      story.destroy();
      button.destroy();
      buttonText.destroy();
      void this.introduceEnemy();
      // Defer one tick so the same click can't fall through to the board
      // and start (and instantly waste) a turn.
      this.time.delayedCall(0, () => {
        this.storyDismissed = true;
      });
    });
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
    const prefix = this.runMode
      ? `Floor ${(getActiveRun()?.floor ?? 0) + 1}`
      : `Lv.${this.battle.levelNumber}`;
    this.enemyNameText.setText(
      `${prefix}  ${this.battle.enemy.name} (${elementName(this.battle.enemy.element)})`,
    );
    this.enemyHpText.setText(`${this.battle.enemy.hp} / ${this.battle.enemy.maxHp}`);

    const enemy = this.battle.enemy;
    const status: string[] = [`ATK in ${enemy.attackCountdown}`];
    if (enemy.shieldTurns > 0) {
      status.push(`🛡 -${Math.round(enemy.shieldReduction * 100)}% dmg (${enemy.shieldTurns})`);
    }
    if (enemy.lockCountOnAttack > 0) {
      status.push(`🔒 locks ${enemy.lockCountOnAttack} gems on attack`);
    }
    this.enemyStatusText.setText(status.join('    '));
    this.enemyStatusText.setColor(enemy.attackCountdown <= 1 ? '#ff7b7b' : '#9aa3c7');

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
    this.refreshRoster();
  }

  private refreshRoster(): void {
    this.battle.team.forEach((character, index) => {
      const cooldown = this.battle.skillCooldowns[index];
      const ready = cooldown === 0 && !this.gameEnded;
      const label = cooldown > 0
        ? `${character.skillName}\nCD ${cooldown}`
        : `${character.skillName}\nReady!`;
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

  private createGemSprite(row: number, col: number, type: number): Phaser.GameObjects.Image {
    const { x, y } = this.cellToPixel(row, col);
    const sprite = this.add.image(x, y, `gem-${type}`);
    sprite.setData('type', type);
    return sprite;
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
        !this.board.isLocked(targetCell.row, targetCell.col) // locked gems can't be displaced
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
      this.scoreText.setText(`Score: ${this.score}`);
      const bigMatch = groups.some((g) => g.size >= 4);
      this.comboText.setText(
        combo > 1 ? `${combo} Combo!${bigMatch ? ' Big Match!' : ''}` : bigMatch ? 'Big Match!' : '',
      );
      this.pulseComboText(combo);
      this.spawnGroupDamageTexts(groups);

      await this.playMatchClearAnimation(matches);
      this.board.clearCells(matches);

      const { moves, spawns } = this.board.applyGravityAndRefill();
      await this.applyGravityToSprites(moves, spawns);
      this.refreshLockVisuals(); // locks travel with falling gems
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
      this.relicMods ?? undefined,
    );
    const totalHeal = computeHealAmount(allGroups, combo, this.relicMods ?? undefined);

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
  private spawnGroupDamageTexts(groups: { element: number; size: number; cells: Vec2[] }[]): void {
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

    // The enemy acts on its own countdown (attackInterval turns per attack).
    const action = this.battle.tickEnemyTurn();
    this.refreshHpBars();
    if (!action.attacks) return;

    await this.delay(ENEMY_ATTACK_DELAY_MS);
    if (this.gameEnded) return;
    await this.enemySprite.lunge();
    if (this.gameEnded) return;
    const hpBeforeAttack = this.battle.playerHp;
    const playerDefeated = this.battle.applyEnemyAttack();
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
    if (action.locksGems > 0) {
      this.board.lockRandomCells(action.locksGems);
      this.refreshLockVisuals();
    }
    this.refreshHpBars();

    if (playerDefeated) {
      if (this.runMode) {
        const run = getActiveRun();
        // Snapshot stats before setActiveRun(null) clears the active run.
        const stats = run ? { ...run.stats, relicsCollected: [...run.stats.relicsCollected] } : undefined;
        savePlayerData(addCurrency(loadPlayerData(), RUN_LOSS_CURRENCY));
        setActiveRun(null);
        this.endGame(`Run Failed...\n+${RUN_LOSS_CURRENCY} 💎`, stats);
      } else {
        this.endGame('Game Over');
      }
    }
  }

  /** Grays out gems on locked cells; restores normal tint elsewhere. */
  private refreshLockVisuals(): void {
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const sprite = this.gems[r][c];
        if (!sprite) continue;
        if (this.board.isLocked(r, c)) {
          sprite.setTint(0x8a8a8a);
          sprite.setAlpha(0.85);
        } else {
          sprite.clearTint();
          sprite.setAlpha(1);
        }
      }
    }
  }

  /** Plays the death animation, awards currency, then advances to the next
   * wave (with a banner) or ends the level/run battle with a results panel. */
  private async handleEnemyDefeated(): Promise<void> {
    const defeatedElement = this.battle.enemy.element;
    await this.enemySprite.die(defeatedElement);
    if (this.gameEnded) return;

    if (this.runMode) {
      const hasNext = this.battle.advance();
      if (hasNext) {
        await this.showNextWave();
        return;
      }
      this.handleRunVictory();
      return;
    }

    // Story mode: a battle covers exactly one selected level. Clearing its
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
      `Wave ${this.battle.enemyIndexInLevel + 1} / ${total} — ${this.battle.enemy.name}`,
      this.theme.ambient,
    );
    if (this.gameEnded) return;
    await this.introduceEnemy();
  }

  /** Story-mode level clear: stars by remaining HP, progress + currency, results panel. */
  private handleStoryVictory(): void {
    this.gameEnded = true;

    const hpRatio = this.battle.playerHp / this.battle.playerMaxHp;
    const stars = starsForClear(hpRatio);
    const isLastLevel = this.startLevelIndex === LEVELS.length - 1;
    const currencyEarned =
      CURRENCY_PER_LEVEL_CLEAR + (isLastLevel ? CURRENCY_GAME_CLEAR_BONUS : 0);

    let data = loadPlayerData();
    data = addCurrency(data, currencyEarned);
    data = recordLevelClear(data, this.startLevelIndex, stars);
    savePlayerData(data);

    const buttons: { label: string; onClick: () => void }[] = [];
    if (!isLastLevel) {
      const nextLevel = this.startLevelIndex + 1;
      buttons.push({
        label: 'Next Level ▶',
        onClick: () => this.scene.restart({ levelIndex: nextLevel }),
      });
    }
    buttons.push({ label: 'Back to Map', onClick: () => this.scene.start('LevelSelectScene') });

    this.showEndPanel({
      title: 'Level Clear!',
      titleColor: '#ffe066',
      stars,
      lines: [
        `Score: ${this.score}`,
        `Reward: +${currencyEarned} 💎`,
        isLastLevel ? 'The Ancient Dragon has fallen. The realm is saved!' : '',
      ].filter(Boolean),
      buttons,
    });
  }

  /**
   * Ends a won run battle: carries remaining HP (plus post-battle relic
   * healing) back into the run, queues the node's reward, and returns to the
   * run map — or finishes/advances the run after a boss.
   */
  private handleRunVictory(): void {
    const run = getActiveRun();
    if (!run || !run.currentNodeId) return;
    const node = findNode(run.map, run.currentNodeId)!;

    const maxHp = runTeamMaxHp(run);
    const postBattleHeal = Math.round(maxHp * (this.relicMods?.postBattleHealFraction ?? 0));
    run.teamHp = Math.min(maxHp, this.battle.playerHp + postBattleHeal);
    recordVictory(run, node.type);
    persistRun(run);

    if (node.type === 'boss') {
      if (isLastFloor(run)) {
        // Snapshot stats before setActiveRun(null) clears the active run.
        const stats = { ...run.stats, relicsCollected: [...run.stats.relicsCollected] };
        savePlayerData(addCurrency(loadPlayerData(), RUN_WIN_CURRENCY));
        setActiveRun(null);
        this.endGame(`Run Complete!\n+${RUN_WIN_CURRENCY} 💎`, stats);
        return;
      }
      advanceFloor(run);
      run.pendingReward = 'relic'; // floor-clear reward
    } else if (node.type === 'elite') {
      run.pendingReward = 'relic';
    } else if (node.recruit) {
      run.pendingReward = 'recruit';
    }
    persistRun(run); // pendingReward (and any advanceFloor changes) written above

    this.gameEnded = true; // stop any in-flight enemy retaliation
    this.scene.start('RunMapScene');
  }

  /** Structured end-of-battle results panel (victory or defeat, story or run). */
  private endGame(message: string, stats?: RunStats): void {
    this.gameEnded = true;

    const [title, ...rest] = message.split('\n');
    const lines = [...rest];
    if (stats) {
      lines.push(
        `Battles Won: ${stats.battlesWon}`,
        `Elites Defeated: ${stats.elitesKilled}`,
        `Floors Cleared: ${stats.floorsCleared}`,
        `Relics: ${stats.relicsCollected.length > 0 ? stats.relicsCollected.join(', ') : 'none'}`,
      );
    }
    const isDefeat = /over|fail/i.test(title);

    this.showEndPanel({
      title,
      titleColor: isDefeat ? '#ff5555' : '#ffe066',
      lines,
      buttons: [{ label: 'Back to Menu', onClick: () => this.scene.start('LevelSelectScene') }],
    });
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
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.add
      .rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.7)
      .setDepth(300)
      .setInteractive(); // swallow clicks below

    const bodyLines = opts.lines.filter(Boolean);
    const panelHeight =
      150 + (opts.stars !== undefined ? 56 : 0) + bodyLines.length * 24 + 64;
    const panel = this.add
      .rectangle(cx, cy, 460, panelHeight, 0x1b1f2e, 0.97)
      .setStrokeStyle(2, 0x5a6cad)
      .setDepth(301);
    panel.setScale(0.8);
    panel.setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });

    let y = cy - panelHeight / 2 + 52;
    this.add
      .text(cx, y, opts.title, {
        fontSize: '34px',
        color: opts.titleColor,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(302);
    y += 44;

    if (opts.stars !== undefined) {
      const starText = '★'.repeat(opts.stars) + '☆'.repeat(Math.max(0, 3 - opts.stars));
      const starsLabel = this.add
        .text(cx, y + 14, starText, { fontSize: '40px', color: '#ffe066' })
        .setOrigin(0.5)
        .setDepth(302)
        .setScale(0);
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
      this.add
        .text(cx, y + 10, line, {
          fontSize: '16px',
          color: '#c6cdea',
          align: 'center',
          wordWrap: { width: 420 },
        })
        .setOrigin(0.5, 0)
        .setDepth(302);
      y += 24;
    }

    const buttonY = cy + panelHeight / 2 - 44;
    const buttonWidth = 180;
    const gap = 16;
    const totalWidth = opts.buttons.length * buttonWidth + (opts.buttons.length - 1) * gap;
    opts.buttons.forEach((button, index) => {
      const x = cx - totalWidth / 2 + buttonWidth / 2 + index * (buttonWidth + gap);
      const rect = this.add
        .rectangle(x, buttonY, buttonWidth, 44, index === 0 ? 0x33406b : 0x2a2f45)
        .setStrokeStyle(2, 0x5a6cad)
        .setDepth(302)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, buttonY, button.label, { fontSize: '17px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(303);
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
