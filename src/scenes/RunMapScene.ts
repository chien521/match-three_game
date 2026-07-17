import Phaser from 'phaser';
import type { RunNode, RunState } from '../game/run';
import {
  FLOOR_COUNT,
  addRelic,
  applyRest,
  availableNodes,
  createRun,
  getActiveRun,
  moveToNode,
  persistRun,
  recruit,
  recruitChoices,
  relicChoices,
  runTeamMaxHp,
  setActiveRun,
  trainRandomMember,
} from '../game/run';
import { elementAbbr } from '../game/team';
import { characterEmoji } from '../game/characterArt';
import { getLang, t, tr } from '../game/i18n';
import { drawThemedBackground, themeForChapter } from './battleFx';
import { drawAvatar } from './avatarUi';
import { drawLanguageToggle } from './langToggle';

const NODE_RADIUS = 26;

const NODE_ICONS: Record<RunNode['type'], string> = {
  battle: '⚔️',
  elite: '💀',
  rest: '🏕️',
  treasure: '🎁',
  boss: '👑',
};

const NODE_COLORS: Record<RunNode['type'], number> = {
  battle: 0x2a3b5c,
  elite: 0x5c2a3b,
  rest: 0x2a5c3b,
  treasure: 0x5c4d2a,
  boss: 0x4d2a5c,
};

/**
 * Roguelike run map: a Slay-the-Spire style floor of connected nodes. The
 * player walks upward row by row, fighting/resting/looting, and fights the
 * floor boss at the top. Battle nodes hand off to GameScene in run mode.
 */
export class RunMapScene extends Phaser.Scene {
  private run!: RunState;

  constructor() {
    super('RunMapScene');
  }

  create(): void {
    let run = getActiveRun();
    if (!run) {
      run = createRun();
      setActiveRun(run);
    }
    this.run = run;

    drawThemedBackground(this, themeForChapter(this.run.floor));
    this.drawHeader();
    this.drawMap();
    this.drawFooter();
    drawLanguageToggle(this, 20, 18, () => this.scene.restart());

    if (this.run.pendingReward === 'relic') {
      this.showRelicChoice();
    } else if (this.run.pendingReward === 'recruit') {
      this.showRecruitChoice();
    }
  }

  // ---------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------

  private nodePosition(node: RunNode): { x: number; y: number } {
    const rowWidth = this.run.map.nodes.filter((n) => n.row === node.row).length;
    const x = (this.scale.width / (rowWidth + 1)) * (node.col + 1);
    const y = 660 - node.row * 115; // row 0 at the bottom, boss on top
    return { x, y };
  }

