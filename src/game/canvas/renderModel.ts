import type { QualityConfig } from './adaptiveQuality';
import type { PourFrame } from './pourAnimation';
import type { ResponsiveLayout, TubeLayout } from './responsiveLayout';
import type { ColorId, TubeState } from '../domain/types';

export interface TubeRenderModel {
  index: number;
  colors: readonly ColorId[];
  layout: TubeLayout;
  selected: boolean;
  validTarget: boolean;
  completed: boolean;
  pressed: boolean;
}

export interface SceneRenderModel {
  tubes: readonly TubeRenderModel[];
  quality: QualityConfig;
  pour: (PourFrame & { from: number; to: number; color: ColorId }) | null;
}

export interface RenderModelInput {
  board: readonly TubeState[];
  selectedTube: number | null;
  validTargets: ReadonlySet<number>;
  pressedTube: number | null;
  layout: ResponsiveLayout;
  quality: QualityConfig;
  pour: SceneRenderModel['pour'];
}

export function buildSceneRenderModel(input: RenderModelInput): SceneRenderModel {
  return {
    quality: input.quality,
    pour: input.pour,
    tubes: input.layout.tubes.map((layout, index) => {
      const colors = input.board[index] ?? [];
      const first = colors[0];
      return {
        index,
        colors,
        layout,
        selected: input.selectedTube === index,
        validTarget: input.validTargets.has(index),
        completed: colors.length === 4
          && first !== undefined
          && colors.every((color) => color === first),
        pressed: input.pressedTube === index,
      };
    }),
  };
}
