/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Phaser from 'phaser';
import { AUNTY_GYI_CATALOG } from '../constants';
import { ClothingSystem } from '../systems/ClothingSystem';
import { ClothingRenderer } from './ClothingRenderer';

/**
 * Modern Stylized 2D Texture Generator
 * Produces vibrant, organic, clean top-down/isometric nature tiles,
 * expressive stylized characters, animals, and charming town architecture.
 */
export class PixelArtGenerator {
  public static generateAll(scene: Phaser.Scene): void {
    const textures = scene.textures;

    // 1. High-Detail Stardew-Inspired Ground Tiles, Seamless Transitions & Curved Bezier Roads
    this.createGrassTiles(textures);
    this.createCobbleTiles(textures);
    this.createWaterTiles(textures);
    this.createTerrainTransitionOverlays(textures);
    this.createSandTiles(textures);
    this.createDirtTiles(textures);
    this.createCliffTiles(textures);
    this.createFarmlandTile(textures);
    this.createBridgeTile(textures);
    this.createWoodFloorTile(textures);
    this.createGridHighlight(textures);
    this.createShadowTexture(textures);

    // 2. High-Fidelity Nature, Mountains & Resource Sprites
    this.createTreeSprite(textures);
    this.createPineTreeSprite(textures);
    this.createBirchTreeSprite(textures);
    this.createPhase2EnvironmentSprites(textures);
    this.createMountainSprites(textures);
    this.createRockSprite(textures);
    this.createBushSprite(textures);
    this.createHarvestGrassSprite(textures);
    this.createAnimalSprites(textures);
    this.createFishNodeSprite(textures);
    this.createWaterEnvironmentSprites(textures);

    // 3. Buildings & Town Landmarks (Upgraded Scale & Architectural Proportion)
    this.createHouseSprite(textures);
    this.createMediumHouseSprite(textures);
    this.createLargeHouseSprite(textures);
    this.createFenceSprite(textures);
    this.createCampfireSprites(textures);
    this.createStorageBoxSprite(textures);
    this.createLanternSprite(textures);
    this.createShopStallSprite(textures);
    this.createCraftingBenchSprite(textures);
    this.createFountainSprite(textures);
    this.createTownPropsAndBuildings(textures);
    this.createVillageShopBuildings(textures);
    this.createFarmEnvironmentSprites(textures);

    // 4. Stylized 2D Characters & NPCs (2x Resolution 64x88 frames, 4 directions x 4 steps: idle, left, right, breath)
    this.createCharacterSpritesheet(textures, 'player_male', '#e08e45', '#1c1917', '#2563eb', 'male', 'player');
    this.createCharacterSpritesheet(textures, 'player_female', '#f2a65a', '#7c2d12', '#059669', 'female', 'player');
    this.createCharacterSpritesheet(textures, 'npc_merchant', '#e8a258', '#451a03', '#7c3aed', 'male', 'merchant');
    this.createCharacterSpritesheet(textures, 'npc_settler', '#f2b866', '#1e293b', '#d97706', 'female', 'settler');
    this.createCharacterSpritesheet(textures, 'npc_elder', '#d9a473', '#e2e8f0', '#0f766e', 'male', 'elder');
    this.createCharacterSpritesheet(textures, 'npc_blacksmith', '#d97f3e', '#451a03', '#991b1b', 'male', 'blacksmith');
    this.createCharacterSpritesheet(textures, 'npc_florist', '#f5ae68', '#78350f', '#ec4899', 'female', 'florist');
    this.createCharacterSpritesheet(textures, 'npc_baker', '#f3b76a', '#b45309', '#f59e0b', 'female', 'baker');
    this.createCharacterSpritesheet(textures, 'npc_grocer', '#efaa62', '#78350f', '#16a34a', 'female', 'grocer');
    this.createCharacterSpritesheet(textures, 'npc_farmer', '#d98845', '#713f12', '#15803d', 'male', 'farmer');
    this.createClothingSpritesheets(textures);

    // 5. Environmental Particles & Step 5/6/7 Atmosphere, Wildlife, Landmarks & Zone Composition
    this.createParticleTextures(textures);
    this.createAtmosphereTextures(textures);
    this.createWildlifeAndNatureFxTextures(textures);
    this.createStep7CompositionTextures(textures);
    this.createStep14ScenicProps(textures);
    this.createActionToolAndParticleSprites(textures);
  }

  // Draw smooth seamless isometric diamond without perimeter outline or skirt seams
  private static drawIsoDiamond(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    fillColor: string,
    edgeColor?: string
  ) {
    const hw = w / 2;
    const hh = h / 2;

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(hw, 0);
    ctx.lineTo(w, hh);
    ctx.lineTo(hw, h);
    ctx.lineTo(0, hh);
    ctx.closePath();
    ctx.fill();

    if (edgeColor && edgeColor !== fillColor) {
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }
  }

  // Clip canvas strictly inside 64x32 isometric diamond so overlays never bleed into neighbor tiles
  private static clipIsoDiamond(ctx: CanvasRenderingContext2D, w = 64, h = 32) {
    const hw = w / 2;
    const hh = h / 2;
    ctx.beginPath();
    ctx.moveTo(hw, 0);
    ctx.lineTo(w, hh);
    ctx.lineTo(hw, h);
    ctx.lineTo(0, hh);
    ctx.closePath();
    ctx.clip();
  }

  // Apply 2:1 isometric grid transform (u, v in [0..32] -> canvas 64x32)
  private static setIsoUVTransform(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(1, 0.5, -1, 0.5, 32, 0);
  }

  // Soft layered ambient + contact drop shadow texture
  private static createShadowTexture(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('shadow_round')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 24;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(24, 12, 1, 24, 12, 22);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.56)');
    grad.addColorStop(0.42, 'rgba(15, 23, 42, 0.36)');
    grad.addColorStop(0.75, 'rgba(15, 23, 42, 0.14)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(24, 12, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(2, 6, 23, 0.25)';
    ctx.beginPath();
    ctx.ellipse(24, 12.2, 10, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();

    textures.addCanvas('shadow_round', canvas);
  }

  // 1. Lush Stardew-Inspired Organic Grass Tiles (8 detailed variants sharing unified #5b9436 rim)
  private static createGrassTiles(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_grass_0')) return;

    const rimGrass = '#5b9436';

    const drawBaseGrass = (ctx: CanvasRenderingContext2D, tintCenter?: string, seed = 0) => {
      this.drawIsoDiamond(ctx, 64, 32, rimGrass);
      if (tintCenter) {
        ctx.fillStyle = tintCenter;
        ctx.beginPath();
        ctx.ellipse(32, 16, 22, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Varied soft depth stipples & moss flecks inside diamond
      const s = seed * 7;
      ctx.fillStyle = '#4c812a';
      ctx.fillRect(22 + (s % 5), 11 + (s % 3), 2, 1);
      ctx.fillRect(36 + (s % 4), 18 + (s % 3), 2, 1);
      ctx.fillRect(28 + (s % 6), 21 - (s % 3), 2, 1);
      ctx.fillStyle = '#6ea942';
      ctx.fillRect(31 - (s % 5), 14 + (s % 3), 2, 1);
      ctx.fillRect(20 + (s % 4), 17 - (s % 2), 2, 1);
    };

    const drawTuft = (ctx: CanvasRenderingContext2D, bx: number, by: number, tall = false) => {
      ctx.fillStyle = '#477627';
      ctx.fillRect(bx - 1, by + 1, 3, 1);
      ctx.fillStyle = '#7fc04a';
      ctx.fillRect(bx, by - (tall ? 2 : 1), 1, tall ? 3 : 2);
      ctx.fillRect(bx + 1, by - 1, 1, 2);
      ctx.fillRect(bx - 1, by, 1, 1);
      if (tall) {
        ctx.fillStyle = '#99d35c';
        ctx.fillRect(bx, by - 2, 1, 1);
      }
    };

    // Variant 0: Calm Spring Meadow with multi-height grass blades
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      drawBaseGrass(ctx, '#619b39', 0);
      drawTuft(ctx, 25, 13, true);
      drawTuft(ctx, 40, 14, false);
      drawTuft(ctx, 30, 21, true);
      drawTuft(ctx, 19, 17, false);
      textures.addCanvas('tile_grass_0', canvas);
      textures.addCanvas('tile_grass', canvas);
    }

    // Variant 1: Meadow with three-leaf clover clusters & moss
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      drawBaseGrass(ctx, '#568e32', 1);

      for (const [cx, cy] of [[25, 14], [39, 18], [22, 19], [34, 11]]) {
        ctx.fillStyle = '#437025';
        ctx.fillRect(cx, cy + 1, 1, 2);
        ctx.fillStyle = '#82bf4b';
        ctx.fillRect(cx - 2, cy - 1, 2, 2);
        ctx.fillRect(cx + 1, cy - 1, 2, 2);
        ctx.fillRect(cx - 1, cy - 3, 2, 2);
      }
      textures.addCanvas('tile_grass_1', canvas);
    }

    // Variant 2: Wildflower Meadow (buttercups, daisies & periwinkle)
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      drawBaseGrass(ctx, '#609a38', 2);
      drawTuft(ctx, 26, 20, false);

      ctx.fillStyle = '#467427';
      ctx.fillRect(31, 14, 1, 2);
      ctx.fillRect(42, 18, 1, 2);
      ctx.fillRect(21, 17, 1, 2);

      ctx.fillStyle = '#fef08a';
      ctx.fillRect(30, 12, 3, 2);
      ctx.fillRect(31, 11, 1, 4);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(31, 13, 1, 1);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(20, 15, 3, 2);
      ctx.fillRect(21, 14, 1, 3);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(21, 15, 1, 1);

      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(41, 16, 3, 2);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(42, 16, 1, 1);

      textures.addCanvas('tile_grass_2', canvas);
    }

    // Variant 3: Warm Sunlit Dappled Moss Clearing
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      drawBaseGrass(ctx, '#69a43e', 3);

      ctx.fillStyle = '#7bb948';
      ctx.beginPath();
      ctx.ellipse(32, 16, 13, 5.8, 0, 0, Math.PI * 2);
      ctx.fill();

      drawTuft(ctx, 28, 15, true);
      drawTuft(ctx, 37, 18, false);
      ctx.fillStyle = '#a3db65';
      ctx.fillRect(32, 12, 2, 1);

      textures.addCanvas('tile_grass_3', canvas);
    }

    // Variant 4: Woodland Moss & Warm Fallen Leaf Patch
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      drawBaseGrass(ctx, '#538a30', 4);

      ctx.fillStyle = '#6da640';
      ctx.fillRect(23, 14, 4, 2);
      ctx.fillRect(36, 13, 4, 2);
      drawTuft(ctx, 20, 16, false);

      ctx.fillStyle = '#c26018';
      ctx.fillRect(29, 19, 2, 1.5);
      ctx.fillRect(41, 17, 2, 1.5);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(30, 19, 1, 1);
      ctx.fillRect(34, 11, 2, 1);

