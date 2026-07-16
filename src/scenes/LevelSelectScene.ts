import Phaser from 'phaser';
import { CHAPTERS, LEVELS, LEVEL_NAMES } from '../game/levels';
import { enemyEmoji } from '../game/enemyArt';
import { isLevelUnlocked, loadPlayerData } from '../game/playerData';
import { lighten } from './gemArt';
import { themeForChapter } from './battleFx';

/** Zigzag node positions for the 9 story levels (level 0 at the bottom). */
const NODE_XS = [220, 400, 580, 580, 400, 220, 220, 400, 580];
const NODE_Y_BOTTOM = 668;
const NODE_Y_STEP = 62;

/**
 * Story world map: a winding path of level nodes climbing through three
 * themed chapter bands. Levels unlock in order; cleared levels show their
 * best star rating and the current frontier node pulses.
 */
export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelectScene');
  }

  create(): void {
    this.drawBackground();
    this.drawHeader();
    this.drawPath();
    this.createTopNav();
  }

  private nodePosition(levelIndex: number): { x: number; y: number } {
    return { x: NODE_XS[levelIndex] ?? 400, y: NODE_Y_BOTTOM - levelIndex * NODE_Y_STEP };
  }

  private drawBackground(): void {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.fillGradientStyle(0x10131d, 0x10131d, 0x151827, 0x151827, 1);
    g.fillRect(0, 0, width, height);

    // Chapter bands, bottom (ch1) to top (ch3), tinted by their battle theme.
    CHAPTERS.forEach((chapter, chapterIndex) => {
      const theme = themeForChapter(chapterIndex);
      const firstLevel = chapter.levelIndices[0];
      const lastLevel = chapter.levelIndices[chapter.levelIndices.length - 1];
      const bottom = this.nodePosition(firstLevel).y + 44;
      const top = this.nodePosition(lastLevel).y - 44;

      const band = this.add.graphics();
      band.fillGradientStyle(theme.top, theme.top, 0x10131d, 0x10131d, 0.5, 0.5, 0.15, 0.15);
      band.fillRect(0, top, width, bottom - top);

      // Put the title on the side away from the band's top node so it never
      // overlaps that node's pulsing halo.
      const topNodeX = this.nodePosition(lastLevel).x;
      const titleOnLeft = topNodeX > 400;
      this.add
        .text(titleOnLeft ? 24 : width - 24, top + 10, chapter.title, {
          fontSize: '15px',
          color: `#${lighten(theme.ambient, 0.25).toString(16).padStart(6, '0')}`,
          fontStyle: 'bold',
        })
        .setOrigin(titleOnLeft ? 0 : 1, 0)
        .setAlpha(0.9);

      // Ambient motes per band.
      for (let i = 0; i < 5; i++) {
        const x = Math.random() * width;
        const y = top + Math.random() * (bottom - top);
        const mote = this.add.circle(x, y, 1.5 + Math.random() * 2, lighten(theme.ambient, 0.3), 0.18);
        this.tweens.add({
          targets: mote,
          y: y - 50 - Math.random() * 50,
          alpha: 0,
          duration: 5000 + Math.random() * 5000,
          delay: Math.random() * 4000,
          repeat: -1,
          onRepeat: () => {
            mote.y = bottom;
            mote.x = Math.random() * width;
            mote.alpha = 0.18;
          },
        });
      }
    });
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
      .text(this.scale.width / 2, 78, 'Follow the path — defeat the Ancient Dragon', {
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

  private drawPath(): void {
    const data = loadPlayerData();

    // Path segments under the nodes: dim by default, bright once walked.
    const lines = this.add.graphics();
    for (let i = 0; i < LEVELS.length - 1; i++) {
      const from = this.nodePosition(i);
      const to = this.nodePosition(i + 1);
      const walked = (data.levelStars[i] ?? 0) > 0;
      lines.lineStyle(walked ? 5 : 3, walked ? 0xffe066 : 0x394162, walked ? 0.9 : 0.8);
      lines.lineBetween(from.x, from.y, to.x, to.y);
    }

    LEVELS.forEach((level, levelIndex) => {
      const { x, y } = this.nodePosition(levelIndex);
      const chapterIndex = Math.floor(levelIndex / 3);
      const theme = themeForChapter(chapterIndex);
      const unlocked = isLevelUnlocked(data, levelIndex);
      const stars = data.levelStars[levelIndex] ?? 0;
      const isFrontier = unlocked && stars === 0;
      const isBossLevel = level.enemies.some((e) => e.boss);

      const nodeRadius = isBossLevel ? 34 : 28;

      if (isFrontier) {
        // Pulsing halo marking "you are here".
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

      // Level number badge.
      const badge = this.add.circle(x - nodeRadius + 4, y - nodeRadius + 4, 11, theme.ambient, 1);
      const badgeText = this.add
        .text(badge.x, badge.y, `${levelIndex + 1}`, {
          fontSize: '12px',
          color: '#0e1018',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      // Tiny rule badges (turn limit / restricted gem colors / move-time
      // override), stacked in the node's opposite top corner from the
      // level-number badge.
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

      // Name + stars sit beside the node (below would collide with the next node).
      const side = x > 400 ? -1 : 1;
      const labelX = x + side * (nodeRadius + 12);
      const originX = side > 0 ? 0 : 1;

      const starsLabel = this.add
        .text(labelX, y - 9, stars > 0 ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '', {
          fontSize: '13px',
          color: '#ffe066',
        })
        .setOrigin(originX, 0.5);

      const nameLabel = this.add
        .text(labelX, y + (stars > 0 ? 9 : 0), LEVEL_NAMES[levelIndex] ?? '', {
          fontSize: '12px',
          color: unlocked ? '#9aa3c7' : '#4a5068',
        })
        .setOrigin(originX, 0.5);

      if (!unlocked) {
        [circle, icon, badge, badgeText, starsLabel, nameLabel, ruleBadge].forEach((obj) => obj?.setAlpha(0.5));
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
        this.scene.start('GameScene', { levelIndex });
      });
    });
  }

  private createTopNav(): void {
    const labels: { text: string; scene: string }[] = [
      { text: 'Roguelike Tower', scene: 'RunMapScene' },
      { text: 'Gacha', scene: 'GachaScene' },
      { text: 'Collection / Team', scene: 'CollectionScene' },
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
