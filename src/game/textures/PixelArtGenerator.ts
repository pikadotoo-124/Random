/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Phaser from 'phaser';

/**
 * Modern Stylized 2D Texture Generator
 * Produces vibrant, organic, clean top-down/isometric nature tiles,
 * expressive stylized characters, animals, and charming town architecture.
 */
export class PixelArtGenerator {
  public static generateAll(scene: Phaser.Scene): void {
    const textures = scene.textures;

    // 1. Organic Ground Tiles (Seamless 64x32 isometric diamond, zero blocky borders, multiple natural variations)
    this.createGrassTiles(textures);
    this.createCobbleTiles(textures);
    this.createWaterTiles(textures);
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
    this.createAnimalSprites(textures);
    this.createFishNodeSprite(textures);
    this.createWaterEnvironmentSprites(textures);

    // 3. Buildings & Town Landmarks
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

    // 4. Stylized 2D Characters & NPCs (2x Resolution 64x88 frames, 4 directions x 3 steps)
    this.createCharacterSpritesheet(textures, 'player_male', '#d97706', '#1c1917', '#2563eb', 'male');
    this.createCharacterSpritesheet(textures, 'player_female', '#f59e0b', '#7c2d12', '#059669', 'female');
    this.createCharacterSpritesheet(textures, 'npc_merchant', '#f59e0b', '#451a03', '#7c3aed', 'male');
    this.createCharacterSpritesheet(textures, 'npc_settler', '#facc15', '#1e293b', '#d97706', 'female');
    this.createCharacterSpritesheet(textures, 'npc_elder', '#d4a373', '#e2e8f0', '#0f766e', 'male');
    this.createCharacterSpritesheet(textures, 'npc_blacksmith', '#d97706', '#451a03', '#991b1b', 'male');
    this.createCharacterSpritesheet(textures, 'npc_florist', '#f59e0b', '#78350f', '#ec4899', 'female');
    this.createCharacterSpritesheet(textures, 'npc_baker', '#facc15', '#b45309', '#f59e0b', 'female');
    this.createCharacterSpritesheet(textures, 'npc_grocer', '#f59e0b', '#78350f', '#16a34a', 'female');
    this.createCharacterSpritesheet(textures, 'npc_farmer', '#d97706', '#713f12', '#15803d', 'male');

    // 5. Environmental Particles
    this.createParticleTextures(textures);
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

    // Main diamond face with smooth antialiased fill
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(hw, 0);
    ctx.lineTo(w, hh);
    ctx.lineTo(hw, h);
    ctx.lineTo(0, hh);
    ctx.closePath();
    ctx.fill();

    // Subtle edge highlight only when requested for depth (without protruding skirt lines)
    if (edgeColor && edgeColor !== fillColor) {
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }
  }

  // Soft layered ambient + contact drop shadow texture
  private static createShadowTexture(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('shadow_round')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 24;
    const ctx = canvas.getContext('2d')!;

    // Outer soft ambient occlusion shadow
    const grad = ctx.createRadialGradient(24, 12, 1, 24, 12, 22);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.56)');
    grad.addColorStop(0.42, 'rgba(15, 23, 42, 0.36)');
    grad.addColorStop(0.75, 'rgba(15, 23, 42, 0.14)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(24, 12, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tight inner contact shadow core
    ctx.fillStyle = 'rgba(2, 6, 23, 0.25)';
    ctx.beginPath();
    ctx.ellipse(24, 12.2, 10, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();

    textures.addCanvas('shadow_round', canvas);
  }

  // 1. Lush Organic Grass Tiles with 4 distinct natural variations (meadow, clovers, wildflowers, sunny moss)
  private static createGrassTiles(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_grass_0')) return;

    // Variant 0: Pure Lush Spring Meadow
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#5e9438');

      // Soft blade tufts
      ctx.fillStyle = '#78ae3e';
      const blades = [[24, 12], [38, 10], [18, 16], [46, 14], [30, 22], [42, 20]];
      for (const [bx, by] of blades) {
        ctx.fillRect(bx, by, 2, 2);
        ctx.fillRect(bx + 1, by - 1, 1, 2);
      }
      textures.addCanvas('tile_grass_0', canvas);
      textures.addCanvas('tile_grass', canvas); // default fallback
    }

    // Variant 1: Meadow with delicate three-leaf clover tufts
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#578e34');

      // Clover clusters
      ctx.fillStyle = '#7cb342';
      const clovers = [[26, 14], [38, 18], [22, 22]];
      for (const [cx, cy] of clovers) {
        ctx.beginPath();
        ctx.arc(cx - 1.5, cy, 1.3, 0, Math.PI * 2);
        ctx.arc(cx + 1.5, cy, 1.3, 0, Math.PI * 2);
        ctx.arc(cx, cy - 1.5, 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#497529';
        ctx.fillRect(cx, cy, 1, 2); // stem
        ctx.fillStyle = '#7cb342';
      }
      textures.addCanvas('tile_grass_1', canvas);
    }

    // Variant 2: Wildflower Meadow with tiny daisies and buttercups
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#5d9437');

      // Buttercup yellow flowers
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(32, 14, 1.6, 0, Math.PI * 2);
      ctx.arc(44, 20, 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Daisy white flowers with amber center
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(20, 18, 1.5, 0, Math.PI * 2);
      ctx.arc(36, 24, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(20, 18, 1, 1);
      ctx.fillRect(36, 24, 1, 1);

      textures.addCanvas('tile_grass_2', canvas);
    }

    // Variant 3: Warm Sunny Grass with gentle soft mossy tones
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#669c3a');

      // Warm sun highlights
      ctx.fillStyle = '#80b848';
      ctx.beginPath();
      ctx.ellipse(32, 16, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#8dc452';
      ctx.fillRect(28, 14, 3, 2);
      ctx.fillRect(36, 16, 3, 2);

      textures.addCanvas('tile_grass_3', canvas);
    }
  }

  // 2. Cobblestone Pavers with natural rounded stones & sandy mortar
  private static createCobbleTiles(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_cobble_0')) return;

    // Variant 0: Smooth River Stone Pavers
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#4b4844');

      const stones = [
        { x: 32, y: 7, rx: 7, ry: 3.5, col: '#78716c' },
        { x: 20, y: 13, rx: 6, ry: 3, col: '#857e77' },
        { x: 44, y: 13, rx: 6, ry: 3, col: '#6c655e' },
        { x: 32, y: 16, rx: 8, ry: 4, col: '#8a837c' },
        { x: 16, y: 19, rx: 5, ry: 2.8, col: '#716a63' },
        { x: 48, y: 19, rx: 5, ry: 2.8, col: '#7d766f' },
        { x: 26, y: 23, rx: 6, ry: 3, col: '#6f6861' },
        { x: 38, y: 23, rx: 6, ry: 3, col: '#847d75' },
      ];

      for (const s of stones) {
        ctx.fillStyle = s.col;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.beginPath();
        ctx.ellipse(s.x - 1, s.y - 0.8, s.rx * 0.5, s.ry * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      textures.addCanvas('tile_cobble_0', canvas);
      textures.addCanvas('tile_cobble', canvas);
    }

    // Variant 1: Cobblestone with varied stone sizes
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#484541');

      const stones = [
        { x: 32, y: 8, rx: 6, ry: 3, col: '#736d66' },
        { x: 18, y: 12, rx: 5.5, ry: 2.8, col: '#817b73' },
        { x: 46, y: 12, rx: 6, ry: 3, col: '#7d776f' },
        { x: 28, y: 16, rx: 7, ry: 3.5, col: '#8b847c' },
        { x: 40, y: 17, rx: 6, ry: 3, col: '#777169' },
        { x: 20, y: 21, rx: 5, ry: 2.5, col: '#6e6860' },
        { x: 34, y: 23, rx: 7, ry: 3.5, col: '#827c74' },
        { x: 46, y: 21, rx: 5.5, ry: 2.8, col: '#7a746c' },
      ];

      for (const s of stones) {
        ctx.fillStyle = s.col;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      textures.addCanvas('tile_cobble_1', canvas);
    }
  }

  // 3. Shimmering Crystal Lake Water with gentle wave caustics (zero grid seams)
  private static createWaterTiles(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_water_0')) return;

    // Variant 0: Deep Serene Blue with curved ripple caustics
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#0284c7');

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(22, 10);
      ctx.quadraticCurveTo(32, 8, 42, 10);
      ctx.moveTo(16, 17);
      ctx.quadraticCurveTo(32, 15, 48, 17);
      ctx.moveTo(24, 23);
      ctx.quadraticCurveTo(32, 21, 40, 23);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(28, 12, 1, 0, Math.PI * 2);
      ctx.arc(42, 16, 1.1, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('tile_water_0', canvas);
      textures.addCanvas('tile_water', canvas);
    }

    // Variant 1: Shimmering Azure with Sunlight Reflection
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#0ea5e9');

      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(20, 12);
      ctx.quadraticCurveTo(32, 10, 44, 12);
      ctx.moveTo(26, 20);
      ctx.quadraticCurveTo(34, 18, 42, 20);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(32, 14, 1.4, 0, Math.PI * 2);
      ctx.arc(22, 18, 1, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('tile_water_1', canvas);
    }

    // Variant 2: Deep Emerald-Glade Pond Water with gentle reflections
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#0369a1');

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(18, 14);
      ctx.quadraticCurveTo(32, 11, 46, 14);
      ctx.moveTo(22, 22);
      ctx.quadraticCurveTo(34, 19, 44, 22);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.beginPath();
      ctx.arc(36, 12, 1.2, 0, Math.PI * 2);
      ctx.arc(24, 20, 1, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('tile_water_2', canvas);
    }
  }

  // 4. Soft Golden Sand Shoreline Tiles
  private static createSandTiles(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_sand_0')) return;

    // Variant 0: Warm Golden Beach Sand
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#d97706');

      ctx.fillStyle = '#fef08a';
      const grains = [[20, 14], [34, 11], [44, 16], [28, 20], [38, 23]];
      for (const [gx, gy] of grains) {
        ctx.fillRect(gx, gy, 1.5, 1.5);
      }

      textures.addCanvas('tile_sand_0', canvas);
      textures.addCanvas('tile_sand', canvas);
    }

    // Variant 1: Soft Shell & Pebble Fringe Sand
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#d47306');

      ctx.fillStyle = '#fef3c7';
      const grains = [[24, 12], [42, 13], [18, 18], [32, 22], [46, 20]];
      for (const [gx, gy] of grains) {
        ctx.fillRect(gx, gy, 1.5, 1.5);
      }

      // Small smooth beach pebble
      ctx.fillStyle = '#b45309';
      ctx.fillRect(30, 15, 2, 2);

      textures.addCanvas('tile_sand_1', canvas);
    }
  }

