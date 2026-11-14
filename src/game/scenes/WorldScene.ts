/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Phaser from 'phaser';
import { ITEMS, MAP_CONFIG } from '../constants';
import { BuildingSystem } from '../systems/BuildingSystem';
import { CraftingSystem } from '../systems/CraftingSystem';
import { InventorySystem } from '../systems/InventorySystem';
import { MapSystem } from '../systems/MapSystem';
import { NetworkSystem, RemotePlayer } from '../systems/NetworkSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { PixelArtGenerator } from '../textures/PixelArtGenerator';
import { BuildingType, ItemId, PlacedBuilding, PlayerProfile, ResourceNode, TileType } from '../types';
import { SoundSynth } from '../utils/SoundSynth';

export class WorldScene extends Phaser.Scene {
  // Systems
  public mapSystem!: MapSystem;
  public inventorySystem!: InventorySystem;
  public buildingSystem!: BuildingSystem;
  public craftingSystem!: CraftingSystem;
  public resourceSystem!: ResourceSystem;
  public networkSystem!: NetworkSystem;

  // Player state
  public playerProfile!: PlayerProfile;
  public playerTileX = 30;
  public playerTileY = 30;
  public playerSprite!: Phaser.GameObjects.Sprite;
  public playerNameText!: Phaser.GameObjects.Text;
  public playerDirection: 'down' | 'left' | 'right' | 'up' = 'down';
  public isMoving = false;
  public isGathering = false;
  public currentGatheringNode: ResourceNode | null = null;
  public gatherProgress = 0;
  public gatherTotalDuration = 0;
  public gatherProgressBarBg!: Phaser.GameObjects.Graphics;
  public gatherProgressBarFill!: Phaser.GameObjects.Graphics;

  // Input & Controls
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyB!: Phaser.Input.Keyboard.Key;
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyM!: Phaser.Input.Keyboard.Key;

  // External joystick vector from mobile UI
  public joystickVector = { x: 0, y: 0 };

  // Building mode
  public buildModeType: BuildingType | null = null;
  public movingBuildingId: string | null = null;
  public placementCooldown = 0;
  public selectedPlacementTile = { tx: 30, ty: 30 };
  public lastPlacementCheck: { valid: boolean; reason?: string } = { valid: false };
  public buildGhostSprite: Phaser.GameObjects.Sprite | null = null;
  public buildGridHighlights: Phaser.GameObjects.Sprite[] = [];
  public hoverTile = { tx: 30, ty: 30 };

  // Game Object Containers & Maps
  private tileSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private resourceSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private buildingSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private remotePlayerSprites: Map<string, { sprite: Phaser.GameObjects.Sprite; nameText: Phaser.GameObjects.Text }> = new Map();
  private townNpcs: Array<{
    sprite: Phaser.GameObjects.Sprite;
    baseX: number;
    baseY: number;
    tileX: number;
    tileY: number;
    defaultDir: 'down' | 'left' | 'right' | 'up';
    role: 'merchant' | 'blacksmith' | 'baker' | 'grocer' | 'florist' | 'elder' | 'settler' | 'farmer';
    phase: number;
  }> = [];

  // Floating notifications
  private floatingTexts: Phaser.GameObjects.Text[] = [];

  // Interaction prompt callback to React UI
  public onInteractionChange?: (prompt: { type: string; title: string; subtitle: string; actionKey: string } | null) => void;
  public onTileHover?: (tileX: number, tileY: number, zoneName: string) => void;
  public onPlayerMove?: (tileX: number, tileY: number, zoneName: string) => void;
  public onOpenUIModal?: (modal: 'inventory' | 'crafting' | 'shop' | 'building' | 'map' | 'storage', data?: any) => void;
  public onStateChanged?: () => void;
  public onPlacementStatusChange?: (status: {
    active: boolean;
    buildingType: BuildingType | null;
    isMoving: boolean;
    tileX: number;
    tileY: number;
    valid: boolean;
    reason?: string;
  }) => void;
  public onSelectPlacedBuilding?: (building: PlacedBuilding) => void;

  // Near town station flags
  public isNearShop = false;
  public isNearCraftStation = false;
  public isNearCampfire = false;
  public nearbyStorageChest: PlacedBuilding | null = null;
  public nearbyPlacedBuilding: PlacedBuilding | null = null;
  public nearbyVillageNpc: { role: string; title: string; subtitle: string; message: string } | null = null;

  constructor() {
    super({ key: 'WorldScene' });
  }

  public setupData(data: {
    mapSystem?: MapSystem;
    inventorySystem?: InventorySystem;
    buildingSystem?: BuildingSystem;
    craftingSystem?: CraftingSystem;
    resourceSystem?: ResourceSystem;
    networkSystem?: NetworkSystem;
    playerProfile?: PlayerProfile;
    initialPosition?: { tileX: number; tileY: number };
  }): void {
    if (!data) return;
    if (data.mapSystem) this.mapSystem = data.mapSystem;
    if (data.inventorySystem) this.inventorySystem = data.inventorySystem;
    if (data.buildingSystem) this.buildingSystem = data.buildingSystem;
    if (data.craftingSystem) this.craftingSystem = data.craftingSystem;
    if (data.resourceSystem) this.resourceSystem = data.resourceSystem;
    if (data.networkSystem) this.networkSystem = data.networkSystem;
    if (data.playerProfile) this.playerProfile = data.playerProfile;

    if (data.initialPosition) {
      this.playerTileX = data.initialPosition.tileX;
      this.playerTileY = data.initialPosition.tileY;
    }
  }

  public init(data?: {
    mapSystem?: MapSystem;
    inventorySystem?: InventorySystem;
    buildingSystem?: BuildingSystem;
    craftingSystem?: CraftingSystem;
    resourceSystem?: ResourceSystem;
    networkSystem?: NetworkSystem;
    playerProfile?: PlayerProfile;
    initialPosition?: { tileX: number; tileY: number };
  }): void {
    if (data) {
      this.setupData(data);
    }
  }

