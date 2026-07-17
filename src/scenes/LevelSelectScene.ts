import Phaser from 'phaser';
import { BRANCHES, branchForLevel, levelById } from '../game/levels';
import type { BranchInfo, LevelConfig } from '../game/levels';
import { enemyEmoji } from '../game/enemyArt';
import { isLevelUnlocked, loadPlayerData } from '../game/playerData';
import type { PlayerData } from '../game/playerData';
import { t, tr } from '../game/i18n';
import { lighten } from './gemArt';
import { themeForBranch } from './battleFx';
import { drawLanguageToggle } from './langToggle';

/** Parallel (non-'single') branches, in map order — however many there are,
 * evenly spread across the width by columnX() below. */
const PARALLEL_BRANCHES = BRANCHES.filter((b) => b.column !== 'single');
const COLUMN_MARGIN = 120;

/** x position for a branch column: 'single' sits dead center; a parallel
 * branch's index is spread evenly across the map width between the margins. */
function columnX(column: BranchInfo['column']): number {
  if (column === 'single') return 400;
  if (PARALLEL_BRANCHES.length <= 1) return 400;
  const usable = 800 - COLUMN_MARGIN * 2;
  return COLUMN_MARGIN + (usable * column) / (PARALLEL_BRANCHES.length - 1);
}

/** Bottom-to-top node y positions: prologue at the bottom, branches fan out, final chapter converges on top. */
const PROLOGUE_YS = [706, 640];
const BRANCH_YS = [564, 492, 420];
const FINAL_YS = [330, 256, 182];

/**
 * Campaign world map: a prologue path that forks into several parallel
 * elemental branches (playable in any order), converging into the final
 * chapter once every branch boss is down. Cleared levels show their
 * best star rating; every currently-reachable level pulses.
 */
