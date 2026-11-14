/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BUILDABLE_ZONE_BOUNDS, MAP_CONFIG, TOWN_PROTECTED_BOUNDS, ZONES } from '../constants';
import { TileType, ZoneDefinition } from '../types';

export class MapSystem {
  public width: number;
  public height: number;
  public tiles: TileType[][];
  public collisionMap: boolean[][];
  public roadTier: ('none' | 'main' | 'trail')[][];
  public protectedPropTiles: Set<string>;

  constructor(width = MAP_CONFIG.WIDTH, height = MAP_CONFIG.HEIGHT) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    this.collisionMap = [];
    this.roadTier = [];
    this.protectedPropTiles = new Set();
    this.generateWorld();
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

    // Initialize all as grass
    for (let y = 0; y < this.height; y++) {
      const row: TileType[] = [];
      const colRow: boolean[] = [];
      const tierRow: ('none' | 'main' | 'trail')[] = [];
      for (let x = 0; x < this.width; x++) {
        row.push('grass');
        colRow.push(false);
        tierRow.push('none');
      }
      this.tiles.push(row);
      this.collisionMap.push(colRow);
      this.roadTier.push(tierRow);
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

    // 5. Silverbrook River winding gracefully across Homestead District (South-East)
    // Curves from (114, 54) southwest across homestead zone down to (38, 114)
    for (let t = 0; t <= 100; t++) {
      const prog = t / 100;
      // Parametric gentle serpentine curve
      const rx = Math.floor(114 - prog * 76 + Math.sin(prog * Math.PI * 3) * 5);
      const ry = Math.floor(54 + prog * 60 + Math.cos(prog * Math.PI * 2.5) * 4);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const wx = rx + dx;
          const wy = ry + dy;
          if (this.isTileInBounds(wx, wy)) {
            // River channel
            this.tiles[wy][wx] = 'water';
            this.collisionMap[wy][wx] = true;

            // River sandy banks
            for (let by = -2; by <= 2; by++) {
              for (let bx = -2; bx <= 2; bx++) {
                const sx = wx + bx;
                const sy = wy + by;
                if (this.isTileInBounds(sx, sy) && this.tiles[sy][sx] === 'grass') {
                  this.tiles[sy][sx] = 'sand';
                }
              }
            }
          }
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
    // Primary arteries (42, 70) styled as main roads; secondary block lanes (56, 84, 98) as trails
    for (let y = 42; y <= 112; y += 14) {
      const tier: 'main' | 'trail' = y === 42 || y === 70 ? 'main' : 'trail';
      for (let x = 40; x <= 110; x++) {
        if (this.tiles[y][x] === 'grass' || this.tiles[y][x] === 'sand') {
          this.carveRoadTile(x, y, tier);
        }
      }
    }
    for (let x = 42; x <= 112; x += 14) {
      const tier: 'main' | 'trail' = x === 42 || x === 70 ? 'main' : 'trail';
      for (let y = 40; y <= 110; y++) {
        if (this.tiles[y][x] === 'grass' || this.tiles[y][x] === 'sand') {
          this.carveRoadTile(x, y, tier);
        }
      }
    }

    // 10. Natural Narrow Isometric Wooden Bridges across Silverbrook River
    // Replaces ONLY the single-lane road centerline over water (never blocky 3x3 patches!)
    for (let y = 42; y <= 112; y += 14) {
      for (let x = 40; x <= 110; x++) {
        if (this.tiles[y][x] === 'water') {
          this.tiles[y][x] = 'bridge';
          this.collisionMap[y][x] = false;
          this.roadTier[y][x] = 'main';
        }
      }
    }
    for (let x = 42; x <= 112; x += 14) {
      for (let y = 40; y <= 110; y++) {
        if (this.tiles[y][x] === 'water') {
          this.tiles[y][x] = 'bridge';
          this.collisionMap[y][x] = false;
          this.roadTier[y][x] = 'main';
        }
      }
    }

    // 11. Agricultural Farmland Plots in Homestead District
    for (let fy = 73; fy <= 79; fy++) {
      for (let fx = 45; fx <= 52; fx++) {
        if (this.tiles[fy][fx] === 'grass') {
          this.tiles[fy][fx] = 'farmland';
          this.collisionMap[fy][fx] = false;
        }
      }
    }
    for (let fy = 87; fy <= 93; fy++) {
      for (let fx = 59; fx <= 66; fx++) {
        if (this.tiles[fy][fx] === 'grass') {
          this.tiles[fy][fx] = 'farmland';
          this.collisionMap[fy][fx] = false;
        }
      }
    }
    for (let fy = 73; fy <= 79; fy++) {
      for (let fx = 73; fx <= 80; fx++) {
        if (this.tiles[fy][fx] === 'grass') {
          this.tiles[fy][fx] = 'farmland';
          this.collisionMap[fy][fx] = false;
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