      textures.addCanvas('tile_grass_4', canvas);
    }

    // Variant 5: Meadow with Smooth Pebbles & Tall Blades
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      drawBaseGrass(ctx, '#5e9737', 5);

      ctx.fillStyle = '#78716c';
      ctx.fillRect(26, 17, 3, 2);
      ctx.fillStyle = '#a8a29e';
      ctx.fillRect(26, 17, 2, 1);
      ctx.fillStyle = '#78716c';
      ctx.fillRect(38, 13, 2, 1.5);
      ctx.fillRect(22, 14, 2, 1);

      drawTuft(ctx, 34, 20, true);
      drawTuft(ctx, 42, 17, true);

      textures.addCanvas('tile_grass_5', canvas);
    }

    // Variant 6: Deep Emerald-Sage Meadow Turf with Shaded Blade Clusters
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      drawBaseGrass(ctx, '#4f852e', 6);

      ctx.fillStyle = '#447525';
      ctx.beginPath();
      ctx.ellipse(30, 17, 10, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      drawTuft(ctx, 26, 16, true);
      drawTuft(ctx, 35, 13, true);
      drawTuft(ctx, 38, 20, false);

      textures.addCanvas('tile_grass_6', canvas);
    }

    // Variant 7: Meadow Herbs & Tiny Pink/Lavender Clover Blossoms
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      drawBaseGrass(ctx, '#639e3b', 7);

      drawTuft(ctx, 23, 15, false);
      drawTuft(ctx, 37, 19, true);

      // Tiny pink & lavender meadow clover buds
      ctx.fillStyle = '#f472b6';
      ctx.fillRect(29, 13, 2, 2);
      ctx.fillStyle = '#fbcfe8';
      ctx.fillRect(29, 13, 1, 1);

      ctx.fillStyle = '#c084fc';
      ctx.fillRect(40, 14, 2, 2);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(32, 20, 2, 1);

      textures.addCanvas('tile_grass_7', canvas);
    }
  }

  // 2. Warm Hand-Laid Cobblestone Pavers (4 non-repetitive variants)
  private static createCobbleTiles(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_cobble_0')) return;

    const mortarColor = '#585148';

    const drawStones = (
      ctx: CanvasRenderingContext2D,
      stones: Array<{ x: number; y: number; rx: number; ry: number; col: string }>,
      mossPositions: Array<[number, number]>
    ) => {
      for (const s of stones) {
        ctx.fillStyle = '#3f3a33';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + 0.9, s.rx + 0.5, s.ry + 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = s.col;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(254, 249, 235, 0.25)';
        ctx.beginPath();
        ctx.ellipse(s.x - 1, s.y - 0.8, s.rx * 0.55, s.ry * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();

        // Subtle chisel grain pixel on larger stones
        if (s.rx >= 6.4) {
          ctx.fillStyle = 'rgba(41, 37, 36, 0.28)';
          ctx.fillRect(Math.round(s.x), Math.round(s.y + 0.5), 2, 1);
        }
      }
      for (const [mx, my] of mossPositions) {
        ctx.fillStyle = '#658f38';
        ctx.fillRect(mx, my, 2, 1);
      }
    };

    const variants: Array<{
      stones: Array<{ x: number; y: number; rx: number; ry: number; col: string }>;
      moss: Array<[number, number]>;
    }> = [
      {
        stones: [
          { x: 32, y: 7, rx: 6.5, ry: 3.2, col: '#8a8275' },
          { x: 20, y: 13, rx: 6, ry: 3, col: '#999082' },
          { x: 44, y: 13, rx: 6, ry: 3, col: '#7d7569' },
          { x: 32, y: 16, rx: 7.5, ry: 3.8, col: '#9e9587' },
          { x: 15, y: 18, rx: 5, ry: 2.6, col: '#827a6e' },
          { x: 49, y: 18, rx: 5, ry: 2.6, col: '#8c8477' },
          { x: 25, y: 23, rx: 6, ry: 3, col: '#7b7367' },
          { x: 39, y: 23, rx: 6, ry: 3, col: '#948b7e' },
        ],
        moss: [[31, 19], [23, 15]],
      },
      {
        stones: [
          { x: 32, y: 8, rx: 6, ry: 3, col: '#847c6f' },
          { x: 18, y: 12, rx: 5.5, ry: 2.8, col: '#968d7f' },
          { x: 46, y: 12, rx: 5.8, ry: 2.8, col: '#8a8275' },
          { x: 28, y: 16, rx: 6.8, ry: 3.4, col: '#9c9385' },
          { x: 41, y: 17, rx: 5.8, ry: 2.9, col: '#7f776b' },
          { x: 19, y: 21, rx: 5, ry: 2.5, col: '#766e62' },
          { x: 34, y: 23, rx: 6.8, ry: 3.3, col: '#91887b' },
          { x: 46, y: 21, rx: 5.2, ry: 2.6, col: '#867e71' },
        ],
        moss: [[36, 13], [27, 21]],
      },
      {
        stones: [
          { x: 29, y: 7, rx: 5.8, ry: 2.9, col: '#968d80' },
          { x: 40, y: 10, rx: 5.5, ry: 2.7, col: '#80786c' },
          { x: 18, y: 13, rx: 5.8, ry: 2.9, col: '#898174' },
          { x: 31, y: 15, rx: 6.4, ry: 3.2, col: '#a39a8c' },
          { x: 46, y: 15, rx: 6, ry: 3, col: '#8c8376' },
          { x: 23, y: 20, rx: 6.5, ry: 3.2, col: '#91887b' },
          { x: 38, y: 21, rx: 6.2, ry: 3.1, col: '#7c7468' },
          { x: 31, y: 25, rx: 5.2, ry: 2.6, col: '#8a8275' },
        ],
        moss: [[34, 10], [42, 19]],
      },
      {
        stones: [
          { x: 33, y: 8, rx: 6.8, ry: 3.2, col: '#8f877a' },
          { x: 21, y: 11, rx: 5.2, ry: 2.6, col: '#827a6d' },
          { x: 45, y: 13, rx: 5.8, ry: 2.9, col: '#999082' },
          { x: 26, y: 16, rx: 6.5, ry: 3.2, col: '#9a9183' },
          { x: 39, y: 17, rx: 6.2, ry: 3.1, col: '#867e71' },
          { x: 16, y: 17, rx: 4.8, ry: 2.4, col: '#7d7569' },
          { x: 30, y: 23, rx: 7, ry: 3.4, col: '#958c7f' },
          { x: 45, y: 21, rx: 5, ry: 2.5, col: '#797165' },
        ],
        moss: [[20, 17], [37, 23]],
      },
    ];

    variants.forEach((v, idx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, mortarColor);
      drawStones(ctx, v.stones, v.moss);
      textures.addCanvas(`tile_cobble_${idx}`, canvas);
      if (idx === 0) textures.addCanvas('tile_cobble', canvas);
    });
  }

  // 3. Stardew-Inspired Serene Crystal Water (Shallow, Mid, Deep + Emerald Glade Depth Gradient & Sky Reflections)
  private static createWaterTiles(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_water_0')) return;

    const makeWaterTile = (
      key: string,
      opts: {
        base: string;
        caustic: string;
        ripple: string;
        glint: string;
        skyStreak?: string;
        style: 0 | 1 | 2;
      }
    ) => {
      if (textures.exists(key)) return;
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      ctx.save();
      this.clipIsoDiamond(ctx);
      this.drawIsoDiamond(ctx, 64, 32, opts.base);

      // Soft organic underwater caustic / depth pool
      ctx.fillStyle = opts.caustic;
      ctx.beginPath();
      ctx.ellipse(32 + (opts.style - 1) * 2, 16, 18, 7.5, opts.style === 1 ? 0.08 : -0.06, 0, Math.PI * 2);
      ctx.fill();

      // Gentle diagonal sky-light reflection wash (matching top-left sunlight)
      if (opts.skyStreak) {
        ctx.fillStyle = opts.skyStreak;
        ctx.beginPath();
        ctx.ellipse(26 + opts.style * 3, 13, 11, 3.2, -0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      // Soft broken water ripple waves
      ctx.strokeStyle = opts.ripple;
      ctx.lineWidth = 1.15;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (opts.style === 0) {
        ctx.moveTo(19, 12);
        ctx.quadraticCurveTo(28, 10, 36, 11.8);
        ctx.moveTo(27, 19);
        ctx.quadraticCurveTo(36, 17.2, 46, 19);
      } else if (opts.style === 1) {
        ctx.moveTo(22, 14);
        ctx.quadraticCurveTo(32, 12, 42, 14);
        ctx.moveTo(17, 20);
        ctx.quadraticCurveTo(25, 18.4, 33, 20);
      } else {
        ctx.moveTo(24, 11.5);
        ctx.quadraticCurveTo(33, 9.8, 43, 12);
        ctx.moveTo(21, 18.5);
        ctx.quadraticCurveTo(31, 16.5, 41, 18.5);
      }
      ctx.stroke();

      // Subtle sun sparkles
      ctx.fillStyle = opts.glint;
      ctx.fillRect(28 + opts.style * 3, 12, 2, 1);
      ctx.fillRect(38 - opts.style * 4, 17 + (opts.style % 2), 2, 1);
      ctx.restore();
      textures.addCanvas(key, canvas);
    };

    // Mid-depth serene cerulean water
    makeWaterTile('tile_water_0', {
      base: '#1f88b4',
      caustic: 'rgba(22, 118, 160, 0.55)',
      ripple: 'rgba(125, 211, 252, 0.58)',
      glint: 'rgba(224, 242, 254, 0.78)',
      skyStreak: 'rgba(186, 230, 253, 0.16)',
      style: 0,
    });
    if (!textures.exists('tile_water')) {
      textures.addCanvas('tile_water', textures.get('tile_water_0').getSourceImage() as HTMLCanvasElement);
    }
    makeWaterTile('tile_water_1', {
      base: '#218eba',
      caustic: 'rgba(42, 159, 204, 0.42)',
      ripple: 'rgba(165, 226, 252, 0.55)',
      glint: 'rgba(240, 249, 255, 0.78)',
      skyStreak: 'rgba(186, 230, 253, 0.14)',
      style: 1,
    });

    // Shallow shore-adjacent crystal turquoise water
    makeWaterTile('tile_water_shallow_0', {
      base: '#2ba1cb',
      caustic: 'rgba(103, 232, 249, 0.24)',
      ripple: 'rgba(186, 230, 253, 0.65)',
      glint: 'rgba(240, 249, 255, 0.85)',
      skyStreak: 'rgba(224, 242, 254, 0.20)',
      style: 0,
    });
    makeWaterTile('tile_water_shallow_1', {
      base: '#299bc5',
      caustic: 'rgba(94, 234, 212, 0.20)',
      ripple: 'rgba(186, 230, 253, 0.60)',
      glint: 'rgba(240, 249, 255, 0.80)',
      skyStreak: 'rgba(224, 242, 254, 0.18)',
      style: 2,
    });

    // Deep open lake center rich indigo-cerulean water
    makeWaterTile('tile_water_deep_0', {
      base: '#166e97',
      caustic: 'rgba(15, 86, 126, 0.62)',
      ripple: 'rgba(94, 194, 230, 0.45)',
      glint: 'rgba(186, 230, 253, 0.65)',
      skyStreak: 'rgba(125, 211, 252, 0.12)',
      style: 1,
    });
    makeWaterTile('tile_water_deep_1', {
      base: '#156a92',
      caustic: 'rgba(12, 74, 110, 0.58)',
      ripple: 'rgba(125, 211, 252, 0.42)',
      glint: 'rgba(186, 230, 253, 0.62)',
      skyStreak: 'rgba(125, 211, 252, 0.10)',
      style: 2,
    });

    // Emerald Glade Woodland Lake (Shallow, Mid, Deep)
    makeWaterTile('tile_water_2', {
      base: '#177a94',
      caustic: 'rgba(17, 100, 122, 0.56)',
      ripple: 'rgba(94, 234, 212, 0.52)',
      glint: 'rgba(204, 251, 241, 0.78)',
      skyStreak: 'rgba(153, 246, 228, 0.15)',
      style: 2,
    });
    makeWaterTile('tile_water_glade_shallow', {
      base: '#1f8fa8',
      caustic: 'rgba(94, 234, 212, 0.25)',
      ripple: 'rgba(153, 246, 228, 0.60)',
      glint: 'rgba(240, 253, 250, 0.82)',
      skyStreak: 'rgba(204, 251, 241, 0.18)',
      style: 0,
    });
    makeWaterTile('tile_water_glade_deep', {
      base: '#115e75',
      caustic: 'rgba(11, 74, 94, 0.62)',
      ripple: 'rgba(45, 212, 191, 0.44)',
      glint: 'rgba(153, 246, 228, 0.62)',
      skyStreak: 'rgba(94, 234, 212, 0.10)',
      style: 1,
    });
  }

  // 3B. Seamless Biome Transitions & Curved Shoreline Overlay Suite
  // Uses true affine (u, v) in [0..32] isometric space so scalloped shores, coves,
  // headlands, grassy overhangs, cobble curbs, and cliff ledges curve smoothly across tile edges!
  private static createTerrainTransitionOverlays(textures: Phaser.Textures.TextureManager) {
    const makeCanvas = (key: string, drawFn: (ctx: CanvasRenderingContext2D) => void) => {
      if (textures.exists(key)) return;
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      ctx.save();
      this.clipIsoDiamond(ctx);
      drawFn(ctx);
      ctx.restore();
      textures.addCanvas(key, canvas);
    };

    // Helper: draw wavy/scalloped strip in (u,v) space along an edge (edgeDir: 'nw'|'ne'|'se'|'sw')
    // In (u,v): nw is u=0 (v: 0->32, inward +u), ne is v=0 (u: 0->32, inward +v),
    // se is u=32 (v: 0->32, inward -u), sw is v=32 (u: 0->32, inward -v).
    const traceEdgeBand = (
      ctx: CanvasRenderingContext2D,
      dir: 'nw' | 'ne' | 'se' | 'sw',
      baseDepth: number,
      waveAmp: number,
      wavePhase = 0
    ) => {
      const steps = 12;
      ctx.beginPath();
      const pt = (t: number, d: number): [number, number] => {
        const s = t * 32;
        if (dir === 'nw') return [d, s];
        if (dir === 'ne') return [s, d];
        if (dir === 'se') return [32 - d, s];
        return [s, 32 - d];
      };
      const [sx, sy] = pt(0, -1);
      const [ex, ey] = pt(1, -1);
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      for (let i = steps; i >= 0; i--) {
        const t = i / steps;
        const wave = Math.sin(t * Math.PI * 3 + wavePhase) * waveAmp + Math.cos(t * Math.PI * 5) * (waveAmp * 0.4);
        const [wx, wy] = pt(t, Math.max(0.4, baseDepth + wave));
        ctx.lineTo(wx, wy);
      }
      ctx.closePath();
    };

    // Helper: inner concave cove arc bridging two adjacent land edges around a corner (n|e|s|w)
    const traceConcaveCove = (
      ctx: CanvasRenderingContext2D,
      corner: 'n' | 'e' | 's' | 'w',
      radius: number
    ) => {
      const cx = corner === 'n' || corner === 'w' ? 0 : 32;
      const cy = corner === 'n' || corner === 'e' ? 0 : 32;
      const ax = corner === 'n' || corner === 's' ? 0 : 32;
      const ay = corner === 'n' || corner === 'e' ? 0 : 32;
      // Corner vertex (vx, vy), points along edge1 and edge2 at distance `radius`
      const vx = corner === 'e' || corner === 's' ? 32 : 0;
      const vy = corner === 's' || corner === 'w' ? 32 : 0;
      const dx = vx === 0 ? 1 : -1;
      const dy = vy === 0 ? 1 : -1;
      void cx; void cy; void ax; void ay;
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(vx + dx * radius, vy);
      ctx.quadraticCurveTo(vx + dx * (radius * 0.35), vy + dy * (radius * 0.35), vx, vy + dy * radius);
      ctx.closePath();
    };

    // Helper: outer convex rounded tip around a corner vertex
    const traceConvexTip = (
      ctx: CanvasRenderingContext2D,
      corner: 'n' | 'e' | 's' | 'w',
      radius: number
    ) => {
      const vx = corner === 'e' || corner === 's' ? 32 : 0;
      const vy = corner === 's' || corner === 'w' ? 32 : 0;
      ctx.beginPath();
      ctx.arc(vx, vy, radius, 0, Math.PI * 2);
    };

    // --- 1. NATURAL CURVED SHORELINES (Non-Uniform Lapping Foam vs Calm Glassy Edges, Pebbles, Turquoise Shallows) ---
    const dirs = ['nw', 'ne', 'se', 'sw'] as const;
    const corners = ['n', 'e', 's', 'w'] as const;

    const pMap: Record<'nw' | 'ne' | 'se' | 'sw', Array<[number, number, number]>> = {
      nw: [[25, 6, 3], [18, 10, 2], [11, 13, 3], [29, 4, 2]],
      ne: [[39, 6, 3], [46, 10, 2], [53, 13, 3], [35, 4, 2]],
      se: [[53, 19, 3], [46, 22, 2], [39, 26, 3], [36, 28, 2]],
      sw: [[11, 19, 3], [18, 22, 2], [25, 26, 3], [28, 28, 2]],
    };

    for (const kind of ['sand', 'grass'] as const) {
      const lipColor = kind === 'sand' ? '#dfc07c' : '#5b9436';
      const wetColor = kind === 'sand' ? 'rgba(176, 138, 78, 0.86)' : 'rgba(130, 114, 72, 0.85)';

      for (const dir of dirs) {
        // Variant A: Organic gentle broken foam wash
        makeCanvas(`fx_shore_${kind}_${dir}`, (ctx) => {
          this.setIsoUVTransform(ctx);
          traceEdgeBand(ctx, dir, 7.6, 1.4, 0.6);
          ctx.fillStyle = 'rgba(103, 232, 249, 0.30)';
          ctx.fill();

          traceEdgeBand(ctx, dir, 4.9, 1.15, 1.8);
          ctx.fillStyle = 'rgba(224, 242, 254, 0.42)';
          ctx.fill();

          traceEdgeBand(ctx, dir, 3.6, 0.85, 0.2);
          ctx.fillStyle = wetColor;
          ctx.fill();

          traceEdgeBand(ctx, dir, 2.3, 0.65, 2.1);
          ctx.fillStyle = lipColor;
          ctx.fill();

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = 'rgba(248, 250, 252, 0.82)';
          // Broken natural foam flecks (skip every 3rd for irregular rhythm)
          pMap[dir].forEach(([fx, fy, fw], i) => {
            if (i !== 2) ctx.fillRect(fx, fy, fw, 1.4);
          });

          if (kind === 'grass') {
            ctx.fillStyle = '#7ec249';
            for (const [fx, fy] of pMap[dir]) {
              ctx.fillRect(fx - 1, fy - 2, 1.5, 2);
            }
          } else {
            ctx.fillStyle = '#8c7456';
            const [px, py] = pMap[dir][1];
            ctx.fillRect(px, py - 1, 2, 1.5);
          }
        });

        // Variant B: Calm glassy shallow bank (no white foam ribbon — just clear turquoise shallows & wet bank)
        makeCanvas(`fx_shore_calm_${kind}_${dir}`, (ctx) => {
          this.setIsoUVTransform(ctx);
          traceEdgeBand(ctx, dir, 6.8, 1.1, 2.2);
          ctx.fillStyle = 'rgba(103, 232, 249, 0.24)';
          ctx.fill();

          traceEdgeBand(ctx, dir, 4.0, 0.9, 0.5);
          ctx.fillStyle = wetColor;
          ctx.fill();

          traceEdgeBand(ctx, dir, 2.4, 0.7, 2.4);
          ctx.fillStyle = lipColor;
          ctx.fill();

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          if (kind === 'grass') {
            ctx.fillStyle = '#7ec249';
            for (const [fx, fy] of pMap[dir]) {
              ctx.fillRect(fx, fy - 2, 1.5, 2.2);
            }
          } else {
            ctx.fillStyle = '#9c8364';
            const [px, py] = pMap[dir][0];
            const [qx, qy] = pMap[dir][2];
            ctx.fillRect(px, py - 1, 2.5, 1.5);
            ctx.fillRect(qx, qy - 1, 2, 1.5);
          }
        });
      }

      // Concave Rounded Lagoon Coves (Foamy & Calm)
      for (const corner of corners) {
        makeCanvas(`fx_shore_in_${kind}_${corner}`, (ctx) => {
          this.setIsoUVTransform(ctx);
          traceConcaveCove(ctx, corner, 13.5);
          ctx.fillStyle = 'rgba(103, 232, 249, 0.25)';
          ctx.fill();

          traceConcaveCove(ctx, corner, 10.2);
          ctx.fillStyle = 'rgba(224, 242, 254, 0.48)';
          ctx.fill();

          traceConcaveCove(ctx, corner, 8.2);
          ctx.fillStyle = wetColor;
          ctx.fill();

          traceConcaveCove(ctx, corner, 6.4);
          ctx.fillStyle = lipColor;
          ctx.fill();

          if (kind === 'grass') {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#7ec249';
            const pos: Record<'n' | 'e' | 's' | 'w', [number, number]> = {
              n: [32, 4],
              e: [57, 16],
              s: [32, 28],
              w: [6, 16],
            };
            const [gx, gy] = pos[corner];
            ctx.fillRect(gx - 2, gy - 1, 2, 2);
            ctx.fillRect(gx + 1, gy, 2, 2);
          }
        });

        makeCanvas(`fx_shore_in_calm_${kind}_${corner}`, (ctx) => {
          this.setIsoUVTransform(ctx);
          traceConcaveCove(ctx, corner, 12.2);
          ctx.fillStyle = 'rgba(103, 232, 249, 0.22)';
          ctx.fill();

          traceConcaveCove(ctx, corner, 8.4);
          ctx.fillStyle = wetColor;
          ctx.fill();

          traceConcaveCove(ctx, corner, 6.4);
          ctx.fillStyle = lipColor;
          ctx.fill();
        });

        // Outer Convex Rounded Peninsula Tips (n, e, s, w)
        makeCanvas(`fx_shore_out_${kind}_${corner}`, (ctx) => {
          this.setIsoUVTransform(ctx);
          traceConvexTip(ctx, corner, 6.2);
          ctx.fillStyle = 'rgba(103, 232, 249, 0.26)';
          ctx.fill();

          traceConvexTip(ctx, corner, 4.4);
          ctx.fillStyle = 'rgba(240, 249, 255, 0.45)';
          ctx.fill();

          traceConvexTip(ctx, corner, 3.3);
          ctx.fillStyle = wetColor;
          ctx.fill();

          traceConvexTip(ctx, corner, 2.2);
          ctx.fillStyle = lipColor;
          ctx.fill();
        });
      }
    }

    // --- 2. GRASS OVERHANG ONTO SAND, DIRT & FARMLAND ---
    for (const dir of dirs) {
      makeCanvas(`fx_grass_edge_${dir}`, (ctx) => {
        this.setIsoUVTransform(ctx);
        traceEdgeBand(ctx, dir, 3.2, 1.0, 0.9);
        ctx.fillStyle = 'rgba(71, 118, 39, 0.45)';
        ctx.fill();

        traceEdgeBand(ctx, dir, 2.4, 0.85, 0.4);
        ctx.fillStyle = '#5b9436';
        ctx.fill();

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#7fc04a';
        const tufts: Record<'nw' | 'ne' | 'se' | 'sw', Array<[number, number]>> = {
          nw: [[25, 5], [16, 9], [9, 13]],
          ne: [[38, 5], [47, 9], [54, 13]],
          se: [[54, 19], [46, 23], [38, 27]],
          sw: [[9, 19], [17, 23], [25, 27]],
        };
        for (const [gx, gy] of tufts[dir]) {
          ctx.fillRect(gx, gy - 2, 1.5, 2.5);
          ctx.fillRect(gx + 2, gy - 1, 1.5, 2);
        }
      });
    }

    for (const corner of corners) {
      makeCanvas(`fx_grass_in_${corner}`, (ctx) => {
        this.setIsoUVTransform(ctx);
        traceConcaveCove(ctx, corner, 8.8);
        ctx.fillStyle = 'rgba(71, 118, 39, 0.4)';
        ctx.fill();
        traceConcaveCove(ctx, corner, 7.6);
        ctx.fillStyle = '#5b9436';
        ctx.fill();
      });

      makeCanvas(`fx_grass_out_${corner}`, (ctx) => {
        this.setIsoUVTransform(ctx);
        traceConvexTip(ctx, corner, 3.6);
        ctx.fillStyle = '#5b9436';
        ctx.fill();
      });
    }

    // --- 3. COBBLESTONE <-> GRASS & DIRT SOFT CURB TRANSITIONS ---
    for (const dir of dirs) {
      makeCanvas(`fx_cobble_grass_${dir}`, (ctx) => {
        this.setIsoUVTransform(ctx);
        traceEdgeBand(ctx, dir, 2.6, 0.7, 1.1);
        ctx.fillStyle = '#5b9436';
        ctx.fill();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#78b345';
        const pts: Record<'nw' | 'ne' | 'se' | 'sw', Array<[number, number]>> = {
          nw: [[26, 4], [14, 10]],
          ne: [[38, 4], [50, 10]],
          se: [[50, 22], [38, 28]],
          sw: [[14, 22], [26, 28]],
        };
        for (const [gx, gy] of pts[dir]) {
          ctx.fillRect(gx, gy - 1, 2, 2);
        }
      });

      makeCanvas(`fx_cobble_dirt_${dir}`, (ctx) => {
        this.setIsoUVTransform(ctx);
        traceEdgeBand(ctx, dir, 3.0, 0.8, 0.5);
        ctx.fillStyle = 'rgba(198, 152, 92, 0.78)';
        ctx.fill();
      });
    }

    // --- 4. CLIFF LEDGE & FOOTHILL SCREE TRANSITIONS ---
    for (const dir of dirs) {
      makeCanvas(`fx_cliff_ledge_${dir}`, (ctx) => {
        this.setIsoUVTransform(ctx);
        traceEdgeBand(ctx, dir, 2.8, 0.75, 0.3);
        ctx.fillStyle = '#5b9436';
        ctx.fill();
        traceEdgeBand(ctx, dir, 1.6, 0.45, 1.7);
        ctx.fillStyle = '#6da640';
        ctx.fill();
      });
    }
    for (const corner of corners) {
      makeCanvas(`fx_cliff_in_${corner}`, (ctx) => {
        this.setIsoUVTransform(ctx);
        traceConcaveCove(ctx, corner, 8.2);
        ctx.fillStyle = '#5b9436';
        ctx.fill();
      });
    }
    for (const dir of ['nw', 'ne'] as const) {
      makeCanvas(`fx_cliff_foothill_${dir}`, (ctx) => {
        this.setIsoUVTransform(ctx);
        traceEdgeBand(ctx, dir, 3.8, 0.9, 0.8);
        ctx.fillStyle = 'rgba(41, 37, 36, 0.24)';
        ctx.fill();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const rocks: Array<[number, number]> = dir === 'nw'
          ? [[24, 6], [17, 10], [11, 13]]
          : [[40, 6], [47, 10], [53, 13]];
        for (const [rx, ry] of rocks) {
          ctx.fillStyle = '#57534e';
          ctx.fillRect(rx, ry, 3, 2);
          ctx.fillStyle = '#a8a29e';
          ctx.fillRect(rx, ry, 2, 1);
        }
      });
    }
  }

  // 4. Warm Natural Golden-Cream River & Beach Sand Tiles (4 organic variants)
  private static createSandTiles(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_sand_0')) return;

    const baseSand = '#dfc07c';

    const specs = [
      { center: '#e9cd8e', ripple: true, pebbles: false, shell: false },
      { center: '#d4b36f', ripple: false, pebbles: true, shell: true },
      { center: '#e3c480', ripple: true, pebbles: true, shell: false },
      { center: '#ecd195', ripple: false, pebbles: false, shell: true },
    ];

    specs.forEach((sp, idx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, baseSand);

      ctx.fillStyle = sp.center;
      ctx.beginPath();
      ctx.ellipse(32, 16, 17, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (sp.ripple) {
        ctx.strokeStyle = 'rgba(180, 140, 74, 0.42)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(22, 14 + (idx % 2));
        ctx.quadraticCurveTo(32, 12 + (idx % 2), 42, 14 + (idx % 2));
        ctx.moveTo(25, 19);
        ctx.quadraticCurveTo(33, 17.5, 41, 19);
        ctx.stroke();
      }

      ctx.fillStyle = '#fef3c7';
      for (const [gx, gy] of [
        [21 + idx, 14],
        [34 - idx, 11],
        [43, 16 + (idx % 2)],
        [28, 20],
        [37, 21 - (idx % 2)],
      ]) {
        ctx.fillRect(gx, gy, 2, 1);
      }

      if (sp.pebbles) {
        ctx.fillStyle = '#9c8364';
        ctx.fillRect(29 + idx, 15, 3, 2);
        ctx.fillStyle = '#c7b8a3';
        ctx.fillRect(29 + idx, 15, 2, 1);
      }

      if (sp.shell) {
        ctx.fillStyle = '#fda4af';
        ctx.fillRect(36 - idx, 13, 2, 1.5);
        ctx.fillStyle = '#fff1f2';
        ctx.fillRect(36 - idx, 13, 1, 1);
      }

      textures.addCanvas(`tile_sand_${idx}`, canvas);
      if (idx === 0) textures.addCanvas('tile_sand', canvas);
    });
  }

  // 5. High-Detail Dirt Tiles + 16-Mask Affine Isometric Curved Bezier Roads & Woodland Trails
  private static createDirtTiles(textures: Phaser.Textures.TextureManager) {
    if (!textures.exists('tile_dirt_0')) {
      for (let v = 0; v < 2; v++) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        this.drawIsoDiamond(ctx, 64, 32, v === 0 ? '#9a6838' : '#946234');

        ctx.fillStyle = '#b17b46';
        ctx.fillRect(24, 12, 3, 2);
        ctx.fillRect(36, 14 + v * 2, 4, 2);
        ctx.fillRect(28, 20, 3, 2);

        ctx.fillStyle = '#7c4e24';
        ctx.fillRect(32, 17, 2, 1);
        ctx.fillRect(42, 13, 2, 1);
        if (v === 1) {
          ctx.fillStyle = '#c4bcb3';
          ctx.fillRect(30, 12, 2, 1.5);
          ctx.fillRect(44, 16, 2, 1.5);
        }

        textures.addCanvas(`tile_dirt_${v}`, canvas);
        if (v === 0) textures.addCanvas('tile_dirt', canvas);
      }
    }

    // Generate 16-Bitmask Curved Bezier Road Autotiles (Main Road & Secondary Trail)
    // Mask bits: 1 = NW (u=0,v=16), 2 = NE (u=16,v=0), 4 = SE (u=32,v=16), 8 = SW (u=16,v=32)
    const generateRoadMaskSet = (tier: 'main' | 'trail') => {
      const isMain = tier === 'main';
      const outerStroke = isMain ? 25 : 17;
      const midStroke = isMain ? 21 : 13;
      const innerStroke = isMain ? 15 : 8;

      const borderCol = isMain ? '#9d723d' : '#734a22';
      const bodyCol = isMain ? '#c09359' : '#966533';
      const highlightCol = isMain ? '#cfa369' : '#aa7842';

      const anchors: Array<{ bit: number; u: number; v: number }> = [
        { bit: 1, u: 0, v: 16 },  // NW
        { bit: 2, u: 16, v: 0 },  // NE
        { bit: 4, u: 32, v: 16 }, // SE
        { bit: 8, u: 16, v: 32 }, // SW
      ];

      for (let mask = 0; mask < 16; mask++) {
        const key = `tile_road_${tier}_m${mask}`;
        if (textures.exists(key)) continue;

        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;

        ctx.save();
        this.clipIsoDiamond(ctx);
        this.setIsoUVTransform(ctx);

        const active = anchors.filter((a) => (mask & a.bit) !== 0);

        const traceRoadGeometry = () => {
          ctx.beginPath();
          if (active.length === 0) {
            // Isolated stepping circle
            ctx.arc(16, 16, midStroke * 0.45, 0, Math.PI * 2);
          } else if (active.length === 1) {
            // Rounded tapering dead-end road termination
            const a = active[0];
            ctx.moveTo(a.u, a.v);
            ctx.lineTo(16 + (a.u - 16) * 0.25, 16 + (a.v - 16) * 0.25);
          } else if (active.length === 2) {
            const [a, b] = active;
            const isOpposite = (mask === 5) || (mask === 10); // NW-SE or NE-SW
            if (isOpposite) {
              ctx.moveTo(a.u, a.v);
              ctx.lineTo(b.u, b.v);
            } else {
              // Smooth sweeping Bezier curve for 90-degree road turns (ZERO sharp square elbows!)
              ctx.moveTo(a.u, a.v);
              ctx.quadraticCurveTo(16, 16, b.u, b.v);
            }
          } else {
            // T-junctions & 4-way crossroads: draw curves between connected pairs for smooth rounded shoulders
            for (let i = 0; i < active.length; i++) {
              for (let j = i + 1; j < active.length; j++) {
                ctx.moveTo(active[i].u, active[i].v);
                ctx.quadraticCurveTo(16, 16, active[j].u, active[j].v);
              }
            }
          }
        };

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Layer 1: Soft soil/turf transition border
        traceRoadGeometry();
        ctx.strokeStyle = borderCol;
        ctx.lineWidth = outerStroke;
        if (active.length === 0) {
          ctx.fillStyle = borderCol;
          ctx.fill();
        } else {
          ctx.stroke();
        }

        // Layer 2: Compacted earthy road body
        traceRoadGeometry();
        ctx.strokeStyle = bodyCol;
        ctx.lineWidth = midStroke;
        if (active.length === 0) {
          ctx.fillStyle = bodyCol;
          ctx.fill();
        } else {
          ctx.stroke();
        }

        // Layer 3: Sunlit compacted center crown
        traceRoadGeometry();
        ctx.strokeStyle = highlightCol;
        ctx.lineWidth = innerStroke;
        if (active.length === 0) {
          ctx.fillStyle = highlightCol;
          ctx.fill();
        } else {
          ctx.stroke();
        }

        // Gentle gravel stipples & tiny roadside pebbles inside road area
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = isMain ? '#e7cca0' : '#bc8c54';
        ctx.fillRect(30, 14, 2, 1.5);
        ctx.fillRect(35, 17, 2, 1);

        if (active.length === 1) {
          // Natural fading pebbles & grass wisps at dead-end road tip
          ctx.fillStyle = '#8c7a66';
          ctx.fillRect(28, 17, 2.5, 1.5);
          ctx.fillRect(35, 13, 2, 1.5);
          ctx.fillStyle = '#7bb846';
          ctx.fillRect(31, 18, 1.5, 2);
        }

        ctx.restore();
        textures.addCanvas(key, canvas);
      }
    };

    generateRoadMaskSet('main');
    generateRoadMaskSet('trail');

    // Backward-compatible static aliases
    if (!textures.exists('tile_road_main_0')) {
      textures.addCanvas('tile_road_main_0', textures.get('tile_road_main_m5').getSourceImage() as HTMLCanvasElement);
      textures.addCanvas('tile_road_main_1', textures.get('tile_road_main_m10').getSourceImage() as HTMLCanvasElement);
    }
    if (!textures.exists('tile_trail_0')) {
      textures.addCanvas('tile_trail_0', textures.get('tile_road_trail_m5').getSourceImage() as HTMLCanvasElement);
      textures.addCanvas('tile_trail_1', textures.get('tile_road_trail_m10').getSourceImage() as HTMLCanvasElement);
    }

    // Subtle non-repeating road surface detail overlays (pebbles, sandstone flecks, grass tufts)
    for (let v = 0; v < 4; v++) {
      const key = `fx_road_specks_${v}`;
      if (textures.exists(key)) continue;
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = v % 2 === 0 ? '#e7cca0' : '#8c7a66';
      ctx.fillRect(24 + v * 3, 13 + (v % 2) * 2, 2, 1.5);
      ctx.fillRect(38 - v * 2, 18 - (v % 2), 2, 1.5);
      if (v >= 2) {
        ctx.fillStyle = '#7bb846';
        ctx.fillRect(20 + v, 19, 1.5, 2);
        ctx.fillRect(43 - v, 12, 1.5, 2);
      }
      textures.addCanvas(key, canvas);
    }
  }

  // 6. Rugged Mountain & Plateau Cliff Strata Tiles (4 high-detail variants)
  private static createCliffTiles(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_cliff_0')) return;

    const palette = [
      { base: '#585760', dark: '#3f3f46', light: '#7c7b86', moss: true },
      { base: '#515059', dark: '#36363d', light: '#72717c', moss: false },
      { base: '#5d5b65', dark: '#414048', light: '#85838f', moss: true },
      { base: '#4d4c55', dark: '#34333b', light: '#6e6c78', moss: true },
    ];

    palette.forEach((p, idx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, p.base);

      ctx.strokeStyle = p.dark;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (idx % 2 === 0) {
        ctx.moveTo(18, 14);
        ctx.lineTo(46, 14);
        ctx.moveTo(24, 20);
        ctx.lineTo(40, 20);
      } else {
        ctx.moveTo(21, 11);
        ctx.lineTo(38, 16);
        ctx.moveTo(27, 19);
        ctx.lineTo(44, 23);
      }
      ctx.stroke();

      ctx.fillStyle = p.light;
      ctx.fillRect(20 + idx, 10, 8, 2);
      ctx.fillRect(35 - idx, 17, 7, 2);

      if (p.moss) {
        ctx.fillStyle = '#6ba338';
        ctx.fillRect(27 + idx, 15, 4, 2);
        ctx.fillRect(34, 19, 3, 1.5);
      }

      textures.addCanvas(`tile_cliff_${idx}`, canvas);
      if (idx === 0) textures.addCanvas('tile_cliff', canvas);
    });
  }

  // 7. Polished Cedar Wood Floor Tile
  private static createWoodFloorTile(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_wood_floor')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;

    this.drawIsoDiamond(ctx, 64, 32, '#9a441a');

    ctx.strokeStyle = '#5c240c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, 9);
    ctx.lineTo(46, 23);
    ctx.moveTo(26, 5);
    ctx.lineTo(54, 19);
    ctx.stroke();

    textures.addCanvas('tile_wood_floor', canvas);
  }

  // 8. Tilled Farmland Soil Tile with warm furrow ridges
  private static createFarmlandTile(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_farmland')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;

    this.drawIsoDiamond(ctx, 64, 32, '#5b3114');

    ctx.strokeStyle = '#381c09';
    ctx.lineWidth = 1.2;
    for (let i = -1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(16 + i * 10, 8 + i * 5);
      ctx.lineTo(44 + i * 10, 22 + i * 5);
      ctx.stroke();
    }

    ctx.strokeStyle = '#7c4520';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(18 + i * 10, 7 + i * 5);
      ctx.lineTo(46 + i * 10, 21 + i * 5);
      ctx.stroke();
    }

    ctx.fillStyle = '#84cc16';
    ctx.fillRect(26, 14, 2, 2);
    ctx.fillRect(38, 20, 2, 2);
    ctx.fillRect(32, 11, 2, 2);

    textures.addCanvas('tile_farmland', canvas);
  }

  // 9. Natural Isometric Wooden Bridges & Scenic Fishing Piers (3 Styles x Neighbor-Aware Masks + Foreground Rails)
  private static createBridgeTile(textures: Phaser.Textures.TextureManager) {
    if (!textures.exists('tile_bridge')) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#9a4a1a');
      ctx.strokeStyle = '#541c09';
      ctx.lineWidth = 1.5;
      for (let y = 6; y < 28; y += 5) {
        ctx.beginPath();
        ctx.moveTo(14, y);
        ctx.lineTo(50, y);
        ctx.stroke();
      }
      textures.addCanvas('tile_bridge', canvas);
    }

    type StyleId = 'main' | 'rustic' | 'pier';
    const PALETTES: Record<
      StyleId,
      {
        deckBase: string;
        plankA: string;
        plankB: string;
        plankSeam: string;
        highlight: string;
        skirtSe: string;
        skirtSw: string;
        piling: string;
        pilingCap: string;
        railPost: string;
        railBar: string;
        railTop: string;
        rivet: string;
        postCap: string;
        railHeight: number;
      }
    > = {
      main: {
        deckBase: '#8c3f16',
        plankA: '#c66d2d',
        plankB: '#b05a21',
        plankSeam: '#5a2209',
        highlight: 'rgba(254, 243, 199, 0.28)',
        skirtSe: '#5e2409',
        skirtSw: '#712e0d',
        piling: '#3f1805',
        pilingCap: '#e59a3c',
        railPost: '#4a1d06',
        railBar: '#7c320d',
        railTop: '#d98236',
        rivet: '#334155',
        postCap: '#fbbf24',
        railHeight: 8.0,
      },
      rustic: {
        deckBase: '#784822',
        plankA: '#ab733e',
        plankB: '#966131',
        plankSeam: '#4a2810',
        highlight: 'rgba(254, 240, 210, 0.22)',
        skirtSe: '#4d2b12',
        skirtSw: '#603819',
        piling: '#3b210d',
        pilingCap: '#b47d44',
        railPost: '#45250e',
        railBar: '#6e3f1b',
        railTop: '#b77f47',
        rivet: '#3f2e24',
        postCap: '#d6a15c',
        railHeight: 7.0,
      },
      pier: {
        deckBase: '#6e4c2e',
        plankA: '#a37b52',
        plankB: '#8e6741',
        plankSeam: '#442c17',
        highlight: 'rgba(241, 245, 249, 0.22)',
        skirtSe: '#472f19',
        skirtSw: '#583b21',
        piling: '#342110',
        pilingCap: '#c8a97e',
        railPost: '#3f2814',
        railBar: '#785230',
        railTop: '#c2996b',
        rivet: '#475569',
        postCap: '#e2c496',
        railHeight: 3.4, // Low unobstructed dock curb/bollards for fishing!
      },
    };

    const iso = (u: number, v: number, z = 0): [number, number] => [
      32 + (u - v),
      16 + (u + v) * 0.5 - z,
    ];

    const fillPoly = (ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fill();
    };

    const drawPost = (
      ctx: CanvasRenderingContext2D,
      u: number,
      v: number,
      baseZ: number,
      height: number,
      pal: (typeof PALETTES)['main'],
      accentCap = false
    ) => {
      const [px, py] = iso(u, v, baseZ);
      ctx.fillStyle = pal.railPost;
      ctx.fillRect(px - 1.6, py - height - 0.5, 3.2, height + 1.5);
      ctx.fillStyle = pal.railTop;
      ctx.fillRect(px - 1.1, py - height - 0.5, 1.3, height);
      ctx.fillStyle = accentCap ? pal.postCap : pal.pilingCap;
      ctx.fillRect(px - 1.8, py - height - 2.0, 3.6, 1.8);
    };

    const drawPiling = (ctx: CanvasRenderingContext2D, u: number, v: number, pal: (typeof PALETTES)['main']) => {
      const [px, py] = iso(u, v, 0);
      // Soft water ripple ring around submerged piling
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.34)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(px, py + 3.8, 4.4, 2.0, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = pal.piling;
      ctx.fillRect(px - 1.7, py - 1.5, 3.4, 5.8);
      ctx.fillStyle = 'rgba(20, 83, 45, 0.42)'; // Subtle mossy waterline band
      ctx.fillRect(px - 1.7, py + 2.5, 3.4, 1.6);
    };

    const drawRailSegment = (
      ctx: CanvasRenderingContext2D,
      u1: number,
      v1: number,
      u2: number,
      v2: number,
      pal: (typeof PALETTES)['main'],
      style: StyleId
    ) => {
      const zBase = 2.0;
      const rh = pal.railHeight;
      const [x1, y1] = iso(u1, v1, zBase);
      const [x2, y2] = iso(u2, v2, zBase);
      const [xm, ym] = iso((u1 + u2) * 0.5, (v1 + v2) * 0.5, zBase);

      drawPost(ctx, u1, v1, zBase, rh, pal, style === 'main');
      if (style !== 'pier') {
        drawPost(ctx, (u1 + u2) * 0.5, (v1 + v2) * 0.5, zBase, rh * 0.94, pal, false);
      } else {
        // Low center cleat block on fishing pier curbs
        ctx.fillStyle = pal.railPost;
        ctx.fillRect(xm - 1.2, ym - rh - 0.5, 2.4, rh + 0.8);
      }
      drawPost(ctx, u2, v2, zBase, rh, pal, style === 'main');

      // Mid stringer rail for main/rustic bridges
      if (style !== 'pier') {
        ctx.strokeStyle = pal.railBar;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x1, y1 - rh * 0.48);
        ctx.lineTo(x2, y2 - rh * 0.48);
        ctx.stroke();
      }

      // Top handrail / dock curb beam
      ctx.strokeStyle = pal.railBar;
      ctx.lineWidth = style === 'pier' ? 2.0 : 2.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1 - rh);
      ctx.lineTo(x2, y2 - rh);
      ctx.stroke();

      ctx.strokeStyle = pal.railTop;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x1, y1 - rh - 0.6);
      ctx.lineTo(x2, y2 - rh - 0.6);
      ctx.stroke();
    };

    const drawDeckMask = (ctx: CanvasRenderingContext2D, style: StyleId, mask: number) => {
      const pal = PALETTES[style];
      const hasNW = (mask & 1) !== 0;
      const hasNE = (mask & 2) !== 0;
      const hasSE = (mask & 4) !== 0;
      const hasSW = (mask & 8) !== 0;

      const uMin = hasNW ? 0 : 5.5;
      const uMax = hasSE ? 32 : 26.5;
      const vMin = hasNE ? 0 : 5.5;
      const vMax = hasSW ? 32 : 26.5;

      // 1. Soft water drop-shadow under elevated deck
      fillPoly(
        ctx,
        [iso(uMin, vMin, -2.5), iso(uMax, vMin, -2.5), iso(uMax, vMax, -2.5), iso(uMin, vMax, -2.5)],
        'rgba(2, 18, 36, 0.34)'
      );

      // 2. Submerged pilings at water-exposed corners
      if (!hasNW && !hasNE) drawPiling(ctx, uMin + 1.5, vMin + 1.5, pal);
      if (!hasNE && !hasSE) drawPiling(ctx, uMax - 1.5, vMin + 1.5, pal);
      if (!hasSW && !hasNW) drawPiling(ctx, uMin + 1.5, vMax - 1.5, pal);
      if (!hasSE && !hasSW) drawPiling(ctx, uMax - 1.5, vMax - 1.5, pal);
      if (!hasSE && (hasNW || hasNE)) drawPiling(ctx, uMax - 1.5, (vMin + vMax) * 0.5, pal);
      if (!hasSW && (hasNE || hasNW)) drawPiling(ctx, (uMin + uMax) * 0.5, vMax - 1.5, pal);

      // 3. Raised deck skirt thickness along front water-facing edges (SE & SW)
      if (!hasSE) {
        fillPoly(
          ctx,
          [iso(uMax, vMin, 2.0), iso(uMax, vMax, 2.0), iso(uMax, vMax, -0.6), iso(uMax, vMin, -0.6)],
          pal.skirtSe
        );
      }
      if (!hasSW) {
        fillPoly(
          ctx,
          [iso(uMin, vMax, 2.0), iso(uMax, vMax, 2.0), iso(uMax, vMax, -0.6), iso(uMin, vMax, -0.6)],
          pal.skirtSw
        );
      }

      // 4. Elevated deck timber bed
      fillPoly(
        ctx,
        [iso(uMin, vMin, 2.0), iso(uMax, vMin, 2.0), iso(uMax, vMax, 2.0), iso(uMin, vMax, 2.0)],
        pal.deckBase
      );

      // 5. Individual cross-planks with wood bevels & nail/peg rivets
      const isPrimarilyNS = (hasNE || hasSW) && !(hasNW || hasSE);
      const steps = 6;
      if (!isPrimarilyNS) {
        const spanU = uMax - uMin;
        for (let i = 0; i < steps; i++) {
          const p0 = uMin + (spanU * i) / steps;
          const p1 = uMin + (spanU * (i + 0.85)) / steps;
          fillPoly(
            ctx,
            [iso(p0, vMin + 0.5, 2.0), iso(p1, vMin + 0.5, 2.0), iso(p1, vMax - 0.5, 2.0), iso(p0, vMax - 0.5, 2.0)],
            i % 2 === 0 ? pal.plankA : pal.plankB
          );
          const [h1x, h1y] = iso(p0 + 0.4, vMin + 1.4, 2.0);
          const [h2x, h2y] = iso(p0 + 0.4, vMax - 1.4, 2.0);
          ctx.strokeStyle = pal.highlight;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(h1x, h1y);
          ctx.lineTo(h2x, h2y);
          ctx.stroke();

          const [r1x, r1y] = iso((p0 + p1) * 0.5, vMin + 2.6, 2.0);
          const [r2x, r2y] = iso((p0 + p1) * 0.5, vMax - 2.6, 2.0);
          ctx.fillStyle = pal.rivet;
          ctx.fillRect(r1x - 0.6, r1y - 0.6, 1.2, 1.2);
          ctx.fillRect(r2x - 0.6, r2y - 0.6, 1.2, 1.2);
        }
      } else {
        const spanV = vMax - vMin;
        for (let i = 0; i < steps; i++) {
          const p0 = vMin + (spanV * i) / steps;
          const p1 = vMin + (spanV * (i + 0.85)) / steps;
          fillPoly(
            ctx,
            [iso(uMin + 0.5, p0, 2.0), iso(uMax - 0.5, p0, 2.0), iso(uMax - 0.5, p1, 2.0), iso(uMin + 0.5, p1, 2.0)],
            i % 2 === 0 ? pal.plankA : pal.plankB
          );
          const [h1x, h1y] = iso(uMin + 1.4, p0 + 0.4, 2.0);
          const [h2x, h2y] = iso(uMax - 1.4, p0 + 0.4, 2.0);
          ctx.strokeStyle = pal.highlight;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(h1x, h1y);
          ctx.lineTo(h2x, h2y);
          ctx.stroke();

          const [r1x, r1y] = iso(uMin + 2.6, (p0 + p1) * 0.5, 2.0);
          const [r2x, r2y] = iso(uMax - 2.6, (p0 + p1) * 0.5, 2.0);
          ctx.fillStyle = pal.rivet;
          ctx.fillRect(r1x - 0.6, r1y - 0.6, 1.2, 1.2);
          ctx.fillRect(r2x - 0.6, r2y - 0.6, 1.2, 1.2);
        }
      }

      // 6. Back water-edge guardrails (NW & NE edges) rendered cleanly behind players
      if (!hasNW) {
        drawRailSegment(ctx, uMin + 0.8, vMin + 0.8, uMin + 0.8, vMax - 0.8, pal, style);
      }
      if (!hasNE) {
        drawRailSegment(ctx, uMin + 0.8, vMin + 0.8, uMax - 0.8, vMin + 0.8, pal, style);
      }
    };

    const drawFrontRail = (
      ctx: CanvasRenderingContext2D,
      style: StyleId,
      openMask: number
    ) => {
      const pal = PALETTES[style];
      const hasNW = (openMask & 1) !== 0;
      const hasNE = (openMask & 2) !== 0;
      const hasSE = (openMask & 4) !== 0;
      const hasSW = (openMask & 8) !== 0;

      const uMin = hasNW ? 0 : 5.5;
      const uMax = hasSE ? 32 : 26.5;
      const vMin = hasNE ? 0 : 5.5;
      const vMax = hasSW ? 32 : 26.5;

      if (!hasSE) {
        drawRailSegment(
          ctx,
          uMax - 0.8,
          vMin + (hasNE ? 0.5 : 0.8),
          uMax - 0.8,
          vMax - (hasSW ? 0.5 : 0.8),
          pal,
          style
        );
      }
      if (!hasSW) {
        drawRailSegment(
          ctx,
          uMin + (hasNW ? 0.5 : 0.8),
          vMax - 0.8,
          uMax - (hasSE ? 0.5 : 0.8),
          vMax - 0.8,
          pal,
          style
        );
      }
    };

    for (const style of ['main', 'rustic', 'pier'] as const) {
      for (let mask = 0; mask < 16; mask++) {
        const texKey = `obj_bridge_deck_${style}_m${mask}`;
        if (!textures.exists(texKey)) {
          const c = document.createElement('canvas');
          c.width = 64;
          c.height = 52;
          const ctx = c.getContext('2d')!;
          drawDeckMask(ctx, style, mask);
          textures.addCanvas(texKey, c);
        }
        const hasFrontWater = (mask & 4) === 0 || (mask & 8) === 0;
        if (hasFrontWater) {
          const rKey = `obj_bridge_rail_${style}_m${mask}`;
          if (!textures.exists(rKey)) {
            const c = document.createElement('canvas');
            c.width = 64;
            c.height = 52;
            const ctx = c.getContext('2d')!;
            drawFrontRail(ctx, style, mask);
            textures.addCanvas(rKey, c);
          }
        }
      }
    }

    // Legacy compatibility keys mapped cleanly to updated styles
    for (const [legacyKey, mask] of [
      ['obj_bridge_ew', 5],
      ['obj_bridge_ns', 10],
      ['obj_bridge_cross', 15],
    ] as const) {
      if (!textures.exists(legacyKey)) {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 52;
        const ctx = c.getContext('2d')!;
        drawDeckMask(ctx, 'rustic', mask);
        drawFrontRail(ctx, 'rustic', mask);
        textures.addCanvas(legacyKey, c);
      }
    }
  }

  // Placement Grid Highlights
  private static createGridHighlight(textures: Phaser.Textures.TextureManager) {
    // Valid placement (soft emerald ring)
    if (!textures.exists('grid_valid')) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 32;
      const ctx = c.getContext('2d')!;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
      ctx.beginPath();
      ctx.moveTo(32, 1);
      ctx.lineTo(63, 16);
      ctx.lineTo(32, 31);
      ctx.lineTo(1, 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      textures.addCanvas('grid_valid', c);
    }

    // Invalid placement (soft red ring)
    if (!textures.exists('grid_invalid')) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 32;
      const ctx = c.getContext('2d')!;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.beginPath();
      ctx.moveTo(32, 1);
      ctx.lineTo(63, 16);
      ctx.lineTo(32, 31);
      ctx.lineTo(1, 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      textures.addCanvas('grid_invalid', c);
    }

    // Hover tile
    if (!textures.exists('grid_hover')) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 32;
      const ctx = c.getContext('2d')!;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(32, 1);
      ctx.lineTo(63, 16);
      ctx.lineTo(32, 31);
      ctx.lineTo(1, 16);
      ctx.closePath();
      ctx.stroke();
      textures.addCanvas('grid_hover', c);
    }
  }

  // 7. Beautiful Stylized 2D Oak Trees (2 Rich Multi-Layered Variants + Ground Contact Details)
  private static createTreeSprite(textures: Phaser.Textures.TextureManager) {
    const drawSoftTreeShadow = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) => {
      const shadowGrad = ctx.createRadialGradient(cx + 4, cy + 1, 4, cx + 4, cy + 1, rx);
      shadowGrad.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
      shadowGrad.addColorStop(0.65, 'rgba(15, 23, 42, 0.18)');
      shadowGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(cx + 4, cy + 1, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    if (!textures.exists('res_tree')) {
      const canvas = document.createElement('canvas');
      canvas.width = 76;
      canvas.height = 92;
      const ctx = canvas.getContext('2d')!;

      drawSoftTreeShadow(ctx, 38, 81, 24, 9.5);

      // Trunk with organic bark, fork shadow & root flares
      ctx.fillStyle = '#5c3317';
      ctx.beginPath();
      ctx.moveTo(33, 46);
      ctx.lineTo(42, 46);
      ctx.lineTo(46, 78);
      ctx.lineTo(50, 82);
      ctx.lineTo(26, 82);
      ctx.lineTo(30, 78);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#78431f';
      ctx.beginPath();
      ctx.moveTo(35, 48);
      ctx.lineTo(39, 48);
      ctx.lineTo(42, 79);
      ctx.lineTo(36, 79);
      ctx.closePath();
      ctx.fill();

      // Grounded root moss, grass blades & fallen leaf flecks
      ctx.fillStyle = '#4d7c0f';
      ctx.fillRect(28, 79, 5, 3);
      ctx.fillRect(43, 80, 4, 2.5);
      ctx.fillStyle = '#7bb846';
      ctx.fillRect(26, 78, 1.5, 3);
      ctx.fillRect(48, 79, 1.5, 2.5);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(24, 82, 2, 1.5);
      ctx.fillRect(46, 83, 2, 1.5);

      // 4-tier stylized lush foliage canopy
      ctx.fillStyle = '#1e3a12';
      ctx.beginPath();
      ctx.arc(29, 39, 18, 0, Math.PI * 2);
      ctx.arc(47, 39, 18, 0, Math.PI * 2);
      ctx.arc(38, 25, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#3f701b';
      ctx.beginPath();
      ctx.arc(27, 37, 16, 0, Math.PI * 2);
      ctx.arc(48, 37, 16, 0, Math.PI * 2);
      ctx.arc(38, 23, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5c9c27';
      ctx.beginPath();
      ctx.arc(25, 32, 13, 0, Math.PI * 2);
      ctx.arc(47, 30, 13, 0, Math.PI * 2);
      ctx.arc(37, 17, 15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#8bc34a';
      ctx.beginPath();
      ctx.arc(24, 27, 8, 0, Math.PI * 2);
      ctx.arc(46, 25, 7, 0, Math.PI * 2);
      ctx.arc(36, 13, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#aed581';
      ctx.beginPath();
      ctx.arc(34, 11, 4, 0, Math.PI * 2);
      ctx.arc(23, 24, 3, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('res_tree', canvas);
      textures.addCanvas('obj_tree', canvas);
    }

    // Variant 2: Broad Spreading Dual-Crown Woodland Oak
    if (!textures.exists('obj_tree_oak_1')) {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 94;
      const ctx = canvas.getContext('2d')!;

      drawSoftTreeShadow(ctx, 40, 83, 26, 10);

      // Sturdy forked trunk
      ctx.fillStyle = '#4e2a12';
      ctx.beginPath();
      ctx.moveTo(35, 44);
      ctx.lineTo(44, 44);
      ctx.lineTo(47, 80);
      ctx.lineTo(52, 84);
      ctx.lineTo(28, 84);
      ctx.lineTo(33, 80);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#6f3e1c';
      ctx.fillRect(36, 48, 4, 34);

      // Moss & tiny mushroom at root base
      ctx.fillStyle = '#4d7c0f';
      ctx.fillRect(30, 81, 6, 3);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(48, 81, 2.5, 2);

      // Deep shaded lower lobes
      ctx.fillStyle = '#1b3811';
      ctx.beginPath();
      ctx.arc(24, 40, 15, 0, Math.PI * 2);
      ctx.arc(54, 42, 14, 0, Math.PI * 2);
      ctx.arc(40, 32, 20, 0, Math.PI * 2);
      ctx.fill();

      // Mid sage-olive canopy
      ctx.fillStyle = '#36691c';
      ctx.beginPath();
      ctx.arc(23, 37, 14, 0, Math.PI * 2);
      ctx.arc(53, 39, 13, 0, Math.PI * 2);
      ctx.arc(39, 27, 18, 0, Math.PI * 2);
      ctx.arc(36, 16, 13, 0, Math.PI * 2);
      ctx.fill();

      // Warm sunlit leaf domes
      ctx.fillStyle = '#589628';
      ctx.beginPath();
      ctx.arc(22, 33, 10, 0, Math.PI * 2);
      ctx.arc(51, 35, 9, 0, Math.PI * 2);
      ctx.arc(37, 21, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#84bf42';
      ctx.beginPath();
      ctx.arc(21, 29, 6, 0, Math.PI * 2);
      ctx.arc(35, 16, 8, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('obj_tree_oak_1', canvas);
      textures.addCanvas('res_tree_oak_1', canvas);
    }
  }

  // 7B. Tall Mountain Evergreen Pine & Alpine Spruce (2 Variants + Pine Litter Base)
  private static createPineTreeSprite(textures: Phaser.Textures.TextureManager) {
    if (!textures.exists('res_tree_pine')) {
      const canvas = document.createElement('canvas');
      canvas.width = 66;
      canvas.height = 98;
      const ctx = canvas.getContext('2d')!;

      const sh = ctx.createRadialGradient(36, 88, 3, 36, 88, 22);
      sh.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
      sh.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(36, 88, 22, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bark trunk & needle litter base
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.moveTo(30, 54);
      ctx.lineTo(36, 54);
      ctx.lineTo(38, 86);
      ctx.lineTo(28, 86);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5c2406';
      ctx.fillRect(32, 55, 2, 31);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(25, 85, 5, 1.5);
      ctx.fillRect(37, 86, 4, 1.5);
      ctx.fillStyle = '#15803d';
      ctx.fillRect(27, 83, 2, 3);

      // Multi-tiered conical evergreen needle boughs
      ctx.fillStyle = '#14532d';
      ctx.beginPath();
      ctx.moveTo(33, 40);
      ctx.lineTo(55, 69);
      ctx.lineTo(33, 64);
      ctx.lineTo(11, 69);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#166534';
      ctx.beginPath();
      ctx.moveTo(33, 40);
      ctx.lineTo(51, 66);
      ctx.lineTo(33, 61);
      ctx.lineTo(15, 66);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.moveTo(33, 24);
      ctx.lineTo(51, 49);
      ctx.lineTo(33, 45);
      ctx.lineTo(15, 49);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.moveTo(33, 24);
      ctx.lineTo(47, 46);
      ctx.lineTo(33, 42);
      ctx.lineTo(19, 46);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.moveTo(33, 8);
      ctx.lineTo(45, 33);
      ctx.lineTo(33, 29);
      ctx.lineTo(21, 33);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.moveTo(33, 8);
      ctx.lineTo(39, 23);
      ctx.lineTo(33, 21);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#78350f';
      ctx.fillRect(21, 51, 3, 5);
      ctx.fillRect(43, 52, 3, 5);

      textures.addCanvas('res_tree_pine', canvas);
      textures.addCanvas('obj_tree_pine', canvas);
    }

    // Variant 2: Slender Blue-Green Highland Spruce (4 bough layers)
    if (!textures.exists('obj_tree_pine_1')) {
      const canvas = document.createElement('canvas');
      canvas.width = 62;
      canvas.height = 104;
      const ctx = canvas.getContext('2d')!;

      const sh = ctx.createRadialGradient(34, 94, 3, 34, 94, 19);
      sh.addColorStop(0, 'rgba(15, 23, 42, 0.40)');
      sh.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(34, 94, 19, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#451a03';
      ctx.fillRect(29, 58, 4, 34);
      ctx.fillStyle = '#4d7c0f';
      ctx.fillRect(26, 90, 4, 2.5);

      const tiers: Array<[number, number, number, string, string]> = [
        [52, 78, 22, '#0f3f2b', '#14533a'],
        [37, 62, 19, '#14533a', '#1b6e4e'],
        [22, 46, 15, '#176648', '#22875f'],
        [7, 30, 11, '#1d7d57', '#34a876'],
      ];
      for (const [topY, botY, halfW, darkCol, litCol] of tiers) {
        ctx.fillStyle = darkCol;
        ctx.beginPath();
        ctx.moveTo(31, topY);
        ctx.lineTo(31 + halfW, botY);
        ctx.lineTo(31, botY - 4);
        ctx.lineTo(31 - halfW, botY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = litCol;
        ctx.beginPath();
        ctx.moveTo(31, topY);
        ctx.lineTo(31 - halfW * 0.85, botY - 1);
        ctx.lineTo(31, botY - 5);
        ctx.closePath();
        ctx.fill();
      }

      textures.addCanvas('obj_tree_pine_1', canvas);
      textures.addCanvas('res_tree_pine_1', canvas);
    }
  }

  // 7C. Golden Autumn & Silver Woodland Birch Trees (2 Variants)
  private static createBirchTreeSprite(textures: Phaser.Textures.TextureManager) {
    if (!textures.exists('res_tree_birch')) {
      const canvas = document.createElement('canvas');
      canvas.width = 70;
      canvas.height = 90;
      const ctx = canvas.getContext('2d')!;

      const sh = ctx.createRadialGradient(38, 80, 3, 38, 80, 22);
      sh.addColorStop(0, 'rgba(15, 23, 42, 0.40)');
      sh.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(38, 80, 22, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Slender white birch trunk
      ctx.fillStyle = '#e7e5e4';
      ctx.beginPath();
      ctx.moveTo(32, 44);
      ctx.lineTo(38, 44);
      ctx.lineTo(40, 78);
      ctx.lineTo(30, 78);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#292524';
      ctx.fillRect(31, 73, 5, 1.5);
      ctx.fillRect(34, 66, 4, 1.5);
      ctx.fillRect(32, 59, 4.5, 1.5);
      ctx.fillRect(33, 51, 4, 1.5);

      // Golden fallen leaf litter & moss at root base
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(29, 77, 3, 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(26, 80, 2.5, 1.5);
      ctx.fillRect(42, 79, 2.5, 1.5);

      // Multi-tiered Golden Amber & Honey Orange Autumn Canopy
      ctx.fillStyle = '#9a3412';
      ctx.beginPath();
      ctx.arc(27, 39, 16, 0, Math.PI * 2);
      ctx.arc(43, 39, 16, 0, Math.PI * 2);
      ctx.arc(35, 25, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(25, 37, 15, 0, Math.PI * 2);
      ctx.arc(45, 37, 15, 0, Math.PI * 2);
      ctx.arc(35, 23, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(24, 31, 12, 0, Math.PI * 2);
      ctx.arc(44, 29, 12, 0, Math.PI * 2);
      ctx.arc(35, 17, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(23, 26, 7, 0, Math.PI * 2);
      ctx.arc(43, 24, 6, 0, Math.PI * 2);
      ctx.arc(35, 13, 8, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('res_tree_birch', canvas);
      textures.addCanvas('obj_tree_birch', canvas);
    }

    // Variant 2: Twin-Stemmed Silver Birch with Sunlit Chartreuse-Gold Crown
    if (!textures.exists('obj_tree_birch_1')) {
      const canvas = document.createElement('canvas');
      canvas.width = 72;
      canvas.height = 92;
      const ctx = canvas.getContext('2d')!;

      const sh = ctx.createRadialGradient(39, 82, 3, 39, 82, 22);
      sh.addColorStop(0, 'rgba(15, 23, 42, 0.38)');
      sh.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(39, 82, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Twin slender white trunks
      ctx.fillStyle = '#e7e5e4';
      ctx.fillRect(30, 46, 4.5, 34);
      ctx.fillRect(38, 48, 4, 32);
      ctx.fillStyle = '#292524';
      ctx.fillRect(30, 68, 3, 1.5);
      ctx.fillRect(31, 56, 3, 1.5);
      ctx.fillRect(39, 72, 3, 1.5);
      ctx.fillRect(38, 60, 3, 1.5);

      ctx.fillStyle = '#84cc16';
      ctx.fillRect(28, 79, 3, 2.5);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(43, 80, 2.5, 1.5);

      ctx.fillStyle = '#65a30d';
      ctx.beginPath();
      ctx.arc(27, 36, 15, 0, Math.PI * 2);
      ctx.arc(45, 38, 15, 0, Math.PI * 2);
      ctx.arc(36, 22, 17, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#a3e635';
      ctx.beginPath();
      ctx.arc(25, 32, 13, 0, Math.PI * 2);
      ctx.arc(44, 33, 12, 0, Math.PI * 2);
      ctx.arc(35, 18, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(24, 27, 7.5, 0, Math.PI * 2);
      ctx.arc(35, 14, 8, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('obj_tree_birch_1', canvas);
      textures.addCanvas('res_tree_birch_1', canvas);
    }
  }

  // 7D-Extra: Blossom Trees (2 Variants), Forest/Cliff Flora, Water Reflections & Swimming Fish
  private static createPhase2EnvironmentSprites(textures: Phaser.Textures.TextureManager) {
    // 1. Lush Blossom Woodland Tree (Pink & Peach Fruit Variants)
    if (!textures.exists('obj_tree_blossom')) {
      const canvas = document.createElement('canvas');
      canvas.width = 74;
      canvas.height = 90;
      const ctx = canvas.getContext('2d')!;

      const sh = ctx.createRadialGradient(40, 80, 3, 40, 80, 23);
      sh.addColorStop(0, 'rgba(15, 23, 42, 0.40)');
      sh.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(40, 80, 23, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5c3317';
      ctx.beginPath();
      ctx.moveTo(33, 46);
      ctx.lineTo(41, 46);
      ctx.lineTo(45, 80);
      ctx.lineTo(29, 80);
      ctx.closePath();
      ctx.fill();

      // Fallen cherry petals around roots
      ctx.fillStyle = '#f9a8d4';
      ctx.fillRect(25, 80, 2.5, 1.5);
      ctx.fillRect(46, 81, 2.5, 1.5);
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(30, 78, 3, 2.5);

      ctx.fillStyle = '#2d5a27';
      ctx.beginPath();
      ctx.arc(27, 38, 17, 0, Math.PI * 2);
      ctx.arc(47, 38, 17, 0, Math.PI * 2);
      ctx.arc(37, 24, 19, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#4f8f33';
      ctx.beginPath();
      ctx.arc(26, 35, 14, 0, Math.PI * 2);
      ctx.arc(47, 34, 14, 0, Math.PI * 2);
      ctx.arc(37, 20, 16, 0, Math.PI * 2);
      ctx.fill();

      const blossoms = [
        [25, 29, '#f9a8d4'], [45, 26, '#fbcfe8'], [36, 14, '#f472b6'],
        [30, 37, '#fbcfe8'], [48, 36, '#f9a8d4'], [39, 23, '#fdf2f8'],
      ] as const;
      for (const [bx, by, col] of blossoms) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(bx, by, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      textures.addCanvas('obj_tree_blossom', canvas);
      textures.addCanvas('res_tree_blossom', canvas);
    }

    if (!textures.exists('obj_tree_blossom_1')) {
      const canvas = document.createElement('canvas');
      canvas.width = 74;
      canvas.height = 90;
      const ctx = canvas.getContext('2d')!;

      const sh = ctx.createRadialGradient(40, 80, 3, 40, 80, 22);
      sh.addColorStop(0, 'rgba(15, 23, 42, 0.38)');
      sh.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(40, 80, 22, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#6d3b1a';
      ctx.fillRect(34, 46, 6, 34);
      ctx.fillStyle = '#fbcfe8';
      ctx.fillRect(28, 81, 2, 1.5);
      ctx.fillRect(44, 80, 2, 1.5);

      ctx.fillStyle = '#9d174d';
      ctx.beginPath();
      ctx.arc(28, 38, 16, 0, Math.PI * 2);
      ctx.arc(46, 38, 16, 0, Math.PI * 2);
      ctx.arc(37, 23, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ec4899';
      ctx.beginPath();
      ctx.arc(27, 35, 14, 0, Math.PI * 2);
      ctx.arc(45, 34, 14, 0, Math.PI * 2);
      ctx.arc(37, 20, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fbcfe8';
      ctx.beginPath();
      ctx.arc(25, 29, 8, 0, Math.PI * 2);
      ctx.arc(36, 16, 10, 0, Math.PI * 2);
      ctx.arc(45, 29, 7, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('obj_tree_blossom_1', canvas);
      textures.addCanvas('res_tree_blossom_1', canvas);
    }

    // 2. Meadow Wildflower Clump (30x22)
    if (!textures.exists('obj_wildflower_clump')) {
      const canvas = document.createElement('canvas');
      canvas.width = 30;
      canvas.height = 22;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.beginPath();
      ctx.ellipse(16, 17, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f6212';
      ctx.beginPath();
      ctx.ellipse(15, 16, 9, 3.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(10, 10, 2, 6);
      ctx.fillRect(15, 8, 2, 8);
      ctx.fillRect(20, 11, 2, 5);
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(11, 9, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(16, 7, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(21, 10, 2.3, 0, Math.PI * 2);
      ctx.fill();
      textures.addCanvas('obj_wildflower_clump', canvas);
    }

    // 2B. Chamomile & Bluebell Meadow Patch (28x20)
    if (!textures.exists('obj_flower_meadow')) {
      const canvas = document.createElement('canvas');
      canvas.width = 28;
      canvas.height = 20;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
      ctx.beginPath();
      ctx.ellipse(15, 15, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4d7c0f';
      ctx.fillRect(9, 10, 2, 5);
      ctx.fillRect(14, 8, 2, 7);
      ctx.fillRect(19, 11, 2, 4);
      ctx.fillStyle = '#93c5fd';
      ctx.beginPath();
      ctx.arc(10, 9, 2.2, 0, Math.PI * 2);
      ctx.arc(20, 10, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef9c3';
      ctx.beginPath();
      ctx.arc(15, 7, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(14.5, 6.5, 1.2, 1.2);
      textures.addCanvas('obj_flower_meadow', canvas);
    }

    // 3. Forest & Foothill Fern Tuft (32x24)
    if (!textures.exists('obj_fern_tuft')) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 24;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.26)';
      ctx.beginPath();
      ctx.ellipse(17, 19.5, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 2.2;
      for (const [ex, ey] of [[5, 12], [10, 7], [16, 5], [22, 7], [27, 12]]) {
        ctx.beginPath();
        ctx.moveTo(16, 18);
        ctx.quadraticCurveTo((16 + ex) / 2, ey + 2, ex, ey);
        ctx.stroke();
      }
      ctx.fillStyle = '#4ade80';
      for (const [fx, fy] of [[9, 10], [15, 7], [22, 10]]) {
        ctx.beginPath();
        ctx.arc(fx, fy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      textures.addCanvas('obj_fern_tuft', canvas);
    }

    // 3B. Woodland Red-Cap & Golden Chanterelle Mushroom Clusters (24x20)
    if (!textures.exists('obj_mushroom_red')) {
      const c = document.createElement('canvas');
      c.width = 24;
      c.height = 20;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
      ctx.beginPath();
      ctx.ellipse(13, 16, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(8, 10, 2.5, 5);
      ctx.fillRect(14, 11, 2, 4);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(9.2, 10, 4, Math.PI, 0);
      ctx.arc(15, 11.5, 3, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(8, 7.5, 1.3, 1.3);
      ctx.fillRect(10.5, 8.2, 1.1, 1.1);
      textures.addCanvas('obj_mushroom_red', c);
    }

    if (!textures.exists('obj_mushroom_amber')) {
      const c = document.createElement('canvas');
      c.width = 24;
      c.height = 20;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.beginPath();
      ctx.ellipse(13, 16, 7.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(9, 10, 2, 5);
      ctx.fillRect(14, 12, 2, 3.5);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.ellipse(10, 9.5, 3.8, 2.2, 0, 0, Math.PI * 2);
      ctx.ellipse(15, 11.5, 3, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      textures.addCanvas('obj_mushroom_amber', c);
    }

    // 3C. Fallen Autumn Leaves & Woodland Twig Patch (28x18)
    if (!textures.exists('obj_fallen_leaves')) {
      const c = document.createElement('canvas');
      c.width = 28;
      c.height = 18;
      const ctx = c.getContext('2d')!;
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(8, 12);
      ctx.lineTo(18, 9);
      ctx.stroke();
      const leaves: Array<[number, number, string]> = [
        [7, 9, '#d97706'],
        [13, 12, '#b45309'],
        [18, 8, '#f59e0b'],
        [21, 13, '#c2410c'],
        [11, 7, '#eab308'],
      ];
      for (const [lx, ly, col] of leaves) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 2.3, 1.3, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      textures.addCanvas('obj_fallen_leaves', c);
    }

    // 3D. Moss-Covered Fieldstone & Hardy Cliff Shrub (32x22 & 30x24)
    if (!textures.exists('obj_moss_stone')) {
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 22;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.30)';
      ctx.beginPath();
      ctx.ellipse(17.5, 16, 10, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#52525b';
      ctx.beginPath();
      ctx.ellipse(15, 13.5, 8.5, 4.8, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#71717a';
      ctx.beginPath();
      ctx.ellipse(14, 12.2, 6, 3.2, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#65a30d';
      ctx.beginPath();
      ctx.arc(12, 11, 3, 0, Math.PI * 2);
      ctx.arc(16, 12.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
      textures.addCanvas('obj_moss_stone', c);
    }

    if (!textures.exists('obj_cliff_shrub')) {
      const c = document.createElement('canvas');
      c.width = 30;
      c.height = 24;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
      ctx.beginPath();
      ctx.ellipse(16.5, 18.5, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e3a1e';
      ctx.beginPath();
      ctx.arc(11, 14, 5.5, 0, Math.PI * 2);
      ctx.arc(19, 14.5, 5, 0, Math.PI * 2);
      ctx.arc(15, 10.5, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4d7c0f';
      ctx.beginPath();
      ctx.arc(11, 12.5, 4.2, 0, Math.PI * 2);
      ctx.arc(18, 13, 4, 0, Math.PI * 2);
      ctx.arc(15, 9.5, 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c084fc';
      ctx.fillRect(10, 10, 1.8, 1.8);
      ctx.fillRect(16, 8, 1.8, 1.8);
      textures.addCanvas('obj_cliff_shrub', c);
    }

    // 4. Foothill Pebble Cluster (28x18)
    if (!textures.exists('obj_pebble_cluster')) {
      const canvas = document.createElement('canvas');
      canvas.width = 28;
      canvas.height = 18;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.beginPath();
      ctx.ellipse(15.5, 12.5, 9, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#52525b';
      ctx.beginPath();
      ctx.ellipse(11, 11, 5, 3, -0.2, 0, Math.PI * 2);
      ctx.ellipse(18, 12, 4, 2.5, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a1a1aa';
      ctx.beginPath();
      ctx.ellipse(10.5, 10, 3, 1.5, -0.2, 0, Math.PI * 2);
      ctx.ellipse(17.5, 11, 2.5, 1.3, 0.2, 0, Math.PI * 2);
      ctx.fill();
      textures.addCanvas('obj_pebble_cluster', canvas);
    }

    // 5. Directional Carved Cedar Zone Entrance Signposts (38x54)
    for (const facing of ['right', 'left'] as const) {
      const key = `obj_signpost_zone_${facing}`;
      if (!textures.exists(key)) {
        const canvas = document.createElement('canvas');
        canvas.width = 38;
        canvas.height = 54;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.40)';
        ctx.beginPath();
        ctx.ellipse(20, 48, 13, 4.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Mossy cobblestone footing with wildflower accent
        ctx.fillStyle = '#44403c';
        ctx.beginPath();
        ctx.roundRect(11, 40, 16, 8, 3);
        ctx.fill();
        ctx.fillStyle = '#78716c';
        ctx.fillRect(12, 41, 14, 3);
        ctx.fillStyle = '#65a30d';
        ctx.fillRect(12, 45, 5, 2.5);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(13, 44.5, 1.8, 1.8);

        // Sturdy chamfered cedar post with iron collar
        ctx.fillStyle = '#451a03';
        ctx.fillRect(15, 7, 8, 35);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(16, 8, 4, 33);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(14, 5, 10, 3.5);
        ctx.fillStyle = '#334155';
        ctx.fillRect(15, 36, 8, 2);

        // Directional Arrow Board with dark outline & warm wood bevel
        ctx.fillStyle = '#292524';
        ctx.beginPath();
        if (facing === 'right') {
          ctx.moveTo(5, 11);
          ctx.lineTo(30, 11);
          ctx.lineTo(37, 19);
          ctx.lineTo(30, 27);
          ctx.lineTo(5, 27);
        } else {
          ctx.moveTo(33, 11);
          ctx.lineTo(8, 11);
          ctx.lineTo(1, 19);
          ctx.lineTo(8, 27);
          ctx.lineTo(33, 27);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        if (facing === 'right') {
          ctx.moveTo(7, 13);
          ctx.lineTo(29, 13);
          ctx.lineTo(35, 19);
          ctx.lineTo(29, 25);
          ctx.lineTo(7, 25);
        } else {
          ctx.moveTo(31, 13);
          ctx.lineTo(9, 13);
          ctx.lineTo(3, 19);
          ctx.lineTo(9, 25);
          ctx.lineTo(31, 25);
        }
        ctx.closePath();
        ctx.fill();

        // Top bevel & carved inscription lines + brass nail studs
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(facing === 'right' ? 8 : 10, 13.5, 20, 1.5);
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(10, 17, 17, 1.5);
        ctx.fillRect(10, 20.5, 13, 1.5);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(18, 14, 2, 2);
        ctx.fillRect(18, 22, 2, 2);

        textures.addCanvas(key, canvas);
      }
    }

    // 6. Animated Water Surface Shimmer & Soft Sky-Light Reflection Streak
    if (!textures.exists('fx_water_shimmer')) {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 24;
      const ctx = canvas.getContext('2d')!;
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.72)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(8, 11);
      ctx.quadraticCurveTo(18, 8.5, 28, 11);
      ctx.moveTo(18, 16);
      ctx.quadraticCurveTo(29, 13.5, 40, 16);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(16, 9.5, 1.2, 0, Math.PI * 2);
      ctx.arc(32, 14.5, 1.1, 0, Math.PI * 2);
      ctx.fill();
      textures.addCanvas('fx_water_shimmer', canvas);
    }

    if (!textures.exists('fx_water_reflection')) {
      const canvas = document.createElement('canvas');
      canvas.width = 56;
      canvas.height = 24;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createLinearGradient(8, 6, 48, 18);
      grad.addColorStop(0, 'rgba(224, 242, 254, 0)');
      grad.addColorStop(0.5, 'rgba(224, 242, 254, 0.36)');
      grad.addColorStop(1, 'rgba(224, 242, 254, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(28, 12, 22, 4.2, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(240, 249, 255, 0.52)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(14, 10);
      ctx.quadraticCurveTo(28, 8.2, 42, 12.5);
      ctx.stroke();
      textures.addCanvas('fx_water_reflection', canvas);
    }

    // 7. Animated Swimming Fish Sprites (Left & Right) for Lakes & Rivers (28x16)
    for (const dir of ['r', 'l'] as const) {
      const key = `obj_swim_fish_${dir}`;
      if (!textures.exists(key)) {
        const canvas = document.createElement('canvas');
        canvas.width = 28;
        canvas.height = 16;
        const ctx = canvas.getContext('2d')!;
        if (dir === 'l') {
          ctx.translate(28, 0);
          ctx.scale(-1, 1);
        }

        ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(8, 8, 6, Math.PI * 0.65, Math.PI * 1.35);
        ctx.stroke();

        ctx.fillStyle = 'rgba(12, 74, 110, 0.45)';
        ctx.beginPath();
        ctx.ellipse(15, 9.5, 6.5, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fb923c';
        ctx.beginPath();
        ctx.ellipse(15, 8, 6, 2.7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(9, 8);
        ctx.lineTo(5, 5);
        ctx.lineTo(5, 11);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(13, 6.8, 5, 1);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(19, 7.2, 1.2, 1.2);

        textures.addCanvas(key, canvas);
      }
    }
  }

  // 7D. Majestic Mountain Ridges and Cliff Rock Formations (Consistent SE Cast Shadows)
  private static createMountainSprites(textures: Phaser.Textures.TextureManager) {
    if (!textures.exists('res_mountain_ridge')) {
      const canvas = document.createElement('canvas');
      canvas.width = 84;
      canvas.height = 82;
      const ctx = canvas.getContext('2d')!;

      const sh = ctx.createRadialGradient(44, 71, 6, 44, 71, 38);
      sh.addColorStop(0, 'rgba(15, 23, 42, 0.44)');
      sh.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(44, 71, 36, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#27272a';
      ctx.beginPath();
      ctx.moveTo(8, 70);
      ctx.lineTo(24, 40);
      ctx.lineTo(40, 10);
      ctx.lineTo(56, 35);
      ctx.lineTo(72, 70);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#3f3f46';
      ctx.beginPath();
      ctx.moveTo(8, 70);
      ctx.lineTo(24, 40);
      ctx.lineTo(40, 10);
      ctx.lineTo(36, 70);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#71717a';
      ctx.beginPath();
      ctx.moveTo(40, 10);
      ctx.lineTo(56, 35);
      ctx.lineTo(72, 70);
      ctx.lineTo(36, 70);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#a1a1aa';
      ctx.beginPath();
      ctx.moveTo(40, 10);
      ctx.lineTo(44, 12);
      ctx.lineTo(42, 50);
      ctx.lineTo(38, 50);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(40, 10);
      ctx.lineTo(46, 22);
      ctx.lineTo(41, 19);
      ctx.lineTo(36, 23);
      ctx.lineTo(34, 18);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#65a30d';
      ctx.fillRect(18, 58, 8, 3);
      ctx.fillRect(48, 54, 10, 3);

      textures.addCanvas('res_mountain_ridge', canvas);
      textures.addCanvas('obj_mountain_ridge', canvas);
    }

    if (!textures.exists('res_cliff_rock')) {
      const canvas = document.createElement('canvas');
      canvas.width = 66;
      canvas.height = 54;
      const ctx = canvas.getContext('2d')!;

      const sh = ctx.createRadialGradient(36, 45, 4, 36, 45, 26);
      sh.addColorStop(0, 'rgba(15, 23, 42, 0.40)');
      sh.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(36, 45, 26, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#3f3f46';
      ctx.beginPath();
      ctx.moveTo(10, 42);
      ctx.lineTo(16, 18);
      ctx.lineTo(34, 10);
      ctx.lineTo(54, 16);
      ctx.lineTo(56, 42);
      ctx.lineTo(44, 46);
      ctx.lineTo(20, 46);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#71717a';
      ctx.beginPath();
      ctx.moveTo(14, 40);
      ctx.lineTo(20, 20);
      ctx.lineTo(36, 14);
      ctx.lineTo(50, 20);
      ctx.lineTo(52, 40);
      ctx.lineTo(42, 44);
      ctx.lineTo(22, 44);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#a1a1aa';
      ctx.beginPath();
      ctx.moveTo(20, 20);
      ctx.lineTo(36, 14);
      ctx.lineTo(48, 18);
      ctx.lineTo(34, 26);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#65a30d';
      ctx.fillRect(15, 41, 6, 2.5);

      textures.addCanvas('res_cliff_rock', canvas);
      textures.addCanvas('obj_cliff_rock', canvas);
    }
  }

  // 8. Chiseled Mossy Granite Rock (SE Cast Shadow)
  private static createRockSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('res_rock')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 50;
    canvas.height = 42;
    const ctx = canvas.getContext('2d')!;

    const sh = ctx.createRadialGradient(27, 34, 3, 27, 34, 19);
    sh.addColorStop(0, 'rgba(15, 23, 42, 0.38)');
    sh.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(27, 34, 19, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3f3f46';
    ctx.beginPath();
    ctx.moveTo(8, 28);
    ctx.lineTo(14, 14);
    ctx.lineTo(26, 8);
    ctx.lineTo(40, 12);
    ctx.lineTo(42, 28);
    ctx.lineTo(34, 34);
    ctx.lineTo(14, 34);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#71717a';
    ctx.beginPath();
    ctx.moveTo(11, 27);
    ctx.lineTo(16, 15);
    ctx.lineTo(27, 10);
    ctx.lineTo(39, 14);
    ctx.lineTo(40, 27);
    ctx.lineTo(32, 32);
    ctx.lineTo(16, 32);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#a1a1aa';
    ctx.beginPath();
    ctx.moveTo(16, 15);
    ctx.lineTo(27, 10);
    ctx.lineTo(38, 14);
    ctx.lineTo(26, 20);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#e4e4e7';
    ctx.beginPath();
    ctx.moveTo(27, 10);
    ctx.lineTo(34, 12);
    ctx.lineTo(28, 14);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#65a30d';
    ctx.beginPath();
    ctx.arc(16, 28, 4, 0, Math.PI * 2);
    ctx.arc(22, 30, 3, 0, Math.PI * 2);
    ctx.fill();

    textures.addCanvas('res_rock', canvas);
    textures.addCanvas('obj_rock', canvas);
  }

  // 9. Lush Wild Flowering Berry Bush (SE Cast Shadow)
  private static createBushSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('res_bush')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 42;
    canvas.height = 38;
    const ctx = canvas.getContext('2d')!;

    const sh = ctx.createRadialGradient(23, 31, 2, 23, 31, 15);
    sh.addColorStop(0, 'rgba(15, 23, 42, 0.34)');
    sh.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(23, 31, 15, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e3a12';
    ctx.beginPath();
    ctx.arc(14, 20, 10, 0, Math.PI * 2);
    ctx.arc(26, 20, 10, 0, Math.PI * 2);
    ctx.arc(20, 14, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4d7c0f';
    ctx.beginPath();
    ctx.arc(14, 18, 9, 0, Math.PI * 2);
    ctx.arc(26, 18, 9, 0, Math.PI * 2);
    ctx.arc(20, 12, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#84cc16';
    ctx.beginPath();
    ctx.arc(18, 10, 5, 0, Math.PI * 2);
    ctx.arc(24, 14, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#dc2626';
    const berries = [[14, 14], [22, 12], [28, 16], [16, 22], [24, 20]];
    for (const [bx, by] of berries) {
      ctx.beginPath();
      ctx.arc(bx, by, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fca5a5';
      ctx.fillRect(bx - 0.5, by - 0.5, 1, 1);
      ctx.fillStyle = '#dc2626';
    }

    textures.addCanvas('res_bush', canvas);
    textures.addCanvas('obj_bush', canvas);
  }

  // 9B. Harvestable Lakeside Tall Grass Clump (Lush emerald blades + golden wheat plumes, distinct from decorative ground ferns)
  private static createHarvestGrassSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('res_harvest_grass')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 42;
    canvas.height = 38;
    const ctx = canvas.getContext('2d')!;

    // Soft SE contact shadow matching bush/tree ground grounding
    const sh = ctx.createRadialGradient(22, 32, 2, 22, 32, 14);
    sh.addColorStop(0, 'rgba(15, 23, 42, 0.30)');
    sh.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(22, 32, 13, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base soil/mossy root mound
    ctx.fillStyle = '#1e3a12';
    ctx.beginPath();
    ctx.ellipse(21, 30, 10, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawBlade = (
      x0: number,
      y0: number,
      cx: number,
      cy: number,
      x1: number,
      y1: number,
      width: number,
      fill: string,
      plumeColor?: string
    ) => {
      // Crisp dark-olive outline for immediate harvestable readability
      ctx.strokeStyle = '#1a2e05';
      ctx.lineWidth = width + 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();

      ctx.strokeStyle = fill;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();

      if (plumeColor) {
        ctx.fillStyle = plumeColor;
        ctx.beginPath();
        ctx.ellipse(x1, y1, 2.3, 1.4, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(x1 - 0.6, y1 - 0.6, 1.2, 1.2);
      }
    };

    // Back-layer deep-green reeds/blades
    drawBlade(15, 30, 11, 20, 8, 12, 2.2, '#3f6212');
    drawBlade(20, 30, 18, 18, 17, 7, 2.4, '#3f6212', '#eab308');
    drawBlade(25, 30, 27, 19, 30, 10, 2.2, '#365314', '#eab308');
    drawBlade(28, 30, 32, 21, 35, 14, 2.0, '#3f6212');

    // Mid-layer bright sunlit blades
    drawBlade(13, 30, 10, 23, 7, 17, 2.2, '#65a30d');
    drawBlade(18, 31, 15, 21, 13, 11, 2.4, '#65a30d', '#facc15');
    drawBlade(22, 31, 22, 20, 23, 8, 2.5, '#84cc16', '#fde047');
    drawBlade(26, 31, 29, 22, 32, 13, 2.2, '#65a30d');

    // Front highlight wisps
    drawBlade(19, 31, 17, 25, 15, 19, 1.8, '#a3e635');
    drawBlade(24, 31, 26, 25, 28, 18, 1.8, '#84cc16');

    textures.addCanvas('res_harvest_grass', canvas);
    textures.addCanvas('obj_harvest_grass', canvas);
  }

  // 10. Stylized Wild Animals (Rabbit & Deer)
  private static createAnimalSprites(textures: Phaser.Textures.TextureManager) {
    // 1. Cute Stylized Rabbit (with crisp warm taupe outline & SE cast shadow)
    if (!textures.exists('res_animal_rabbit')) {
      const canvas = document.createElement('canvas');
      canvas.width = 36;
      canvas.height = 36;
      const ctx = canvas.getContext('2d')!;

      // SE Cast Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.30)';
      ctx.beginPath();
      ctx.ellipse(19.5, 30.5, 9.5, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Subtle warm dark outline behind ears, head & body
      ctx.fillStyle = '#57534e';
      ctx.beginPath();
      ctx.ellipse(18, 22, 9.8, 7.6, -0.1, 0, Math.PI * 2);
      ctx.ellipse(24, 16, 6.8, 5.8, 0, 0, Math.PI * 2);
      ctx.ellipse(22, 9, 3.2, 6.6, -0.2, 0, Math.PI * 2);
      ctx.ellipse(26, 8, 3.2, 6.6, 0.15, 0, Math.PI * 2);
      ctx.arc(9, 21, 3.6, 0, Math.PI * 2);
      ctx.fill();

      // Fluffy body (shaded underside + top-left fur highlight)
      ctx.fillStyle = '#e7e5e4';
      ctx.beginPath();
      ctx.ellipse(18, 22, 8.8, 6.6, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fafaf9';
      ctx.beginPath();
      ctx.ellipse(17.5, 20.8, 7.6, 5.0, -0.1, 0, Math.PI * 2);
      ctx.fill();

      // Cute head
      ctx.fillStyle = '#f5f5f4';
      ctx.beginPath();
      ctx.ellipse(24, 16, 5.9, 4.9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ears with pink interior
      ctx.fillStyle = '#f5f5f4';
      ctx.beginPath();
      ctx.ellipse(22, 9, 2.4, 5.8, -0.2, 0, Math.PI * 2);
      ctx.ellipse(26, 8, 2.4, 5.8, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.ellipse(22, 9.2, 1.15, 4.2, -0.2, 0, Math.PI * 2);
      ctx.ellipse(26, 8.2, 1.15, 4.2, 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Eye with catchlight & nose
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.arc(26, 15, 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(25.5, 14.2, 0.7, 0.7);
      ctx.fillStyle = '#fda4af';
      ctx.fillRect(28, 17, 1.5, 1.4);

      // Tail
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(9, 21, 2.8, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('res_animal_rabbit', canvas);
      textures.addCanvas('res_animal', canvas); // fallback alias
      textures.addCanvas('obj_animal', canvas);
    }

    // 2. Graceful Forest Deer (with SE shadow, dark hooves & warm sunlit ridge)
    if (!textures.exists('res_animal_deer')) {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 54;
      const ctx = canvas.getContext('2d')!;

      // SE Cast Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(25.5, 48.5, 15.5, 4.8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Legs + crisp dark hooves
      ctx.fillStyle = '#78350f';
      ctx.fillRect(16, 32, 2.5, 16);
      ctx.fillRect(21, 32, 2.5, 15);
      ctx.fillRect(29, 32, 2.5, 16);
      ctx.fillRect(34, 32, 2.5, 15);
      ctx.fillStyle = '#292524';
      ctx.fillRect(16, 46.5, 2.5, 1.8);
      ctx.fillRect(21, 45.5, 2.5, 1.8);
      ctx.fillRect(29, 46.5, 2.5, 1.8);
      ctx.fillRect(34, 45.5, 2.5, 1.8);

      // Chestnut body outline & shaded torso
      ctx.fillStyle = '#5c280b';
      ctx.beginPath();
      ctx.ellipse(25, 30, 13.8, 8.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.ellipse(25, 29.6, 12.8, 7.8, 0, 0, Math.PI * 2);
      ctx.fill();
      // Top-left sunlit back ridge
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.ellipse(23.5, 26.2, 8.5, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // White dappled spots
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(22, 27, 2, 2);
      ctx.fillRect(26, 29, 2, 2);
      ctx.fillRect(30, 27, 2, 2);

      // Slender neck & head
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.moveTo(31, 26);
      ctx.lineTo(37, 14);
      ctx.lineTo(41, 14);
      ctx.lineTo(36, 28);
      ctx.closePath();
      ctx.fill();

      // Head
      ctx.beginPath();
      ctx.ellipse(40, 13, 5, 4, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Antlers
      ctx.strokeStyle = '#573315';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(38, 10);
      ctx.lineTo(36, 2);
      ctx.moveTo(37, 5);
      ctx.lineTo(40, 4);
      ctx.stroke();

      // Eye + catchlight
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.arc(42, 12, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(41.5, 11.3, 0.6, 0.6);

      textures.addCanvas('res_animal_deer', canvas);
      textures.addCanvas('obj_animal_deer', canvas);
    }
  }

  // 11. Crystal Lake Fishing Spot
  private static createFishNodeSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('res_fish_node')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 44;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;

    // Water ripple ring
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(22, 18, 16, 8, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(125, 211, 252, 0.6)';
    ctx.beginPath();
    ctx.ellipse(22, 18, 10, 5, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Jumping silver-blue fish
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(22, 12, 7, 3.5, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Tail fin
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.moveTo(15, 14);
    ctx.lineTo(11, 11);
    ctx.lineTo(12, 17);
    ctx.closePath();
    ctx.fill();

    // Sparkle water droplet
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(25, 7, 1.2, 0, Math.PI * 2);
    ctx.arc(18, 9, 1, 0, Math.PI * 2);
    ctx.fill();

    textures.addCanvas('res_fish_node', canvas);
    textures.addCanvas('res_lake_fish', canvas);
    textures.addCanvas('obj_lake_fish', canvas);
  }

  // 12. High-Detail True Isometric Houses & Shop Buildings Helper
  private static drawIsoBuildingCanvas(opts: {
    canvasW: number;
    canvasH: number;
    baseCenterY: number;
    tileW: number;
    tileH: number;
    wallH: number;
    upperH?: number;
    roofH: number;
    wallLeftColor: string;
    wallRightColor: string;
    upperLeftColor?: string;
    upperRightColor?: string;
    roofLightColor: string;
    roofDarkColor: string;
    roofGableColor?: string;
    trimColor?: string;
    doorSide?: 'left' | 'right';
    hasAwning?: { colors: [string, string] };
    hasFlowerBoxes?: boolean;
    hasForgeHearth?: boolean;
    hasDormer?: boolean;
    hasTimberBeams?: boolean;
    chimneySide?: 'back' | 'right' | 'none';
    footprintScale?: number;
    signType?: 'bakery' | 'general' | 'grocery' | 'blacksmith' | 'florist' | 'clothing' | 'none';
  }): HTMLCanvasElement {
    const {
      canvasW,
      canvasH,
      baseCenterY,
      tileW,
      tileH,
      wallH,
      upperH = 0,
      roofH,
      wallLeftColor,
      wallRightColor,
      upperLeftColor = '#fef3c7',
      upperRightColor = '#fde68a',
      roofLightColor,
      roofDarkColor,
      roofGableColor = wallRightColor,
      trimColor = '#451a03',
      doorSide = 'left',
      hasAwning,
      hasFlowerBoxes = true,
      hasForgeHearth = false,
      hasDormer = false,
      hasTimberBeams = true,
      chimneySide = 'back',
      footprintScale = 0.94,
      signType = 'none',
    } = opts;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;

    const cx = canvasW / 2;
    const cy = baseCenterY;
    const s = footprintScale;

    const top = { x: cx + (tileH - tileW) * 16 * s, y: cy - (tileW + tileH) * 8 * s };
    const right = { x: cx + (tileW + tileH) * 16 * s, y: cy + (tileW - tileH) * 8 * s };
    const bottom = { x: cx + (tileW - tileH) * 16 * s, y: cy + (tileW + tileH) * 8 * s };
    const left = { x: cx - (tileW + tileH) * 16 * s, y: cy + (tileH - tileW) * 8 * s };

    const lerpPt = (a: { x: number; y: number }, b: { x: number; y: number }, t: number, yOff = 0) => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t + yOff,
    });

    // 1. Directional Cast Ground Shadow (bottom-right offset matching morning top-left sunlight)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
    ctx.beginPath();
    ctx.moveTo(left.x + 4, left.y + 4);
    ctx.lineTo(top.x + 14, top.y + 7);
    ctx.lineTo(right.x + 16, right.y + 8);
    ctx.lineTo(bottom.x + 12, bottom.y + 9);
    ctx.closePath();
    ctx.fill();

    // Tighter contact ambient shadow around building base
    ctx.fillStyle = 'rgba(2, 6, 23, 0.28)';
    ctx.beginPath();
    ctx.moveTo(left.x - 2, left.y + 1);
    ctx.lineTo(bottom.x, bottom.y + 4);
    ctx.lineTo(right.x + 3, right.y + 2);
    ctx.lineTo(top.x, top.y);
    ctx.closePath();
    ctx.fill();

    // 2. Stone Masonry Foundation Plinth (height 11px) with stone courses & mossy tufts
    const plinthH = 11;
    // Left plinth face
    ctx.fillStyle = '#57534e';
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(bottom.x, bottom.y - plinthH);
    ctx.lineTo(left.x, left.y - plinthH);
    ctx.closePath();
    ctx.fill();
    // Right plinth face (darker)
    ctx.fillStyle = '#44403c';
    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x, right.y - plinthH);
    ctx.lineTo(bottom.x, bottom.y - plinthH);
    ctx.closePath();
    ctx.fill();

    // Subtle stone block joints on plinth
    ctx.strokeStyle = 'rgba(28, 25, 23, 0.45)';
    ctx.lineWidth = 1;
    for (let st = 0.2; st <= 0.8; st += 0.2) {
      const pL = lerpPt(left, bottom, st);
      ctx.beginPath();
      ctx.moveTo(pL.x, pL.y);
      ctx.lineTo(pL.x, pL.y - plinthH);
      ctx.stroke();

      const pR = lerpPt(bottom, right, st);
      ctx.beginPath();
      ctx.moveTo(pR.x, pR.y);
      ctx.lineTo(pR.x, pR.y - plinthH);
      ctx.stroke();
    }
    const midL0 = lerpPt(left, bottom, 0, -5.5);
    const midL1 = lerpPt(left, bottom, 1, -5.5);
    const midR1 = lerpPt(bottom, right, 1, -5.5);
    ctx.beginPath();
    ctx.moveTo(midL0.x, midL0.y);
    ctx.lineTo(midL1.x, midL1.y);
    ctx.lineTo(midR1.x, midR1.y);
    ctx.stroke();

    // Stone cap bevel
    ctx.strokeStyle = '#a8a29e';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y - plinthH);
    ctx.lineTo(bottom.x, bottom.y - plinthH);
    ctx.lineTo(right.x, right.y - plinthH);
    ctx.stroke();

    // Mossy ground contact clusters along plinth corners
    for (const [a, b, t] of [
      [left, bottom, 0.12],
      [left, bottom, 0.44],
      [bottom, right, 0.22],
      [bottom, right, 0.72],
    ] as const) {
      const mp = lerpPt(a, b, t, 0);
      ctx.fillStyle = '#4d7c0f';
      ctx.beginPath();
      ctx.ellipse(mp.x, mp.y + 0.5, 4.5, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7bb846';
      ctx.fillRect(mp.x - 2, mp.y - 2, 1.5, 2);
      ctx.fillRect(mp.x + 1, mp.y - 1.5, 1.5, 2);
    }

    // 3. Main Ground-Floor Walls
    const totalWallTopOffset = wallH;
    // Left Wall Face (Sunlit side)
    const lGrad = ctx.createLinearGradient(left.x, left.y - wallH, bottom.x, bottom.y);
    lGrad.addColorStop(0, wallLeftColor);
    lGrad.addColorStop(1, wallLeftColor);
    ctx.fillStyle = lGrad;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y - plinthH);
    ctx.lineTo(bottom.x, bottom.y - plinthH);
    ctx.lineTo(bottom.x, bottom.y - totalWallTopOffset);
    ctx.lineTo(left.x, left.y - totalWallTopOffset);
    ctx.closePath();
    ctx.fill();

    // Horizontal siding plank lines on Left wall
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.lineWidth = 1;
    for (let h = plinthH + 6; h < totalWallTopOffset - 2; h += 6) {
      ctx.beginPath();
      ctx.moveTo(left.x, left.y - h);
      ctx.lineTo(bottom.x, bottom.y - h);
      ctx.stroke();
    }

    // Right Wall Face (Shaded side)
    ctx.fillStyle = wallRightColor;
    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y - plinthH);
    ctx.lineTo(right.x, right.y - plinthH);
    ctx.lineTo(right.x, right.y - totalWallTopOffset);
    ctx.lineTo(bottom.x, bottom.y - totalWallTopOffset);
    ctx.closePath();
    ctx.fill();

    for (let h = plinthH + 6; h < totalWallTopOffset - 2; h += 6) {
      ctx.beginPath();
      ctx.moveTo(bottom.x, bottom.y - h);
      ctx.lineTo(right.x, right.y - h);
      ctx.stroke();
    }

    // Structural Corner Timber Posts & Under-Eave Belt Trim
    ctx.strokeStyle = trimColor;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(left.x + 1, left.y - plinthH);
    ctx.lineTo(left.x + 1, left.y - totalWallTopOffset);
    ctx.moveTo(bottom.x, bottom.y - plinthH);
    ctx.lineTo(bottom.x, bottom.y - totalWallTopOffset);
    ctx.moveTo(right.x - 1, right.y - plinthH);
    ctx.lineTo(right.x - 1, right.y - totalWallTopOffset);
    ctx.stroke();

    // Isometric Window Helper with Wooden Shutters
    const drawIsoWindow = (
      pA: { x: number; y: number },
      pB: { x: number; y: number },
      t0: number,
      t1: number,
      yBot: number,
      winH: number,
      withFlowerBox: boolean
    ) => {
      const a0 = lerpPt(pA, pB, t0, -yBot);
      const a1 = lerpPt(pA, pB, t1, -yBot);
      const b1 = lerpPt(pA, pB, t1, -(yBot + winH));
      const b0 = lerpPt(pA, pB, t0, -(yBot + winH));

      // Side wooden shutters
      const shutterW = 0.045;
      for (const [st0, st1] of [[t0 - shutterW, t0], [t1, t1 + shutterW]] as const) {
        const s0 = lerpPt(pA, pB, st0, -yBot);
        const s1 = lerpPt(pA, pB, st1, -yBot);
        const su1 = lerpPt(pA, pB, st1, -(yBot + winH));
        const su0 = lerpPt(pA, pB, st0, -(yBot + winH));
        ctx.fillStyle = '#5c2d12';
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.lineTo(su1.x, su1.y);
        ctx.lineTo(su0.x, su0.y);
        ctx.closePath();
        ctx.fill();
      }

      // Dark wood frame
      ctx.fillStyle = '#292524';
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.lineTo(b0.x, b0.y);
      ctx.closePath();
      ctx.fill();

      // Warm glowing interior glass
      const m0 = lerpPt(pA, pB, t0 + 0.015, -(yBot + 1.5));
      const m1 = lerpPt(pA, pB, t1 - 0.015, -(yBot + 1.5));
      const n1 = lerpPt(pA, pB, t1 - 0.015, -(yBot + winH - 1.5));
      const n0 = lerpPt(pA, pB, t0 + 0.015, -(yBot + winH - 1.5));
      const wGrad = ctx.createLinearGradient(n0.x, n0.y, m1.x, m1.y);
      wGrad.addColorStop(0, '#fef08a');
      wGrad.addColorStop(1, '#f59e0b');
      ctx.fillStyle = wGrad;
      ctx.beginPath();
      ctx.moveTo(m0.x, m0.y);
      ctx.lineTo(m1.x, m1.y);
      ctx.lineTo(n1.x, n1.y);
      ctx.lineTo(n0.x, n0.y);
      ctx.closePath();
      ctx.fill();

      // Window mullions
      const midTop = lerpPt(b0, b1, 0.5);
      const midBot = lerpPt(a0, a1, 0.5);
      const midL = lerpPt(a0, b0, 0.5);
      const midR = lerpPt(a1, b1, 0.5);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(midTop.x, midTop.y);
      ctx.lineTo(midBot.x, midBot.y);
      ctx.moveTo(midL.x, midL.y);
      ctx.lineTo(midR.x, midR.y);
      ctx.stroke();

      // Flower box under window
      if (withFlowerBox) {
        const fb0 = lerpPt(pA, pB, t0 - 0.025, -(yBot - 2));
        const fb1 = lerpPt(pA, pB, t1 + 0.025, -(yBot - 2));
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(fb0.x, fb0.y);
        ctx.lineTo(fb1.x, fb1.y);
        ctx.stroke();

        // Lush box greenery & tiny blooms
        for (let k = 0; k < 4; k++) {
          const fp = lerpPt(fb0, fb1, 0.15 + k * 0.24, -2.5);
          ctx.fillStyle = '#4d7c0f';
          ctx.beginPath();
          ctx.arc(fp.x, fp.y + 1, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = k % 2 === 1 ? '#facc15' : '#ef4444';
          ctx.beginPath();
          ctx.arc(fp.x, fp.y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    // Isometric Front Door Helper (proportioned cleanly above the 32x44 player character)
    const drawIsoDoor = (pA: { x: number; y: number }, pB: { x: number; y: number }, t0: number, t1: number) => {
      const doorH = Math.min(26, wallH - 12);
      const d0 = lerpPt(pA, pB, t0, -plinthH);
      const d1 = lerpPt(pA, pB, t1, -plinthH);
      const u1 = lerpPt(pA, pB, t1, -(plinthH + doorH));
      const u0 = lerpPt(pA, pB, t0, -(plinthH + doorH));

      // Frame
      ctx.fillStyle = '#292524';
      ctx.beginPath();
      ctx.moveTo(d0.x, d0.y);
      ctx.lineTo(d1.x, d1.y);
      ctx.lineTo(u1.x, u1.y);
      ctx.lineTo(u0.x, u0.y);
      ctx.closePath();
      ctx.fill();

      // Oak door panel + vertical planks
      const i0 = lerpPt(pA, pB, t0 + 0.015, -(plinthH + 0.5));
      const i1 = lerpPt(pA, pB, t1 - 0.015, -(plinthH + 0.5));
      const v1 = lerpPt(pA, pB, t1 - 0.015, -(plinthH + doorH - 1.5));
      const v0 = lerpPt(pA, pB, t0 + 0.015, -(plinthH + doorH - 1.5));
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.moveTo(i0.x, i0.y);
      ctx.lineTo(i1.x, i1.y);
      ctx.lineTo(v1.x, v1.y);
      ctx.lineTo(v0.x, v0.y);
      ctx.closePath();
      ctx.fill();

      // Transom highlight & plank line
      const midTop = lerpPt(v0, v1, 0.5);
      const midBot = lerpPt(i0, i1, 0.5);
      ctx.strokeStyle = 'rgba(41, 37, 36, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(midTop.x, midTop.y);
      ctx.lineTo(midBot.x, midBot.y);
      ctx.stroke();

      // Small porch lintel hood above door
      const hoodL = lerpPt(pA, pB, t0 - 0.03, -(plinthH + doorH + 1));
      const hoodR = lerpPt(pA, pB, t1 + 0.03, -(plinthH + doorH + 1));
      ctx.fillStyle = roofDarkColor;
      ctx.beginPath();
      ctx.moveTo(hoodL.x, hoodL.y - 3);
      ctx.lineTo(hoodR.x, hoodR.y - 3);
      ctx.lineTo(hoodR.x - 4, hoodR.y + 3);
      ctx.lineTo(hoodL.x - 4, hoodL.y + 3);
      ctx.closePath();
      ctx.fill();

      // Brass knob
      const knob = lerpPt(i0, i1, 0.78, -doorH * 0.44);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(knob.x, knob.y, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Two-stepped stone porch stoop extending out
      const stepExt = 5;
      ctx.fillStyle = '#78716c';
      ctx.beginPath();
      ctx.moveTo(d0.x, d0.y + 10);
      ctx.lineTo(d1.x, d1.y + 10);
      ctx.lineTo(d1.x - stepExt, d1.y + 14);
      ctx.lineTo(d0.x - stepExt, d0.y + 14);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#a8a29e';
      ctx.beginPath();
      ctx.moveTo(d0.x, d0.y + 8);
      ctx.lineTo(d1.x, d1.y + 8);
      ctx.lineTo(d1.x - 3, d1.y + 11);
      ctx.lineTo(d0.x - 3, d0.y + 11);
      ctx.closePath();
      ctx.fill();
    };

    // Door & Windows on Ground Floor
    const winH = Math.min(14, Math.max(10, wallH - plinthH - 16));
    if (doorSide === 'left') {
      drawIsoDoor(left, bottom, 0.56, 0.78);
      drawIsoWindow(left, bottom, 0.16, 0.42, plinthH + 7, winH, hasFlowerBoxes);
      drawIsoWindow(bottom, right, 0.25, 0.56, plinthH + 7, winH, hasFlowerBoxes);
    } else {
      drawIsoDoor(bottom, right, 0.24, 0.52);
      drawIsoWindow(left, bottom, 0.16, 0.42, plinthH + 7, winH, hasFlowerBoxes);
      drawIsoWindow(left, bottom, 0.56, 0.82, plinthH + 7, winH, hasFlowerBoxes);
    }

    // Boutique Showcase Window Display Items (Clothes, Hat, Shoes) for Aunty Gyi Clothing Shop
    if (signType === 'clothing') {
      const lw = lerpPt(left, bottom, 0.29, -(plinthH + 7 + winH / 2));
      // Mini mannequin dress (coral-pink) & straw sun hat inside left display window
      ctx.fillStyle = '#e11d48';
      ctx.fillRect(lw.x - 3, lw.y - 2, 4, 4);
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.moveTo(lw.x - 4, lw.y + 5);
      ctx.lineTo(lw.x + 2, lw.y + 5);
      ctx.lineTo(lw.x + 1, lw.y + 1);
      ctx.lineTo(lw.x - 3, lw.y + 1);
      ctx.closePath();
      ctx.fill();
      // Tiny golden sunhat beside dress
      ctx.fillStyle = '#d97706';
      ctx.fillRect(lw.x + 1.5, lw.y - 4.5, 5, 1.8);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(lw.x + 2.5, lw.y - 6.2, 3, 2);

      const rw = lerpPt(bottom, right, 0.405, -(plinthH + 7 + winH / 2));
      // Mini teal boutique coat/t-shirt + brown leather boots in right display window
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(rw.x - 4.5, rw.y - 4, 5, 5.5);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(rw.x - 5.5, rw.y - 3.5, 1.5, 3);
      ctx.fillRect(rw.x + 0.2, rw.y - 3.5, 1.5, 3);
      // Pair of crisp brown shoes/boots
      ctx.fillStyle = '#451a03';
      ctx.fillRect(rw.x + 1.5, rw.y + 1.5, 2.5, 3.2);
      ctx.fillRect(rw.x + 4.5, rw.y + 1.5, 2.5, 3.2);
    }

    // Blacksmith Glowing Forge Hearth on Right Wall
    if (hasForgeHearth) {
      const f0 = lerpPt(bottom, right, 0.62, -plinthH);
      const f1 = lerpPt(bottom, right, 0.88, -plinthH);
      const fu1 = lerpPt(bottom, right, 0.88, -(plinthH + 19));
      const fu0 = lerpPt(bottom, right, 0.62, -(plinthH + 19));
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.moveTo(f0.x, f0.y);
      ctx.lineTo(f1.x, f1.y);
      ctx.lineTo(fu1.x, fu1.y);
      ctx.lineTo(fu0.x, fu0.y);
      ctx.closePath();
      ctx.fill();
      // Glowing embers inside
      const fg = ctx.createRadialGradient((f0.x + f1.x) / 2, (f0.y + f1.y) / 2 - 5, 1, (f0.x + f1.x) / 2, (f0.y + f1.y) / 2 - 5, 10);
      fg.addColorStop(0, '#fef08a');
      fg.addColorStop(0.5, '#f97316');
      fg.addColorStop(1, 'rgba(220, 38, 38, 0.25)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc((f0.x + f1.x) / 2, (f0.y + f1.y) / 2 - 5, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Optional Striped Shop Awning along Left-Front Wall
    if (hasAwning) {
      const aL = lerpPt(left, bottom, 0.08, -(wallH - 6));
      const aR = lerpPt(left, bottom, 0.50, -(wallH - 6));
      const awSteps = 6;
      for (let i = 0; i < awSteps; i++) {
        const s0 = lerpPt(aL, aR, i / awSteps);
        const s1 = lerpPt(aL, aR, (i + 1) / awSteps);
        ctx.fillStyle = hasAwning.colors[i % 2];
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.lineTo(s1.x - 6, s1.y + 9);
        ctx.lineTo(s0.x - 6, s0.y + 9);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 4. Optional Second Story (Tudor Timber-Framed Upper Level)
    let eaveBase = wallH;
    if (upperH > 0) {
      const uBot = wallH;
      const uTop = wallH + upperH;
      eaveBase = uTop;

      // Left upper face
      ctx.fillStyle = upperLeftColor;
      ctx.beginPath();
      ctx.moveTo(left.x - 2, left.y - uBot);
      ctx.lineTo(bottom.x, bottom.y - uBot + 1);
      ctx.lineTo(bottom.x, bottom.y - uTop + 1);
      ctx.lineTo(left.x - 2, left.y - uTop);
      ctx.closePath();
      ctx.fill();

      // Right upper face (slightly shaded)
      ctx.fillStyle = upperRightColor;
      ctx.beginPath();
      ctx.moveTo(bottom.x, bottom.y - uBot + 1);
      ctx.lineTo(right.x + 2, right.y - uBot);
      ctx.lineTo(right.x + 2, right.y - uTop);
      ctx.lineTo(bottom.x, bottom.y - uTop + 1);
      ctx.closePath();
      ctx.fill();

      if (hasTimberBeams) {
        ctx.strokeStyle = trimColor;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(left.x - 2, left.y - uBot);
        ctx.lineTo(bottom.x, bottom.y - uBot + 1);
        ctx.lineTo(right.x + 2, right.y - uBot);
        ctx.moveTo(left.x - 2, left.y - uTop);
        ctx.lineTo(bottom.x, bottom.y - uTop + 1);
        ctx.lineTo(right.x + 2, right.y - uTop);
        const mL = lerpPt(left, bottom, 0.5);
        ctx.moveTo(mL.x, mL.y - uBot);
        ctx.lineTo(mL.x, mL.y - uTop);
        ctx.moveTo(bottom.x, bottom.y - uBot + 1);
        ctx.lineTo(bottom.x, bottom.y - uTop + 1);
        ctx.stroke();
      }

      // Upper story windows
      const upWinH = Math.max(9, upperH - 9);
      drawIsoWindow(left, bottom, 0.18, 0.40, uBot + 4, upWinH, false);
      drawIsoWindow(left, bottom, 0.58, 0.80, uBot + 4, upWinH, false);
      drawIsoWindow(bottom, right, 0.34, 0.66, uBot + 4, upWinH, false);
    }

    // 5. Brick / Stone Chimney (drawn behind roof ridge)
    if (chimneySide !== 'none') {
      const chBase = chimneySide === 'back'
        ? lerpPt(top, right, 0.35, -(eaveBase + roofH * 0.55))
        : lerpPt(bottom, right, 0.55, -(eaveBase + roofH * 0.65));
      ctx.fillStyle = chimneySide === 'back' ? '#991b1b' : '#57534e';
      ctx.fillRect(chBase.x - 6, chBase.y - 20, 12, 24);
      ctx.fillStyle = chimneySide === 'back' ? '#7f1d1d' : '#44403c';
      ctx.fillRect(chBase.x, chBase.y - 20, 6, 24);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(chBase.x - 7, chBase.y - 22, 14, 3);
      // Soft rising smoke puffs
      ctx.fillStyle = 'rgba(241, 245, 249, 0.65)';
      ctx.beginPath();
      ctx.arc(chBase.x + 1, chBase.y - 27, 3.4, 0, Math.PI * 2);
      ctx.arc(chBase.x + 4, chBase.y - 33, 4.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Pitched Isometric Gable Roof (ridge runs along left->bottom axis for crisp silhouette)
    const eaveOver = 6;
    const eaveLeft = { x: left.x - eaveOver, y: left.y - eaveBase + 3 };
    const eaveBot = { x: bottom.x, y: bottom.y - eaveBase + 5 };
    const eaveRight = { x: right.x + eaveOver, y: right.y - eaveBase + 3 };
    const eaveTop = { x: top.x, y: top.y - eaveBase - 1 };

    const ridgeBack = {
      x: (eaveLeft.x + eaveTop.x) / 2,
      y: (eaveLeft.y + eaveTop.y) / 2 - roofH,
    };
    const ridgeFront = {
      x: (eaveBot.x + eaveRight.x) / 2,
      y: (eaveBot.y + eaveRight.y) / 2 - roofH,
    };

    // Back-top roof slope (visible slightly at top)
    ctx.fillStyle = roofDarkColor;
    ctx.beginPath();
    ctx.moveTo(eaveTop.x, eaveTop.y);
    ctx.lineTo(eaveRight.x, eaveRight.y);
    ctx.lineTo(ridgeFront.x, ridgeFront.y);
    ctx.lineTo(ridgeBack.x, ridgeBack.y);
    ctx.closePath();
    ctx.fill();

    // Right Gable Triangle Wall (eaveBot -> eaveRight -> ridgeFront)
    ctx.fillStyle = roofGableColor;
    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y - eaveBase + 1);
    ctx.lineTo(right.x, right.y - eaveBase);
    ctx.lineTo(ridgeFront.x, ridgeFront.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = trimColor;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Decorative Attic Vent inside Gable Triangle
    const gableCx = (bottom.x + right.x + ridgeFront.x) / 3;
    const gableCy = (bottom.y - eaveBase + right.y - eaveBase + ridgeFront.y) / 3;
    ctx.fillStyle = trimColor;
    ctx.beginPath();
    ctx.arc(gableCx, gableCy, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Front-Left Sunlit Roof Slope (eaveLeft -> eaveBot -> ridgeFront -> ridgeBack)
    const roofGrad = ctx.createLinearGradient(ridgeBack.x, ridgeBack.y, eaveBot.x, eaveBot.y);
    roofGrad.addColorStop(0, roofLightColor);
    roofGrad.addColorStop(1, roofDarkColor);
    ctx.fillStyle = roofGrad;
    ctx.beginPath();
    ctx.moveTo(eaveLeft.x, eaveLeft.y);
    ctx.lineTo(eaveBot.x, eaveBot.y);
    ctx.lineTo(ridgeFront.x, ridgeFront.y);
    ctx.lineTo(ridgeBack.x, ridgeBack.y);
    ctx.closePath();
    ctx.fill();

    // Crisp Layered Roof Shingle Courses
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 1.1;
    for (let r = 0.2; r <= 0.82; r += 0.2) {
      const p0 = lerpPt(ridgeBack, eaveLeft, r);
      const p1 = lerpPt(ridgeFront, eaveBot, r);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    // Overhang Eaves Trim & Ridge Cap Highlight
    ctx.strokeStyle = trimColor;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(eaveLeft.x, eaveLeft.y);
    ctx.lineTo(eaveBot.x, eaveBot.y);
    ctx.lineTo(ridgeFront.x, ridgeFront.y);
    ctx.lineTo(eaveRight.x, eaveRight.y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(ridgeBack.x, ridgeBack.y);
    ctx.lineTo(ridgeFront.x, ridgeFront.y);
    ctx.stroke();

    // Optional Dormer Window on Roof (for Manor / Grand Villa)
    if (hasDormer) {
      const dm = lerpPt(lerpPt(ridgeBack, ridgeFront, 0.5), lerpPt(eaveLeft, eaveBot, 0.5), 0.45);
      ctx.fillStyle = upperLeftColor;
      ctx.fillRect(dm.x - 8, dm.y - 9, 16, 12);
      ctx.fillStyle = roofDarkColor;
      ctx.beginPath();
      ctx.moveTo(dm.x - 10, dm.y - 9);
      ctx.lineTo(dm.x, dm.y - 17);
      ctx.lineTo(dm.x + 10, dm.y - 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(dm.x - 4.5, dm.y - 7, 9, 7);
    }

    // 7. Hanging Shop Signboard & Porch Lantern Sconce near front corner
    if (signType !== 'none') {
      const sconcePos = lerpPt(left, bottom, 0.49, -(plinthH + 22));
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(sconcePos.x - 1.5, sconcePos.y - 3, 3, 5);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(sconcePos.x - 1, sconcePos.y - 1.5, 2, 2.5);

      const sp = lerpPt(left, bottom, 0.88, -(wallH - 9));
      // Wrought-iron hanging bracket & chain hooks
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(sp.x - 8, sp.y - 3, 16, 2);
      ctx.fillRect(sp.x - 4, sp.y - 1, 1.5, 2);
      ctx.fillRect(sp.x + 2.5, sp.y - 1, 1.5, 2);
      ctx.fillStyle = '#fef3c7';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(sp.x - 6.5, sp.y, 13, 10.5, 2);
      ctx.fill();
      ctx.stroke();

      if (signType === 'bakery') {
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y + 5.2, 4.2, 2.3, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(sp.x - 1.5, sp.y + 4.4, 3, 1);
      } else if (signType === 'general') {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y + 5.2, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fef9c3';
        ctx.fillRect(sp.x - 0.8, sp.y + 3.6, 1.6, 3.2);
      } else if (signType === 'grocery') {
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(sp.x - 1.6, sp.y + 5.5, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#16a34a';
        ctx.beginPath();
        ctx.arc(sp.x + 2, sp.y + 5.2, 2.1, 0, Math.PI * 2);
        ctx.fill();
      } else if (signType === 'blacksmith') {
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sp.x - 3, sp.y + 7.2);
        ctx.lineTo(sp.x + 3, sp.y + 3.2);
        ctx.stroke();
        ctx.fillStyle = '#475569';
        ctx.fillRect(sp.x + 1, sp.y + 2, 3.5, 2.5);
      } else if (signType === 'florist') {
        ctx.fillStyle = '#ec4899';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y + 5.2, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#facc15';
        ctx.fillRect(sp.x - 0.9, sp.y + 4.3, 1.8, 1.8);
      } else if (signType === 'clothing') {
        // Boutique wooden hanger & rose-magenta tunic/dress emblem on hanging sign
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(sp.x - 3.6, sp.y + 3.6);
        ctx.lineTo(sp.x, sp.y + 1.8);
        ctx.lineTo(sp.x + 3.6, sp.y + 3.6);
        ctx.stroke();
        ctx.fillStyle = '#db2777';
        ctx.beginPath();
        ctx.moveTo(sp.x - 2.2, sp.y + 3.6);
        ctx.lineTo(sp.x + 2.2, sp.y + 3.6);
        ctx.lineTo(sp.x + 3.4, sp.y + 8.6);
        ctx.lineTo(sp.x - 3.4, sp.y + 8.6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fbcfe8';
        ctx.fillRect(sp.x - 1.2, sp.y + 4.8, 2.4, 1);
      }
    }

    return canvas;
  }

  // 12A. Cozy Wooden Cottage (2x2 Isometric Building - Proportioned Properly vs Player)
  private static createHouseSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('bld_house_small')) return;
    const canvas = this.drawIsoBuildingCanvas({
      canvasW: 164,
      canvasH: 176,
      baseCenterY: 132,
      tileW: 2,
      tileH: 2,
      wallH: 46,
      roofH: 38,
      wallLeftColor: '#b4742a',
      wallRightColor: '#8c5319',
      roofLightColor: '#c2571a',
      roofDarkColor: '#923a0f',
      roofGableColor: '#9c6121',
      doorSide: 'left',
      hasFlowerBoxes: true,
      chimneySide: 'back',
      footprintScale: 0.94,
    });
    textures.addCanvas('bld_house_small', canvas);
    textures.addCanvas('obj_house_small', canvas);
  }

  // 12B. Timber Manor (3x2 Two-Story Medium House)
  private static createMediumHouseSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('bld_house_medium')) return;
    const canvas = this.drawIsoBuildingCanvas({
      canvasW: 208,
      canvasH: 212,
      baseCenterY: 158,
      tileW: 3,
      tileH: 2,
      wallH: 44,
      upperH: 30,
      roofH: 40,
      wallLeftColor: '#9a5b25',
      wallRightColor: '#754116',
      upperLeftColor: '#fef3c7',
      upperRightColor: '#e7d5a9',
      roofLightColor: '#b93822',
      roofDarkColor: '#882414',
      roofGableColor: '#e7d5a9',
      doorSide: 'left',
      hasFlowerBoxes: true,
      hasDormer: true,
      hasTimberBeams: true,
      chimneySide: 'back',
      footprintScale: 0.94,
    });
    textures.addCanvas('bld_house_medium', canvas);
    textures.addCanvas('obj_house_medium', canvas);
  }

  // 12C. Grand Homestead Villa (3x3 Large Two-Story Villa)
  private static createLargeHouseSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('bld_house_large')) return;
    const canvas = this.drawIsoBuildingCanvas({
      canvasW: 248,
      canvasH: 242,
      baseCenterY: 178,
      tileW: 3,
      tileH: 3,
      wallH: 48,
      upperH: 34,
      roofH: 46,
      wallLeftColor: '#d6cfc2',
      wallRightColor: '#b5ada0',
      upperLeftColor: '#fef9c3',
      upperRightColor: '#e9dfaf',
      roofLightColor: '#3b6e8c',
      roofDarkColor: '#254b63',
      roofGableColor: '#e9dfaf',
      doorSide: 'left',
      hasFlowerBoxes: true,
      hasDormer: true,
      hasTimberBeams: true,
      chimneySide: 'back',
      footprintScale: 0.95,
    });
    textures.addCanvas('bld_house_large', canvas);
    textures.addCanvas('obj_house_large', canvas);
  }

  // 13. Clean Isometric Grid-Aligned Wooden Fence (4 rotations: 0=NW-SE, 1=NE-SW, 2=NW-SE Braced, 3=NE-SW Braced)
  private static createFenceSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('obj_fence_wood_0')) return;

    // 64x56 canvas centered on tile diamond at (32, 38) -> originY = 38 / 56
    // Diamond edge midpoints:
    //   NW-SE axis (along tx): Left-Top edge (16, 30) <-> Right-Bottom edge (48, 46)
    //   NE-SW axis (along ty): Right-Top edge (48, 30) <-> Left-Bottom edge (16, 46)
    const drawFenceCanvas = (rot: 0 | 1 | 2 | 3) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 56;
      const ctx = canvas.getContext('2d')!;

      const isAxisX = rot % 2 === 0; // 0 & 2 align along tx (NW -> SE); 1 & 3 align along ty (NE -> SW)
      const isBracedVariant = rot >= 2;

      const startX = isAxisX ? 16 : 48;
      const startY = 30;
      const endX = isAxisX ? 48 : 16;
      const endY = 46;
      const midX = 32;
      const midY = 38;

      // Ground contact shadow along isometric line
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.32)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, startY + 2);
      ctx.lineTo(endX, endY + 2);
      ctx.stroke();

      // Helper to draw a shaded vertical post anchored at ground (px, py)
      const drawPost = (px: number, py: number, height: number, width = 5) => {
        const halfW = Math.floor(width / 2);
        // Shadow side
        ctx.fillStyle = '#5c2808';
        ctx.fillRect(px - halfW, py - height, width, height);
        // Lit side (sun from top-left)
        ctx.fillStyle = isAxisX ? '#854d0e' : '#9a5b13';
        ctx.fillRect(px - halfW, py - height, Math.max(2, width - 2), height);
        // Beveled wooden cap
        ctx.fillStyle = '#d97706';
        ctx.fillRect(px - halfW - 1, py - height - 2, width + 2, 3);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(px - halfW - 1, py - height - 2, width, 1);
      };

      // Back post first (upper in isometric depth)
      drawPost(startX, startY, 17, 5);

      // Isometric sloped horizontal rails (edge-to-edge seamless connection!)
      const drawRail = (offsetY: number, thickness: number, color: string, highlight: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(startX, startY - offsetY);
        ctx.lineTo(endX, endY - offsetY);
        ctx.stroke();

        // Top bevel highlight
        ctx.strokeStyle = highlight;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(startX, startY - offsetY - thickness / 2);
        ctx.lineTo(endX, endY - offsetY - thickness / 2);
        ctx.stroke();
      };

      // Bottom rail & Top rail
      drawRail(6, 3.5, '#78350f', '#b45309');
      drawRail(13, 3.5, '#92400e', '#d97706');

      if (isBracedVariant) {
        // Diagonal cross-brace / picket detail to visually distinguish rotations 2 & 3
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX + (endX - startX) * 0.2, startY + (endY - startY) * 0.2 - 12);
        ctx.lineTo(endX - (endX - startX) * 0.2, endY - (endY - startY) * 0.2 - 5);
        ctx.stroke();
      }

      // Center post
      drawPost(midX, midY, isBracedVariant ? 20 : 18, isBracedVariant ? 6 : 5);

      // Front post last (closest to viewer)
      drawPost(endX, endY, 17, 5);

      return canvas;
    };

    const c0 = drawFenceCanvas(0);
    const c1 = drawFenceCanvas(1);
    const c2 = drawFenceCanvas(2);
    const c3 = drawFenceCanvas(3);

    textures.addCanvas('obj_fence_wood_0', c0);
    textures.addCanvas('obj_fence_wood_1', c1);
    textures.addCanvas('obj_fence_wood_2', c2);
    textures.addCanvas('obj_fence_wood_3', c3);
    textures.addCanvas('bld_fence_wood', c0);
    textures.addCanvas('obj_fence_wood', c0);
  }

  // 14. Campfire (Lit & Unlit)
  private static createCampfireSprites(textures: Phaser.Textures.TextureManager) {
    // Lit Campfire
    if (!textures.exists('bld_campfire_lit')) {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 44;
      const ctx = canvas.getContext('2d')!;

      // Ambient warm light glow
      const glow = ctx.createRadialGradient(24, 28, 4, 24, 28, 22);
      glow.addColorStop(0, 'rgba(245, 158, 11, 0.45)');
      glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(24, 28, 22, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Stone ring
      ctx.fillStyle = '#57534e';
      const stones = [[12, 28], [17, 32], [24, 34], [31, 32], [36, 28], [33, 24], [24, 22], [15, 24]];
      for (const [sx, sy] of stones) {
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Crossed logs
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(16, 24);
      ctx.lineTo(32, 32);
      ctx.moveTo(32, 24);
      ctx.lineTo(16, 32);
      ctx.stroke();

      // Burning ember center
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(24, 28, 5, 0, Math.PI * 2);
      ctx.fill();

      // Stylized dancing fire tongues
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(18, 27);
      ctx.quadraticCurveTo(24, 12, 22, 8);
      ctx.quadraticCurveTo(25, 16, 28, 12);
      ctx.quadraticCurveTo(31, 18, 30, 27);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(21, 26);
      ctx.quadraticCurveTo(24, 16, 23, 13);
      ctx.quadraticCurveTo(26, 20, 27, 26);
      ctx.closePath();
      ctx.fill();

      textures.addCanvas('bld_campfire_lit', canvas);
      textures.addCanvas('bld_campfire', canvas); // alias
      textures.addCanvas('obj_campfire', canvas);
      textures.addCanvas('obj_campfire_lit', canvas);
    }

    // Unlit Campfire
    if (!textures.exists('bld_campfire_off')) {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 44;
      const ctx = canvas.getContext('2d')!;

      // Stone ring
      ctx.fillStyle = '#57534e';
      const stones = [[12, 28], [17, 32], [24, 34], [31, 32], [36, 28], [33, 24], [24, 22], [15, 24]];
      for (const [sx, sy] of stones) {
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cold ash
      ctx.fillStyle = '#292524';
      ctx.beginPath();
      ctx.arc(24, 28, 6, 0, Math.PI * 2);
      ctx.fill();

      // Wood logs
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(16, 24);
      ctx.lineTo(32, 32);
      ctx.moveTo(32, 24);
      ctx.lineTo(16, 32);
      ctx.stroke();

      textures.addCanvas('bld_campfire_off', canvas);
    }
  }

  // 15. Sturdy Cedar Storage Chest
  private static createStorageBoxSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('bld_storage_box')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 44;
    canvas.height = 40;
    const ctx = canvas.getContext('2d')!;

    // Shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.beginPath();
    ctx.ellipse(22, 34, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Chest box body
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.roundRect(8, 16, 28, 18, 3);
    ctx.fill();

    // Cedar wood tone
    ctx.fillStyle = '#92400e';
    ctx.fillRect(10, 18, 24, 14);

    // Brass corner braces and trim
    ctx.fillStyle = '#d97706';
    ctx.fillRect(8, 16, 4, 18);
    ctx.fillRect(32, 16, 4, 18);
    ctx.fillRect(8, 24, 28, 3);

    // Front Brass Keyhole Clasp
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.roundRect(19, 21, 6, 7, 2);
    ctx.fill();
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(21.5, 24, 1.5, 2.5);

    textures.addCanvas('bld_storage_box', canvas);
    textures.addCanvas('obj_storage_box', canvas);
  }

  // 16. Wrought-Iron Lantern Post with Ambient Warm Light Halo (base aligned to originY=0.9)
  private static createLanternSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('bld_lantern')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 54;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Soft SE ground contact shadow + warm light spill aligned to y=57 (originY=0.9)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.32)';
    ctx.beginPath();
    ctx.ellipse(29, 57.5, 9.5, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();

    const halo = ctx.createRadialGradient(27, 56, 2, 27, 56, 24);
    halo.addColorStop(0, 'rgba(251, 191, 36, 0.36)');
    halo.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(27, 56, 24, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base stone/iron footing anchored flush at y=58 (0.9 * 64 = 57.6)
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(23, 53, 8, 5);
    ctx.fillStyle = '#44403c';
    ctx.fillRect(24, 53, 6, 2);

    // Timber / Iron Post with sunlit left edge
    ctx.fillStyle = '#451a03';
    ctx.fillRect(25.5, 24, 3, 30);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(25.5, 25, 1.3, 28);

    // Hanging cross-bracket & top cap
    ctx.fillStyle = '#292524';
    ctx.fillRect(22, 22, 14, 3);
    ctx.fillRect(32, 25, 2, 4);

    // Lantern Glass & Flame
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.roundRect(29, 28, 8, 12, 2);
    ctx.fill();
    ctx.fillStyle = '#57534e';
    ctx.fillRect(30, 28, 6, 1.2);

    // Glowing amber glass
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(30.5, 30, 5, 8);

    // Core bright wick
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(32, 33, 2, 2);

    textures.addCanvas('bld_lantern', canvas);
    textures.addCanvas('obj_lantern', canvas);
  }

  // 17. Vibrant Market Shop Stall
  private static createShopStallSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('obj_shop_stall')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 84;
    canvas.height = 76;
    const ctx = canvas.getContext('2d')!;

    // Shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.beginPath();
    ctx.ellipse(42, 66, 34, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wooden counter table
    ctx.fillStyle = '#78350f';
    ctx.fillRect(18, 42, 48, 22);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(16, 40, 52, 6);

    // Crates & Goods on Counter
    // Fruit crate (apples)
    ctx.fillStyle = '#a16207';
    ctx.fillRect(20, 34, 14, 8);
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(24, 34, 2, 0, Math.PI * 2);
    ctx.arc(28, 33, 2, 0, Math.PI * 2);
    ctx.arc(31, 35, 2, 0, Math.PI * 2);
    ctx.fill();

    // Glass potion flasks
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(40, 33, 4, 7);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(47, 33, 4, 7);

    // Corner Support Poles
    ctx.fillStyle = '#451a03';
    ctx.fillRect(16, 12, 3, 30);
    ctx.fillRect(65, 12, 3, 30);

    // Striped Canvas Awning (Burgundy & Cream)
    const stripes = ['#881337', '#fef08a', '#881337', '#fef08a', '#881337', '#fef08a', '#881337'];
    const sw = 56 / stripes.length;
    for (let i = 0; i < stripes.length; i++) {
      ctx.fillStyle = stripes[i];
      ctx.beginPath();
      ctx.moveTo(14 + i * sw, 14);
      ctx.lineTo(14 + (i + 1) * sw, 14);
      ctx.lineTo(16 + (i + 1) * sw, 28);
      ctx.lineTo(16 + i * sw, 28);
      ctx.closePath();
      ctx.fill();

      // Scalloped bottom fringe
      ctx.beginPath();
      ctx.arc(16 + i * sw + sw / 2, 28, sw / 2, 0, Math.PI);
      ctx.fill();
    }

    textures.addCanvas('obj_shop_stall', canvas);
  }

  // 18. Town Crafting Workbench & Anvil
  private static createCraftingBenchSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('obj_craft_bench')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 68;
    canvas.height = 56;
    const ctx = canvas.getContext('2d')!;

    // Shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.beginPath();
    ctx.ellipse(34, 46, 26, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wooden workbench table
    ctx.fillStyle = '#593207';
    ctx.fillRect(14, 30, 28, 16);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(12, 26, 32, 6);

    // Carpenter's hand saw & hammer on table
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, 25);
    ctx.lineTo(24, 25);
    ctx.stroke();

    // Heavy Iron Anvil on Tree Stump
    ctx.fillStyle = '#451a03';
    ctx.fillRect(44, 32, 14, 14);

    // Cast Iron Anvil
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(42, 26);
    ctx.lineTo(58, 26);
    ctx.lineTo(56, 30);
    ctx.lineTo(44, 30);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#64748b';
    ctx.fillRect(47, 30, 6, 3);
    ctx.fillRect(45, 33, 10, 2);

    textures.addCanvas('obj_craft_bench', canvas);
  }

  // 19. Carved Limestone Town Fountain (Tiered Rim, Mossy Base & Sparkling Jets)
  private static createFountainSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('obj_town_fountain')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 76;
    canvas.height = 72;
    const ctx = canvas.getContext('2d')!;

    // Soft SE cast ground shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.40)';
    ctx.beginPath();
    ctx.ellipse(40.5, 59.5, 32, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stone stepped base & outer masonry wall
    ctx.fillStyle = '#57534e';
    ctx.beginPath();
    ctx.ellipse(38, 50, 30, 14.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.ellipse(38, 47, 29, 13.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle moss flecks along stone footing
    ctx.fillStyle = '#65a30d';
    ctx.fillRect(15, 53, 4, 2);
    ctx.fillRect(54, 54, 4, 2);

    // Chiseled limestone basin rim
    ctx.fillStyle = '#d6d3d1';
    ctx.beginPath();
    ctx.ellipse(38, 44.5, 26.5, 11.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a8a29e';
    ctx.beginPath();
    ctx.ellipse(38, 45.2, 24.5, 10.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shimmering turquoise water pool
    const poolGrad = ctx.createRadialGradient(38, 44, 2, 38, 45, 23);
    poolGrad.addColorStop(0, '#38bdf8');
    poolGrad.addColorStop(0.65, '#06b6d4');
    poolGrad.addColorStop(1, '#0e7490');
    ctx.fillStyle = poolGrad;
    ctx.beginPath();
    ctx.ellipse(38, 45, 21.5, 8.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Center tiered pedestal & upper bowl
    ctx.fillStyle = '#57534e';
    ctx.fillRect(34, 26, 8, 19);
    ctx.fillStyle = '#a8a29e';
    ctx.fillRect(35, 27, 3, 17);
    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.ellipse(38, 28.5, 13, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d6d3d1';
    ctx.beginPath();
    ctx.ellipse(38, 26.5, 12, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(38, 26.5, 8.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Top finial spire
    ctx.fillStyle = '#78716c';
    ctx.fillRect(36, 17, 4, 9);
    ctx.fillStyle = '#e7e5e4';
    ctx.beginPath();
    ctx.arc(38, 16, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Graceful water arcs & splash rings
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(38, 14);
    ctx.quadraticCurveTo(30, 12, 23, 41);
    ctx.moveTo(38, 14);
    ctx.quadraticCurveTo(46, 12, 53, 41);
    ctx.moveTo(32, 27);
    ctx.quadraticCurveTo(28, 34, 27, 44);
    ctx.moveTo(44, 27);
    ctx.quadraticCurveTo(48, 34, 49, 44);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(224, 242, 254, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(38, 45, 12.5, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(22, 40, 2, 1.5);
    ctx.fillRect(52, 40, 2, 1.5);
    ctx.fillRect(37, 11, 2, 1.5);

    textures.addCanvas('obj_town_fountain', canvas);
  }

  // 20. Water Environment Props (Water Lilies, Wetland Reeds, River Stones)
  private static createWaterEnvironmentSprites(textures: Phaser.Textures.TextureManager) {
    // 1. Water Lilypad Cluster with blooming lotus flower (36x24)
    if (!textures.exists('obj_lilypad')) {
      const canvas = document.createElement('canvas');
      canvas.width = 36;
      canvas.height = 24;
      const ctx = canvas.getContext('2d')!;

      // Water ripple beneath lilypad
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(18, 14, 15, 6, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Main emerald lilypad with characteristic wedge notch
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(16, 13, 9, 0.35, Math.PI * 1.85);
      ctx.lineTo(16, 13);
      ctx.closePath();
      ctx.fill();

      // Sunlit leaf surface
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(16, 13, 7.5, 0.4, Math.PI * 1.8);
      ctx.lineTo(16, 13);
      ctx.closePath();
      ctx.fill();

      // Secondary smaller lilypad
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(26, 15, 5, 0.5, Math.PI * 1.9);
      ctx.lineTo(26, 15);
      ctx.closePath();
      ctx.fill();

      // Blooming pink water lotus flower
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(17, 10, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbcfe8';
      ctx.beginPath();
      ctx.arc(17, 9.5, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a'; // Golden stamen center
      ctx.fillRect(16.5, 9, 1.5, 1.5);

      textures.addCanvas('obj_lilypad', canvas);
      textures.addCanvas('res_lilypad', canvas);
    }

    // 2. Wetland Reeds & Cattails (32x44)
    if (!textures.exists('obj_water_reed')) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 44;
      const ctx = canvas.getContext('2d')!;

      // Water ripple at stem base
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(16, 38, 11, 4, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Slender green reed stalks
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Left reed
      ctx.moveTo(12, 38);
      ctx.quadraticCurveTo(8, 24, 7, 10);
      // Center tall cattail
      ctx.moveTo(16, 38);
      ctx.quadraticCurveTo(16, 20, 16, 4);
      // Right reed
      ctx.moveTo(20, 38);
      ctx.quadraticCurveTo(24, 22, 25, 12);
      ctx.stroke();

      // Sunlight highlights on stems
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(15.5, 36);
      ctx.lineTo(15.5, 16);
      ctx.moveTo(11.5, 36);
      ctx.lineTo(8, 14);
      ctx.stroke();

      // Brown velvety cattail heads
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.roundRect(14.5, 6, 3.5, 10, [2]);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(6, 12, 3, 8, [2]);
      ctx.fill();
      ctx.fillStyle = '#92400e';
      ctx.fillRect(15, 7, 1.5, 8); // highlight

      textures.addCanvas('obj_water_reed', canvas);
      textures.addCanvas('res_water_reed', canvas);
    }

    // 3. Smooth Submerged River Stones (34x22)
    if (!textures.exists('obj_river_stone')) {
      const canvas = document.createElement('canvas');
      canvas.width = 34;
      canvas.height = 22;
      const ctx = canvas.getContext('2d')!;

      // Water ripple ring around stones
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(17, 14, 14, 6, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Main smooth granite stone
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.ellipse(15, 12, 9, 5, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.ellipse(14, 11, 7, 3.5, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.ellipse(13, 10, 4, 1.8, -0.15, 0, Math.PI * 2);
      ctx.fill();

      // Smaller companion pebble
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.ellipse(24, 14, 5, 3.5, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.ellipse(24, 13.5, 3.5, 2.2, 0.2, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('obj_river_stone', canvas);
      textures.addCanvas('res_river_stone', canvas);
    }
  }

  // 21. Charming Town Props & Architecture (Cottages, Bakery Stall, Benches, Flower Planters, Crates, Barrels, Signposts)
  private static createTownPropsAndBuildings(textures: Phaser.Textures.TextureManager) {
    // 1. Cozy Two-Story Town Residence / Cottage (2x2 True Isometric Architecture)
    if (!textures.exists('obj_town_house')) {
      const canvas = this.drawIsoBuildingCanvas({
        canvasW: 164,
        canvasH: 192,
        baseCenterY: 146,
        tileW: 2,
        tileH: 2,
        wallH: 40,
        upperH: 26,
        roofH: 34,
        wallLeftColor: '#78716c',
        wallRightColor: '#57534e',
        upperLeftColor: '#fef3c7',
        upperRightColor: '#e7d5a9',
        roofLightColor: '#c2571a',
        roofDarkColor: '#8d360e',
        roofGableColor: '#e7d5a9',
        doorSide: 'left',
        hasFlowerBoxes: true,
        hasTimberBeams: true,
        chimneySide: 'back',
        footprintScale: 0.94,
      });
      textures.addCanvas('obj_town_house', canvas);
      textures.addCanvas('bld_town_house', canvas);
    }

    // 2. Village Bakery Stall (64x56)
    if (!textures.exists('obj_bakery_stall')) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 56;
      const ctx = canvas.getContext('2d')!;

      // Drop shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      ctx.beginPath();
      ctx.ellipse(32, 49, 28, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wooden counter & shelves
      ctx.fillStyle = '#78350f';
      ctx.fillRect(10, 32, 44, 18);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(8, 30, 48, 4);

      // Fresh bakery goods on counter
      // Braided golden challah bread
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.ellipse(18, 28, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(16, 27, 4, 1.5);

      // Crusty golden baguettes
      ctx.fillStyle = '#b45309';
      ctx.fillRect(28, 24, 3, 8);
      ctx.fillRect(32, 23, 3, 9);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(28.5, 25, 2, 2);
      ctx.fillRect(32.5, 24, 2, 2);

      // Round rustic berry pies
      ctx.fillStyle = '#9a3412';
      ctx.beginPath();
      ctx.ellipse(44, 28, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dc2626'; // berry center
      ctx.fillRect(43, 27, 2, 2);

      // Wooden support poles
      ctx.fillStyle = '#451a03';
      ctx.fillRect(10, 10, 3, 22);
      ctx.fillRect(51, 10, 3, 22);

      // Scalloped striped canopy (Warm Terracotta & Buttercream)
      const canopyStripes = ['#c2410c', '#fef9c3', '#c2410c', '#fef9c3', '#c2410c', '#fef9c3'];
      const cw = 48 / canopyStripes.length;
      for (let i = 0; i < canopyStripes.length; i++) {
        ctx.fillStyle = canopyStripes[i];
        ctx.fillRect(8 + i * cw, 10, cw, 12);
        // Scallop bottom
        ctx.beginPath();
        ctx.arc(8 + i * cw + cw / 2, 22, cw / 2, 0, Math.PI);
        ctx.fill();
      }

      textures.addCanvas('obj_bakery_stall', canvas);
    }

    // 3. Carved Cedar Park Bench with Cast-Iron Arms (42x28)
    if (!textures.exists('obj_bench')) {
      const canvas = document.createElement('canvas');
      canvas.width = 42;
      canvas.height = 28;
      const ctx = canvas.getContext('2d')!;

      // SE Drop shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(22.5, 23.5, 18, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cast iron legs and armrests
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(8, 14, 2.5, 10);
      ctx.fillRect(31.5, 14, 2.5, 10);
      ctx.fillRect(7, 10, 3, 5);
      ctx.fillRect(32, 10, 3, 5);

      // Wooden seat slats
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(6, 14, 30, 3);
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(6, 18, 30, 3);
      // Wooden backrest slats + sunlit top rim
      ctx.fillStyle = '#b45309';
      ctx.fillRect(6, 7, 30, 3);
      ctx.fillRect(6, 11, 30, 3);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(6, 7, 28, 1.2);

      textures.addCanvas('obj_bench', canvas);
    }

    // 4. Barrel Planter with Blooming Flowers (28x32)
    if (!textures.exists('obj_flower_pot')) {
      const canvas = document.createElement('canvas');
      canvas.width = 28;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;

      // SE Drop shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
      ctx.beginPath();
      ctx.ellipse(15.5, 28.5, 11, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Oak wooden half-barrel
      ctx.fillStyle = '#5c280b';
      ctx.beginPath();
      ctx.roundRect(5.5, 15.5, 17, 13, [0, 0, 3, 3]);
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.roundRect(6, 16, 16, 12, [0, 0, 3, 3]);
      ctx.fill();
      ctx.fillStyle = '#92400e';
      ctx.fillRect(6.5, 17, 5, 10);
      // Iron metal bands
      ctx.fillStyle = '#334155';
      ctx.fillRect(6, 18, 16, 1.5);
      ctx.fillRect(6, 24, 16, 1.5);

      // Soil crest
      ctx.fillStyle = '#451a03';
      ctx.fillRect(6.5, 15, 15, 2);

      // Lush green foliage
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(14, 12.2, 7.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(13.5, 11.8, 6.2, 0, Math.PI * 2);
      ctx.fill();

      // Multi-colored flowers (sunflowers, roses, lavender)
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(11, 10, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(17, 9, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(14, 14, 2, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('obj_flower_pot', canvas);
    }

    // 5. Wooden Storage Barrel (26x30)
    if (!textures.exists('obj_barrel')) {
      const canvas = document.createElement('canvas');
      canvas.width = 26;
      canvas.height = 30;
      const ctx = canvas.getContext('2d')!;

      // SE Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
      ctx.beginPath();
      ctx.ellipse(14.5, 26.5, 10, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Barrel body outline + curved bulge
      ctx.fillStyle = '#5c280b';
      ctx.beginPath();
      ctx.roundRect(4.5, 6.5, 17, 21, 4.5);
      ctx.fill();
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.roundRect(5, 7, 16, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#b45309';
      ctx.fillRect(6, 9, 4.5, 16);

      // Top wood lid
      ctx.fillStyle = '#c26917';
      ctx.beginPath();
      ctx.ellipse(13, 8, 7, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Steel hoops
      ctx.fillStyle = '#334155';
      ctx.fillRect(5, 10, 16, 2);
      ctx.fillRect(4.5, 16, 17, 2);
      ctx.fillRect(5, 22, 16, 2);

      textures.addCanvas('obj_barrel', canvas);
    }

    // 6. Orchard Produce Fruit Crate (28x24)
    if (!textures.exists('obj_crate_fruit')) {
      const canvas = document.createElement('canvas');
      canvas.width = 28;
      canvas.height = 24;
      const ctx = canvas.getContext('2d')!;

      // SE Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(15.5, 20.5, 12, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Slatted wooden crate
      ctx.fillStyle = '#a16207';
      ctx.fillRect(4, 9, 20, 12);
      ctx.strokeStyle = '#713f12';
      ctx.lineWidth = 1;
      ctx.strokeRect(4, 9, 20, 12);
      ctx.beginPath();
      ctx.moveTo(4, 15);
      ctx.lineTo(24, 15);
      ctx.stroke();

      // Overflowing crisp red and green apples
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(8, 9, 2.5, 0, Math.PI * 2);
      ctx.arc(14, 8, 2.5, 0, Math.PI * 2);
      ctx.arc(19, 9, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#84cc16';
      ctx.beginPath();
      ctx.arc(11, 7, 2.4, 0, Math.PI * 2);
      ctx.arc(16, 7, 2.4, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('obj_crate_fruit', canvas);
    }

    // 7. Village Directional Wooden Signpost (28x44)
    if (!textures.exists('obj_signpost')) {
      const canvas = document.createElement('canvas');
      canvas.width = 28;
      canvas.height = 44;
      const ctx = canvas.getContext('2d')!;

      // SE Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(15.5, 40.5, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Timber post
      ctx.fillStyle = '#5c280b';
      ctx.fillRect(11.5, 8, 5, 32);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(12, 8, 3.5, 32);

      // Top sign board pointing right (Town Plaza)
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.moveTo(6, 12);
      ctx.lineTo(22, 12);
      ctx.lineTo(26, 16);
      ctx.lineTo(22, 20);
      ctx.lineTo(6, 20);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(6, 12, 16, 1.2);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(8, 15, 12, 2);

      // Lower sign board pointing left (Homestead / River)
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.moveTo(22, 22);
      ctx.lineTo(6, 22);
      ctx.lineTo(2, 26);
      ctx.lineTo(6, 30);
      ctx.lineTo(22, 30);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#451a03';
      ctx.fillRect(8, 25, 10, 2);

      textures.addCanvas('obj_signpost', canvas);
    }

    // 8. Tavern Picnic Bench & Table (48x36)
    if (!textures.exists('obj_picnic_table')) {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 36;
      const ctx = canvas.getContext('2d')!;

      // SE Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
      ctx.beginPath();
      ctx.ellipse(25.5, 30.5, 21, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Table legs & frame
      ctx.fillStyle = '#451a03';
      ctx.fillRect(12, 16, 3, 14);
      ctx.fillRect(33, 16, 3, 14);

      // Table top surface
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(8, 14, 32, 6);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(6, 12, 36, 4);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(6, 12, 34, 1.2);

      // Bench seats on either side
      ctx.fillStyle = '#78350f';
      ctx.fillRect(6, 22, 36, 3);
      ctx.fillRect(6, 26, 36, 3);

      // Cider tankard on table
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(22, 8, 4, 4);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(22, 7, 4, 1.5);

      textures.addCanvas('obj_picnic_table', canvas);
    }
  }

  // 21B. Integrated Village Shop Buildings (3x2 & 2x2) + Front Display Shelves/Racks
  private static createVillageShopBuildings(textures: Phaser.Textures.TextureManager) {
    // 1. Village Bakery House (3x2)
    if (!textures.exists('obj_house_bakery')) {
      const canvas = this.drawIsoBuildingCanvas({
        canvasW: 208,
        canvasH: 212,
        baseCenterY: 158,
        tileW: 3,
        tileH: 2,
        wallH: 48,
        roofH: 40,
        wallLeftColor: '#f5deb3',
        wallRightColor: '#d9bc8c',
        roofLightColor: '#ea580c',
        roofDarkColor: '#9a3412',
        roofGableColor: '#e2c598',
        doorSide: 'left',
        hasAwning: { colors: ['#ea580c', '#fef3c7'] },
        hasFlowerBoxes: true,
        chimneySide: 'back',
        footprintScale: 0.94,
        signType: 'bakery',
      });
      textures.addCanvas('obj_house_bakery', canvas);
    }

    // 2. General Store (3x2)
    if (!textures.exists('obj_house_general')) {
      const canvas = this.drawIsoBuildingCanvas({
        canvasW: 208,
        canvasH: 220,
        baseCenterY: 164,
        tileW: 3,
        tileH: 2,
        wallH: 44,
        upperH: 24,
        roofH: 36,
        wallLeftColor: '#9f1239',
        wallRightColor: '#6d0d27',
        upperLeftColor: '#fde68a',
        upperRightColor: '#d9c074',
        roofLightColor: '#475569',
        roofDarkColor: '#334155',
        roofGableColor: '#d9c074',
        doorSide: 'left',
        hasAwning: { colors: ['#881337', '#fef08a'] },
        hasFlowerBoxes: false,
        chimneySide: 'none',
        footprintScale: 0.94,
        signType: 'general',
      });
      textures.addCanvas('obj_house_general', canvas);
    }

    // 3. Fresh Grocery Shop (3x2)
    if (!textures.exists('obj_house_grocery')) {
      const canvas = this.drawIsoBuildingCanvas({
        canvasW: 208,
        canvasH: 212,
        baseCenterY: 158,
        tileW: 3,
        tileH: 2,
        wallH: 48,
        roofH: 40,
        wallLeftColor: '#dcfce7',
        wallRightColor: '#b5d9c1',
        roofLightColor: '#15803d',
        roofDarkColor: '#14532d',
        roofGableColor: '#c3e6cf',
        doorSide: 'left',
        hasAwning: { colors: ['#16a34a', '#ffffff'] },
        hasFlowerBoxes: true,
        chimneySide: 'none',
        footprintScale: 0.94,
        signType: 'grocery',
      });
      textures.addCanvas('obj_house_grocery', canvas);
    }

    // 4. Blacksmith Forge Shop (3x2)
    if (!textures.exists('obj_house_blacksmith')) {
      const canvas = this.drawIsoBuildingCanvas({
        canvasW: 208,
        canvasH: 212,
        baseCenterY: 158,
        tileW: 3,
        tileH: 2,
        wallH: 48,
        roofH: 40,
        wallLeftColor: '#64748b',
        wallRightColor: '#475569',
        roofLightColor: '#334155',
        roofDarkColor: '#1e293b',
        roofGableColor: '#475569',
        trimColor: '#1c1917',
        doorSide: 'left',
        hasFlowerBoxes: false,
        hasForgeHearth: true,
        chimneySide: 'right',
        footprintScale: 0.94,
        signType: 'blacksmith',
      });
      textures.addCanvas('obj_house_blacksmith', canvas);
    }

    // 5. Charming Flower Shop (2x2)
    if (!textures.exists('obj_house_florist')) {
      const canvas = this.drawIsoBuildingCanvas({
        canvasW: 164,
        canvasH: 176,
        baseCenterY: 132,
        tileW: 2,
        tileH: 2,
        wallH: 46,
        roofH: 38,
        wallLeftColor: '#fce7f3',
        wallRightColor: '#e2c5d4',
        roofLightColor: '#22c55e',
        roofDarkColor: '#15803d',
        roofGableColor: '#e2c5d4',
        doorSide: 'left',
        hasAwning: { colors: ['#ec4899', '#fdf2f8'] },
        hasFlowerBoxes: true,
        chimneySide: 'none',
        footprintScale: 0.94,
        signType: 'florist',
      });
      textures.addCanvas('obj_house_florist', canvas);
    }

    // 5B. Aunty Gyi Clothing Boutique (2x2)
    if (!textures.exists('obj_house_aunty_gyi')) {
      const canvas = this.drawIsoBuildingCanvas({
        canvasW: 164,
        canvasH: 176,
        baseCenterY: 132,
        tileW: 2,
        tileH: 2,
        wallH: 46,
        roofH: 38,
        wallLeftColor: '#f5e6f8',
        wallRightColor: '#d9c2e0',
        roofLightColor: '#9d174d',
        roofDarkColor: '#6b1035',
        roofGableColor: '#e7d5ec',
        trimColor: '#4c1d45',
        doorSide: 'left',
        hasAwning: { colors: ['#be185d', '#fdf2f8'] },
        hasFlowerBoxes: true,
        chimneySide: 'none',
        footprintScale: 0.94,
        signType: 'clothing',
      });
      textures.addCanvas('obj_house_aunty_gyi', canvas);
    }

    // 6. Bakery Bread & Pastry Display Shelf (48x42)
    if (!textures.exists('obj_shelf_bakery')) {
      const c = document.createElement('canvas');
      c.width = 48;
      c.height = 42;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(24, 36, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(8, 12, 32, 24);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(10, 14, 28, 8);
      ctx.fillRect(10, 25, 28, 8);
      // Croissants & loaves
      ctx.fillStyle = '#f59e0b';
      for (const bx of [14, 21, 28, 34]) {
        ctx.beginPath();
        ctx.ellipse(bx, 18, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#d97706';
      ctx.fillRect(13, 27, 9, 4);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(31, 29, 3, 0, Math.PI * 2);
      ctx.fill();
      textures.addCanvas('obj_shelf_bakery', c);
    }

    // 7. Grocery Fresh Produce Display Shelf (48x42)
    if (!textures.exists('obj_shelf_grocery')) {
      const c = document.createElement('canvas');
      c.width = 48;
      c.height = 42;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(24, 36, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(8, 14, 32, 22);
      // Upper bin: Red apples & carrots
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(14, 18, 2.8, 0, Math.PI * 2);
      ctx.arc(19, 17, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.fillRect(26, 16, 9, 3);
      // Lower bin: Crisp cabbages & lemons
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(15, 28, 3.2, 0, Math.PI * 2);
      ctx.arc(22, 28, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(31, 28, 2.5, 0, Math.PI * 2);
      ctx.arc(35, 27, 2.5, 0, Math.PI * 2);
      ctx.fill();
      textures.addCanvas('obj_shelf_grocery', c);
    }

    // 8. Blacksmith Tool & Ingot Rack (48x44)
    if (!textures.exists('obj_rack_blacksmith')) {
      const c = document.createElement('canvas');
      c.width = 48;
      c.height = 44;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
      ctx.beginPath();
      ctx.ellipse(24, 38, 17, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#451a03';
      ctx.fillRect(10, 10, 3, 28);
      ctx.fillRect(35, 10, 3, 28);
      ctx.fillRect(10, 10, 28, 3);
      ctx.fillRect(10, 26, 28, 4);
      // Hanging iron sword & hammer
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(17, 13, 3, 12);
      ctx.fillRect(25, 13, 3, 10);
      ctx.fillStyle = '#475569';
      ctx.fillRect(23, 20, 7, 4);
      // Stacked iron ingots on shelf
      ctx.fillStyle = '#64748b';
      ctx.fillRect(15, 22, 6, 4);
      ctx.fillRect(28, 22, 6, 4);
      textures.addCanvas('obj_rack_blacksmith', c);
    }

    // 9. Tiered Florist Flower Stand (48x44)
    if (!textures.exists('obj_flower_stand')) {
      const c = document.createElement('canvas');
      c.width = 48;
      c.height = 44;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(24, 38, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(8, 18, 32, 18);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(10, 14, 28, 5);
      // Lush greenery & vibrant floral buckets
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(16, 14, 5, 0, Math.PI * 2);
      ctx.arc(24, 13, 5.5, 0, Math.PI * 2);
      ctx.arc(32, 14, 5, 0, Math.PI * 2);
      ctx.fill();
      const blooms = [
        [14, 12, '#facc15'],
        [18, 15, '#ef4444'],
        [24, 11, '#ec4899'],
        [28, 14, '#c084fc'],
        [33, 12, '#f43f5e'],
        [16, 24, '#f97316'],
        [25, 24, '#38bdf8'],
        [32, 24, '#facc15'],
      ] as const;
      for (const [fx, fy, col] of blooms) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      textures.addCanvas('obj_flower_stand', c);
    }
  }

  // 22. Agricultural & Farm Environment Sprites (Stone Well, Hay Bales, Scarecrow, Wheat, Cabbage, Pumpkin)
  private static createFarmEnvironmentSprites(textures: Phaser.Textures.TextureManager) {
    // 1. Village Stone Water Well (48x56)
    if (!textures.exists('obj_water_well')) {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 56;
      const ctx = canvas.getContext('2d')!;

      // SE Drop shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.40)';
      ctx.beginPath();
      ctx.ellipse(25.5, 48.5, 20, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cobblestone well basin
      ctx.fillStyle = '#57534e';
      ctx.beginPath();
      ctx.roundRect(10, 32, 28, 16, 4);
      ctx.fill();
      ctx.fillStyle = '#78716c';
      ctx.beginPath();
      ctx.ellipse(24, 32, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Deep clear water inside basin
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.ellipse(24, 32, 10, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Timber support posts
      ctx.fillStyle = '#78350f';
      ctx.fillRect(11, 14, 3, 20);
      ctx.fillRect(34, 14, 3, 20);

      // Pitched shingle roof with sunlit left slope
      ctx.fillStyle = '#9a3412';
      ctx.beginPath();
      ctx.moveTo(24, 4);
      ctx.lineTo(42, 16);
      ctx.lineTo(6, 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#c2410c';
      ctx.beginPath();
      ctx.moveTo(24, 4);
      ctx.lineTo(24, 16);
      ctx.lineTo(6, 16);
      ctx.closePath();
      ctx.fill();

      // Hanging rope & bucket
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(24, 14);
      ctx.lineTo(24, 25);
      ctx.stroke();

      // Oak wooden water bucket
      ctx.fillStyle = '#b45309';
      ctx.fillRect(22, 25, 4, 4);

      textures.addCanvas('obj_water_well', canvas);
    }

    // 2. Agricultural Golden Hay Bale (38x28)
    if (!textures.exists('obj_hay_bale')) {
      const canvas = document.createElement('canvas');
      canvas.width = 38;
      canvas.height = 28;
      const ctx = canvas.getContext('2d')!;

      // SE Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(20.5, 23.5, 16, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Hay roll body + rim outline
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.roundRect(5.5, 7.5, 27, 16, 5.5);
      ctx.fill();
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.roundRect(6, 8, 26, 15, 5);
      ctx.fill();

      // Sunlit golden hay strands
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.ellipse(11, 15.5, 5, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#eab308';
      ctx.fillRect(11, 8, 21, 15);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(11, 8.5, 18, 2);

      // Twine tie strings
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(18, 8);
      ctx.lineTo(18, 23);
      ctx.moveTo(26, 8);
      ctx.lineTo(26, 23);
      ctx.stroke();

      textures.addCanvas('obj_hay_bale', canvas);
    }

    // 3. Friendly Straw Scarecrow (38x52)
    if (!textures.exists('obj_scarecrow')) {
      const canvas = document.createElement('canvas');
      canvas.width = 38;
      canvas.height = 52;
      const ctx = canvas.getContext('2d')!;

      // SE Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(20.5, 48.5, 12, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Vertical support post
      ctx.fillStyle = '#78350f';
      ctx.fillRect(18, 14, 3, 34);

      // Horizontal arm crossbeam
      ctx.fillRect(7, 24, 25, 2.5);

      // Red flannel checkered shirt
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(12.5, 19.5, 14, 17);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(13, 20, 13, 16);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(6, 23, 4, 4);
      ctx.fillRect(29, 23, 4, 4);

      // Burlap head with stitched smile
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(19, 14, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#451a03';
      ctx.fillRect(17, 13, 1.5, 1.5);
      ctx.fillRect(20, 13, 1.5, 1.5);

      // Straw conical sun hat
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.moveTo(19, 3);
      ctx.lineTo(28, 11);
      ctx.lineTo(10, 11);
      ctx.closePath();
      ctx.fill();
      // Hat brim
      ctx.fillStyle = '#b45309';
      ctx.fillRect(7, 10, 25, 2.5);

      textures.addCanvas('obj_scarecrow', canvas);
    }

    // 4. Golden Ripe Wheat Cluster (34x28)
    if (!textures.exists('obj_crop_wheat')) {
      const canvas = document.createElement('canvas');
      canvas.width = 34;
      canvas.height = 28;
      const ctx = canvas.getContext('2d')!;

      // Green & golden wheat stalks
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 1.2;
      for (let x = 6; x <= 28; x += 5) {
        ctx.beginPath();
        ctx.moveTo(x, 26);
        ctx.quadraticCurveTo(x + (x % 2 === 0 ? 3 : -3), 16, x + (x % 2 === 0 ? 4 : -4), 6);
        ctx.stroke();

        // Plump wheat head
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.ellipse(x + (x % 2 === 0 ? 4 : -4), 8, 2.5, 4.5, (x % 2 === 0 ? 0.2 : -0.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(x + (x % 2 === 0 ? 3.5 : -4.5), 6, 1.5, 3);
      }

      textures.addCanvas('obj_crop_wheat', canvas);
    }

    // 5. Crisp Farm Cabbage Row (36x24)
    if (!textures.exists('obj_crop_cabbage')) {
      const canvas = document.createElement('canvas');
      canvas.width = 36;
      canvas.height = 24;
      const ctx = canvas.getContext('2d')!;

      // Three cabbage heads in a neat row
      const cabbages = [9, 18, 27];
      for (const cx of cabbages) {
        // Shadow
        ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
        ctx.beginPath();
        ctx.ellipse(cx, 19, 5, 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Dark outer ruffled leaves
        ctx.fillStyle = '#166534';
        ctx.beginPath();
        ctx.arc(cx - 2, 15, 4, 0, Math.PI * 2);
        ctx.arc(cx + 2, 15, 4, 0, Math.PI * 2);
        ctx.fill();

        // Bright green cabbage center
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(cx, 14, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Tender light green heart
        ctx.fillStyle = '#86efac';
        ctx.beginPath();
        ctx.arc(cx, 13.5, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }

      textures.addCanvas('obj_crop_cabbage', canvas);
    }

    // 6. Autumn Pumpkins & Vines (38x26)
    if (!textures.exists('obj_crop_pumpkin')) {
      const canvas = document.createElement('canvas');
      canvas.width = 38;
      canvas.height = 26;
      const ctx = canvas.getContext('2d')!;

      // Shadows
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(14, 21, 9, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(28, 20, 7, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Green curling vines
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(4, 20);
      ctx.quadraticCurveTo(14, 12, 24, 18);
      ctx.quadraticCurveTo(32, 14, 36, 19);
      ctx.stroke();

      // Big pumpkin (tx: 14)
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.ellipse(14, 16, 7.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Pumpkin rib grooves
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.ellipse(14, 16, 4.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Green stem
      ctx.fillStyle = '#166534';
      ctx.fillRect(13, 9, 2, 3);

      // Smaller companion pumpkin (tx: 28)
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.ellipse(28, 16, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.ellipse(28, 16, 3.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#166534';
      ctx.fillRect(27.5, 10.5, 1.8, 2.5);

      textures.addCanvas('obj_crop_pumpkin', canvas);
    }
  }

  // 23. High-Resolution 2x Stardew-Inspired 2D Character Spritesheet (64x88 per frame, rendered at scale 0.5)
  // 16 frames (4 directions x 4 steps): [Down 0..3, Left 4..7, Right 8..11, Up 12..15]
  // stepIndex mapping: 0 = TRUE IDLE (feet planted), 1 = LEFT STRIDE, 2 = RIGHT STRIDE, 3 = IDLE BREATH (feet planted)
  private static createCharacterSpritesheet(
    textures: Phaser.Textures.TextureManager,
    key: string,
    skinColor: string,
    hairColor: string,
    clothesColor: string,
    gender: 'male' | 'female',
    role: 'player' | 'merchant' | 'settler' | 'elder' | 'blacksmith' | 'florist' | 'baker' | 'grocer' | 'farmer' = 'player'
  ) {
    if (textures.exists(key)) return;

    const frameW = 64;
    const frameH = 88;
    const totalFrames = 16;
    const canvas = document.createElement('canvas');
    canvas.width = frameW * totalFrames;
    canvas.height = frameH;
    const ctx = canvas.getContext('2d')!;
    const outline = '#1b1411';

    for (let f = 0; f < totalFrames; f++) {
      const dirIndex = Math.floor(f / 4); // 0=down, 1=left, 2=right, 3=up
      const stepIndex = f % 4; // 0=idle, 1=left stride, 2=right stride, 3=idle breath

      ctx.save();
      ctx.translate(f * frameW, 0);
      ctx.scale(2, 2); // 32x44 logical sprite space rendered crisply at 2x resolution

      // Feet remain firmly planted in idle (0) and idle-breath (3); body lifts naturally during strides (1, 2)
      const isStride = stepIndex === 1 || stepIndex === 2;
      const strideBob = isStride ? -1.05 : 0;
      const breathOffset = stepIndex === 3 ? -0.55 : 0;
      const bodyBob = strideBob + breathOffset;
      const headBob = strideBob * 0.95 + (stepIndex === 3 ? -0.65 : 0);

      // --- 1. LEGS & SHADED BOOTS (ground contact aligned cleanly at y = 39.6 for originY = 0.90) ---
      const pantsColor =
        role === 'elder' ? '#134e4a' : role === 'farmer' ? '#1e40af' : role === 'merchant' ? '#312e81' : '#2b3648';
      const bootLeatherColor = role === 'blacksmith' ? '#3f2010' : role === 'elder' ? '#4a2c18' : '#5c3317';
      const bootHighlightColor = role === 'blacksmith' ? '#61341b' : '#854d27';
      const bootSoleColor = '#170e08';

      const drawBoot = (bx: number, by: number, w = 4.6, h = 5.2, shaded = false) => {
        ctx.fillStyle = outline;
        ctx.beginPath();
        ctx.roundRect(bx - 0.65, by - 0.5, w + 1.3, h + 1.15, 1.15);
        ctx.fill();
        // Trousers cuff
        ctx.fillStyle = pantsColor;
        ctx.fillRect(bx, by, w, 1.55);
        // Boot leather
        ctx.fillStyle = shaded ? '#422410' : bootLeatherColor;
        ctx.fillRect(bx, by + 1.45, w, h - 2.45);
        if (!shaded) {
          ctx.fillStyle = bootHighlightColor;
          ctx.fillRect(bx + 0.45, by + 1.65, w * 0.44, h - 2.9);
        }
        // Sole & subtle toe cap rim
        ctx.fillStyle = bootSoleColor;
        ctx.fillRect(bx - 0.25, by + h - 1.25, w + 0.5, 1.25);
      };

      if (dirIndex === 0 || dirIndex === 3) {
        // Front / Back views: left & right boots planted cleanly at y = 34.4 (+5.2 = 39.6) during idle/breath
        const leftLegY = stepIndex === 1 ? 33.0 : stepIndex === 2 ? 34.8 : 34.4;
        const rightLegY = stepIndex === 2 ? 33.0 : stepIndex === 1 ? 34.8 : 34.4;
        drawBoot(10.6, leftLegY + strideBob, 4.6, 5.2, stepIndex === 2);
        drawBoot(16.8, rightLegY + strideBob, 4.6, 5.2, stepIndex === 1);
      } else if (dirIndex === 1) {
        // Left isometric profile: crisp depth separation between far boot and near boot
        const frontShift = stepIndex === 1 ? -2.7 : stepIndex === 2 ? 2.3 : 0;
        const backShift = -frontShift;
        const frontLift = stepIndex === 1 ? -0.8 : 0;
        const backLift = stepIndex === 2 ? -0.8 : 0;
        if (isStride) {
          drawBoot(13.4 + backShift, 34.4 + strideBob + backLift, 4.3, 5.0, true);
        }
        drawBoot(13.0 + frontShift, 34.4 + strideBob + frontLift, 4.8, 5.2, false);
      } else {
        // Right isometric profile
        const frontShift = stepIndex === 1 ? 2.7 : stepIndex === 2 ? -2.3 : 0;
        const backShift = -frontShift;
        const frontLift = stepIndex === 1 ? -0.8 : 0;
        const backLift = stepIndex === 2 ? -0.8 : 0;
        if (isStride) {
          drawBoot(14.3 + backShift, 34.4 + strideBob + backLift, 4.3, 5.0, true);
        }
        drawBoot(14.2 + frontShift, 34.4 + strideBob + frontLift, 4.8, 5.2, false);
      }

      // --- 2. TORSO, TUNIC & ROLE OUTFITS ---
      const torsoW = gender === 'female' ? 11.6 : role === 'blacksmith' ? 13.4 : 12.6;
      const torsoX = 16 - torsoW / 2;
      const torsoH = role === 'elder' ? 13.6 : 12.2;

      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.roundRect(torsoX - 0.85, 22.0 + bodyBob, torsoW + 1.7, torsoH + 1.6, 3.0);
      ctx.fill();

      ctx.fillStyle = clothesColor;
      ctx.beginPath();
      ctx.roundRect(torsoX, 22.8 + bodyBob, torsoW, torsoH, 2.3);
      ctx.fill();

      // Top-left sunlight rim & hem shadow for crisp readability against grass & trees
      const torsoShade = ctx.createLinearGradient(torsoX, 22.8 + bodyBob, torsoX + torsoW, 22.8 + torsoH + bodyBob);
      torsoShade.addColorStop(0, 'rgba(255, 251, 235, 0.28)');
      torsoShade.addColorStop(0.52, 'rgba(255, 255, 255, 0)');
      torsoShade.addColorStop(1, 'rgba(22, 14, 10, 0.34)');
      ctx.fillStyle = torsoShade;
      ctx.beginPath();
      ctx.roundRect(torsoX, 22.8 + bodyBob, torsoW, torsoH, 2.3);
      ctx.fill();

      // Role-specific torso attire & aprons
      if (role === 'farmer') {
        // Classic denim overalls over green shirt
        ctx.fillStyle = '#1d4ed8';
        ctx.fillRect(torsoX + 1.4, 23.0 + bodyBob, 2.0, 4.4);
        ctx.fillRect(torsoX + torsoW - 3.4, 23.0 + bodyBob, 2.0, 4.4);
        ctx.fillRect(torsoX + 1.0, 26.8 + bodyBob, torsoW - 2.0, 7.8);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(torsoX + 1.8, 26.8 + bodyBob, 1.1, 1.1);
        ctx.fillRect(torsoX + torsoW - 2.9, 26.8 + bodyBob, 1.1, 1.1);
      } else if (role === 'blacksmith') {
        // Heavy dark leather forge apron & iron buckle
        ctx.fillStyle = '#451a03';
        ctx.fillRect(torsoX + 1.8, 24.4 + bodyBob, torsoW - 3.6, 10.6);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(torsoX + 2.4, 24.8 + bodyBob, torsoW - 5.2, 4.2);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(15.0, 29.8 + bodyBob, 2.0, 1.4);
      } else if (role === 'baker' || role === 'grocer' || role === 'florist') {
        // Cream cottage apron with colored ribbon tie
        const apronColor = role === 'grocer' ? '#f0fdf4' : '#fffbeb';
        ctx.fillStyle = apronColor;
        ctx.beginPath();
        ctx.roundRect(torsoX + 2.0, 26.0 + bodyBob, torsoW - 4.0, 9.2, 1.4);
        ctx.fill();
        if (role === 'grocer') {
          ctx.fillStyle = '#86efac';
          ctx.fillRect(torsoX + 2.4, 29.2 + bodyBob, torsoW - 4.8, 1.4);
        } else if (role === 'florist') {
          ctx.fillStyle = '#f472b6';
          ctx.fillRect(15.0, 28.0 + bodyBob, 2.0, 2.0);
        } else {
          ctx.fillStyle = '#fde68a';
          ctx.fillRect(torsoX + 2.8, 29.8 + bodyBob, torsoW - 5.6, 2.2);
        }
      } else if (role === 'elder') {
        // Gold-trimmed elder robe stole
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(14.5, 22.8 + bodyBob, 3.0, 12.8);
        ctx.fillStyle = '#eab308';
        ctx.fillRect(torsoX, 34.4 + bodyBob, torsoW, 1.3);
      } else if (role === 'merchant') {
        // Cream waistcoat & diagonal leather satchel strap
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(14.2, 23.0 + bodyBob, 3.6, 7.8);
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(torsoX + 1.2, 23.0 + bodyBob);
        ctx.lineTo(torsoX + torsoW - 1.2, 31.8 + bodyBob);
        ctx.stroke();
      } else if (role === 'settler') {
        // Warm woven traveler scarf & satchel strap
        ctx.fillStyle = '#0d9488';
        ctx.fillRect(torsoX + 1.2, 22.8 + bodyBob, torsoW - 2.4, 2.4);
        ctx.fillRect(15.2, 24.8 + bodyBob, 2.2, 3.4);
      } else {
        // Player tunic center placket
        ctx.fillStyle = 'rgba(28, 20, 14, 0.2)';
        ctx.fillRect(15.6, 25.6 + bodyBob, 0.85, 5.4);
      }

      // Collar / Scarf Detail
      if (dirIndex === 0 && role !== 'elder' && role !== 'blacksmith' && role !== 'settler') {
        ctx.fillStyle = gender === 'female' ? '#fff1f2' : '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(13.2, 22.8 + bodyBob);
        ctx.lineTo(16, 25.8 + bodyBob);
        ctx.lineTo(18.8, 22.8 + bodyBob);
        ctx.closePath();
        ctx.fill();
      } else if (dirIndex === 3) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(torsoX + 2, 23.2 + bodyBob, torsoW - 4, 1.4);
      }

      // Leather Belt & Brass Buckle (skip over full elder robe)
      if (role !== 'elder') {
        ctx.fillStyle = '#6b3410';
        ctx.fillRect(torsoX, 31.0 + bodyBob, torsoW, 2.5);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(torsoX, 31.0 + bodyBob, torsoW, 0.9);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(14.5, 30.8 + bodyBob, 3.0, 2.7);
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(15.1, 31.2 + bodyBob, 1.8, 1.4);
      }

      // Tunic flared skirt hem for female characters
      if (gender === 'female') {
        ctx.fillStyle = clothesColor;
        ctx.fillRect(torsoX - 0.4, 33.2 + bodyBob, torsoW + 0.8, 2.2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
        ctx.fillRect(torsoX - 0.4, 34.7 + bodyBob, torsoW + 0.8, 0.7);
      }

      // --- ARMS & HANDS WITH NATURAL SWING ---
      const armBreath = stepIndex === 3 ? 0.35 : 0;
      if (dirIndex === 0 || dirIndex === 3) {
        const leftArmSwing = stepIndex === 1 ? 1.7 : stepIndex === 2 ? -1.7 : 0;
        const rightArmSwing = -leftArmSwing;
        const armLeftX = torsoX - 2.6 - armBreath;
        const armRightX = torsoX + torsoW - 0.4 + armBreath;

        for (const [ax, swing] of [
          [armLeftX, leftArmSwing],
          [armRightX, rightArmSwing],
        ]) {
          ctx.fillStyle = outline;
          ctx.beginPath();
          ctx.roundRect(ax - 0.5, 22.6 + bodyBob + swing * 0.55, 3.8, 8.2, 1.25);
          ctx.fill();
          ctx.fillStyle = role === 'blacksmith' ? skinColor : clothesColor;
          ctx.fillRect(ax, 23.1 + bodyBob + swing * 0.55, 2.8, 4.1);
          if (role !== 'blacksmith') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
            ctx.fillRect(ax, 23.1 + bodyBob + swing * 0.55, 2.8, 1.1);
          } else {
            ctx.fillStyle = clothesColor;
            ctx.fillRect(ax, 23.1 + bodyBob + swing * 0.55, 2.8, 2.0);
          }
          ctx.fillStyle = skinColor;
          ctx.fillRect(ax, 27.1 + bodyBob + swing * 0.55, 2.8, 3.1);
        }

        // Elder's carved wooden walking staff on right side
        if (role === 'elder') {
          ctx.fillStyle = outline;
          ctx.fillRect(armRightX + 1.5, 19.5 + bodyBob, 2.2, 20.0);
          ctx.fillStyle = '#78350f';
          ctx.fillRect(armRightX + 1.9, 20.0 + bodyBob, 1.4, 19.0);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(armRightX + 1.6, 19.4 + bodyBob, 2.0, 1.6);
        }
      } else if (dirIndex === 1) {
        const armOffset = stepIndex === 1 ? 2.7 : stepIndex === 2 ? -2.7 : 0;
        ctx.fillStyle = outline;
        ctx.beginPath();
        ctx.roundRect(13.2 + armOffset, 23.2 + bodyBob, 4.2, 8.2, 1.25);
        ctx.fill();
        ctx.fillStyle = clothesColor;
        ctx.fillRect(13.6 + armOffset, 23.7 + bodyBob, 3.4, role === 'blacksmith' ? 2.2 : 4.0);
        ctx.fillStyle = skinColor;
        ctx.fillRect(13.6 + armOffset, (role === 'blacksmith' ? 25.9 : 27.7) + bodyBob, 3.4, role === 'blacksmith' ? 5.0 : 3.2);
      } else {
        const armOffset = stepIndex === 1 ? -2.7 : stepIndex === 2 ? 2.7 : 0;
        ctx.fillStyle = outline;
        ctx.beginPath();
        ctx.roundRect(14.6 + armOffset, 23.2 + bodyBob, 4.2, 8.2, 1.25);
        ctx.fill();
        ctx.fillStyle = clothesColor;
        ctx.fillRect(15.0 + armOffset, 23.7 + bodyBob, 3.4, role === 'blacksmith' ? 2.2 : 4.0);
        ctx.fillStyle = skinColor;
        ctx.fillRect(15.0 + armOffset, (role === 'blacksmith' ? 25.9 : 27.7) + bodyBob, 3.4, role === 'blacksmith' ? 5.0 : 3.2);
      }

      // --- 3. HEAD & EXPRESSIVE ISOMETRIC FACE ---
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.roundRect(8.3, 7.5 + headBob, 15.4, 14.9, 6.6);
      ctx.fill();

      ctx.fillStyle = skinColor;
      ctx.beginPath();
      ctx.roundRect(9.2, 8.3 + headBob, 13.6, 13.4, 5.8);
      ctx.fill();

      // Warm top-left highlight & gentle chin shadow
      const headGrad = ctx.createRadialGradient(14.0, 11.6 + headBob, 1, 16, 15 + headBob, 7.4);
      headGrad.addColorStop(0, 'rgba(255, 255, 255, 0.26)');
      headGrad.addColorStop(0.62, 'rgba(255, 255, 255, 0)');
      headGrad.addColorStop(1, 'rgba(110, 40, 14, 0.22)');
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.roundRect(9.2, 8.3 + headBob, 13.6, 13.4, 5.8);
      ctx.fill();

      // Side ears for front view
      if (dirIndex === 0) {
        ctx.fillStyle = outline;
        ctx.fillRect(8.0, 13.9 + headBob, 1.4, 3.4);
        ctx.fillRect(22.6, 13.9 + headBob, 1.4, 3.4);
        ctx.fillStyle = skinColor;
        ctx.fillRect(8.4, 14.3 + headBob, 1.2, 2.6);
        ctx.fillRect(22.4, 14.3 + headBob, 1.2, 2.6);
      }

      if (dirIndex === 0) {
        // Warm cheek blush
        ctx.fillStyle = 'rgba(244, 63, 94, 0.34)';
        ctx.beginPath();
        ctx.ellipse(11.3, 17.5 + headBob, 1.9, 1.0, 0, 0, Math.PI * 2);
        ctx.ellipse(20.7, 17.5 + headBob, 1.9, 1.0, 0, 0, Math.PI * 2);
        ctx.fill();

        // Expressive Eyebrows
        ctx.fillStyle = hairColor;
        ctx.fillRect(11.8, 12.1 + headBob, 2.9, 0.95);
        ctx.fillRect(17.3, 12.1 + headBob, 2.9, 0.95);

        // Crisp Sclera + Deep Iris Eyes + Catchlights
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11.9, 13.4 + headBob, 2.9, 3.0);
        ctx.fillRect(17.2, 13.4 + headBob, 2.9, 3.0);

        ctx.fillStyle = '#17131d';
        ctx.fillRect(12.3, 13.5 + headBob, 2.3, 2.8);
        ctx.fillRect(17.4, 13.5 + headBob, 2.3, 2.8);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(12.5, 13.8 + headBob, 1.0, 1.0);
        ctx.fillRect(17.6, 13.8 + headBob, 1.0, 1.0);
        ctx.fillRect(13.7, 15.3 + headBob, 0.6, 0.6);
        ctx.fillRect(18.8, 15.3 + headBob, 0.6, 0.6);

        // Subtle pixel nose & friendly smile
        ctx.fillStyle = 'rgba(124, 45, 18, 0.32)';
        ctx.fillRect(15.6, 16.4 + headBob, 0.9, 0.9);

        ctx.strokeStyle = '#7c2d12';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(14.5, 18.6 + headBob);
        ctx.quadraticCurveTo(16, 19.5 + headBob, 17.5, 18.6 + headBob);
        ctx.stroke();

        // Distinct Elder & Blacksmith facial hair
        if (role === 'elder') {
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.moveTo(11.8, 17.8 + headBob);
          ctx.lineTo(20.2, 17.8 + headBob);
          ctx.lineTo(18.4, 22.8 + headBob);
          ctx.lineTo(13.6, 22.8 + headBob);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 0.6;
          ctx.stroke();
        } else if (role === 'blacksmith') {
          ctx.fillStyle = '#451a03';
          ctx.fillRect(12.2, 18.8 + headBob, 7.6, 2.6);
        }
      } else if (dirIndex === 1) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
        ctx.beginPath();
        ctx.ellipse(11.8, 17.5 + headBob, 1.8, 1.0, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = hairColor;
        ctx.fillRect(10.6, 12.1 + headBob, 2.5, 0.95);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(10.6, 13.4 + headBob, 2.6, 2.9);
        ctx.fillStyle = '#17131d';
        ctx.fillRect(10.7, 13.5 + headBob, 2.2, 2.8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(10.9, 13.8 + headBob, 1.0, 1.0);

        ctx.fillStyle = '#7c2d12';
        ctx.fillRect(10.2, 18.6 + headBob, 2.1, 0.9);
        if (role === 'elder') {
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(9.5, 18.2 + headBob, 4.2, 4.0);
        } else if (role === 'blacksmith') {
          ctx.fillStyle = '#451a03';
          ctx.fillRect(10.0, 18.8 + headBob, 4.0, 2.4);
        }
      } else if (dirIndex === 2) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.32)';
        ctx.beginPath();
        ctx.ellipse(20.2, 17.5 + headBob, 1.8, 1.0, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = hairColor;
        ctx.fillRect(18.9, 12.1 + headBob, 2.5, 0.95);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(18.8, 13.4 + headBob, 2.6, 2.9);
        ctx.fillStyle = '#17131d';
        ctx.fillRect(19.1, 13.5 + headBob, 2.2, 2.8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(19.2, 13.8 + headBob, 1.0, 1.0);

        ctx.fillStyle = '#7c2d12';
        ctx.fillRect(19.7, 18.6 + headBob, 2.1, 0.9);
        if (role === 'elder') {
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(18.3, 18.2 + headBob, 4.2, 4.0);
        } else if (role === 'blacksmith') {
          ctx.fillStyle = '#451a03';
          ctx.fillRect(18.0, 18.8 + headBob, 4.0, 2.4);
        }
      }

      // --- 4. VOLUMETRIC LAYERED HAIR ---
      ctx.fillStyle = hairColor;
      if (dirIndex === 0) {
        ctx.beginPath();
        ctx.arc(16, 11.4 + headBob, 7.6, Math.PI * 0.92, Math.PI * 2.08);
        ctx.fill();
        ctx.strokeStyle = outline;
        ctx.lineWidth = 0.85;
        ctx.stroke();

        ctx.fillStyle = hairColor;
        ctx.fillRect(8.8, 10.6 + headBob, 3.2, 5.2);
        ctx.fillRect(20.0, 10.6 + headBob, 3.2, 5.2);
        ctx.fillRect(11.8, 9.5 + headBob, 8.4, 2.4);
        ctx.fillRect(13.6, 11.2 + headBob, 2.2, 1.5);
        ctx.fillRect(17.2, 11.2 + headBob, 2.0, 1.3);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.36)';
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.arc(16, 8.9 + headBob, 4.6, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();

        if (gender === 'female') {
          ctx.fillStyle = hairColor;
          ctx.fillRect(8.0, 15.0 + headBob, 2.9, 8.6);
          ctx.fillRect(21.1, 15.0 + headBob, 2.9, 8.6);
          const ribbonCol = role === 'florist' ? '#f9a8d4' : role === 'grocer' ? '#4ade80' : '#f472b6';
          ctx.fillStyle = ribbonCol;
          ctx.fillRect(8.0, 17.5 + headBob, 2.9, 1.5);
          ctx.fillRect(21.1, 17.5 + headBob, 2.9, 1.5);
        }
      } else if (dirIndex === 1) {
        ctx.beginPath();
        ctx.arc(16.4, 11.4 + headBob, 7.5, Math.PI * 0.72, Math.PI * 1.98);
        ctx.fill();
        ctx.strokeStyle = outline;
        ctx.lineWidth = 0.85;
        ctx.stroke();

        ctx.fillStyle = hairColor;
        ctx.fillRect(10.0, 10.6 + headBob, 4.4, 3.0);
        ctx.fillRect(17.6, 12.2 + headBob, 5.8, 7.2);
        ctx.fillStyle = skinColor;
        ctx.fillRect(16.2, 14.5 + headBob, 1.8, 2.6);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(16.4, 9.2 + headBob, 4.5, Math.PI * 1.0, Math.PI * 1.75);
        ctx.stroke();

        if (gender === 'female') {
          ctx.fillStyle = hairColor;
          ctx.fillRect(17.4, 15.0 + headBob, 4.5, 9.0);
          ctx.fillStyle = role === 'florist' ? '#f9a8d4' : role === 'grocer' ? '#4ade80' : '#f472b6';
          ctx.fillRect(17.8, 17.2 + headBob, 3.2, 1.4);
        }
      } else if (dirIndex === 2) {
        ctx.beginPath();
        ctx.arc(15.6, 11.4 + headBob, 7.5, Math.PI * 1.02, Math.PI * 2.28);
        ctx.fill();
        ctx.strokeStyle = outline;
        ctx.lineWidth = 0.85;
        ctx.stroke();

        ctx.fillStyle = hairColor;
        ctx.fillRect(17.6, 10.6 + headBob, 4.4, 3.0);
        ctx.fillRect(8.6, 12.2 + headBob, 5.8, 7.2);
        ctx.fillStyle = skinColor;
        ctx.fillRect(14.0, 14.5 + headBob, 1.8, 2.6);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(15.6, 9.2 + headBob, 4.5, Math.PI * 1.25, Math.PI * 2.0);
        ctx.stroke();

        if (gender === 'female') {
          ctx.fillStyle = hairColor;
          ctx.fillRect(10.1, 15.0 + headBob, 4.5, 9.0);
          ctx.fillStyle = role === 'florist' ? '#f9a8d4' : role === 'grocer' ? '#4ade80' : '#f472b6';
          ctx.fillRect(11.0, 17.2 + headBob, 3.2, 1.4);
        }
      } else {
        ctx.beginPath();
        ctx.roundRect(8.4, 6.2 + headBob, 15.2, 15.8, 6.8);
        ctx.fill();
        ctx.strokeStyle = outline;
        ctx.lineWidth = 0.85;
        ctx.stroke();

        ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
        ctx.fillRect(10.5, 19.2 + headBob, 11, 2.4);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(16, 11.4 + headBob, 4.8, Math.PI * 1.18, Math.PI * 1.82);
        ctx.stroke();

        if (gender === 'female') {
          ctx.fillStyle = hairColor;
          ctx.fillRect(9.2, 16.0 + headBob, 3.6, 8.0);
          ctx.fillRect(19.2, 16.0 + headBob, 3.6, 8.0);
          ctx.fillStyle = role === 'florist' ? '#f9a8d4' : role === 'grocer' ? '#4ade80' : '#f472b6';
          ctx.fillRect(9.2, 18.0 + headBob, 3.6, 1.4);
          ctx.fillRect(19.2, 18.0 + headBob, 3.6, 1.4);
        }
      }

      // --- 5. DISTINCTIVE NPC HEADWEAR & SIGNATURES ---
      if (role === 'baker') {
        // Puffy white baker toque hat
        ctx.fillStyle = outline;
        ctx.beginPath();
        ctx.ellipse(16, 5.2 + headBob, 7.2, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(16, 5.2 + headBob, 6.4, 2.9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(10.4, 6.8 + headBob, 11.2, 2.4);
        ctx.strokeStyle = outline;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(10.4, 6.8 + headBob, 11.2, 2.4);
      } else if (role === 'farmer') {
        // Wide golden straw sun hat with red band
        ctx.fillStyle = outline;
        ctx.beginPath();
        ctx.ellipse(16, 8.2 + headBob, 10.6, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.ellipse(16, 8.0 + headBob, 9.8, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ca8a04';
        ctx.beginPath();
        ctx.roundRect(10.8, 3.8 + headBob, 10.4, 4.2, 2.0);
        ctx.fill();
        ctx.strokeStyle = outline;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(10.8, 6.6 + headBob, 10.4, 1.3);
      } else if (role === 'merchant') {
        // Plum merchant beret with brass feather clasp
        ctx.fillStyle = outline;
        ctx.beginPath();
        ctx.ellipse(16, 6.8 + headBob, 8.0, 3.2, -0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6d28d9';
        ctx.beginPath();
        ctx.ellipse(16, 6.8 + headBob, 7.2, 2.5, -0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(11.0, 6.4 + headBob, 1.8, 1.6);
      } else if (role === 'florist') {
        // Woven floral crown with daisies & rose buds
        ctx.fillStyle = '#65a30d';
        ctx.fillRect(9.8, 7.6 + headBob, 12.4, 1.8);
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(10.8, 7.0 + headBob, 2.4, 2.4);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(14.8, 6.8 + headBob, 2.4, 2.4);
        ctx.fillStyle = '#ec4899';
        ctx.fillRect(18.8, 7.1 + headBob, 2.4, 2.4);
      } else if (role === 'blacksmith') {
        // Crimson forge headband
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(9.0, 8.6 + headBob, 14.0, 2.0);
        ctx.fillStyle = '#fca5a5';
        ctx.fillRect(11.0, 8.9 + headBob, 3.5, 0.7);
      } else if (role === 'grocer') {
        // Fresh coral-amber kerchief headband
        ctx.fillStyle = '#f97316';
        ctx.fillRect(9.2, 8.4 + headBob, 13.6, 2.1);
        ctx.fillStyle = '#fed7aa';
        ctx.fillRect(15.0, 7.8 + headBob, 2.2, 1.8);
      } else if (role === 'settler') {
        // Warm traveler teal hair ribbon
        ctx.fillStyle = '#0d9488';
        ctx.fillRect(9.4, 8.4 + headBob, 13.2, 1.9);
        ctx.fillStyle = '#5eead4';
        ctx.fillRect(18.6, 7.6 + headBob, 2.4, 1.8);
      }

      ctx.restore();
    }

    textures.addSpriteSheet(key, canvas as any, {
      frameWidth: frameW,
      frameHeight: frameH,
    });
  }

  private static createClothingSpritesheets(textures: Phaser.Textures.TextureManager): void {
    const frameW = 64;
    const frameH = 88;
    const totalFrames = 16;

    for (const item of AUNTY_GYI_CATALOG) {
      const genders = ClothingRenderer.getSupportedGendersForItem(item.itemId);
      for (const gender of genders) {
        const key = ClothingSystem.getClothingTextureKey(item.itemId, gender);
        if (textures.exists(key)) continue;

        const canvas = document.createElement('canvas');
        canvas.width = frameW * totalFrames;
        canvas.height = frameH;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let f = 0; f < totalFrames; f++) {
          ctx.save();
          ctx.translate(f * frameW, 0);
          ctx.scale(2, 2);
          ClothingRenderer.drawClothingFrame(ctx, item.itemId, gender, f);
          ctx.restore();
        }

        textures.addSpriteSheet(key, canvas as any, {
          frameWidth: frameW,
          frameHeight: frameH,
        });
      }
    }
  }

  // 21. Particle Textures
  private static createParticleTextures(textures: Phaser.Textures.TextureManager) {
    // Wood chip
    if (!textures.exists('particle_wood')) {
      const c = document.createElement('canvas');
      c.width = 6;
      c.height = 6;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#b45309';
      ctx.fillRect(1, 1, 4, 3);
      textures.addCanvas('particle_wood', c);
    }

    // Stone dust
    if (!textures.exists('particle_stone')) {
      const c = document.createElement('canvas');
      c.width = 6;
      c.height = 6;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#a8a29e';
      ctx.fillRect(1, 1, 3, 3);
      textures.addCanvas('particle_stone', c);
    }

    // Water splash
    if (!textures.exists('particle_water')) {
      const c = document.createElement('canvas');
      c.width = 6;
      c.height = 6;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#7dd3fc';
      ctx.beginPath();
      ctx.arc(3, 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      textures.addCanvas('particle_water', c);
    }

    // Gold sparkle
    if (!textures.exists('particle_sparkle')) {
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(5, 3);
      ctx.lineTo(8, 4);
      ctx.lineTo(5, 5);
      ctx.lineTo(4, 8);
      ctx.lineTo(3, 5);
      ctx.lineTo(0, 4);
      ctx.lineTo(3, 3);
      ctx.closePath();
      ctx.fill();
      textures.addCanvas('particle_sparkle', c);
    }
  }

  // 22. Step 5: Pre-cached Dynamic Night Glows, Isometric House Windows, Rain Streaks & Ground/Water Splashes
  private static createAtmosphereTextures(textures: Phaser.Textures.TextureManager) {
    // Soft warm lantern & house spill glow (128x128)
    if (!textures.exists('fx_glow_warm')) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
      g.addColorStop(0, 'rgba(255, 240, 178, 0.92)');
      g.addColorStop(0.28, 'rgba(251, 191, 36, 0.48)');
      g.addColorStop(0.62, 'rgba(245, 158, 11, 0.16)');
      g.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      textures.addCanvas('fx_glow_warm', c);
    }

    // Hearth / campfire / forge warm orange glow (96x96)
    if (!textures.exists('fx_glow_fire')) {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 96;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(48, 48, 2, 48, 48, 46);
      g.addColorStop(0, 'rgba(254, 243, 199, 0.95)');
      g.addColorStop(0.3, 'rgba(249, 115, 22, 0.52)');
      g.addColorStop(0.68, 'rgba(234, 88, 12, 0.18)');
      g.addColorStop(1, 'rgba(234, 88, 12, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 96, 96);
      textures.addCanvas('fx_glow_fire', c);
    }

    // Town Plaza fountain soft welcoming ambient glow (160x160)
    if (!textures.exists('fx_glow_plaza')) {
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 160;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(80, 80, 6, 80, 80, 78);
      g.addColorStop(0, 'rgba(254, 249, 195, 0.78)');
      g.addColorStop(0.35, 'rgba(253, 224, 71, 0.30)');
      g.addColorStop(0.7, 'rgba(186, 230, 253, 0.10)');
      g.addColorStop(1, 'rgba(186, 230, 253, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 160, 160);
      textures.addCanvas('fx_glow_plaza', c);
    }

    // Isometric Glowing Window Panes (skewed to left-facing and right-facing building walls)
    const createWindowGlow = (key: string, skewY: number) => {
      if (textures.exists(key)) return;
      const c = document.createElement('canvas');
      c.width = 24;
      c.height = 24;
      const ctx = c.getContext('2d')!;

      const g = ctx.createRadialGradient(12, 12, 1, 12, 12, 11);
      g.addColorStop(0, 'rgba(254, 249, 195, 0.95)');
      g.addColorStop(0.5, 'rgba(251, 191, 36, 0.42)');
      g.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 24, 24);

      ctx.save();
      ctx.translate(12, 12);
      ctx.transform(1, skewY, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.95)';
      ctx.fillRect(-4.5, -5.5, 9, 11);
      ctx.fillStyle = 'rgba(255, 255, 230, 0.9)';
      ctx.fillRect(-3.5, -4.5, 3, 4);
      ctx.fillRect(0.5, -4.5, 3, 4);
      ctx.restore();

      textures.addCanvas(key, c);
    };
    createWindowGlow('fx_window_glow_l', 0.48);
    createWindowGlow('fx_window_glow_r', -0.48);

    // Lightweight Diagonal Rain Streak (10x22)
    if (!textures.exists('fx_rain_drop')) {
      const c = document.createElement('canvas');
      c.width = 10;
      c.height = 22;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(7, 1, 2, 21);
      g.addColorStop(0, 'rgba(186, 230, 253, 0)');
      g.addColorStop(0.35, 'rgba(186, 230, 253, 0.55)');
      g.addColorStop(1, 'rgba(224, 242, 254, 0.88)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(7.5, 1.5);
      ctx.lineTo(2.5, 20.5);
      ctx.stroke();
      textures.addCanvas('fx_rain_drop', c);
    }

    // Ground Rain Splash Ring (18x10)
    if (!textures.exists('fx_rain_splash')) {
      const c = document.createElement('canvas');
      c.width = 18;
      c.height = 10;
      const ctx = c.getContext('2d')!;
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.72)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(9, 5.5, 6.2, 2.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(186, 230, 253, 0.85)';
      ctx.fillRect(6, 2, 1.4, 1.4);
      ctx.fillRect(11, 2.2, 1.4, 1.4);
      textures.addCanvas('fx_rain_splash', c);
    }

    // Water Surface Concentric Rain Ripple (24x12)
    if (!textures.exists('fx_water_rain_ripple')) {
      const c = document.createElement('canvas');
      c.width = 24;
      c.height = 12;
      const ctx = c.getContext('2d')!;
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.78)';
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.ellipse(12, 6, 9, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.52)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(12, 6, 4.5, 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      textures.addCanvas('fx_water_rain_ripple', c);
    }
  }

  // 23. Step 6: Pre-cached Ambient Wildlife (Butterflies, Dragonflies, Fireflies, Songbirds) & Fluttering Leaves
  private static createWildlifeAndNatureFxTextures(textures: Phaser.Textures.TextureManager) {
    // Meadow Butterflies (Saffron-Gold & Sky-Blue) 12x12
    const createButterfly = (key: string, wingOuter: string, wingInner: string) => {
      if (textures.exists(key)) return;
      const c = document.createElement('canvas');
      c.width = 12;
      c.height = 12;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = wingOuter;
      ctx.beginPath();
      ctx.ellipse(3.5, 4.5, 2.8, 3.2, -0.35, 0, Math.PI * 2);
      ctx.ellipse(8.5, 4.5, 2.8, 3.2, 0.35, 0, Math.PI * 2);
      ctx.ellipse(4.0, 8.2, 2.0, 2.1, 0.25, 0, Math.PI * 2);
      ctx.ellipse(8.0, 8.2, 2.0, 2.1, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = wingInner;
      ctx.fillRect(3, 4, 1.5, 1.8);
      ctx.fillRect(7.5, 4, 1.5, 1.8);
      ctx.fillStyle = '#292524';
      ctx.fillRect(5.5, 3, 1, 6);
      textures.addCanvas(key, c);
    };
    createButterfly('fx_butterfly_0', '#f59e0b', '#fef08a');
    createButterfly('fx_butterfly_1', '#38bdf8', '#e0f2fe');

    // Pond Dragonfly (Iridescent Cyan-Teal) 14x12
    if (!textures.exists('fx_dragonfly')) {
      const c = document.createElement('canvas');
      c.width = 14;
      c.height = 12;
      const ctx = c.getContext('2d')!;
      // Translucent wings
      ctx.fillStyle = 'rgba(224, 242, 254, 0.85)';
      ctx.beginPath();
      ctx.ellipse(4.5, 3.5, 3.5, 1.4, -0.3, 0, Math.PI * 2);
      ctx.ellipse(9.5, 3.5, 3.5, 1.4, 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Teal body
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(6, 3, 2, 7.5);
      ctx.fillStyle = '#14b8a6';
      ctx.fillRect(5.5, 2.2, 3, 2);
      textures.addCanvas('fx_dragonfly', c);
    }

    // Night Firefly Warm Glow Orb (14x14)
    if (!textures.exists('fx_firefly')) {
      const c = document.createElement('canvas');
      c.width = 14;
      c.height = 14;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(7, 7, 1, 7, 7, 6.5);
      g.addColorStop(0, 'rgba(254, 249, 195, 1)');
      g.addColorStop(0.38, 'rgba(190, 242, 100, 0.72)');
      g.addColorStop(1, 'rgba(163, 230, 53, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 14, 14);
      textures.addCanvas('fx_firefly', c);
    }

    // Small High-Gliding Songbird (14x10)
    if (!textures.exists('fx_bird')) {
      const c = document.createElement('canvas');
      c.width = 14;
      c.height = 10;
      const ctx = c.getContext('2d')!;
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(1.5, 3.5);
      ctx.quadraticCurveTo(4.5, 1.5, 7, 5);
      ctx.quadraticCurveTo(9.5, 1.5, 12.5, 3.5);
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.fillRect(6, 4.5, 2, 2);
      textures.addCanvas('fx_bird', c);
    }

    // Fluttering Tree Leaf & Pink Blossom Petal (8x8)
    if (!textures.exists('fx_leaf_flutter')) {
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#4d7c0f';
      ctx.beginPath();
      ctx.ellipse(4, 4, 3, 1.7, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#84cc16';
      ctx.fillRect(3, 3, 2, 1.2);
      textures.addCanvas('fx_leaf_flutter', c);
    }

    if (!textures.exists('fx_blossom_petal')) {
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#f9a8d4';
      ctx.beginPath();
      ctx.ellipse(4, 4, 2.4, 1.6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      textures.addCanvas('fx_blossom_petal', c);
    }
  }

  // 24. Step 7: World Composition, Zone Identity & Landmark Detail Textures
  private static createStep7CompositionTextures(textures: Phaser.Textures.TextureManager) {
    // 1. Town Plaza Cobble Medallion beneath Fountain (96x48 ground inlay)
    if (!textures.exists('fx_plaza_medallion')) {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 48;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(214, 211, 209, 0.34)';
      ctx.beginPath();
      ctx.ellipse(48, 24, 42, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(48, 24, 40, 19, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(254, 243, 199, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(48, 24, 34, 16, 0, 0, Math.PI * 2);
      ctx.stroke();
      textures.addCanvas('fx_plaza_medallion', c);
    }

    // 2. Town Stone-Edged Flowerbed (44x26)
    if (!textures.exists('obj_town_flowerbed')) {
      const c = document.createElement('canvas');
      c.width = 44;
      c.height = 26;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#57534e';
      ctx.beginPath();
      ctx.ellipse(22, 16, 19, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.ellipse(22, 14.5, 16.5, 6.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.ellipse(22, 13.5, 15, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const blooms: Array<[number, number, string]> = [
        [13, 12, '#f43f5e'],
        [18, 10, '#facc15'],
        [23, 13, '#ec4899'],
        [28, 11, '#c084fc'],
        [31, 14, '#f97316'],
        [16, 15, '#fef08a'],
      ];
      for (const [bx, by, col] of blooms) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      textures.addCanvas('obj_town_flowerbed', c);
    }

    // 3. Shop A-Frame Chalkboard Menu Sign (24x32)
    if (!textures.exists('obj_shop_menu_board')) {
      const c = document.createElement('canvas');
      c.width = 24;
      c.height = 32;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(13.5, 28.5, 8, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(5, 8, 14, 19);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(6, 9, 12, 14);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(7.5, 10.5, 9, 11);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(9, 12.5, 6, 1.5);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(9, 15.5, 5, 1.2);
      ctx.fillStyle = '#86efac';
      ctx.fillRect(9, 18, 6, 1.2);
      textures.addCanvas('obj_shop_menu_board', c);
    }

    // 4. Bridge Timber Approach Threshold Ramps (clipped 64x32 isometric overlays)
    for (const dir of ['nw', 'ne', 'se', 'sw'] as const) {
      const key = `fx_bridge_approach_${dir}`;
      if (textures.exists(key)) continue;
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 32;
      const ctx = c.getContext('2d')!;
      ctx.save();
      this.clipIsoDiamond(ctx);
      this.setIsoUVTransform(ctx);
      ctx.fillStyle = 'rgba(69, 26, 3, 0.35)';
      if (dir === 'nw') ctx.fillRect(0, 8, 5, 16);
      else if (dir === 'ne') ctx.fillRect(8, 0, 16, 5);
      else if (dir === 'se') ctx.fillRect(27, 8, 5, 16);
      else ctx.fillRect(8, 27, 16, 5);

      ctx.fillStyle = '#92400e';
      for (let i = 0; i < 3; i++) {
        const s = 9 + i * 5;
        if (dir === 'nw') ctx.fillRect(0.6, s, 3.4, 3.8);
        else if (dir === 'ne') ctx.fillRect(s, 0.6, 3.8, 3.4);
        else if (dir === 'se') ctx.fillRect(28, s, 3.4, 3.8);
        else ctx.fillRect(s, 28, 3.8, 3.4);
      }
      ctx.restore();
      textures.addCanvas(key, c);
    }

    // 5. Homestead Avenue Stone Intersection Corner Marker (64x32)
    if (!textures.exists('fx_homestead_corner')) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 32;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(120, 113, 108, 0.42)';
      ctx.beginPath();
      ctx.ellipse(32, 16, 9, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a8a29e';
      ctx.fillRect(28, 14, 3, 2);
      ctx.fillRect(34, 16, 2.5, 1.5);
      ctx.fillRect(30, 17.5, 3, 1.5);
      textures.addCanvas('fx_homestead_corner', c);
    }

    // 6. Wild Meadows: Lush Blossom Patch (34x24) & Sunlit Meadow Stones (32x20)
    if (!textures.exists('obj_meadow_blossoms')) {
      const c = document.createElement('canvas');
      c.width = 34;
      c.height = 24;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
      ctx.beginPath();
      ctx.ellipse(17, 18, 12, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4d7c0f';
      ctx.beginPath();
      ctx.ellipse(17, 16, 11, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(10, 11, 2, 5);
      ctx.fillRect(16, 9, 2, 7);
      ctx.fillRect(23, 10, 2, 6);
      const pts: Array<[number, number, string]> = [
        [11, 10, '#f472b6'],
        [17, 8, '#fef08a'],
        [24, 9, '#93c5fd'],
        [20, 13, '#ffffff'],
        [13, 14, '#fde047'],
      ];
      for (const [fx, fy, col] of pts) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(fx, fy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      textures.addCanvas('obj_meadow_blossoms', c);
    }

    if (!textures.exists('obj_meadow_stones')) {
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 20;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
      ctx.beginPath();
      ctx.ellipse(16, 14.5, 11, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#78716c';
      ctx.beginPath();
      ctx.ellipse(13, 12, 6.5, 3.6, -0.1, 0, Math.PI * 2);
      ctx.ellipse(21, 13.5, 4.5, 2.6, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a8a29e';
      ctx.beginPath();
      ctx.ellipse(12.5, 11, 4, 2, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(16, 13, 3, 2);
      textures.addCanvas('obj_meadow_stones', c);
    }

    // 7. Mirror Lake: Dual Lilypad Cluster (40x26), Shore Sedge (30x34), Shore Pebbles (30x18), Driftwood (36x20)
    if (!textures.exists('obj_lilypad_cluster')) {
      const c = document.createElement('canvas');
      c.width = 40;
      c.height = 26;
      const ctx = c.getContext('2d')!;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(20, 15, 16, 6.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(14, 14, 7.5, 0.4, Math.PI * 1.9);
      ctx.lineTo(14, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(14, 14, 6, 0.45, Math.PI * 1.85);
      ctx.lineTo(14, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(26, 16, 6, 0.3, Math.PI * 1.8);
      ctx.lineTo(26, 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fdf2f8';
      ctx.beginPath();
      ctx.arc(15, 11, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(26, 13.5, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(14.3, 10.3, 1.4, 1.4);
      textures.addCanvas('obj_lilypad_cluster', c);
    }

    if (!textures.exists('obj_shore_sedge')) {
      const c = document.createElement('canvas');
      c.width = 30;
      c.height = 34;
      const ctx = c.getContext('2d')!;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(15, 29, 9.5, 3.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 1.8;
      for (const [ex, ey] of [[8, 12], [12, 8], [16, 7], [20, 10], [23, 15]]) {
        ctx.beginPath();
        ctx.moveTo(15, 29);
        ctx.quadraticCurveTo((15 + ex) / 2, ey + 6, ex, ey);
        ctx.stroke();
      }
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(15, 28);
      ctx.lineTo(15.5, 11);
      ctx.stroke();
      textures.addCanvas('obj_shore_sedge', c);
    }

    if (!textures.exists('obj_shore_pebbles')) {
      const c = document.createElement('canvas');
      c.width = 30;
      c.height = 18;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(120, 93, 55, 0.25)';
      ctx.beginPath();
      ctx.ellipse(15, 12, 10, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#78716c';
      ctx.beginPath();
      ctx.ellipse(11, 11, 4, 2.2, -0.2, 0, Math.PI * 2);
      ctx.ellipse(18, 12, 3.5, 2, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d6d3d1';
      ctx.fillRect(10, 10, 2, 1);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(21, 9.5, 2.5, 2);
      textures.addCanvas('obj_shore_pebbles', c);
    }

    if (!textures.exists('obj_driftwood')) {
      const c = document.createElement('canvas');
      c.width = 36;
      c.height = 20;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.26)';
      ctx.beginPath();
      ctx.ellipse(18, 14.5, 13, 3.8, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(7, 13);
      ctx.quadraticCurveTo(18, 11, 29, 9);
      ctx.stroke();
      ctx.strokeStyle = '#a8a29e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, 12);
      ctx.quadraticCurveTo(18, 10, 28, 8.5);
      ctx.stroke();
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, 10);
      ctx.lineTo(24, 6);
      ctx.stroke();
      textures.addCanvas('obj_driftwood', c);
    }

    // 8. Whispering Forest: Mossy Tree Stump (34x30) & Fallen Mossy Log (42x24)
    if (!textures.exists('obj_tree_stump')) {
      const c = document.createElement('canvas');
      c.width = 34;
      c.height = 30;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(17, 23, 12, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.moveTo(10, 22);
      ctx.lineTo(12, 12);
      ctx.lineTo(22, 12);
      ctx.lineTo(24, 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(13, 13, 6, 9);
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.ellipse(17, 12, 5.5, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(17, 12, 3, 1.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#65a30d';
      ctx.beginPath();
      ctx.arc(12, 21, 2.5, 0, Math.PI * 2);
      ctx.arc(22, 20, 2, 0, Math.PI * 2);
      ctx.fill();
      textures.addCanvas('obj_tree_stump', c);
    }

    if (!textures.exists('obj_mossy_log')) {
      const c = document.createElement('canvas');
      c.width = 42;
      c.height = 24;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(21, 18, 16, 4.5, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.roundRect(7, 10, 27, 8, 4);
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.roundRect(8, 10.5, 24, 5, 3);
      ctx.fill();
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.ellipse(33, 14, 2.5, 3.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#65a30d';
      ctx.beginPath();
      ctx.ellipse(16, 10.5, 5, 2, 0, 0, Math.PI * 2);
      ctx.ellipse(24, 11.2, 4, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(19, 8.5, 2, 1.8);
      textures.addCanvas('obj_mossy_log', c);
    }

    // 9. Quarry & Outskirts: Scree (36x22), Crag (44x36), Ore Cart (46x40), Stacked Stone Blocks (40x32)
    if (!textures.exists('obj_quarry_scree')) {
      const c = document.createElement('canvas');
      c.width = 36;
      c.height = 22;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.beginPath();
      ctx.ellipse(18, 15, 13, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const [rx, ry, rw, rh, col] of [
        [10, 12, 6, 4, '#52525b'],
        [18, 11, 7, 4.5, '#71717a'],
        [24, 14, 5, 3, '#52525b'],
        [14, 15, 5, 3, '#a1a1aa'],
      ] as const) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(rx, ry, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      textures.addCanvas('obj_quarry_scree', c);
    }

    if (!textures.exists('obj_quarry_crag')) {
      const c = document.createElement('canvas');
      c.width = 44;
      c.height = 36;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
      ctx.beginPath();
      ctx.ellipse(24.5, 28.5, 16, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f3f46';
      ctx.beginPath();
      ctx.moveTo(8, 26);
      ctx.lineTo(14, 10);
      ctx.lineTo(25, 6);
      ctx.lineTo(36, 14);
      ctx.lineTo(35, 27);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#71717a';
      ctx.beginPath();
      ctx.moveTo(11, 25);
      ctx.lineTo(15, 12);
      ctx.lineTo(25, 8);
      ctx.lineTo(28, 25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d4d4d8';
      ctx.beginPath();
      ctx.moveTo(15, 12);
      ctx.lineTo(25, 8);
      ctx.lineTo(22, 16);
      ctx.closePath();
      ctx.fill();
      textures.addCanvas('obj_quarry_crag', c);
    }

    if (!textures.exists('obj_ore_cart')) {
      const c = document.createElement('canvas');
      c.width = 46;
      c.height = 40;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
      ctx.beginPath();
      ctx.ellipse(24.5, 33.5, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Iron wheels
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(14, 30, 4.5, 0, Math.PI * 2);
      ctx.arc(31, 30, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#64748b';
      ctx.fillRect(13, 29, 2, 2);
      ctx.fillRect(30, 29, 2, 2);
      // Timber cart hopper
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.moveTo(8, 16);
      ctx.lineTo(37, 16);
      ctx.lineTo(34, 29);
      ctx.lineTo(11, 29);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(11, 18, 23, 9);
      ctx.fillStyle = '#334155';
      ctx.fillRect(9, 21, 27, 2);
      // Heaped quarry granite & iron ore
      ctx.fillStyle = '#71717a';
      ctx.beginPath();
      ctx.arc(16, 15, 5, 0, Math.PI * 2);
      ctx.arc(24, 13, 6, 0, Math.PI * 2);
      ctx.arc(31, 15, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(22, 10, 2, 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(16, 13, 2, 1.5);
      textures.addCanvas('obj_ore_cart', c);
    }

    if (!textures.exists('obj_quarry_blocks')) {
      const c = document.createElement('canvas');
      c.width = 40;
      c.height = 32;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
      ctx.beginPath();
      ctx.ellipse(21.5, 26.5, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Cut granite masonry blocks
      ctx.fillStyle = '#52525b';
      ctx.fillRect(7, 17, 13, 9);
      ctx.fillRect(21, 18, 12, 8);
      ctx.fillStyle = '#a1a1aa';
      ctx.fillRect(7, 15, 13, 3);
      ctx.fillRect(21, 16, 12, 3);
      ctx.fillStyle = '#71717a';
      ctx.fillRect(13, 9, 13, 8);
      ctx.fillStyle = '#d4d4d8';
      ctx.fillRect(13, 8, 13, 2.5);
      textures.addCanvas('obj_quarry_blocks', c);
    }

    // 10. Farm District: Young Sprout Row (34x22), Harvest Crates (36x28), Stone-Well Water Trough (38x28)
    if (!textures.exists('obj_crop_sprouts')) {
      const c = document.createElement('canvas');
      c.width = 34;
      c.height = 22;
      const ctx = c.getContext('2d')!;
      for (const [sx, sy] of [[9, 15], [17, 13], [25, 15], [13, 18], [21, 18]]) {
        ctx.fillStyle = '#15803d';
        ctx.fillRect(sx - 1, sy - 3, 2, 4);
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.ellipse(sx - 2, sy - 3, 2.4, 1.4, -0.4, 0, Math.PI * 2);
        ctx.ellipse(sx + 2, sy - 3, 2.4, 1.4, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      textures.addCanvas('obj_crop_sprouts', c);
    }

    if (!textures.exists('obj_farm_crates')) {
      const c = document.createElement('canvas');
      c.width = 36;
      c.height = 28;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(19.5, 23.5, 14, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(6, 12, 15, 11);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(7, 13, 13, 4);
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.arc(11, 11, 2.8, 0, Math.PI * 2);
      ctx.arc(16, 11.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Burlap harvest sack beside crate
      ctx.fillStyle = '#d6b484';
      ctx.beginPath();
      ctx.ellipse(25, 18, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#92400e';
      ctx.fillRect(23, 13, 4, 1.5);
      textures.addCanvas('obj_farm_crates', c);
    }

    if (!textures.exists('obj_farm_trough')) {
      const c = document.createElement('canvas');
      c.width = 38;
      c.height = 28;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(20.5, 23.5, 15, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5c2d0c';
      ctx.beginPath();
      ctx.roundRect(6, 12, 26, 11, 3);
      ctx.fill();
      ctx.fillStyle = '#92400e';
      ctx.fillRect(8, 12, 22, 4);
      ctx.fillStyle = '#0ea5e9';
      ctx.beginPath();
      ctx.ellipse(19, 14, 9.5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(15, 13.5, 5, 1);
      textures.addCanvas('obj_farm_trough', c);
    }
  }

  /**
   * Step 14: Cozy Fishing Pier Pergola Canopy with Hanging Lantern & Dock Flower Barrel Planter
   */
  private static createStep14ScenicProps(textures: Phaser.Textures.TextureManager) {
    // 1. Timber Shade Pergola / Gazebo Corner Canopy with Hanging Lantern (64x72, originY=0.88)
    if (!textures.exists('obj_pier_pergola')) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 72;
      const ctx = c.getContext('2d')!;

      // Soft ground/deck shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(32, 63, 21, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rear & front stout cedar support posts
      ctx.fillStyle = '#451a03';
      ctx.fillRect(15, 28, 4.5, 34);
      ctx.fillRect(44.5, 28, 4.5, 34);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(15.5, 28, 2, 33);
      ctx.fillRect(45, 28, 2, 33);

      // Diagonal timber knee-braces
      ctx.strokeStyle = '#5c280b';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(19, 36);
      ctx.lineTo(26, 29);
      ctx.moveTo(45, 36);
      ctx.lineTo(38, 29);
      ctx.stroke();

      // Pitched cozy shingled awning roof
      ctx.fillStyle = '#5c260a';
      ctx.beginPath();
      ctx.moveTo(8, 30);
      ctx.lineTo(32, 13);
      ctx.lineTo(56, 30);
      ctx.lineTo(52, 33);
      ctx.lineTo(12, 33);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#9a3412';
      ctx.beginPath();
      ctx.moveTo(10, 29);
      ctx.lineTo(32, 14);
      ctx.lineTo(54, 29);
      ctx.closePath();
      ctx.fill();

      // Roof shingle courses & sunlit ridge beam
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 1.2;
      for (const ry of [20, 24, 27]) {
        const inset = (29 - ry) * 1.1;
        ctx.beginPath();
        ctx.moveTo(12 + inset, ry);
        ctx.lineTo(52 - inset, ry);
        ctx.stroke();
      }
      ctx.fillStyle = '#d97706';
      ctx.fillRect(28, 12.5, 8, 2.5);

      // Hanging brass & amber glass pier lantern centered under ridge
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(31, 30, 2, 6);
      ctx.beginPath();
      ctx.roundRect(27.5, 35, 9, 11, 2);
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(29, 37, 6, 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(31, 39.5, 2, 2);

      // Climbing vine flourish on left post
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(17.5, 42, 3.2, 0, Math.PI * 2);
      ctx.arc(16.5, 50, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(18, 41, 1.5, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('obj_pier_pergola', c);
    }

    // 2. Rope-Bound Dock Flower Barrel & Bollard Planter (34x38, originY=0.86)
    if (!textures.exists('obj_pier_planter')) {
      const c = document.createElement('canvas');
      c.width = 34;
      c.height = 38;
      const ctx = c.getContext('2d')!;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.ellipse(18, 33, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Weathered cypress barrel
      ctx.fillStyle = '#5c3a21';
      ctx.beginPath();
      ctx.roundRect(8, 18, 18, 15, [0, 0, 3, 3]);
      ctx.fill();
      ctx.fillStyle = '#8c5e3c';
      ctx.fillRect(9.5, 19, 6, 13);

      // Coiled hemp rope wraps
      ctx.fillStyle = '#d6b484';
      ctx.fillRect(8, 21, 18, 2);
      ctx.fillRect(8, 28, 18, 2);

      // Coastal reeds & blossoms
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(17, 15, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(16.5, 14, 6.2, 0, Math.PI * 2);
      ctx.fill();

      for (const [bx, by, col] of [
        [13, 12, '#38bdf8'],
        [19, 11, '#fde047'],
        [16, 16, '#fb7185'],
        [21, 15, '#fef08a'],
      ] as const) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(bx, by, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }

      textures.addCanvas('obj_pier_planter', c);
    }
  }

  // ===========================================================================
  // STEP 16: HAND-HELD TOOL SPRITES & IMPACT CHIP PARTICLE TEXTURES
  // ===========================================================================
  private static createActionToolAndParticleSprites(textures: Phaser.Textures.TextureManager): void {
    const outline = '#1b1411';

    // 1. Woodcutter's Axe (28x28, grip near bottom-left [6,22])
    if (!textures.exists('tool_axe')) {
      const c = document.createElement('canvas');
      c.width = 28;
      c.height = 28;
      const ctx = c.getContext('2d')!;

      // Oak handle outline & fill
      ctx.lineCap = 'round';
      ctx.strokeStyle = outline;
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      ctx.moveTo(6, 22);
      ctx.lineTo(20, 8);
      ctx.stroke();

      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(6, 22);
      ctx.lineTo(20, 8);
      ctx.stroke();

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(6.5, 21.5);
      ctx.lineTo(18.5, 9.5);
      ctx.stroke();

      // Forged steel axe blade (extending outward toward upper-left/top of head)
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.moveTo(15, 6);
      ctx.lineTo(22.5, 5.5);
      ctx.lineTo(24.5, 13.5);
      ctx.quadraticCurveTo(19, 15.5, 16, 11.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(16, 7);
      ctx.lineTo(21.6, 6.7);
      ctx.lineTo(23.2, 12.6);
      ctx.quadraticCurveTo(19, 14, 16.8, 11);
      ctx.closePath();
      ctx.fill();

      // Gleaming sharpened edge bevel
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(20.6, 6.8);
      ctx.lineTo(23.1, 12.6);
      ctx.lineTo(21.4, 12.8);
      ctx.lineTo(19.4, 7.6);
      ctx.closePath();
      ctx.fill();

      textures.addCanvas('tool_axe', c);
    }

    // 2. Miner's Pickaxe (28x28, grip near [6,22])
    if (!textures.exists('tool_pickaxe')) {
      const c = document.createElement('canvas');
      c.width = 28;
      c.height = 28;
      const ctx = c.getContext('2d')!;

      ctx.lineCap = 'round';
      ctx.strokeStyle = outline;
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      ctx.moveTo(6, 22);
      ctx.lineTo(20, 8);
      ctx.stroke();

      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(6, 22);
      ctx.lineTo(20, 8);
      ctx.stroke();

      // Curved double-tipped iron pick head
      ctx.lineJoin = 'round';
      ctx.strokeStyle = outline;
      ctx.lineWidth = 5.4;
      ctx.beginPath();
      ctx.moveTo(11.5, 4.5);
      ctx.quadraticCurveTo(19.5, 7.5, 24, 15.5);
      ctx.stroke();

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(11.5, 4.5);
      ctx.quadraticCurveTo(19.5, 7.5, 24, 15.5);
      ctx.stroke();

      // Bright tempered pick tips + brass collar
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(11.5, 4.5);
      ctx.lineTo(14.8, 5.4);
      ctx.moveTo(22.6, 12.4);
      ctx.lineTo(24, 15.5);
      ctx.stroke();

      ctx.fillStyle = '#d97706';
      ctx.fillRect(17.5, 6.8, 3.2, 3.2);

      textures.addCanvas('tool_pickaxe', c);
    }

    // 3. Farmer's Curved Scythe (28x28, grip near [6,22])
    if (!textures.exists('tool_scythe')) {
      const c = document.createElement('canvas');
      c.width = 28;
      c.height = 28;
      const ctx = c.getContext('2d')!;

      ctx.lineCap = 'round';
      ctx.strokeStyle = outline;
      ctx.lineWidth = 4.4;
      ctx.beginPath();
      ctx.moveTo(5.5, 22.5);
      ctx.quadraticCurveTo(13, 14, 19.5, 6.5);
      ctx.stroke();

      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(5.5, 22.5);
      ctx.quadraticCurveTo(13, 14, 19.5, 6.5);
      ctx.stroke();

      // Sweeping crescent steel scythe blade
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.moveTo(18, 6);
      ctx.quadraticCurveTo(25.5, 6.5, 25.5, 16.5);
      ctx.quadraticCurveTo(22.5, 11, 17, 9);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(18.4, 6.8);
      ctx.quadraticCurveTo(24.4, 7.2, 24.4, 15.2);
      ctx.quadraticCurveTo(22, 10.6, 17.6, 8.6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.moveTo(19, 7);
      ctx.quadraticCurveTo(23.8, 7.6, 24.2, 14.5);
      ctx.quadraticCurveTo(22.5, 9.6, 18.8, 7.8);
      ctx.closePath();
      ctx.fill();

      textures.addCanvas('tool_scythe', c);
    }

    // 4. Hunter's Carved Spear-Knife (28x28, grip near [6,22])
    if (!textures.exists('tool_hunt')) {
      const c = document.createElement('canvas');
      c.width = 28;
      c.height = 28;
      const ctx = c.getContext('2d')!;

      ctx.lineCap = 'round';
      ctx.strokeStyle = outline;
      ctx.lineWidth = 4.4;
      ctx.beginPath();
      ctx.moveTo(5.5, 22.5);
      ctx.lineTo(16.5, 11.5);
      ctx.stroke();

      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(5.5, 22.5);
      ctx.lineTo(16.5, 11.5);
      ctx.stroke();

      // Brass crossguard
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(14, 9.5);
      ctx.lineTo(18.5, 14);
      ctx.stroke();

      // Leaf-point steel blade
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.moveTo(15.5, 10.5);
      ctx.lineTo(24.5, 3.5);
      ctx.lineTo(17.5, 12.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(16.2, 10.6);
      ctx.lineTo(23.6, 4.4);
      ctx.lineTo(17.4, 11.8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(16.6, 10.4);
      ctx.lineTo(23.2, 4.7);
      ctx.lineTo(18.2, 10.6);
      ctx.closePath();
      ctx.fill();

      textures.addCanvas('tool_hunt', c);
    }

    // 5. Crisp Impact Chip Particle Sprites (10x10)
    if (!textures.exists('fx_chip_wood')) {
      const c = document.createElement('canvas');
      c.width = 10;
      c.height = 10;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#92400e';
      ctx.fillRect(2, 3, 6, 3);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(3, 3.5, 4, 1.5);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(5, 6, 3, 2);
      textures.addCanvas('fx_chip_wood', c);
    }

    if (!textures.exists('fx_chip_stone')) {
      const c = document.createElement('canvas');
      c.width = 10;
      c.height = 10;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#64748b';
      ctx.fillRect(2, 3, 4, 4);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(2.5, 3.5, 2, 2);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(6, 2, 2.5, 2.5);
      textures.addCanvas('fx_chip_stone', c);
    }

    if (!textures.exists('fx_chip_grass')) {
      const c = document.createElement('canvas');
      c.width = 10;
      c.height = 10;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#15803d';
      ctx.fillRect(2, 4, 5, 2.5);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(4, 2, 3.5, 4);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(6, 6, 2, 2);
      textures.addCanvas('fx_chip_grass', c);
    }

    if (!textures.exists('fx_hit_spark')) {
      const c = document.createElement('canvas');
      c.width = 10;
      c.height = 10;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(4, 1, 2, 8);
      ctx.fillRect(1, 4, 8, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(4, 4, 2, 2);
      textures.addCanvas('fx_hit_spark', c);
    }
  }
}