export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelectScene');
  }

  create(): void {
    this.drawBackground();
    this.drawHeader();
    this.drawMap();
    this.createTopNav();
    drawLanguageToggle(this, 20, 18, () => this.scene.restart());
  }

  /** Screen position of a level's node, derived from its branch column + position. */
  private nodePosition(levelId: string): { x: number; y: number } {
    const branch = branchForLevel(levelId);
    if (!branch) return { x: 400, y: 400 };
    const index = branch.levelIds.indexOf(levelId);
    const x = columnX(branch.column);
    const ys =
      branch.id === 'prologue' ? PROLOGUE_YS : branch.id === 'final' ? FINAL_YS : BRANCH_YS;
    return { x, y: ys[index] ?? 400 };
  }

  private drawBackground(): void {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.fillGradientStyle(0x10131d, 0x10131d, 0x151827, 0x151827, 1);
    g.fillRect(0, 0, width, height);

    // Soft tinted zones: one vertical band per elemental branch column, plus
    // horizontal bands for the prologue (bottom) and final chapter (top).
    const bands = this.add.graphics();
    for (const branch of BRANCHES) {
      const theme = themeForBranch(branch.id);
      if (branch.column === 'single') {
        const ys = branch.id === 'prologue' ? PROLOGUE_YS : FINAL_YS;
        const top = Math.min(...ys) - 48;
        const bottom = Math.max(...ys) + 48;
        bands.fillGradientStyle(theme.top, theme.top, 0x10131d, 0x10131d, 0.45, 0.45, 0.1, 0.1);
        bands.fillRect(0, top, width, bottom - top);
      } else {
        const x = columnX(branch.column);
        bands.fillGradientStyle(theme.top, theme.top, 0x10131d, 0x10131d, 0.5, 0.5, 0.12, 0.12);
        bands.fillRoundedRect(x - 80, BRANCH_YS[2] - 44, 160, BRANCH_YS[0] - BRANCH_YS[2] + 88, 18);
      }

      // A few drifting motes per zone, tinted to the branch.
      for (let i = 0; i < 4; i++) {
        const zoneX =
          branch.column === 'single' ? Math.random() * width : columnX(branch.column) - 70 + Math.random() * 140;
        const ys = branch.id === 'prologue' ? PROLOGUE_YS : branch.id === 'final' ? FINAL_YS : BRANCH_YS;
        const zoneY = Math.min(...ys) - 30 + Math.random() * (Math.max(...ys) - Math.min(...ys) + 60);
        const mote = this.add.circle(zoneX, zoneY, 1.5 + Math.random() * 2, lighten(theme.ambient, 0.3), 0.18);
        this.tweens.add({
          targets: mote,
          y: zoneY - 40 - Math.random() * 40,
          alpha: 0,
          duration: 5000 + Math.random() * 5000,
          delay: Math.random() * 4000,
          repeat: -1,
          onRepeat: () => {
            mote.y = zoneY;
            mote.alpha = 0.18;
          },
        });
      }
    }
  }

  private drawHeader(): void {
    this.add
      .text(this.scale.width / 2, 42, '轉珠 Match-3', {
        fontSize: '38px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(this.scale.width / 2, 78, t('mapSubtitle'), {
        fontSize: '14px',
        color: '#9aa3c7',
      })
      .setOrigin(0.5);

    const data = loadPlayerData();
    this.add
      .text(this.scale.width - 20, 24, `💎 ${data.currency}`, {
        fontSize: '20px',
        color: '#ffe066',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);
  }

  private isCleared(data: PlayerData, levelId: string): boolean {
    return (data.levelStars[levelId] ?? 0) > 0;
  }

  private drawMap(): void {
    const data = loadPlayerData();

    this.drawConnections(data);
    for (const branch of BRANCHES) {
      for (const levelId of branch.levelIds) {
        const level = levelById(levelId);
        if (level) this.drawNode(data, branch, level);
      }
    }
  }

  /** All path segments: within-branch links, the 3-way fork after the prologue, and the 3-way convergence into the final chapter. */
  private drawConnections(data: PlayerData): void {
    const lines = this.add.graphics();
    const drawSegment = (fromId: string, toId: string, tint: number) => {
      const from = this.nodePosition(fromId);
      const to = this.nodePosition(toId);
      const walked = this.isCleared(data, fromId) && this.isCleared(data, toId);
      lines.lineStyle(walked ? 5 : 3, walked ? 0xffe066 : tint, walked ? 0.9 : 0.55);
      lines.lineBetween(from.x, from.y, to.x, to.y);
    };

    for (const branch of BRANCHES) {
      const tint = lighten(themeForBranch(branch.id).ambient, 0);
      for (let i = 0; i < branch.levelIds.length - 1; i++) {
        drawSegment(branch.levelIds[i], branch.levelIds[i + 1], tint);
      }
    }

    const prologueEnd = 'prologue-2';
    const finalStart = 'final-1';
    for (const branch of BRANCHES) {
      if (branch.column === 'single') continue;
      const tint = themeForBranch(branch.id).ambient;
      drawSegment(prologueEnd, branch.levelIds[0], tint);
      drawSegment(branch.levelIds[branch.levelIds.length - 1], finalStart, tint);
    }
  }

  private drawNode(data: PlayerData, branch: BranchInfo, level: LevelConfig): void {
    const { x, y } = this.nodePosition(level.id);
    const theme = themeForBranch(branch.id);
    const unlocked = isLevelUnlocked(data, level.id);
    const stars = data.levelStars[level.id] ?? 0;
    const isFrontier = unlocked && stars === 0;
    const isBossLevel = level.enemies.some((e) => e.boss);
    const isFinalGate = level.id === 'final-1' && !unlocked;

    const nodeRadius = isBossLevel || isFinalGate ? 34 : 28;

    if (isFrontier) {
      // Pulsing halo marking every currently-playable level (with three
      // branches open at once there can be several).
      const halo = this.add.circle(x, y, nodeRadius + 8, 0xffe066, 0.25);
      this.tweens.add({
        targets: halo,
        scale: 1.25,
        alpha: 0.05,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    const circle = this.add
      .circle(x, y, nodeRadius, unlocked ? 0x2a2f45 : 0x1a1d29)
      .setStrokeStyle(3, unlocked ? lighten(theme.ambient, 0.1) : 0x2a2f45);

    const representative = level.enemies[level.enemies.length - 1];
    const icon = this.add
      .text(x, y, unlocked ? enemyEmoji(representative.name) : '🔒', {
        fontSize: isBossLevel ? '30px' : '24px',
      })
      .setOrigin(0.5);

    // Position-in-branch badge (1..3 within its own branch).
    const positionInBranch = branch.levelIds.indexOf(level.id) + 1;
    const badge = this.add.circle(x - nodeRadius + 4, y - nodeRadius + 4, 11, theme.ambient, 1);
    const badgeText = this.add
      .text(badge.x, badge.y, `${positionInBranch}`, {
        fontSize: '12px',
        color: '#0e1018',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Tiny rule badges (turn limit / restricted gem colors / move-time override).
    const ruleGlyphs: string[] = [];
    if (level.rules?.turnLimit !== undefined) ruleGlyphs.push('⏱');
    if (level.rules?.gemColors !== undefined) ruleGlyphs.push('🎨');
    if (level.rules?.moveTimeMs !== undefined) ruleGlyphs.push('⚡');
    const ruleBadge =
      ruleGlyphs.length > 0
        ? this.add
            .text(x + nodeRadius - 4, y - nodeRadius + 4, ruleGlyphs.join(''), {
              fontSize: '13px',
            })
            .setOrigin(1, 0.5)
        : null;

    // Labels sit beside the node: outside-left for the left column,
    // outside-right for the right column, and to the right for center nodes
    // (the outer columns' labels face outward, so nothing collides).
    const side = branch.column === 0 ? -1 : 1;
    const labelX = x + side * (nodeRadius + 12);
    const originX = side > 0 ? 0 : 1;
    const labels: Phaser.GameObjects.Text[] = [];

    // The first node of each elemental branch carries the branch title.
    if (branch.column !== 'single' && positionInBranch === 1) {
      labels.push(
        this.add
          .text(labelX, y - 24, tr(branch.title), {
            fontSize: '11px',
            color: `#${lighten(theme.ambient, 0.25).toString(16).padStart(6, '0')}`,
            fontStyle: 'bold',
          })
          .setOrigin(originX, 0.5),
      );
    }

    if (stars > 0) {
      labels.push(
        this.add
          .text(labelX, y - 9, '★'.repeat(stars) + '☆'.repeat(3 - stars), {
            fontSize: '13px',
            color: '#ffe066',
          })
          .setOrigin(originX, 0.5),
      );
    }

    // The locked final gate explains its own requirement instead of a name.
    const nameText = isFinalGate ? t('finalGate') : tr(level.name);
    labels.push(
      this.add
        .text(labelX, y + (stars > 0 ? 9 : 0), nameText, {
          fontSize: '12px',
          color: isFinalGate ? '#ffe066' : unlocked ? '#9aa3c7' : '#4a5068',
        })
        .setOrigin(originX, 0.5),
    );

    if (!unlocked) {
      const dimmed = isFinalGate ? 0.75 : 0.5; // keep the gate's requirement readable
      [circle, icon, badge, badgeText, ruleBadge, ...labels].forEach((obj) => obj?.setAlpha(dimmed));
      return;
    }

    circle.setInteractive({ useHandCursor: true });
    circle.on('pointerover', () => {
      circle.setFillStyle(0x394162);
      circle.setScale(1.1);
    });
    circle.on('pointerout', () => {
      circle.setFillStyle(0x2a2f45);
      circle.setScale(1);
    });
    circle.on('pointerdown', () => {
      this.scene.start('GameScene', { levelId: level.id });
    });
  }

  private createTopNav(): void {
    const labels: { text: string; scene: string }[] = [
      { text: t('navGacha'), scene: 'GachaScene' },
      { text: t('navCollection'), scene: 'CollectionScene' },
    ];
    const width = 170;
    const gap = 12;
    const totalWidth = width * labels.length + gap * (labels.length - 1);
    const startX = this.scale.width / 2 - totalWidth / 2 + width / 2;
    const y = this.scale.height - 36;

    labels.forEach(({ text, scene }, index) => {
      const x = startX + index * (width + gap);
      const button = this.add
        .rectangle(x, y, width, 44, 0x2a2f45)
        .setStrokeStyle(2, 0x394162)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, y, text, { fontSize: '16px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5);
      button.on('pointerover', () => button.setFillStyle(0x394162));
      button.on('pointerout', () => button.setFillStyle(0x2a2f45));
      button.on('pointerdown', () => this.scene.start(scene));
    });
  }
}
