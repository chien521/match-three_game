import Phaser from 'phaser';
import { BRANCHES, CHAPTERS } from '../game/levels';
import { isLevelUnlocked, loadPlayerData } from '../game/playerData';
import { t, tr } from '../game/i18n';
import { drawThemedBackground } from './battleFx';
import { drawLanguageToggle } from './langToggle';

/**
 * Chapter picker: the game's entry scene. Each chapter is its own
 * prologue→branches→final map (see LevelSelectScene), too large to all fit
 * on one 800x800 screen, so the campaign is split into one card per chapter
 * here. A chapter unlocks once its first level is reachable — reuses the
 * normal per-level unlockRequires chain (a chapter's prologue-1 requires the
 * previous chapter's final-boss level), so no separate chapter-unlock state
 * is stored anywhere.
 */
export class ChapterSelectScene extends Phaser.Scene {
  constructor() {
    super('ChapterSelectScene');
  }

  create(): void {
    drawThemedBackground(this, { top: 0x10131d, bottom: 0x151827, ambient: 0x7dd3fc });

    this.add
      .text(this.scale.width / 2, 48, '轉珠 Match-3', {
        fontSize: '36px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(this.scale.width / 2, 84, t('chapterSelectSubtitle'), {
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

    const cardWidth = 560;
    const cardHeight = 110;
    const gap = 24;
    const startY = 170;

    CHAPTERS.forEach((chapter, index) => {
      const y = startY + index * (cardHeight + gap);
      const x = this.scale.width / 2;
      const firstBranch = BRANCHES.find((b) => b.id === chapter.branchIds[0]);
      const firstLevelId = firstBranch?.levelIds[0];
      const unlocked = firstLevelId !== undefined && isLevelUnlocked(data, firstLevelId);

      const card = this.add
        .rectangle(x, y, cardWidth, cardHeight, unlocked ? 0x2a2f45 : 0x1a1d29)
        .setStrokeStyle(2, unlocked ? 0x5a6cad : 0x2a2f45);

      this.add
        .text(x, y - 18, unlocked ? tr(chapter.title) : `🔒 ${t('chapterLocked', { n: index + 1 })}`, {
          fontSize: '20px',
          color: unlocked ? '#ffe066' : '#4a5068',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      this.add
        .text(x, y + 18, unlocked ? t('chapterEnter') : t('chapterLockedHint'), {
          fontSize: '13px',
          color: unlocked ? '#9aa3c7' : '#4a5068',
        })
        .setOrigin(0.5);

      if (!unlocked) return;

      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setFillStyle(0x394162));
      card.on('pointerout', () => card.setFillStyle(0x2a2f45));
      card.on('pointerdown', () => {
        this.scene.start('LevelSelectScene', { chapterId: chapter.id });
      });
    });

    this.drawGachaButton();
    drawLanguageToggle(this, 20, 18, () => this.scene.restart());
  }

  private drawGachaButton(): void {
    const x = this.scale.width / 2;
    const y = this.scale.height - 36;
    const button = this.add
      .rectangle(x, y, 170, 44, 0x2a2f45)
      .setStrokeStyle(2, 0x394162)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y, t('navGacha'), { fontSize: '16px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    button.on('pointerover', () => button.setFillStyle(0x394162));
    button.on('pointerout', () => button.setFillStyle(0x2a2f45));
    button.on('pointerdown', () => this.scene.start('GachaScene'));
  }
}
