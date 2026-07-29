import Phaser from 'phaser';

import { TUBE_CAPACITY } from '../constants';
import type { TubeState } from '../domain/types';
import { COLOR_STOPS } from './palette';

const GLASS_OUTLINE = 0x817b9d;
const VALID_GLOW = 0x8bf5db;
const COMPLETED_GLOW = 0xffff9a;
const SHAKE_OFFSETS = [0, -8, 8, -5, 5, 0] as const;

export class TubeView extends Phaser.GameObjects.Container {
  private readonly tubeWidth: number;
  private readonly tubeHeight: number;
  private readonly liquidContainer: Phaser.GameObjects.Container;
  private readonly liquidMask: Phaser.GameObjects.Graphics;
  private readonly validGlow: Phaser.GameObjects.Graphics;
  private readonly completedGlow: Phaser.GameObjects.Graphics;
  private selected = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    tubeWidth = 60,
    tubeHeight = 184,
  ) {
    super(scene, x, y);

    this.tubeWidth = tubeWidth;
    this.tubeHeight = tubeHeight;

    const shadow = this.createShadow();
    this.validGlow = this.createValidGlow();
    this.completedGlow = this.createCompletedGlow();
    this.liquidContainer = scene.add.container(0, 0);
    const glass = this.createGlass();
    const highlight = this.createHighlight();
    const lip = this.createLip();
    this.liquidMask = this.createLiquidMask();

    this.liquidContainer.setMask(this.liquidMask.createGeometryMask());
    this.add([
      shadow,
      this.validGlow,
      this.completedGlow,
      this.liquidContainer,
      glass,
      highlight,
      lip,
    ]);

    const hitWidth = Math.max(72, tubeWidth + 12);
    const hitHeight = Math.max(204, tubeHeight + 20);
    this.setSize(hitWidth, hitHeight);
    this.setInteractive(
      new Phaser.Geom.Rectangle(-hitWidth / 2, -hitHeight / 2, hitWidth, hitHeight),
      Phaser.Geom.Rectangle.Contains,
    );

    scene.add.existing(this);
    this.syncLiquidMask();
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncLiquidMask, this);
  }

  setTube(tube: TubeState): void {
    this.liquidContainer.removeAll(true);

    const innerLeft = -this.tubeWidth / 2 + 6;
    const innerTop = -this.tubeHeight / 2 + 11;
    const innerBottom = this.tubeHeight / 2 - 8;
    const innerWidth = this.tubeWidth - 12;
    const unitHeight = (innerBottom - innerTop) / TUBE_CAPACITY;

    tube.slice(0, TUBE_CAPACITY).forEach((color, index) => {
      const stops = COLOR_STOPS[color];
      const unitTop = innerBottom - unitHeight * (index + 1);
      const halfHeight = unitHeight / 2;
      const liquid = this.scene.add.graphics();

      liquid.fillGradientStyle(
        stops.top,
        stops.top,
        stops.middle,
        stops.middle,
        1,
      );
      liquid.fillRect(innerLeft, unitTop, innerWidth, halfHeight + 1);
      liquid.fillGradientStyle(
        stops.middle,
        stops.middle,
        stops.bottom,
        stops.bottom,
        1,
      );
      liquid.fillRect(innerLeft, unitTop + halfHeight, innerWidth, halfHeight + 1);
      liquid.fillStyle(stops.top, 0.62);
      liquid.fillEllipse(0, unitTop + 1, innerWidth, Math.max(5, unitHeight * 0.18));
      this.liquidContainer.add(liquid);
    });
  }

  setSelected(selected: boolean): void {
    if (selected === this.selected) return;

    this.selected = selected;
    this.y += selected ? -18 : 18;
    this.rotation = selected ? -0.04 : 0;
    this.syncLiquidMask();
  }

  setValidTarget(valid: boolean): void {
    this.validGlow.setVisible(valid);
  }

  setCompleted(completed: boolean): void {
    this.completedGlow.setVisible(completed);
  }

  shake(): Promise<void> {
    const startX = this.x;
    const stepDuration = 180 / (SHAKE_OFFSETS.length - 1);

    return new Promise((resolve) => {
      this.scene.tweens.chain({
        targets: this,
        tweens: SHAKE_OFFSETS.slice(1).map((offset) => ({
          x: startX + offset,
          duration: stepDuration,
          ease: 'Sine.easeInOut',
        })),
        onComplete: () => resolve(),
      });
    });
  }

  override destroy(fromScene?: boolean): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncLiquidMask, this);
    this.liquidContainer.clearMask(true);
    this.liquidMask.destroy();
    super.destroy(fromScene);
  }

  private createShadow(): Phaser.GameObjects.Graphics {
    const shadow = this.scene.add.graphics();
    shadow.fillStyle(0x352d4c, 0.12);
    shadow.fillEllipse(4, this.tubeHeight / 2 + 13, this.tubeWidth + 24, 20);
    return shadow;
  }

  private createValidGlow(): Phaser.GameObjects.Graphics {
    const glow = this.scene.add.graphics();
    const bodyTop = -this.tubeHeight / 2 + 5;
    const bodyHeight = this.tubeHeight - 7;

    glow.lineStyle(12, VALID_GLOW, 0.16);
    glow.strokeRoundedRect(
      -this.tubeWidth / 2 - 3,
      bodyTop - 3,
      this.tubeWidth + 6,
      bodyHeight + 6,
      this.tubeWidth / 2,
    );
    glow.lineStyle(4, VALID_GLOW, 0.7);
    glow.strokeEllipse(0, bodyTop + 3, this.tubeWidth + 15, 19);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setVisible(false);
    return glow;
  }

  private createCompletedGlow(): Phaser.GameObjects.Graphics {
    const glow = this.scene.add.graphics();
    const bodyTop = -this.tubeHeight / 2 + 5;

    glow.lineStyle(7, COMPLETED_GLOW, 0.24);
    glow.strokeRoundedRect(
      -this.tubeWidth / 2 - 2,
      bodyTop - 2,
      this.tubeWidth + 4,
      this.tubeHeight - 3,
      this.tubeWidth / 2,
    );
    glow.fillStyle(0xffffff, 0.8);
    glow.fillCircle(this.tubeWidth / 2 + 8, -this.tubeHeight * 0.2, 3);
    glow.fillCircle(-this.tubeWidth / 2 - 5, this.tubeHeight * 0.08, 2);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setVisible(false);
    return glow;
  }

  private createGlass(): Phaser.GameObjects.Graphics {
    const glass = this.scene.add.graphics();
    const bodyTop = -this.tubeHeight / 2 + 5;
    const bodyHeight = this.tubeHeight - 7;

    glass.fillStyle(0xffffff, 0.1);
    glass.fillRoundedRect(
      -this.tubeWidth / 2,
      bodyTop,
      this.tubeWidth,
      bodyHeight,
      this.tubeWidth / 2,
    );
    glass.lineStyle(2, GLASS_OUTLINE, 0.88);
    glass.strokeRoundedRect(
      -this.tubeWidth / 2,
      bodyTop,
      this.tubeWidth,
      bodyHeight,
      this.tubeWidth / 2,
    );
    return glass;
  }

  private createHighlight(): Phaser.GameObjects.Graphics {
    const highlight = this.scene.add.graphics();
    const highlightHeight = this.tubeHeight * 0.56;

    highlight.fillStyle(0xffffff, 0.65);
    highlight.fillRoundedRect(
      -this.tubeWidth * 0.23,
      -this.tubeHeight * 0.31,
      Math.max(3, this.tubeWidth * 0.07),
      highlightHeight,
      3,
    );
    return highlight;
  }

  private createLip(): Phaser.GameObjects.Graphics {
    const lip = this.scene.add.graphics();
    const lipY = -this.tubeHeight / 2 + 8;

    lip.fillStyle(0xffffff, 0.24);
    lip.fillEllipse(0, lipY, this.tubeWidth + 9, 16);
    lip.lineStyle(4, GLASS_OUTLINE, 0.92);
    lip.strokeEllipse(0, lipY, this.tubeWidth + 9, 16);
    lip.lineStyle(2, 0xffffff, 0.72);
    lip.strokeEllipse(0, lipY - 1, this.tubeWidth + 1, 9);
    return lip;
  }

  private createLiquidMask(): Phaser.GameObjects.Graphics {
    const mask = this.scene.make.graphics({}, false);
    const innerTop = -this.tubeHeight / 2 + 11;

    mask.fillStyle(0xffffff);
    mask.fillRoundedRect(
      -this.tubeWidth / 2 + 6,
      innerTop,
      this.tubeWidth - 12,
      this.tubeHeight - 19,
      (this.tubeWidth - 12) / 2,
    );
    mask.setVisible(false);
    return mask;
  }

  private syncLiquidMask(): void {
    const transform = this.getWorldTransformMatrix().decomposeMatrix();

    this.liquidMask
      .setPosition(transform.translateX, transform.translateY)
      .setRotation(transform.rotation)
      .setScale(transform.scaleX, transform.scaleY);
  }
}
