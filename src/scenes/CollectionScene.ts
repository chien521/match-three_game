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
import { drawThemedBackground } from './battleFx';
import { drawAvatar } from './avatarUi';

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
 * with a five-slot team bar on top. Tap a card to toggle it in/out of the
 * active team; tap a filled team slot to remove that member.
 */
export class CollectionScene extends Phaser.Scene {
  private activeTeamIds: string[] = [];
  private hintText!: Phaser.GameObjects.Text;
  private dynamic: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('CollectionScene');
  }

  create(): void {
    const data = loadPlayerData();
    this.activeTeamIds = [...data.activeTeamIds];

    drawThemedBackground(this, { top: 0x0e1e2b, bottom: 0x10131d, ambient: 0x7dd3fc });

    this.add
      .text(this.scale.width / 2, 42, 'Collection & Team', {
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

    const backButton = this.add
      .text(this.scale.width / 2, this.scale.height - 36, 'Back to Menu', {
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#2a2f45',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    backButton.on('pointerdown', () => {
      savePlayerData(setActiveTeam(loadPlayerData(), this.activeTeamIds));
      this.scene.start('LevelSelectScene');
    });

    this.redraw();
  }

  /** Rebuilds the team bar + card grid to reflect the current selection. */
  private redraw(): void {
    for (const obj of this.dynamic) obj.destroy();
    this.dynamic = [];

    this.hintText
      .setColor('#9aa3c7')
      .setText(`Tap a card to add/remove — team ${this.activeTeamIds.length}/${MAX_TEAM_SIZE}. Leader = slot 1.`);

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
      hitZone.on('pointerdown', () => this.toggleTeamMember(entry.character.id));
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
        .text(x, y - CARD_HEIGHT / 2 + 64, character.name, {
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
          `${elementName(character.element)} · Lv.${copies}\nATK ${character.attack}   HP ${character.maxHp}`,
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
      hit.on('pointerdown', () => this.toggleTeamMember(character.id));
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
    legend.setText('Card frame = rarity  ·  gold glow = in team');
    this.dynamic.push(legend);
  }

  private toggleTeamMember(id: string): void {
    if (this.activeTeamIds.includes(id)) {
      this.activeTeamIds = this.activeTeamIds.filter((activeId) => activeId !== id);
    } else if (this.activeTeamIds.length < MAX_TEAM_SIZE) {
      this.activeTeamIds = [...this.activeTeamIds, id];
    } else {
      this.hintText
        .setColor('#ff6161')
        .setText(`Team is full (max ${MAX_TEAM_SIZE}) — tap a member to remove first.`);
      return;
    }
    savePlayerData(setActiveTeam(loadPlayerData(), this.activeTeamIds));
    this.redraw();
  }
}
