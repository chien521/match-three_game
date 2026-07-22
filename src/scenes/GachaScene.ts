import Phaser from 'phaser';
import { PULL_COST, rollGachaMulti } from '../game/gacha';
import { addCharacter, loadPlayerData, savePlayerData } from '../game/playerData';
import type { Character } from '../game/team';
import { elementName } from '../game/team';
import { t, tr } from '../game/i18n';
import { drawThemedBackground } from './battleFx';
import { drawAvatar } from './avatarUi';
import { drawLanguageToggle } from './langToggle';
import { drawRulesLegendButton } from './rulesLegend';

const RARITY_COLORS: Record<string, number> = {
  Common: 0x9aa3c7,
  Rare: 0x7dd3fc,
  SSR: 0xffe066,
};

/** One pull's outcome, resolved against the collection at pull time. */
interface PullResult {
  character: Character;
  isNew: boolean;
  copiesAfter: number;
}

/**
 * Gacha screen with a card-reveal ceremony: pulls spawn face-down cards that
 * flip over one by one, with a rarity-scaled build-up (SSR gets golden glow,
 * flash and screen shake).
 */
export class GachaScene extends Phaser.Scene {
  private currencyText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private revealArea: Phaser.GameObjects.Container[] = [];
  private revealing = false;

  constructor() {
    super('GachaScene');
  }

  create(): void {
    this.revealArea = [];
    this.revealing = false;

    drawThemedBackground(this, { top: 0x241c08, bottom: 0x10131d, ambient: 0xffe066 });

    this.add
      .text(this.scale.width / 2, 42, t('gachaTitle'), {
        fontSize: '34px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    this.add
      .text(this.scale.width / 2, 78, t('gachaOdds'), {
        fontSize: '13px',
        color: '#9aa3c7',
      })
      .setOrigin(0.5);

    this.currencyText = this.add
      .text(this.scale.width - 20, 24, '', { fontSize: '20px', color: '#ffe066', fontStyle: 'bold' })
      .setOrigin(1, 0);

    this.createPullButton(292, t('pull1', { n: PULL_COST }), () => this.pull(1));
    this.createPullButton(508, t('pull5', { n: PULL_COST * 5 }), () => this.pull(5));

    this.hintText = this.add
      .text(this.scale.width / 2, 700, '', { fontSize: '15px', color: '#ff6161', fontStyle: 'bold' })
      .setOrigin(0.5);

    const backButton = this.add
      .text(this.scale.width / 2, this.scale.height - 36, t('backToMenu'), {
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#2a2f45',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    backButton.on('pointerdown', () => this.scene.start('ChapterSelectScene'));

    // Restart is safe mid-reveal: pull results are written to playerData the
    // moment the button is pressed, before any card animation plays.
    drawLanguageToggle(this, 20, 18, () => this.scene.restart());
    drawRulesLegendButton(this, this.scale.width - 20, 54);

    this.refreshCurrency();
  }

  private createPullButton(x: number, label: string, onClick: () => void): void {
    const button = this.add
      .rectangle(x, 646, 200, 54, 0x33406b)
      .setStrokeStyle(2, 0x5a6cad)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, 646, label, { fontSize: '18px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    button.on('pointerover', () => button.setFillStyle(0x435180));
    button.on('pointerout', () => button.setFillStyle(0x33406b));
    button.on('pointerdown', onClick);
  }

  private refreshCurrency(): void {
    this.currencyText.setText(`💎 ${loadPlayerData().currency}`);
  }

  // ---------------------------------------------------------------------
  // Pull flow
  // ---------------------------------------------------------------------

  private pull(count: number): void {
    if (this.revealing) return;
    const cost = PULL_COST * count;

    let data = loadPlayerData();
    if (data.currency < cost) {
      this.hintText.setText(t('notEnough', { n: cost }));
      return;
    }
    this.hintText.setText('');

    data = { ...data, currency: data.currency - cost };
    const characters = rollGachaMulti(count);
    const results: PullResult[] = characters.map((character) => {
      const ownedBefore = data.owned.find((o) => o.id === character.id);
      data = addCharacter(data, character.id);
      const ownedAfter = data.owned.find((o) => o.id === character.id);
      return {
        character,
        isNew: !ownedBefore,
        copiesAfter: ownedAfter?.copies ?? 1,
      };
    });
    savePlayerData(data);
    this.refreshCurrency();

    void this.revealCards(results);
  }

  private async revealCards(results: PullResult[]): Promise<void> {
    this.revealing = true;
    for (const container of this.revealArea) container.destroy();
    this.revealArea = [];

    const single = results.length === 1;
    const cardWidth = single ? 210 : 138;
    const cardHeight = single ? 300 : 198;
    const gap = 10;
    const totalWidth = results.length * cardWidth + (results.length - 1) * gap;
    const y = 380;

    const reveals = results.map((result, index) => {
      const x = this.scale.width / 2 - totalWidth / 2 + cardWidth / 2 + index * (cardWidth + gap);
      return this.revealOneCard(result, x, y, cardWidth, cardHeight, index * 300);
    });
    await Promise.all(reveals);
    this.revealing = false;
  }

  /** Face-down card drops in, builds up by rarity, then flips to the face. */
  private revealOneCard(
    result: PullResult,
    x: number,
    y: number,
    width: number,
    height: number,
    delayMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const back = this.buildCardBack(x, y, width, height);
      this.revealArea.push(back);
      back.setAlpha(0);
      back.y = y - 40;

      this.tweens.add({
        targets: back,
        alpha: 1,
        y,
        duration: 240,
        delay: delayMs,
        ease: 'Back.easeOut',
        onComplete: () => {
          void this.playRarityBuildup(result.character.rarity, x, y, width, height).then(() => {
            // Flip: back collapses, face expands.
            this.tweens.add({
              targets: back,
              scaleX: 0,
              duration: 130,
              ease: 'Quad.easeIn',
              onComplete: () => {
                back.destroy();
                const face = this.buildCardFace(result, x, y, width, height);
                this.revealArea.push(face);
                face.setScale(0, 1);
                this.tweens.add({
                  targets: face,
                  scaleX: 1,
                  duration: 150,
                  ease: 'Quad.easeOut',
                  onComplete: () => resolve(),
                });
              },
            });
          });
        },
      });
    });
  }

  /** Rare: blue pulse. SSR: golden glow, white flash, screen shake. Common: nothing. */
  private playRarityBuildup(
    rarity: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<void> {
    if (rarity === 'Common') return Promise.resolve();

    return new Promise((resolve) => {
      const color = RARITY_COLORS[rarity] ?? 0xffffff;
      const glow = this.add
        .rectangle(x, y, width + 18, height + 18, color, 0.35)
        .setBlendMode(Phaser.BlendModes.ADD);

      const pulses = rarity === 'SSR' ? 3 : 1;
      this.tweens.add({
        targets: glow,
        alpha: 0.05,
        scaleX: 1.12,
        scaleY: 1.12,
        duration: 180,
        yoyo: true,
        repeat: pulses - 1,
        onComplete: () => {
          if (rarity === 'SSR') {
            this.cameras.main.shake(160, 0.005);
            const flash = this.add.rectangle(
              this.scale.width / 2,
              this.scale.height / 2,
              this.scale.width,
              this.scale.height,
              0xffffff,
              0.7,
            );
            this.tweens.add({
              targets: flash,
              alpha: 0,
              duration: 260,
              onComplete: () => flash.destroy(),
            });
          }
          glow.destroy();
          resolve();
        },
      });
    });
  }

  private buildCardBack(x: number, y: number, width: number, height: number): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(0x1b2038, 1);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, 12);
    g.lineStyle(3, 0x5a6cad, 1);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, 12);
    g.lineStyle(1.5, 0x394162, 1);
    g.strokeRoundedRect(-width / 2 + 8, -height / 2 + 8, width - 16, height - 16, 8);

    const sigil = this.add
      .text(0, 0, '💠', { fontSize: `${Math.round(width * 0.3)}px` })
      .setOrigin(0.5);

    return this.add.container(x, y, [g, sigil]);
  }

  private buildCardFace(
    result: PullResult,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.Container {
    const { character } = result;
    const frameColor = RARITY_COLORS[character.rarity] ?? 0xffffff;
    const compact = width < 180;

    const g = this.add.graphics();
    if (character.rarity === 'SSR') {
      g.lineStyle(8, frameColor, 0.25);
      g.strokeRoundedRect(-width / 2 - 4, -height / 2 - 4, width + 8, height + 8, 14);
    }
    g.fillStyle(0x1b1f2e, 1);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, 12);
    g.lineStyle(3, frameColor, 1);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, 12);

    const children: Phaser.GameObjects.GameObject[] = [g];
    const colorStr = `#${frameColor.toString(16).padStart(6, '0')}`;

    // drawAvatar adds to the scene root; passing it into the card container
    // below re-parents it (Container.add removes it from the display list).
    const avatar = drawAvatar(this, 0, -height / 2 + (compact ? 44 : 64), character, compact ? 24 : 36);
    children.push(avatar);

    const name = this.add
      .text(0, -height / 2 + (compact ? 82 : 118), tr(character.name), {
        fontSize: compact ? '13px' : '17px',
        color: colorStr,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: width - 14 },
      })
      .setOrigin(0.5, 0);
    children.push(name);

