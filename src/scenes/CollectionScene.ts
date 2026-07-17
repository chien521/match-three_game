import Phaser from 'phaser';
import {
  MAX_TEAM_SIZE,
  getOwnedCharacters,
  loadPlayerData,
  savePlayerData,
  setActiveTeam,
} from '../game/playerData';
import type { Character } from '../game/team';
import { elementName } from '../game/team';
import { HEART_TYPE } from '../game/constants';
import { t, tr } from '../game/i18n';
import { drawThemedBackground } from './battleFx';
import { drawAvatar } from './avatarUi';
import { drawLanguageToggle } from './langToggle';

const RARITY_COLORS: Record<string, number> = {
  Common: 0x9aa3c7,
  Rare: 0x7dd3fc,
  SSR: 0xffe066,
};

const GRID_COLS = 4;
const CARD_WIDTH = 178;
const CARD_HEIGHT = 158;
const GRID_TOP = 220;

// NOTE: the grid holds ~12 cards on one screen. If the character pool grows
// past that, this scene needs paging/scrolling.

/**
 * Character codex + team formation: a card grid of every owned character
 * with a five-slot team bar on top. Tap a card to open its detail popup
 * (stats, active skill, leader skill) with an add/remove-team button inside;
 * tap a filled team slot directly to remove that member. Removing a member
 * (from either place) leaves that slot empty rather than shifting later
 * members forward — adding a new member fills the first empty slot.
 */
