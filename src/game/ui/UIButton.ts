import Phaser from 'phaser';

export type UIButtonVariant = 'white' | 'violet';

const BUTTON_SIZE = 64;
const HIT_SIZE = 72;
const PRESSED_SCALE = 0.96;
const DISABLED_ALPHA = 0.35;

export class UIButton extends Phaser.GameObjects.Container {
  private readonly iconText: Phaser.GameObjects.Text;
  private enabledState = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    icon: string,
    variant: UIButtonVariant = 'white',
  ) {
    super(scene, x, y);

    const shadow = scene.add.graphics();
    shadow.fillStyle(0x51486b, 0.14);
    shadow.fillEllipse(0, 5, BUTTON_SIZE, BUTTON_SIZE - 3);

    const circle = scene.add.graphics();
    if (variant === 'violet') {
      circle.fillGradientStyle(0xded4ff, 0xeee9ff, 0xbba8f5, 0xd5c8ff, 1);
    } else {
      circle.fillGradientStyle(0xffffff, 0xffffff, 0xf1edff, 0xe9e4fb, 1);
    }
    circle.fillCircle(0, 0, BUTTON_SIZE / 2);
    circle.lineStyle(2, 0xffffff, 0.78);
    circle.strokeCircle(0, -1, BUTTON_SIZE / 2 - 1);

    this.iconText = scene.add.text(0, -1, icon, {
      color: variant === 'violet' ? '#ffffff' : '#665d82',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '30px',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add([shadow, circle, this.iconText]);
    this.setSize(BUTTON_SIZE, BUTTON_SIZE);
    const hitOffset = (BUTTON_SIZE - HIT_SIZE) / 2;
    this.setInteractive(
      new Phaser.Geom.Rectangle(hitOffset, hitOffset, HIT_SIZE, HIT_SIZE),
      Phaser.Geom.Rectangle.Contains,
    );

    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.handlePress, this);
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, this.handleRelease, this);
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, this.handleRelease, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handleRelease, this);

    scene.add.existing(this);
  }

  setIcon(icon: string): this {
    this.iconText.setText(icon);
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabledState = enabled;
    this.setAlpha(enabled ? 1 : DISABLED_ALPHA);
    this.setScale(1);
    if (this.input !== null) {
      this.input.enabled = enabled;
    }
    return this;
  }

  get enabled(): boolean {
    return this.enabledState;
  }

  override destroy(fromScene?: boolean): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handleRelease, this);
    super.destroy(fromScene);
  }

  private handlePress(): void {
    if (this.enabledState) {
      this.setScale(PRESSED_SCALE);
    }
  }

  private handleRelease(): void {
    if (this.active) {
      this.setScale(1);
    }
  }
}
