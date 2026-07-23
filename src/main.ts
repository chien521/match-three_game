import './style.css';
import Phaser from 'phaser';
import { ChapterSelectScene } from './scenes/ChapterSelectScene';
import { CollectionScene } from './scenes/CollectionScene';
import { GachaScene } from './scenes/GachaScene';
import { GameScene } from './scenes/GameScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';

function createGame(): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    width: 800,
    height: 800,
    backgroundColor: '#12141c',
    disableContextMenu: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 800,
      height: 800,
    },
    scene: [ChapterSelectScene, LevelSelectScene, GameScene, GachaScene, CollectionScene],
  });

  // iOS Safari can fire Phaser.Game's init with a still-zero-size #app
  // container when the page uses flex + 100dvh (the address bar hasn't
  // settled yet), which leaves the canvas sized at its native 800x800
  // instead of being scaled to fit. Force a refresh once layout has
  // actually painted, and again on any viewport change (address bar
  // show/hide, rotation).
  const resize = () => game.scale.refresh();
  window.requestAnimationFrame(resize);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
  }

  return game;
}

createGame();