  // 5. Distinct Main Roads vs Organic Winding Nature Trails
  private static createDirtTiles(textures: Phaser.Textures.TextureManager) {
    if (!textures.exists('tile_dirt_0')) {
      // Variant 0: Packed Loamy Earth (Trail base)
      {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        this.drawIsoDiamond(ctx, 64, 32, '#854d0e');

        ctx.fillStyle = '#a16207';
        ctx.fillRect(24, 12, 3, 2);
        ctx.fillRect(36, 14, 4, 2);
        ctx.fillRect(28, 20, 3, 2);

        ctx.fillStyle = '#713f12';
        ctx.fillRect(32, 17, 2, 1);
        ctx.fillRect(42, 13, 2, 1);

        textures.addCanvas('tile_dirt_0', canvas);
        textures.addCanvas('tile_dirt', canvas);
      }

      // Variant 1: Dirt Trail with smooth river pebbles
      {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        this.drawIsoDiamond(ctx, 64, 32, '#814a0e');

        ctx.fillStyle = '#995d12';
        ctx.fillRect(22, 14, 3, 2);
        ctx.fillRect(38, 18, 3, 2);

        ctx.fillStyle = '#a8a29e';
        ctx.fillRect(30, 12, 2, 1.5);
        ctx.fillRect(44, 16, 2, 1.5);
        ctx.fillRect(26, 22, 2, 1.5);

        textures.addCanvas('tile_dirt_1', canvas);
      }
    }

    // Main Road Variants: Sunlit Compacted Gravel & Warm Sandstone Curb Flecks (distinct from woodland trails)
    if (!textures.exists('tile_road_main_0')) {
      for (let v = 0; v < 2; v++) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        this.drawIsoDiamond(ctx, 64, 32, v === 0 ? '#a16e3a' : '#9a6835');

        // Soft inner dressed gravel highlight
        ctx.fillStyle = 'rgba(254, 243, 199, 0.14)';
        ctx.beginPath();
        ctx.ellipse(32, 16, 18, 8.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Compacted stone & sand grain texture
        ctx.fillStyle = '#d6b286';
        const specs = v === 0
          ? [[24, 14], [38, 13], [30, 19], [44, 17], [20, 16]]
          : [[26, 12], [40, 15], [33, 21], [22, 18], [46, 14]];
        for (const [sx, sy] of specs) {
          ctx.fillRect(sx, sy, 2.2, 1.4);
        }

        // Subtle dressed curb pebbles
        ctx.fillStyle = '#78716c';
        ctx.fillRect(28, 10, 2, 1.5);
        ctx.fillRect(35, 22, 2.2, 1.5);
        if (v === 1) {
          ctx.fillStyle = '#a8a29e';
          ctx.fillRect(42, 11, 2, 1.4);
        }

        textures.addCanvas(`tile_road_main_${v}`, canvas);
      }
    }

    // Secondary Woodland/Quarry Footpath Variants: Soft Forest Earth with Leaf & Grass Dapples
    if (!textures.exists('tile_trail_0')) {
      for (let v = 0; v < 2; v++) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        // Grass base so the footpath feels naturally worn through meadow/forest floor
        this.drawIsoDiamond(ctx, 64, 32, '#5c9136');

        // Narrow organic worn earth center
        ctx.fillStyle = v === 0 ? '#7c4d19' : '#744716';
        ctx.beginPath();
        ctx.ellipse(32, 16, 20, 9.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#925b20';
        ctx.beginPath();
        ctx.ellipse(32, 16, 13, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Delicate grass blades encroaching at trail edges & fallen leaf specks
        ctx.fillStyle = '#65a30d';
        ctx.fillRect(14, 15, 3, 2);
        ctx.fillRect(47, 16, 3, 2);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(28, 14, 1.5, 1.5);
        ctx.fillRect(37, 18, 1.5, 1.5);

        textures.addCanvas(`tile_trail_${v}`, canvas);
      }
    }
  }

  // 6. Rugged Mountain & Plateau Cliff Strata Tiles
  private static createCliffTiles(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_cliff_0')) return;

    // Variant 0: Chiseled Slate Strata with Alpine Moss
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#52525b');

      // Layered horizontal slate strata fractures
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(18, 14);
      ctx.lineTo(46, 14);
      ctx.moveTo(24, 20);
      ctx.lineTo(40, 20);
      ctx.stroke();

      // Sunlit rock ledge highlight
      ctx.fillStyle = '#71717a';
      ctx.fillRect(20, 11, 8, 2);
      ctx.fillRect(36, 17, 8, 2);

      // Hardy mountain moss in rock crevice
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(28, 15, 4, 2);
      ctx.fillRect(34, 19, 3, 2);

      textures.addCanvas('tile_cliff_0', canvas);
      textures.addCanvas('tile_cliff', canvas);
    }

    // Variant 1: Weathered Granite Mountain Peak Face
    {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#4b4b53');

      // Angular rock strata lines
      ctx.strokeStyle = '#333338';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(22, 10);
      ctx.lineTo(38, 16);
      ctx.moveTo(28, 18);
      ctx.lineTo(44, 24);
      ctx.stroke();

      // Top facet highlight
      ctx.fillStyle = '#6b6b75';
      ctx.fillRect(26, 8, 10, 2);
      ctx.fillRect(32, 20, 6, 2);

      textures.addCanvas('tile_cliff_1', canvas);
    }
  }

  // 7. Polished Cedar Wood Floor Tile
  private static createWoodFloorTile(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_wood_floor')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;

    this.drawIsoDiamond(ctx, 64, 32, '#9a3412');

    // Clean wooden plank seams
    ctx.strokeStyle = '#541c09';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, 9);
    ctx.lineTo(46, 23);
    ctx.moveTo(26, 5);
    ctx.lineTo(54, 19);
    ctx.stroke();

