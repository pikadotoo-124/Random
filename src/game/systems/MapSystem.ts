/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAP_CONFIG, ZONES } from '../constants';
import { TileType, ZoneDefinition } from '../types';

export class MapSystem {
  public width: number;
  public height: number;
  public tiles: TileType[][];
  public collisionMap: boolean[][];

  constructor(width = MAP_CONFIG.WIDTH, height = MAP_CONFIG.HEIGHT) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    this.collisionMap = [];
    this.generateWorld();
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
   * Generates the 60x60 world map with distinct, well-placed zones
   */
  private generateWorld(): void {
    this.tiles = [];
    this.collisionMap = [];

    // Initialize all as grass
    for (let y = 0; y < this.height; y++) {
      const row: TileType[] = [];
      const colRow: boolean[] = [];
      for (let x = 0; x < this.width; x++) {
        row.push('grass');
        colRow.push(false);
      }
      this.tiles.push(row);
      this.collisionMap.push(colRow);
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

    // 6. Central Plaza (Center: tx 24..36, ty 24..36) - Preserved exactly!
    for (let y = 23; y <= 37; y++) {
      for (let x = 23; x <= 37; x++) {
        if (x === 30 || y === 30 || (x >= 27 && x <= 33 && y >= 27 && y <= 33)) {
          this.tiles[y][x] = 'cobble';
        } else if ((x === 25 || x === 35) && y >= 25 && y <= 35) {
          this.tiles[y][x] = 'dirt';
        } else {
          this.tiles[y][x] = 'wood_floor';
        }
        this.collisionMap[y][x] = false;
      }
    }

    // 7. Main City Paths connecting outward
    // Path North through Mountain Pass
    for (let y = 0; y < 24; y++) {
      this.tiles[y][30] = 'dirt';
      this.tiles[y][31] = 'dirt';
      this.collisionMap[y][30] = false;
      this.collisionMap[y][31] = false;
    }
    // Path South to Homesteads & Lake
    for (let y = 37; y < 112; y++) {
      this.tiles[y][30] = 'dirt';
      this.tiles[y][31] = 'dirt';
      this.collisionMap[y][30] = false;
      this.collisionMap[y][31] = false;
    }
    // Path West to Lake Shore
    for (let x = 8; x < 24; x++) {
      this.tiles[30][x] = 'dirt';
      this.tiles[31][x] = 'dirt';
      this.collisionMap[30][x] = false;
      this.collisionMap[31][x] = false;
    }
    // Path East to Whispering Forest & Mountain Foot
    for (let x = 37; x < 112; x++) {
      this.tiles[30][x] = 'dirt';
      this.tiles[31][x] = 'dirt';
      this.collisionMap[30][x] = false;
      this.collisionMap[31][x] = false;
    }

    // 8. Secondary scenic winding nature trails
    // Northeast trail to alpine pass
    for (let d = 38; d <= 92; d++) {
      const tx = d;
      const ty = Math.floor(25 + Math.sin(d * 0.12) * 3);
      if (this.isTileInBounds(tx, ty) && this.tiles[ty][tx] === 'grass') {
        this.tiles[ty][tx] = 'dirt';
        this.collisionMap[ty][tx] = false;
      }
    }

    // Trail connecting to Quarry Mountain Pass at x: 60..62
    for (let py = 0; py <= 25; py++) {
      const px = Math.floor(61 + Math.sin(py * 0.2) * 1.5);
      if (this.isTileInBounds(px, py) && this.tiles[py][px] !== 'water') {
        this.tiles[py][px] = 'dirt';
        this.collisionMap[py][px] = false;
      }
    }

    // 9. Homestead District clearing roads (Southeast: x: 42..112, y: 42..112)
    for (let y = 42; y <= 112; y += 14) {
      for (let x = 40; x <= 110; x++) {
        if (this.tiles[y][x] === 'grass' || this.tiles[y][x] === 'sand') {
          this.tiles[y][x] = 'dirt';
          this.collisionMap[y][x] = false;
        }
      }
    }
    for (let x = 42; x <= 112; x += 14) {
      for (let y = 40; y <= 110; y++) {
        if (this.tiles[y][x] === 'grass' || this.tiles[y][x] === 'sand') {
          this.tiles[y][x] = 'dirt';
          this.collisionMap[y][x] = false;
        }
      }
    }

    // 10. Sturdy Wooden Bridges across Silverbrook River
    // Places walkable bridges wherever the homestead roads intersect river water
    for (let y = 42; y <= 112; y += 14) {
      for (let x = 40; x <= 110; x++) {
        if (this.tiles[y][x] === 'water') {
          // Cross-plank bridge across road width
          for (let by = -1; by <= 1; by++) {
            for (let bx = -1; bx <= 1; bx++) {
              const nx = x + bx;
              const ny = y + by;
              if (this.isTileInBounds(nx, ny) && (this.tiles[ny][nx] === 'water' || this.tiles[ny][nx] === 'sand')) {
                this.tiles[ny][nx] = 'bridge';
                this.collisionMap[ny][nx] = false; // Walkable bridge!
              }
            }
          }
        }
      }
    }
    for (let x = 42; x <= 112; x += 14) {
      for (let y = 40; y <= 110; y++) {
        if (this.tiles[y][x] === 'water') {
          for (let by = -1; by <= 1; by++) {
            for (let bx = -1; bx <= 1; bx++) {
              const nx = x + bx;
              const ny = y + by;
              if (this.isTileInBounds(nx, ny) && (this.tiles[ny][nx] === 'water' || this.tiles[ny][nx] === 'sand')) {
                this.tiles[ny][nx] = 'bridge';
                this.collisionMap[ny][nx] = false;
              }
            }
          }
        }
      }
    }

    // 11. Agricultural Farmland Plots in Homestead District
    // Plot 1: North Homestead Farm (tx: 45..52, ty: 73..79)
    for (let fy = 73; fy <= 79; fy++) {
      for (let fx = 45; fx <= 52; fx++) {
        if (this.tiles[fy][fx] === 'grass') {
          this.tiles[fy][fx] = 'farmland';
          this.collisionMap[fy][fx] = false;
        }
      }
    }
    // Plot 2: Riverbank Farm Plot (tx: 59..66, ty: 87..93)
    for (let fy = 87; fy <= 93; fy++) {
      for (let fx = 59; fx <= 66; fx++) {
        if (this.tiles[fy][fx] === 'grass') {
          this.tiles[fy][fx] = 'farmland';
          this.collisionMap[fy][fx] = false;
        }
      }
    }
    // Plot 3: East Orchard Farm Plot (tx: 73..80, ty: 73..79)
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
}