  private drawHeader(): void {
    this.add
      .text(this.scale.width / 2, 36, t('runHeader', { f: this.run.floor + 1, n: FLOOR_COUNT }), {
        fontSize: '26px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const maxHp = runTeamMaxHp(this.run);
    this.add
      .text(this.scale.width / 2, 72, t('runHp', { a: this.run.teamHp, b: maxHp }), {
        fontSize: '18px',
        color: this.run.teamHp / maxHp < 0.35 ? '#ff7b7b' : '#2ecc71',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Team as an avatar row (text names overflow at 5 members). English shows
    // the first word only so neighbors never collide; Chinese names are short
    // (and have no spaces to split on), so they render in full.
    const gap = 84;
    const startX = this.scale.width / 2 - ((this.run.team.length - 1) * gap) / 2;
    this.run.team.forEach((character, index) => {
      const x = startX + index * gap;
      drawAvatar(this, x, 108, character, 17);
      const shortName = getLang() === 'zh' ? tr(character.name) : character.name.split(' ')[0];
      this.add
        .text(x, 128, shortName, { fontSize: '10px', color: '#9aa3c7' })
        .setOrigin(0.5, 0);
    });

    const relicLabel =
      this.run.relics.length > 0
        ? t('relicsLine', { list: this.run.relics.map((r) => tr(r.name)).join(getLang() === 'zh' ? '、' : ', ') })
        : t('relicsNone');
    this.add
      .text(this.scale.width / 2, 146, relicLabel, {
        fontSize: '13px',
        color: '#ffe066',
        wordWrap: { width: this.scale.width - 60 },
        align: 'center',
      })
      .setOrigin(0.5, 0);
  }

  private drawMap(): void {
    const available = new Set(availableNodes(this.run).map((n) => n.id));
    const visited = new Set(this.run.visitedNodeIds);

    // Connection lines first so nodes render on top.
    const lines = this.add.graphics();
    for (const node of this.run.map.nodes) {
      const from = this.nodePosition(node);
      for (const nextId of node.next) {
        const next = this.run.map.nodes.find((n) => n.id === nextId);
        if (!next) continue;
        const to = this.nodePosition(next);
        const onPath = visited.has(node.id) && visited.has(next.id);
        lines.lineStyle(onPath ? 4 : 2, onPath ? 0xffe066 : 0x394162, 1);
        lines.lineBetween(from.x, from.y, to.x, to.y);
      }
    }

    for (const node of this.run.map.nodes) {
      const { x, y } = this.nodePosition(node);
      const isAvailable = available.has(node.id) && this.run.pendingReward === null;
      const isCurrent = node.id === this.run.currentNodeId;
      const isVisited = visited.has(node.id);

      const circle = this.add.circle(x, y, NODE_RADIUS, NODE_COLORS[node.type]);
      circle.setStrokeStyle(
        isCurrent || isAvailable ? 3 : 1,
        isCurrent ? 0xffe066 : isAvailable ? 0x7dd3fc : 0x394162,
      );
      if (!isAvailable && !isCurrent && !isVisited) circle.setAlpha(0.45);

      const icon = this.add.text(x, y, NODE_ICONS[node.type], { fontSize: '22px' }).setOrigin(0.5);
      if (!isAvailable && !isCurrent && !isVisited) icon.setAlpha(0.45);

      if (node.recruit && node.type === 'battle') {
        this.add
          .text(x, y + NODE_RADIUS + 4, t('allyTag'), { fontSize: '11px', color: '#7dd3fc' })
          .setOrigin(0.5, 0)
          .setAlpha(isAvailable || isCurrent || isVisited ? 1 : 0.45);
      }

      if (isAvailable) {
        circle.setInteractive({ useHandCursor: true });
        circle.on('pointerover', () => circle.setScale(1.12));
        circle.on('pointerout', () => circle.setScale(1));
        circle.on('pointerdown', () => this.enterNode(node));
      }
    }
  }

  private drawFooter(): void {
    const quit = this.add
      .text(this.scale.width / 2, this.scale.height - 26, t('abandonRun'), {
        fontSize: '14px',
        color: '#9aa3c7',
        backgroundColor: '#1b1f2e',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    let confirming = false;
    let revertEvent: Phaser.Time.TimerEvent | null = null;

    quit.on('pointerdown', () => {
      if (confirming) {
        revertEvent?.remove();
        setActiveRun(null);
        this.scene.start('LevelSelectScene');
        return;
      }
      confirming = true;
      quit.setText(t('abandonConfirm')).setColor('#ff5555');
      revertEvent = this.time.delayedCall(3000, () => {
        confirming = false;
        quit.setText(t('abandonRun')).setColor('#9aa3c7');
      });
    });
  }

  // ---------------------------------------------------------------------
  // Node actions
  // ---------------------------------------------------------------------

  private enterNode(node: RunNode): void {
    const moved = moveToNode(this.run, node.id);
    if (!moved) return;

    switch (node.type) {
      case 'battle':
      case 'elite':
      case 'boss':
        this.scene.start('GameScene', { mode: 'run' });
        break;
      case 'rest':
        this.showChoiceOverlay(
          t('makeCamp'),
          [
            {
              label: t('restOption'),
              description: t('restDesc'),
            },
            {
              label: t('trainOption'),
              description: t('trainDesc'),
            },
          ],
          (index) => {
            if (index === 0) {
              const gained = applyRest(this.run);
              return t('restedToast', { n: gained });
            }
            const result = trainRandomMember(this.run);
            return t('trainedToast', {
              name: tr(result.character.name),
              a: result.attackGain,
              h: result.hpGain,
            });
          },
          false, // no Skip — the node is already consumed
        );
        break;
      case 'treasure':
        this.run.pendingReward = 'relic';
        persistRun(this.run);
        this.scene.restart();
        break;
    }
  }

  private showToastAndRestart(message: string): void {
    this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.5)
      .setDepth(200);
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, message, {
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
        backgroundColor: '#000000aa',
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(201);
    this.time.delayedCall(900, () => this.scene.restart());
  }

  // ---------------------------------------------------------------------
  // Reward overlays
  // ---------------------------------------------------------------------

  private showChoiceOverlay(
    title: string,
    options: { label: string; description: string }[],
    onPick: (index: number) => string | void,
    skippable: boolean,
  ): void {
    const cx = this.scale.width / 2;
    this.add
      .rectangle(cx, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.78)
      .setDepth(300)
      .setInteractive(); // swallow clicks on the map below

    this.add
      .text(cx, 170, title, { fontSize: '26px', color: '#ffe066', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(301);

    options.forEach((option, index) => {
      const y = 260 + index * 110;
      const button = this.add
        .rectangle(cx, y, 520, 92, 0x2a2f45)
        .setStrokeStyle(2, 0x5a6cad)
        .setDepth(301)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(cx, y - 18, option.label, { fontSize: '19px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(302);
      this.add
        .text(cx, y + 14, option.description, {
          fontSize: '14px',
          color: '#9aa3c7',
          align: 'center',
          wordWrap: { width: 480 },
        })
        .setOrigin(0.5)
        .setDepth(302);

      button.on('pointerover', () => button.setFillStyle(0x394162));
      button.on('pointerout', () => button.setFillStyle(0x2a2f45));
      button.on('pointerdown', () => {
        const message = onPick(index);
        this.run.pendingReward = null;
        persistRun(this.run);
        if (message) {
          this.showToastAndRestart(message);
        } else {
          this.scene.restart();
        }
      });
    });

    if (skippable) {
      const skip = this.add
        .text(cx, 260 + options.length * 110, t('skip'), {
          fontSize: '15px',
          color: '#9aa3c7',
          backgroundColor: '#1b1f2e',
          padding: { x: 14, y: 6 },
        })
        .setOrigin(0.5)
        .setDepth(301)
        .setInteractive({ useHandCursor: true });
      skip.on('pointerdown', () => {
        this.run.pendingReward = null;
        this.scene.restart();
      });
    }
  }

  private showRelicChoice(): void {
    const choices = relicChoices(this.run, 3);
    if (choices.length === 0) {
      this.run.pendingReward = null;
      return;
    }
    this.showChoiceOverlay(
      t('chooseRelic'),
      choices.map((r) => ({ label: tr(r.name), description: tr(r.description) })),
      (index) => addRelic(this.run, choices[index]),
      true,
    );
  }

  private showRecruitChoice(): void {
    const choices = recruitChoices(this.run, 3);
    if (choices.length === 0) {
      this.run.pendingReward = null;
      return;
    }
    const teamFull = this.run.team.length >= 5;
    this.showChoiceOverlay(
      teamFull ? t('recruitAllyFull') : t('recruitAlly'),
      choices.map((c) => ({
        label: `${characterEmoji(c.id)} ${tr(c.name)} [${tr(c.rarity)}]`,
        description: t('recruitDesc', {
          el: tr(elementAbbr(c.element)),
          h: c.maxHp,
          a: c.attack,
          skill: tr(c.skillName),
        }),
      })),
      (index) => recruit(this.run, choices[index]),
      true,
    );
  }
}
