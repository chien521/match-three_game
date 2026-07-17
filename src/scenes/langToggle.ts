import Phaser from 'phaser';
import { getLang, toggleLang } from '../game/i18n';

/**
 * Small pill button that flips the UI language. Shows the TARGET language
 * ("中" while in English, "EN" while in Chinese). `onSwitch` runs after the
 * language changes — map-style scenes pass `() => scene.scene.restart()`,
 * GameScene passes its live refreshLanguage() so a battle in progress is
 * never reset.
 */
export function drawLanguageToggle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  onSwitch: () => void,
): Phaser.GameObjects.Text {
  const label = scene.add
    .text(x, y, getLang() === 'en' ? '中' : 'EN', {
      fontSize: '14px',
      color: '#c6cdea',
      fontStyle: 'bold',
      backgroundColor: '#2a2f45',
      padding: { x: 10, y: 5 },
    })
    .setOrigin(0, 0)
    .setDepth(500) // above scene overlays so it stays clickable everywhere
    .setInteractive({ useHandCursor: true });

  label.on('pointerover', () => label.setBackgroundColor('#394162'));
  label.on('pointerout', () => label.setBackgroundColor('#2a2f45'));
  label.on('pointerdown', () => {
    toggleLang();
    label.setText(getLang() === 'en' ? '中' : 'EN');
    onSwitch();
  });

  return label;
}
