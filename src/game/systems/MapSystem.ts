/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BUILDABLE_ZONE_BOUNDS, BridgeStyle, FARM_PLOTS, MAP_CONFIG, SCENIC_FISHING_PIERS, TOWN_PROTECTED_BOUNDS, ZONES } from '../constants';
import { TileType, ZoneDefinition } from '../types';

export type RiverZoneKind = 'pool' | 'run' | 'riffle' | 'cascade';

export interface RiverFlowCell {
  dx: number;
  dy: number;
  curvature: number;
  prog: number;
  zoneKind: RiverZoneKind;
  speedMul: number;
}

export class MapSystem {
  public width: number;
  public height: number;
  public tiles: TileType[][];
  public collisionMap: boolean[][];
  public roadTier: ('none' | 'main' | 'trail')[][];
  public protectedPropTiles: Set<string>;
  public pierTileKeys: Set<string>;
  public waterDepth: number[][];
  public riverFlowVec: Array<Array<RiverFlowCell | null>>;

  constructor(width = MAP_CONFIG.WIDTH, height = MAP_CONFIG.HEIGHT) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    this.collisionMap = [];
    this.roadTier = [];
    this.protectedPropTiles = new Set();
    this.pierTileKeys = new Set();
    this.waterDepth = [];
    this.riverFlowVec = [];
    this.generateWorld();
  }

  public isSilverbrookRiverTile(tx: number, ty: number): boolean {
    if (!this.isTileInBounds(tx, ty)) return false;
    return this.riverFlowVec[ty]?.[tx] !== null;
  }

  public getWaterDepth(tx: number, ty: number): number {
    if (!this.isTileInBounds(tx, ty)) return 0;
    return this.waterDepth[ty]?.[tx] ?? 0;
  }

  public getRiverFlowCell(tx: number, ty: number): RiverFlowCell | null {
    if (!this.isTileInBounds(tx, ty)) return null;
    return this.riverFlowVec[ty]?.[tx] ?? null;
  }

  public getRiverFlowScreenVector(
    tx: number,
    ty: number
  ): { sx: number; sy: number; curvature: number; zoneKind: RiverZoneKind; speedMul: number; prog: number } | null {
    if (!this.isTileInBounds(tx, ty)) return null;
    const f = this.riverFlowVec[ty]?.[tx];
    if (!f) return null;
    const dsx = (f.dx - f.dy) * (MAP_CONFIG.TILE_WIDTH / 2);
    const dsy = (f.dx + f.dy) * (MAP_CONFIG.TILE_HEIGHT / 2);
    const len = Math.hypot(dsx, dsy) || 1;
    return {
      sx: dsx / len,
      sy: dsy / len,
      curvature: f.curvature,
      zoneKind: f.zoneKind,
      speedMul: f.speedMul,
      prog: f.prog,
    };
  }

  public getBridgeStyle(tx: number, ty: number): BridgeStyle {
    if (this.pierTileKeys.has(`${tx}_${ty}`)) return 'pier';
    if (this.getRoadTier(tx, ty) === 'main') return 'main';
    return 'rustic';
  }

  public getRoadTier(tx: number, ty: number): 'none' | 'main' | 'trail' {
    if (!this.isTileInBounds(tx, ty)) return 'none';
    return this.roadTier[ty]?.[tx] || 'none';
  }

  private carveRoadTile(tx: number, ty: number, tier: 'main' | 'trail'): void {
    if (!this.isTileInBounds(tx, ty)) return;
    if (this.tiles[ty][tx] === 'water') return;
    this.tiles[ty][tx] = 'dirt';
    this.collisionMap[ty][tx] = false;
    // Main roads take precedence over trails
    if (this.roadTier[ty][tx] !== 'main') {
      this.roadTier[ty][tx] = tier;
    }
  }

  /**
   * Convert grid tile (tx, ty) to isometric screen world coordinates
   */
  public static tileToWorld(tx: number, ty: number): { x: number; y: number } {
    const hw = MAP_CONFIG.TILE_WIDTH / 2;
    const hh = MAP_CONFIG.TILE_HEIGHT / 2;
    const x = (tx - ty) * hw + MAP_CONFIG.ORIGIN_X;
    const y = (tx + ty) * hh + MAP_CONFIG.ORIGIN_Y;
    return { x, y };
  }

  /**
   * Convert isometric world coordinates to grid tile (tx, ty)
   */
  public static worldToTile(wx: number, wy: number): { tx: number; ty: number } {
    const hw = MAP_CONFIG.TILE_WIDTH / 2;
    const hh = MAP_CONFIG.TILE_HEIGHT / 2;
    const dx = wx - MAP_CONFIG.ORIGIN_X;
    const dy = wy - MAP_CONFIG.ORIGIN_Y;

    const tx = Math.floor((dx / hw + dy / hh) / 2);
    const ty = Math.floor((dy / hh - dx / hw) / 2);
    return { tx, ty };
  }

  /**
   * Generates the 120x120 world map with distinct, well-placed zones, organic roads, and natural bridges
   */
  private generateWorld(): void {
    this.tiles = [];
    this.collisionMap = [];
    this.roadTier = [];
    this.pierTileKeys.clear();
    this.waterDepth = [];
    this.riverFlowVec = [];

    // Initialize all as grass
    for (let y = 0; y < this.height; y++) {
      const row: TileType[] = [];
      const colRow: boolean[] = [];
      const tierRow: ('none' | 'main' | 'trail')[] = [];
      const depthRow: number[] = [];
      const flowRow: Array<RiverFlowCell | null> = [];
      for (let x = 0; x < this.width; x++) {
        row.push('grass');
        colRow.push(false);
        tierRow.push('none');
        depthRow.push(0);
        flowRow.push(null);
      }
      this.tiles.push(row);
      this.collisionMap.push(colRow);
      this.roadTier.push(tierRow);
      this.waterDepth.push(depthRow);
      this.riverFlowVec.push(flowRow);
    }

    // 1. Natural Mirror Lake (South-West: approx tx 8..34, ty 48..78)
    const lake1CenterX = 20;
    const lake1CenterY = 62;
    const lake1RadiusX = 14;
    const lake1RadiusY = 11;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const angle = Math.atan2(y - lake1CenterY, x - lake1CenterX);
        const wobble = Math.sin(angle * 3) * 1.8 + Math.cos(angle * 5) * 1.2;
        const normDist = Math.hypot((x - lake1CenterX) / (lake1RadiusX + wobble), (y - lake1CenterY) / (lake1RadiusY + wobble * 0.7));

        if (normDist <= 0.88) {
          this.tiles[y][x] = 'water';
          this.collisionMap[y][x] = true;
          this.waterDepth[y][x] = Math.max(0.1, Math.min(1, 1 - normDist / 0.88));
        } else if (normDist <= 1.05) {
          this.tiles[y][x] = 'sand';
        }
      }
    }

    // 2. Lake 2: "Lilypad Pond" / "Emerald Glade Lake" (East Forest: tx 76..96, ty 15..28)
    const lake2CenterX = 86;
    const lake2CenterY = 22;
    const lake2RadiusX = 9;
    const lake2RadiusY = 6;
    for (let y = 14; y <= 30; y++) {
      for (let x = 74; x <= 98; x++) {
        if (!this.isTileInBounds(x, y)) continue;
        const angle = Math.atan2(y - lake2CenterY, x - lake2CenterX);
        const wobble = Math.sin(angle * 4) * 1.2 + Math.cos(angle * 2) * 1.0;
        const normDist = Math.hypot((x - lake2CenterX) / (lake2RadiusX + wobble), (y - lake2CenterY) / (lake2RadiusY + wobble * 0.6));

        if (normDist <= 0.86) {
          this.tiles[y][x] = 'water';
          this.collisionMap[y][x] = true;
          this.waterDepth[y][x] = Math.max(0.1, Math.min(1, 1 - normDist / 0.86));
        } else if (normDist <= 1.06) {
          if (this.tiles[y][x] !== 'water') {
            this.tiles[y][x] = 'sand';
          }
        }
      }
    }

    // 3. Lake 3: "Highland Mountain Spring Lake" (North-West Foothills: tx 10..26, ty 9..20)
    const lake3CenterX = 18;
    const lake3CenterY = 14;
    const lake3RadiusX = 8;
    const lake3RadiusY = 5.5;
    for (let y = 7; y <= 22; y++) {
      for (let x = 8; x <= 28; x++) {
        if (!this.isTileInBounds(x, y)) continue;
        const angle = Math.atan2(y - lake3CenterY, x - lake3CenterX);
        const wobble = Math.sin(angle * 3) * 1.1 + Math.cos(angle * 6) * 0.8;
        const normDist = Math.hypot((x - lake3CenterX) / (lake3RadiusX + wobble), (y - lake3CenterY) / (lake3RadiusY + wobble * 0.6));

        if (normDist <= 0.86) {
          this.tiles[y][x] = 'water';
          this.collisionMap[y][x] = true;
          this.waterDepth[y][x] = Math.max(0.1, Math.min(1, 1 - normDist / 0.86));
        } else if (normDist <= 1.06) {
          if (this.tiles[y][x] !== 'water') {
            this.tiles[y][x] = 'sand';
          }
        }
      }
    }

    // 4. Towering Mountain Ridges & Cliff Plateaus (Northern & Eastern Mountain Rim)
    for (let y = 0; y <= 6; y++) {
      for (let x = 0; x < this.width; x++) {
        const isPass = (x >= 29 && x <= 32) || (x >= 60 && x <= 63) || (x >= 92 && x <= 95);
        if (!isPass) {
          const cliffDepth = Math.floor(3 + Math.sin(x * 0.4) * 2 + Math.cos(x * 0.15) * 1.5);
          if (y <= cliffDepth && this.tiles[y][x] !== 'water') {
            this.tiles[y][x] = 'cliff';
            this.collisionMap[y][x] = true;
          }
        }
      }
    }

    // Rocky Amphitheater & Bluffs framing the Northern Quarry (x: 70..118, y: 0..12)
    for (let y = 3; y <= 12; y++) {
      for (let x = 70; x < this.width; x++) {
        const isPass = (x >= 92 && x <= 95);
        if (!isPass) {
          const ridgeWobble = Math.sin(x * 0.35 + y * 0.5);
          if (ridgeWobble > 0.45 && this.tiles[y][x] === 'grass') {
            this.tiles[y][x] = 'cliff';
            this.collisionMap[y][x] = true;
          }
        }
      }
    }

    // 5. Silverbrook Creek flowing naturally from Farming District side (38, 114) across Build Zone -> (114, 54)
    // Preserves the exact corridor, all bridges, Overlook Pier (88..91, 69), fishing spot (89, 68), and all 5 Farm Plots,
    // while enriching channel hydrology with calm deep pools, stony riffles, natural bends & subtle rock-step cascades.
    const riverSamples: Array<{
      x: number;
      y: number;
      prog: number;
      legacyProg: number;
      tx: number;
      ty: number;
      curvature: number;
    }> = [];
    const RIVER_SAMPLES = 360;
    for (let i = 0; i <= RIVER_SAMPLES; i++) {
      const legacyProg = i / RIVER_SAMPLES; // Original sampling order: 0 = (114,54) -> 1 = (38,114)
      const prog = 1 - legacyProg; // Flow progress: 0 = Farming District SW -> 1 = Build Zone NE
      const x = 114 - legacyProg * 76 + Math.sin(legacyProg * Math.PI * 5.0) * 0.95;
      const y = 54 + legacyProg * 60 + Math.sin(legacyProg * 14) * 3.5 + Math.sin(legacyProg * 27 + 0.65) * 0.9;
      riverSamples.push({ x, y, prog, legacyProg, tx: 0.78, ty: -0.62, curvature: 0 });
    }
    for (let i = 0; i < riverSamples.length; i++) {
      const downstream = riverSamples[Math.max(0, i - 2)];
      const upstream = riverSamples[Math.min(riverSamples.length - 1, i + 2)];
      // Downstream vector: Farming District (38, 114) -> Build Zone (114, 54)
      const dx = downstream.x - upstream.x;
      const dy = downstream.y - upstream.y;
      const len = Math.hypot(dx, dy) || 1;
      riverSamples[i].tx = dx / len;
      riverSamples[i].ty = dy / len;
    }
    for (let i = 0; i < riverSamples.length; i++) {
      const upstream = riverSamples[Math.min(riverSamples.length - 1, i + 6)];
      const downstream = riverSamples[Math.max(0, i - 6)];
      // Signed 2D cross-product curvature along downstream direction
      riverSamples[i].curvature = upstream.tx * downstream.ty - upstream.ty * downstream.tx;
    }

    // Subtle rock-step cascades tucked naturally between main road bridges (never on piers or fishing spots)
    const cascadeCenters = [0.22, 0.44, 0.64, 0.85];

    const isInsideProtectedFarmPlot = (wx: number, wy: number): boolean =>
      FARM_PLOTS.some(
        (p) => wx >= p.bounds.minX - 1 && wx <= p.bounds.maxX + 1 && wy >= p.bounds.minY - 1 && wy <= p.bounds.maxY + 1
      );

    for (let wy = 46; wy < this.height; wy++) {
      for (let wx = 32; wx < this.width; wx++) {
        if (isInsideProtectedFarmPlot(wx, wy)) continue;

        let minDistSq = Infinity;
        let closestIdx = 0;
        for (let i = 0; i < riverSamples.length; i++) {
          const s = riverSamples[i];
          const dx = wx - s.x;
          const dy = wy - s.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            closestIdx = i;
          }
        }

        const minDist = Math.sqrt(minDistSq);
        if (minDist > 5.4) continue;

        const s = riverSamples[closestIdx];
        // Non-uniform natural channel width: alternate wider calm pools (~6.4 tiles) and narrower riffles (~3.2 tiles)
        const widthWave =
          Math.sin(s.legacyProg * Math.PI * 6.0 - 0.5) * 0.56 +
          Math.cos(s.legacyProg * Math.PI * 3.0 + 0.4) * 0.36;
        const shoreWiggle =
          Math.sin(wx * 0.39 - wy * 0.33) * 0.22 +
          Math.cos(wx * 0.24 + wy * 0.41) * 0.16;
        const riverHalfWidth = Math.max(1.58, Math.min(3.25, 2.34 + widthWave + shoreWiggle));

        // Inner bends form wider sandy/gravel spits; outer bends form steeper mossy cutbanks
        const sideOffset = (wx - s.x) * (-s.ty) + (wy - s.y) * s.tx;
        const isInnerBend = sideOffset * s.curvature > 0;
        const bankNoise =
          Math.sin(wx * 0.31 + wy * 0.43) * 0.28 +
          Math.cos(wx * 0.19 - wy * 0.27) * 0.16;
        const bankWidth = isInnerBend
          ? Math.max(0.85, 1.24 + bankNoise)
          : Math.max(0.28, 0.54 + bankNoise * 0.65);

        const isCascadeZone = cascadeCenters.some((c) => Math.abs(s.prog - c) < 0.022);
        const isPinnedLookoutFishSpot = wx === 89 && wy === 68;
        if (minDist <= riverHalfWidth || isPinnedLookoutFishSpot) {
          this.tiles[wy][wx] = 'water';
          this.collisionMap[wy][wx] = true;
          const rawDepth = isPinnedLookoutFishSpot
            ? Math.max(0.28, 1 - minDist / Math.max(0.5, riverHalfWidth))
            : 1 - minDist / Math.max(0.5, riverHalfWidth);
          const depth = Math.max(0.08, Math.min(1, rawDepth));
          this.waterDepth[wy][wx] = depth;

          let zoneKind: RiverZoneKind = 'run';
          let speedMul = 1.0;
          if (isCascadeZone && riverHalfWidth < 2.65) {
            zoneKind = 'cascade';
            speedMul = 1.65;
          } else if (widthWave > 0.24 && depth >= 0.45) {
            zoneKind = 'pool';
            speedMul = 0.72;
          } else if (widthWave < -0.18 || depth < 0.36) {
            zoneKind = 'riffle';
            speedMul = 1.34;
          } else {
            zoneKind = 'run';
            speedMul = 1.02 + Math.abs(s.curvature) * 0.45;
          }

          this.riverFlowVec[wy][wx] = {
            dx: s.tx,
            dy: s.ty,
            curvature: s.curvature,
            prog: s.prog,
            zoneKind,
            speedMul,
          };
        } else if (minDist <= riverHalfWidth + bankWidth && this.tiles[wy][wx] === 'grass') {
          this.tiles[wy][wx] = 'sand';
        }
      }
    }

    // 6. Integrated Village Town Center (tx 21..39, ty 21..39)
    for (let y = 21; y <= 39; y++) {
      for (let x = 21; x <= 39; x++) {
        const isMainAvenue = x === 30 || x === 31 || y === 30 || y === 31;
        const isCentralPlaza = x >= 28 && x <= 32 && y >= 28 && y <= 32;
        const isPocketPark = x >= 33 && x <= 38 && y >= 36 && y <= 39;
        const isFlowerGarden = x >= 26 && x <= 29 && y >= 35 && y <= 39;
        const isOuterFringeGrass =
          ((x === 21 || x === 22) && y >= 21 && y <= 24) ||
          ((x === 38 || x === 39) && y >= 21 && y <= 24) ||
          (y === 21 && (x < 29 || x > 32)) ||
          (y === 39 && (x < 29 || x > 32));

        if (isCentralPlaza || isMainAvenue) {
          this.tiles[y][x] = 'cobble';
        } else if (isPocketPark || isFlowerGarden || isOuterFringeGrass) {
          this.tiles[y][x] = 'grass';
        } else {
          this.tiles[y][x] = 'dirt';
          this.roadTier[y][x] = 'trail';
        }
        this.collisionMap[y][x] = false;
      }
    }
    this.tiles[36][34] = 'dirt';
    this.tiles[36][35] = 'dirt';
    this.tiles[35][28] = 'dirt';
    this.tiles[36][28] = 'dirt';

    // 7. Main City Roads connecting Town Center cleanly to ALL surrounding Zones
    // A. North Main Road through Wild Meadows to Mountain Pass (x = 30..31, y = 0..20)
    for (let y = 0; y <= 20; y++) {
      this.carveRoadTile(30, y, 'main');
      this.carveRoadTile(31, y, 'main');
    }

    // B. West Main Road out to Mirror Lake approach (y = 30..31, x = 11..20)
    for (let x = 11; x <= 20; x++) {
      this.carveRoadTile(x, 30, 'main');
      this.carveRoadTile(x, 31, 'main');
    }

    // C. East Main Road through Whispering Forest (y = 30..31, x = 40..98)
    for (let x = 40; x <= 98; x++) {
      this.carveRoadTile(x, 30, 'main');
      this.carveRoadTile(x, 31, 'main');
    }

    // D. South Main Road: leads out of Town South Gate (30..31, 40..47), curves gracefully around
    // Mirror Lake's eastern sand bank (35..36, 48..75) so Mirror Lake water remains untouched,
    // then rejoins (30..31, 76..108) and links directly into Homestead avenues & Farm District!
    for (let y = 40; y <= 47; y++) {
      this.carveRoadTile(30, y, 'main');
      this.carveRoadTile(31, y, 'main');
    }
    for (let x = 30; x <= 37; x++) {
      this.carveRoadTile(x, 47, 'main');
      this.carveRoadTile(x, 48, 'main');
    }
    for (let y = 48; y <= 75; y++) {
      this.carveRoadTile(36, y, 'main');
      this.carveRoadTile(37, y, 'main');
    }
    for (let x = 30; x <= 37; x++) {
      this.carveRoadTile(x, 74, 'main');
      this.carveRoadTile(x, 75, 'main');
    }
    for (let y = 75; y <= 108; y++) {
      this.carveRoadTile(30, y, 'main');
      this.carveRoadTile(31, y, 'main');
    }

    // Main Road connectors from South Avenue into Homestead grid avenues (y = 42, 56, 70, 84, 98)
    for (const [startX, gy] of [[31, 42], [37, 56], [37, 70], [31, 84], [31, 98]]) {
      for (let x = startX; x <= 42; x++) {
        this.carveRoadTile(x, gy, 'main');
      }
    }

    // 8. Secondary Organic Nature Trails (distinct 1-tile footpaths)
    // A. West Road -> Mirror Lake North Fishing Shore Trail (11..12, 32..49)
    for (let y = 32; y <= 49; y++) {
      const tx = Math.round(12 + Math.sin(y * 0.25) * 1.2);
      this.carveRoadTile(tx, y, 'trail');
    }
    // Scenic southern Mirror Lake footpath (22..30, 75..78)
    for (let x = 18; x <= 30; x++) {
      const ty = Math.round(77 + Math.sin(x * 0.3) * 1.0);
      this.carveRoadTile(x, ty, 'trail');
    }

    // B. Wild Meadows -> Highland Spring Lake Trail (25..30, y=14)
    for (let x = 25; x <= 30; x++) {
      this.carveRoadTile(x, 14, 'trail');
      if (x <= 26) this.carveRoadTile(x, 15, 'trail');
    }

    // C. Whispering Forest scenic trail toward Emerald Glade Lake & alpine pass
    for (let d = 38; d <= 77; d++) {
      const tx = d;
      const ty = Math.floor(25 + Math.sin(d * 0.14) * 2.5);
      this.carveRoadTile(tx, ty, 'trail');
      if (d === 44 || d === 54 || d === 70) {
        // Gentle north/south spur links to main east road
        const yMin = Math.min(ty, 30);
        const yMax = Math.max(ty, 30);
        for (let sy = yMin; sy <= yMax; sy++) {
          this.carveRoadTile(tx, sy, 'trail');
        }
      }
    }
    // Forest inner glade loop east of Emerald Glade Lake
    for (let d = 78; d <= 104; d++) {
      const ty = Math.floor(33 + Math.sin(d * 0.18) * 3);
      this.carveRoadTile(d, ty, 'trail');
    }

    // D. Quarry Mountain Pass Trail (x ~ 61, y: 0..25)
    for (let py = 0; py <= 26; py++) {
      const px = Math.floor(61 + Math.sin(py * 0.22) * 1.4);
      if (this.isTileInBounds(px, py) && this.tiles[py][px] !== 'water') {
        this.carveRoadTile(px, py, 'trail');
      }
    }

    // E. Farm District entrance trail connecting Homestead avenue (42, 70) -> Stone Well (49, 74)
    for (let x = 42; x <= 48; x++) {
      this.carveRoadTile(x, 72, 'trail');
    }
    for (let y = 70; y <= 75; y++) {
      this.carveRoadTile(44, y, 'trail');
    }
    this.carveRoadTile(49, 72, 'trail');
    this.carveRoadTile(49, 73, 'trail');

    // 9. Homestead District clearing roads (Southeast: x: 42..112, y: 42..112)
    // Primary arteries (70) styled as main roads; secondary block lanes (42, 56, 84, 98, 112) as main/trail
    // Extend y=112 west to x=36 and x=42 south to y=112 so Bridge #8 meets dry riverbanks cleanly on both sides
    for (let y = 42; y <= 112; y += 14) {
      const tier: 'main' | 'trail' = y === 42 || y === 70 ? 'main' : 'trail';
      const minX = y === 112 ? 36 : 40;
      for (let x = minX; x <= 110; x++) {
        if (this.tiles[y][x] === 'grass' || this.tiles[y][x] === 'sand') {
          this.carveRoadTile(x, y, tier);
        }
      }
    }
    for (let x = 42; x <= 112; x += 14) {
      const tier: 'main' | 'trail' = x === 42 || x === 70 ? 'main' : 'trail';
      const maxY = x === 42 ? 112 : 110;
      for (let y = 40; y <= maxY; y++) {
        if (this.tiles[y][x] === 'grass' || this.tiles[y][x] === 'sand') {
          this.carveRoadTile(x, y, tier);
        }
      }
    }

    // 10. Natural Narrow Isometric Wooden Bridges across Silverbrook River
    // Main avenues (x=70, y=70) receive grand cedar main bridges; secondary crossings receive rustic oak bridges.
    for (let y = 42; y <= 112; y += 14) {
      const minX = y === 112 ? 36 : 40;
      const bridgeTier: 'main' | 'trail' = y === 70 ? 'main' : 'trail';
      for (let x = minX; x <= 110; x++) {
        if (this.tiles[y][x] === 'water') {
          this.tiles[y][x] = 'bridge';
          this.collisionMap[y][x] = false;
          this.roadTier[y][x] = bridgeTier;
        }
      }
    }
    for (let x = 42; x <= 112; x += 14) {
      const maxY = x === 42 ? 112 : 110;
      const bridgeTier: 'main' | 'trail' = x === 70 ? 'main' : 'trail';
      for (let y = 40; y <= maxY; y++) {
        if (this.tiles[y][x] === 'water') {
          this.tiles[y][x] = 'bridge';
          this.collisionMap[y][x] = false;
          if (this.roadTier[y][x] !== 'main') {
            this.roadTier[y][x] = bridgeTier;
          }
        }
      }
    }

    // 10B. Scenic Wooden Fishing Piers & Lake/River Overlook Platforms
    for (const pier of SCENIC_FISHING_PIERS) {
      for (const [tx, ty] of pier.approachTrailTiles) {
        this.carveRoadTile(tx, ty, 'trail');
      }
      for (const [dx, dy] of pier.deckTiles) {
        if (!this.isTileInBounds(dx, dy)) continue;
        this.tiles[dy][dx] = 'bridge';
        this.collisionMap[dy][dx] = false;
        this.roadTier[dy][dx] = 'trail';
        this.pierTileKeys.add(`${dx}_${dy}`);
      }
    }

    // 11. Structured Agricultural Farmland Plots in Farm District (separated by walkable dirt paths)
    // Stone Well (49,74) & Farmer Thomas (50,74) sit cleanly on an accessible dirt apron just north of Plot 1
    for (let cy = 72; cy <= 75; cy++) {
      for (let cx = 44; cx <= 52; cx++) {
        if (this.tiles[cy][cx] === 'grass') {
          this.carveRoadTile(cx, cy, 'trail');
        }
      }
    }

    for (const plot of FARM_PLOTS) {
      const { minX, minY, maxX, maxY } = plot.bounds;
      // Carve clean 1-tile walkable dirt border paths around each rectangular plot
      for (let py = minY - 1; py <= maxY + 1; py++) {
        for (let px = minX - 1; px <= maxX + 1; px++) {
          if (!this.isTileInBounds(px, py)) continue;
          const isBorder = px === minX - 1 || px === maxX + 1 || py === minY - 1 || py === maxY + 1;
          if (isBorder && this.tiles[py][px] === 'grass') {
            this.carveRoadTile(px, py, 'trail');
          }
        }
      }
      // Fill clean rectangular tilled brown farmland interior
      for (let fy = minY; fy <= maxY; fy++) {
        for (let fx = minX; fx <= maxX; fx++) {
          if (this.isTileInBounds(fx, fy) && this.tiles[fy][fx] !== 'water' && this.tiles[fy][fx] !== 'bridge') {
            this.tiles[fy][fx] = 'farmland';
            this.collisionMap[fy][fx] = false;
            this.roadTier[fy][fx] = 'none';
          }
        }
      }
    }
  }

  /**
   * Determine current zone given tile coordinates
   */
  public getZoneAt(tx: number, ty: number): ZoneDefinition {
    for (const zone of ZONES) {
      if (tx >= zone.minX && tx <= zone.maxX && ty >= zone.minY && ty <= zone.maxY) {
        return zone;
      }
    }
    return ZONES[ZONES.length - 1]; // Default outskirts
  }

  /**
   * Check if tile is in bounds
   */
  public isTileInBounds(tx: number, ty: number): boolean {
    return tx >= 0 && tx < this.width && ty >= 0 && ty < this.height;
  }

  /**
   * Check if a tile can be walked onto
   */
  public isWalkable(tx: number, ty: number): boolean {
    if (!this.isTileInBounds(tx, ty)) return false;
    return !this.collisionMap[ty][tx];
  }

  /**
   * Clamp coordinates to map bounds and find the nearest safe walkable dry/bridge tile
   */
  public findNearestWalkableTile(
    rawX: number,
    rawY: number,
    maxRadius = 24
  ): { tileX: number; tileY: number; snapped: boolean } {
    const safeX = Number.isFinite(rawX) ? Math.max(0, Math.min(this.width - 1, Math.round(rawX))) : 30;
    const safeY = Number.isFinite(rawY) ? Math.max(0, Math.min(this.height - 1, Math.round(rawY))) : 30;

    if (this.isWalkable(safeX, safeY)) {
      return { tileX: safeX, tileY: safeY, snapped: false };
    }

    for (let radius = 1; radius <= maxRadius; radius++) {
      let bestTile: { tileX: number; tileY: number; dist: number } | null = null;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const cx = safeX + dx;
          const cy = safeY + dy;
          if (!this.isWalkable(cx, cy)) continue;
          const dist = Math.hypot(cx - rawX, cy - rawY);
          if (!bestTile || dist < bestTile.dist) {
            bestTile = { tileX: cx, tileY: cy, dist };
          }
        }
      }
      if (bestTile) {
        return { tileX: bestTile.tileX, tileY: bestTile.tileY, snapped: true };
      }
    }

    return { tileX: 30, tileY: 30, snapped: true };
  }

  /**
   * Mark collision for solid objects or buildings
   */
  public setCollision(tx: number, ty: number, solid: boolean): void {
    if (this.isTileInBounds(tx, ty)) {
      this.collisionMap[ty][tx] = solid;
    }
  }

  /**
   * Mark a tile as a protected world prop (e.g., scarecrow, hay bale, town prop)
   */
  public setProtectedProp(tx: number, ty: number, isProtected = true): void {
    const key = `${tx}_${ty}`;
    if (isProtected) {
      this.protectedPropTiles.add(key);
    } else {
      this.protectedPropTiles.delete(key);
    }
  }

  /**
   * Validate whether a single tile belongs to the designated Buildable Zone (Homestead District)
   * and is not a protected road, water, cliff, farmland, town center, or world prop.
   */
  public isTileInBuildableZone(tx: number, ty: number): { allowed: boolean; reason?: string } {
    if (!this.isTileInBounds(tx, ty)) {
      return { allowed: false, reason: 'မြေပုံနယ်နိမိတ်ပြင်ပ ဖြစ်နေပါသည် (Out of bounds)' };
    }

    if (
      tx >= TOWN_PROTECTED_BOUNDS.minX &&
      tx <= TOWN_PROTECTED_BOUNDS.maxX &&
      ty >= TOWN_PROTECTED_BOUNDS.minY &&
      ty <= TOWN_PROTECTED_BOUNDS.maxY
    ) {
      return { allowed: false, reason: 'မြို့လယ်ရွာနှင့် အများပြည်သူနေရာတွင် ဆောက်လုပ်ခွင့်မရှိပါ' };
    }

    if (
      tx < BUILDABLE_ZONE_BOUNDS.minX ||
      tx > BUILDABLE_ZONE_BOUNDS.maxX ||
      ty < BUILDABLE_ZONE_BOUNDS.minY ||
      ty > BUILDABLE_ZONE_BOUNDS.maxY
    ) {
      return {
        allowed: false,
        reason: 'အခြေချရပ်ကွက် (Homestead District: X 40-114, Y 40-114) အတွင်း၌သာ ဆောက်လုပ်နိုင်ပါသည်',
      };
    }

    const tile = this.tiles[ty][tx];
    if (tile === 'water' || tile === 'bridge' || tile === 'cliff') {
      return { allowed: false, reason: 'ရေပြင်၊ တံတား (သို့) ကျောက်ဆောင်ပေါ်တွင် ဆောက်လုပ်၍မရပါ' };
    }
    if (tile === 'dirt') {
      return { allowed: false, reason: 'လမ်းမပေါ်တွင် ဆောက်လုပ်၍မရပါ (မြေကွက်လွတ်ပေါ်တွင် ဆောက်ပါ)' };
    }
    if (tile === 'farmland') {
      return { allowed: false, reason: 'စိုက်ပျိုးမြေကွက်ပေါ်တွင် ဆောက်လုပ်၍မရပါ' };
    }
    if (this.protectedPropTiles.has(`${tx}_${ty}`)) {
      return { allowed: false, reason: 'ရွာပိုင်ပစ္စည်းများ ရှိနေသောနေရာတွင် ဆောက်လုပ်၍မရပါ' };
    }

    return { allowed: true };
  }
}
