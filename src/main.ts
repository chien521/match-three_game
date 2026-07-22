import './style.css';
import Phaser from 'phaser';
import { ChapterSelectScene } from './scenes/ChapterSelectScene';
import { CollectionScene } from './scenes/CollectionScene';
import { GachaScene } from './scenes/GachaScene';
import { GameScene } from './scenes/GameScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 800,
  height: 800,
  backgroundColor: '#12141c',
  disableContextMenu: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: 800,
    height: 800,
  },
  scene: [ChapterSelectScene, LevelSelectScene, GameScene, GachaScene, CollectionScene],
});