export class CollectionScene extends Phaser.Scene {
  private activeTeamIds: string[] = [];
  private hintText!: Phaser.GameObjects.Text;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private overlay: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('CollectionScene');
  }

  create(): void {
    const data = loadPlayerData();
    this.activeTeamIds = [...data.activeTeamIds];
    while (this.activeTeamIds.length < MAX_TEAM_SIZE) this.activeTeamIds.push('');

    drawThemedBackground(this, { top: 0x0e1e2b, bottom: 0x10131d, ambient: 0x7dd3fc });

    this.add
      .text(this.scale.width / 2, 42, t('collectionTitle'), {
        fontSize: '34px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    this.hintText = this.add
      .text(this.scale.width / 2, 78, '', { fontSize: '14px', color: '#9aa3c7' })
      .setOrigin(0.5);

    drawLanguageToggle(this, 20, 18, () => {
      // Persist any in-progress team edits before the restart redraws.
      savePlayerData(setActiveTeam(loadPlayerData(), this.activeTeamIds));
      this.scene.restart();
    });

    const backButton = this.add
      .text(this.scale.width / 2, this.scale.height - 36, t('backToMenu'), {
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#2a2f45',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    backButton.on('pointerdown', () => {
      savePlayerData(setActiveTeam(loadPlayerData(), this.activeTeamIds));
      this.scene.start('ChapterSelectScene');
    });

    this.redraw();
  }

  /** Rebuilds the team bar + card grid to reflect the current selection. */
  private redraw(): void {
    for (const obj of this.dynamic) obj.destroy();
    this.dynamic = [];

    this.hintText
      .setColor('#9aa3c7')
      .setText(
        t('collectionHint', { n: this.activeTeamIds.filter((id) => id).length, m: MAX_TEAM_SIZE }),
      );

    const owned = getOwnedCharacters(loadPlayerData());
    const byId = new Map(owned.map((entry) => [entry.character.id, entry]));

    this.drawTeamBar(byId);
    this.drawGrid(owned);
  }

  private drawTeamBar(byId: Map<string, { character: Character; copies: number }>): void {
    const slotGap = 78;
    const startX = this.scale.width / 2 - ((MAX_TEAM_SIZE - 1) * slotGap) / 2;
    const y = 138;

    for (let i = 0; i < MAX_TEAM_SIZE; i++) {
      const x = startX + i * slotGap;
      const memberId = this.activeTeamIds[i];
      const entry = memberId ? byId.get(memberId) : undefined;

      if (!entry) {
        const empty = this.add.circle(x, y, 26, 0x1a1d29, 0.7).setStrokeStyle(2, 0x394162, 0.9);
        const plus = this.add
          .text(x, y, '·', { fontSize: '22px', color: '#394162' })
          .setOrigin(0.5);
        this.dynamic.push(empty, plus);
        continue;
      }

      const avatar = drawAvatar(this, x, y, entry.character, 26);
      const slotBadge = this.add
        .text(x - 26, y - 26, `${i + 1}`, {
          fontSize: '12px',
          color: '#0e1018',
          fontStyle: 'bold',
          backgroundColor: '#ffe066',
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5);
      const hitZone = this.add
        .circle(x, y, 28, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hitZone.on('pointerdown', () => this.removeSlot(i));
      this.dynamic.push(avatar, slotBadge, hitZone);
    }
  }

  private drawGrid(owned: { character: Character; copies: number }[]): void {
    const gridWidth = GRID_COLS * CARD_WIDTH + (GRID_COLS - 1) * 12;
    const startX = this.scale.width / 2 - gridWidth / 2 + CARD_WIDTH / 2;

    owned.forEach(({ character, copies }, index) => {
      const col = index % GRID_COLS;
      const row = Math.floor(index / GRID_COLS);
      const x = startX + col * (CARD_WIDTH + 12);
      const y = GRID_TOP + row * (CARD_HEIGHT + 14) + CARD_HEIGHT / 2;

      const teamIndex = this.activeTeamIds.indexOf(character.id);
      const inTeam = teamIndex >= 0;
      const frameColor = RARITY_COLORS[character.rarity] ?? 0xffffff;

      const g = this.add.graphics();
      if (inTeam) {
        g.lineStyle(7, 0xffe066, 0.28);
        g.strokeRoundedRect(x - CARD_WIDTH / 2 - 3, y - CARD_HEIGHT / 2 - 3, CARD_WIDTH + 6, CARD_HEIGHT + 6, 12);
      }
      g.fillStyle(inTeam ? 0x232b45 : 0x1b1f2e, 0.97);
      g.fillRoundedRect(x - CARD_WIDTH / 2, y - CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 10);
      g.lineStyle(2, inTeam ? 0xffe066 : frameColor, inTeam ? 1 : 0.75);
      g.strokeRoundedRect(x - CARD_WIDTH / 2, y - CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 10);
      this.dynamic.push(g);

      const avatar = drawAvatar(this, x, y - CARD_HEIGHT / 2 + 36, character, 22);
      this.dynamic.push(avatar);

      const name = this.add
        .text(x, y - CARD_HEIGHT / 2 + 64, tr(character.name), {
          fontSize: '13px',
          color: `#${frameColor.toString(16).padStart(6, '0')}`,
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: CARD_WIDTH - 12 },
        })
        .setOrigin(0.5, 0);
      this.dynamic.push(name);

      const info = this.add
        .text(
          x,
          y + CARD_HEIGHT / 2 - 44,
          `${tr(elementName(character.element))} · ${t('lvLabel', { n: copies })}\n${t('cardStats', { a: character.attack, h: character.maxHp })}`,
          { fontSize: '11px', color: '#9aa3c7', align: 'center', lineSpacing: 3 },
        )
        .setOrigin(0.5, 0);
      this.dynamic.push(info);

      if (inTeam) {
        const badge = this.add
          .text(x - CARD_WIDTH / 2 + 6, y - CARD_HEIGHT / 2 + 6, `#${teamIndex + 1}`, {
            fontSize: '12px',
            color: '#0e1018',
            fontStyle: 'bold',
            backgroundColor: '#ffe066',
            padding: { x: 5, y: 2 },
          })
          .setOrigin(0, 0);
        this.dynamic.push(badge);
      }

      const hit = this.add
        .rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => g.setAlpha(0.85));
      hit.on('pointerout', () => g.setAlpha(1));
      hit.on('pointerdown', () => this.openDetail(character, copies));
      this.dynamic.push(hit);
    });

    // Rarity color hint under the grid.
    const legendY = GRID_TOP + Math.ceil(owned.length / GRID_COLS) * (CARD_HEIGHT + 14) + 8;
    const legend = this.add
      .text(this.scale.width / 2, Math.min(legendY, this.scale.height - 70), '', {
        fontSize: '12px',
        color: '#5a6280',
      })
      .setOrigin(0.5, 0);
    legend.setText(t('collectionLegend'));
    this.dynamic.push(legend);
  }

  /** Clears one team slot in place — later slots do not shift forward. */
  private removeSlot(index: number): void {
    this.activeTeamIds[index] = '';
    savePlayerData(setActiveTeam(loadPlayerData(), this.activeTeamIds));
    this.closeDetail();
    this.redraw();
  }

  /** Places a character into the first empty slot, if any; leaves slots untouched otherwise. */
  private addToFirstEmptySlot(id: string): boolean {
    const index = this.activeTeamIds.findIndex((activeId) => !activeId);
    if (index === -1) return false;
    this.activeTeamIds[index] = id;
    savePlayerData(setActiveTeam(loadPlayerData(), this.activeTeamIds));
    return true;
  }

  /** Turns a character's active-skill data into a readable sentence. */
  private describeSkill(character: Character): string {
    switch (character.skillEffect) {
      case 'damage':
        return t('skillDescDamage', { power: character.skillPower });
      case 'heal':
        return t('skillDescHeal', { power: character.skillPower });
      case 'convert': {
        const label = (element: number) =>
          element === HEART_TYPE ? t('elementHeart') : tr(elementName(element));
        return t('skillDescConvert', {
          from: label(character.skillConvertFrom),
          to: label(character.skillConvertTo),
        });
      }
      case 'extendTime':
        return t('skillDescExtendTime', { sec: Math.round((character.skillPower / 1000) * 10) / 10 });
      case 'shieldSelf':
        return t('skillDescShieldSelf', {
          pct: Math.round(character.skillShieldReduction * 100),
          turns: character.skillShieldTurns,
        });
      case 'teamBuff':
        return t('skillDescTeamBuff', {
          mult: character.skillBuffMultiplier,
          turns: character.skillBuffTurns,
        });
      case 'stunEnemy':
        return t('skillDescStunEnemy', { turns: character.skillStunTurns });
      case 'cleanse':
        return t('skillDescCleanse');
    }
  }

  /** Destroys any open detail popup. */
  private closeDetail(): void {
    for (const obj of this.overlay) obj.destroy();
    this.overlay = [];
  }

  /** Opens a popup showing a card's full stats, active skill, and leader skill, with an add/remove-team button. */
  private openDetail(character: Character, copies: number): void {
    this.closeDetail();

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const panelWidth = 560;
    const panelHeight = 460;
    const frameColor = RARITY_COLORS[character.rarity] ?? 0xffffff;

    const backdrop = this.add
      .rectangle(cx, cy, this.scale.width, this.scale.height, 0x05060a, 0.72)
      .setInteractive({ useHandCursor: false });
    backdrop.on('pointerdown', () => this.closeDetail());
    this.overlay.push(backdrop);

    const panelTop = cy - panelHeight / 2;
    const panel = this.add.graphics();
    panel.fillStyle(0x1b1f2e, 0.98);
    panel.fillRoundedRect(cx - panelWidth / 2, panelTop, panelWidth, panelHeight, 14);
    panel.lineStyle(2, frameColor, 1);
    panel.strokeRoundedRect(cx - panelWidth / 2, panelTop, panelWidth, panelHeight, 14);
    this.overlay.push(panel);
    // Swallow clicks on the panel itself so they don't fall through to the backdrop and close it.
    const panelHit = this.add
      .rectangle(cx, panelTop + panelHeight / 2, panelWidth, panelHeight, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: false });
    this.overlay.push(panelHit);

    const avatar = drawAvatar(this, cx, panelTop + 56, character, 40);
    this.overlay.push(avatar);

    const name = this.add
      .text(cx, panelTop + 104, tr(character.name), {
        fontSize: '20px',
        color: `#${frameColor.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);
    this.overlay.push(name);

    const statsLine = this.add
      .text(
        cx,
        panelTop + 132,
        `${tr(character.rarity)} · ${tr(elementName(character.element))} · ${t('lvLabel', { n: copies })}\n${t('statLine', { a: character.attack, h: character.maxHp })}`,
        { fontSize: '13px', color: '#9aa3c7', align: 'center', lineSpacing: 4 },
      )
      .setOrigin(0.5, 0);
    this.overlay.push(statsLine);

    const skillHeader = this.add
      .text(cx - panelWidth / 2 + 24, panelTop + 190, t('activeSkillLabel'), {
        fontSize: '13px',
        color: '#ffe066',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);
    this.overlay.push(skillHeader);

    const skillBody = this.add
      .text(
        cx - panelWidth / 2 + 24,
        panelTop + 212,
        `${tr(character.skillName)} (${t('skillCooldownLabel', { n: character.skillCooldownTurns })})\n${this.describeSkill(character)}`,
        { fontSize: '13px', color: '#e6e8f0', wordWrap: { width: panelWidth - 48 }, lineSpacing: 4 },
      )
      .setOrigin(0, 0);
    this.overlay.push(skillBody);

    const leaderHeader = this.add
      .text(cx - panelWidth / 2 + 24, panelTop + 280, t('leaderSkillLabel'), {
        fontSize: '13px',
        color: '#ffe066',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);
    this.overlay.push(leaderHeader);

    const leaderBody = this.add
      .text(
        cx - panelWidth / 2 + 24,
        panelTop + 302,
        character.leaderSkill
          ? `${tr(character.leaderSkill.name)}\n${tr(character.leaderSkill.description)}`
          : '—',
        { fontSize: '13px', color: '#e6e8f0', wordWrap: { width: panelWidth - 48 }, lineSpacing: 4 },
      )
      .setOrigin(0, 0);
    this.overlay.push(leaderBody);

    const inTeam = this.activeTeamIds.includes(character.id);
    const hasEmptySlot = this.activeTeamIds.some((activeId) => !activeId);
    const actionY = panelTop + panelHeight - 56;

    if (inTeam) {
      const teamIndex = this.activeTeamIds.indexOf(character.id);
      const removeBtn = this.add
        .text(cx, actionY, t('removeFromTeam'), {
          fontSize: '15px',
          color: '#ffffff',
          backgroundColor: '#7a2f3d',
          padding: { x: 18, y: 9 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      removeBtn.on('pointerdown', () => this.removeSlot(teamIndex));
      this.overlay.push(removeBtn);
    } else if (hasEmptySlot) {
      const addBtn = this.add
        .text(cx, actionY, t('addToTeam'), {
          fontSize: '15px',
          color: '#0e1018',
          backgroundColor: '#ffe066',
          padding: { x: 18, y: 9 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      addBtn.on('pointerdown', () => {
        this.addToFirstEmptySlot(character.id);
        this.closeDetail();
        this.redraw();
      });
      this.overlay.push(addBtn);
    } else {
      const fullHint = this.add
        .text(cx, actionY, t('teamFull', { m: MAX_TEAM_SIZE }), {
          fontSize: '13px',
          color: '#ff6161',
          align: 'center',
          wordWrap: { width: panelWidth - 48 },
        })
        .setOrigin(0.5);
      this.overlay.push(fullHint);
    }

    const closeBtn = this.add
      .text(cx + panelWidth / 2 - 16, panelTop + 16, '✕', {
        fontSize: '16px',
        color: '#9aa3c7',
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeDetail());
    this.overlay.push(closeBtn);
  }
}
