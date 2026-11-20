/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimePhase } from './WorldAtmosphereSystem';
import { MapSystem } from './MapSystem';

export type WildlifeKind = 'butterfly' | 'dragonfly' | 'firefly' | 'bird';

export type AmbientAudioCue = 'wind' | 'bird' | 'water' | 'cricket' | 'none';

export const WILDLIFE_POOL_CONFIG = {
  MAX_BUTTERFLIES: 7,
  MAX_DRAGONFLIES: 5,
  MAX_FIREFLIES: 5,
  MAX_BIRDS: 3,
  MAX_FLUTTER_LEAVES: 10,
  MAX_SHORE_RIPPLES: 8,
} as const;

export class AmbientLifeSystem {
  /**
   * Determines whether a wildlife species should appear given the current Day/Night phase & rain.
   */
  public static shouldBeActive(kind: WildlifeKind, phase: TimePhase, rainIntensity: number): boolean {
    if (rainIntensity > 0.55) {
      // Heavy rain shelters delicate insects & birds cleanly
      return false;
    }

    switch (kind) {
      case 'butterfly':
        return (phase === 'morning' || phase === 'day') && rainIntensity < 0.35;
      case 'dragonfly':
        return (phase === 'morning' || phase === 'day' || phase === 'evening') && rainIntensity < 0.4;
      case 'firefly':
        return phase === 'evening' || phase === 'night';
      case 'bird':
        return (phase === 'morning' || phase === 'day') && rainIntensity < 0.45;
    }
  }

  /**
   * Validates whether a world tile (tx, ty) matches the natural biome habitat for a creature kind.
   */
  public static isValidHabitatTile(kind: WildlifeKind, tx: number, ty: number, mapSystem: MapSystem): boolean {
    if (!mapSystem.isTileInBounds(tx, ty)) return false;
    const tile = mapSystem.tiles[ty][tx];

    const isWhisperingForest = tx >= 38 && ty <= 52;
    const isEmeraldGlade = tx >= 70 && tx <= 104 && ty >= 12 && ty <= 34;
    const isTownParkOrGarden = tx >= 24 && tx <= 38 && ty >= 26 && ty <= 38;

    const isNearWater = (): boolean => {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (mapSystem.isTileInBounds(nx, ny) && mapSystem.tiles[ny][nx] === 'water') {
            return true;
          }
        }
      }
      return false;
    };

    switch (kind) {
      case 'butterfly':
        return tile === 'grass' && (isTownParkOrGarden || isEmeraldGlade || !isWhisperingForest || tx < 65);
      case 'dragonfly':
        return tile === 'water' || ((tile === 'grass' || tile === 'sand') && isNearWater());
      case 'firefly':
        return (
          tile !== 'cliff' &&
          tile !== 'water' &&
          (isWhisperingForest || isEmeraldGlade || isNearWater() || tx >= 42)
        );
      case 'bird':
        return tile !== 'cliff';
    }
  }

  /**
   * Selects an optional subtle ambient audio cue based on player surroundings & time-of-day.
   */
  public static selectAmbientCue(
    phase: TimePhase,
    nearWater: boolean,
    inForestOrGlade: boolean,
    rainIntensity: number,
    roll: number
  ): AmbientAudioCue {
    if (rainIntensity > 0.35) {
      return roll < 0.5 ? 'water' : 'wind';
    }
    if (phase === 'night' || phase === 'evening') {
      if (nearWater && roll < 0.35) return 'water';
      if (roll < 0.78) return 'cricket';
      return 'wind';
    }
    if (nearWater && roll < 0.45) {
      return 'water';
    }
    if ((inForestOrGlade || phase === 'morning') && roll < 0.7) {
      return 'bird';
    }
    return roll < 0.55 ? 'wind' : 'bird';
  }
}