    const rarityLabel = this.add
      .text(0, -height / 2 + (compact ? 116 : 158), tr(character.rarity), {
        fontSize: compact ? '12px' : '15px',
        color: colorStr,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);
    children.push(rarityLabel);

    const stats = this.add
      .text(
        0,
        -height / 2 + (compact ? 136 : 186),
        `${tr(elementName(character.element))}\n${t('statLine', { a: character.attack, h: character.maxHp })}\n${tr(character.skillName)}`,
        {
          fontSize: compact ? '10px' : '13px',
          color: '#9aa3c7',
          align: 'center',
          lineSpacing: 3,
        },
      )
      .setOrigin(0.5, 0);
    children.push(stats);

    // NEW! / Lv UP ribbon.
    const ribbonText = result.isNew ? t('newRibbon') : t('lvUpRibbon', { n: result.copiesAfter });
    const ribbon = this.add
      .text(width / 2 - 6, -height / 2 + 6, ribbonText, {
        fontSize: compact ? '10px' : '13px',
        color: result.isNew ? '#0e1018' : '#ffffff',
        fontStyle: 'bold',
        backgroundColor: result.isNew ? '#ffe066' : '#33406b',
        padding: { x: 6, y: 2 },
      })
      .setOrigin(1, 0)
      .setAngle(0);
    children.push(ribbon);

    return this.add.container(x, y, children);
  }
}