    textures.addCanvas('tile_wood_floor', canvas);
  }

  // 8. Tilled Farmland Soil Tile with irrigation furrow ridges
  private static createFarmlandTile(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('tile_farmland')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;

    // Rich dark fertile soil
    this.drawIsoDiamond(ctx, 64, 32, '#451a03');

    // Tilled furrow ridges and irrigation troughs
    ctx.strokeStyle = '#291102';
    ctx.lineWidth = 1.2;
    for (let i = -1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(16 + i * 10, 8 + i * 5);
      ctx.lineTo(44 + i * 10, 22 + i * 5);
      ctx.stroke();
    }

    // Warm soil highlights on furrow crests
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(18 + i * 10, 7 + i * 5);
      ctx.lineTo(46 + i * 10, 21 + i * 5);
      ctx.stroke();
    }

    // Tiny green sprout specks
    ctx.fillStyle = '#84cc16';
    ctx.fillRect(26, 14, 2, 2);
    ctx.fillRect(38, 20, 2, 2);
    ctx.fillRect(32, 11, 1.5, 2);

    textures.addCanvas('tile_farmland', canvas);
  }

  // 9. Natural Narrow Isometric Wooden Bridges (Directional EW, NS & Cross decks over flowing water)
  private static createBridgeTile(textures: Phaser.Textures.TextureManager) {
    if (!textures.exists('tile_bridge')) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      this.drawIsoDiamond(ctx, 64, 32, '#9a3412');
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

    // Elevated directional bridge overlays rendered over shimmering water tile (64x48, anchor 0.5, 32/48)
    const drawPlankedDeck = (
      ctx: CanvasRenderingContext2D,
      axis: 'ew' | 'ns' | 'cross'
    ) => {
      const oy = 16; // diamond top starts at y=16 in 64x48 canvas

      const drawAxisDeck = (dir: 'ew' | 'ns') => {
        // EW spans NW -> SE: center of NW edge (16, oy+8) to center of SE edge (48, oy+24)
        // NS spans NE -> SW: center of NE edge (48, oy+8) to center of SW edge (16, oy+24)
        const sx = dir === 'ew' ? 16 : 48;
        const sy = oy + 8;
        const ex = dir === 'ew' ? 48 : 16;
        const ey = oy + 24;
        // Narrow half-width perpendicular offset (~62% of tile diamond)
        const px = dir === 'ew' ? 9.5 : -9.5;
        const py = -4.75;

        // 1. Soft water drop-shadow under raised bridge span
        ctx.fillStyle = 'rgba(2, 6, 23, 0.34)';
        ctx.beginPath();
        ctx.moveTo(sx - px, sy - py + 5);
        ctx.lineTo(ex - px, ey - py + 5);
        ctx.lineTo(ex + px, ey + py + 5);
        ctx.lineTo(sx + px, sy + py + 5);
        ctx.closePath();
        ctx.fill();

        // 2. Submerged dark timber support pilings
        ctx.fillStyle = '#451a03';
        for (const [bx, by] of [[sx - px * 0.85, sy - py * 0.85], [sx + px * 0.85, sy + py * 0.85], [ex - px * 0.85, ey - py * 0.85], [ex + px * 0.85, ey + py * 0.85]]) {
          ctx.fillRect(bx - 1.5, by - 1, 3, 7);
        }

        // 3. Bridge side skirt thickness
        ctx.fillStyle = '#5c260a';
        ctx.beginPath();
        ctx.moveTo(sx - px, sy - py);
        ctx.lineTo(ex - px, ey - py);
        ctx.lineTo(ex - px, ey - py + 3.5);
        ctx.lineTo(sx - px, sy - py + 3.5);
        ctx.closePath();
        ctx.fill();

        // 4. Warm cedar deck base
        ctx.fillStyle = '#9a4a1a';
        ctx.beginPath();
        ctx.moveTo(sx - px, sy - py);
        ctx.lineTo(ex - px, ey - py);
        ctx.lineTo(ex + px, ey + py);
        ctx.lineTo(sx + px, sy + py);
        ctx.closePath();
        ctx.fill();

        // 5. Individual cross-planks with alternating tones & nail rivets
        const plankSteps = 6;
        for (let i = 0; i < plankSteps; i++) {
          const t0 = i / plankSteps;
          const t1 = (i + 0.84) / plankSteps;
          const ax = sx + (ex - sx) * t0;
          const ay = sy + (ey - sy) * t0;
          const bx = sx + (ex - sx) * t1;
          const by = sy + (ey - sy) * t1;

          ctx.fillStyle = i % 2 === 0 ? '#b45a22' : '#a14d1a';
          ctx.beginPath();
          ctx.moveTo(ax - px, ay - py);
          ctx.lineTo(bx - px, by - py);
          ctx.lineTo(bx + px, by + py);
          ctx.lineTo(ax + px, ay + py);
          ctx.closePath();
          ctx.fill();

          // Subtle bevel highlight
          ctx.strokeStyle = 'rgba(254, 243, 199, 0.2)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(ax - px * 0.9, ay - py * 0.9);
          ctx.lineTo(ax + px * 0.9, ay + py * 0.9);
          ctx.stroke();
        }

        // 6. Raised Wooden Handrails & Corner Posts (only on EW / NS single bridges so cross intersections stay open)
        if (axis !== 'cross') {
          const railH = 7.5;
          for (const side of [-1, 1]) {
            const r1x = sx + px * side * 0.92;
            const r1y = sy + py * side * 0.92;
            const r2x = ex + px * side * 0.92;
            const r2y = ey + py * side * 0.92;

            // End & mid vertical posts
            ctx.fillStyle = '#451a03';
            for (const [pxPos, pyPos] of [[r1x, r1y], [(r1x + r2x) / 2, (r1y + r2y) / 2], [r2x, r2y]]) {
              ctx.fillRect(pxPos - 1.5, pyPos - railH - 1, 3, railH + 2);
              ctx.fillStyle = '#d97706';
              ctx.fillRect(pxPos - 1, pyPos - railH - 1.5, 2, 1.5); // Post cap
              ctx.fillStyle = '#451a03';
            }

            // Top rail beam
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.moveTo(r1x, r1y - railH);
            ctx.lineTo(r2x, r2y - railH);
            ctx.stroke();

            ctx.strokeStyle = '#c26d27';
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(r1x, r1y - railH - 0.5);
            ctx.lineTo(r2x, r2y - railH - 0.5);
            ctx.stroke();
          }
        }
      };

      if (axis === 'ew') {
        drawAxisDeck('ew');
      } else if (axis === 'ns') {
        drawAxisDeck('ns');
      } else {
        drawAxisDeck('ew');
        drawAxisDeck('ns');
      }
    };

    for (const axis of ['ew', 'ns', 'cross'] as const) {
      const texKey = `obj_bridge_${axis}`;
      if (!textures.exists(texKey)) {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 48;
        const ctx = c.getContext('2d')!;
        drawPlankedDeck(ctx, axis);
        textures.addCanvas(texKey, c);
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

  // 7. Beautiful Stylized 2D Oak Tree
  private static createTreeSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('res_tree')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 72;
    canvas.height = 88;
    const ctx = canvas.getContext('2d')!;

    // 1. Soft tree drop shadow on ground
    const shadowGrad = ctx.createRadialGradient(36, 78, 4, 36, 78, 24);
    shadowGrad.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
    shadowGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(36, 78, 22, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Trunk with organic bark & root flares
    ctx.fillStyle = '#5c3317';
    ctx.beginPath();
    ctx.moveTo(32, 45);
    ctx.lineTo(40, 45);
    ctx.lineTo(44, 76);
    ctx.lineTo(48, 80);
    ctx.lineTo(24, 80);
    ctx.lineTo(28, 76);
    ctx.closePath();
    ctx.fill();

    // Trunk highlight
    ctx.fillStyle = '#78431f';
    ctx.beginPath();
    ctx.moveTo(34, 46);
    ctx.lineTo(38, 46);
    ctx.lineTo(41, 76);
    ctx.lineTo(36, 76);
    ctx.closePath();
    ctx.fill();

    // 3. Multi-tiered rounded stylized lush foliage canopy
    // Deep back foliage layer
    ctx.fillStyle = '#1e3a12';
    ctx.beginPath();
    ctx.arc(28, 38, 18, 0, Math.PI * 2);
    ctx.arc(44, 38, 18, 0, Math.PI * 2);
    ctx.arc(36, 24, 20, 0, Math.PI * 2);
    ctx.fill();

    // Mid-tone vibrant leaf clusters
    ctx.fillStyle = '#3f701b';
    ctx.beginPath();
    ctx.arc(26, 36, 16, 0, Math.PI * 2);
    ctx.arc(46, 36, 16, 0, Math.PI * 2);
    ctx.arc(36, 22, 18, 0, Math.PI * 2);
    ctx.fill();

    // Sunlit bright top clusters
    ctx.fillStyle = '#5c9c27';
    ctx.beginPath();
    ctx.arc(24, 32, 13, 0, Math.PI * 2);
    ctx.arc(46, 30, 13, 0, Math.PI * 2);
    ctx.arc(36, 16, 15, 0, Math.PI * 2);
    ctx.fill();

    // Warm golden sunshine highlights
    ctx.fillStyle = '#8bc34a';
    ctx.beginPath();
    ctx.arc(23, 27, 8, 0, Math.PI * 2);
    ctx.arc(45, 25, 7, 0, Math.PI * 2);
    ctx.arc(36, 12, 9, 0, Math.PI * 2);
    ctx.fill();

    // Delicate leaf tuft details
    ctx.fillStyle = '#aed581';
    ctx.beginPath();
    ctx.arc(34, 10, 4, 0, Math.PI * 2);
    ctx.arc(22, 24, 3, 0, Math.PI * 2);
    ctx.fill();

    textures.addCanvas('res_tree', canvas);
    textures.addCanvas('obj_tree', canvas); // alias for WorldScene
  }

  // 7B. Tall Mountain Evergreen Pine / Fir Tree (Alpine & Northern Ridge)
  private static createPineTreeSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('res_tree_pine')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    // 1. Soft round ground shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
    ctx.beginPath();
    ctx.ellipse(32, 86, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Slender bark trunk
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.moveTo(29, 54);
    ctx.lineTo(35, 54);
    ctx.lineTo(37, 85);
    ctx.lineTo(27, 85);
    ctx.closePath();
    ctx.fill();

    // Trunk highlight
    ctx.fillStyle = '#5c2406';
    ctx.fillRect(31, 55, 2, 30);

    // 3. Multi-tiered conical evergreen needle boughs
    // Tier 1: Bottom wide bough
    ctx.fillStyle = '#14532d';
    ctx.beginPath();
    ctx.moveTo(32, 40);
    ctx.lineTo(54, 68);
    ctx.lineTo(32, 63);
    ctx.lineTo(10, 68);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#166534';
    ctx.beginPath();
    ctx.moveTo(32, 40);
    ctx.lineTo(50, 65);
    ctx.lineTo(32, 60);
    ctx.lineTo(14, 65);
    ctx.closePath();
    ctx.fill();

    // Tier 2: Middle bough
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.moveTo(32, 24);
    ctx.lineTo(50, 48);
    ctx.lineTo(32, 44);
    ctx.lineTo(14, 48);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.moveTo(32, 24);
    ctx.lineTo(46, 45);
    ctx.lineTo(32, 41);
    ctx.lineTo(18, 45);
    ctx.closePath();
    ctx.fill();

    // Tier 3: Top bough & Spire
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.moveTo(32, 8);
    ctx.lineTo(44, 32);
    ctx.lineTo(32, 28);
    ctx.lineTo(20, 32);
    ctx.closePath();
    ctx.fill();

    // Sunny needle highlights
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.moveTo(32, 8);
    ctx.lineTo(38, 22);
    ctx.lineTo(32, 20);
    ctx.closePath();
    ctx.fill();

    // Tiny pinecones
    ctx.fillStyle = '#78350f';
    ctx.fillRect(20, 50, 3, 5);
    ctx.fillRect(42, 51, 3, 5);
    ctx.fillRect(26, 68, 3.5, 5);
    ctx.fillRect(38, 67, 3.5, 5);

    textures.addCanvas('res_tree_pine', canvas);
    textures.addCanvas('obj_tree_pine', canvas);
  }

  // 7C. Golden Autumn / Birch Tree with distinctive white bark and golden foliage
  private static createBirchTreeSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('res_tree_birch')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 68;
    canvas.height = 88;
    const ctx = canvas.getContext('2d')!;

    // Ground shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
    ctx.beginPath();
    ctx.ellipse(34, 78, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Slender white birch trunk
    ctx.fillStyle = '#e7e5e4';
    ctx.beginPath();
    ctx.moveTo(31, 44);
    ctx.lineTo(37, 44);
    ctx.lineTo(39, 77);
    ctx.lineTo(29, 77);
    ctx.closePath();
    ctx.fill();

    // Dark charcoal horizontal bark notches
    ctx.fillStyle = '#292524';
    ctx.fillRect(30, 72, 5, 1.5);
    ctx.fillRect(33, 65, 4, 1.5);
    ctx.fillRect(31, 58, 4.5, 1.5);
    ctx.fillRect(32, 50, 4, 1.5);

    // Multi-tiered Golden Amber & Honey Orange Autumn Canopy
    // Deep base
    ctx.fillStyle = '#9a3412';
    ctx.beginPath();
    ctx.arc(26, 38, 16, 0, Math.PI * 2);
    ctx.arc(42, 38, 16, 0, Math.PI * 2);
    ctx.arc(34, 24, 18, 0, Math.PI * 2);
    ctx.fill();

    // Golden-amber midtone
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(24, 36, 15, 0, Math.PI * 2);
    ctx.arc(44, 36, 15, 0, Math.PI * 2);
    ctx.arc(34, 22, 16, 0, Math.PI * 2);
    ctx.fill();

    // Sunlit golden yellow top
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(23, 30, 12, 0, Math.PI * 2);
    ctx.arc(43, 28, 12, 0, Math.PI * 2);
    ctx.arc(34, 16, 14, 0, Math.PI * 2);
    ctx.fill();

    // Warm buttercup highlights
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(22, 25, 7, 0, Math.PI * 2);
    ctx.arc(42, 23, 6, 0, Math.PI * 2);
    ctx.arc(34, 12, 8, 0, Math.PI * 2);
    ctx.fill();

    textures.addCanvas('res_tree_birch', canvas);
    textures.addCanvas('obj_tree_birch', canvas);
  }

  // 7D-Extra: Blooming Spring Woodland Tree, Roadside Flora, Zone Signposts, Animated Water Shimmer & Swimming Fish
  private static createPhase2EnvironmentSprites(textures: Phaser.Textures.TextureManager) {
    // 1. Lush Blossom / Mossy Canopy Tree
    if (!textures.exists('obj_tree_blossom')) {
      const canvas = document.createElement('canvas');
      canvas.width = 72;
      canvas.height = 88;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
      ctx.beginPath();
      ctx.ellipse(36, 78, 22, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5c3317';
      ctx.beginPath();
      ctx.moveTo(32, 46);
      ctx.lineTo(40, 46);
      ctx.lineTo(44, 79);
      ctx.lineTo(28, 79);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#2d5a27';
      ctx.beginPath();
      ctx.arc(26, 37, 17, 0, Math.PI * 2);
      ctx.arc(46, 37, 17, 0, Math.PI * 2);
      ctx.arc(36, 23, 19, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#4f8f33';
      ctx.beginPath();
      ctx.arc(25, 34, 14, 0, Math.PI * 2);
      ctx.arc(46, 33, 14, 0, Math.PI * 2);
      ctx.arc(36, 19, 16, 0, Math.PI * 2);
      ctx.fill();

      // Delicate spring wild-blossom clusters
      const blossoms = [
        [24, 28, '#f9a8d4'], [44, 25, '#fbcfe8'], [35, 13, '#f472b6'],
        [29, 36, '#fbcfe8'], [47, 35, '#f9a8d4'], [38, 22, '#fdf2f8'],
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

    // 2. Meadow Wildflower Clump (30x22)
    if (!textures.exists('obj_wildflower_clump')) {
      const canvas = document.createElement('canvas');
      canvas.width = 30;
      canvas.height = 22;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#3f6212';
      ctx.beginPath();
      ctx.ellipse(15, 16, 10, 4, 0, 0, Math.PI * 2);
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

    // 3. Forest & Foothill Fern Tuft (32x24)
    if (!textures.exists('obj_fern_tuft')) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 24;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.beginPath();
      ctx.ellipse(16, 19, 11, 4, 0, 0, Math.PI * 2);
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

    // 4. Foothill Pebble Cluster (28x18)
    if (!textures.exists('obj_pebble_cluster')) {
      const canvas = document.createElement('canvas');
      canvas.width = 28;
      canvas.height = 18;
      const ctx = canvas.getContext('2d')!;
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

    // 5. Directional Carved Cedar Zone Entrance Signposts (36x52)
    for (const facing of ['right', 'left'] as const) {
      const key = `obj_signpost_zone_${facing}`;
      if (!textures.exists(key)) {
        const canvas = document.createElement('canvas');
        canvas.width = 36;
        canvas.height = 52;
        const ctx = canvas.getContext('2d')!;

        // Soft ambient shadow
        ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
        ctx.beginPath();
        ctx.ellipse(18, 46, 12, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Mossy cobblestone plinth base
        ctx.fillStyle = '#57534e';
        ctx.beginPath();
        ctx.roundRect(11, 39, 14, 7, 2);
        ctx.fill();
        ctx.fillStyle = '#78716c';
        ctx.fillRect(12, 40, 12, 2.5);
        ctx.fillStyle = '#65a30d';
        ctx.fillRect(12, 44, 4, 2);

        // Sturdy oak post
        ctx.fillStyle = '#5c2d0c';
        ctx.fillRect(15, 8, 6, 33);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(16, 9, 2.5, 31);
        // Post cap
        ctx.fillStyle = '#b45309';
        ctx.fillRect(14, 6, 8, 3);

        // Main directional plaque pointing left or right
        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        if (facing === 'right') {
          ctx.moveTo(6, 12);
          ctx.lineTo(29, 12);
          ctx.lineTo(35, 19);
          ctx.lineTo(29, 26);
          ctx.lineTo(6, 26);
        } else {
          ctx.moveTo(30, 12);
          ctx.lineTo(7, 12);
          ctx.lineTo(1, 19);
          ctx.lineTo(7, 26);
          ctx.lineTo(30, 26);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        if (facing === 'right') {
          ctx.moveTo(7, 13.5);
          ctx.lineTo(28, 13.5);
          ctx.lineTo(33, 19);
          ctx.lineTo(28, 24.5);
          ctx.lineTo(7, 24.5);
        } else {
          ctx.moveTo(29, 13.5);
          ctx.lineTo(8, 13.5);
          ctx.lineTo(3, 19);
          ctx.lineTo(8, 24.5);
          ctx.lineTo(29, 24.5);
        }
        ctx.closePath();
        ctx.fill();

        // Carved golden plaque trim & brass rivets
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(10, 17, 16, 1.5);
        ctx.fillRect(10, 20.5, 12, 1.5);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(17, 14, 2, 2);
        ctx.fillRect(17, 22, 2, 2);

        textures.addCanvas(key, canvas);
      }
    }

    // 6. Animated Water Surface Shimmer Overlay (48x24)
    if (!textures.exists('fx_water_shimmer')) {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 24;
      const ctx = canvas.getContext('2d')!;
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.72)';
      ctx.lineWidth = 1.4;
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

        // Subtle underwater ripple wake behind fish
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(8, 8, 6, Math.PI * 0.65, Math.PI * 1.35);
        ctx.stroke();

        // Translucent submerged shadow silhouette + vibrant river-trout orange/silver sheen
        ctx.fillStyle = 'rgba(12, 74, 110, 0.5)';
        ctx.beginPath();
        ctx.ellipse(15, 9, 6.5, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fb923c';
        ctx.beginPath();
        ctx.ellipse(15, 8, 6, 2.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tail fin
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(9, 8);
        ctx.lineTo(5, 5);
        ctx.lineTo(5, 11);
        ctx.closePath();
        ctx.fill();

        // Shimmer stripe & eye
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(13, 6.8, 5, 1);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(19, 7.2, 1.2, 1.2);

        textures.addCanvas(key, canvas);
      }
    }
  }

  // 7D. Majestic Mountain Ridges and Cliff Rock Formations
  private static createMountainSprites(textures: Phaser.Textures.TextureManager) {
    // 1. Towering Granite Mountain Ridge / Peak (80x80)
    if (!textures.exists('res_mountain_ridge')) {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 80;
      const ctx = canvas.getContext('2d')!;

      // Deep ground shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.beginPath();
      ctx.ellipse(40, 70, 36, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Mountain body - base outline
      ctx.fillStyle = '#27272a';
      ctx.beginPath();
      ctx.moveTo(8, 70);
      ctx.lineTo(24, 40);
      ctx.lineTo(40, 10);
      ctx.lineTo(56, 35);
      ctx.lineTo(72, 70);
      ctx.closePath();
      ctx.fill();

      // Shaded left rock facet
      ctx.fillStyle = '#3f3f46';
      ctx.beginPath();
      ctx.moveTo(8, 70);
      ctx.lineTo(24, 40);
      ctx.lineTo(40, 10);
      ctx.lineTo(36, 70);
      ctx.closePath();
      ctx.fill();

      // Sunlit right rock facet
      ctx.fillStyle = '#71717a';
      ctx.beginPath();
      ctx.moveTo(40, 10);
      ctx.lineTo(56, 35);
      ctx.lineTo(72, 70);
      ctx.lineTo(36, 70);
      ctx.closePath();
      ctx.fill();

      // Sharp central ridge crest highlight
      ctx.fillStyle = '#a1a1aa';
      ctx.beginPath();
      ctx.moveTo(40, 10);
      ctx.lineTo(44, 12);
      ctx.lineTo(42, 50);
      ctx.lineTo(38, 50);
      ctx.closePath();
      ctx.fill();

      // Alpine snow cap on peak
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(40, 10);
      ctx.lineTo(46, 22);
      ctx.lineTo(41, 19);
      ctx.lineTo(36, 23);
      ctx.lineTo(34, 18);
      ctx.closePath();
      ctx.fill();

      // Hardy mountain moss along base ledges
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(18, 58, 8, 3);
      ctx.fillRect(48, 54, 10, 3);

      textures.addCanvas('res_mountain_ridge', canvas);
      textures.addCanvas('obj_mountain_ridge', canvas);
    }

    // 2. Chiseled Cliff Boulder (64x52)
    if (!textures.exists('res_cliff_rock')) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 52;
      const ctx = canvas.getContext('2d')!;

      // Drop shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
      ctx.beginPath();
      ctx.ellipse(32, 44, 26, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Boulder body
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

      // Sunlit front facet
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

      // Top sun highlight
      ctx.fillStyle = '#a1a1aa';
      ctx.beginPath();
      ctx.moveTo(20, 20);
      ctx.lineTo(36, 14);
      ctx.lineTo(48, 18);
      ctx.lineTo(34, 26);
      ctx.closePath();
      ctx.fill();

      textures.addCanvas('res_cliff_rock', canvas);
      textures.addCanvas('obj_cliff_rock', canvas);
    }
  }

  // 8. Chiseled Mossy Granite Rock
  private static createRockSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('res_rock')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 40;
    const ctx = canvas.getContext('2d')!;

    // Soft drop shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.beginPath();
    ctx.ellipse(24, 33, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Boulder base outline
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

    // Boulder body (chiseled facet)
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

    // Sunny top facet highlight
    ctx.fillStyle = '#a1a1aa';
    ctx.beginPath();
    ctx.moveTo(16, 15);
    ctx.lineTo(27, 10);
    ctx.lineTo(38, 14);
    ctx.lineTo(26, 20);
    ctx.closePath();
    ctx.fill();

    // Specular edge
    ctx.fillStyle = '#e4e4e7';
    ctx.beginPath();
    ctx.moveTo(27, 10);
    ctx.lineTo(34, 12);
    ctx.lineTo(28, 14);
    ctx.closePath();
    ctx.fill();

    // Moss patch at base
    ctx.fillStyle = '#65a30d';
    ctx.beginPath();
    ctx.arc(16, 28, 4, 0, Math.PI * 2);
    ctx.arc(22, 30, 3, 0, Math.PI * 2);
    ctx.fill();

    textures.addCanvas('res_rock', canvas);
    textures.addCanvas('obj_rock', canvas);
  }

  // 9. Lush Wild Flowering Berry Bush
  private static createBushSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('res_bush')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 36;
    const ctx = canvas.getContext('2d')!;

    // Drop shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.beginPath();
    ctx.ellipse(20, 30, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dark foliage base
    ctx.fillStyle = '#1e3a12';
    ctx.beginPath();
    ctx.arc(14, 20, 10, 0, Math.PI * 2);
    ctx.arc(26, 20, 10, 0, Math.PI * 2);
    ctx.arc(20, 14, 11, 0, Math.PI * 2);
    ctx.fill();

    // Vibrant leaf dome
    ctx.fillStyle = '#4d7c0f';
    ctx.beginPath();
    ctx.arc(14, 18, 9, 0, Math.PI * 2);
    ctx.arc(26, 18, 9, 0, Math.PI * 2);
    ctx.arc(20, 12, 10, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = '#84cc16';
    ctx.beginPath();
    ctx.arc(18, 10, 5, 0, Math.PI * 2);
    ctx.arc(24, 14, 4, 0, Math.PI * 2);
    ctx.fill();

    // Ripe red wild berries
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

  // 10. Stylized Wild Animals (Rabbit & Deer)
  private static createAnimalSprites(textures: Phaser.Textures.TextureManager) {
    // 1. Cute Stylized Rabbit
    if (!textures.exists('res_animal_rabbit')) {
      const canvas = document.createElement('canvas');
      canvas.width = 36;
      canvas.height = 36;
      const ctx = canvas.getContext('2d')!;

      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
      ctx.beginPath();
      ctx.ellipse(18, 30, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Fluffy body
      ctx.fillStyle = '#f5f5f4';
      ctx.beginPath();
      ctx.ellipse(18, 22, 9, 7, -0.1, 0, Math.PI * 2);
      ctx.fill();

      // Cute head
      ctx.beginPath();
      ctx.ellipse(24, 16, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ears with pink interior
      ctx.fillStyle = '#f5f5f4';
      ctx.beginPath();
      ctx.ellipse(22, 9, 2.5, 6, -0.2, 0, Math.PI * 2);
      ctx.ellipse(26, 8, 2.5, 6, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.ellipse(22, 9, 1.2, 4.5, -0.2, 0, Math.PI * 2);
      ctx.ellipse(26, 8, 1.2, 4.5, 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Eye & nose
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.arc(26, 15, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fda4af';
      ctx.fillRect(28, 17, 1.5, 1.5);

      // Tail
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(9, 21, 3, 0, Math.PI * 2);
      ctx.fill();

      textures.addCanvas('res_animal_rabbit', canvas);
      textures.addCanvas('res_animal', canvas); // fallback alias
      textures.addCanvas('obj_animal', canvas);
    }

    // 2. Graceful Forest Deer
    if (!textures.exists('res_animal_deer')) {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 54;
      const ctx = canvas.getContext('2d')!;

      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(24, 48, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Legs
      ctx.fillStyle = '#78350f';
      ctx.fillRect(16, 32, 2.5, 16);
      ctx.fillRect(21, 32, 2.5, 15);
      ctx.fillRect(29, 32, 2.5, 16);
      ctx.fillRect(34, 32, 2.5, 15);

      // Chestnut body
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.ellipse(25, 30, 13, 8, 0, 0, Math.PI * 2);
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

      // Eye
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.arc(42, 12, 1, 0, Math.PI * 2);
      ctx.fill();

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
    signType?: 'bakery' | 'general' | 'grocery' | 'blacksmith' | 'florist' | 'none';
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
      signType = 'none',
    } = opts;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;

    const cx = canvasW / 2;
    const cy = baseCenterY;
    const s = 0.88; // Slight perimeter breathing room inside tile footprint

    const top = { x: cx + (tileH - tileW) * 16 * s, y: cy - (tileW + tileH) * 8 * s };
    const right = { x: cx + (tileW + tileH) * 16 * s, y: cy + (tileW - tileH) * 8 * s };
    const bottom = { x: cx + (tileW - tileH) * 16 * s, y: cy + (tileW + tileH) * 8 * s };
    const left = { x: cx - (tileW + tileH) * 16 * s, y: cy + (tileH - tileW) * 8 * s };

    const lerpPt = (a: { x: number; y: number }, b: { x: number; y: number }, t: number, yOff = 0) => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t + yOff,
    });

    // 1. Directional Cast Ground Shadow (bottom-right offset matching morning top-left sunlight)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.32)';
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

    // 2. Stone Masonry Foundation Plinth (height 9px)
    const plinthH = 9;
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
    // Stone cap bevel
    ctx.strokeStyle = '#a8a29e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y - plinthH);
    ctx.lineTo(bottom.x, bottom.y - plinthH);
    ctx.lineTo(right.x, right.y - plinthH);
    ctx.stroke();

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

    // Structural Corner Timber Posts
    ctx.strokeStyle = trimColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(left.x + 1, left.y - plinthH);
    ctx.lineTo(left.x + 1, left.y - totalWallTopOffset);
    ctx.moveTo(bottom.x, bottom.y - plinthH);
    ctx.lineTo(bottom.x, bottom.y - totalWallTopOffset);
    ctx.moveTo(right.x - 1, right.y - plinthH);
    ctx.lineTo(right.x - 1, right.y - totalWallTopOffset);
    ctx.stroke();

    // Isometric Window Helper
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
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(midTop.x, midTop.y);
      ctx.lineTo(midBot.x, midBot.y);
      ctx.moveTo(midL.x, midL.y);
      ctx.lineTo(midR.x, midR.y);
      ctx.stroke();

      // Flower box under window
      if (withFlowerBox) {
        const fb0 = lerpPt(pA, pB, t0 - 0.02, -(yBot - 2));
        const fb1 = lerpPt(pA, pB, t1 + 0.02, -(yBot - 2));
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(fb0.x, fb0.y);
        ctx.lineTo(fb1.x, fb1.y);
        ctx.stroke();

        // Tiny flowers
        for (let k = 0; k < 3; k++) {
          const fp = lerpPt(fb0, fb1, 0.2 + k * 0.3, -2);
          ctx.fillStyle = k === 1 ? '#facc15' : '#ef4444';
          ctx.beginPath();
          ctx.arc(fp.x, fp.y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    // Isometric Front Door Helper
    const drawIsoDoor = (pA: { x: number; y: number }, pB: { x: number; y: number }, t0: number, t1: number) => {
      const doorH = Math.min(20, wallH - 9);
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

      // Oak door panel
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

      // Brass knob
      const knob = lerpPt(i0, i1, 0.78, -doorH * 0.45);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(knob.x, knob.y, 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Stone doorstep slab extending out
      const stepExt = 4;
      ctx.fillStyle = '#a8a29e';
      ctx.beginPath();
      ctx.moveTo(d0.x, d0.y + 8);
      ctx.lineTo(d1.x, d1.y + 8);
      ctx.lineTo(d1.x - stepExt, d1.y + 11);
      ctx.lineTo(d0.x - stepExt, d0.y + 11);
      ctx.closePath();
      ctx.fill();
    };

    // Door & Windows on Ground Floor
    if (doorSide === 'left') {
      drawIsoDoor(left, bottom, 0.56, 0.78);
      drawIsoWindow(left, bottom, 0.16, 0.42, plinthH + 5, 11, hasFlowerBoxes);
      drawIsoWindow(bottom, right, 0.25, 0.56, plinthH + 5, 11, hasFlowerBoxes);
    } else {
      drawIsoDoor(bottom, right, 0.24, 0.52);
      drawIsoWindow(left, bottom, 0.16, 0.42, plinthH + 5, 11, hasFlowerBoxes);
      drawIsoWindow(left, bottom, 0.56, 0.82, plinthH + 5, 11, hasFlowerBoxes);
    }

    // Blacksmith Glowing Forge Hearth on Right Wall
    if (hasForgeHearth) {
      const f0 = lerpPt(bottom, right, 0.62, -plinthH);
      const f1 = lerpPt(bottom, right, 0.88, -plinthH);
      const fu1 = lerpPt(bottom, right, 0.88, -(plinthH + 15));
      const fu0 = lerpPt(bottom, right, 0.62, -(plinthH + 15));
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.moveTo(f0.x, f0.y);
      ctx.lineTo(f1.x, f1.y);
      ctx.lineTo(fu1.x, fu1.y);
      ctx.lineTo(fu0.x, fu0.y);
      ctx.closePath();
      ctx.fill();
      // Glowing embers inside
      const fg = ctx.createRadialGradient((f0.x + f1.x) / 2, (f0.y + f1.y) / 2 - 4, 1, (f0.x + f1.x) / 2, (f0.y + f1.y) / 2 - 4, 8);
      fg.addColorStop(0, '#fef08a');
      fg.addColorStop(0.5, '#f97316');
      fg.addColorStop(1, 'rgba(220, 38, 38, 0.2)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc((f0.x + f1.x) / 2, (f0.y + f1.y) / 2 - 4, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Optional Striped Shop Awning along Left-Front Wall
    if (hasAwning) {
      const aL = lerpPt(left, bottom, 0.08, -(wallH - 4));
      const aR = lerpPt(left, bottom, 0.50, -(wallH - 4));
      const awSteps = 6;
      for (let i = 0; i < awSteps; i++) {
        const s0 = lerpPt(aL, aR, i / awSteps);
        const s1 = lerpPt(aL, aR, (i + 1) / awSteps);
        ctx.fillStyle = hasAwning.colors[i % 2];
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.lineTo(s1.x - 5, s1.y + 8);
        ctx.lineTo(s0.x - 5, s0.y + 8);
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
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(left.x - 2, left.y - uBot);
        ctx.lineTo(bottom.x, bottom.y - uBot + 1);
        ctx.lineTo(right.x + 2, right.y - uBot);
        ctx.moveTo(left.x - 2, left.y - uTop);
        ctx.lineTo(bottom.x, bottom.y - uTop + 1);
        ctx.lineTo(right.x + 2, right.y - uTop);
        // Vertical & diagonal beams
        const mL = lerpPt(left, bottom, 0.5);
        ctx.moveTo(mL.x, mL.y - uBot);
        ctx.lineTo(mL.x, mL.y - uTop);
        ctx.moveTo(bottom.x, bottom.y - uBot + 1);
        ctx.lineTo(bottom.x, bottom.y - uTop + 1);
        ctx.stroke();
      }

      // Upper story windows
      drawIsoWindow(left, bottom, 0.2, 0.42, uBot + 4, upperH - 7, false);
      drawIsoWindow(left, bottom, 0.58, 0.80, uBot + 4, upperH - 7, false);
      drawIsoWindow(bottom, right, 0.34, 0.66, uBot + 4, upperH - 7, false);
    }

    // 5. Brick / Stone Chimney (drawn behind roof ridge)
    if (chimneySide !== 'none') {
      const chBase = chimneySide === 'back'
        ? lerpPt(top, right, 0.35, -(eaveBase + roofH * 0.55))
        : lerpPt(bottom, right, 0.55, -(eaveBase + roofH * 0.65));
      ctx.fillStyle = chimneySide === 'back' ? '#991b1b' : '#57534e';
      ctx.fillRect(chBase.x - 5, chBase.y - 18, 10, 22);
      ctx.fillStyle = chimneySide === 'back' ? '#7f1d1d' : '#44403c';
      ctx.fillRect(chBase.x, chBase.y - 18, 5, 22);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(chBase.x - 6, chBase.y - 20, 12, 3);
      // Soft rising smoke puffs
      ctx.fillStyle = 'rgba(241, 245, 249, 0.65)';
      ctx.beginPath();
      ctx.arc(chBase.x + 1, chBase.y - 25, 3.2, 0, Math.PI * 2);
      ctx.arc(chBase.x + 4, chBase.y - 31, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Pitched Isometric Gable Roof (ridge runs along left->bottom axis for crisp silhouette)
    const eaveOver = 5;
    const eaveLeft = { x: left.x - eaveOver, y: left.y - eaveBase + 3 };
    const eaveBot = { x: bottom.x, y: bottom.y - eaveBase + 5 };
    const eaveRight = { x: right.x + eaveOver, y: right.y - eaveBase + 3 };
    const eaveTop = { x: top.x, y: top.y - eaveBase - 1 };

    // Roof ridge endpoints (midpoints between left<->top and bottom<->right, elevated by roofH)
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
    ctx.lineWidth = 1.5;
    ctx.stroke();

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

    // Crisp Roof Shingle Courses
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 1.1;
    for (let r = 0.25; r <= 0.78; r += 0.25) {
      const p0 = lerpPt(ridgeBack, eaveLeft, r);
      const p1 = lerpPt(ridgeFront, eaveBot, r);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    // Overhang Eaves Trim & Ridge Cap Highlight
    ctx.strokeStyle = trimColor;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(eaveLeft.x, eaveLeft.y);
    ctx.lineTo(eaveBot.x, eaveBot.y);
    ctx.lineTo(ridgeFront.x, ridgeFront.y);
    ctx.lineTo(eaveRight.x, eaveRight.y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ridgeBack.x, ridgeBack.y);
    ctx.lineTo(ridgeFront.x, ridgeFront.y);
    ctx.stroke();

    // Optional Dormer Window on Roof (for Grand Villa / Manor)
    if (hasDormer) {
      const dm = lerpPt(lerpPt(ridgeBack, ridgeFront, 0.5), lerpPt(eaveLeft, eaveBot, 0.5), 0.45);
      ctx.fillStyle = upperLeftColor;
      ctx.fillRect(dm.x - 7, dm.y - 8, 14, 10);
      ctx.fillStyle = roofDarkColor;
      ctx.beginPath();
      ctx.moveTo(dm.x - 9, dm.y - 8);
      ctx.lineTo(dm.x, dm.y - 15);
      ctx.lineTo(dm.x + 9, dm.y - 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(dm.x - 4, dm.y - 6, 8, 6);
    }

    // 7. Hanging Shop Signboard near front corner
    if (signType !== 'none') {
      const sp = lerpPt(left, bottom, 0.88, -(wallH - 8));
      ctx.fillStyle = '#451a03';
      ctx.fillRect(sp.x - 7, sp.y - 2, 14, 2);
      ctx.fillStyle = '#fef3c7';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(sp.x - 6, sp.y, 12, 10, 2);
      ctx.fill();
      ctx.stroke();

      if (signType === 'bakery') {
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y + 5, 4, 2.2, -0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (signType === 'general') {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y + 5, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (signType === 'grocery') {
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(sp.x - 1.5, sp.y + 5.5, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#16a34a';
        ctx.beginPath();
        ctx.arc(sp.x + 2, sp.y + 5, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (signType === 'blacksmith') {
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sp.x - 3, sp.y + 7);
        ctx.lineTo(sp.x + 3, sp.y + 3);
        ctx.stroke();
      } else if (signType === 'florist') {
        ctx.fillStyle = '#ec4899';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y + 5, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#facc15';
        ctx.fillRect(sp.x - 0.8, sp.y + 4.2, 1.6, 1.6);
      }
    }

    return canvas;
  }

  // 12A. Cozy Wooden Cottage (2x2 Isometric Building - Upgraded Visual Quality & True Footprint)
  private static createHouseSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('bld_house_small')) return;
    const canvas = this.drawIsoBuildingCanvas({
      canvasW: 148,
      canvasH: 140,
      baseCenterY: 100,
      tileW: 2,
      tileH: 2,
      wallH: 34,
      roofH: 26,
      wallLeftColor: '#b4742a',
      wallRightColor: '#8c5319',
      roofLightColor: '#c2571a',
      roofDarkColor: '#923a0f',
      roofGableColor: '#9c6121',
      doorSide: 'left',
      hasFlowerBoxes: true,
      chimneySide: 'back',
    });
    textures.addCanvas('bld_house_small', canvas);
    textures.addCanvas('obj_house_small', canvas);
  }

  // 12B. Timber Manor (3x2 Two-Story Medium House)
  private static createMediumHouseSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('bld_house_medium')) return;
    const canvas = this.drawIsoBuildingCanvas({
      canvasW: 188,
      canvasH: 172,
      baseCenterY: 124,
      tileW: 3,
      tileH: 2,
      wallH: 32,
      upperH: 22,
      roofH: 28,
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
    });
    textures.addCanvas('bld_house_medium', canvas);
    textures.addCanvas('obj_house_medium', canvas);
  }

  // 12C. Grand Homestead Villa (3x3 Large Two-Story Villa)
  private static createLargeHouseSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('bld_house_large')) return;
    const canvas = this.drawIsoBuildingCanvas({
      canvasW: 224,
      canvasH: 196,
      baseCenterY: 140,
      tileW: 3,
      tileH: 3,
      wallH: 36,
      upperH: 24,
      roofH: 34,
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

  // 16. Wrought-Iron Lantern Post with Ambient Warm Light Halo
  private static createLanternSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('bld_lantern')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 54;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Warm radial light halo on ground
    const halo = ctx.createRadialGradient(27, 48, 2, 27, 48, 24);
    halo.addColorStop(0, 'rgba(251, 191, 36, 0.4)');
    halo.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(27, 48, 24, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base footing
    ctx.fillStyle = '#292524';
    ctx.fillRect(24, 46, 6, 4);

    // Wooden / Iron Post
    ctx.fillStyle = '#451a03';
    ctx.fillRect(25.5, 18, 3, 30);

    // Hanging cross-bracket
    ctx.fillStyle = '#292524';
    ctx.fillRect(22, 16, 14, 3);
    ctx.fillRect(32, 19, 2, 4);

    // Lantern Glass & Flame
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.roundRect(29, 22, 8, 12, 2);
    ctx.fill();

    // Glowing amber glass
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(30.5, 24, 5, 8);

    // Core bright wick
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(32, 27, 2, 2);

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

  // 19. Carved Limestone Town Fountain
  private static createFountainSprite(textures: Phaser.Textures.TextureManager) {
    if (textures.exists('obj_town_fountain')) return;
    const canvas = document.createElement('canvas');
    canvas.width = 72;
    canvas.height = 68;
    const ctx = canvas.getContext('2d')!;

    // Shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.beginPath();
    ctx.ellipse(36, 56, 30, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Octagonal Limestone Basin
    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.ellipse(36, 46, 28, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Basin Rim
    ctx.fillStyle = '#a8a29e';
    ctx.beginPath();
    ctx.ellipse(36, 44, 26, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Turquoise Water Pool
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.ellipse(36, 44, 22, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Center Tiered Pedestal
    ctx.fillStyle = '#57534e';
    ctx.fillRect(32, 26, 8, 18);
    ctx.fillStyle = '#a8a29e';
    ctx.beginPath();
    ctx.ellipse(36, 26, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Water Spout Sprays
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(36, 26);
    ctx.quadraticCurveTo(30, 16, 24, 38);
    ctx.moveTo(36, 26);
    ctx.quadraticCurveTo(42, 16, 48, 38);
    ctx.stroke();

    // Water ripple rings in pool
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(36, 44, 12, 5, 0, 0, Math.PI * 2);
    ctx.stroke();

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
        canvasW: 148,
        canvasH: 156,
        baseCenterY: 116,
        tileW: 2,
        tileH: 2,
        wallH: 30,
        upperH: 20,
        roofH: 26,
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

      // Drop shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(21, 23, 18, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cast iron legs and armrests
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(8, 14, 2, 10);
      ctx.fillRect(32, 14, 2, 10);
      ctx.fillRect(7, 10, 3, 5);
      ctx.fillRect(32, 10, 3, 5);

      // Wooden seat slats
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(6, 14, 30, 3);
      ctx.fillRect(6, 18, 30, 3);
      // Wooden backrest slats
      ctx.fillStyle = '#b45309';
      ctx.fillRect(6, 7, 30, 3);
      ctx.fillRect(6, 11, 30, 3);

      textures.addCanvas('obj_bench', canvas);
    }

    // 4. Barrel Planter with Blooming Flowers (28x32)
    if (!textures.exists('obj_flower_pot')) {
      const canvas = document.createElement('canvas');
      canvas.width = 28;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;

      // Drop shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
      ctx.beginPath();
      ctx.ellipse(14, 28, 11, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Oak wooden half-barrel
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.roundRect(6, 16, 16, 12, [0, 0, 3, 3]);
      ctx.fill();
      // Iron metal bands
      ctx.fillStyle = '#334155';
      ctx.fillRect(6, 18, 16, 1.5);
      ctx.fillRect(6, 24, 16, 1.5);

      // Soil crest
      ctx.fillStyle = '#451a03';
      ctx.fillRect(6.5, 15, 15, 2);

      // Lush green foliage
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(14, 12, 7, 0, Math.PI * 2);
      ctx.fill();

      // Multi-colored flowers (sunflowers, roses, lavender)
      ctx.fillStyle = '#ef4444'; // Red
      ctx.beginPath();
      ctx.arc(11, 10, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#facc15'; // Yellow
      ctx.beginPath();
      ctx.arc(17, 9, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c084fc'; // Purple
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

      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
      ctx.beginPath();
      ctx.ellipse(13, 26, 10, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Barrel body with curved bulge
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.roundRect(5, 7, 16, 20, 4);
      ctx.fill();

      // Top wood lid
      ctx.fillStyle = '#b45309';
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

      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(14, 20, 12, 3.5, 0, 0, Math.PI * 2);
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
      ctx.fillStyle = '#84cc16'; // Green apple
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

      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(14, 40, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Timber post
      ctx.fillStyle = '#78350f';
      ctx.fillRect(12, 8, 4, 32);

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
      ctx.fillStyle = '#451a03'; // Arrow carving
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

      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
      ctx.beginPath();
      ctx.ellipse(24, 30, 21, 5, 0, 0, Math.PI * 2);
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
        canvasW: 188,
        canvasH: 172,
        baseCenterY: 124,
        tileW: 3,
        tileH: 2,
        wallH: 36,
        roofH: 28,
        wallLeftColor: '#f5deb3',
        wallRightColor: '#d9bc8c',
        roofLightColor: '#ea580c',
        roofDarkColor: '#9a3412',
        roofGableColor: '#e2c598',
        doorSide: 'left',
        hasAwning: { colors: ['#ea580c', '#fef3c7'] },
        hasFlowerBoxes: true,
        chimneySide: 'back',
        signType: 'bakery',
      });
      textures.addCanvas('obj_house_bakery', canvas);
    }

    // 2. General Store (3x2)
    if (!textures.exists('obj_house_general')) {
      const canvas = this.drawIsoBuildingCanvas({
        canvasW: 188,
        canvasH: 172,
        baseCenterY: 124,
        tileW: 3,
        tileH: 2,
        wallH: 36,
        upperH: 16,
        roofH: 26,
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
        signType: 'general',
      });
      textures.addCanvas('obj_house_general', canvas);
    }

    // 3. Fresh Grocery Shop (3x2)
    if (!textures.exists('obj_house_grocery')) {
      const canvas = this.drawIsoBuildingCanvas({
        canvasW: 188,
        canvasH: 172,
        baseCenterY: 124,
        tileW: 3,
        tileH: 2,
        wallH: 36,
        roofH: 28,
        wallLeftColor: '#dcfce7',
        wallRightColor: '#b5d9c1',
        roofLightColor: '#15803d',
        roofDarkColor: '#14532d',
        roofGableColor: '#c3e6cf',
        doorSide: 'left',
        hasAwning: { colors: ['#16a34a', '#ffffff'] },
        hasFlowerBoxes: true,
        chimneySide: 'none',
        signType: 'grocery',
      });
      textures.addCanvas('obj_house_grocery', canvas);
    }

    // 4. Blacksmith Forge Shop (3x2)
    if (!textures.exists('obj_house_blacksmith')) {
      const canvas = this.drawIsoBuildingCanvas({
        canvasW: 188,
        canvasH: 172,
        baseCenterY: 124,
        tileW: 3,
        tileH: 2,
        wallH: 36,
        roofH: 28,
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
        signType: 'blacksmith',
      });
      textures.addCanvas('obj_house_blacksmith', canvas);
    }

    // 5. Charming Flower Shop (2x2)
    if (!textures.exists('obj_house_florist')) {
      const canvas = this.drawIsoBuildingCanvas({
        canvasW: 148,
        canvasH: 140,
        baseCenterY: 100,
        tileW: 2,
        tileH: 2,
        wallH: 34,
        roofH: 26,
        wallLeftColor: '#fce7f3',
        wallRightColor: '#e2c5d4',
        roofLightColor: '#22c55e',
        roofDarkColor: '#15803d',
        roofGableColor: '#e2c5d4',
        doorSide: 'left',
        hasAwning: { colors: ['#ec4899', '#fdf2f8'] },
        hasFlowerBoxes: true,
        chimneySide: 'none',
        signType: 'florist',
      });
      textures.addCanvas('obj_house_florist', canvas);
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

      // Drop shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
      ctx.beginPath();
      ctx.ellipse(24, 48, 20, 6, 0, 0, Math.PI * 2);
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

      // Pitched shingle roof
      ctx.fillStyle = '#9a3412';
      ctx.beginPath();
      ctx.moveTo(24, 4);
      ctx.lineTo(42, 16);
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

      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(19, 23, 16, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Hay roll body
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

      // Shadow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(19, 48, 12, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Vertical support post
      ctx.fillStyle = '#78350f';
      ctx.fillRect(18, 14, 3, 34);

      // Horizontal arm crossbeam
      ctx.fillRect(7, 24, 25, 2.5);

      // Red flannel checkered shirt
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(13, 20, 13, 16);
      ctx.fillStyle = '#fef08a'; // Straw cuffs
      ctx.fillRect(6, 23, 4, 4);
      ctx.fillRect(29, 23, 4, 4);

      // Burlap head with stitched smile
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(19, 14, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#451a03'; // Button eyes
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

  // 23. High-Resolution 2x Stylized 2D Character Spritesheet (64x88 per frame, rendered at scale 0.5 for crisp 32x44 presence)
  // 12 frames (4 directions x 3 animation steps): [Down 0..2, Left 3..5, Right 6..8, Up 9..11]
  private static createCharacterSpritesheet(
    textures: Phaser.Textures.TextureManager,
    key: string,
    skinColor: string,
    hairColor: string,
    clothesColor: string,
    gender: 'male' | 'female'
  ) {
    if (textures.exists(key)) return;

    const frameW = 64;
    const frameH = 88;
    const totalFrames = 12;
    const canvas = document.createElement('canvas');
    canvas.width = frameW * totalFrames;
    canvas.height = frameH;
    const ctx = canvas.getContext('2d')!;

    for (let f = 0; f < totalFrames; f++) {
      const dirIndex = Math.floor(f / 3); // 0=down, 1=left, 2=right, 3=up
      const stepIndex = f % 3; // 0=left leg step, 1=idle, 2=right leg step

      ctx.save();
      ctx.translate(f * frameW, 0);
      ctx.scale(2, 2); // Render in 32x44 logical coordinates onto 64x88 crisp physical canvas

      // Crisp grounded contact shadow beneath character feet
      const footShadow = ctx.createRadialGradient(16, 40, 1, 16, 40, 10.5);
      footShadow.addColorStop(0, 'rgba(2, 6, 23, 0.55)');
      footShadow.addColorStop(0.55, 'rgba(15, 23, 42, 0.28)');
      footShadow.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = footShadow;
      ctx.beginPath();
      ctx.ellipse(16, 40, 10.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Natural bobbing offset when walking
      const bob = stepIndex === 1 ? 0 : -0.9;

      // --- 1. LEGS & SHADED BOOTS ---
      const bootSoleColor = '#090d16';
      const bootLeatherColor = '#334155';
      const bootHighlightColor = '#475569';
      const bootTrimColor = '#94a3b8';

      if (dirIndex === 0 || dirIndex === 3) {
        const leftLegY = stepIndex === 0 ? 33 : 35;
        const rightLegY = stepIndex === 2 ? 33 : 35;

        // Left Leg & Boot
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(10.6, leftLegY + bob - 0.3, 5.3, 6.2, 1);
        ctx.fill();
        ctx.fillStyle = bootLeatherColor;
        ctx.fillRect(11, leftLegY + bob, 4.5, 5.2);
        ctx.fillStyle = bootHighlightColor;
        ctx.fillRect(11.3, leftLegY + bob + 0.5, 1.8, 3.6);
        ctx.fillStyle = bootSoleColor;
        ctx.fillRect(10.5, leftLegY + bob + 4.4, 5.5, 1.6);
        ctx.fillStyle = bootTrimColor;
        ctx.fillRect(11, leftLegY + bob + 0.8, 4.5, 1.0);

        // Right Leg & Boot
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(16.6, rightLegY + bob - 0.3, 5.3, 6.2, 1);
        ctx.fill();
        ctx.fillStyle = bootLeatherColor;
        ctx.fillRect(17, rightLegY + bob, 4.5, 5.2);
        ctx.fillStyle = bootHighlightColor;
        ctx.fillRect(17.3, rightLegY + bob + 0.5, 1.8, 3.6);
        ctx.fillStyle = bootSoleColor;
        ctx.fillRect(16.5, rightLegY + bob + 4.4, 5.5, 1.6);
        ctx.fillStyle = bootTrimColor;
        ctx.fillRect(17, rightLegY + bob + 0.8, 4.5, 1.0);
      } else if (dirIndex === 1) {
        const legShift = stepIndex === 0 ? -2.4 : stepIndex === 2 ? 2.4 : 0;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(12.6 + legShift, 33.7 + bob, 5.8, 6.2);
        ctx.fillStyle = bootLeatherColor;
        ctx.fillRect(13 + legShift, 34 + bob, 5, 5.2);
        ctx.fillStyle = bootHighlightColor;
        ctx.fillRect(13.3 + legShift, 34.4 + bob, 2, 3.5);
        ctx.fillStyle = bootSoleColor;
        ctx.fillRect(12 + legShift, 38.4 + bob, 6.5, 1.7);
      } else {
        const legShift = stepIndex === 0 ? 2.4 : stepIndex === 2 ? -2.4 : 0;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(13.6 + legShift, 33.7 + bob, 5.8, 6.2);
        ctx.fillStyle = bootLeatherColor;
        ctx.fillRect(14 + legShift, 34 + bob, 5, 5.2);
        ctx.fillStyle = bootHighlightColor;
        ctx.fillRect(14.3 + legShift, 34.4 + bob, 2, 3.5);
        ctx.fillStyle = bootSoleColor;
        ctx.fillRect(13.5 + legShift, 38.4 + bob, 6.5, 1.7);
      }

      // --- 2. TORSO / TUNIC WITH FABRIC GRADIENT & RIM LIGHT ---
      // Crisp outer silhouette contour
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(9.2, 22.2 + bob, 13.6, 13.6, 3.2);
      ctx.fill();

      // Main fabric base
      ctx.fillStyle = clothesColor;
      ctx.beginPath();
      ctx.roundRect(10, 23 + bob, 12, 12, 2.5);
      ctx.fill();

      // Volumetric vertical shading overlay across torso
      const torsoShade = ctx.createLinearGradient(10, 23 + bob, 10, 35 + bob);
      torsoShade.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
      torsoShade.addColorStop(0.45, 'rgba(255, 255, 255, 0.0)');
      torsoShade.addColorStop(1, 'rgba(15, 23, 42, 0.30)');
      ctx.fillStyle = torsoShade;
      ctx.beginPath();
      ctx.roundRect(10, 23 + bob, 12, 12, 2.5);
      ctx.fill();

      // Subtle vertical seam/tunic fold
      ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
      ctx.fillRect(15.6, 26 + bob, 0.8, 5);

      // Collar / Neckline
      if (dirIndex === 0) {
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(13.8, 23 + bob);
        ctx.lineTo(16, 26.2 + bob);
        ctx.lineTo(18.2, 23 + bob);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Leather Belt & Beveled Gold Buckle
      ctx.fillStyle = '#78350f';
      ctx.fillRect(10, 31 + bob, 12, 2.8);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(10, 31 + bob, 12, 1);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(10, 33.5 + bob, 12, 0.8);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(14.5, 30.5 + bob, 3, 3.2);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(15, 31 + bob, 2, 1.8);

      // Arms & Hands with dark outline + shading
      if (dirIndex === 0) {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(7.1, 22.7 + bob, 3.7, 8.2, 1.2);
        ctx.roundRect(21.2, 22.7 + bob, 3.7, 8.2, 1.2);
        ctx.fill();
        ctx.fillStyle = clothesColor;
        ctx.fillRect(7.5, 23 + bob, 3, 4);
        ctx.fillRect(21.5, 23 + bob, 3, 4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(7.5, 23 + bob, 3, 1.2);
        ctx.fillRect(21.5, 23 + bob, 3, 1.2);
        ctx.fillStyle = skinColor;
        ctx.fillRect(7.5, 27 + bob, 3, 3.4);
        ctx.fillRect(21.5, 27 + bob, 3, 3.4);
      } else if (dirIndex === 1) {
        const armOffset = stepIndex === 0 ? 2.8 : stepIndex === 2 ? -2.8 : 0;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(12.6 + armOffset, 23.6 + bob, 4.3, 8.3, 1.2);
        ctx.fill();
        ctx.fillStyle = clothesColor;
        ctx.fillRect(13 + armOffset, 24 + bob, 3.5, 4);
        ctx.fillStyle = skinColor;
        ctx.fillRect(13 + armOffset, 28 + bob, 3.5, 3.4);
      } else if (dirIndex === 2) {
        const armOffset = stepIndex === 0 ? -2.8 : stepIndex === 2 ? 2.8 : 0;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(15.1 + armOffset, 23.6 + bob, 4.3, 8.3, 1.2);
        ctx.fill();
        ctx.fillStyle = clothesColor;
        ctx.fillRect(15.5 + armOffset, 24 + bob, 3.5, 4);
        ctx.fillStyle = skinColor;
        ctx.fillRect(15.5 + armOffset, 28 + bob, 3.5, 3.4);
      }

      // --- 3. HEAD & EXPRESSIVE FACE ---
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(16, 15 + bob, 7.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = skinColor;
      ctx.beginPath();
      ctx.arc(16, 15 + bob, 6.5, 0, Math.PI * 2);
      ctx.fill();

      // Soft warm forehead light & chin shadow
      const headGrad = ctx.createRadialGradient(14.5, 13 + bob, 1, 16, 15 + bob, 6.8);
      headGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      headGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0)');
      headGrad.addColorStop(1, 'rgba(124, 45, 18, 0.22)');
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.arc(16, 15 + bob, 6.5, 0, Math.PI * 2);
      ctx.fill();

      if (dirIndex === 0) {
        // Cheek Blush
        ctx.fillStyle = 'rgba(244, 63, 94, 0.36)';
        ctx.beginPath();
        ctx.ellipse(11.6, 17.5 + bob, 2.1, 1.1, 0, 0, Math.PI * 2);
        ctx.ellipse(20.4, 17.5 + bob, 2.1, 1.1, 0, 0, Math.PI * 2);
        ctx.fill();

        // Crisp Sclera + Iris Eyes
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(12.2, 13.4 + bob, 2.7, 2.9, 0.8);
        ctx.roundRect(17.1, 13.4 + bob, 2.7, 2.9, 0.8);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(12.5, 13.5 + bob, 2.2, 2.7, 0.6);
        ctx.roundRect(17.4, 13.5 + bob, 2.2, 2.7, 0.6);
        ctx.fill();

        // Twin sparkle catchlights
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(12.7, 13.8 + bob, 1.0, 1.0);
        ctx.fillRect(17.6, 13.8 + bob, 1.0, 1.0);
        ctx.fillRect(13.8, 15.2 + bob, 0.6, 0.6);
        ctx.fillRect(18.7, 15.2 + bob, 0.6, 0.6);

        // Warm gentle smile
        ctx.strokeStyle = '#7c2d12';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(14.5, 18.4 + bob);
        ctx.quadraticCurveTo(16, 19.3 + bob, 17.5, 18.4 + bob);
        ctx.stroke();
      } else if (dirIndex === 1) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.34)';
        ctx.beginPath();
        ctx.ellipse(11.5, 17.5 + bob, 1.9, 1.1, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(10.9, 13.4 + bob, 2.6, 2.8);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(11.0, 13.5 + bob, 2.2, 2.7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11.2, 13.7 + bob, 1.0, 1.0);
      } else if (dirIndex === 2) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.34)';
        ctx.beginPath();
        ctx.ellipse(20.5, 17.5 + bob, 1.9, 1.1, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(18.5, 13.4 + bob, 2.6, 2.8);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(18.8, 13.5 + bob, 2.2, 2.7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(18.9, 13.7 + bob, 1.0, 1.0);
      }

      // --- 4. VOLUMETRIC STYLED HAIR ---
      ctx.fillStyle = hairColor;
      if (dirIndex === 0) {
        ctx.beginPath();
        ctx.arc(16, 12 + bob, 7.6, Math.PI * 0.94, Math.PI * 2.06);
        ctx.fill();

        // Dark hairline rim
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Bangs & side locks
        ctx.fillStyle = hairColor;
        ctx.fillRect(9, 11 + bob, 3.5, 6);
        ctx.fillRect(19.5, 11 + bob, 3.5, 6);
        ctx.fillRect(13.5, 11 + bob, 5, 2.5);

        // Specular crown hair sheen
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(16, 9.2 + bob, 4.6, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();

        if (gender === 'female') {
          ctx.fillStyle = hairColor;
          ctx.fillRect(8, 16 + bob, 3, 8);
          ctx.fillRect(21, 16 + bob, 3, 8);
          ctx.fillStyle = '#ec4899';
          ctx.fillRect(8, 18 + bob, 3, 1.5);
          ctx.fillRect(21, 18 + bob, 3, 1.5);
        }
      } else if (dirIndex === 1) {
        ctx.beginPath();
        ctx.arc(16, 12 + bob, 7.6, Math.PI * 0.75, Math.PI * 1.95);
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.fillStyle = hairColor;
        ctx.fillRect(10, 11 + bob, 4, 5);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(16, 9.5 + bob, 4.5, Math.PI * 1.0, Math.PI * 1.75);
        ctx.stroke();
        if (gender === 'female') {
          ctx.fillStyle = hairColor;
          ctx.fillRect(16, 15 + bob, 4, 9);
          ctx.fillStyle = '#ec4899';
          ctx.fillRect(16.5, 17 + bob, 3, 1.4);
        }
      } else if (dirIndex === 2) {
        ctx.beginPath();
        ctx.arc(16, 12 + bob, 7.6, Math.PI * 1.05, Math.PI * 2.25);
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.fillStyle = hairColor;
        ctx.fillRect(18, 11 + bob, 4, 5);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(16, 9.5 + bob, 4.5, Math.PI * 1.25, Math.PI * 2.0);
        ctx.stroke();
        if (gender === 'female') {
          ctx.fillStyle = hairColor;
          ctx.fillRect(12, 15 + bob, 4, 9);
          ctx.fillStyle = '#ec4899';
          ctx.fillRect(12.5, 17 + bob, 3, 1.4);
        }
      } else {
        ctx.beginPath();
        ctx.arc(16, 13 + bob, 7.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(16, 12 + bob, 5, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();

        if (gender === 'female') {
          ctx.fillStyle = hairColor;
          ctx.fillRect(9, 16 + bob, 3.5, 8);
          ctx.fillRect(19.5, 16 + bob, 3.5, 8);
          ctx.fillStyle = '#ec4899';
          ctx.fillRect(9, 18 + bob, 3.5, 1.4);
          ctx.fillRect(19.5, 18 + bob, 3.5, 1.4);
        }
      }

      ctx.restore();
    }

    textures.addSpriteSheet(key, canvas as any, {
      frameWidth: frameW,
      frameHeight: frameH,
    });
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
}