  public create(): void {
    if (!this.mapSystem) {
      console.warn('WorldScene.create deferred: mapSystem not ready');
      return;
    }

    // 1. Generate procedural pixel textures
    PixelArtGenerator.generateAll(this);

    // 2. Render 60x60 isometric ground tiles
    this.createIsometricGround();

    // 3. Render town landmarks
    this.createTownLandmarks();

    // 4. Render initial natural resource nodes
    this.renderResourceNodes();

    // 5. Render existing placed buildings
    this.renderPlacedBuildings();

    // 6. Spawn Player Entity
    this.createPlayer();

    // 7. Spawn Remote/Simulated Settler Avatars
    this.createRemoteSettlers();

    // 8. Setup Controls & Input
    this.setupControls();

    // 9. Setup Camera
    this.setupCamera();

    // 10. Building Preview helpers
    this.setupBuildPreviewSprites();

    // Periodic check for resource respawns & ambient lifecycle
    this.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => {
        this.resourceSystem.updateRespawns(this.mapSystem);
        this.renderResourceNodes();
      },
    });

    // Listen for building system updates
    this.buildingSystem.onUpdate = () => {
      this.renderPlacedBuildings();
    };

    // 11. Realtime Multiplayer Sync Listeners
    this.setupNetworkListeners();
  }

  private playerShadow!: Phaser.GameObjects.Image;
  private remotePlayerShadows: Map<string, Phaser.GameObjects.Image> = new Map();

  private getTerrainVariantKey(tileType: TileType, tx: number, ty: number): string {
    if (tileType === 'grass') {
      // Clumped natural noise so meadows, clovers, and wildflowers appear in broad natural patches
      const patchNoise = Math.sin(tx * 0.28 + ty * 0.22) * Math.cos(tx * 0.18 - ty * 0.24);
      const detailHash = ((tx * 17 + ty * 31) ^ (tx >> 2)) % 7;
      if (patchNoise > 0.32) return 'tile_grass_2'; // Wildflower field
      if (patchNoise < -0.28) return 'tile_grass_1'; // Clover meadow
      if (detailHash === 0) return 'tile_grass_3';  // Sunny moss patch
      return 'tile_grass_0'; // Pure lush spring meadow
    }
    if (tileType === 'dirt') {
      return (tx * 13 + ty * 7) % 3 === 0 ? 'tile_dirt_1' : 'tile_dirt_0';
    }
    if (tileType === 'water') {
      // East Forest emerald glade lake uses tile_water_2
      if (tx >= 74 && tx <= 98 && ty >= 14 && ty <= 30) {
        return 'tile_water_2';
      }
      return (tx * 11 + ty * 19) % 2 === 0 ? 'tile_water_1' : 'tile_water_0';
    }
    if (tileType === 'sand') {
      return (tx * 17 + ty * 23) % 2 === 0 ? 'tile_sand_1' : 'tile_sand_0';
    }
    if (tileType === 'cobble') {
      return (tx + ty) % 3 === 0 ? 'tile_cobble_1' : 'tile_cobble_0';
    }
    if (tileType === 'cliff') {
      return (tx * 19 + ty * 29) % 2 === 0 ? 'tile_cliff_1' : 'tile_cliff_0';
    }
    if (tileType === 'farmland') {
      return 'tile_farmland';
    }
    if (tileType === 'bridge') {
      return 'tile_bridge';
    }
    return `tile_${tileType}`;
  }

  private createIsometricGround(): void {
    for (let ty = 0; ty < this.mapSystem.height; ty++) {
      for (let tx = 0; tx < this.mapSystem.width; tx++) {
        const tileType = this.mapSystem.tiles[ty][tx];
        const textureKey = this.getTerrainVariantKey(tileType, tx, ty);
        const { x, y } = MapSystem.tileToWorld(tx, ty);

        const img = this.add.image(x, y + 16, textureKey);
        img.setOrigin(0.5, 0.5);
        img.setDepth(ty + tx);
        this.tileSprites.set(`${tx}_${ty}`, img);

        // 1. Towering Mountain Silhouettes along Northern and Eastern Cliff boundaries
        if (tileType === 'cliff') {
          if ((tx % 4 === 0 && ty <= 4) || (tx >= 85 && ty % 4 === 0 && ty <= 10)) {
            const ridge = this.add.sprite(x, y + 10, 'obj_mountain_ridge');
            ridge.setOrigin(0.5, 0.85);
            ridge.setDepth((tx + ty) * 100 + 40);
          } else if ((tx * 7 + ty * 11) % 5 === 0) {
            const boulder = this.add.sprite(x, y + 14, 'obj_cliff_rock');
            boulder.setOrigin(0.5, 0.8);
            boulder.setDepth((tx + ty) * 100 + 35);
          }
        }

        // 2. Water Environment Flora & Fauna (Floating Lilies, Reeds & Stones)
        if (tileType === 'water') {
          // Floating Water Lilypad clusters in calm bays and glades
          if ((tx === 84 && ty === 21) || (tx === 88 && ty === 24) || (tx === 16 && ty === 64) || (tx === 22 && ty === 66) || (tx === 16 && ty === 14)) {
            const lily = this.add.sprite(x, y + 14, 'obj_lilypad');
            lily.setOrigin(0.5, 0.6);
            lily.setDepth((tx + ty) * 100 + 25);
            this.tweens.add({
              targets: lily,
              y: y + 12,
              duration: 1800,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
          }
          // Wetland Cattails & Reeds along shorelines
          else if ((tx === 80 && ty === 20) || (tx === 92 && ty === 22) || (tx === 12 && ty === 60) || (tx === 24 && ty === 70) || (tx === 86 && ty === 67) || (tx === 66 && ty === 79)) {
            const reed = this.add.sprite(x, y + 16, 'obj_water_reed');
            reed.setOrigin(0.5, 0.88);
            reed.setDepth((tx + ty) * 100 + 35);
            this.tweens.add({
              targets: reed,
              angle: 2,
              duration: 1400,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
          }
          // Smooth submerged river stones
          else if ((tx === 86 && ty === 20) || (tx === 20 && ty === 58) || (tx === 70 && ty === 76) || (tx === 52 && ty === 92)) {
            const stone = this.add.sprite(x, y + 16, 'obj_river_stone');
            stone.setOrigin(0.5, 0.7);
            stone.setDepth((tx + ty) * 100 + 24);
          }
        }

        // 3. Agricultural Crops growing neatly on Farmland Plots
        if (tileType === 'farmland') {
          const cropChoice = (tx * 3 + ty * 7) % 4;
          if (cropChoice === 0) {
            const wheat = this.add.sprite(x, y + 16, 'obj_crop_wheat');
            wheat.setOrigin(0.5, 0.85);
            wheat.setDepth((tx + ty) * 100 + 32);
          } else if (cropChoice === 1) {
            const cabbage = this.add.sprite(x, y + 16, 'obj_crop_cabbage');
            cabbage.setOrigin(0.5, 0.8);
            cabbage.setDepth((tx + ty) * 100 + 30);
          } else if (cropChoice === 2) {
            const pumpkin = this.add.sprite(x, y + 16, 'obj_crop_pumpkin');
            pumpkin.setOrigin(0.5, 0.8);
            pumpkin.setDepth((tx + ty) * 100 + 30);
          }
        }
      }
    }
  }

  private getFootprintWorldPos(tileX: number, tileY: number, width: number, height: number): { x: number; y: number; depth: number } {
    const cx = tileX + (width - 1) / 2;
    const cy = tileY + (height - 1) / 2;
    const pos = MapSystem.tileToWorld(cx, cy);
    return {
      x: pos.x,
      y: pos.y + 16,
      depth: (cx + cy) * 100 + 65,
    };
  }

  private getBuildingVisualConfig(type: BuildingType): { tex: string; originY: number } {
    switch (type) {
      case 'house_small':
        return { tex: 'obj_house_small', originY: 100 / 140 };
      case 'house_medium':
        return { tex: 'obj_house_medium', originY: 124 / 172 };
      case 'house_large':
        return { tex: 'obj_house_large', originY: 140 / 196 };
      case 'fence_wood':
        return { tex: 'obj_fence_wood', originY: 0.75 };
      case 'campfire':
        return { tex: 'obj_campfire', originY: 0.75 };
      case 'storage_box':
        return { tex: 'obj_storage_box', originY: 0.8 };
      case 'lantern':
        return { tex: 'obj_lantern', originY: 0.9 };
      default:
        return { tex: 'obj_house_small', originY: 100 / 140 };
    }
  }

  private createTownLandmarks(): void {
    this.townNpcs = [];

    const placeTownBuilding = (
      tileX: number,
      tileY: number,
      width: number,
      height: number,
      tex: string,
      originY: number,
      label?: string,
      labelColor = '#fef08a',
      labelOffsetY = 92
    ) => {
      const { x, y, depth } = this.getFootprintWorldPos(tileX, tileY, width, height);
      const bld = this.add.sprite(x, y, tex);
      bld.setOrigin(0.5, originY);
      bld.setDepth(depth);
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          this.mapSystem.setCollision(tileX + dx, tileY + dy, true);
        }
      }
      if (label) {
        this.add.text(x, y - labelOffsetY, label, {
          fontSize: '10px',
          color: labelColor,
          fontStyle: 'bold',
          backgroundColor: 'rgba(20, 18, 16, 0.86)',
          padding: { x: 5, y: 2 },
        }).setOrigin(0.5).setDepth(depth + 6);
      }
    };

    const placeTownProp = (tileX: number, tileY: number, tex: string, originY = 0.85, solid = true, shadowScale: [number, number] = [1.0, 0.7]) => {
      const p = MapSystem.tileToWorld(tileX, tileY);
      const d = (tileX + tileY) * 100;
      this.add.image(p.x, p.y + 15, 'shadow_round').setOrigin(0.5, 0.5).setDepth(d + 20).setAlpha(0.38).setScale(shadowScale[0], shadowScale[1]);
      const prop = this.add.sprite(p.x, p.y + 14, tex);
      prop.setOrigin(0.5, originY);
      prop.setDepth(d + 35);
      if (solid) this.mapSystem.setCollision(tileX, tileY, true);
      return prop;
    };

    const spawnTownNpc = (
      tileX: number,
      tileY: number,
      tex: string,
      label: string,
      labelColor: string,
      defaultDir: 'down' | 'left' | 'right' | 'up',
      role: 'merchant' | 'blacksmith' | 'baker' | 'grocer' | 'florist' | 'elder' | 'settler' | 'farmer',
      offsetX = 0,
      offsetY = 0
    ) => {
      const pos = MapSystem.tileToWorld(tileX, tileY);
      const sx = pos.x + offsetX;
      const sy = pos.y + 16 + offsetY;
      const d = (tileX + tileY) * 100;
      const dirFrame = defaultDir === 'down' ? 0 : defaultDir === 'left' ? 3 : defaultDir === 'right' ? 6 : 9;

      this.add.image(sx, sy, 'shadow_round').setOrigin(0.5, 0.5).setDepth(d + 40).setAlpha(0.48).setScale(0.92, 0.68);
      const npc = this.add.sprite(sx, sy, tex, dirFrame);
      npc.setOrigin(0.5, 0.88);
      npc.setScale(0.5);
      npc.setDepth(d + 58);

      this.add.text(sx, sy - 44, label, {
        fontSize: '10px',
        color: labelColor,
        fontStyle: 'bold',
        backgroundColor: 'rgba(20, 18, 16, 0.88)',
        padding: { x: 5, y: 2 },
      }).setOrigin(0.5).setDepth(d + 62);

      this.townNpcs.push({
        sprite: npc,
        baseX: sx,
        baseY: sy,
        tileX,
        tileY,
        defaultDir,
        role,
        phase: (tileX * 1.3 + tileY * 0.7) % (Math.PI * 2),
      });
    };

    // === 1. CENTRAL VILLAGE PLAZA (Player spawns cleanly at 30, 30) ===
    const fountainPos = MapSystem.tileToWorld(30, 29);
    this.add.image(fountainPos.x, fountainPos.y + 14, 'shadow_round').setOrigin(0.5, 0.5).setDepth(59 * 100 + 20).setAlpha(0.45).setScale(1.6, 1.2);
    const fountain = this.add.sprite(fountainPos.x, fountainPos.y + 10, 'obj_town_fountain');
    fountain.setOrigin(0.5, 0.8);
    fountain.setDepth(59 * 100 + 35);
    this.mapSystem.setCollision(30, 29, true);
    this.add.text(fountainPos.x, fountainPos.y - 44, 'မြို့လယ်ရေပန်း (Town Fountain)', {
      fontSize: '10px',
      color: '#e0f2fe',
      fontStyle: 'bold',
      backgroundColor: 'rgba(15,23,42,0.85)',
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setDepth(59 * 100 + 40);

    // Street Lanterns framing the Central Plaza
    for (const [lx, ly] of [[28, 28], [32, 28], [28, 32], [32, 32]]) {
      placeTownProp(lx, ly, 'obj_lantern', 0.9, true, [0.8, 0.55]);
    }

    // Plaza Bench + Elder Arthur beside fountain
    placeTownProp(28, 29, 'obj_bench', 0.8, true, [1.2, 0.8]);
    spawnTownNpc(29, 29, 'npc_elder', 'အာသာ (ရွာလူကြီး)', '#a7f3d0', 'down', 'elder', -4, 0);

    // === 2. NORTH-WEST QUARTER: BAKERY HOUSE & GENERAL STORE ===
    // Bakery House (3x2 at 23..25, 22..23)
    placeTownBuilding(23, 22, 3, 2, 'obj_house_bakery', 124 / 172, 'မုန့်ဖိုအိမ် (Bakery House)', '#fed7aa', 102);
    placeTownProp(25, 24, 'obj_shelf_bakery', 0.85, true, [1.0, 0.7]);
    spawnTownNpc(24, 24, 'npc_baker', 'ကလာရာ (မုန့်ဖုတ်သမား)', '#fcd34d', 'down', 'baker', 0, 2);

    // General Store (3x2 at 22..24, 26..27)
    placeTownBuilding(22, 26, 3, 2, 'obj_house_general', 124 / 172, 'အထွေထွေကုန်စုံဆိုင် (General Store)', '#fef08a', 112);
    placeTownProp(25, 27, 'obj_crate_fruit', 0.8, true, [0.85, 0.6]);
    placeTownProp(22, 28, 'obj_barrel', 0.85, true, [0.8, 0.55]);
    spawnTownNpc(24, 28, 'npc_merchant', 'ဘားနဘီ (ကုန်သည်)', '#fef08a', 'down', 'merchant', 0, 2);

    // === 3. NORTH-EAST QUARTER: BLACKSMITH SHOP & VILLAGE COTTAGE ===
    // Blacksmith Forge (3x2 at 33..35, 23..24)
    placeTownBuilding(33, 23, 3, 2, 'obj_house_blacksmith', 124 / 172, 'ပန်းပဲဖို (Blacksmith Forge)', '#fca5a5', 102);
    // Interactive Workbench & Anvil at (33, 25)
    placeTownProp(33, 25, 'obj_craft_bench', 0.8, true, [1.35, 0.9]);
    const wbPos = MapSystem.tileToWorld(33, 25);
    this.add.text(wbPos.x, wbPos.y - 36, 'လက်မှုလုပ်ငန်းခုံ (Workbench)', {
      fontSize: '10px',
      color: '#93c5fd',
      fontStyle: 'bold',
      backgroundColor: 'rgba(20,18,16,0.88)',
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setDepth((33 + 25) * 100 + 42);
    placeTownProp(35, 25, 'obj_rack_blacksmith', 0.85, true, [1.0, 0.7]);
    spawnTownNpc(34, 25, 'npc_blacksmith', 'ဒေါ်နယ် (ပန်းပဲဆရာ)', '#f87171', 'down', 'blacksmith', 0, 2);

    // Village Two-Story Residence (2x2 at 36..37, 26..27)
    placeTownBuilding(36, 26, 2, 2, 'obj_town_house', 116 / 156);
    placeTownProp(35, 27, 'obj_flower_pot', 0.85, true, [0.8, 0.55]);

    // === 4. SOUTH-WEST QUARTER: GROCERY SHOP & FLOWER SHOP ===
    // Fresh Grocery Shop (3x2 at 23..25, 33..34)
    placeTownBuilding(23, 33, 3, 2, 'obj_house_grocery', 124 / 172, 'ကုန်စိမ်းနှင့်သစ်သီးဆိုင် (Grocery)', '#86efac', 102);
    placeTownProp(23, 35, 'obj_shelf_grocery', 0.85, true, [1.0, 0.7]);
    placeTownProp(25, 35, 'obj_crate_fruit', 0.8, true, [0.85, 0.6]);
    spawnTownNpc(24, 35, 'npc_grocer', 'မာယာ (ကုန်စိမ်းသည်)', '#86efac', 'down', 'grocer', 0, 2);

    // Flower Shop (2x2 at 26..27, 35..36)
    placeTownBuilding(26, 35, 2, 2, 'obj_house_florist', 100 / 140, 'ပန်းဆိုင်လေး (Flower Shop)', '#f9a8d4', 88);
    placeTownProp(28, 35, 'obj_flower_stand', 0.85, true, [1.0, 0.7]);
    placeTownProp(26, 37, 'obj_flower_pot', 0.85, true, [0.8, 0.55]);
    spawnTownNpc(28, 36, 'npc_florist', 'ဒေစီ (ပန်းသည်မလေး)', '#f472b6', 'down', 'florist', 2, 0);

    // === 5. SOUTH-EAST QUARTER: OUTDOOR MARKET & POCKET PARK ===
    // Outdoor Market Stalls & Goods
    placeTownProp(33, 32, 'obj_bakery_stall', 0.85, true, [1.35, 0.9]);
    placeTownProp(36, 32, 'obj_shop_stall', 0.85, true, [1.45, 0.95]);
    placeTownProp(34, 34, 'obj_picnic_table', 0.85, true, [1.3, 0.85]);
    placeTownProp(36, 34, 'obj_crate_fruit', 0.8, true, [0.85, 0.6]);
    spawnTownNpc(35, 33, 'npc_settler', 'အာရီယာ (ဈေးသည်)', '#fdba74', 'down', 'settler', 0, 0);

    // Pocket Park (ပန်းခြံငယ်)
    placeTownProp(33, 37, 'obj_bench', 0.8, true, [1.2, 0.8]);
    placeTownProp(36, 37, 'obj_bench', 0.8, true, [1.2, 0.8]);
    placeTownProp(35, 37, 'obj_picnic_table', 0.85, true, [1.3, 0.85]);
    for (const [fx, fy] of [[32, 36], [37, 36], [34, 38]]) {
      placeTownProp(fx, fy, 'obj_flower_pot', 0.85, true, [0.8, 0.55]);
    }

    // === 6. VILLAGE ENTRANCE DIRECTIONAL SIGNPOSTS (Clear of 30..31 avenues) ===
    for (const [sx, sy] of [[29, 21], [32, 39], [21, 29], [39, 32]]) {
      placeTownProp(sx, sy, 'obj_signpost', 0.9, true, [0.8, 0.5]);
    }

    // === 7. HOMESTEAD AGRICULTURAL CENTER (South-East Farmland District) ===
    const wellPos = MapSystem.tileToWorld(49, 74);
    placeTownProp(49, 74, 'obj_water_well', 0.85, true, [1.3, 0.9]);
    this.add.text(wellPos.x, wellPos.y - 36, 'ရွာရေတွင်း (Stone Well)', {
      fontSize: '10px',
      color: '#7dd3fc',
      fontStyle: 'bold',
      backgroundColor: 'rgba(28,25,23,0.88)',
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setDepth((49 + 74) * 100 + 38);

    spawnTownNpc(50, 74, 'npc_farmer', 'သောမတ်စ် (လယ်သမားကြီး)', '#86efac', 'down', 'farmer', 4, 2);

    // Friendly Scarecrows in farmland plots
    for (const [scx, scy] of [[48, 77], [62, 90]]) {
      placeTownProp(scx, scy, 'obj_scarecrow', 0.9, false, [0.9, 0.6]);
    }

    // Golden Hay Bales near farm edges
    for (const [hx, hy] of [[46, 74], [65, 88], [75, 74]]) {
      placeTownProp(hx, hy, 'obj_hay_bale', 0.8, false, [1.1, 0.7]);
    }
  }

  public renderResourceNodes(): void {
    const now = Date.now();

    for (const node of this.resourceSystem.nodes) {
      const isDepleted = !!(node.depletedUntil && node.depletedUntil > now);
      const key = node.id;
      let sprite = this.resourceSprites.get(key);

      if (!sprite) {
        const { x, y } = MapSystem.tileToWorld(node.tileX, node.tileY);
        let tex = 'obj_tree';
        let originY = 0.85;

        if (node.type === 'tree') {
          // Dynamic tree variation based on region and organic hash:
          // Northern alpine ridge & mountain pass: Pines dominate
          // Whispering Forest & clearings: Mix of Golden Birches, Pines, and stately Oaks
          if (node.tileY <= 16 || (node.tileX >= 55 && node.tileY <= 22)) {
            tex = (node.tileX + node.tileY) % 3 === 0 ? 'obj_tree' : 'obj_tree_pine';
          } else if ((node.tileX * 7 + node.tileY * 13) % 4 === 0) {
            tex = 'obj_tree_birch';
          } else if ((node.tileX * 11 + node.tileY * 5) % 5 === 0) {
            tex = 'obj_tree_pine';
          } else {
            tex = 'obj_tree';
          }
          originY = 0.88;
        } else if (node.type === 'rock') {
          tex = (node.tileX + node.tileY) % 4 === 0 ? 'obj_cliff_rock' : 'obj_rock';
          originY = 0.75;
        } else if (node.type === 'bush') {
          tex = 'obj_bush';
          originY = 0.75;
        } else if (node.type === 'animal') {
          tex = (node.tileX + node.tileY) % 2 === 0 ? 'res_animal_rabbit' : 'res_animal_deer';
          originY = 0.8;
        } else if (node.type === 'lake_fish') {
          tex = 'obj_lake_fish';
          originY = 0.5;
        }

        // Ambient ground shadow for trees, rocks, bushes, animals
        if (node.type !== 'lake_fish') {
          const shadow = this.add.image(x, y + 16, 'shadow_round');
          shadow.setOrigin(0.5, 0.5);
          shadow.setDepth((node.tileX + node.tileY) * 100 + 20);
          shadow.setAlpha(0.4);
          if (node.type === 'tree') shadow.setScale(1.5, 1.1);
          else if (node.type === 'rock') shadow.setScale(1.2, 0.9);
          else shadow.setScale(0.9, 0.7);
        }

        sprite = this.add.sprite(x, y + 16, tex);
        sprite.setOrigin(0.5, originY);
        sprite.setDepth((node.tileX + node.tileY) * 100 + 50);
        this.resourceSprites.set(key, sprite);

        // Gentle breathing animation for animals & fish ripples
        if (node.type === 'animal') {
          this.tweens.add({
            targets: sprite,
            y: y + 14,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        } else if (node.type === 'lake_fish') {
          this.tweens.add({
            targets: sprite,
            scaleY: 1.15,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      }

      // Update visibility and alpha for depleted state
      if (isDepleted) {
        sprite.setVisible(false);
      } else {
        sprite.setVisible(true);
      }
    }
  }

  public removeBuildingSprite(id: string): void {
    const sprite = this.buildingSprites.get(id);
    if (sprite) {
      sprite.destroy();
      this.buildingSprites.delete(id);
    }
  }

  public renderPlacedBuildings(): void {
    // Clear removed sprites
    const currentBuildingIds = new Set(this.buildingSystem.buildings.map((b) => b.id));
    for (const [id, sprite] of this.buildingSprites.entries()) {
      if (!currentBuildingIds.has(id)) {
        sprite.destroy();
        this.buildingSprites.delete(id);
      }
    }

    // Render placed buildings centered accurately on their isometric footprints
    for (const b of this.buildingSystem.buildings) {
      const fp = BuildingSystem.getFootprint(b.type);
      const w = b.width || fp.width;
      const h = b.height || fp.height;
      const { x, y, depth } = this.getFootprintWorldPos(b.tileX, b.tileY, w, h);
      const renderDepth = b.type === 'campfire' ? (b.tileX + b.tileY) * 100 + 35 : depth;
      const { tex, originY } = this.getBuildingVisualConfig(b.type);

      const existing = this.buildingSprites.get(b.id);
      if (existing) {
        existing.setTexture(tex);
        existing.setOrigin(0.5, originY);
        existing.setPosition(x, y);
        existing.setDepth(renderDepth);
        continue;
      }

      const sprite = this.add.sprite(x, y, tex);
      sprite.setOrigin(0.5, originY);
      sprite.setDepth(renderDepth);
      this.buildingSprites.set(b.id, sprite);

      // Campfire animated ember glow
      if (b.type === 'campfire') {
        this.tweens.add({
          targets: sprite,
          scaleX: 1.08,
          scaleY: 1.05,
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  private createPlayer(): void {
    // Safety walkability check so saved player coordinates never spawn inside a town structure
    const startIntX = Math.round(this.playerTileX);
    const startIntY = Math.round(this.playerTileY);
    if (!this.mapSystem.isWalkable(startIntX, startIntY)) {
      let found = false;
      for (let radius = 1; radius <= 6 && !found; radius++) {
        for (let dy = -radius; dy <= radius && !found; dy++) {
          for (let dx = -radius; dx <= radius && !found; dx++) {
            const cx = startIntX + dx;
            const cy = startIntY + dy;
            if (this.mapSystem.isWalkable(cx, cy)) {
              this.playerTileX = cx;
              this.playerTileY = cy;
              found = true;
            }
          }
        }
      }
    }

    const { x, y } = MapSystem.tileToWorld(this.playerTileX, this.playerTileY);

    // Player layered ambient + contact ground shadow
    this.playerShadow = this.add.image(x, y + 16, 'shadow_round');
    this.playerShadow.setOrigin(0.5, 0.5);
    this.playerShadow.setDepth((this.playerTileX + this.playerTileY) * 100 + 40);
    this.playerShadow.setAlpha(0.52).setScale(0.95, 0.72);

    const textureKey = this.playerProfile.gender === 'female' ? 'player_female' : 'player_male';
    this.playerSprite = this.add.sprite(x, y + 16, textureKey, 0);
    this.playerSprite.setOrigin(0.5, 0.88);
    this.playerSprite.setScale(0.5); // 2x crisp 64x88 spritesheet rendered at exact 32x44 world size
    this.playerSprite.setDepth((this.playerTileX + this.playerTileY) * 100 + 60);

    // Player floating name tag
    this.playerNameText = this.add.text(x, y - 32, this.playerProfile.name || 'ကစားသမား', {
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setDepth(9999);

    // Gathering progress bar graphics
    this.gatherProgressBarBg = this.add.graphics().setDepth(10000).setVisible(false);
    this.gatherProgressBarFill = this.add.graphics().setDepth(10001).setVisible(false);
  }

  private createRemoteSettlers(): void {
    // Initial render of existing remote players in room
    for (const [id, peer] of this.networkSystem.remotePlayers) {
      this.getOrCreateRemoteSprite(id, peer);
    }
  }

  private getOrCreateRemoteSprite(id: string, peer: any) {
    let entry = this.remotePlayerSprites.get(id);
    if (!entry) {
      const { x, y } = MapSystem.tileToWorld(peer.tileX, peer.tileY);

      // Shadow for remote player
      const rShadow = this.add.image(x, y + 16, 'shadow_round');
      rShadow.setOrigin(0.5, 0.5);
      rShadow.setDepth((peer.tileX + peer.tileY) * 100 + 40);
      rShadow.setAlpha(0.5).setScale(0.95, 0.72);
      this.remotePlayerShadows.set(id, rShadow);

      const tex = peer.gender === 'female' ? 'player_female' : 'player_male';
      const sprite = this.add.sprite(x, y + 16, tex, 0);
      sprite.setOrigin(0.5, 0.88);
      sprite.setScale(0.5);
      sprite.setDepth((peer.tileX + peer.tileY) * 100 + 58);

      const nameText = this.add.text(x, y - 30, peer.name, {
        fontSize: '10px',
        color: '#67e8f9',
        fontStyle: 'bold',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        padding: { x: 4, y: 1 },
      }).setOrigin(0.5).setDepth(9998);

      entry = { sprite, nameText };
      this.remotePlayerSprites.set(id, entry);
    }
    return entry;
  }

  private setupNetworkListeners(): void {
    // 1. Remote Player Joined
    this.networkSystem.on('player_joined', (evt) => {
      const { player } = evt.payload;
      this.getOrCreateRemoteSprite(player.playerId, player);
      this.spawnFloatingText(player.positionX, player.positionY, `${player.playerName} မြို့ထဲသို့ ဝင်ရောက်လာပါပြီ!`, '#67e8f9');
    });

    // 2. Remote Player Left
    this.networkSystem.on('player_left', (evt) => {
      const { playerId } = evt.payload;
      const entry = this.remotePlayerSprites.get(playerId);
      if (entry) {
        entry.sprite.destroy();
        entry.nameText.destroy();
        this.remotePlayerSprites.delete(playerId);
      }
      const shadow = this.remotePlayerShadows.get(playerId);
      if (shadow) {
        shadow.destroy();
        this.remotePlayerShadows.delete(playerId);
      }
    });

    // 3. Shared Resource Harvested
    this.networkSystem.on('resource_harvested', (evt) => {
      const { nodeId, respawnAt, harvestedBy } = evt.payload;
      const node = this.resourceSystem.nodes.find((n) => n.id === nodeId);
      if (node) {
        node.depletedUntil = respawnAt;
        if (node.type === 'tree' || node.type === 'rock') {
          this.mapSystem.setCollision(node.tileX, node.tileY, false);
        }
        this.renderResourceNodes();

        // If another player harvested it, show visual feedback
        if (harvestedBy !== this.networkSystem.localPlayerId) {
          const peer = this.networkSystem.remotePlayers.get(harvestedBy);
          const harvesterName = peer ? peer.name : 'ကစားသမားတစ်ဦး';
          this.spawnFloatingText(node.tileX, node.tileY, `${harvesterName} မှ ရိတ်သိမ်းသွားပါသည်`, '#94a3b8');
        }
      }
    });

    // 4. Shared Resource Respawned
    this.networkSystem.on('resource_respawned', (evt) => {
      const { nodeId } = evt.payload;
      const node = this.resourceSystem.nodes.find((n) => n.id === nodeId);
      if (node) {
        node.depletedUntil = undefined;
        if (node.type === 'tree' || node.type === 'rock') {
          this.mapSystem.setCollision(node.tileX, node.tileY, true);
        }
        this.renderResourceNodes();
      }
    });

    // 5. Shared Building Placed or Moved
    this.networkSystem.on('building_placed', (evt) => {
      const incoming = evt.payload as PlacedBuilding;
      const fp = BuildingSystem.getFootprint(incoming.type);
      const building: PlacedBuilding = {
        ...incoming,
        width: incoming.width || fp.width,
        height: incoming.height || fp.height,
      };
      const existingIdx = this.buildingSystem.buildings.findIndex((b) => b.id === building.id);
      if (existingIdx !== -1) {
        const prev = this.buildingSystem.buildings[existingIdx];
        if (prev.tileX !== building.tileX || prev.tileY !== building.tileY) {
          for (let dy = 0; dy < prev.height; dy++) {
            for (let dx = 0; dx < prev.width; dx++) {
              this.mapSystem.setCollision(prev.tileX + dx, prev.tileY + dy, false);
            }
          }
          this.buildingSystem.buildings[existingIdx] = building;
          if (building.type !== 'campfire') {
            for (let dy = 0; dy < building.height; dy++) {
              for (let dx = 0; dx < building.width; dx++) {
                this.mapSystem.setCollision(building.tileX + dx, building.tileY + dy, true);
              }
            }
          }
          this.renderPlacedBuildings();
        }
      } else {
        this.buildingSystem.buildings.push(building);
        if (building.type !== 'campfire') {
          for (let dy = 0; dy < building.height; dy++) {
            for (let dx = 0; dx < building.width; dx++) {
              this.mapSystem.setCollision(building.tileX + dx, building.tileY + dy, true);
            }
          }
        }
        this.renderPlacedBuildings();
        if (building.placedBy !== this.networkSystem.localPlayerId) {
          this.spawnFloatingText(building.tileX, building.tileY, `အဆောက်အအုံအသစ် ဆောက်လုပ်ပြီးပါပြီ!`, '#34d399');
        }
      }
    });

    // 6. Shared Building Dismantled
    this.networkSystem.on('building_dismantled', (evt) => {
      const { buildingId } = evt.payload;
      const idx = this.buildingSystem.buildings.findIndex((b) => b.id === buildingId);
      if (idx !== -1) {
        const b = this.buildingSystem.buildings[idx];
        for (let dy = 0; dy < b.height; dy++) {
          for (let dx = 0; dx < b.width; dx++) {
            this.mapSystem.setCollision(b.tileX + dx, b.tileY + dy, false);
          }
        }
        this.buildingSystem.buildings.splice(idx, 1);
        this.renderPlacedBuildings();
      }
    });

    // 7. Full Room State Hydration
    this.networkSystem.on('room_state', (evt) => {
      const state = evt.payload;
      if (state.depletedResources) {
        for (const [nodeId, respawnAt] of Object.entries(state.depletedResources)) {
          const node = this.resourceSystem.nodes.find((n) => n.id === nodeId);
          if (node) {
            node.depletedUntil = respawnAt as number;
            if (node.type === 'tree' || node.type === 'rock') {
              this.mapSystem.setCollision(node.tileX, node.tileY, false);
            }
          }
        }
        this.renderResourceNodes();
      }

      if (state.placedBuildings) {
        for (const rawB of state.placedBuildings) {
          const fp = BuildingSystem.getFootprint(rawB.type);
          const b: PlacedBuilding = {
            ...rawB,
            width: rawB.width || fp.width,
            height: rawB.height || fp.height,
          };
          if (!this.buildingSystem.buildings.some((existing) => existing.id === b.id)) {
            this.buildingSystem.buildings.push(b);
            if (b.type !== 'campfire') {
              for (let dy = 0; dy < b.height; dy++) {
                for (let dx = 0; dx < b.width; dx++) {
                  this.mapSystem.setCollision(b.tileX + dx, b.tileY + dy, true);
                }
              }
            }
          }
        }
        this.renderPlacedBuildings();
      }
    });
  }

  private setupControls(): void {
    if (!this.input.keyboard) return;

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyI = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyB = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyM = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    // E: Interact / Gather
    this.keyE.on('down', () => {
      this.triggerInteraction();
    });

    // I: Open Inventory
    this.keyI.on('down', () => {
      if (this.onOpenUIModal) this.onOpenUIModal('inventory');
    });

    // B: Toggle Build Mode
    this.keyB.on('down', () => {
      if (this.onOpenUIModal) this.onOpenUIModal('building');
    });

    // C: Open Crafting
    this.keyC.on('down', () => {
      if (this.onOpenUIModal) this.onOpenUIModal('crafting');
    });

    // M: Open Map
    this.keyM.on('down', () => {
      if (this.onOpenUIModal) this.onOpenUIModal('map');
    });

    // ESC: Cancel Build Mode if active
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.buildModeType) {
        this.setBuildMode(null);
      }
    });

    // Pointer click/tap for mouse movement or building placement
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const { tx, ty } = MapSystem.worldToTile(worldPoint.x, worldPoint.y);

      if (this.buildModeType) {
        // Cooldown check to prevent accidental click-through from UI modals
        if (Date.now() < this.placementCooldown) return;

        this.selectedPlacementTile = { tx, ty };
        this.updateBuildPreview(tx, ty);
        this.confirmBuildingPlacement(tx, ty);
      } else {
        // Check if player clicked directly on an existing placed building!
        const clickedBuilding = this.buildingSystem.buildings.find(b =>
          tx >= b.tileX && tx < b.tileX + b.width && ty >= b.tileY && ty < b.tileY + b.height
        );
        if (clickedBuilding) {
          const dist = Math.hypot(
            this.playerTileX - (clickedBuilding.tileX + clickedBuilding.width / 2),
            this.playerTileY - (clickedBuilding.tileY + clickedBuilding.height / 2)
          );
          if (dist <= 3.5) {
            if (this.onSelectPlacedBuilding) {
              this.onSelectPlacedBuilding(clickedBuilding);
              return;
            }
          } else {
            // Player is distant: walk towards building
            this.walkTowardsTile(clickedBuilding.tileX, clickedBuilding.tileY);
            return;
          }
        }

        // Tap to walk or gather
        this.handleClickMoveOrGather(tx, ty);
      }
    });

    // Pointer move for building preview & hover
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const { tx, ty } = MapSystem.worldToTile(worldPoint.x, worldPoint.y);
      this.hoverTile = { tx, ty };

      if (this.mapSystem.isTileInBounds(tx, ty)) {
        const zone = this.mapSystem.getZoneAt(tx, ty);
        if (this.onTileHover) {
          this.onTileHover(tx, ty, zone.name);
        }
      }

      if (this.buildModeType) {
        this.selectedPlacementTile = { tx, ty };
        this.updateBuildPreview(tx, ty);
      }
    });
  }

  private setupCamera(): void {
    const totalW = MAP_CONFIG.WIDTH * MAP_CONFIG.TILE_WIDTH + 600;
    const totalH = MAP_CONFIG.HEIGHT * MAP_CONFIG.TILE_HEIGHT + 400;

    this.cameras.main.setBounds(0, 0, totalW, totalH);
    this.cameras.main.startFollow(this.playerSprite, true, 0.09, 0.09);
    this.cameras.main.setZoom(1.15);
  }

  private setupBuildPreviewSprites(): void {
    this.buildGridHighlights = [];
    for (let i = 0; i < 9; i++) {
      const h = this.add.sprite(0, 0, 'grid_valid').setVisible(false).setDepth(9990);
      this.buildGridHighlights.push(h);
    }
    this.buildGhostSprite = this.add.sprite(0, 0, 'obj_house_small').setVisible(false).setAlpha(0.75).setDepth(9991);
  }

  public setBuildMode(type: BuildingType | null, movingBuildingId?: string): void {
    this.buildModeType = type;
    this.movingBuildingId = movingBuildingId || null;
    this.placementCooldown = Date.now() + 300; // 300ms cooldown to block modal click-through

    if (!type) {
      for (const h of this.buildGridHighlights) h.setVisible(false);
      if (this.buildGhostSprite) this.buildGhostSprite.setVisible(false);
      if (this.onPlacementStatusChange) {
        this.onPlacementStatusChange({
          active: false,
          buildingType: null,
          isMoving: false,
          tileX: 0,
          tileY: 0,
          valid: false,
        });
      }
    } else {
      const { tex, originY } = this.getBuildingVisualConfig(type);

      if (this.buildGhostSprite) {
        this.buildGhostSprite.setTexture(tex);
        this.buildGhostSprite.setOrigin(0.5, originY);
        this.buildGhostSprite.setVisible(true);
      }

      // Default preview spot: 2 tiles away from player in current facing direction
      let ox = this.playerDirection === 'right' ? 2 : this.playerDirection === 'left' ? -2 : 0;
      let oy = this.playerDirection === 'down' ? 2 : this.playerDirection === 'up' ? -2 : 0;
      if (ox === 0 && oy === 0) oy = 2;

      let initTx = Math.round(this.playerTileX + ox);
      let initTy = Math.round(this.playerTileY + oy);
      if (!this.mapSystem.isTileInBounds(initTx, initTy)) {
        initTx = Math.round(this.playerTileX);
        initTy = Math.round(this.playerTileY);
      }

      this.selectedPlacementTile = { tx: initTx, ty: initTy };
      this.updateBuildPreview(initTx, initTy);
    }
  }

  public updateBuildPreview(tx: number, ty: number): void {
    if (!this.buildModeType || !this.buildGhostSprite) return;

    this.selectedPlacementTile = { tx, ty };
    const fp = BuildingSystem.getFootprint(this.buildModeType);
    const { x: ghostX, y: ghostY } = this.getFootprintWorldPos(tx, ty, fp.width, fp.height);
    this.buildGhostSprite.setPosition(ghostX, ghostY);

    const remotePositions = Array.from(this.remotePlayerSprites.values()).map(rp => {
      const tile = MapSystem.worldToTile(rp.sprite.x, rp.sprite.y - 16);
      return { x: tile.tx, y: tile.ty };
    });

    const npcPositions = this.townNpcs.map(n => ({ tileX: n.tileX, tileY: n.tileY }));
    const resourcePositions = this.resourceSystem.nodes.map(n => ({ tileX: n.tileX, tileY: n.tileY }));

    const check = this.buildingSystem.canPlaceBuilding(
      this.buildModeType,
      tx,
      ty,
      this.mapSystem,
      { x: this.playerTileX, y: this.playerTileY },
      remotePositions,
      npcPositions,
      resourcePositions,
      this.movingBuildingId || undefined
    );
    this.lastPlacementCheck = check;

    const hasItemOrMoving = !!this.movingBuildingId || this.inventorySystem.hasItem(this.buildModeType, 1);
    const isValid = check.valid && hasItemOrMoving;

    // Highlight every tile inside the footprint (1x1, 2x2, 3x2, or 3x3)
    let hIdx = 0;
    for (let dy = 0; dy < fp.height; dy++) {
      for (let dx = 0; dx < fp.width; dx++) {
        const hl = this.buildGridHighlights[hIdx++];
        if (!hl) continue;
        const tp = MapSystem.tileToWorld(tx + dx, ty + dy);
        hl.setPosition(tp.x, tp.y + 16);
        hl.setTexture(isValid ? 'grid_valid' : 'grid_invalid');
        hl.setVisible(true);
      }
    }
    for (let i = hIdx; i < this.buildGridHighlights.length; i++) {
      this.buildGridHighlights[i].setVisible(false);
    }

    if (isValid) {
      this.buildGhostSprite.setTint(0x4ade80); // Vibrant Emerald Green tint
      this.buildGhostSprite.setAlpha(0.8);
    } else {
      this.buildGhostSprite.setTint(0xf87171); // Crisp Rose Red tint
      this.buildGhostSprite.setAlpha(0.65);
    }

    if (this.onPlacementStatusChange) {
      this.onPlacementStatusChange({
        active: true,
        buildingType: this.buildModeType,
        isMoving: !!this.movingBuildingId,
        tileX: tx,
        tileY: ty,
        valid: isValid,
        reason: !hasItemOrMoving ? 'အိတ်ထဲတွင် အဆောက်အအုံ မလုံလောက်ပါ' : check.reason,
      });
    }
  }

  public confirmPlacementFromUI(tx?: number, ty?: number): void {
    const targetX = tx ?? this.selectedPlacementTile.tx;
    const targetY = ty ?? this.selectedPlacementTile.ty;
    this.confirmBuildingPlacement(targetX, targetY);
  }

  public confirmBuildingPlacement(tx: number, ty: number): void {
    if (!this.buildModeType) return;
    if (Date.now() < this.placementCooldown) return;

    const remotePositions = Array.from(this.remotePlayerSprites.values()).map(rp => {
      const tile = MapSystem.worldToTile(rp.sprite.x, rp.sprite.y - 16);
      return { x: tile.tx, y: tile.ty };
    });

    const npcPositions = this.townNpcs.map(n => ({ tileX: n.tileX, tileY: n.tileY }));
    const resourcePositions = this.resourceSystem.nodes.map(n => ({ tileX: n.tileX, tileY: n.tileY }));

    // 1. Move Mode Execution
    if (this.movingBuildingId) {
      const moved = this.buildingSystem.moveBuilding(
        this.movingBuildingId,
        tx,
        ty,
        this.mapSystem,
        { x: this.playerTileX, y: this.playerTileY },
        remotePositions,
        npcPositions,
        resourcePositions
      );

      if (moved) {
        SoundSynth.playBuild();
        this.spawnFloatingText(moved.tileX, moved.tileY, 'အဆောက်အအုံရွှေ့ပြောင်းပြီးပါပြီ!', '#4ade80');
        this.networkSystem.broadcastBuilding(moved);
        this.nudgePlayerIfInsideBuilding(moved.tileX, moved.tileY, moved.width, moved.height);
        this.setBuildMode(null);
        if (this.onStateChanged) this.onStateChanged();
      } else {
        SoundSynth.playRustle();
        if (this.lastPlacementCheck.reason) {
          this.spawnFloatingText(tx, ty, this.lastPlacementCheck.reason, '#f87171');
        }
      }
      return;
    }

    // 2. New Placement Execution
    const placed = this.buildingSystem.placeBuilding(
      this.buildModeType,
      tx,
      ty,
      this.playerProfile.name,
      this.mapSystem,
      this.inventorySystem,
      { x: this.playerTileX, y: this.playerTileY },
      remotePositions,
      npcPositions,
      resourcePositions
    );

    if (placed) {
      SoundSynth.playBuild();
      this.spawnFloatingText(placed.tileX, placed.tileY, 'အဆောက်အအုံဆောက်လုပ်ပြီးပါပြီ!', '#4ade80');
      this.networkSystem.broadcastBuilding(placed);
      this.nudgePlayerIfInsideBuilding(placed.tileX, placed.tileY, placed.width, placed.height);

      // If no more items in inventory, exit build mode
      if (!this.inventorySystem.hasItem(this.buildModeType, 1)) {
        this.setBuildMode(null);
      } else {
        // Refresh preview for next piece
        this.updateBuildPreview(tx, ty);
      }
      if (this.onStateChanged) {
        this.onStateChanged();
      }
    } else {
      SoundSynth.playRustle();
      if (this.lastPlacementCheck.reason) {
        this.spawnFloatingText(tx, ty, this.lastPlacementCheck.reason, '#f87171');
      }
    }
  }

  /**
   * Safely nudges the player outside a newly placed or moved building footprint
   * to guarantee the player NEVER gets stuck inside an obstacle!
   */
  private nudgePlayerIfInsideBuilding(bX: number, bY: number, width: number, height: number): void {
    const pIntX = Math.round(this.playerTileX);
    const pIntY = Math.round(this.playerTileY);

    if (pIntX >= bX && pIntX < bX + width && pIntY >= bY && pIntY < bY + height) {
      const candidates = [
        { x: bX - 1, y: bY },
        { x: bX + width, y: bY },
        { x: bX, y: bY - 1 },
        { x: bX, y: bY + height },
        { x: bX - 1, y: bY + height },
        { x: bX + width, y: bY - 1 },
      ];
      for (const c of candidates) {
        if (this.mapSystem.isWalkable(c.x, c.y)) {
          this.playerTileX = c.x;
          this.playerTileY = c.y;
          break;
        }
      }
    }
  }

  private handleClickMoveOrGather(tx: number, ty: number): void {
    if (this.isGathering) return;

    // Check if clicked directly on an interactive node
    const nearby = this.resourceSystem.getNearbyNode(tx, ty, 1.2);
    if (nearby) {
      const distToPlayer = Math.hypot(nearby.tileX - this.playerTileX, nearby.tileY - this.playerTileY);
      if (distToPlayer <= 1.8) {
        this.startGathering(nearby);
        return;
      }
    }

    // Otherwise walk towards tile if in bounds
    if (this.mapSystem.isTileInBounds(tx, ty)) {
      this.walkTowardsTile(tx, ty);
    }
  }

  private walkTowardsTile(targetTx: number, targetTy: number): void {
    const dx = targetTx - this.playerTileX;
    const dy = targetTy - this.playerTileY;

    let stepX = 0;
    let stepY = 0;

    if (Math.abs(dx) > Math.abs(dy)) {
      stepX = Math.sign(dx);
    } else if (Math.abs(dy) > 0) {
      stepY = Math.sign(dy);
    }

    const nextTx = this.playerTileX + stepX;
    const nextTy = this.playerTileY + stepY;

    if (this.mapSystem.isWalkable(nextTx, nextTy)) {
      this.playerTileX = nextTx;
      this.playerTileY = nextTy;
    }
  }

  public triggerInteraction(): void {
    if (this.isGathering) return;

    // 1. Shop check
    if (this.isNearShop) {
      SoundSynth.playCoin();
      if (this.onOpenUIModal) this.onOpenUIModal('shop');
      return;
    }

    // 2. Crafting Station check
    if (this.isNearCraftStation) {
      SoundSynth.playBuild();
      if (this.onOpenUIModal) this.onOpenUIModal('crafting');
      return;
    }

    // 3. Placed Building check (Storage, Cottage, Fence, Lantern, Campfire)
    if (this.nearbyPlacedBuilding) {
      if (this.nearbyPlacedBuilding.type === 'storage_box') {
        SoundSynth.playSuccess();
        if (this.onOpenUIModal) this.onOpenUIModal('storage', this.nearbyPlacedBuilding);
        return;
      }
      if (this.onSelectPlacedBuilding) {
        this.onSelectPlacedBuilding(this.nearbyPlacedBuilding);
        return;
      }
    }

    // 4. Resource Node check
    const nearbyNode = this.resourceSystem.getNearbyNode(this.playerTileX, this.playerTileY, 1.6);
    if (nearbyNode) {
      this.startGathering(nearbyNode);
      return;
    }

    // 5. Campfire cooking check
    if (this.isNearCampfire) {
      if (this.onOpenUIModal) this.onOpenUIModal('crafting', { filter: 'campfire' });
      return;
    }

    // 6. Friendly Village NPC conversation check (Baker, Florist, Elder, Farmer)
    if (this.nearbyVillageNpc) {
      SoundSynth.playRustle();
      this.spawnFloatingText(Math.round(this.playerTileX), Math.round(this.playerTileY) - 1, this.nearbyVillageNpc.message, '#fde68a');
    }
  }

  private startGathering(node: ResourceNode): void {
    this.isGathering = true;
    this.currentGatheringNode = node;
    this.gatherProgress = 0;
    this.gatherTotalDuration = this.resourceSystem.getGatherDuration(node, this.inventorySystem);

    // Audio feedback start
    if (node.type === 'tree') SoundSynth.playChop();
    else if (node.type === 'rock') SoundSynth.playPickaxe();
    else if (node.type === 'bush') SoundSynth.playRustle();
    else if (node.type === 'lake_fish') SoundSynth.playWater();
    else SoundSynth.playRustle();

    this.gatherProgressBarBg.setVisible(true);
    this.gatherProgressBarFill.setVisible(true);
  }

  private finishGathering(): void {
    if (!this.currentGatheringNode) return;

    const harvested = this.resourceSystem.harvestNode(
      this.currentGatheringNode,
      this.inventorySystem,
      this.mapSystem
    );

    // Audio & floating text
    SoundSynth.playSuccess();
    const itemDef = ITEMS[harvested.item as ItemId];
    const nodeName = itemDef ? itemDef.name : harvested.item;
    this.spawnFloatingText(
      this.currentGatheringNode.tileX,
      this.currentGatheringNode.tileY,
      `+${harvested.amount} ${nodeName}`,
      '#facc15'
    );

    this.networkSystem.broadcastHarvest(this.currentGatheringNode.id);
    this.renderResourceNodes();

    // Reset gathering state
    this.isGathering = false;
    this.currentGatheringNode = null;
    this.gatherProgressBarBg.setVisible(false);
    this.gatherProgressBarFill.setVisible(false);

    if (this.onStateChanged) {
      this.onStateChanged();
    }
  }

  public spawnFloatingText(tileX: number, tileY: number, message: string, color = '#ffffff'): void {
    const { x, y } = MapSystem.tileToWorld(tileX, tileY);
    const txt = this.add.text(x, y - 20, message, {
      fontSize: '12px',
      color,
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 5, y: 3 },
    }).setOrigin(0.5).setDepth(10005);

    this.tweens.add({
      targets: txt,
      y: y - 55,
      alpha: 0,
      duration: 1300,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        txt.destroy();
      },
    });
  }

  public update(time: number, delta: number): void {
    // 1. Handle gathering progress
    if (this.isGathering && this.currentGatheringNode) {
      this.gatherProgress += delta;

      // Update progress bar above player
      const { x, y } = MapSystem.tileToWorld(this.playerTileX, this.playerTileY);
      const barW = 44;
      const barH = 6;
      const bx = x - barW / 2;
      const by = y - 36;
      const ratio = Math.min(1, this.gatherProgress / this.gatherTotalDuration);

      this.gatherProgressBarBg.clear();
      this.gatherProgressBarBg.fillStyle(0x1c1917, 0.9);
      this.gatherProgressBarBg.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

      this.gatherProgressBarFill.clear();
      this.gatherProgressBarFill.fillStyle(0x22c55e, 1);
      this.gatherProgressBarFill.fillRect(bx, by, barW * ratio, barH);

      // Tool animation frame jitter
      if (Math.floor(time / 150) % 2 === 0) {
        this.playerSprite.setFrame(2); // Action frame
      } else {
        this.playerSprite.setFrame(1);
      }

      if (this.gatherProgress >= this.gatherTotalDuration) {
        this.finishGathering();
      }
      return; // Freeze movement while actively gathering
    }

    // 2. Handle Player Movement Input
    let moveX = 0;
    let moveY = 0;

    // Keyboard WASD / Arrow keys
    if (this.cursors.left.isDown || this.keyA.isDown) moveX -= 1;
    if (this.cursors.right.isDown || this.keyD.isDown) moveX += 1;
    if (this.cursors.up.isDown || this.keyW.isDown) moveY -= 1;
    if (this.cursors.down.isDown || this.keyS.isDown) moveY += 1;

    // Mobile Virtual Joystick input
    if (Math.abs(this.joystickVector.x) > 0.25) {
      moveX = Math.sign(this.joystickVector.x);
    }
    if (Math.abs(this.joystickVector.y) > 0.25) {
      moveY = Math.sign(this.joystickVector.y);
    }

    this.isMoving = moveX !== 0 || moveY !== 0;

    if (this.isMoving) {
      // Movement speed in tiles per second (approx 4.2 tiles/sec)
      const speed = 0.07;
      let nextX = this.playerTileX + moveX * speed;
      let nextY = this.playerTileY + moveY * speed;

      // Update character facing direction and animation row
      if (moveX > 0) this.playerDirection = 'right';
      else if (moveX < 0) this.playerDirection = 'left';
      else if (moveY > 0) this.playerDirection = 'down';
      else if (moveY < 0) this.playerDirection = 'up';

      // Check walkability at target integer tile
      const targetIntX = Math.round(nextX);
      const targetIntY = Math.round(nextY);
      const currentIntX = Math.round(this.playerTileX);
      const currentIntY = Math.round(this.playerTileY);
      const isCurrentlyStuck = !this.mapSystem.isWalkable(currentIntX, currentIntY);

      if (this.mapSystem.isWalkable(targetIntX, targetIntY)) {
        this.playerTileX = nextX;
        this.playerTileY = nextY;
      } else if (isCurrentlyStuck) {
        // Player is stuck on an unwalkable tile: allow movement so player can smoothly escape!
        this.playerTileX = nextX;
        this.playerTileY = nextY;
      } else {
        // Try sliding on single axis
        if (this.mapSystem.isWalkable(targetIntX, currentIntY)) {
          this.playerTileX = nextX;
        } else if (this.mapSystem.isWalkable(currentIntX, targetIntY)) {
          this.playerTileY = nextY;
        }
      }

      // Animated walking frame
      const walkFrame = (Math.floor(time / 160) % 2) + 1; // Frames 1 or 2
      const rowOffset = this.playerDirection === 'down' ? 0 : this.playerDirection === 'left' ? 3 : this.playerDirection === 'right' ? 6 : 9;
      this.playerSprite.setFrame(rowOffset + walkFrame);

      // Periodically broadcast movement to network
      if (Math.floor(time / 100) % 3 === 0) {
        this.networkSystem.broadcastPosition(this.playerTileX, this.playerTileY, this.playerDirection, true);
      }
    } else {
      // Idle frame
      const rowOffset = this.playerDirection === 'down' ? 0 : this.playerDirection === 'left' ? 3 : this.playerDirection === 'right' ? 6 : 9;
      this.playerSprite.setFrame(rowOffset);
    }

    // 3. Update Player Isometric Screen Position & Shadow
    const { x: pScreenX, y: pScreenY } = MapSystem.tileToWorld(this.playerTileX, this.playerTileY);
    this.playerSprite.setPosition(pScreenX, pScreenY + 16);
    this.playerSprite.setDepth((this.playerTileX + this.playerTileY) * 100 + 60);

    if (this.playerShadow) {
      this.playerShadow.setPosition(pScreenX, pScreenY + 16);
      this.playerShadow.setDepth((this.playerTileX + this.playerTileY) * 100 + 40);
    }

    this.playerNameText.setPosition(pScreenX, pScreenY - 32);

    // 3.5 Smoothly Interpolate Remote Players & Shadows
    for (const [id, peer] of this.networkSystem.remotePlayers) {
      const entry = this.getOrCreateRemoteSprite(id, peer);

      // Lerp towards authoritative target position
      const lerpSpeed = 0.22;
      peer.tileX += (peer.targetTileX - peer.tileX) * lerpSpeed;
      peer.tileY += (peer.targetTileY - peer.tileY) * lerpSpeed;

      const { x: rx, y: ry } = MapSystem.tileToWorld(peer.tileX, peer.tileY);
      entry.sprite.setPosition(rx, ry + 16);
      entry.sprite.setDepth((peer.tileX + peer.tileY) * 100 + 58);
      entry.nameText.setPosition(rx, ry - 30);

      const rShadow = this.remotePlayerShadows.get(id);
      if (rShadow) {
        rShadow.setPosition(rx, ry + 16);
        rShadow.setDepth((peer.tileX + peer.tileY) * 100 + 40);
      }

      const rRow = peer.direction === 'down' ? 0 : peer.direction === 'left' ? 3 : peer.direction === 'right' ? 6 : 9;
      if (peer.isMoving) {
        const rWalkFrame = (Math.floor(time / 160) % 2) + 1;
        entry.sprite.setFrame(rRow + rWalkFrame);
      } else {
        entry.sprite.setFrame(rRow);
      }
    }

    // 3.8 Animate Village NPCs with gentle idle breathing & shopkeeper working routines
    for (const npc of this.townNpcs) {
      const bobOffset = Math.sin(time * 0.0028 + npc.phase) * 0.65;
      npc.sprite.setPosition(npc.baseX, npc.baseY + bobOffset);

      const cycle = Math.floor((time + npc.phase * 500) / 1400) % 4;
      let frame = 0; // down
      if (npc.role === 'blacksmith') {
        // Forging work rhythm: alternates facing down & right with subtle step frame
        frame = cycle === 0 ? 0 : cycle === 1 ? 7 : cycle === 2 ? 6 : 1;
      } else if (npc.role === 'florist' || npc.role === 'baker' || npc.role === 'grocer') {
        // Attentive shopkeepers glancing between goods & plaza visitors
        frame = cycle === 0 ? 0 : cycle === 1 ? 3 : cycle === 2 ? 0 : 6;
      } else {
        frame = cycle === 2 ? 1 : 0;
      }
      npc.sprite.setFrame(frame);
    }

    // 4. Update Interaction Proximity Detection
    this.checkNearbyInteractions();

    // 5. Notify React of player position
    const currentZone = this.mapSystem.getZoneAt(Math.round(this.playerTileX), Math.round(this.playerTileY));
    if (this.onPlayerMove) {
      this.onPlayerMove(Math.round(this.playerTileX), Math.round(this.playerTileY), currentZone.name);
    }
  }

  private checkNearbyInteractions(): void {
    const ptx = this.playerTileX;
    const pty = this.playerTileY;

    // A. Shops (General Store 24,28 | Grocery 24,35 | Outdoor Market 35,33)
    const distGeneral = Math.hypot(ptx - 24, pty - 28);
    const distGrocery = Math.hypot(ptx - 24, pty - 35);
    const distMarket = Math.hypot(ptx - 35, pty - 33);
    this.isNearShop = distGeneral <= 2.5 || distGrocery <= 2.5 || distMarket <= 2.4;

    // B. Crafting Station / Blacksmith Forge (33, 25 and 34, 25)
    const distCraft = Math.min(Math.hypot(ptx - 33, pty - 25), Math.hypot(ptx - 34, pty - 25));
    this.isNearCraftStation = distCraft <= 2.5;

    // C. Friendly Village NPCs (Bakery, Florist, Elder, Farmer)
    this.nearbyVillageNpc = null;
    if (Math.hypot(ptx - 24, pty - 24) <= 2.3) {
      this.nearbyVillageNpc = {
        role: 'baker',
        title: 'ကလာရာ၏ မုန့်ဖို (Village Bakery)',
        subtitle: 'လတ်လတ်ဆတ်ဆတ် မုန့်နံ့လေးတွေ သင်းနေပါတယ်',
        message: 'မင်္ဂလာပါ! ပူပူနွေးနွေး ပေါင်မုန့်လေးတွေ ဖုတ်နေပါတယ် 🥐',
      };
    } else if (Math.hypot(ptx - 28, pty - 36) <= 2.3) {
      this.nearbyVillageNpc = {
        role: 'florist',
        title: 'ဒေစီ၏ ပန်းဆိုင်လေး (Flower Shop)',
        subtitle: 'ရောင်စုံပန်းပွင့်လေးများဖြင့် ရွာလေးကို အလှဆင်ထားသည်',
        message: 'ရွာပန်းခြံအတွက် ပန်းလှလှလေးတွေ ပြုစုနေပါတယ် 🌸',
      };
    } else if (Math.hypot(ptx - 29, pty - 29) <= 2.2) {
      this.nearbyVillageNpc = {
        role: 'elder',
        title: 'ရွာလူကြီး အာသာ (Elder Arthur)',
        subtitle: 'စကားပြောရန် [E] နှိပ်ပါ',
        message: 'Random City ရွာလေးမှ ကြိုဆိုပါတယ် လူငယ်လေး! 🏡',
      };
    } else if (Math.hypot(ptx - 50, pty - 74) <= 2.4) {
      this.nearbyVillageNpc = {
        role: 'farmer',
        title: 'လယ်သမားကြီး သောမတ်စ်',
        subtitle: 'စကားပြောရန် [E] နှိပ်ပါ',
        message: 'ဒီနှစ် ဂျုံနဲ့ ဖရုံသီးတွေ အထွက်တိုးနေပါတယ် 🌾',
      };
    }

    // D. Nearby Placed Buildings (Cottage, Manor, Villa, Fence, Campfire, Storage Chest, Lantern)
    this.isNearCampfire = false;
    this.nearbyStorageChest = null;
    this.nearbyPlacedBuilding = null;
    for (const b of this.buildingSystem.buildings) {
      const centerX = b.tileX + b.width / 2;
      const centerY = b.tileY + b.height / 2;
      const dist = Math.hypot(ptx - centerX, pty - centerY);
      if (dist <= Math.max(2.4, Math.max(b.width, b.height) * 0.95)) {
        this.nearbyPlacedBuilding = b;
        if (b.type === 'campfire') {
          this.isNearCampfire = true;
        } else if (b.type === 'storage_box') {
          this.nearbyStorageChest = b;
        }
      }
    }

    // E. Nearby Resource Node
    const nearbyNode = this.resourceSystem.getNearbyNode(ptx, pty, 1.8);

    // Formulate HUD prompt for user in Burmese
    if (this.onInteractionChange) {
      if (this.isNearShop) {
        const shopTitle = distGrocery <= 2.5
          ? 'မာယာ၏ ကုန်စိမ်းနှင့်သစ်သီးဆိုင်'
          : distMarket <= 2.4
          ? 'အာရီယာ၏ ဈေးဆိုင်တန်း'
          : 'ဘားနဘီ၏ အထွေထွေကုန်စုံဆိုင်';
        this.onInteractionChange({
          type: 'shop',
          title: shopTitle,
          subtitle: 'ကိရိယာ၊ အစားအစာနှင့် အိမ်ဆောက်ပစ္စည်းများ ဝယ်/ရောင်းရန်',
          actionKey: 'E',
        });
      } else if (this.isNearCraftStation) {
        this.onInteractionChange({
          type: 'crafting',
          title: 'ပန်းပဲဖိုနှင့် လက်မှုလုပ်ငန်းခုံ',
          subtitle: 'ပုဆိန်၊ ပေါက်ပြား၊ အိမ်အရွယ်အစားစုံ ဖန်တီးရန်',
          actionKey: 'E',
        });
      } else if (this.nearbyPlacedBuilding) {
        const bName = this.nearbyPlacedBuilding.type === 'house_small'
          ? 'သစ်သားအိမ်ငယ်'
          : this.nearbyPlacedBuilding.type === 'house_medium'
          ? 'နှစ်ထပ်သစ်သားအိမ်'
          : this.nearbyPlacedBuilding.type === 'house_large'
          ? 'စံအိမ်ကြီး'
          : this.nearbyPlacedBuilding.type === 'fence_wood'
          ? 'သစ်သားခြံစည်းရိုး'
          : this.nearbyPlacedBuilding.type === 'storage_box'
          ? 'သိုလှောင်သေတ္တာ'
          : this.nearbyPlacedBuilding.type === 'campfire'
          ? 'မီးဖို'
          : this.nearbyPlacedBuilding.type === 'lantern'
          ? 'မီးအိမ်တိုင်'
          : 'အဆောက်အအုံ';
        this.onInteractionChange({
          type: 'building_manage',
          title: `${bName} စီမံခန့်ခွဲမှု`,
          subtitle: 'ရွှေ့ပြောင်းရန် သို့မဟုတ် ဖျက်သိမ်းရန် [E] နှိပ်ပါ',
          actionKey: 'E',
        });
      } else if (nearbyNode) {
        let actionWord = 'ရိတ်သိမ်းမည်';
        let toolHint = '';
        if (nearbyNode.type === 'tree') {
          actionWord = 'သစ်ခုတ်မည် (သစ်ပင်)';
          toolHint = 'ပုဆိန်ဖြင့် ခုတ်ပါက သစ်သားပိုမိုရရှိသည်';
        } else if (nearbyNode.type === 'rock') {
          actionWord = 'ကျောက်ခွဲမည် (ကျောက်တုံး)';
          toolHint = 'ပေါက်ပြားဖြင့် ခွဲပါက ကျောက်တုံးပိုမိုရရှိသည်';
        } else if (nearbyNode.type === 'bush') {
          actionWord = 'အပင်အမျှင်ခူးမည် (ချုံပုတ်)';
          toolHint = 'သဘာဝအမျှင်နှင့် သစ်သီးများရရှိသည်';
        } else if (nearbyNode.type === 'animal') {
          actionWord = 'အမဲလိုက်မည် (တောရိုင်းတိရစ္ဆာန်)';
          toolHint = 'လတ်ဆတ်သော အသားစိမ်းရရှိသည်';
        } else if (nearbyNode.type === 'lake_fish') {
          actionWord = 'ငါးမျှားမည် (ရေကန်)';
          toolHint = 'လတ်ဆတ်သော ရေကန်ငါးများ ရရှိသည်';
        }

        this.onInteractionChange({
          type: 'gather',
          title: actionWord,
          subtitle: toolHint,
          actionKey: 'E',
        });
      } else if (this.isNearCampfire) {
        this.onInteractionChange({
          type: 'campfire',
          title: 'နွေးထွေးသော မီးဖို',
          subtitle: 'အသားနှင့် ငါးများ ကင်ရန်/ချက်ပြုတ်ရန်',
          actionKey: 'E',
        });
      } else if (this.nearbyVillageNpc) {
        this.onInteractionChange({
          type: 'npc',
          title: this.nearbyVillageNpc.title,
          subtitle: this.nearbyVillageNpc.subtitle,
          actionKey: 'E',
        });
      } else {
        this.onInteractionChange(null);
      }
    }
  }

  public setZoom(zoom: number): void {
    this.cameras.main.setZoom(Phaser.Math.Clamp(zoom, 0.75, 1.6));
  }

  public getZoom(): number {
    return this.cameras.main.zoom;
  }
}
