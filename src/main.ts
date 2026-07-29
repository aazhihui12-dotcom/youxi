import Phaser from 'phaser';
import './styles.css';
import { GAME_HEIGHT, GAME_WIDTH } from './game/constants';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#fffaf2',
  transparent: false,
  render: { antialias: true, roundPixels: false },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: {
    create(this: Phaser.Scene) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '色をそろえよう！', {
        color: '#4d4664',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '34px',
        fontStyle: 'bold',
      }).setOrigin(0.5);
    },
  },
});
