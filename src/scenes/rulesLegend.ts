import Phaser from 'phaser';
import { t } from '../game/i18n';
import type { UiKey } from '../game/i18n';

/**
 * Small "❓" button (top-right corner, every screen) that opens a static
 * glossary explaining the board-rule glyphs used on level map nodes and in
 * battle (⏱ turn limit, 🎨 restricted gems, ⚡ move timer). Purely
 * informational — not level-specific (see levels.ts's levelRuleLines/
 * staticLevelRuleLine for the per-level details shown elsewhere).
 */
export function drawRulesLegendButton(scene: Phaser.Scene, x: number, y: number): void {
  const button = scene.add
    .text(x, y, '❓', {
      fontSize: '14px',
      color: '#c6cdea',
      fontStyle: 'bold',
      backgroundColor: '#2a2f45',
      padding: { x: 10, y: 5 },
    })
    .setOrigin(1, 0)
    .setDepth(500)
    .setInteractive({ useHandCursor: true });

  button.on('pointerover', () => button.setBackgroundColor('#394162'));
  button.on('pointerout', () => button.setBackgroundColor('#2a2f45'));
  button.on('pointerdown', () => showRulesLegend(scene));
}

function showRulesLegend(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  const cx = width / 2;
  const cy = height / 2;
  const objs: Phaser.GameObjects.GameObject[] = [];
  const close = () => objs.forEach((o) => o.destroy());

  const backdrop = scene.add
    .rectangle(cx, cy, width, height, 0x05060a, 0.75)
    .setDepth(900)
    .setInteractive();
  backdrop.on('pointerdown', close);
  objs.push(backdrop);

  const panelWidth = 480;
  const panelHit = scene.add.rectangle(cx, cy, panelWidth, 10, 0xffffff, 0.001).setDepth(900).setInteractive();
  objs.push(panelHit);

  const entries: { key: UiKey }[] = [
    { key: 'rulesLegendTurnLimit' },
    { key: 'rulesLegendGemColors' },
    { key: 'rulesLegendMoveTime' },
  ];

  const bodyTexts = entries.map(({ key }) =>
    scene.add
      .text(0, 0, t(key), {
        fontSize: '14px',
        color: '#e6e8f0',
        wordWrap: { width: panelWidth - 48 },
        lineSpacing: 6,
      })
      .setDepth(902),
  );

  const titleHeight = 44;
  const gap = 20;
  const bodyHeight = bodyTexts.reduce((sum, txt) => sum + txt.height + gap, 0);
  const panelHeight = titleHeight + bodyHeight + 64;
  const panelTop = cy - panelHeight / 2;

  panelHit.setPosition(cx, cy);
  panelHit.setSize(panelWidth, panelHeight);

  const panel = scene.add.graphics().setDepth(901);
  panel.fillStyle(0x1b1f2e, 0.98);
  panel.fillRoundedRect(cx - panelWidth / 2, panelTop, panelWidth, panelHeight, 14);
  panel.lineStyle(2, 0x5a6cad, 1);
  panel.strokeRoundedRect(cx - panelWidth / 2, panelTop, panelWidth, panelHeight, 14);
  objs.push(panel);

  const title = scene.add
    .text(cx, panelTop + 24, t('rulesLegendTitle'), {
      fontSize: '20px',
      color: '#ffe066',
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setDepth(902);
  objs.push(title);

  let y = panelTop + titleHeight + 16;
  for (const txt of bodyTexts) {
    txt.setPosition(cx - panelWidth / 2 + 24, y);
    objs.push(txt);
    y += txt.height + gap;
  }

  const closeBtn = scene.add
    .rectangle(cx, panelTop + panelHeight - 36, 120, 36, 0x2a2f45)
    .setStrokeStyle(2, 0x5a6cad)
    .setDepth(902)
    .setInteractive({ useHandCursor: true });
  objs.push(closeBtn);
  const closeLabel = scene.add
    .text(cx, panelTop + panelHeight - 36, t('closeDetail'), {
      fontSize: '15px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setDepth(903);
  objs.push(closeLabel);
  closeBtn.on('pointerover', () => closeBtn.setFillStyle(0x394162));
  closeBtn.on('pointerout', () => closeBtn.setFillStyle(0x2a2f45));
  closeBtn.on('pointerdown', close);
}
