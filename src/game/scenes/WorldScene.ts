/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Phaser from 'phaser';
import {
  ANIMAL_SPECIES,
  AUNTY_GYI_LOCATION,
  BUILDABLE_ZONE_BOUNDS,
  CLOTHING_RENDER_LAYER_ORDER,
  CRAFTING_RECIPES,
  CRAFTING_STATION_LOCATION,
  DEFAULT_MOVEMENT_MODE,
  FARM_PLOTS,
  getResourceSourceHintMy,
  ITEMS,
  MAP_CONFIG,
  MERCHANT_LOCATION,
  MOVEMENT_SPEEDS,
  TOWN_PROTECTED_BOUNDS,
  ZONE_SIGNPOSTS,
  ZoneSignpostDef,
} from '../constants';
import { BuildingSystem } from '../systems/BuildingSystem';
import { ClothingSystem } from '../systems/ClothingSystem';
import { CraftingSystem } from '../systems/CraftingSystem';
import { InventorySystem } from '../systems/InventorySystem';
import { MapSystem } from '../systems/MapSystem';
import { NetworkSystem } from '../systems/NetworkSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import {
  AmbientLifeSystem,
  WILDLIFE_POOL_CONFIG,
  WildlifeKind,
} from '../systems/AmbientLifeSystem';
import {
  AtmosphereSnapshot,
  getBuildingLightAnchors,
  WorldAtmosphereSystem,
} from '../systems/WorldAtmosphereSystem';
import {
  getCliffVariantKey,
  getCobbleVariantKey,
  getGrassVariantKey,
  getNatureDecorForTile,
  getRoadConnectionMask,
  getSandVariantKey,
  getTileTransitionOverlays,
  getWaterVariantKey,
  hash2D,
} from '../systems/TerrainAutotile';
import {
  STEP14_SCENIC_PROPS,
  STEP7_LANDMARK_PROPS,
  WorldComposition,
} from '../systems/WorldComposition';
import { PixelArtGenerator } from '../textures/PixelArtGenerator';
import {
  ActionToolKind,
  AnimalKind,
  BuildingType,
  ClothingEquipmentSlot,
  EquippedClothingState,
  FenceRotation,
  GuidanceRequirementItem,
  ItemId,
  MerchantGuideInfo,
  MovementMode,
  PlacedBuilding,
  PlayerProfile,
  ResourceNode,
  TileType,
  ZoneDefinition,
} from '../types';
import { SoundSynth } from '../utils/SoundSynth';

export interface FishingHudState {
  active: boolean;
  phase: 'waiting' | 'bite';
  cursorPos: number;
  sweetMin: number;
  sweetMax: number;
  timeLeftRatio: number;
}

export class WorldScene extends Phaser.Scene {
  // Systems
  public mapSystem!: MapSystem;
  public inventorySystem!: InventorySystem;
  public buildingSystem!: BuildingSystem;
  public craftingSystem!: CraftingSystem;
  public resourceSystem!: ResourceSystem;
  public networkSystem!: NetworkSystem;
  public atmosphereSystem!: WorldAtmosphereSystem;

  // Player state
  public playerProfile!: PlayerProfile;
  public playerTileX = 30;
  public playerTileY = 30;
  public playerSprite!: Phaser.GameObjects.Sprite;
  public playerToolSprite!: Phaser.GameObjects.Sprite;
  public playerNameText!: Phaser.GameObjects.Text;
  public playerDirection: 'down' | 'left' | 'right' | 'up' = 'down';
  public isMoving = false;
  public isGathering = false;
  public currentGatheringNode: ResourceNode | null = null;
  public gatherActionTool: ActionToolKind | null = null;
  private gatherStrikeCount = 0;
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
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyEnter!: Phaser.Input.Keyboard.Key;

  // External joystick vector from mobile UI
  public joystickVector = { x: 0, y: 0 };

  // Building mode
  public buildModeType: BuildingType | null = null;
  public movingBuildingId: string | null = null;
  public buildRotation: FenceRotation = 0;
  public isPlacementPinned = false;
  public placementCooldown = 0;
  public selectedPlacementTile = { tx: 30, ty: 30 };
  public lastPlacementCheck: { valid: boolean; reason?: string } = { valid: false };
  public buildGhostSprite: Phaser.GameObjects.Sprite | null = null;
  public buildGridHighlights: Phaser.GameObjects.Sprite[] = [];
  public buildableZoneGraphics: Phaser.GameObjects.Graphics | null = null;
  public hoverTile = { tx: 30, ty: 30 };

  // Tracking last saved tile / interaction target
  private lastReportedTileX = -999;
  private lastReportedTileY = -999;
  private lastReportedZone = '';
  private lastEmittedTargetId: string | null = null;

  // Game Object Containers & Maps
  private tileSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private static readonly GROUND_CHUNK_SIZE = 10;
  private static readonly GROUND_CHUNK_W = 640;
  private static readonly GROUND_CHUNK_H = 320;
  private groundChunks: Array<{
    cx: number;
    cy: number;
    tx0: number;
    ty0: number;
    worldX: number;
    worldY: number;
    texKey: string;
    baked: boolean;
    image: Phaser.GameObjects.Image | null;
  }> = [];
  private bridgeApproachLookup: Map<string, string[]> = new Map();
  private resourceSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private resourceShadows: Map<string, Phaser.GameObjects.Image> = new Map();
  private buildingSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private townBuildingSprites: Phaser.GameObjects.Sprite[] = [];
  private tallLandmarkSprites: Phaser.GameObjects.Sprite[] = [];
  private remotePlayerSprites: Map<
    string,
    {
      sprite: Phaser.GameObjects.Sprite;
      toolSprite: Phaser.GameObjects.Sprite;
      clothingLayers: Partial<Record<ClothingEquipmentSlot, Phaser.GameObjects.Sprite>>;
      nameText: Phaser.GameObjects.Text;
      animCycle: number;
      settleMs: number;
      lastStep: number;
      phaseOffset: number;
      gatherElapsedMs: number;
      lastGatherStrike: number;
    }
  > = new Map();
  private townNpcs: Array<{
    sprite: Phaser.GameObjects.Sprite;
    shadow: Phaser.GameObjects.Image;
    nameText: Phaser.GameObjects.Text;
    baseX: number;
    baseY: number;
    tileX: number;
    tileY: number;
    defaultDir: 'down' | 'left' | 'right' | 'up';
    role: 'merchant' | 'blacksmith' | 'baker' | 'grocer' | 'florist' | 'elder' | 'settler' | 'farmer';
    phase: number;
    cyclePeriodMs: number;
    offsetMs: number;
  }> = [];

  public static readonly MOVE_SPEED_TILES_PER_SEC = MOVEMENT_SPEEDS[DEFAULT_MOVEMENT_MODE];
  private static readonly PLAYER_COLLISION_RADIUS = 0.2;
  private static readonly WALK_FRAME_SEQUENCE = [0, 1, 0, 2] as const;
  public static readonly MIN_ZOOM = 0.75;
  public static readonly MAX_ZOOM = 1.6;
  public static readonly ZOOM_STEP = 0.125;

  public movementMode: MovementMode = DEFAULT_MOVEMENT_MODE;
  private smoothMoveX = 0;
  private smoothMoveY = 0;

  public getEffectiveMoveSpeed(): number {
    return MOVEMENT_SPEEDS[this.movementMode] ?? WorldScene.MOVE_SPEED_TILES_PER_SEC;
  }

  public static clampZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) return 1.125;
    return Math.min(WorldScene.MAX_ZOOM, Math.max(WorldScene.MIN_ZOOM, zoom));
  }

  public static computeRecommendedZoom(viewportW: number, viewportH: number): number {
    if (viewportW <= 0 || viewportH <= 0) return 1.125;
    // Compact mobile landscape (e.g. 896x414, 800x360): widen vertical view
    if (viewportW > viewportH && viewportH <= 540) return 0.875;
    // Narrow mobile portrait (e.g. 390x844, 414x896): widen horizontal view
    if (viewportW < 768 && viewportH >= viewportW) return 0.875;
    // Tablet / compact window
    if (viewportW < 1100 || viewportH < 700) return 1.0;
    // Large high-res desktop
    if (viewportW >= 1600 && viewportH >= 900) return 1.25;
    // Standard desktop
    return 1.125;
  }

  public static computeViewportVerticalBiasPx(viewportW: number, viewportH: number, isTouchViewport: boolean): number {
    if (!isTouchViewport || viewportW <= 0 || viewportH <= 0) return 0;
    if (viewportH > viewportW && viewportW < 768) return 22;
    if (viewportW > viewportH && viewportH <= 500) return 10;
    return 0;
  }

  public static computeExponentialLerpAlpha(ratePerSec: number, dtSec: number): number {
    if (dtSec <= 0 || ratePerSec <= 0) return 0;
    return 1 - Math.exp(-ratePerSec * Math.min(0.05, dtSec));
  }

  public static snapToPixelGrid(worldCoord: number, zoom: number): number {
    const z = zoom > 0 ? zoom : 1;
    return Math.round(worldCoord * z) / z;
  }

  public static isDomTextInputFocused(): boolean {
    if (typeof document === 'undefined') return false;
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  public isUiOverlayOpen = false;

  private isShortcutBlocked(): boolean {
    return this.isUiOverlayOpen || WorldScene.isDomTextInputFocused();
  }

  /**
   * Normalizes both digital (WASD/Arrows) and analog (virtual joystick) movement inputs
   * with strict unit diagonal clamping and smooth deadzone rescaling [deadzone..1] -> [0..1].
   */
  public static normalizeMovementInput(
    rawX: number,
    rawY: number,
    isAnalog: boolean,
    deadzone = 0.14
  ): { x: number; y: number; magnitude: number } {
    const rawMag = Math.hypot(rawX, rawY);
    if (!Number.isFinite(rawMag) || rawMag <= 0) {
      return { x: 0, y: 0, magnitude: 0 };
    }

    const ux = rawX / rawMag;
    const uy = rawY / rawMag;

    if (!isAnalog) {
      return { x: ux, y: uy, magnitude: 1 };
    }

    if (rawMag <= deadzone) {
      return { x: 0, y: 0, magnitude: 0 };
    }

    const scaledMag = Math.min(1, (rawMag - deadzone) / Math.max(0.001, 1 - deadzone));
    return {
      x: ux * scaledMag,
      y: uy * scaledMag,
      magnitude: scaledMag,
    };
  }

  public static computeStepVector(
    moveX: number,
    moveY: number,
    deltaMs: number,
    speedTilesPerSec = WorldScene.MOVE_SPEED_TILES_PER_SEC,
    preserveSubUnitMagnitude = false
  ): { dx: number; dy: number; dt: number } {
    const dt = Math.min(0.05, Math.max(0, deltaMs) / 1000);
    const len = Math.hypot(moveX, moveY);
    if (len <= 0 || dt <= 0) {
      return { dx: 0, dy: 0, dt };
    }
    const nx = moveX / len;
    const ny = moveY / len;
    const mag = preserveSubUnitMagnitude ? Math.min(1, len) : 1;
    return {
      dx: nx * mag * speedTilesPerSec * dt,
      dy: ny * mag * speedTilesPerSec * dt,
      dt,
    };
  }

  public static getToolForResourceNode(nodeType: ResourceNode['type']): ActionToolKind | null {
    switch (nodeType) {
      case 'tree':
        return 'axe';
      case 'rock':
        return 'pickaxe';
      case 'bush':
        return 'scythe';
      case 'animal':
        return 'hunt';
      default:
        return null;
    }
  }

  public static computeToolSwingPose(
    direction: 'down' | 'left' | 'right' | 'up',
    tool: ActionToolKind,
    elapsedMs: number
  ): {
    textureKey: string;
    offsetX: number;
    offsetY: number;
    angleDeg: number;
    flipX: boolean;
    depthOffset: number;
    playerLeanAngleDeg: number;
    playerSquashX: number;
    playerSquashY: number;
    playerOffsetY: number;
    cyclePhase: number;
    hitBeatIndex: number;
  } {
    const period =
      tool === 'axe' ? 440 : tool === 'pickaxe' ? 460 : tool === 'scythe' ? 420 : 380;
    const safeElapsed = Math.max(0, elapsedMs);
    const phase = (safeElapsed % period) / period;
    const hitBeatIndex = Math.floor((safeElapsed + period * 0.44) / period);

    const textureKey =
      tool === 'axe'
        ? 'tool_axe'
        : tool === 'pickaxe'
        ? 'tool_pickaxe'
        : tool === 'scythe'
        ? 'tool_scythe'
        : 'tool_hunt';

    const flipX = direction === 'left';
    const dirSign = flipX ? -1 : 1;
    const depthOffset = direction === 'up' ? -2 : direction === 'down' ? 3 : 2;

    const baseAnchor =
      direction === 'left'
        ? { x: -6, y: -17 }
        : direction === 'right'
        ? { x: 6, y: -17 }
        : direction === 'up'
        ? { x: 5, y: -21 }
        : { x: 7, y: -15 };

    let swingAngle = 0;
    let extraX = 0;
    let extraY = 0;
    let leanDeg = 0;
    let squashX = 1;
    let squashY = 1;
    let pOffY = 0;

    if (tool === 'axe') {
      if (phase < 0.40) {
        const t = phase / 0.40;
        const ease = t * t;
        swingAngle = -15 - 68 * ease;
        leanDeg = -3.2 * ease * dirSign;
        extraY = -3 * ease;
      } else if (phase < 0.65) {
        const t = (phase - 0.40) / 0.25;
        const slam = 1 - Math.pow(1 - t, 3);
        swingAngle = -83 + 138 * slam;
        leanDeg = (-3.2 + 7.8 * slam) * dirSign;
        extraX = (direction === 'left' ? -4 : direction === 'right' ? 4 : direction === 'down' ? 2 : 0) * slam;
        extraY = (direction === 'down' ? 4 : direction === 'up' ? -2 : 2) * slam;
        squashX = 1 + 0.05 * Math.sin(t * Math.PI);
        squashY = 1 - 0.05 * Math.sin(t * Math.PI);
        pOffY = 1.2 * Math.sin(t * Math.PI);
      } else {
        const t = (phase - 0.65) / 0.35;
        swingAngle = 55 - 70 * t;
        leanDeg = 4.6 * (1 - t) * dirSign;
        extraX = (direction === 'left' ? -4 : direction === 'right' ? 4 : 1) * (1 - t);
      }
    } else if (tool === 'pickaxe') {
      if (phase < 0.42) {
        const t = phase / 0.42;
        const ease = t * t;
        swingAngle = -20 - 74 * ease;
        leanDeg = -3.6 * ease * dirSign;
        extraY = -4 * ease;
      } else if (phase < 0.62) {
        const t = (phase - 0.42) / 0.20;
        const strike = 1 - Math.pow(1 - t, 3);
        swingAngle = -94 + 156 * strike;
        leanDeg = (-3.6 + 8.6 * strike) * dirSign;
        extraX = (direction === 'left' ? -4.5 : direction === 'right' ? 4.5 : 1.5) * strike;
        extraY = (direction === 'down' ? 5 : 2.5) * strike;
        squashX = 1 + 0.06 * Math.sin(t * Math.PI);
        squashY = 1 - 0.06 * Math.sin(t * Math.PI);
        pOffY = 1.6 * Math.sin(t * Math.PI);
      } else {
        const t = (phase - 0.62) / 0.38;
        swingAngle = 62 - 82 * t;
        leanDeg = 5 * (1 - t) * dirSign;
        extraY = 2.5 * (1 - t);
      }
    } else if (tool === 'scythe') {
      if (phase < 0.28) {
        const t = phase / 0.28;
        swingAngle = -18 - 54 * t;
        extraX = -4 * t * dirSign;
        leanDeg = -4 * t * dirSign;
      } else if (phase < 0.68) {
        const t = (phase - 0.28) / 0.40;
        const arc = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        swingAngle = -72 + 146 * arc;
        extraX = (-4 + 11 * arc) * dirSign;
        extraY = direction === 'down' ? 2.5 * Math.sin(arc * Math.PI) : -1.5 * Math.sin(arc * Math.PI);
        leanDeg = (-4 + 9 * arc) * dirSign;
        squashX = 1 + 0.04 * Math.sin(arc * Math.PI);
      } else {
        const t = (phase - 0.68) / 0.32;
        swingAngle = 74 - 92 * t;
        extraX = 7 * (1 - t) * dirSign;
        leanDeg = 5 * (1 - t) * dirSign;
      }
    } else {
      // Hunt: rapid lunging spear-knife thrust/slash
      const lungeX = direction === 'left' ? -7.5 : direction === 'right' ? 7.5 : 0;
      const lungeY = direction === 'down' ? 4.5 : direction === 'up' ? -4.5 : 1;
      if (phase < 0.30) {
        const t = phase / 0.30;
        swingAngle = -16 * t;
        extraX = -2.5 * t * dirSign;
        leanDeg = -2.5 * t * dirSign;
      } else if (phase < 0.60) {
        const t = (phase - 0.30) / 0.30;
        const thrust = 1 - Math.pow(1 - t, 3);
        swingAngle = -16 + 58 * thrust;
        extraX = lungeX * thrust;
        extraY = lungeY * thrust;
        leanDeg = 6.2 * thrust * dirSign;
        squashX = 1 + 0.05 * Math.sin(t * Math.PI);
        squashY = 1 - 0.04 * Math.sin(t * Math.PI);
      } else {
        const t = (phase - 0.60) / 0.40;
        swingAngle = 42 * (1 - t);
        extraX = lungeX * (1 - t);
        extraY = lungeY * (1 - t);
        leanDeg = 6.2 * (1 - t) * dirSign;
      }
    }

    const angleDeg =
      direction === 'left'
        ? -swingAngle
        : direction === 'up'
        ? swingAngle * 0.72 - 12
        : direction === 'down'
        ? swingAngle * 0.85 + 22
        : swingAngle;

    const playerLeanAngleDeg =
      direction === 'down' || direction === 'up' ? leanDeg * 0.45 : leanDeg;

    return {
      textureKey,
      offsetX: baseAnchor.x + extraX,
      offsetY: baseAnchor.y + extraY,
      angleDeg,
      flipX,
      depthOffset,
      playerLeanAngleDeg,
      playerSquashX: squashX,
      playerSquashY: squashY,
      playerOffsetY: pOffY,
      cyclePhase: phase,
      hitBeatIndex,
    };
  }

  public static buildFishingGuidanceSpec(
    hasRod: boolean,
    woodHave: number,
    fiberHave: number,
    coins: number
  ): {
    kind: 'fishing';
    badgeIcon: string;
    title: string;
    subtitle: string;
    targetX: number;
    targetY: number;
    targetLabel: string;
    requirements: GuidanceRequirementItem[];
    autoCloseOnShop: boolean;
    autoCloseOnCraft: boolean;
    dismissWhenHasItem: ItemId;
  } | null {
    if (hasRod) return null;

    const rodRecipe = CRAFTING_RECIPES.find((r) => r.id === 'craft_rod');
    const woodNeed = rodRecipe?.ingredients.find((i) => i.item === 'wood')?.quantity ?? 4;
    const fiberNeed = rodRecipe?.ingredients.find((i) => i.item === 'fiber')?.quantity ?? 4;
    const buyPrice = ITEMS.rod_basic.buyPrice ?? 25;

    const requirements: GuidanceRequirementItem[] = [
      {
        itemId: 'wood',
        name: ITEMS.wood.name,
        icon: ITEMS.wood.icon,
        have: woodHave,
        need: woodNeed,
      },
      {
        itemId: 'fiber',
        name: ITEMS.fiber.name,
        icon: ITEMS.fiber.icon,
        have: fiberHave,
        need: fiberNeed,
      },
    ];

    if (woodHave >= woodNeed && fiberHave >= fiberNeed) {
      return {
        kind: 'fishing',
        badgeIcon: '🎣',
        title: 'ငါးမျှားတံ (Fishing Rod) ဖန်တီးနိုင်ပြီ!',
        subtitle: `Crafting Station [${CRAFTING_STATION_LOCATION.tileX},${CRAFTING_STATION_LOCATION.tileY}] တွင် ဖန်တီးပါ (သို့) [C] နှိပ်ပါ`,
        targetX: CRAFTING_STATION_LOCATION.tileX,
        targetY: CRAFTING_STATION_LOCATION.tileY,
        targetLabel: 'Crafting Station',
        requirements,
        autoCloseOnShop: false,
        autoCloseOnCraft: true,
        dismissWhenHasItem: 'rod_basic',
      };
    }

    if (coins >= buyPrice) {
      return {
        kind: 'fishing',
        badgeIcon: '🎣',
        title: 'ငါးမျှားတံ လိုအပ်သည် (Fishing Rod)',
        subtitle: `ဆိုင် [${MERCHANT_LOCATION.tileX},${MERCHANT_LOCATION.tileY}] တွင် ${buyPrice}🪙 ဖြင့်ဝယ်ပါ (သို့) Wood/Fiber စုပြီး Craft လုပ်ပါ`,
        targetX: MERCHANT_LOCATION.tileX,
        targetY: MERCHANT_LOCATION.tileY,
        targetLabel: 'Barnaby ဆိုင်',
        requirements,
        autoCloseOnShop: true,
        autoCloseOnCraft: false,
        dismissWhenHasItem: 'rod_basic',
      };
    }

    const missingWood = Math.max(0, woodNeed - woodHave);
    const missingFiber = Math.max(0, fiberNeed - fiberHave);
    const hints: string[] = [];
    if (missingWood > 0) hints.push(`သစ် ${missingWood} ခု (${getResourceSourceHintMy('wood')})`);
    if (missingFiber > 0) hints.push(`အမျှင် ${missingFiber} ခု (${getResourceSourceHintMy('fiber')})`);

    return {
      kind: 'fishing',
      badgeIcon: '🎣',
      title: 'ငါးမျှားတံ လိုအပ်သည် (Fishing Rod)',
      subtitle: `${hints.join(' • ')} — Crafting [${CRAFTING_STATION_LOCATION.tileX},${CRAFTING_STATION_LOCATION.tileY}] / Shop ${buyPrice}🪙`,
      targetX: CRAFTING_STATION_LOCATION.tileX,
      targetY: CRAFTING_STATION_LOCATION.tileY,
      targetLabel: 'Crafting Station',
      requirements,
      autoCloseOnShop: false,
      autoCloseOnCraft: false,
      dismissWhenHasItem: 'rod_basic',
    };
  }

  // Camera presentation & gesture state (zero per-frame allocations)
  private camTargetZoom = 1.125;
  private hasManualZoom = false;
  private camFollowX = 0;
  private camFollowY = 0;
  private isPinching = false;
  private pinchStartDist = 0;
  private pinchStartZoom = 1.0;
  private pinchCooldownUntil = 0;

  // Movement sync & ambient animation trackers
  private netPositionAccumMs = 0;
  private wasMovingLastFrame = false;
  private playerAnimCycle = 0;
  private playerLastStep = 0;
  private playerSettleMs = 0;
  private animatedWaterProps: Array<{
    sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
    kind: 'shimmer' | 'reflection' | 'lily' | 'reed';
    baseY: number;
    phase: number;
    speed: number;
  }> = [];

  // Floating notifications
  private floatingTexts: Phaser.GameObjects.Text[] = [];

  // Phase 2: Fishing timing state, swimming fish, and fishing graphics
  public fishingState: {
    node: ResourceNode;
    phase: 'waiting' | 'bite';
    elapsedMs: number;
    waitDurationMs: number;
    biteDurationMs: number;
    cursorPos: number;
    cursorDir: 1 | -1;
    sweetMin: number;
    sweetMax: number;
  } | null = null;
  private fishingGraphics!: Phaser.GameObjects.Graphics;
  private remoteFishingGraphics!: Phaser.GameObjects.Graphics;
  private fishingHudLastEmit = 0;
  private animatedFish: Array<{
    sprite: Phaser.GameObjects.Sprite;
    tileX: number;
    tileY: number;
    vx: number;
    vy: number;
    phase: number;
  }> = [];

  // Interaction prompt callback to React UI
  public onInteractionChange?: (prompt: { type: string; title: string; subtitle: string; actionKey: string; targetId?: string } | null) => void;
  public onTileHover?: (tileX: number, tileY: number, zoneName: string) => void;
  public onPlayerMove?: (tileX: number, tileY: number, zoneName: string) => void;
  public onZoneEntered?: (zone: ZoneDefinition) => void;
  public onFishingStateChange?: (state: FishingHudState | null) => void;
  public onAtmosphereChange?: (snapshot: AtmosphereSnapshot) => void;
  public onMerchantGuideChange?: (guide: MerchantGuideInfo | null) => void;
  public onOpenUIModal?: (modal: 'inventory' | 'crafting' | 'shop' | 'clothing_shop' | 'building' | 'map' | 'storage', data?: any) => void;
  public onStateChanged?: () => void;
  public onResourceGathered?: () => void;
  public onBuildingBuilt?: (isMove: boolean) => void;
  public onPlacementStatusChange?: (status: {
    active: boolean;
    buildingType: BuildingType | null;
    isMoving: boolean;
    tileX: number;
    tileY: number;
    rotation: FenceRotation;
    valid: boolean;
    reason?: string;
  }) => void;
  public onSelectPlacedBuilding?: (building: PlacedBuilding) => void;
  public isSceneReady = false;
  public onSceneReady?: () => void;

  /**
   * Future layered appearance slot registry (shoes -> pants -> tshirt -> suit -> hat -> accessory)
   * reserved for post-Step 17 clothing rendering above base player_male/player_female sprites.
   * Currently empty and inactive; existing player appearance remains unchanged.
   */
  protected playerClothingLayerSlots: Partial<Record<ClothingEquipmentSlot, Phaser.GameObjects.Sprite | null>> = {};

  private merchantGuideUntil = 0;
  private merchantGuideTitle = '';
  private merchantGuideSubtitle = '';
  private merchantGuideKind: 'merchant' | 'crafting' | 'fishing' | 'action' = 'merchant';
  private merchantGuideBadgeIcon = '🏪';
  private merchantGuideTargetX = MERCHANT_LOCATION.tileX;
  private merchantGuideTargetY = MERCHANT_LOCATION.tileY;
  private merchantGuideTargetLabel = MERCHANT_LOCATION.name;
  private merchantGuideRequirements: GuidanceRequirementItem[] | undefined = undefined;
  private merchantGuideAutoCloseOnShop = true;
  private merchantGuideAutoCloseOnCraft = false;
  private merchantGuideDismissItemId: ItemId | null = null;
  private guidanceCooldowns: Map<string, number> = new Map();
  private lastMerchantGuideKey = '';

  // Near town station flags
  public isNearShop = false;
  public isNearClothingShop = false;
  public isNearCraftStation = false;
  public isNearCampfire = false;
  public nearbyStorageChest: PlacedBuilding | null = null;
  public nearbyPlacedBuilding: PlacedBuilding | null = null;
  public nearbyVillageNpc: { role: string; title: string; subtitle: string; message: string } | null = null;
  public nearbySignpost: ZoneSignpostDef | null = null;

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
    atmosphereSystem?: WorldAtmosphereSystem;
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
    if (data.atmosphereSystem) this.atmosphereSystem = data.atmosphereSystem;
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
    atmosphereSystem?: WorldAtmosphereSystem;
    playerProfile?: PlayerProfile;
    initialPosition?: { tileX: number; tileY: number };
  }): void {
    this.isSceneReady = false;
    this.tileSprites.clear();
    this.groundChunks = [];
    this.bridgeApproachLookup.clear();
    this.resourceSprites.clear();
    this.resourceShadows.clear();
    this.buildingSprites.clear();
    this.townBuildingSprites = [];
    this.tallLandmarkSprites = [];
    this.remotePlayerSprites.clear();
    this.remotePlayerShadows.clear();
    this.townNpcs = [];
    this.townLights = [];
    this.placedBuildingLights.clear();
    this.animatedWaterProps = [];
    this.swayingFlora = [];
    this.interactiveTreesAndBushes = [];
    this.lastReportedTileX = -999;
    this.lastReportedTileY = -999;
    this.lastReportedZone = '';
    this.lastEmittedTargetId = null;
    this.smoothMoveX = 0;
    this.smoothMoveY = 0;
    this.isGathering = false;
    this.currentGatheringNode = null;
    this.gatherActionTool = null;
    this.gatherStrikeCount = 0;
    this.isNearShop = false;
    this.isNearClothingShop = false;
    this.playerClothingLayerSlots = {};
    this.guidanceCooldowns.clear();

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

    // 2. Render 120x120 isometric ground tiles (baked into viewport-culled 10x10 chunks), narrow bridges, water shimmer & roadside nature
    this.createIsometricGround();

    // 2B. Dynamic animated fish swimming inside lakes & rivers
    this.createAnimatedFish();

    // 3. Render town landmarks & zone entrance signposts
    this.createTownLandmarks();

    // 3B. Step 7: Clustered zone composition & shoreline biome accents (deterministic, zero collision change)
    this.renderStep7ZoneComposition();

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

    // 10B. Step 5 World Atmosphere, Dynamic Lighting & Weather Pools
    this.createAtmosphereAndWeather();

    // 10C. Step 6 Environmental Details, Pass-by Interactions & Ambient Wildlife Pools
    this.createStep6EnvironmentAndWildlife();

    // Periodic check for resource respawns & ambient lifecycle
    this.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => {
        const blockedTiles = this.getBuildingBlockedTileSet();
        const playerPositions =
          this.networkSystem.status !== 'connected'
            ? [{ x: this.playerTileX, y: this.playerTileY }]
            : undefined;
        this.resourceSystem.updateRespawns(this.mapSystem, { blockedTiles, playerPositions });
        this.renderResourceNodes();
      },
    });

    // Listen for building system updates
    this.buildingSystem.onUpdate = () => {
      this.renderPlacedBuildings();
    };

    // 11. Realtime Multiplayer Sync Listeners (includes cached initial room_state if already received)
    this.setupNetworkListeners();

    // 12. Ensure initial visible chunks & spawn HUD state are emitted cleanly once
    this.updateVisibleGroundChunks(true);
    const startIntX = Math.round(this.playerTileX);
    const startIntY = Math.round(this.playerTileY);
    const startZone = this.mapSystem.getZoneAt(startIntX, startIntY);
    this.lastReportedTileX = startIntX;
    this.lastReportedTileY = startIntY;
    this.lastReportedZone = startZone.name;
    this.onPlayerMove?.(startIntX, startIntY, startZone.name);

    this.isSceneReady = true;
    this.onSceneReady?.();
  }

  private playerShadow!: Phaser.GameObjects.Image;
  private remotePlayerShadows: Map<string, Phaser.GameObjects.Image> = new Map();

  // Step 5: Atmosphere Overlay, Dynamic Lights & Rain Pools
  private atmosphereOverlay: Phaser.GameObjects.Rectangle | null = null;
  private currentAtmosphereSnapshot: AtmosphereSnapshot | null = null;
  private lastAtmosphereHudKey = '';
  private townLights: Array<{
    sprite: Phaser.GameObjects.Image;
    baseAlpha: number;
    baseScale: number;
    flicker: boolean;
    alwaysWarmMin: number;
    phase: number;
    parentBuilding?: Phaser.GameObjects.Sprite;
  }> = [];
  private placedBuildingLights: Map<
    string,
    Array<{
      sprite: Phaser.GameObjects.Image;
      baseAlpha: number;
      baseScale: number;
      flicker: boolean;
      alwaysWarmMin: number;
      phase: number;
      parentBuilding?: Phaser.GameObjects.Sprite;
    }>
  > = new Map();
  private rainDropPool: Array<{
    sprite: Phaser.GameObjects.Image;
    rx: number;
    ry: number;
    speedMul: number;
    baseAlpha: number;
  }> = [];
  private rainSplashPool: Array<{
    sprite: Phaser.GameObjects.Image;
    active: boolean;
    age: number;
    life: number;
    maxScale: number;
  }> = [];
  private rainSplashSpawnAccum = 0;

  // Step 6: Camera-Culled Flora Sway, Interactive Trees/Bushes & Pooled Wildlife
  private swayingFlora: Array<{
    sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
    wx: number;
    wy: number;
    tileX: number;
    tileY: number;
    phase: number;
    amp: number;
    pushEnergy: number;
    pushDir: number;
  }> = [];
  private interactiveTreesAndBushes: Array<{
    sprite: Phaser.GameObjects.Sprite;
    wx: number;
    wy: number;
    tileX: number;
    tileY: number;
    isTree: boolean;
    isBlossom: boolean;
    baseScale: number;
    phase: number;
    rustleEnergy: number;
    rustleCooldownUntil: number;
  }> = [];
  private wildlifePool: Array<{
    sprite: Phaser.GameObjects.Image;
    kind: WildlifeKind;
    active: boolean;
    wx: number;
    wy: number;
    vx: number;
    vy: number;
    phase: number;
    age: number;
    life: number;
  }> = [];
  private flutterLeafPool: Array<{
    sprite: Phaser.GameObjects.Image;
    active: boolean;
    vx: number;
    vy: number;
    age: number;
    life: number;
    phase: number;
  }> = [];
  private shoreRipplePool: Array<{
    sprite: Phaser.GameObjects.Image;
    active: boolean;
    age: number;
    life: number;
  }> = [];
  private lastFoliageSoundTime = 0;
  private nextShoreRippleTime = 0;
  private ambientAudioAccumMs = 0;
  private ambientAudioIntervalMs = 6500;

  private getTerrainVariantKey(tileType: TileType, tx: number, ty: number): string {
    if (tileType === 'grass') {
      return getGrassVariantKey(tx, ty);
    }
    if (tileType === 'dirt') {
      const roadTier = this.mapSystem.getRoadTier(tx, ty);
      if (roadTier === 'main' || roadTier === 'trail') {
        // Render seamless meadow turf underneath curved Bezier road overlays
        return getGrassVariantKey(tx, ty);
      }
      return hash2D(tx, ty, 13) % 3 === 0 ? 'tile_dirt_1' : 'tile_dirt_0';
    }
    if (tileType === 'water' || tileType === 'bridge') {
      return getWaterVariantKey(tx, ty, this.mapSystem);
    }
    if (tileType === 'sand') {
      return getSandVariantKey(tx, ty);
    }
    if (tileType === 'cobble') {
      return getCobbleVariantKey(tx, ty);
    }
    if (tileType === 'cliff') {
      return getCliffVariantKey(tx, ty);
    }
    if (tileType === 'farmland') {
      return 'tile_farmland';
    }
    return `tile_${tileType}`;
  }

  private bakeGroundChunk(chunk: {
    cx: number;
    cy: number;
    tx0: number;
    ty0: number;
    worldX: number;
    worldY: number;
    texKey: string;
    baked: boolean;
    image: Phaser.GameObjects.Image | null;
  }): void {
    if (chunk.baked) return;
    chunk.baked = true;

    const size = WorldScene.GROUND_CHUNK_SIZE;
    if (!this.textures.exists(chunk.texKey)) {
      const canvas = document.createElement('canvas');
      canvas.width = WorldScene.GROUND_CHUNK_W;
      canvas.height = WorldScene.GROUND_CHUNK_H;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        const drawTileTex = (key: string, px: number, py: number) => {
          const tex = this.textures.get(key);
          const src = tex?.getSourceImage() as CanvasImageSource | undefined;
          if (src) {
            ctx.drawImage(src, px, py);
          }
        };

        const endLy = Math.min(size, this.mapSystem.height - chunk.ty0);
        const endLx = Math.min(size, this.mapSystem.width - chunk.tx0);

        for (let ly = 0; ly < endLy; ly++) {
          const ty = chunk.ty0 + ly;
          for (let lx = 0; lx < endLx; lx++) {
            const tx = chunk.tx0 + lx;
            const px = 288 + (lx - ly) * 32;
            const py = (lx + ly) * 16;

            const tileType = this.mapSystem.tiles[ty][tx];
            const textureKey = this.getTerrainVariantKey(tileType, tx, ty);
            drawTileTex(textureKey, px, py);

            if (tileType === 'dirt') {
              const roadTier = this.mapSystem.getRoadTier(tx, ty);
              if (roadTier === 'main' || roadTier === 'trail') {
                const mask = getRoadConnectionMask(this.mapSystem, tx, ty);
                drawTileTex(`tile_road_${roadTier}_m${mask}`, px, py);

                const speckHash = hash2D(tx, ty, 97);
                if ((speckHash & 3) === 0) {
                  drawTileTex(`fx_road_specks_${speckHash % 4}`, px, py);
                }

                if (
                  tx >= BUILDABLE_ZONE_BOUNDS.minX &&
                  tx <= BUILDABLE_ZONE_BOUNDS.maxX &&
                  ty >= BUILDABLE_ZONE_BOUNDS.minY &&
                  ty <= BUILDABLE_ZONE_BOUNDS.maxY &&
                  (tx === 42 || tx === 56 || tx === 70 || tx === 84 || tx === 98) &&
                  (ty === 42 || ty === 56 || ty === 70 || ty === 84 || ty === 98)
                ) {
                  drawTileTex('fx_homestead_corner', px, py);
                }
              }
            }

            const transitions = getTileTransitionOverlays(this.mapSystem, tx, ty);
            for (const tr of transitions) {
              drawTileTex(tr.key, px, py);
            }

            const approaches = this.bridgeApproachLookup.get(`${tx}_${ty}`);
            if (approaches) {
              for (const apKey of approaches) {
                drawTileTex(apKey, px, py);
              }
            }
          }
        }
      }

      this.textures.addCanvas(chunk.texKey, canvas);
    }

    const img = this.add.image(chunk.worldX, chunk.worldY, chunk.texKey);
    img.setOrigin(0, 0);
    img.setDepth(-10);
    chunk.image = img;
  }

  private updateVisibleGroundChunks(allowUnlimitedBake = false): void {
    if (this.groundChunks.length === 0) return;

    const cam = this.cameras?.main;
    let viewMinX: number;
    let viewMaxX: number;
    let viewMinY: number;
    let viewMaxY: number;
    const pad = 260;

    if (cam && cam.worldView.width > 0 && cam.worldView.height > 0) {
      viewMinX = cam.worldView.x - pad;
      viewMaxX = cam.worldView.right + pad;
      viewMinY = cam.worldView.y - pad;
      viewMaxY = cam.worldView.bottom + pad;
    } else {
      const z = cam?.zoom && cam.zoom > 0 ? cam.zoom : this.camTargetZoom || 1;
      const halfW = (this.scale.width || 1280) / (2 * z) + pad;
      const halfH = (this.scale.height || 720) / (2 * z) + pad;
      const target = this.getDesiredCameraTarget(z);
      viewMinX = target.x - halfW;
      viewMaxX = target.x + halfW;
      viewMinY = target.y - halfH;
      viewMaxY = target.y + halfH;
    }

    let bakesRemaining = allowUnlimitedBake ? 999 : 2;
    for (const chunk of this.groundChunks) {
      const visible =
        chunk.worldX + WorldScene.GROUND_CHUNK_W >= viewMinX &&
        chunk.worldX <= viewMaxX &&
        chunk.worldY + WorldScene.GROUND_CHUNK_H >= viewMinY &&
        chunk.worldY <= viewMaxY;

      if (visible) {
        if (!chunk.baked && bakesRemaining > 0) {
          this.bakeGroundChunk(chunk);
          bakesRemaining--;
        }
        if (chunk.image && !chunk.image.visible) {
          chunk.image.setVisible(true);
        }
      } else if (chunk.image && chunk.image.visible) {
        chunk.image.setVisible(false);
      }
    }
  }

  private createIsometricGround(): void {
    this.animatedWaterProps = [];
    this.swayingFlora = [];
    this.groundChunks = [];
    this.bridgeApproachLookup.clear();

    // Pre-index timber bridge approach threshold ramps so they bake directly into ground chunks
    for (const ap of WorldComposition.getBridgeApproachOverlays(this.mapSystem)) {
      const k = `${ap.tx}_${ap.ty}`;
      const arr = this.bridgeApproachLookup.get(k);
      if (arr) arr.push(ap.key);
      else this.bridgeApproachLookup.set(k, [ap.key]);
    }

    // 0. Partition 120x120 terrain/roads/transitions into 10x10 isometric chunks (144 chunks total),
    // baking ONLY chunks near initial camera/player spawn synchronously so startup completes in milliseconds.
    const chunkSize = WorldScene.GROUND_CHUNK_SIZE;
    const chunksX = Math.ceil(this.mapSystem.width / chunkSize);
    const chunksY = Math.ceil(this.mapSystem.height / chunkSize);
    const spawnCx = Math.floor(Math.max(0, Math.min(this.mapSystem.width - 1, this.playerTileX)) / chunkSize);
    const spawnCy = Math.floor(Math.max(0, Math.min(this.mapSystem.height - 1, this.playerTileY)) / chunkSize);

    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        const tx0 = cx * chunkSize;
        const ty0 = cy * chunkSize;
        const anchor = MapSystem.tileToWorld(tx0, ty0);
        const chunk = {
          cx,
          cy,
          tx0,
          ty0,
          worldX: anchor.x - 320,
          worldY: anchor.y,
          texKey: `ground_chunk_${cx}_${cy}`,
          baked: false,
          image: null as Phaser.GameObjects.Image | null,
        };
        this.groundChunks.push(chunk);
        if (Math.abs(cx - spawnCx) <= 2 && Math.abs(cy - spawnCy) <= 2) {
          this.bakeGroundChunk(chunk);
        }
      }
    }

    const resourceCoordSet = new Set(this.resourceSystem.nodes.map((n) => `${n.tileX}_${n.tileY}`));

    for (let ty = 0; ty < this.mapSystem.height; ty++) {
      for (let tx = 0; tx < this.mapSystem.width; tx++) {
        const tileType = this.mapSystem.tiles[ty][tx];
        const { x, y } = MapSystem.tileToWorld(tx, ty);

        // 0C. Elevated Wooden Bridge & Scenic Pier Decks (sorted cleanly below player shadows & above water effects)
        if (tileType === 'bridge') {
          const style = this.mapSystem.getBridgeStyle(tx, ty);
          const { openMask, frontRailMask, isAbutmentEnd } = WorldComposition.getBridgeMaskInfo(
            this.mapSystem,
            tx,
            ty
          );
          const deck = this.add.sprite(x, y + 16, `obj_bridge_deck_${style}_m${openMask}`);
          deck.setOrigin(0.5, 32 / 52);
          deck.setDepth(-2 + (tx + ty) * 0.001);

          if (frontRailMask !== 0) {
            const railKey = `obj_bridge_rail_${style}_m${openMask}`;
            if (this.textures.exists(railKey)) {
              const rail = this.add.sprite(x, y + 16, railKey);
              rail.setOrigin(0.5, 32 / 52);
              rail.setDepth((tx + ty + 0.45) * 100 + 55);
            }
          }

          // Subtle warm abutment lantern glow at main bridge entrances for dusk/night ambiance
          if (style === 'main' && isAbutmentEnd && (tx + ty) % 2 === 0) {
            const abutmentGlow = this.add
              .image(x, y - 4, 'fx_glow_warm')
              .setOrigin(0.5)
              .setDepth(24512)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setScale(0.76)
              .setAlpha(0);
            this.townLights.push({
              sprite: abutmentGlow,
              baseAlpha: 0.48,
              baseScale: 0.76,
              flicker: true,
              alwaysWarmMin: 0,
              phase: tx * 0.61 + ty * 0.89,
            });
          }
        }

        // 1. Towering Mountain Silhouettes, Cliff Boulders & Foothill Shadows
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

          if (
            this.mapSystem.isTileInBounds(tx, ty + 1) &&
            this.mapSystem.tiles[ty + 1][tx] !== 'cliff' &&
            this.mapSystem.tiles[ty + 1][tx] !== 'water'
          ) {
            this.add
              .image(x + 4, y + 26, 'shadow_round')
              .setOrigin(0.5, 0.5)
              .setDepth((tx + ty) * 100 + 22)
              .setAlpha(0.32)
              .setScale(1.32, 0.64);
          }
        }

        // 2. Water Flora & Lightweight Animated Shimmer Ripples (surface layer sits cleanly below bridges/piers)
        if (tileType === 'water') {
          if (
            (tx === 84 && ty === 21) ||
            (tx === 88 && ty === 24) ||
            (tx === 16 && ty === 64) ||
            (tx === 22 && ty === 66) ||
            (tx === 16 && ty === 14)
          ) {
            const lily = this.add.sprite(x, y + 14, 'obj_lilypad');
            lily.setOrigin(0.5, 0.6);
            lily.setDepth(-5);
            this.animatedWaterProps.push({
              sprite: lily,
              kind: 'lily',
              baseY: y + 14,
              phase: (tx * 0.7 + ty * 1.1) % (Math.PI * 2),
              speed: 0.0024,
            });
          } else if (
            (tx === 80 && ty === 20) ||
            (tx === 92 && ty === 22) ||
            (tx === 12 && ty === 60) ||
            (tx === 24 && ty === 70) ||
            (tx === 86 && ty === 67) ||
            (tx === 66 && ty === 79)
          ) {
            const reed = this.add.sprite(x, y + 16, 'obj_water_reed');
            reed.setOrigin(0.5, 0.88);
            reed.setDepth((tx + ty) * 100 + 35);
            this.animatedWaterProps.push({
              sprite: reed,
              kind: 'reed',
              baseY: y + 16,
              phase: (tx * 0.9 + ty * 0.5) % (Math.PI * 2),
              speed: 0.0028,
            });
          } else if ((tx === 86 && ty === 20) || (tx === 20 && ty === 58) || (tx === 70 && ty === 76) || (tx === 52 && ty === 92)) {
            const stone = this.add.sprite(x, y + 16, 'obj_river_stone');
            stone.setOrigin(0.5, 0.7);
            stone.setDepth(-6);
          } else if ((tx * 31 + ty * 17) % 19 === 0) {
            const shimmer = this.add.image(x, y + 16, 'fx_water_shimmer');
            shimmer.setOrigin(0.5, 0.5);
            shimmer.setDepth(-7);
            this.animatedWaterProps.push({
              sprite: shimmer,
              kind: 'shimmer',
              baseY: y + 16,
              phase: ((tx * 13 + ty * 7) % 12) * 0.52,
              speed: 0.0024 + ((tx + ty) % 4) * 0.00025,
            });
          } else if ((tx * 23 + ty * 41) % 29 === 0) {
            const reflection = this.add.image(x, y + 16, 'fx_water_reflection');
            reflection.setOrigin(0.5, 0.5);
            reflection.setDepth(-8);
            reflection.setAlpha(0.32);
            this.animatedWaterProps.push({
              sprite: reflection,
              kind: 'reflection',
              baseY: y + 16,
              phase: ((tx * 11 + ty * 19) % 14) * 0.45,
              speed: 0.0018 + ((tx + ty) % 3) * 0.0002,
            });
          }
        }

        // 2B. Biome-Aware Natural Ground Details (never placed inside Town Plaza, Homestead lots, or Harvestable Resource tiles)
        if (tileType === 'grass' && !this.mapSystem.collisionMap[ty][tx] && !resourceCoordSet.has(`${tx}_${ty}`)) {
          const inTown =
            tx >= TOWN_PROTECTED_BOUNDS.minX &&
            tx <= TOWN_PROTECTED_BOUNDS.maxX &&
            ty >= TOWN_PROTECTED_BOUNDS.minY &&
            ty <= TOWN_PROTECTED_BOUNDS.maxY;
          const inHomesteadLots =
            tx >= BUILDABLE_ZONE_BOUNDS.minX &&
            tx <= BUILDABLE_ZONE_BOUNDS.maxX &&
            ty >= BUILDABLE_ZONE_BOUNDS.minY &&
            ty <= BUILDABLE_ZONE_BOUNDS.maxY;

          if (!inTown && !inHomesteadLots) {
            const nearSign = ZONE_SIGNPOSTS.some((s) => Math.hypot(s.tileX - tx, s.tileY - ty) <= 1.8);
            if (!nearSign) {
              const decor = getNatureDecorForTile(this.mapSystem, tx, ty);
              if (decor) {
                const flora = this.add.image(x, y + 16, decor.key);
                flora.setOrigin(0.5, 0.78);
                flora.setDepth((tx + ty) * 100 + 24);
                flora.setFlipX(decor.flipX);
                flora.setAlpha(decor.alpha);
                if (
                  decor.key === 'obj_wildflower_clump' ||
                  decor.key === 'obj_flower_meadow' ||
                  decor.key === 'obj_fern_tuft' ||
                  decor.key === 'obj_cliff_shrub'
                ) {
                  this.swayingFlora.push({
                    sprite: flora,
                    wx: x,
                    wy: y + 16,
                    tileX: tx,
                    tileY: ty,
                    phase: (tx * 0.65 + ty * 0.45) % (Math.PI * 2),
                    amp: decor.key === 'obj_fern_tuft' ? 0.048 : 0.036,
                    pushEnergy: 0,
                    pushDir: 1,
                  });
                }
              }
            }
          }
        }
      }
    }

    // 3. Clean Future-Ready Rectangular Farm Plot Borders & Corner Wooden Stakes
    const farmBorderGfx = this.add.graphics();
    farmBorderGfx.setDepth(245);
    for (const plot of FARM_PLOTS) {
      const { minX, minY, maxX, maxY } = plot.bounds;
      const nRaw = MapSystem.tileToWorld(minX - 0.5, minY - 0.5);
      const eRaw = MapSystem.tileToWorld(maxX + 0.5, minY - 0.5);
      const sRaw = MapSystem.tileToWorld(maxX + 0.5, maxY + 0.5);
      const wRaw = MapSystem.tileToWorld(minX - 0.5, maxY + 0.5);

      const n = { x: nRaw.x, y: nRaw.y + 16 };
      const e = { x: eRaw.x, y: eRaw.y + 16 };
      const s = { x: sRaw.x, y: sRaw.y + 16 };
      const w = { x: wRaw.x, y: wRaw.y + 16 };

      farmBorderGfx.lineStyle(2, 0x5c3a21, 0.72);
      farmBorderGfx.beginPath();
      farmBorderGfx.moveTo(n.x, n.y);
      farmBorderGfx.lineTo(e.x, e.y);
      farmBorderGfx.lineTo(s.x, s.y);
      farmBorderGfx.lineTo(w.x, w.y);
      farmBorderGfx.closePath();
      farmBorderGfx.strokePath();

      for (const corner of [n, e, s, w]) {
        farmBorderGfx.fillStyle(0x451a03, 0.9);
        farmBorderGfx.fillRect(corner.x - 2, corner.y - 6, 4, 7);
        farmBorderGfx.fillStyle(0xb45309, 0.95);
        farmBorderGfx.fillRect(corner.x - 1.5, corner.y - 7, 3, 2);
      }
    }
  }

  private createAnimatedFish(): void {
    this.animatedFish = [];
    const preferredSeeds: Array<[number, number, number, number]> = [
      // Mirror Lake
      [14, 58, 0.32, 0.14],
      [18, 63, -0.26, 0.22],
      [23, 60, 0.28, -0.18],
      [27, 65, -0.34, -0.12],
      [19, 68, 0.30, 0.10],
      [13, 64, 0.22, -0.24],
      [24, 55, -0.25, 0.20],
      // Emerald Glade Lake (East Forest)
      [82, 20, 0.28, 0.14],
      [88, 22, -0.30, 0.15],
      [85, 25, 0.24, -0.16],
      [91, 20, -0.22, -0.18],
      // Highland Mountain Spring Lake (Northwest)
      [15, 13, 0.26, 0.12],
      [19, 15, -0.28, 0.14],
      [21, 12, 0.20, -0.18],
      // Silverbrook River
      [104, 58, -0.22, 0.22],
      [90, 65, -0.24, 0.20],
      [74, 75, -0.22, 0.24],
      [56, 88, -0.20, 0.24],
    ];

    for (let i = 0; i < preferredSeeds.length; i++) {
      const [sx, sy, vx, vy] = preferredSeeds[i];
      let waterTile: { tx: number; ty: number } | null = null;
      if (this.mapSystem.isTileInBounds(sx, sy) && this.mapSystem.tiles[sy][sx] === 'water') {
        waterTile = { tx: sx, ty: sy };
      } else {
        for (let r = 1; r <= 4 && !waterTile; r++) {
          for (let dy = -r; dy <= r && !waterTile; dy++) {
            for (let dx = -r; dx <= r && !waterTile; dx++) {
              const cx = sx + dx;
              const cy = sy + dy;
              if (this.mapSystem.isTileInBounds(cx, cy) && this.mapSystem.tiles[cy][cx] === 'water') {
                waterTile = { tx: cx, ty: cy };
              }
            }
          }
        }
      }
      if (!waterTile) continue;

      const { x, y } = MapSystem.tileToWorld(waterTile.tx, waterTile.ty);
      const texKey = vx - vy >= 0 ? 'obj_swim_fish_r' : 'obj_swim_fish_l';
      const sprite = this.add.sprite(x, y + 16, texKey);
      sprite.setOrigin(0.5, 0.5);
      sprite.setDepth(-4);
      sprite.setAlpha(0.88);
      this.animatedFish.push({
        sprite,
        tileX: waterTile.tx,
        tileY: waterTile.ty,
        vx,
        vy,
        phase: i * 0.9,
      });
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

  private getBuildingVisualConfig(type: BuildingType, rotation: FenceRotation = 0): { tex: string; originY: number } {
    switch (type) {
      case 'house_small':
        return { tex: 'obj_house_small', originY: 132 / 176 };
      case 'house_medium':
        return { tex: 'obj_house_medium', originY: 158 / 212 };
      case 'house_large':
        return { tex: 'obj_house_large', originY: 178 / 242 };
      case 'fence_wood': {
        const rot = BuildingSystem.normalizeRotation(rotation);
        return { tex: `obj_fence_wood_${rot}`, originY: 38 / 56 };
      }
      case 'campfire':
        return { tex: 'obj_campfire', originY: 0.75 };
      case 'storage_box':
        return { tex: 'obj_storage_box', originY: 0.8 };
      case 'lantern':
        return { tex: 'obj_lantern', originY: 0.9 };
      case 'decor_bench':
        return { tex: 'obj_bench', originY: 0.83 };
      case 'decor_flower_pot':
        return { tex: 'obj_flower_pot', originY: 0.85 };
      case 'decor_flowerbed':
        return { tex: 'obj_town_flowerbed', originY: 0.65 };
      case 'decor_flower_stand':
        return { tex: 'obj_flower_stand', originY: 0.84 };
      default:
        return { tex: 'obj_house_small', originY: 132 / 176 };
    }
  }

  private createTownLandmarks(): void {
    this.townNpcs = [];
    this.townBuildingSprites = [];
    this.tallLandmarkSprites = [];
    for (const light of this.townLights) {
      light.sprite.destroy();
    }
    this.townLights = [];

    const addTownBuildingGlow = (
      x: number,
      y: number,
      buildingDepth: number,
      kind: 'house_bakery' | 'house_general' | 'house_grocery' | 'house_blacksmith' | 'house_florist' | 'house_clothing' | 'town_house',
      parentBuilding: Phaser.GameObjects.Sprite
    ) => {
      const anchors = getBuildingLightAnchors(kind);
      for (let i = 0; i < anchors.windows.length; i++) {
        const w = anchors.windows[i];
        const isForgeHearth = kind === 'house_blacksmith' && i === anchors.windows.length - 1;
        const winSprite = this.add
          .image(x + w.dx, y + w.dy, isForgeHearth ? 'fx_glow_fire' : w.side === 'left' ? 'fx_window_glow_l' : 'fx_window_glow_r')
          .setOrigin(0.5)
          .setDepth(buildingDepth + 1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0);
        if (isForgeHearth) {
          winSprite.setScale(0.32);
        }
        this.townLights.push({
          sprite: winSprite,
          baseAlpha: isForgeHearth ? 0.9 : 0.88,
          baseScale: isForgeHearth ? 0.34 : 1.0,
          flicker: isForgeHearth,
          alwaysWarmMin: isForgeHearth ? 0.45 : 0,
          phase: x * 0.03 + i * 1.1,
          parentBuilding,
        });
      }
      const halo = this.add
        .image(x, y + anchors.haloOffsetY, 'fx_glow_warm')
        .setOrigin(0.5)
        .setDepth(24510)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(anchors.haloScale)
        .setAlpha(0);
      this.townLights.push({
        sprite: halo,
        baseAlpha: 0.34,
        baseScale: anchors.haloScale,
        flicker: false,
        alwaysWarmMin: 0,
        phase: x * 0.02,
      });
    };

    const placeTownBuilding = (
      tileX: number,
      tileY: number,
      width: number,
      height: number,
      tex: string,
      originY: number,
      label?: string,
      labelColor = '#fef08a',
      labelOffsetY = 120
    ) => {
      const { x, y, depth } = this.getFootprintWorldPos(tileX, tileY, width, height);
      const bld = this.add.sprite(x, y, tex);
      bld.setOrigin(0.5, originY);
      bld.setDepth(depth);
      this.townBuildingSprites.push(bld);
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          this.mapSystem.setCollision(tileX + dx, tileY + dy, true);
        }
      }
      if (tex === 'obj_house_bakery') addTownBuildingGlow(x, y, depth, 'house_bakery', bld);
      else if (tex === 'obj_house_general') addTownBuildingGlow(x, y, depth, 'house_general', bld);
      else if (tex === 'obj_house_grocery') addTownBuildingGlow(x, y, depth, 'house_grocery', bld);
      else if (tex === 'obj_house_blacksmith') addTownBuildingGlow(x, y, depth, 'house_blacksmith', bld);
      else if (tex === 'obj_house_florist') addTownBuildingGlow(x, y, depth, 'house_florist', bld);
      else if (tex === 'obj_house_aunty_gyi') addTownBuildingGlow(x, y, depth, 'house_clothing', bld);
      else if (tex === 'obj_town_house') addTownBuildingGlow(x, y, depth, 'town_house', bld);

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
      this.add.image(p.x + 1.5, p.y + 16.5, 'shadow_round').setOrigin(0.5, 0.5).setDepth(d + 20).setAlpha(0.22).setScale(shadowScale[0], shadowScale[1]);
      const prop = this.add.sprite(p.x, p.y + 16, tex);
      prop.setOrigin(0.5, originY);
      prop.setDepth(d + 35);
      this.mapSystem.setProtectedProp(tileX, tileY, true);
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
      const dirFrame = this.getDirectionRowOffset(defaultDir);

      const shadow = this.add.image(sx + 1.5, sy + 0.5, 'shadow_round').setOrigin(0.5, 0.5).setDepth(d + 21).setAlpha(0.46).setScale(0.92, 0.68);
      const npc = this.add.sprite(sx, sy, tex, dirFrame);
      npc.setOrigin(0.5, 0.90);
      npc.setScale(0.5);
      npc.setDepth(d + 52);

      // Keep NPCs physically solid so players cannot walk straight through villagers
      this.mapSystem.setProtectedProp(tileX, tileY, true);
      this.mapSystem.setCollision(tileX, tileY, true);

      const nameText = this.add.text(sx, sy - 44, label, {
        fontSize: '10px',
        color: labelColor,
        fontStyle: 'bold',
        backgroundColor: 'rgba(20, 18, 16, 0.88)',
        padding: { x: 5, y: 2 },
      }).setOrigin(0.5).setDepth(25048);

      const idx = this.townNpcs.length;
      this.townNpcs.push({
        sprite: npc,
        shadow,
        nameText,
        baseX: sx,
        baseY: sy,
        tileX,
        tileY,
        defaultDir,
        role,
        phase: (tileX * 1.3 + tileY * 0.7) % (Math.PI * 2),
        cyclePeriodMs: 4600 + idx * 670,
        offsetMs: idx * 1130,
      });
    };

    // === 1. CENTRAL VILLAGE PLAZA (Player spawns cleanly at 30, 30) ===
    const fountainPos = MapSystem.tileToWorld(30, 29);
    this.add
      .image(fountainPos.x, fountainPos.y + 16, 'fx_plaza_medallion')
      .setOrigin(0.5, 0.5)
      .setDepth(30 + 29 + 0.35);
    this.add.image(fountainPos.x + 1.5, fountainPos.y + 16.5, 'shadow_round').setOrigin(0.5, 0.5).setDepth(59 * 100 + 20).setAlpha(0.24).setScale(1.48, 1.08);
    const fountain = this.add.sprite(fountainPos.x, fountainPos.y + 16, 'obj_town_fountain');
    fountain.setOrigin(0.5, 56 / 72);
    fountain.setDepth(59 * 100 + 35);
    this.tallLandmarkSprites.push(fountain);
    this.mapSystem.setCollision(30, 29, true);
    this.add.text(fountainPos.x, fountainPos.y - 44, 'မြို့လယ်ရေပန်း (Town Fountain)', {
      fontSize: '10px',
      color: '#e0f2fe',
      fontStyle: 'bold',
      backgroundColor: 'rgba(15,23,42,0.86)',
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setDepth(59 * 100 + 40);

    // Town Fountain Plaza Night Soft Glow
    const plazaGlow = this.add
      .image(fountainPos.x, fountainPos.y - 6, 'fx_glow_plaza')
      .setOrigin(0.5)
      .setDepth(24510)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.38)
      .setAlpha(0);
    this.townLights.push({
      sprite: plazaGlow,
      baseAlpha: 0.58,
      baseScale: 1.38,
      flicker: false,
      alwaysWarmMin: 0,
      phase: 0.4,
    });

    // Street Lanterns framing the Central Plaza
    for (const [lx, ly] of [[28, 28], [32, 28], [28, 32], [32, 32]]) {
      placeTownProp(lx, ly, 'obj_lantern', 0.9, true, [0.75, 0.5]);
      const lp = MapSystem.tileToWorld(lx, ly);
      const lanternGlow = this.add
        .image(lp.x, lp.y - 8, 'fx_glow_warm')
        .setOrigin(0.5)
        .setDepth(24512)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1.05)
        .setAlpha(0);
      this.townLights.push({
        sprite: lanternGlow,
        baseAlpha: 0.72,
        baseScale: 1.05,
        flicker: true,
        alwaysWarmMin: 0,
        phase: lx * 0.7 + ly * 1.1,
      });
    }

    // Plaza Bench + Elder Arthur beside fountain
    placeTownProp(28, 29, 'obj_bench', 0.83, true, [1.1, 0.72]);
    spawnTownNpc(29, 29, 'npc_elder', 'အာသာ (ရွာလူကြီး)', '#a7f3d0', 'down', 'elder', -4, 0);

    // === 2. NORTH-WEST QUARTER: BAKERY HOUSE & GENERAL STORE ===
    // Bakery House (3x2 at 23..25, 22..23)
    placeTownBuilding(23, 22, 3, 2, 'obj_house_bakery', 158 / 212, 'မုန့်ဖိုအိမ် (Bakery House)', '#fed7aa', 126);
    placeTownProp(25, 24, 'obj_shelf_bakery', 0.86, true, [0.95, 0.65]);
    spawnTownNpc(24, 24, 'npc_baker', 'ကလာရာ (မုန့်ဖုတ်သမား)', '#fcd34d', 'down', 'baker', 0, 2);

    // General Store (3x2 at 22..24, 26..27)
    placeTownBuilding(22, 26, 3, 2, 'obj_house_general', 164 / 220, 'အထွေထွေကုန်စုံဆိုင် (General Store)', '#fef08a', 136);
    placeTownProp(25, 27, 'obj_crate_fruit', 0.83, true, [0.8, 0.55]);
    placeTownProp(22, 28, 'obj_barrel', 0.87, true, [0.75, 0.52]);
    spawnTownNpc(24, 28, 'npc_merchant', 'ဘားနဘီ (ကုန်သည်)', '#fef08a', 'down', 'merchant', 0, 2);

    // Aunty Gyi Clothing Boutique (2x2 at 27..28, 23..24) — Coming Soon Preparation
    placeTownBuilding(27, 23, 2, 2, 'obj_house_aunty_gyi', 132 / 176, '👗 Aunty Gyi Clothing', '#f9a8d4', 112);

    // === 3. NORTH-EAST QUARTER: BLACKSMITH SHOP & VILLAGE COTTAGE ===
    // Blacksmith Forge (3x2 at 33..35, 23..24)
    placeTownBuilding(33, 23, 3, 2, 'obj_house_blacksmith', 158 / 212, 'ပန်းပဲဖို (Blacksmith Forge)', '#fca5a5', 126);
    // Interactive Workbench & Anvil at (33, 25)
    placeTownProp(33, 25, 'obj_craft_bench', 0.80, true, [1.25, 0.82]);
    const wbPos = MapSystem.tileToWorld(33, 25);
    this.add.text(wbPos.x, wbPos.y - 36, 'လက်မှုလုပ်ငန်းခုံ (Workbench)', {
      fontSize: '10px',
      color: '#93c5fd',
      fontStyle: 'bold',
      backgroundColor: 'rgba(20,18,16,0.88)',
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setDepth((33 + 25) * 100 + 42);
    placeTownProp(35, 25, 'obj_rack_blacksmith', 0.86, true, [0.95, 0.65]);
    spawnTownNpc(34, 25, 'npc_blacksmith', 'ဒေါ်နယ် (ပန်းပဲဆရာ)', '#f87171', 'down', 'blacksmith', 0, 2);

    // Village Two-Story Residence (2x2 at 36..37, 26..27)
    placeTownBuilding(36, 26, 2, 2, 'obj_town_house', 146 / 192);
    placeTownProp(35, 27, 'obj_flower_pot', 0.85, true, [0.75, 0.52]);

    // === 4. SOUTH-WEST QUARTER: GROCERY SHOP & FLOWER SHOP ===
    // Fresh Grocery Shop (3x2 at 23..25, 33..34)
    placeTownBuilding(23, 33, 3, 2, 'obj_house_grocery', 158 / 212, 'ကုန်စိမ်းနှင့်သစ်သီးဆိုင် (Grocery)', '#86efac', 126);
    placeTownProp(23, 35, 'obj_shelf_grocery', 0.86, true, [0.95, 0.65]);
    placeTownProp(25, 35, 'obj_crate_fruit', 0.83, true, [0.8, 0.55]);
    spawnTownNpc(24, 35, 'npc_grocer', 'မာယာ (ကုန်စိမ်းသည်)', '#86efac', 'down', 'grocer', 0, 2);

    // Flower Shop (2x2 at 26..27, 35..36)
    placeTownBuilding(26, 35, 2, 2, 'obj_house_florist', 132 / 176, 'ပန်းဆိုင်လေး (Flower Shop)', '#f9a8d4', 112);
    placeTownProp(28, 35, 'obj_flower_stand', 0.84, true, [0.95, 0.65]);
    placeTownProp(26, 37, 'obj_flower_pot', 0.85, true, [0.75, 0.52]);
    spawnTownNpc(28, 36, 'npc_florist', 'ဒေစီ (ပန်းသည်မလေး)', '#f472b6', 'down', 'florist', 2, 0);

    // === 5. SOUTH-EAST QUARTER: OUTDOOR MARKET & POCKET PARK ===
    // Outdoor Market Stalls & Goods
    placeTownProp(33, 32, 'obj_bakery_stall', 0.86, true, [1.25, 0.82]);
    placeTownProp(36, 32, 'obj_shop_stall', 0.84, true, [1.35, 0.88]);
    placeTownProp(34, 34, 'obj_picnic_table', 0.81, true, [1.2, 0.78]);
    placeTownProp(36, 34, 'obj_crate_fruit', 0.83, true, [0.8, 0.55]);
    spawnTownNpc(35, 33, 'npc_settler', 'အာရီယာ (ဈေးသည်)', '#fdba74', 'down', 'settler', 0, 0);

    // Pocket Park (ပန်းခြံငယ်)
    placeTownProp(33, 37, 'obj_bench', 0.83, true, [1.1, 0.72]);
    placeTownProp(36, 37, 'obj_bench', 0.83, true, [1.1, 0.72]);
    placeTownProp(35, 37, 'obj_picnic_table', 0.81, true, [1.2, 0.78]);
    for (const [fx, fy] of [[32, 36], [37, 36], [34, 38]]) {
      placeTownProp(fx, fy, 'obj_flower_pot', 0.85, true, [0.75, 0.52]);
    }

    // === 6. VILLAGE ENTRANCE DIRECTIONAL SIGNPOSTS ===
    for (const [sx, sy] of [[32, 39], [21, 29], [39, 32]]) {
      placeTownProp(sx, sy, 'obj_signpost', 0.91, true, [0.75, 0.48]);
    }

    // === 6B. ZONE ENTRANCE PIXEL SIGNPOSTS (All 7 World Zones, visible to all multiplayer peers) ===
    for (const sign of ZONE_SIGNPOSTS) {
      const p = MapSystem.tileToWorld(sign.tileX, sign.tileY);
      placeTownProp(sign.tileX, sign.tileY, `obj_signpost_zone_${sign.facing}`, 0.89, true, [0.85, 0.52]);
      this.add
        .text(p.x, p.y - 40, sign.label, {
          fontSize: '10px',
          color: sign.color,
          fontStyle: 'bold',
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          padding: { x: 6, y: 2 },
          shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 2, fill: true },
        })
        .setOrigin(0.5)
        .setDepth(25046);
    }

    // === 7. HOMESTEAD AGRICULTURAL CENTER (South-East Farmland District) ===
    const wellPos = MapSystem.tileToWorld(49, 74);
    placeTownProp(49, 74, 'obj_water_well', 0.84, true, [1.2, 0.82]);
    this.add.text(wellPos.x, wellPos.y - 36, 'ရွာရေတွင်း (Stone Well)', {
      fontSize: '10px',
      color: '#7dd3fc',
      fontStyle: 'bold',
      backgroundColor: 'rgba(28,25,23,0.88)',
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setDepth((49 + 74) * 100 + 38);

    spawnTownNpc(50, 74, 'npc_farmer', 'သောမတ်စ် (လယ်သမားကြီး)', '#86efac', 'down', 'farmer', 4, 2);

    // === 8. STEP 7 & STEP 14: CURATED ZONE LANDMARK PROPS, FISHING PIERS & BRIDGE/PIER LOUNGES ===
    for (const spec of [...STEP7_LANDMARK_PROPS, ...STEP14_SCENIC_PROPS]) {
      const p = MapSystem.tileToWorld(spec.tx, spec.ty);
      const d = (spec.tx + spec.ty) * 100;
      this.add
        .image(p.x + 1.5, p.y + 16.5, 'shadow_round')
        .setOrigin(0.5, 0.5)
        .setDepth(d + 20)
        .setAlpha(spec.solid ? 0.22 : 0.16)
        .setScale(spec.shadowScale[0], spec.shadowScale[1]);

      const prop = this.add.sprite(p.x, p.y + 16, spec.tex);
      prop.setOrigin(0.5, spec.originY);
      prop.setDepth(d + (spec.solid ? 35 : 25));
      if (prop.height >= 64) {
        this.tallLandmarkSprites.push(prop);
      }

      if (spec.protectedProp) {
        this.mapSystem.setProtectedProp(spec.tx, spec.ty, true);
      }
      if (spec.solid) {
        this.mapSystem.setCollision(spec.tx, spec.ty, true);
      }

      if (spec.hasLanternGlow) {
        const lanternGlow = this.add
          .image(p.x, p.y + 16 + (spec.glowOffsetY ?? -24), 'fx_glow_warm')
          .setOrigin(0.5)
          .setDepth(24512)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(1.02)
          .setAlpha(0);
        this.townLights.push({
          sprite: lanternGlow,
          baseAlpha: 0.72,
          baseScale: 1.02,
          flicker: true,
          alwaysWarmMin: 0,
          phase: spec.tx * 0.7 + spec.ty * 1.1,
        });
      }
    }
  }

  private renderStep7ZoneComposition(): void {
    const occupiedNodeCoords = new Set(this.resourceSystem.nodes.map((n) => `${n.tileX}_${n.tileY}`));
    const placements = WorldComposition.generateZoneComposition(this.mapSystem, occupiedNodeCoords);

    for (const item of placements) {
      const { x, y } = MapSystem.tileToWorld(item.tx, item.ty);
      const img = this.add.image(x, y + 16, item.key);
      img.setOrigin(0.5, item.originY);
      const isWaterSurfaceProp = item.sway === 'lily' || item.key === 'obj_river_stone';
      img.setDepth(isWaterSurfaceProp ? (item.key === 'obj_river_stone' ? -6 : -5) : (item.tx + item.ty) * 100 + item.depthOffset);
      img.setFlipX(item.flipX);
      img.setAlpha(item.alpha);

      if (item.sway === 'flora') {
        this.swayingFlora.push({
          sprite: img,
          wx: x,
          wy: y + 16,
          tileX: item.tx,
          tileY: item.ty,
          phase: (item.tx * 0.61 + item.ty * 0.43) % (Math.PI * 2),
          amp: item.swayAmp ?? 0.036,
          pushEnergy: 0,
          pushDir: 1,
        });
      } else if (item.sway === 'lily' || item.sway === 'reed') {
        this.animatedWaterProps.push({
          sprite: img,
          kind: item.sway,
          baseY: y + 16,
          phase: (item.tx * 0.73 + item.ty * 0.59) % (Math.PI * 2),
          speed: item.sway === 'lily' ? 0.0023 : 0.0027,
        });
      }
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
        let treeScale = 1;
        let treeFlipX = false;

        let animalScale = 1;
        if (node.type === 'tree') {
          // 8-variant organic tree distribution across Alpine Pines, Emerald Glade Blossoms/Birches, and Woodland Oaks
          const treeHash = hash2D(node.tileX, node.tileY, 613);
          const pick = treeHash % 100;
          const isNorthernAlpine = node.tileY <= 16 || (node.tileX >= 55 && node.tileY <= 22);
          const isGladeZone = node.tileX >= 70 && node.tileX <= 104 && node.tileY >= 12 && node.tileY <= 34;

          if (isNorthernAlpine) {
            if (pick < 42) tex = 'obj_tree_pine';
            else if (pick < 78) tex = 'obj_tree_pine_1';
            else if (pick < 90) tex = 'obj_tree';
            else tex = 'obj_tree_oak_1';
          } else if (isGladeZone) {
            if (pick < 24) tex = 'obj_tree_blossom';
            else if (pick < 44) tex = 'obj_tree_blossom_1';
            else if (pick < 64) tex = 'obj_tree_birch';
            else if (pick < 80) tex = 'obj_tree_birch_1';
            else tex = 'obj_tree_oak_1';
          } else {
            if (pick < 20) tex = 'obj_tree';
            else if (pick < 38) tex = 'obj_tree_oak_1';
            else if (pick < 54) tex = 'obj_tree_birch';
            else if (pick < 68) tex = 'obj_tree_birch_1';
            else if (pick < 80) tex = 'obj_tree_pine';
            else if (pick < 89) tex = 'obj_tree_pine_1';
            else if (pick < 95) tex = 'obj_tree_blossom';
            else tex = 'obj_tree_blossom_1';
          }

          originY = 0.88;
          const treeScalePresets = [0.9, 0.96, 1.0, 1.06, 1.12];
          treeScale = treeScalePresets[treeHash % treeScalePresets.length];
          treeFlipX = ((treeHash >>> 3) & 1) === 1;
        } else if (node.type === 'rock') {
          tex = (node.tileX + node.tileY) % 4 === 0 ? 'obj_cliff_rock' : 'obj_rock';
          originY = 0.78;
        } else if (node.type === 'bush') {
          tex = node.spriteVariant === 'tall_grass' ? 'obj_harvest_grass' : 'obj_bush';
          originY = node.spriteVariant === 'tall_grass' ? 0.82 : 0.78;
        } else if (node.type === 'animal') {
          const kind: AnimalKind = node.animalKind || ((node.tileX + node.tileY) % 2 === 0 ? 'rabbit' : 'deer');
          const species = ANIMAL_SPECIES[kind];
          tex = species.textureKey;
          originY = species.originY;
          animalScale = species.scale;
        } else if (node.type === 'lake_fish') {
          tex = 'obj_lake_fish';
          originY = 0.5;
        }

        // Consistent top-left sun -> SE soft ambient contact shadow (subtle so baked sprite shadow never double-darkens)
        if (node.type !== 'lake_fish') {
          const sx = node.type === 'tree' ? x + 3 : node.type === 'rock' ? x + 2.5 : x + 2;
          const sy = node.type === 'tree' ? y + 17 : node.type === 'rock' ? y + 17 : y + 16.5;
          const shadow = this.add.image(sx, sy, 'shadow_round');
          shadow.setOrigin(0.5, 0.5);
          shadow.setDepth((node.tileX + node.tileY) * 100 + 20);
          if (node.type === 'tree') {
            shadow.setAlpha(0.18);
            shadow.setScale(1.38 * treeScale, 0.94 * treeScale);
          } else if (node.type === 'rock') {
            shadow.setAlpha(0.22);
            shadow.setScale(1.12, 0.82);
          } else if (tex === 'res_animal_rabbit') {
            shadow.setAlpha(0.18);
            shadow.setScale(0.68, 0.52);
          } else {
            shadow.setAlpha(0.20);
            shadow.setScale(0.88, 0.65);
          }
          this.resourceShadows.set(key, shadow);
        }

        sprite = this.add.sprite(x, y + 16, tex);
        sprite.setOrigin(0.5, originY);
        if (node.type === 'tree') {
          sprite.setScale(treeScale);
          sprite.setFlipX(treeFlipX);
        } else if (node.type === 'animal' && animalScale !== 1) {
          sprite.setScale(animalScale);
        }
        sprite.setDepth((node.tileX + node.tileY) * 100 + 50);
        this.resourceSprites.set(key, sprite);

        if (node.type === 'tree' || node.type === 'bush') {
          this.interactiveTreesAndBushes.push({
            sprite,
            wx: x,
            wy: y + 16,
            tileX: node.tileX,
            tileY: node.tileY,
            isTree: node.type === 'tree',
            isBlossom: tex.includes('blossom'),
            baseScale: node.type === 'tree' ? treeScale : 1,
            phase: (node.tileX * 0.52 + node.tileY * 0.78) % (Math.PI * 2),
            rustleEnergy: 0,
            rustleCooldownUntil: 0,
          });
        }

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
      const shadow = this.resourceShadows.get(key);
      if (isDepleted) {
        sprite.setVisible(false);
        shadow?.setVisible(false);
      } else {
        sprite.setVisible(true);
        shadow?.setVisible(true);
      }
    }
  }

  private getBuildingBlockedTileSet(): Set<string> {
    const blocked = new Set<string>();
    for (const b of this.buildingSystem.buildings) {
      const fp = BuildingSystem.getFootprint(b.type);
      const w = b.width || fp.width;
      const h = b.height || fp.height;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          blocked.add(`${b.tileX + dx}_${b.tileY + dy}`);
        }
      }
    }
    return blocked;
  }

  private destroyPlacedBuildingLights(id: string): void {
    const entries = this.placedBuildingLights.get(id);
    if (!entries) return;
    for (const entry of entries) {
      entry.sprite.destroy();
    }
    this.placedBuildingLights.delete(id);
  }

  private syncPlacedBuildingLights(
    b: PlacedBuilding,
    x: number,
    y: number,
    renderDepth: number,
    parentBuilding?: Phaser.GameObjects.Sprite
  ): void {
    this.destroyPlacedBuildingLights(b.id);
    const items: Array<{
      sprite: Phaser.GameObjects.Image;
      baseAlpha: number;
      baseScale: number;
      flicker: boolean;
      alwaysWarmMin: number;
      phase: number;
      parentBuilding?: Phaser.GameObjects.Sprite;
    }> = [];

    const phase = (b.tileX * 0.9 + b.tileY * 1.3) % (Math.PI * 2);

    if (b.type === 'lantern') {
      const glow = this.add
        .image(x, y - 24, 'fx_glow_warm')
        .setOrigin(0.5)
        .setDepth(24512)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1.05)
        .setAlpha(0);
      items.push({ sprite: glow, baseAlpha: 0.75, baseScale: 1.05, flicker: true, alwaysWarmMin: 0, phase });
    } else if (b.type === 'campfire') {
      const glow = this.add
        .image(x, y - 6, 'fx_glow_fire')
        .setOrigin(0.5)
        .setDepth(24512)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1.15)
        .setAlpha(0);
      items.push({ sprite: glow, baseAlpha: 0.85, baseScale: 1.15, flicker: true, alwaysWarmMin: 0.28, phase });
    } else if (b.type === 'house_small' || b.type === 'house_medium' || b.type === 'house_large') {
      const anchors = getBuildingLightAnchors(b.type);
      for (let i = 0; i < anchors.windows.length; i++) {
        const w = anchors.windows[i];
        const win = this.add
          .image(x + w.dx, y + w.dy, w.side === 'left' ? 'fx_window_glow_l' : 'fx_window_glow_r')
          .setOrigin(0.5)
          .setDepth(renderDepth + 1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0);
        items.push({
          sprite: win,
          baseAlpha: 0.9,
          baseScale: 1.0,
          flicker: false,
          alwaysWarmMin: 0,
          phase: phase + i,
          parentBuilding,
        });
      }
      const halo = this.add
        .image(x, y + anchors.haloOffsetY, 'fx_glow_warm')
        .setOrigin(0.5)
        .setDepth(24510)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(anchors.haloScale)
        .setAlpha(0);
      items.push({ sprite: halo, baseAlpha: 0.36, baseScale: anchors.haloScale, flicker: false, alwaysWarmMin: 0, phase });
    }

    if (items.length > 0) {
      this.placedBuildingLights.set(b.id, items);
    }
  }

  public removeBuildingSprite(id: string): void {
    const sprite = this.buildingSprites.get(id);
    if (sprite) {
      sprite.destroy();
      this.buildingSprites.delete(id);
    }
    this.destroyPlacedBuildingLights(id);
  }

  public renderPlacedBuildings(): void {
    // Clear removed sprites
    const currentBuildingIds = new Set(this.buildingSystem.buildings.map((b) => b.id));
    for (const [id, sprite] of this.buildingSprites.entries()) {
      if (!currentBuildingIds.has(id)) {
        sprite.destroy();
        this.buildingSprites.delete(id);
        this.destroyPlacedBuildingLights(id);
      }
    }

    // Render placed buildings centered accurately on their isometric footprints
    for (const b of this.buildingSystem.buildings) {
      const fp = BuildingSystem.getFootprint(b.type);
      const w = b.width || fp.width;
      const h = b.height || fp.height;
      const { x, y, depth } = this.getFootprintWorldPos(b.tileX, b.tileY, w, h);
      const renderDepth = b.type === 'campfire' ? (b.tileX + b.tileY) * 100 + 35 : depth;
      const rot = BuildingSystem.normalizeRotation(b.rotation);
      const { tex, originY } = this.getBuildingVisualConfig(b.type, rot);

      const existing = this.buildingSprites.get(b.id);
      if (existing) {
        existing.setTexture(tex);
        existing.setOrigin(0.5, originY);
        existing.setPosition(x, y);
        existing.setDepth(renderDepth);
        this.syncPlacedBuildingLights(b, x, y, renderDepth, existing);
        continue;
      }

      const sprite = this.add.sprite(x, y, tex);
      sprite.setOrigin(0.5, originY);
      sprite.setDepth(renderDepth);
      this.buildingSprites.set(b.id, sprite);
      this.syncPlacedBuildingLights(b, x, y, renderDepth, sprite);

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

    // Player layered ambient + contact ground shadow (SE sunlight offset)
    this.playerShadow = this.add.image(x + 1.5, y + 16.5, 'shadow_round');
    this.playerShadow.setOrigin(0.5, 0.5);
    this.playerShadow.setDepth((this.playerTileX + this.playerTileY) * 100 + 21);
    this.playerShadow.setAlpha(0.5).setScale(0.96, 0.72);

    const textureKey = this.playerProfile.gender === 'female' ? 'player_female' : 'player_male';
    this.playerSprite = this.add.sprite(x, y + 16, textureKey, 0);
    this.playerSprite.setOrigin(0.5, 0.90);
    this.playerSprite.setScale(0.5); // 2x crisp 64x88 spritesheet rendered at exact 32x44 world size
    this.playerSprite.setDepth((this.playerTileX + this.playerTileY) * 100 + 52);

    // Held action tool sprite overlay (Axe, Pickaxe, Scythe, Hunt)
    this.playerToolSprite = this.add.sprite(x, y, 'tool_axe');
    this.playerToolSprite.setScale(0.76);
    this.playerToolSprite.setDepth((this.playerTileX + this.playerTileY) * 100 + 54);
    this.playerToolSprite.setVisible(false);

    // Player floating name tag (kept crisp above atmosphere overlay)
    this.playerNameText = this.add.text(x, y - 32, this.playerProfile.name || 'ကစားသမား', {
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setDepth(25050);

    // Gathering progress bar graphics & fishing rod/line overlays
    this.gatherProgressBarBg = this.add.graphics().setDepth(25055).setVisible(false);
    this.gatherProgressBarFill = this.add.graphics().setDepth(25056).setVisible(false);
    this.remoteFishingGraphics = this.add.graphics().setDepth(9994);
    this.fishingGraphics = this.add.graphics().setDepth(9995);

    this.applyEquippedClothing(this.playerProfile.equippedClothing);
  }

  private syncOutfitLayerSprites(
    layerMap: Partial<Record<ClothingEquipmentSlot, Phaser.GameObjects.Sprite | null>>,
    equipped: EquippedClothingState | undefined | null,
    gender: 'male' | 'female',
    baseSprite: Phaser.GameObjects.Sprite
  ): void {
    const visibleLayers = ClothingSystem.getEffectiveVisibleOutfit(equipped, gender);
    const desiredBySlot = new Map<ClothingEquipmentSlot, string>();
    for (const layer of visibleLayers) {
      desiredBySlot.set(layer.slot, layer.textureKey);
    }

    const frameIndex = typeof baseSprite.frame?.name === 'number'
      ? baseSprite.frame.name
      : Number(baseSprite.frame?.name) || 0;

    for (const slot of CLOTHING_RENDER_LAYER_ORDER) {
      const desiredTex = desiredBySlot.get(slot);
      const existing = layerMap[slot];

      if (!desiredTex || !this.textures.exists(desiredTex)) {
        if (existing) {
          existing.destroy();
          delete layerMap[slot];
        }
        continue;
      }

      if (!existing) {
        const layerSprite = this.add.sprite(baseSprite.x, baseSprite.y, desiredTex, frameIndex);
        layerSprite.setOrigin(0.5, 0.90);
        layerSprite.setScale(baseSprite.scaleX, baseSprite.scaleY);
        layerMap[slot] = layerSprite;
      } else if (existing.texture.key !== desiredTex) {
        existing.setTexture(desiredTex, frameIndex);
      }
    }
  }

  private syncLayerTransformsToBase(
    layerMap: Partial<Record<ClothingEquipmentSlot, Phaser.GameObjects.Sprite | null>> | undefined,
    baseSprite: Phaser.GameObjects.Sprite,
    baseDepth: number
  ): void {
    if (!layerMap) return;
    const frameIndex = typeof baseSprite.frame?.name === 'number'
      ? baseSprite.frame.name
      : Number(baseSprite.frame?.name) || 0;

    for (let i = 0; i < CLOTHING_RENDER_LAYER_ORDER.length; i++) {
      const slot = CLOTHING_RENDER_LAYER_ORDER[i];
      const layerSprite = layerMap[slot];
      if (!layerSprite) continue;

      layerSprite.setPosition(baseSprite.x, baseSprite.y);
      layerSprite.setAngle(baseSprite.angle);
      layerSprite.setScale(baseSprite.scaleX, baseSprite.scaleY);
      layerSprite.setAlpha(baseSprite.alpha);
      layerSprite.setVisible(baseSprite.visible);
      layerSprite.setDepth(baseDepth + (i + 1) * 0.08);
      const layerFrameIndex = typeof layerSprite.frame?.name === 'number'
        ? layerSprite.frame.name
        : Number(layerSprite.frame?.name);
      if (layerFrameIndex !== frameIndex) {
        layerSprite.setFrame(frameIndex);
      }
    }
  }

  public applyEquippedClothing(equipped?: EquippedClothingState | null): void {
    const clean = ClothingSystem.normalizeEquippedClothing(
      equipped !== undefined ? equipped : this.playerProfile.equippedClothing,
      this.playerProfile.ownedClothing,
      this.playerProfile.gender
    );
    this.playerProfile.equippedClothing = clean;

    if (!this.playerSprite || !this.textures) return;
    this.syncOutfitLayerSprites(
      this.playerClothingLayerSlots,
      clean,
      this.playerProfile.gender,
      this.playerSprite
    );
    this.syncLayerTransformsToBase(
      this.playerClothingLayerSlots,
      this.playerSprite,
      (this.playerTileX + this.playerTileY) * 100 + 52
    );
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
      const tileX = typeof peer.tileX === 'number' ? peer.tileX : (peer.positionX ?? 30);
      const tileY = typeof peer.tileY === 'number' ? peer.tileY : (peer.positionY ?? 30);
      const displayName = peer.name || peer.playerName || 'ကစားသမား';
      const dir = (peer.direction || peer.facingDirection || 'down') as 'down' | 'left' | 'right' | 'up';
      const { x, y } = MapSystem.tileToWorld(tileX, tileY);

      // Shadow for remote player
      const rShadow = this.add.image(x + 1.5, y + 16.5, 'shadow_round');
      rShadow.setOrigin(0.5, 0.5);
      rShadow.setDepth((tileX + tileY) * 100 + 21);
      rShadow.setAlpha(0.48).setScale(0.95, 0.72);
      this.remotePlayerShadows.set(id, rShadow);

      const tex = peer.gender === 'female' ? 'player_female' : 'player_male';
      const sprite = this.add.sprite(x, y + 16, tex, this.getDirectionRowOffset(dir));
      sprite.setOrigin(0.5, 0.90);
      sprite.setScale(0.5);
      sprite.setDepth((tileX + tileY) * 100 + 52);

      const toolSprite = this.add.sprite(x, y, 'tool_axe');
      toolSprite.setScale(0.76);
      toolSprite.setDepth((tileX + tileY) * 100 + 54);
      toolSprite.setVisible(false);

      const nameText = this.add.text(x, y - 30, displayName, {
        fontSize: '10px',
        color: '#67e8f9',
        fontStyle: 'bold',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        padding: { x: 4, y: 1 },
      }).setOrigin(0.5).setDepth(25049);

      const clothingLayers: Partial<Record<ClothingEquipmentSlot, Phaser.GameObjects.Sprite>> = {};
      this.syncOutfitLayerSprites(
        clothingLayers,
        peer.equippedClothing,
        peer.gender === 'female' ? 'female' : 'male',
        sprite
      );
      this.syncLayerTransformsToBase(clothingLayers, sprite, (tileX + tileY) * 100 + 52);

      let hash = 0;
      for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
      entry = {
        sprite,
        toolSprite,
        clothingLayers,
        nameText,
        animCycle: 0,
        settleMs: 0,
        lastStep: 0,
        phaseOffset: (Math.abs(hash) % 100) * 0.03,
        gatherElapsedMs: 0,
        lastGatherStrike: 0,
      };
      this.remotePlayerSprites.set(id, entry);
    }
    return entry;
  }

  private setupNetworkListeners(): void {
    // 1. Remote Player Joined
    this.networkSystem.on('player_joined', (evt) => {
      const { player } = evt.payload;
      const syncedPeer = this.networkSystem.remotePlayers.get(player.playerId) || player;
      const entry = this.getOrCreateRemoteSprite(player.playerId, syncedPeer);
      this.syncOutfitLayerSprites(
        entry.clothingLayers,
        syncedPeer.equippedClothing,
        syncedPeer.gender === 'female' ? 'female' : 'male',
        entry.sprite
      );
      this.syncLayerTransformsToBase(
        entry.clothingLayers,
        entry.sprite,
        (syncedPeer.tileX + syncedPeer.tileY) * 100 + 52
      );
      this.spawnFloatingText(player.positionX, player.positionY, `${player.playerName} မြို့ထဲသို့ ဝင်ရောက်လာပါပြီ!`, '#67e8f9');
    });

    // 1B. Remote Player Outfit Changed
    this.networkSystem.on('player_outfit', (evt) => {
      const { playerId, equippedClothing } = evt.payload;
      const entry = this.remotePlayerSprites.get(playerId);
      const peer = this.networkSystem.remotePlayers.get(playerId);
      if (entry && peer) {
        this.syncOutfitLayerSprites(
          entry.clothingLayers,
          equippedClothing,
          peer.gender === 'female' ? 'female' : 'male',
          entry.sprite
        );
        this.syncLayerTransformsToBase(
          entry.clothingLayers,
          entry.sprite,
          (peer.tileX + peer.tileY) * 100 + 52
        );
      }
    });

    // 2. Remote Player Left
    this.networkSystem.on('player_left', (evt) => {
      const { playerId } = evt.payload;
      const entry = this.remotePlayerSprites.get(playerId);
      if (entry) {
        for (const layerSprite of Object.values(entry.clothingLayers)) {
          layerSprite?.destroy();
        }
        entry.sprite.destroy();
        entry.toolSprite.destroy();
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
        const blockedTiles = this.getBuildingBlockedTileSet();
        if (!ResourceSystem.isNodeRespawnSafe(node, this.mapSystem, blockedTiles)) {
          return;
        }
        node.depletedUntil = undefined;
        node.currentHealth = node.maxHealth;
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
        rotation: incoming.type === 'fence_wood' ? BuildingSystem.normalizeRotation(incoming.rotation) : 0,
      };
      const existingIdx = this.buildingSystem.buildings.findIndex((b) => b.id === building.id);
      if (existingIdx !== -1) {
        const prev = this.buildingSystem.buildings[existingIdx];
        const posOrRotChanged =
          prev.tileX !== building.tileX ||
          prev.tileY !== building.tileY ||
          BuildingSystem.normalizeRotation(prev.rotation) !== BuildingSystem.normalizeRotation(building.rotation);
        if (posOrRotChanged) {
          for (let dy = 0; dy < prev.height; dy++) {
            for (let dx = 0; dx < prev.width; dx++) {
              this.mapSystem.setCollision(prev.tileX + dx, prev.tileY + dy, false);
            }
          }
          this.buildingSystem.buildings[existingIdx] = {
            ...building,
            storage: prev.storage || building.storage,
          };
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
        const isMine = this.buildingSystem.isPersonalBuilding(
          building,
          this.networkSystem.localPlayerId || undefined,
          this.playerProfile.name
        );
        if (!isMine) {
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

    const applyRoomState = (state: any) => {
      if (!state) return;
      if (state.depletedResources) {
        let changedRes = false;
        for (const [nodeId, respawnAt] of Object.entries(state.depletedResources)) {
          const node = this.resourceSystem.nodes.find((n) => n.id === nodeId);
          if (node && node.depletedUntil !== (respawnAt as number)) {
            node.depletedUntil = respawnAt as number;
            if (node.type === 'tree' || node.type === 'rock') {
              this.mapSystem.setCollision(node.tileX, node.tileY, false);
            }
            changedRes = true;
          }
        }
        if (changedRes) {
          this.renderResourceNodes();
        }
      }

      if (state.placedBuildings) {
        let changedBld = false;
        for (const rawB of state.placedBuildings) {
          const fp = BuildingSystem.getFootprint(rawB.type);
          const b: PlacedBuilding = {
            ...rawB,
            width: rawB.width || fp.width,
            height: rawB.height || fp.height,
            rotation: rawB.type === 'fence_wood' ? BuildingSystem.normalizeRotation(rawB.rotation) : 0,
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
            changedBld = true;
          }
        }
        if (changedBld) {
          this.renderPlacedBuildings();
        }
      }

      // Sync remote player sprites & outfits on room hydration
      for (const [pid, peer] of this.networkSystem.remotePlayers) {
        const entry = this.getOrCreateRemoteSprite(pid, peer);
        this.syncOutfitLayerSprites(
          entry.clothingLayers,
          peer.equippedClothing,
          peer.gender === 'female' ? 'female' : 'male',
          entry.sprite
        );
        this.syncLayerTransformsToBase(
          entry.clothingLayers,
          entry.sprite,
          (peer.tileX + peer.tileY) * 100 + 52
        );
      }
    };

    // 7. Full Room State Hydration
    this.networkSystem.on('room_state', (evt) => {
      applyRoomState(evt.payload);
    });
    if (this.networkSystem.lastRoomState) {
      applyRoomState(this.networkSystem.lastRoomState);
    }
  }

  private setupControls(): void {
    if (this.input.keyboard) {
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
      this.keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
      this.keyEnter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

      // E: Interact / Gather
      this.keyE.on('down', () => {
        if (this.isShortcutBlocked()) return;
        this.triggerInteraction();
      });

      // I: Open Inventory
      this.keyI.on('down', () => {
        if (this.isShortcutBlocked()) return;
        if (this.onOpenUIModal) this.onOpenUIModal('inventory');
      });

      // B: Toggle Build Mode
      this.keyB.on('down', () => {
        if (this.isShortcutBlocked()) return;
        if (this.onOpenUIModal) this.onOpenUIModal('building');
      });

      // C: Open Crafting
      this.keyC.on('down', () => {
        if (this.isShortcutBlocked()) return;
        if (this.onOpenUIModal) this.onOpenUIModal('crafting');
      });

      // M: Open Map
      this.keyM.on('down', () => {
        if (this.isShortcutBlocked()) return;
        if (this.onOpenUIModal) this.onOpenUIModal('map');
      });

      // R: Rotate fence preview when building/moving fence
      this.keyR.on('down', () => {
        if (this.isShortcutBlocked()) return;
        if (this.buildModeType === 'fence_wood') {
          this.rotateBuildPreview();
        }
      });

      // Enter: Confirm building placement when build mode active
      this.keyEnter.on('down', () => {
        if (this.isShortcutBlocked()) return;
        if (this.buildModeType) {
          this.confirmPlacementFromUI();
        }
      });

      // Keyboard Zoom shortcuts: + / = (zoom in), - / _ (zoom out), 0 (reset zoom)
      this.input.keyboard.on('keydown', (evt: KeyboardEvent) => {
        if (this.isShortcutBlocked()) return;
        if (evt.key === '=' || evt.key === '+') {
          this.adjustZoom(WorldScene.ZOOM_STEP);
        } else if (evt.key === '-' || evt.key === '_') {
          this.adjustZoom(-WorldScene.ZOOM_STEP);
        } else if (evt.key === '0') {
          this.resetZoom();
        }
      });

      // ESC: Cancel Build Mode or active Fishing if active
      this.input.keyboard.on('keydown-ESC', () => {
        if (this.isShortcutBlocked()) return;
        if (this.fishingState) {
          this.cancelFishing(false);
        } else if (this.buildModeType) {
          this.setBuildMode(null);
        }
      });
    }

    // Support two-finger pinch zoom cleanly on mobile touchscreens
    this.input.addPointer(1);

    // Desktop mouse wheel zoom smoothly around camera center
    this.input.on(
      'wheel',
      (_pointer: Phaser.Input.Pointer, _currentlyOver: Phaser.GameObjects.GameObject[], _dx: number, deltaY: number) => {
        if (this.isUiOverlayOpen) return;
        if (Math.abs(deltaY) < 0.5) return;
        this.adjustZoom(deltaY < 0 ? WorldScene.ZOOM_STEP : -WorldScene.ZOOM_STEP);
      }
    );

    // Pointer click/tap for mouse movement or building preview pinning (NO auto-confirm!)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isUiOverlayOpen) return;
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        this.isPinching = true;
        this.pinchStartDist = Math.max(12, Math.hypot(p1.x - p2.x, p1.y - p2.y));
        this.pinchStartZoom = this.camTargetZoom;
        this.pinchCooldownUntil = Date.now() + 240;
        return;
      }
      if (this.isPinching || Date.now() < this.pinchCooldownUntil) return;

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const { tx, ty } = MapSystem.worldToTile(worldPoint.x, worldPoint.y);

      if (this.buildModeType) {
        // Cooldown check to prevent accidental click-through from UI modals
        if (Date.now() < this.placementCooldown) return;

        // Pin preview cleanly at clicked/tapped tile so player can inspect, rotate, or press Confirm
        this.isPlacementPinned = true;
        this.selectedPlacementTile = { tx, ty };
        this.updateBuildPreview(tx, ty);
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
            const isOwner = this.buildingSystem.isPersonalBuilding(
              clickedBuilding,
              this.networkSystem.localPlayerId || undefined,
              this.playerProfile.name
            );
            if (!isOwner) {
              this.spawnFloatingText(
                clickedBuilding.tileX,
                clickedBuilding.tileY,
                `${clickedBuilding.placedBy || 'အခြားကစားသမား'} ၏ အဆောက်အအုံ`,
                '#94a3b8'
              );
              return;
            }
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

    // Pointer move: two-finger pinch zoom OR hover/build preview update
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (this.isPinching && p1.isDown && p2.isDown) {
        const currDist = Math.max(12, Math.hypot(p1.x - p2.x, p1.y - p2.y));
        const nextZoom = WorldScene.clampZoom(this.pinchStartZoom * (currDist / this.pinchStartDist));
        this.camTargetZoom = nextZoom;
        this.hasManualZoom = true;
        this.pinchCooldownUntil = Date.now() + 240;
        return;
      }

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const { tx, ty } = MapSystem.worldToTile(worldPoint.x, worldPoint.y);
      this.hoverTile = { tx, ty };

      if (this.mapSystem.isTileInBounds(tx, ty)) {
        const zone = this.mapSystem.getZoneAt(tx, ty);
        if (this.onTileHover) {
          this.onTileHover(tx, ty, zone.name);
        }
      }

      if (this.buildModeType && !this.isPlacementPinned && !pointer.wasTouch) {
        this.selectedPlacementTile = { tx, ty };
        this.updateBuildPreview(tx, ty);
      }
    });

    this.input.on('pointerup', () => {
      if (this.isPinching && (!this.input.pointer1.isDown || !this.input.pointer2.isDown)) {
        this.isPinching = false;
        this.pinchCooldownUntil = Date.now() + 220;
      }
    });
  }

  private isTouchViewportActive(): boolean {
    if (typeof window === 'undefined') return false;
    const w = this.scale.width || window.innerWidth;
    const h = this.scale.height || window.innerHeight;
    const hasCoarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const hasTouch = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || 'ontouchstart' in window;
    return hasCoarse || (hasTouch && w <= 1180) || w < 768 || (w <= 1024 && h <= 540);
  }

  private getDesiredCameraTarget(zoom: number): { x: number; y: number } {
    const pScreenX = this.playerSprite ? this.playerSprite.x : MapSystem.tileToWorld(this.playerTileX, this.playerTileY).x;
    const pFootY = this.playerSprite ? this.playerSprite.y : MapSystem.tileToWorld(this.playerTileX, this.playerTileY).y + 16;
    // Character originY is 0.90 at feet; center camera slightly upward on torso/head (-14px),
    // and compensate cleanly on mobile portrait/landscape for bottom touch HUD clearance.
    const biasScreenPx = WorldScene.computeViewportVerticalBiasPx(
      this.scale.width,
      this.scale.height,
      this.isTouchViewportActive()
    );
    const z = zoom > 0 ? zoom : 1;
    return {
      x: pScreenX,
      y: pFootY - 14 + biasScreenPx / z,
    };
  }

  private setupCamera(): void {
    const totalW = MAP_CONFIG.WIDTH * MAP_CONFIG.TILE_WIDTH + 600;
    const totalH = MAP_CONFIG.HEIGHT * MAP_CONFIG.TILE_HEIGHT + 400;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, totalW, totalH);
    cam.setRoundPixels(true);

    this.hasManualZoom = false;
    this.camTargetZoom = WorldScene.computeRecommendedZoom(this.scale.width, this.scale.height);
    cam.setZoom(this.camTargetZoom);

    const initialTarget = this.getDesiredCameraTarget(this.camTargetZoom);
    this.camFollowX = WorldScene.snapToPixelGrid(initialTarget.x, this.camTargetZoom);
    this.camFollowY = WorldScene.snapToPixelGrid(initialTarget.y, this.camTargetZoom);
    cam.centerOn(this.camFollowX, this.camFollowY);

    this.scale.off('resize', this.handleViewportResize, this);
    this.scale.on('resize', this.handleViewportResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleViewportResize, this);
    });
  }

  private handleViewportResize(gameSize: Phaser.Structs.Size): void {
    const w = gameSize.width;
    const h = gameSize.height;
    if (w <= 0 || h <= 0) return;

    if (this.atmosphereOverlay) {
      const spanW = Math.max(3600, Math.ceil(w / 0.72) + 240);
      const spanH = Math.max(3600, Math.ceil(h / 0.72) + 240);
      this.atmosphereOverlay.setPosition(w / 2, h / 2);
      this.atmosphereOverlay.setSize(spanW, spanH);
    }

    if (!this.hasManualZoom) {
      this.camTargetZoom = WorldScene.computeRecommendedZoom(w, h);
    }

    const cam = this.cameras.main;
    if (cam) {
      const target = this.getDesiredCameraTarget(cam.zoom);
      this.camFollowX = WorldScene.snapToPixelGrid(target.x, cam.zoom);
      this.camFollowY = WorldScene.snapToPixelGrid(target.y, cam.zoom);
      cam.centerOn(this.camFollowX, this.camFollowY);
    }
  }

  private updateCameraPresentation(dt: number): void {
    const cam = this.cameras.main;
    if (!cam) return;

    // 1. Smooth, jump-free zoom interpolation clamped cleanly to [0.75, 1.6]
    const zoomDiff = this.camTargetZoom - cam.zoom;
    if (Math.abs(zoomDiff) > 0.0008) {
      const zAlpha = WorldScene.computeExponentialLerpAlpha(16, dt);
      cam.setZoom(WorldScene.clampZoom(cam.zoom + zoomDiff * zAlpha));
    } else if (cam.zoom !== this.camTargetZoom) {
      cam.setZoom(this.camTargetZoom);
    }

    // 2. FPS-independent exponential camera follow with zero-overshoot / zero-drift settle
    const target = this.getDesiredCameraTarget(cam.zoom);
    const dx = target.x - this.camFollowX;
    const dy = target.y - this.camFollowY;
    const followRate = this.isMoving ? 10.5 : 15.0;
    const alpha = WorldScene.computeExponentialLerpAlpha(followRate, dt);

    if (!this.isMoving && Math.abs(dx) < 0.28 && Math.abs(dy) < 0.28) {
      this.camFollowX = WorldScene.snapToPixelGrid(target.x, cam.zoom);
      this.camFollowY = WorldScene.snapToPixelGrid(target.y, cam.zoom);
    } else {
      this.camFollowX += dx * alpha;
      this.camFollowY += dy * alpha;
    }

    cam.centerOn(
      WorldScene.snapToPixelGrid(this.camFollowX, cam.zoom),
      WorldScene.snapToPixelGrid(this.camFollowY, cam.zoom)
    );
  }

  private setupBuildPreviewSprites(): void {
    this.buildGridHighlights = [];
    for (let i = 0; i < 9; i++) {
      const h = this.add.sprite(0, 0, 'grid_valid').setVisible(false).setDepth(25040);
      this.buildGridHighlights.push(h);
    }
    this.buildGhostSprite = this.add.sprite(0, 0, 'obj_house_small').setVisible(false).setAlpha(0.75).setDepth(25041);

    // Draw isometric outline of the Homestead Buildable Zone (X: 40..114, Y: 40..114), visible only in build mode
    const g = this.add.graphics().setDepth(25035).setVisible(false);
    const { minX, minY, maxX, maxY } = BUILDABLE_ZONE_BOUNDS;
    const nw = MapSystem.tileToWorld(minX, minY);
    const ne = MapSystem.tileToWorld(maxX, minY);
    const se = MapSystem.tileToWorld(maxX, maxY);
    const sw = MapSystem.tileToWorld(minX, maxY);
    g.lineStyle(3, 0x34d399, 0.72);
    g.beginPath();
    g.moveTo(nw.x, nw.y);
    g.lineTo(ne.x + 32, ne.y + 16);
    g.lineTo(se.x, se.y + 32);
    g.lineTo(sw.x - 32, sw.y + 16);
    g.closePath();
    g.strokePath();
    this.buildableZoneGraphics = g;
  }

  private createAtmosphereAndWeather(): void {
    if (!this.atmosphereSystem) {
      this.atmosphereSystem = new WorldAtmosphereSystem();
    }

    const w = Math.max(3600, Math.ceil(this.scale.width / 0.72) + 240);
    const h = Math.max(3600, Math.ceil(this.scale.height / 0.72) + 240);
    this.atmosphereOverlay = this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, w, h, 0x0f1734, 0)
      .setScrollFactor(0)
      .setDepth(24500);

    // Lightweight fixed pool of 46 camera-space diagonal rain streaks
    this.rainDropPool = [];
    for (let i = 0; i < 46; i++) {
      const drop = this.add
        .image(0, 0, 'fx_rain_drop')
        .setScrollFactor(0)
        .setDepth(24520)
        .setVisible(false)
        .setScale(0.85 + (i % 3) * 0.14);
      this.rainDropPool.push({
        sprite: drop,
        rx: ((i * 73) % 1000) / 1000,
        ry: ((i * 197) % 1000) / 1000,
        speedMul: 0.85 + (i % 5) * 0.11,
        baseAlpha: 0.42 + (i % 4) * 0.1,
      });
    }

    // Lightweight fixed pool of 18 world-space ground/water splash ripples
    this.rainSplashPool = [];
    for (let i = 0; i < 18; i++) {
      const sp = this.add
        .image(0, 0, 'fx_rain_splash')
        .setOrigin(0.5)
        .setDepth(200)
        .setVisible(false);
      this.rainSplashPool.push({
        sprite: sp,
        active: false,
        age: 0,
        life: 0.38,
        maxScale: 1.0,
      });
    }

    this.refreshAtmosphereImmediately();
  }

  public refreshAtmosphereImmediately(): void {
    const snap = this.atmosphereSystem.evaluate();
    this.currentAtmosphereSnapshot = snap;

    if (this.atmosphereOverlay) {
      this.atmosphereOverlay.setFillStyle(snap.tintColor, snap.tintAlpha);
    }

    const hudKey = `${snap.formattedTimeMy}|${snap.phase}|${snap.weather}|${snap.weatherEffectsEnabled}`;
    if (hudKey !== this.lastAtmosphereHudKey) {
      this.lastAtmosphereHudKey = hudKey;
      this.onAtmosphereChange?.(snap);
    }
  }

  private updateAtmosphereAndWeather(time: number, dt: number): void {
    if (!this.atmosphereSystem) return;
    this.atmosphereSystem.advance(dt * 1000);
    const snap = this.atmosphereSystem.evaluate();
    this.currentAtmosphereSnapshot = snap;

    // 1. Smooth Day/Night Ambient Screen Tint (balanced so Player, NPCs, Buildings & UI remain clear)
    if (this.atmosphereOverlay) {
      this.atmosphereOverlay.setFillStyle(snap.tintColor, snap.tintAlpha);
    }

    // 2. Dynamic Town & Placed-Building Lights + Window Glows (synced with parent building occlusion alpha)
    const updateLightList = (
      lights: Array<{
        sprite: Phaser.GameObjects.Image;
        baseAlpha: number;
        baseScale: number;
        flicker: boolean;
        alwaysWarmMin: number;
        phase: number;
        parentBuilding?: Phaser.GameObjects.Sprite;
      }>
    ) => {
      for (const light of lights) {
        const effectiveLevel = Math.max(light.alwaysWarmMin, snap.lightIntensity);
        if (effectiveLevel <= 0.015) {
          if (light.sprite.visible) light.sprite.setVisible(false);
          continue;
        }
        if (!light.sprite.visible) light.sprite.setVisible(true);
        const flickerMul = light.flicker
          ? 0.92 + 0.08 * Math.sin(time * 0.0065 + light.phase) * Math.cos(time * 0.011 + light.phase * 0.5)
          : 0.96 + 0.04 * Math.sin(time * 0.002 + light.phase);
        const occlusionMul = light.parentBuilding ? light.parentBuilding.alpha : 1;
        light.sprite.setAlpha(Math.min(1, light.baseAlpha * effectiveLevel * flickerMul * occlusionMul));
        if (light.flicker) {
          light.sprite.setScale(light.baseScale * (0.97 + 0.04 * Math.sin(time * 0.008 + light.phase)));
        }
      }
    };

    updateLightList(this.townLights);
    for (const entries of this.placedBuildingLights.values()) {
      updateLightList(entries);
    }

    // 3. Optional Lightweight Rain Streaks & Ground/Water Splashes
    const rainAlpha = snap.effectiveRainIntensity;
    if (rainAlpha > 0.02) {
      const halfSpanW = (this.scale.width / 2) / 0.72 + 120;
      const halfSpanH = (this.scale.height / 2) / 0.72 + 100;
      const cx = this.scale.width / 2;
      const cy = this.scale.height / 2;
      const spanW = halfSpanW * 2;
      const spanH = halfSpanH * 2;

      for (const drop of this.rainDropPool) {
        drop.rx -= (0.28 * drop.speedMul) * dt;
        drop.ry += (1.18 * drop.speedMul) * dt;
        if (drop.ry > 1) {
          drop.ry -= 1;
          drop.rx = (drop.rx + 0.37) % 1;
        }
        if (drop.rx < 0) drop.rx += 1;

        drop.sprite.setVisible(true);
        drop.sprite.setPosition(cx - halfSpanW + drop.rx * spanW, cy - halfSpanH + drop.ry * spanH);
        drop.sprite.setAlpha(drop.baseAlpha * rainAlpha);
      }

      // Spawn and animate pooled ground & water surface splashes inside camera view
      const camView = this.cameras.main.worldView;
      this.rainSplashSpawnAccum += dt * (22 * rainAlpha);
      for (const sp of this.rainSplashPool) {
        if (sp.active) {
          sp.age += dt;
          if (sp.age >= sp.life) {
            sp.active = false;
            sp.sprite.setVisible(false);
          } else {
            const p = sp.age / sp.life;
            sp.sprite.setScale(0.45 + p * sp.maxScale);
            sp.sprite.setAlpha((1 - p) * 0.7 * rainAlpha);
          }
        } else if (this.rainSplashSpawnAccum >= 1 && camView.width > 0 && camView.height > 0) {
          this.rainSplashSpawnAccum -= 1;
          const wx = camView.x + Math.random() * camView.width;
          const wy = camView.y + Math.random() * camView.height;
          const { tx, ty } = MapSystem.worldToTile(wx, wy);
          if (this.mapSystem.isTileInBounds(tx, ty)) {
            const tile = this.mapSystem.tiles[ty][tx];
            if (tile !== 'cliff') {
              const isWater = tile === 'water';
              sp.active = true;
              sp.age = 0;
              sp.life = isWater ? 0.48 : 0.32;
              sp.maxScale = isWater ? 0.95 : 0.65;
              sp.sprite.setTexture(isWater ? 'fx_water_rain_ripple' : 'fx_rain_splash');
              sp.sprite.setPosition(wx, wy);
              sp.sprite.setDepth((tx + ty) * 100 + 22);
              sp.sprite.setScale(0.45);
              sp.sprite.setAlpha(0.7 * rainAlpha);
              sp.sprite.setVisible(true);
            }
          }
        }
      }
    } else {
      this.rainSplashSpawnAccum = 0;
      for (const drop of this.rainDropPool) {
        if (drop.sprite.visible) drop.sprite.setVisible(false);
      }
      for (const sp of this.rainSplashPool) {
        if (sp.active || sp.sprite.visible) {
          sp.active = false;
          sp.sprite.setVisible(false);
        }
      }
    }

    // 4. Emit HUD update only when minute/phase/weather changes
    const hudKey = `${snap.formattedTimeMy}|${snap.phase}|${snap.weather}|${snap.weatherEffectsEnabled}`;
    if (hudKey !== this.lastAtmosphereHudKey) {
      this.lastAtmosphereHudKey = hudKey;
      this.onAtmosphereChange?.(snap);
    }
  }

  private createStep6EnvironmentAndWildlife(): void {
    this.wildlifePool = [];
    const addWildlifePool = (kind: WildlifeKind, count: number, tex: string, additive = false) => {
      for (let i = 0; i < count; i++) {
        const texKey = kind === 'butterfly' && i % 2 === 1 ? 'fx_butterfly_1' : tex;
        const sp = this.add
          .image(0, 0, texKey)
          .setOrigin(0.5)
          .setDepth(kind === 'firefly' ? 24515 : kind === 'bird' ? 24120 : 24100)
          .setVisible(false);
        if (additive) {
          sp.setBlendMode(Phaser.BlendModes.ADD);
        }
        this.wildlifePool.push({
          sprite: sp,
          kind,
          active: false,
          wx: 0,
          wy: 0,
          vx: 0,
          vy: 0,
          phase: i * 1.37,
          age: 0,
          life: 10,
        });
      }
    };

    addWildlifePool('butterfly', WILDLIFE_POOL_CONFIG.MAX_BUTTERFLIES, 'fx_butterfly_0', false);
    addWildlifePool('dragonfly', WILDLIFE_POOL_CONFIG.MAX_DRAGONFLIES, 'fx_dragonfly', false);
    addWildlifePool('firefly', WILDLIFE_POOL_CONFIG.MAX_FIREFLIES, 'fx_firefly', true);
    addWildlifePool('bird', WILDLIFE_POOL_CONFIG.MAX_BIRDS, 'fx_bird', false);

    // Pooled falling leaves & blossom petals for tree pass-by rustle
    this.flutterLeafPool = [];
    for (let i = 0; i < WILDLIFE_POOL_CONFIG.MAX_FLUTTER_LEAVES; i++) {
      const sp = this.add
        .image(0, 0, 'fx_leaf_flutter')
        .setOrigin(0.5)
        .setDepth(24110)
        .setVisible(false);
      this.flutterLeafPool.push({
        sprite: sp,
        active: false,
        vx: 0,
        vy: 0,
        age: 0,
        life: 0.9,
        phase: i * 0.9,
      });
    }

    // Pooled shoreline ripples when player walks near lake/river edges
    this.shoreRipplePool = [];
    for (let i = 0; i < WILDLIFE_POOL_CONFIG.MAX_SHORE_RIPPLES; i++) {
      const sp = this.add
        .image(0, 0, 'fx_water_rain_ripple')
        .setOrigin(0.5)
        .setDepth(200)
        .setVisible(false);
      this.shoreRipplePool.push({
        sprite: sp,
        active: false,
        age: 0,
        life: 0.55,
      });
    }
  }

  private spawnFlutterLeaf(wx: number, wy: number, isBlossom: boolean): void {
    for (const leaf of this.flutterLeafPool) {
      if (!leaf.active) {
        leaf.active = true;
        leaf.age = 0;
        leaf.life = 0.85 + Math.random() * 0.45;
        leaf.vx = (Math.random() - 0.5) * 26;
        leaf.vy = 14 + Math.random() * 14;
        leaf.sprite.setTexture(isBlossom ? 'fx_blossom_petal' : 'fx_leaf_flutter');
        leaf.sprite.setPosition(wx + (Math.random() - 0.5) * 16, wy - 28 - Math.random() * 18);
        leaf.sprite.setAlpha(0.92);
        leaf.sprite.setScale(0.95);
        leaf.sprite.setVisible(true);
        return;
      }
    }
  }

  private spawnShoreRipple(wx: number, wy: number, tileX: number, tileY: number): void {
    for (const rp of this.shoreRipplePool) {
      if (!rp.active) {
        rp.active = true;
        rp.age = 0;
        rp.life = 0.55;
        rp.sprite.setPosition(wx, wy + 14);
        rp.sprite.setDepth((tileX + tileY) * 100 + 23);
        rp.sprite.setScale(0.45);
        rp.sprite.setAlpha(0.58);
        rp.sprite.setVisible(true);
        return;
      }
    }
  }

  private updateStep6EnvironmentAndWildlife(time: number, dt: number, deltaMs: number): void {
    const camView = this.cameras.main.worldView;
    if (camView.width <= 0 || camView.height <= 0) return;

    const pad = 110;
    const minX = camView.x - pad;
    const maxX = camView.right + pad;
    const minY = camView.y - pad;
    const maxY = camView.bottom + pad;

    const snap = this.currentAtmosphereSnapshot;
    const phase = snap?.phase ?? 'day';
    const rainIntensity = snap?.effectiveRainIntensity ?? 0;
    const windSpeedMul = 1 + rainIntensity * 0.45;

    const { x: playerWx, y: playerWy } = MapSystem.tileToWorld(this.playerTileX, this.playerTileY);

    // 1. Camera-Culled Flora Breeze & Gentle Pass-by Push
    for (const fl of this.swayingFlora) {
      if (fl.wx < minX || fl.wx > maxX || fl.wy < minY || fl.wy > maxY) continue;

      if (this.isMoving && Math.abs(fl.tileX - this.playerTileX) <= 1 && Math.abs(fl.tileY - this.playerTileY) <= 1) {
        const dist = Math.hypot(fl.tileX - this.playerTileX, fl.tileY - this.playerTileY);
        if (dist < 0.92 && fl.pushEnergy < 0.65) {
          fl.pushEnergy = 1.0;
          fl.pushDir = fl.wx >= playerWx ? 1 : -1;
        }
      }

      if (fl.pushEnergy > 0) {
        fl.pushEnergy = Math.max(0, fl.pushEnergy - dt * 1.9);
      }

      const breeze = Math.sin(time * 0.0022 * windSpeedMul + fl.phase) * fl.amp * windSpeedMul;
      const pushOffset = fl.pushEnergy * fl.pushDir * 0.16;
      fl.sprite.setRotation(breeze + pushOffset);
    }

    // 2. Camera-Culled Tree Canopy Sway & Pass-by Leaf Rustle (Collision Untouched)
    for (const tb of this.interactiveTreesAndBushes) {
      if (!tb.sprite.visible) continue;
      if (tb.wx < minX || tb.wx > maxX || tb.wy < minY || tb.wy > maxY) continue;

      if (
        this.isMoving &&
        time >= tb.rustleCooldownUntil &&
        Math.abs(tb.tileX - this.playerTileX) <= 2 &&
        Math.abs(tb.tileY - this.playerTileY) <= 2
      ) {
        const dist = Math.hypot(tb.tileX - this.playerTileX, tb.tileY - this.playerTileY);
        const triggerRadius = tb.isTree ? 1.62 : 1.15;
        if (dist <= triggerRadius) {
          tb.rustleEnergy = 1.0;
          tb.rustleCooldownUntil = time + 1150;
          this.spawnFlutterLeaf(tb.wx, tb.wy, tb.isBlossom);
          if (tb.isTree && Math.random() < 0.65) {
            this.spawnFlutterLeaf(tb.wx + 6, tb.wy - 4, tb.isBlossom);
          }
          if (time - this.lastFoliageSoundTime > 950) {
            this.lastFoliageSoundTime = time;
            SoundSynth.playSoftFoliageBrush();
          }
        }
      }

      if (tb.rustleEnergy > 0) {
        tb.rustleEnergy = Math.max(0, tb.rustleEnergy - dt * 1.65);
      }

      const windAmp = tb.isTree ? 0.015 : 0.025;
      const windSway = Math.sin(time * 0.0014 * windSpeedMul + tb.phase) * windAmp * windSpeedMul;
      const rustleWobble = Math.sin(time * 0.024 + tb.phase) * tb.rustleEnergy * (tb.isTree ? 0.045 : 0.075);
      tb.sprite.setRotation(windSway + rustleWobble);
      if (tb.isTree) {
        tb.sprite.setScale(
          tb.baseScale * (1 + tb.rustleEnergy * 0.025),
          tb.baseScale * (1 - tb.rustleEnergy * 0.015)
        );
      }
    }

    // 3. Pooled Fluttering Leaves
    for (const leaf of this.flutterLeafPool) {
      if (!leaf.active) continue;
      leaf.age += dt;
      if (leaf.age >= leaf.life) {
        leaf.active = false;
        leaf.sprite.setVisible(false);
        continue;
      }
      const p = leaf.age / leaf.life;
      leaf.sprite.x += (leaf.vx + Math.sin(time * 0.008 + leaf.phase) * 18) * dt;
      leaf.sprite.y += leaf.vy * dt;
      leaf.sprite.setRotation(Math.sin(time * 0.01 + leaf.phase) * 0.7);
      leaf.sprite.setAlpha((1 - p) * 0.9);
    }

    // 4. Shoreline Water Proximity Detection & Visual Ripples
    let nearWater = false;
    const ptx = Math.round(this.playerTileX);
    const pty = Math.round(this.playerTileY);
    let adjWaterX = -1;
    let adjWaterY = -1;
    for (let dy = -2; dy <= 2 && !nearWater; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = ptx + dx;
        const ny = pty + dy;
        if (this.mapSystem.isTileInBounds(nx, ny) && this.mapSystem.tiles[ny][nx] === 'water') {
          nearWater = true;
          if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
            adjWaterX = nx;
            adjWaterY = ny;
          }
          break;
        }
      }
    }

    if (this.isMoving && adjWaterX >= 0 && time >= this.nextShoreRippleTime) {
      this.nextShoreRippleTime = time + 420;
      const wp = MapSystem.tileToWorld(adjWaterX, adjWaterY);
      this.spawnShoreRipple(wp.x, wp.y, adjWaterX, adjWaterY);
    }

    for (const rp of this.shoreRipplePool) {
      if (!rp.active) continue;
      rp.age += dt;
      if (rp.age >= rp.life) {
        rp.active = false;
        rp.sprite.setVisible(false);
        continue;
      }
      const p = rp.age / rp.life;
      rp.sprite.setScale(0.45 + p * 0.8);
      rp.sprite.setAlpha((1 - p) * 0.56);
    }

    // 5. Biome & Time-Aware Pooled Ambient Wildlife (Zero Collisions)
    const wildlifePad = 210;
    let spawnQuotaThisFrame = 2;
    for (const w of this.wildlifePool) {
      if (!AmbientLifeSystem.shouldBeActive(w.kind, phase, rainIntensity)) {
        if (w.active || w.sprite.visible) {
          w.active = false;
          w.sprite.setVisible(false);
        }
        continue;
      }

      if (w.active) {
        w.age += dt;
        const outOfView =
          w.wx < camView.x - wildlifePad ||
          w.wx > camView.right + wildlifePad ||
          w.wy < camView.y - wildlifePad ||
          w.wy > camView.bottom + wildlifePad;

        if (w.age >= w.life || outOfView) {
          w.active = false;
          w.sprite.setVisible(false);
          continue;
        }

        const fadeIn = Math.min(1, w.age / 0.8);
        const fadeOut = Math.min(1, Math.max(0, (w.life - w.age) / 0.9));
        const lifeAlpha = Math.min(fadeIn, fadeOut);

        if (w.kind === 'butterfly') {
          w.wx += (w.vx + Math.sin(time * 0.003 + w.phase) * 14) * dt;
          w.wy += (w.vy + Math.cos(time * 0.004 + w.phase) * 10) * dt;
          w.sprite.setPosition(w.wx, w.wy - 8 + Math.sin(time * 0.008 + w.phase) * 3.5);
          w.sprite.setScale(0.42 + 0.58 * Math.abs(Math.sin(time * 0.016 + w.phase)), 0.9);
          w.sprite.setAlpha(0.92 * lifeAlpha);
        } else if (w.kind === 'dragonfly') {
          const dart = 0.28 + 0.72 * Math.max(0, Math.sin(time * 0.0032 + w.phase));
          w.wx += w.vx * dart * dt;
          w.wy += w.vy * dart * dt;
          w.sprite.setPosition(w.wx, w.wy - 6 + Math.sin(time * 0.01 + w.phase) * 2.5);
          w.sprite.setRotation(w.vx >= 0 ? 0.2 : -0.2);
          w.sprite.setAlpha(0.88 * lifeAlpha);
        } else if (w.kind === 'firefly') {
          w.wx += (w.vx + Math.sin(time * 0.0018 + w.phase) * 10) * dt;
          w.wy += (w.vy + Math.cos(time * 0.0022 + w.phase) * 7) * dt;
          w.sprite.setPosition(w.wx, w.wy - 10);
          const pulse = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(time * 0.0048 + w.phase));
          w.sprite.setAlpha(pulse * lifeAlpha);
          w.sprite.setScale(0.75 + 0.35 * pulse);
        } else {
          // Songbird gliding softly overhead
          w.wx += w.vx * dt;
          w.wy += w.vy * dt;
          w.sprite.setPosition(w.wx, w.wy);
          w.sprite.setScale(1, 0.65 + 0.35 * Math.sin(time * 0.014 + w.phase));
          w.sprite.setAlpha(0.82 * lifeAlpha);
        }
      } else if (spawnQuotaThisFrame > 0) {
        spawnQuotaThisFrame--;
        const wx = camView.x + Math.random() * camView.width;
        const wy = camView.y + Math.random() * camView.height;
        const { tx, ty } = MapSystem.worldToTile(wx, wy);
        if (AmbientLifeSystem.isValidHabitatTile(w.kind, tx, ty, this.mapSystem)) {
          w.active = true;
          w.age = 0;
          w.life = w.kind === 'bird' ? 7 + Math.random() * 4 : 9 + Math.random() * 6;
          w.wx = wx;
          w.wy = w.kind === 'bird' ? wy - 65 : wy;
          if (w.kind === 'bird') {
            const dir = Math.random() < 0.5 ? 1 : -1;
            w.vx = dir * (48 + Math.random() * 24);
            w.vy = -12 + (Math.random() - 0.5) * 16;
          } else if (w.kind === 'dragonfly') {
            w.vx = (Math.random() - 0.5) * 34;
            w.vy = (Math.random() - 0.5) * 18;
          } else if (w.kind === 'firefly') {
            w.vx = (Math.random() - 0.5) * 14;
            w.vy = (Math.random() - 0.5) * 9;
          } else {
            w.vx = (Math.random() - 0.5) * 24;
            w.vy = (Math.random() - 0.5) * 14;
          }
          w.sprite.setPosition(w.wx, w.wy);
          w.sprite.setAlpha(0);
          w.sprite.setVisible(true);
        }
      }
    }

    // 6. Optional Gentle Ambient Nature Sound Scheduler (Built-in SoundSynth)
    this.ambientAudioAccumMs += deltaMs;
    if (this.ambientAudioAccumMs >= this.ambientAudioIntervalMs) {
      this.ambientAudioAccumMs = 0;
      this.ambientAudioIntervalMs = 5800 + Math.random() * 3400;
      if (SoundSynth.ambientEnabled) {
        const inForestOrGlade = (ptx >= 38 && pty <= 52) || (ptx >= 70 && ptx <= 104 && pty <= 34);
        const cue = AmbientLifeSystem.selectAmbientCue(
          phase,
          nearWater,
          inForestOrGlade,
          rainIntensity,
          Math.random()
        );
        if (cue === 'bird') SoundSynth.playAmbientBirdChirp();
        else if (cue === 'water') SoundSynth.playAmbientWaterLap();
        else if (cue === 'cricket') SoundSynth.playAmbientNightCricket();
        else if (cue === 'wind') SoundSynth.playAmbientWindGust();
      }
    }
  }

  public rotateBuildPreview(): void {
    if (this.buildModeType !== 'fence_wood') return;
    this.buildRotation = ((this.buildRotation + 1) % 4) as FenceRotation;
    if (this.buildGhostSprite) {
      const { tex, originY } = this.getBuildingVisualConfig('fence_wood', this.buildRotation);
      this.buildGhostSprite.setTexture(tex);
      this.buildGhostSprite.setOrigin(0.5, originY);
    }
    SoundSynth.playRustle();
    this.updateBuildPreview(this.selectedPlacementTile.tx, this.selectedPlacementTile.ty);
  }

  public setBuildMode(type: BuildingType | null, movingBuildingId?: string): void {
    this.buildModeType = type;
    this.movingBuildingId = movingBuildingId || null;
    this.isPlacementPinned = false;
    this.placementCooldown = Date.now() + 260;

    if (!type) {
      this.buildRotation = 0;
      for (const h of this.buildGridHighlights) h.setVisible(false);
      if (this.buildGhostSprite) this.buildGhostSprite.setVisible(false);
      if (this.buildableZoneGraphics) this.buildableZoneGraphics.setVisible(false);
      if (this.onPlacementStatusChange) {
        this.onPlacementStatusChange({
          active: false,
          buildingType: null,
          isMoving: false,
          tileX: 0,
          tileY: 0,
          rotation: 0,
          valid: false,
        });
      }
    } else {
      if (movingBuildingId) {
        const existing = this.buildingSystem.buildings.find((b) => b.id === movingBuildingId);
        this.buildRotation = existing ? BuildingSystem.normalizeRotation(existing.rotation) : 0;
      } else {
        this.buildRotation = 0;
      }

      const { tex, originY } = this.getBuildingVisualConfig(type, this.buildRotation);

      if (this.buildGhostSprite) {
        this.buildGhostSprite.setTexture(tex);
        this.buildGhostSprite.setOrigin(0.5, originY);
        this.buildGhostSprite.setVisible(true);
      }
      if (this.buildableZoneGraphics) {
        this.buildableZoneGraphics.setVisible(true);
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
    const { tex, originY } = this.getBuildingVisualConfig(this.buildModeType, this.buildRotation);
    this.buildGhostSprite.setTexture(tex);
    this.buildGhostSprite.setOrigin(0.5, originY);

    const fp = BuildingSystem.getFootprint(this.buildModeType);
    const { x: ghostX, y: ghostY } = this.getFootprintWorldPos(tx, ty, fp.width, fp.height);
    this.buildGhostSprite.setPosition(ghostX, ghostY);

    const remotePositions = Array.from(this.remotePlayerSprites.values()).map(rp => {
      const tile = MapSystem.worldToTile(rp.sprite.x, rp.sprite.y - 16);
      return { x: tile.tx, y: tile.ty };
    });

    const npcPositions = this.townNpcs.map(n => ({ tileX: n.tileX, tileY: n.tileY }));
    const resourcePositions = this.resourceSystem.nodes
      .filter((n) => !n.depletedUntil || n.depletedUntil <= Date.now())
      .map((n) => ({ tileX: n.tileX, tileY: n.tileY }));

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
      this.buildGhostSprite.setAlpha(0.84);
    } else {
      this.buildGhostSprite.setTint(0xf87171); // Crisp Rose Red tint
      this.buildGhostSprite.setAlpha(0.68);
    }

    if (this.onPlacementStatusChange) {
      this.onPlacementStatusChange({
        active: true,
        buildingType: this.buildModeType,
        isMoving: !!this.movingBuildingId,
        tileX: tx,
        tileY: ty,
        rotation: this.buildRotation,
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
    const resourcePositions = this.resourceSystem.nodes
      .filter((n) => !n.depletedUntil || n.depletedUntil <= Date.now())
      .map((n) => ({ tileX: n.tileX, tileY: n.tileY }));

    const ownerUid = this.networkSystem.localPlayerId || undefined;

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
        resourcePositions,
        this.buildRotation
      );

      if (moved) {
        SoundSynth.playBuild();
        this.spawnFloatingText(moved.tileX, moved.tileY, 'အဆောက်အအုံရွှေ့ပြောင်းပြီးပါပြီ!', '#4ade80');
        this.networkSystem.broadcastBuilding(moved);
        this.nudgePlayerIfInsideBuilding(moved.tileX, moved.tileY, moved.width, moved.height);
        this.setBuildMode(null);
        if (this.onBuildingBuilt) this.onBuildingBuilt(true);
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
      resourcePositions,
      this.buildRotation,
      ownerUid
    );

    if (placed) {
      SoundSynth.playBuild();
      this.spawnFloatingText(placed.tileX, placed.tileY, 'အဆောက်အအုံဆောက်လုပ်ပြီးပါပြီ!', '#4ade80');
      this.networkSystem.broadcastBuilding(placed);
      this.nudgePlayerIfInsideBuilding(placed.tileX, placed.tileY, placed.width, placed.height);

      if (this.onBuildingBuilt) this.onBuildingBuilt(false);
      if (this.onStateChanged) this.onStateChanged();

      // If no more items in inventory, exit build mode
      if (!this.inventorySystem.hasItem(this.buildModeType, 1)) {
        this.setBuildMode(null);
      } else if (this.buildModeType === 'fence_wood') {
        // Advance 1 tile along current isometric fence axis so building continuous fence lines is effortless
        const stepX = this.buildRotation % 2 === 0 ? 1 : 0;
        const stepY = this.buildRotation % 2 === 1 ? 1 : 0;
        const nextTx = this.mapSystem.isTileInBounds(tx + stepX, ty + stepY) ? tx + stepX : tx;
        const nextTy = this.mapSystem.isTileInBounds(tx + stepX, ty + stepY) ? ty + stepY : ty;
        this.isPlacementPinned = true;
        this.updateBuildPreview(nextTx, nextTy);
      } else {
        this.isPlacementPinned = false;
        this.updateBuildPreview(tx, ty);
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

    if (this.fishingState) {
      const distFishing = Math.hypot(
        this.fishingState.node.tileX - tx,
        this.fishingState.node.tileY - ty
      );
      if (distFishing <= 1.5) {
        this.triggerFishingCatch();
        return;
      }
      this.cancelFishing(false);
    }

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

    if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0.1) {
      stepX = Math.sign(dx);
    } else if (Math.abs(dy) > 0.1) {
      stepY = Math.sign(dy);
    }

    const nextTx = Math.round(this.playerTileX + stepX * 0.65);
    const nextTy = Math.round(this.playerTileY + stepY * 0.65);

    if (this.mapSystem.isWalkable(nextTx, nextTy)) {
      this.playerTileX += stepX * 0.45;
      this.playerTileY += stepY * 0.45;
      if (stepX > 0) this.playerDirection = 'right';
      else if (stepX < 0) this.playerDirection = 'left';
      else if (stepY > 0) this.playerDirection = 'down';
      else if (stepY < 0) this.playerDirection = 'up';
    }
  }

  public triggerInteraction(): void {
    if (this.isGathering) return;

    // 0. Active Fishing Timing Trigger (Works seamlessly with [E] key and Mobile [E] Touch Button)
    if (this.fishingState) {
      this.triggerFishingCatch();
      return;
    }

    // 1. Shop check
    if (this.isNearShop) {
      SoundSynth.playCoin();
      if (this.onOpenUIModal) this.onOpenUIModal('shop');
      return;
    }

    // 1B. Aunty Gyi Clothing Shop
    if (this.isNearClothingShop) {
      SoundSynth.playCoin();
      if (this.onOpenUIModal) this.onOpenUIModal('clothing_shop');
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

    // 4. Resource Node check (includes Rod-gated Lake Fishing)
    const nearbyNode = this.resourceSystem.getNearbyNode(this.playerTileX, this.playerTileY, 1.65);
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
      return;
    }

    // 7. Zone Entrance Signpost directional hint
    if (this.nearbySignpost) {
      SoundSynth.playRustle();
      this.spawnFloatingText(this.nearbySignpost.tileX, this.nearbySignpost.tileY, this.nearbySignpost.hint, this.nearbySignpost.color);
    }
  }

  private getDirectionRowOffset(dir: 'down' | 'left' | 'right' | 'up'): number {
    return dir === 'down' ? 0 : dir === 'left' ? 4 : dir === 'right' ? 8 : 12;
  }

  private isPositionWalkable(tx: number, ty: number): boolean {
    const r = WorldScene.PLAYER_COLLISION_RADIUS;
    const corners: [number, number][] = [
      [tx - r, ty - r],
      [tx + r, ty - r],
      [tx - r, ty + r],
      [tx + r, ty + r],
    ];
    for (const [sx, sy] of corners) {
      if (!this.mapSystem.isWalkable(Math.round(sx), Math.round(sy))) {
        return false;
      }
    }
    return true;
  }

  private startGathering(node: ResourceNode): void {
    const gate = this.resourceSystem.canGatherNode(node, this.inventorySystem);
    if (!gate.allowed) {
      SoundSynth.playRustle();
      this.spawnFloatingText(node.tileX, node.tileY, gate.reason || 'ကိရိယာ လိုအပ်သည်', '#f87171');
      if (node.type === 'lake_fish') {
        this.showFishingRodGuidance();
      }
      return;
    }

    if (node.type === 'lake_fish') {
      this.startFishing(node);
      return;
    }

    // Face the resource node smoothly while gathering
    const dx = node.tileX - this.playerTileX;
    const dy = node.tileY - this.playerTileY;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (Math.abs(dx) > 0.05) this.playerDirection = dx >= 0 ? 'right' : 'left';
    } else {
      if (Math.abs(dy) > 0.05) this.playerDirection = dy >= 0 ? 'down' : 'up';
    }

    const actionTool = WorldScene.getToolForResourceNode(node.type);
    this.isGathering = true;
    this.currentGatheringNode = node;
    this.gatherActionTool = actionTool;
    this.gatherStrikeCount = 0;
    this.gatherProgress = 0;
    this.gatherTotalDuration = this.resourceSystem.getGatherDuration(node, this.inventorySystem);

    // Sync initial tool swing frame & multiplayer gathering action state
    if (actionTool) {
      const { x: px, y: py } = MapSystem.tileToWorld(this.playerTileX, this.playerTileY);
      const depth = (this.playerTileX + this.playerTileY) * 100 + 52;
      this.applyToolSwingVisual(
        this.playerSprite,
        this.playerToolSprite,
        px,
        py + 16,
        depth,
        this.playerDirection,
        actionTool,
        0
      );
      this.syncLayerTransformsToBase(this.playerClothingLayerSlots, this.playerSprite, depth);
      this.networkSystem.broadcastActionState(
        this.playerTileX,
        this.playerTileY,
        this.playerDirection,
        'gathering',
        actionTool
      );
    }

    // Subtle anticipation audio on start
    if (node.type === 'bush' || node.type === 'animal') {
      SoundSynth.playRustle();
    }

    this.gatherProgressBarBg.setVisible(true);
    this.gatherProgressBarFill.setVisible(true);
  }

  private applyToolSwingVisual(
    charSprite: Phaser.GameObjects.Sprite,
    toolSprite: Phaser.GameObjects.Sprite,
    footX: number,
    footY: number,
    baseDepth: number,
    direction: 'down' | 'left' | 'right' | 'up',
    tool: ActionToolKind,
    elapsedMs: number
  ) {
    const pose = WorldScene.computeToolSwingPose(direction, tool, elapsedMs);
    const rowOffset = this.getDirectionRowOffset(direction);
    const actionFrame = pose.cyclePhase >= 0.42 && pose.cyclePhase <= 0.72 ? 1 : 0;

    charSprite.setFrame(rowOffset + actionFrame);
    charSprite.setPosition(footX, footY + pose.playerOffsetY);
    charSprite.setAngle(pose.playerLeanAngleDeg);
    charSprite.setScale(0.5 * pose.playerSquashX, 0.5 * pose.playerSquashY);

    if (toolSprite.texture.key !== pose.textureKey) {
      toolSprite.setTexture(pose.textureKey);
    }
    toolSprite.setFlipX(pose.flipX);
    toolSprite.setOrigin(pose.flipX ? 0.78 : 0.22, 0.80);
    toolSprite.setPosition(footX + pose.offsetX, footY + pose.offsetY);
    toolSprite.setAngle(pose.angleDeg);
    toolSprite.setDepth(baseDepth + pose.depthOffset);
    toolSprite.setVisible(true);

    return pose;
  }

  private spawnToolImpactEffects(tileX: number, tileY: number, tool: ActionToolKind, nodeId?: string): void {
    const { x, y } = MapSystem.tileToWorld(tileX, tileY);
    const texKey =
      tool === 'axe'
        ? 'fx_chip_wood'
        : tool === 'pickaxe'
        ? 'fx_chip_stone'
        : tool === 'scythe'
        ? 'fx_chip_grass'
        : 'fx_hit_spark';
    const baseDepth = (tileX + tileY) * 100 + 68;

    for (let i = 0; i < 4; i++) {
      const angle = -Math.PI * 0.85 + (i / 3) * Math.PI * 0.7 + (Math.random() - 0.5) * 0.35;
      const dist = 10 + Math.random() * 10;
      const fx = this.add.image(x + (Math.random() - 0.5) * 6, y + 4, texKey);
      fx.setDepth(baseDepth);
      fx.setScale(0.85 + Math.random() * 0.25);

      this.tweens.add({
        targets: fx,
        x: fx.x + Math.cos(angle) * dist,
        y: fx.y + Math.sin(angle) * dist + 7,
        angle: (Math.random() - 0.5) * 140,
        alpha: 0,
        scale: 0.45,
        duration: 320 + Math.floor(Math.random() * 90),
        ease: 'Quad.easeOut',
        onComplete: () => {
          fx.destroy();
        },
      });
    }

    if (!nodeId) return;

    // Subtle organic impact shake/recoil on target node (never alters tile coordinates)
    const foliage = this.interactiveTreesAndBushes.find(
      (f) => f.tileX === tileX && f.tileY === tileY
    );
    if (foliage) {
      foliage.rustleEnergy = Math.max(foliage.rustleEnergy, 0.95);
      return;
    }

    const nodeSprite = this.resourceSprites.get(nodeId);
    if (nodeSprite && nodeSprite.visible && !nodeSprite.getData('isHitRecoiling')) {
      nodeSprite.setData('isHitRecoiling', true);
      const origScaleX = nodeSprite.scaleX;
      const origScaleY = nodeSprite.scaleY;
      this.tweens.add({
        targets: nodeSprite,
        scaleX: origScaleX * 1.07,
        scaleY: origScaleY * 0.93,
        angle: tool === 'pickaxe' ? -2.5 : 3.5,
        duration: 85,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          nodeSprite.setScale(origScaleX, origScaleY);
          nodeSprite.setAngle(0);
          nodeSprite.setData('isHitRecoiling', false);
        },
      });
    }
  }

  public cancelGathering(silent = false): void {
    if (!this.isGathering) return;
    this.isGathering = false;
    this.currentGatheringNode = null;
    this.gatherActionTool = null;
    this.gatherStrikeCount = 0;
    this.gatherProgress = 0;

    this.playerSprite.setAngle(0);
    this.playerSprite.setScale(0.5, 0.5);
    this.playerSprite.setFrame(this.getDirectionRowOffset(this.playerDirection));
    this.syncLayerTransformsToBase(
      this.playerClothingLayerSlots,
      this.playerSprite,
      (this.playerTileX + this.playerTileY) * 100 + 52
    );
    this.playerToolSprite?.setVisible(false);

    this.gatherProgressBarBg.setVisible(false);
    this.gatherProgressBarFill.setVisible(false);

    this.networkSystem.broadcastActionState(
      this.playerTileX,
      this.playerTileY,
      this.playerDirection,
      'idle'
    );

    if (!silent) {
      this.spawnFloatingText(this.playerTileX, this.playerTileY, 'လုပ်ဆောင်မှု ရပ်နားလိုက်သည်', '#94a3b8');
    }
  }

  public startFishing(node: ResourceNode): void {
    if (this.fishingState || this.isGathering) return;

    // Orient character toward fishing water spot
    const dx = node.tileX - this.playerTileX;
    const dy = node.tileY - this.playerTileY;
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.playerDirection = dx >= 0 ? 'right' : 'left';
    } else {
      this.playerDirection = dy >= 0 ? 'down' : 'up';
    }

    this.fishingState = {
      node,
      phase: 'waiting',
      elapsedMs: 0,
      waitDurationMs: 1300 + Math.floor(Math.random() * 1300),
      biteDurationMs: 2800,
      cursorPos: 0.12,
      cursorDir: 1,
      sweetMin: 0.36,
      sweetMax: 0.64,
    };

    SoundSynth.playWater();
    this.spawnFloatingText(node.tileX, node.tileY, '🎣 ငါးမျှားကြိုးချလိုက်ပြီ...', '#7dd3fc');
    this.networkSystem.broadcastActionState(this.playerTileX, this.playerTileY, this.playerDirection, 'fishing');
    this.emitFishingHudState(true);
  }

  public triggerFishingCatch(): void {
    if (!this.fishingState) return;
    const fs = this.fishingState;

    if (fs.phase === 'waiting') {
      SoundSynth.playRustle();
      this.spawnFloatingText(this.playerTileX, this.playerTileY, 'စောလွန်းသေးသည် — ငါးကိုက်ချိန်စောင့်ပါ!', '#fbbf24');
      this.cancelFishing(true);
      return;
    }

    const inSweetSpot = fs.cursorPos >= fs.sweetMin && fs.cursorPos <= fs.sweetMax;
    const catchCount = inSweetSpot ? 2 : 1;
    const harvested = this.resourceSystem.harvestNode(
      fs.node,
      this.inventorySystem,
      this.mapSystem,
      catchCount
    );

    SoundSynth.playSuccess();
    const itemDef = ITEMS[harvested.item as ItemId];
    const nodeName = itemDef ? itemDef.name : harvested.item;
    this.spawnFloatingText(
      fs.node.tileX,
      fs.node.tileY,
      inSweetSpot ? `✨ အထူးအမိ! +${harvested.amount} ${nodeName}` : `+${harvested.amount} ${nodeName}`,
      inSweetSpot ? '#4ade80' : '#facc15'
    );

    this.networkSystem.broadcastHarvest(fs.node.id);
    this.renderResourceNodes();
    this.cancelFishing(true);

    this.onResourceGathered?.();
    this.onStateChanged?.();
  }

  public cancelFishing(silent = false): void {
    if (!this.fishingState) return;
    this.fishingState = null;
    this.fishingGraphics?.clear();
    this.networkSystem.broadcastActionState(this.playerTileX, this.playerTileY, this.playerDirection, 'idle');
    this.onFishingStateChange?.(null);
    if (!silent) {
      this.spawnFloatingText(this.playerTileX, this.playerTileY, 'ငါးမျှားခြင်း ရပ်နားလိုက်သည်', '#94a3b8');
    }
  }

  private emitFishingHudState(force = false): void {
    if (!this.onFishingStateChange) return;
    if (!this.fishingState) {
      this.onFishingStateChange(null);
      return;
    }
    const now = Date.now();
    if (!force && now - this.fishingHudLastEmit < 32) return;
    this.fishingHudLastEmit = now;

    const fs = this.fishingState;
    this.onFishingStateChange({
      active: true,
      phase: fs.phase,
      cursorPos: fs.cursorPos,
      sweetMin: fs.sweetMin,
      sweetMax: fs.sweetMax,
      timeLeftRatio: fs.phase === 'bite' ? Math.max(0, 1 - fs.elapsedMs / fs.biteDurationMs) : 1,
    });
  }

  private drawFishingRodVisual(
    g: Phaser.GameObjects.Graphics,
    casterX: number,
    casterY: number,
    direction: 'down' | 'left' | 'right' | 'up',
    targetX: number,
    targetY: number,
    time: number,
    isBiting: boolean
  ): void {
    const dirVec =
      direction === 'right'
        ? { hx: 9, hy: -18, tx: 22, ty: -29 }
        : direction === 'left'
        ? { hx: -9, hy: -18, tx: -22, ty: -29 }
        : direction === 'up'
        ? { hx: 6, hy: -21, tx: 14, ty: -33 }
        : { hx: 7, hy: -15, tx: 16, ty: -27 };

    const handX = casterX + dirVec.hx;
    const handY = casterY + 16 + dirVec.hy;
    const rodTipX = casterX + dirVec.tx;
    const rodTipY = casterY + 16 + dirVec.ty + (isBiting ? Math.sin(time * 0.025) * 2.2 : Math.sin(time * 0.004) * 0.7);

    // Wooden rod shaft & warm handle
    g.lineStyle(2.4, 0x78350f, 1);
    g.beginPath();
    g.moveTo(handX, handY);
    g.lineTo(rodTipX, rodTipY);
    g.strokePath();

    // Subtle rod tip flex highlight
    g.lineStyle(1.4, 0xd97706, 1);
    g.beginPath();
    g.moveTo(handX + (rodTipX - handX) * 0.45, handY + (rodTipY - handY) * 0.45);
    g.lineTo(rodTipX, rodTipY);
    g.strokePath();

    // Bobber position in water
    const bobOffset = isBiting ? Math.sin(time * 0.028) * 3.5 : Math.sin(time * 0.005) * 1.4;
    const bobX = targetX;
    const bobY = targetY + 14 + bobOffset;

    // Fishing line
    g.lineStyle(1, 0xe2e8f0, 0.85);
    g.beginPath();
    g.moveTo(rodTipX, rodTipY);
    g.lineTo(bobX, bobY);
    g.strokePath();

    // Water ripple rings around bobber
    const rippleRadius = isBiting ? 9 + ((time * 0.018) % 6) : 5 + ((time * 0.006) % 4);
    g.lineStyle(isBiting ? 1.8 : 1.1, isBiting ? 0xfacc15 : 0x7dd3fc, isBiting ? 0.85 : 0.55);
    g.strokeEllipse(bobX, targetY + 15, rippleRadius * 2, rippleRadius);

    // Red-and-white float bobber
    g.fillStyle(0xffffff, 1);
    g.fillCircle(bobX, bobY + 1.5, 2.5);
    g.fillStyle(isBiting ? 0xfacc15 : 0xef4444, 1);
    g.fillCircle(bobX, bobY - 0.8, 2.5);
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

    // Reset gathering state & return cleanly to Idle
    this.isGathering = false;
    this.currentGatheringNode = null;
    this.gatherActionTool = null;
    this.gatherStrikeCount = 0;
    this.gatherProgress = 0;

    this.playerSprite.setAngle(0);
    this.playerSprite.setScale(0.5, 0.5);
    this.playerSprite.setFrame(this.getDirectionRowOffset(this.playerDirection));
    this.syncLayerTransformsToBase(
      this.playerClothingLayerSlots,
      this.playerSprite,
      (this.playerTileX + this.playerTileY) * 100 + 52
    );
    this.playerToolSprite?.setVisible(false);

    this.gatherProgressBarBg.setVisible(false);
    this.gatherProgressBarFill.setVisible(false);

    this.networkSystem.broadcastActionState(
      this.playerTileX,
      this.playerTileY,
      this.playerDirection,
      'idle'
    );

    if (this.onResourceGathered) {
      this.onResourceGathered();
    }
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
    }).setOrigin(0.5).setDepth(25060);

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

  private updateAnimatedFish(time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    for (const fish of this.animatedFish) {
      // Gentle burst-and-glide swim rhythm + curved shoreline avoidance lookahead (zero allocations)
      const glide = 0.78 + 0.28 * Math.sin(time * 0.0028 + fish.phase);
      const lookX = Math.round(fish.tileX + fish.vx * 0.55);
      const lookY = Math.round(fish.tileY + fish.vy * 0.55);
      const lookClear = this.mapSystem.isTileInBounds(lookX, lookY) && this.mapSystem.tiles[lookY][lookX] === 'water';

      if (!lookClear) {
        const turnAngle = (fish.phase % 2 > 1 ? 1 : -1) * 1.35 * dt;
        const cosA = Math.cos(turnAngle);
        const sinA = Math.sin(turnAngle);
        const rvx = fish.vx * cosA - fish.vy * sinA;
        const rvy = fish.vx * sinA + fish.vy * cosA;
        fish.vx = rvx;
        fish.vy = rvy;
      }

      const nextX = fish.tileX + fish.vx * glide * dt;
      const nextY = fish.tileY + fish.vy * glide * dt;
      const checkX = Math.round(nextX);
      const checkY = Math.round(nextY);

      if (
        this.mapSystem.isTileInBounds(checkX, checkY) &&
        this.mapSystem.tiles[checkY][checkX] === 'water'
      ) {
        fish.tileX = nextX;
        fish.tileY = nextY;
      } else {
        // Gentle curved deflection inside water without ever stepping on shore
        const turnX = -fish.vx * 0.78 + fish.vy * 0.58;
        const turnY = -fish.vy * 0.78 - fish.vx * 0.58;
        fish.vx = Math.abs(turnX) < 0.08 && Math.abs(turnY) < 0.08 ? -fish.vx : turnX;
        fish.vy = Math.abs(turnX) < 0.08 && Math.abs(turnY) < 0.08 ? -fish.vy : turnY;
      }

      const { x, y } = MapSystem.tileToWorld(fish.tileX, fish.tileY);
      const bobY = Math.sin(time * 0.0038 + fish.phase) * 1.5;
      fish.sprite.setPosition(x, y + 16 + bobY);
      fish.sprite.setDepth(-4);
      fish.sprite.setRotation(Math.sin(time * 0.005 + fish.phase) * 0.06);

      const expectedTex = fish.vx - fish.vy >= 0 ? 'obj_swim_fish_r' : 'obj_swim_fish_l';
      if (fish.sprite.texture.key !== expectedTex) {
        fish.sprite.setTexture(expectedTex);
      }
    }
  }

  private updateAnimatedWaterEnvironment(time: number, sunlightFactor = 1): void {
    const camView = this.cameras.main.worldView;
    const hasCam = camView.width > 0 && camView.height > 0;
    const pad = 120;
    const shimmerMul = 0.42 + 0.58 * sunlightFactor;

    for (const item of this.animatedWaterProps) {
      if (hasCam) {
        const sx = item.sprite.x;
        const sy = item.sprite.y;
        if (sx < camView.x - pad || sx > camView.right + pad || sy < camView.y - pad || sy > camView.bottom + pad) {
          continue;
        }
      }
      if (item.kind === 'shimmer') {
        item.sprite.setAlpha((0.24 + 0.52 * (0.5 + 0.5 * Math.sin(time * item.speed + item.phase))) * shimmerMul);
      } else if (item.kind === 'reflection') {
        item.sprite.setAlpha((0.18 + 0.30 * (0.5 + 0.5 * Math.sin(time * item.speed + item.phase))) * shimmerMul);
      } else if (item.kind === 'lily') {
        item.sprite.y = item.baseY - 1 + Math.sin(time * item.speed + item.phase) * 1.1;
      } else if (item.kind === 'reed') {
        item.sprite.angle = Math.sin(time * item.speed + item.phase) * 2.6;
      }
    }
  }

  public update(time: number, delta: number): void {
    const dt = Math.min(0.05, Math.max(0, delta) / 1000);

    // 0. Step 5 World Atmosphere & Weather + Step 6 Camera-Culled Flora, Wildlife & Water + Ground Chunks
    this.updateVisibleGroundChunks();
    this.updateAtmosphereAndWeather(time, dt);
    this.updateAnimatedFish(time, delta);
    this.updateAnimatedWaterEnvironment(time, this.currentAtmosphereSnapshot?.sunlightFactor ?? 1);
    this.updateStep6EnvironmentAndWildlife(time, dt, delta);

    // Read current directional input first so movement never gets frozen stubbornly during gather actions
    let keyX = 0;
    let keyY = 0;

    if (!this.isShortcutBlocked() && this.cursors && this.keyW) {
      if (this.cursors.left.isDown || this.keyA.isDown) keyX -= 1;
      if (this.cursors.right.isDown || this.keyD.isDown) keyX += 1;
      if (this.cursors.up.isDown || this.keyW.isDown) keyY -= 1;
      if (this.cursors.down.isDown || this.keyS.isDown) keyY += 1;
    }

    const keyNorm = WorldScene.normalizeMovementInput(keyX, keyY, false);
    const joyNorm = this.isUiOverlayOpen
      ? { x: 0, y: 0, magnitude: 0 }
      : WorldScene.normalizeMovementInput(this.joystickVector.x, this.joystickVector.y, true);
    const activeInput = joyNorm.magnitude > 0 ? joyNorm : keyNorm;

    const targetMoveX = activeInput.x;
    const targetMoveY = activeInput.y;
    const targetMag = activeInput.magnitude;

    // 1. Handle active gathering animation, hit impacts & voluntary walk-cancel
    if (this.isGathering && this.currentGatheringNode) {
      if (targetMag > 0.25 && this.gatherProgress > 180) {
        this.cancelGathering(true);
      } else {
        this.gatherProgress += delta;

        // Update progress bar above player
        const { x: px, y: py } = MapSystem.tileToWorld(this.playerTileX, this.playerTileY);
        const barW = 44;
        const barH = 6;
        const bx = px - barW / 2;
        const by = py - 36;
        const ratio = Math.min(1, this.gatherProgress / this.gatherTotalDuration);

        this.gatherProgressBarBg.clear();
        this.gatherProgressBarBg.fillStyle(0x1c1917, 0.9);
        this.gatherProgressBarBg.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

        this.gatherProgressBarFill.clear();
        this.gatherProgressBarFill.fillStyle(0x22c55e, 1);
        this.gatherProgressBarFill.fillRect(bx, by, barW * ratio, barH);

        // Animate 4-direction tool swing + synced strike particles/sounds
        const activeTool =
          this.gatherActionTool ||
          WorldScene.getToolForResourceNode(this.currentGatheringNode.type) ||
          'axe';
        const playerDepth = (this.playerTileX + this.playerTileY) * 100 + 52;
        this.playerSprite.setDepth(playerDepth);
        const pose = this.applyToolSwingVisual(
          this.playerSprite,
          this.playerToolSprite,
          px,
          py + 16,
          playerDepth,
          this.playerDirection,
          activeTool,
          this.gatherProgress
        );
        this.syncLayerTransformsToBase(this.playerClothingLayerSlots, this.playerSprite, playerDepth);

        if (pose.hitBeatIndex > this.gatherStrikeCount) {
          this.gatherStrikeCount = pose.hitBeatIndex;
          if (activeTool === 'axe') SoundSynth.playChop();
          else if (activeTool === 'pickaxe') SoundSynth.playPickaxe();
          else SoundSynth.playRustle();

          this.spawnToolImpactEffects(
            this.currentGatheringNode.tileX,
            this.currentGatheringNode.tileY,
            activeTool,
            this.currentGatheringNode.id
          );
        }

        if (this.gatherProgress >= this.gatherTotalDuration) {
          this.finishGathering();
        }
        this.updateCameraPresentation(dt);
        return;
      }
    }

    // Smooth FPS-independent velocity ramp (~20/s -> crisp stop & silky acceleration)
    const velAlpha = WorldScene.computeExponentialLerpAlpha(20, dt);
    this.smoothMoveX += (targetMoveX - this.smoothMoveX) * velAlpha;
    this.smoothMoveY += (targetMoveY - this.smoothMoveY) * velAlpha;
    if (targetMag === 0 && Math.hypot(this.smoothMoveX, this.smoothMoveY) < 0.015) {
      this.smoothMoveX = 0;
      this.smoothMoveY = 0;
    }

    const moveX = this.smoothMoveX;
    const moveY = this.smoothMoveY;
    const activeMoveMag = Math.min(1, Math.hypot(moveX, moveY));
    this.isMoving = targetMag > 0 || activeMoveMag > 0.015;

    // Cancel fishing if player walks away
    if (this.fishingState && this.isMoving) {
      this.cancelFishing(false);
    }

    if (this.fishingState) {
      const fs = this.fishingState;
      fs.elapsedMs += delta;
      if (fs.phase === 'waiting') {
        if (fs.elapsedMs >= fs.waitDurationMs) {
          fs.phase = 'bite';
          fs.elapsedMs = 0;
          SoundSynth.playCoin();
          this.spawnFloatingText(fs.node.tileX, fs.node.tileY, '🐟 ငါးကိုက်ပြီ! [E]', '#4ade80');
          this.emitFishingHudState(true);
        } else {
          this.emitFishingHudState(false);
        }
      } else {
        fs.cursorPos += fs.cursorDir * (delta / 560);
        if (fs.cursorPos >= 0.94) {
          fs.cursorPos = 0.94;
          fs.cursorDir = -1;
        } else if (fs.cursorPos <= 0.06) {
          fs.cursorPos = 0.06;
          fs.cursorDir = 1;
        }
        if (fs.elapsedMs >= fs.biteDurationMs) {
          SoundSynth.playRustle();
          this.spawnFloatingText(fs.node.tileX, fs.node.tileY, 'ငါးလွတ်သွားပြီ!', '#f87171');
          this.cancelFishing(true);
        } else {
          this.emitFishingHudState(false);
        }
      }
    }

    const rowOffset = this.getDirectionRowOffset(this.playerDirection);
    const activeSpeed = this.getEffectiveMoveSpeed();

    if (this.isMoving && activeMoveMag > 0.001) {
      // Delta-time normalized movement (constant speed across grass, roads, sand & bridges; exact keyboard/joystick parity)
      const { dx, dy } = WorldScene.computeStepVector(moveX, moveY, delta, activeSpeed, true);
      const nextX = this.playerTileX + dx;
      const nextY = this.playerTileY + dy;

      // Update dominant character facing direction smoothly from intended input vector
      const faceX = targetMag > 0 ? targetMoveX : moveX;
      const faceY = targetMag > 0 ? targetMoveY : moveY;
      if (Math.abs(faceX) >= Math.abs(faceY)) {
        if (Math.abs(faceX) > 0.01) this.playerDirection = faceX > 0 ? 'right' : 'left';
      } else {
        if (Math.abs(faceY) > 0.01) this.playerDirection = faceY > 0 ? 'down' : 'up';
      }

      const targetIntX = Math.round(nextX);
      const targetIntY = Math.round(nextY);
      const targetTile = this.mapSystem.isTileInBounds(targetIntX, targetIntY)
        ? this.mapSystem.tiles[targetIntY][targetIntX]
        : null;
      const isCurrentlyStuck = !this.isPositionWalkable(this.playerTileX, this.playerTileY);

      if (this.isPositionWalkable(nextX, nextY)) {
        this.playerTileX = nextX;
        this.playerTileY = nextY;
      } else if (isCurrentlyStuck && targetTile && targetTile !== 'water' && targetTile !== 'cliff') {
        // Player overlaps an obstacle edge: allow stepping out safely onto dry land, never into water/cliffs
        this.playerTileX = nextX;
        this.playerTileY = nextY;
      } else {
        // Smooth sub-tile axis sliding & narrow bridge/pier/riverbank entrance funneling
        let funneled = false;
        const r = WorldScene.PLAYER_COLLISION_RADIUS;
        const curTileX = Math.round(this.playerTileX);
        const curTileY = Math.round(this.playerTileY);

        const isNarrowBridgeOrBank = (tx: number, ty: number, axis: 'x' | 'y'): boolean => {
          if (!this.mapSystem.isTileInBounds(tx, ty) || !this.mapSystem.isWalkable(tx, ty)) return false;
          const t = this.mapSystem.tiles[ty][tx];
          if (t === 'bridge') return true;
          if (t !== 'dirt' && t !== 'cobble') return false;
          if (axis === 'x') {
            const topW = this.mapSystem.isTileInBounds(tx, ty - 1) && this.mapSystem.tiles[ty - 1][tx] === 'water';
            const botW = this.mapSystem.isTileInBounds(tx, ty + 1) && this.mapSystem.tiles[ty + 1][tx] === 'water';
            return topW || botW;
          }
          const leftW = this.mapSystem.isTileInBounds(tx - 1, ty) && this.mapSystem.tiles[ty][tx - 1] === 'water';
          const rightW = this.mapSystem.isTileInBounds(tx + 1, ty) && this.mapSystem.tiles[ty][tx + 1] === 'water';
          return leftW || rightW;
        };

        // 1) Moving predominantly E/W toward a narrow bridge, pier, or water-flanked riverbank: center Y onto the path
        if (
          Math.abs(dx) > 0.0005 &&
          Math.abs(dx) >= Math.abs(dy) * 1.15 &&
          !this.isPositionWalkable(nextX, this.playerTileY)
        ) {
          const frontX = Math.round(nextX + Math.sign(dx) * r);
          if (isNarrowBridgeOrBank(frontX, curTileY, 'x')) {
            const errY = curTileY - this.playerTileY;
            if (Math.abs(errY) > 0.008 && Math.abs(errY) <= 0.55) {
              const nudgeY =
                Math.sign(errY) * Math.min(Math.abs(errY), Math.max(Math.abs(dx) * 1.25, activeSpeed * dt * 0.85));
              const candY = this.playerTileY + nudgeY;
              if (this.isPositionWalkable(this.playerTileX, candY)) {
                this.playerTileY = candY;
                if (this.isPositionWalkable(nextX, candY)) {
                  this.playerTileX = nextX;
                }
                funneled = true;
              }
            }
          }
        }

        // 2) Moving predominantly N/S toward a narrow bridge, pier, or water-flanked riverbank: center X onto the path
        if (
          !funneled &&
          Math.abs(dy) > 0.0005 &&
          Math.abs(dy) >= Math.abs(dx) * 1.15 &&
          !this.isPositionWalkable(this.playerTileX, nextY)
        ) {
          const frontY = Math.round(nextY + Math.sign(dy) * r);
          if (isNarrowBridgeOrBank(curTileX, frontY, 'y')) {
            const errX = curTileX - this.playerTileX;
            if (Math.abs(errX) > 0.008 && Math.abs(errX) <= 0.55) {
              const nudgeX =
                Math.sign(errX) * Math.min(Math.abs(errX), Math.max(Math.abs(dy) * 1.25, activeSpeed * dt * 0.85));
              const candX = this.playerTileX + nudgeX;
              if (this.isPositionWalkable(candX, this.playerTileY)) {
                this.playerTileX = candX;
                if (this.isPositionWalkable(candX, nextY)) {
                  this.playerTileY = nextY;
                }
                funneled = true;
              }
            }
          }
        }

        // 3) Standard axis-sliding fallback along walls, trees, fences & lakeshores
        if (!funneled) {
          if (dx !== 0 && this.isPositionWalkable(nextX, this.playerTileY)) {
            this.playerTileX = nextX;
          } else if (dy !== 0 && this.isPositionWalkable(this.playerTileX, nextY)) {
            this.playerTileY = nextY;
          }
        }
      }

      // Smooth speed-coupled 4-beat Stardew walking gait [idle, leftStride, idle, rightStride]
      const activeRowOffset = this.getDirectionRowOffset(this.playerDirection);
      this.playerAnimCycle += dt * (activeSpeed * 1.65 * Math.max(0.55, activeMoveMag));
      const walkStep = WorldScene.WALK_FRAME_SEQUENCE[Math.floor(this.playerAnimCycle) % 4];
      this.playerLastStep = walkStep;
      this.playerSettleMs = walkStep !== 0 ? 85 : 0;
      this.playerSprite.setFrame(activeRowOffset + walkStep);

      // Accumulator-throttled network movement broadcast (~90ms cadence)
      this.netPositionAccumMs += delta;
      if (this.netPositionAccumMs >= 90) {
        this.netPositionAccumMs = 0;
        this.networkSystem.broadcastPosition(this.playerTileX, this.playerTileY, this.playerDirection, true);
      }
      this.wasMovingLastFrame = true;
    } else {
      // Smooth walk-to-idle step recovery before gentle planted breathing [0 <-> 3]
      if (this.playerSettleMs > 0) {
        this.playerSettleMs = Math.max(0, this.playerSettleMs - delta);
        this.playerSprite.setFrame(rowOffset + (this.playerSettleMs > 30 ? this.playerLastStep : 0));
      } else {
        this.playerLastStep = 0;
        this.playerAnimCycle = 0;
        const breathStep = Math.floor(time / 880) % 2 === 0 ? 0 : 3;
        this.playerSprite.setFrame(rowOffset + breathStep);
      }

      if (this.wasMovingLastFrame) {
        this.wasMovingLastFrame = false;
        this.netPositionAccumMs = 0;
        this.networkSystem.broadcastActionState(
          this.playerTileX,
          this.playerTileY,
          this.playerDirection,
          this.fishingState ? 'fishing' : 'idle'
        );
      }
    }

    // 3. Update Player Isometric Screen Position, Depth Sorting & Stride-Synced Ground Shadow
    const { x: pScreenX, y: pScreenY } = MapSystem.tileToWorld(this.playerTileX, this.playerTileY);
    const playerDepth = (this.playerTileX + this.playerTileY) * 100 + 52;
    this.playerSprite.setPosition(pScreenX, pScreenY + 16);
    this.playerSprite.setDepth(playerDepth);
    this.syncLayerTransformsToBase(this.playerClothingLayerSlots, this.playerSprite, playerDepth);

    if (this.playerShadow) {
      const isPlayerStride = (this.isMoving && this.playerLastStep !== 0) || this.playerSettleMs > 30;
      this.playerShadow.setPosition(pScreenX + 1.5, pScreenY + 16.5);
      this.playerShadow.setDepth((this.playerTileX + this.playerTileY) * 100 + 21);
      this.playerShadow.setScale(isPlayerStride ? 0.89 : 0.96, isPlayerStride ? 0.67 : 0.72);
      this.playerShadow.setAlpha(isPlayerStride ? 0.44 : 0.5);
    }

    this.playerNameText.setPosition(pScreenX, pScreenY - 32);

    // 3A. Roof, Tall Tree Canopy & Tall Landmark Occlusion Peek-Through
    this.updateBuildingOcclusion(pScreenX, pScreenY + 16, playerDepth, dt);

    // 3A-2. FPS-Independent Smooth Camera Follow, Zoom Interpolation & Bounds Clamping
    this.updateCameraPresentation(dt);

    // 3B. Render local player fishing rod & bobber
    this.fishingGraphics.clear();
    if (this.fishingState) {
      const targetPos = MapSystem.tileToWorld(this.fishingState.node.tileX, this.fishingState.node.tileY);
      const fishDepthSum = Math.max(
        this.playerTileX + this.playerTileY,
        this.fishingState.node.tileX + this.fishingState.node.tileY
      );
      this.fishingGraphics.setDepth(fishDepthSum * 100 + 62);
      this.drawFishingRodVisual(
        this.fishingGraphics,
        pScreenX,
        pScreenY,
        this.playerDirection,
        targetPos.x,
        targetPos.y,
        time,
        this.fishingState.phase === 'bite'
      );
    }

    // 3.5 Smoothly Interpolate Remote Players, Independent Animation States, Shadows & Remote Fishing
    this.remoteFishingGraphics.clear();
    let maxRemoteFishDepthSum = -1;
    const remoteLerp = 1 - Math.exp(-12 * dt);
    for (const [id, peer] of this.networkSystem.remotePlayers) {
      const entry = this.getOrCreateRemoteSprite(id, peer);
      const prevTileX = peer.tileX;
      const prevTileY = peer.tileY;

      const gapDist = Math.hypot(peer.targetTileX - peer.tileX, peer.targetTileY - peer.tileY);
      if (gapDist > 6) {
        // Snap cleanly after a large teleport or initial reconnect
        peer.tileX = peer.targetTileX;
        peer.tileY = peer.targetTileY;
      } else {
        peer.tileX += (peer.targetTileX - peer.tileX) * remoteLerp;
        peer.tileY += (peer.targetTileY - peer.tileY) * remoteLerp;
        if (Math.hypot(peer.targetTileX - peer.tileX, peer.targetTileY - peer.tileY) < 0.01) {
          peer.tileX = peer.targetTileX;
          peer.tileY = peer.targetTileY;
        }
      }

      const stepDist = Math.hypot(peer.tileX - prevTileX, peer.tileY - prevTileY);
      const remainingDist = Math.hypot(peer.targetTileX - peer.tileX, peer.targetTileY - peer.tileY);
      const isPeerMoving = peer.isMoving || stepDist > 0.0025 || remainingDist > 0.04;

      const { x: rx, y: ry } = MapSystem.tileToWorld(peer.tileX, peer.tileY);
      entry.sprite.setPosition(rx, ry + 16);
      entry.sprite.setDepth((peer.tileX + peer.tileY) * 100 + 52);
      entry.nameText.setPosition(rx, ry - 30);

      const rRow = this.getDirectionRowOffset(peer.direction);
      let rStrideActive = false;

      if (isPeerMoving) {
        entry.gatherElapsedMs = 0;
        entry.lastGatherStrike = 0;
        entry.toolSprite.setVisible(false);
        entry.sprite.setAngle(0);
        entry.sprite.setScale(0.5, 0.5);

        const effSpeed = Math.max(
          dt > 0 ? stepDist / dt : 0,
          peer.isMoving ? WorldScene.MOVE_SPEED_TILES_PER_SEC * 0.9 : 2.5
        );
        entry.animCycle += dt * Math.min(6.0, effSpeed) * 1.65;
        const rWalkStep = WorldScene.WALK_FRAME_SEQUENCE[Math.floor(entry.animCycle) % 4];
        entry.lastStep = rWalkStep;
        entry.settleMs = rWalkStep !== 0 ? 85 : 0;
        rStrideActive = rWalkStep !== 0;
        entry.sprite.setFrame(rRow + rWalkStep);
      } else if (entry.settleMs > 0) {
        entry.gatherElapsedMs = 0;
        entry.toolSprite.setVisible(false);
        entry.sprite.setAngle(0);
        entry.sprite.setScale(0.5, 0.5);
        entry.settleMs = Math.max(0, entry.settleMs - delta);
        rStrideActive = entry.settleMs > 30;
        entry.sprite.setFrame(rRow + (rStrideActive ? entry.lastStep : 0));
      } else if (peer.action === 'gathering') {
        entry.lastStep = 0;
        entry.animCycle = 0;
        entry.gatherElapsedMs += delta;
        const rTool = peer.actionTool || 'axe';
        const rDepth = (peer.tileX + peer.tileY) * 100 + 52;
        const rPose = this.applyToolSwingVisual(
          entry.sprite,
          entry.toolSprite,
          rx,
          ry + 16,
          rDepth,
          peer.direction,
          rTool,
          entry.gatherElapsedMs
        );
        if (rPose.hitBeatIndex > entry.lastGatherStrike) {
          entry.lastGatherStrike = rPose.hitBeatIndex;
          const dx = peer.direction === 'right' ? 0.75 : peer.direction === 'left' ? -0.75 : 0;
          const dy = peer.direction === 'down' ? 0.75 : peer.direction === 'up' ? -0.75 : 0;
          this.spawnToolImpactEffects(peer.tileX + dx, peer.tileY + dy, rTool);
        }
      } else if (peer.action === 'fishing') {
        entry.gatherElapsedMs = 0;
        entry.lastGatherStrike = 0;
        entry.toolSprite.setVisible(false);
        entry.sprite.setAngle(0);
        entry.sprite.setScale(0.5, 0.5);
        entry.lastStep = 0;
        entry.animCycle = 0;
        entry.sprite.setFrame(rRow);
        const dirDx = peer.direction === 'right' ? 1.2 : peer.direction === 'left' ? -1.2 : 0;
        const dirDy = peer.direction === 'down' ? 1.2 : peer.direction === 'up' ? -1.2 : 0;
        maxRemoteFishDepthSum = Math.max(maxRemoteFishDepthSum, peer.tileX + peer.tileY + Math.max(0, dirDx + dirDy));
        const bobTarget = MapSystem.tileToWorld(peer.tileX + dirDx, peer.tileY + dirDy);
        this.drawFishingRodVisual(
          this.remoteFishingGraphics,
          rx,
          ry,
          peer.direction,
          bobTarget.x,
          bobTarget.y,
          time,
          false
        );
      } else {
        entry.gatherElapsedMs = 0;
        entry.lastGatherStrike = 0;
        entry.toolSprite.setVisible(false);
        entry.sprite.setAngle(0);
        entry.sprite.setScale(0.5, 0.5);
        entry.lastStep = 0;
        entry.animCycle = 0;
        const rBreathStep = Math.floor((time + entry.phaseOffset * 1000) / 880) % 2 === 0 ? 0 : 3;
        entry.sprite.setFrame(rRow + rBreathStep);
      }

      this.syncLayerTransformsToBase(
        entry.clothingLayers,
        entry.sprite,
        (peer.tileX + peer.tileY) * 100 + 52
      );

      const rShadow = this.remotePlayerShadows.get(id);
      if (rShadow) {
        rShadow.setPosition(rx + 1.5, ry + 16.5);
        rShadow.setDepth((peer.tileX + peer.tileY) * 100 + 21);
        rShadow.setScale(rStrideActive ? 0.89 : 0.95, rStrideActive ? 0.67 : 0.72);
        rShadow.setAlpha(rStrideActive ? 0.43 : 0.48);
      }
    }
    if (maxRemoteFishDepthSum >= 0) {
      this.remoteFishingGraphics.setDepth(maxRemoteFishDepthSum * 100 + 62);
    }

    // 3.8 Animate Village NPCs with staggered, independent Idle Breathing & Short Post-Patrol Walk Cycles
    for (const npc of this.townNpcs) {
      const localMs = (time + npc.offsetMs) % npc.cyclePeriodMs;
      const tNorm = localMs / npc.cyclePeriodMs;

      let ox = 0;
      let oy = 0;
      let facing: 'down' | 'left' | 'right' | 'up' = npc.defaultDir;
      let step = 0;

      // Micro-walk travel span (~6px within tile footprint so NPCs never clip neighbors)
      const strideRadiusX = npc.role === 'elder' || npc.role === 'farmer' || npc.role === 'settler' ? 6.5 : 5.0;
      const strideRadiusY = npc.role === 'blacksmith' ? -3.0 : 1.5;

      if (tNorm < 0.48) {
        // Calm idle breathing facing stall/plaza (boots firmly planted)
        facing = npc.defaultDir;
        step = Math.floor((localMs + npc.phase * 250) / 920) % 2 === 0 ? 0 : 3;
      } else if (tNorm < 0.66) {
        // Short walk out to tend goods / patrol post
        const p = (tNorm - 0.48) / 0.18;
        const ease = p * p * (3 - 2 * p);
        ox = strideRadiusX * ease;
        oy = strideRadiusY * ease;
        facing = Math.abs(strideRadiusY) > Math.abs(strideRadiusX) ? (strideRadiusY < 0 ? 'up' : 'down') : 'right';
        step = WorldScene.WALK_FRAME_SEQUENCE[Math.floor(localMs / 150) % 4];
      } else if (tNorm < 0.82) {
        // Brief pause & inspect stall / stretch
        ox = strideRadiusX;
        oy = strideRadiusY;
        facing = npc.role === 'blacksmith' ? 'up' : 'down';
        step = Math.floor(localMs / 860) % 2 === 0 ? 0 : 3;
      } else {
        // Walk smoothly back to resting spot
        const p = (tNorm - 0.82) / 0.18;
        const ease = 1 - p * p * (3 - 2 * p);
        ox = strideRadiusX * ease;
        oy = strideRadiusY * ease;
        facing = Math.abs(strideRadiusY) > Math.abs(strideRadiusX) ? (strideRadiusY < 0 ? 'down' : 'up') : 'left';
        step = WorldScene.WALK_FRAME_SEQUENCE[Math.floor(localMs / 150) % 4];
      }

      const nx = npc.baseX + ox;
      const ny = npc.baseY + oy;
      const npcDepthSum = npc.tileX + npc.tileY + oy / 16;
      npc.sprite.setPosition(nx, ny);
      npc.sprite.setDepth(npcDepthSum * 100 + 52);
      npc.sprite.setFrame(this.getDirectionRowOffset(facing) + step);
      npc.nameText.setPosition(nx, ny - 44);

      const isNpcStride = step === 1 || step === 2;
      npc.shadow.setPosition(nx + 1.5, ny + 0.5);
      npc.shadow.setDepth(npcDepthSum * 100 + 21);
      npc.shadow.setScale(isNpcStride ? 0.86 : 0.92, isNpcStride ? 0.64 : 0.68);
      npc.shadow.setAlpha(isNpcStride ? 0.41 : 0.46);
    }

    // 4. Update Interaction Proximity Detection & Merchant Compass Guide
    this.checkNearbyInteractions();
    this.updateMerchantGuide();

    // 5. Notify React of player position ONLY on tile/zone change (eliminates 60fps React re-render storm!)
    const intX = Math.round(this.playerTileX);
    const intY = Math.round(this.playerTileY);

    if (
      this.lastReportedTileX !== intX ||
      this.lastReportedTileY !== intY ||
      this.lastReportedZone === ''
    ) {
      const currentZone = this.mapSystem.getZoneAt(intX, intY);
      const isInitial = this.lastReportedTileX === -999;
      const zoneChanged = !isInitial && this.lastReportedZone !== currentZone.name;
      this.lastReportedTileX = intX;
      this.lastReportedTileY = intY;
      this.lastReportedZone = currentZone.name;
      if (this.onPlayerMove) {
        this.onPlayerMove(intX, intY, currentZone.name);
      }
      if (zoneChanged && this.onZoneEntered) {
        this.onZoneEntered(currentZone);
      }
      if (!isInitial && this.onStateChanged) {
        this.onStateChanged();
      }
    }
  }

  private updateBuildingOcclusion(playerFootX: number, playerFootY: number, playerDepth: number, dt: number): void {
    const fadeFactor = Math.min(1, dt * 12);
    const playerHeadY = playerFootY - 26;
    const applyPeekFade = (
      bSprite: Phaser.GameObjects.Sprite,
      minCheckHeight: number,
      occludedAlpha: number,
      xInset = 12,
      bottomInset = 16
    ) => {
      if (!bSprite.visible || bSprite.height < minCheckHeight) return;

      // Fast distance cull with zero object allocations; smoothly restore if previously faded
      const nearCheck =
        Math.abs(bSprite.x - playerFootX) <= 220 && Math.abs(bSprite.y - playerFootY) <= 220;

      let occluded = false;
      if (nearCheck && playerDepth < bSprite.depth) {
        const w = bSprite.displayWidth;
        const h = bSprite.displayHeight;
        const left = bSprite.x - w * bSprite.originX;
        const right = left + w;
        const top = bSprite.y - h * bSprite.originY;
        const bottom = top + h;
        if (
          playerFootX >= left + xInset &&
          playerFootX <= right - xInset &&
          playerFootY >= top + 8 &&
          playerHeadY <= bottom - bottomInset
        ) {
          occluded = true;
        }
      }

      const targetAlpha = occluded ? occludedAlpha : 1;
      if (Math.abs(bSprite.alpha - targetAlpha) > 0.01) {
        bSprite.setAlpha(bSprite.alpha + (targetAlpha - bSprite.alpha) * fadeFactor);
      } else if (bSprite.alpha !== targetAlpha) {
        bSprite.setAlpha(targetAlpha);
      }
    };

    for (const bSprite of this.townBuildingSprites) {
      applyPeekFade(bSprite, 100, 0.58, 12, 16);
    }
    for (const bSprite of this.buildingSprites.values()) {
      applyPeekFade(bSprite, 100, 0.58, 12, 16);
    }
    for (const lSprite of this.tallLandmarkSprites) {
      applyPeekFade(lSprite, 64, 0.56, 10, 14);
    }
    for (const tb of this.interactiveTreesAndBushes) {
      if (!tb.isTree) continue;
      applyPeekFade(tb.sprite, 64, 0.50, 12, 18);
    }
  }

  private emitInteractionPrompt(
    prompt: { type: string; title: string; subtitle: string; actionKey: string; targetId: string } | null
  ): void {
    const nextId = prompt ? prompt.targetId : null;
    if (nextId === this.lastEmittedTargetId) return;
    this.lastEmittedTargetId = nextId;
    if (this.onInteractionChange) {
      this.onInteractionChange(prompt);
    }
  }

  private checkNearbyInteractions(): void {
    const ptx = this.playerTileX;
    const pty = this.playerTileY;

    // A. Shops (General Store 24,28 | Grocery 24,35 | Outdoor Market 35,33)
    const distGeneral = Math.hypot(ptx - 24, pty - 28);
    const distGrocery = Math.hypot(ptx - 24, pty - 35);
    const distMarket = Math.hypot(ptx - 35, pty - 33);
    this.isNearShop = distGeneral <= 2.05 || distGrocery <= 2.05 || distMarket <= 2.0;

    // A2. Aunty Gyi Clothing Boutique (27, 25 entrance) — Closed / Coming Soon
    const distClothingShop = Math.hypot(ptx - AUNTY_GYI_LOCATION.tileX, pty - AUNTY_GYI_LOCATION.tileY);
    this.isNearClothingShop = distClothingShop <= AUNTY_GYI_LOCATION.interactionRange;

    // B. Crafting Station / Blacksmith Forge (33, 25 and 34, 25)
    const distCraft = Math.min(Math.hypot(ptx - 33, pty - 25), Math.hypot(ptx - 34, pty - 25));
    this.isNearCraftStation = distCraft <= 2.05;

    // C. Friendly Village NPCs (Bakery, Florist, Elder, Farmer)
    this.nearbyVillageNpc = null;
    if (Math.hypot(ptx - 24, pty - 24) <= 1.9) {
      this.nearbyVillageNpc = {
        role: 'baker',
        title: 'ကလာရာ၏ မုန့်ဖို (Village Bakery)',
        subtitle: 'လတ်လတ်ဆတ်ဆတ် မုန့်နံ့လေးတွေ သင်းနေပါတယ်',
        message: 'မင်္ဂလာပါ! ပူပူနွေးနွေး ပေါင်မုန့်လေးတွေ ဖုတ်နေပါတယ် 🥐',
      };
    } else if (Math.hypot(ptx - 28, pty - 36) <= 1.9) {
      this.nearbyVillageNpc = {
        role: 'florist',
        title: 'ဒေစီ၏ ပန်းဆိုင်လေး (Flower Shop)',
        subtitle: 'ရောင်စုံပန်းပွင့်လေးများဖြင့် ရွာလေးကို အလှဆင်ထားသည်',
        message: 'ရွာပန်းခြံအတွက် ပန်းလှလှလေးတွေ ပြုစုနေပါတယ် 🌸',
      };
    } else if (Math.hypot(ptx - 29, pty - 29) <= 1.85) {
      this.nearbyVillageNpc = {
        role: 'elder',
        title: 'ရွာလူကြီး အာသာ (Elder Arthur)',
        subtitle: 'စကားပြောရန် [E] နှိပ်ပါ',
        message: 'Random City ရွာလေးမှ ကြိုဆိုပါတယ် လူငယ်လေး! 🏡',
      };
    } else if (Math.hypot(ptx - 50, pty - 74) <= 1.9) {
      this.nearbyVillageNpc = {
        role: 'farmer',
        title: 'လယ်သမားကြီး သောမတ်စ်',
        subtitle: 'စကားပြောရန် [E] နှိပ်ပါ',
        message: 'ဒီနှစ် ဂျုံနဲ့ ဖရုံသီးတွေ အထွက်တိုးနေပါတယ် 🌾',
      };
    }

    // D. Nearby Personal Placed Buildings (Cottage, Manor, Villa, Fence, Campfire, Storage Chest, Lantern)
    this.isNearCampfire = false;
    this.nearbyStorageChest = null;
    this.nearbyPlacedBuilding = null;
    for (const b of this.buildingSystem.buildings) {
      const centerX = b.tileX + b.width / 2;
      const centerY = b.tileY + b.height / 2;
      const dist = Math.hypot(ptx - centerX, pty - centerY);
      const radius = Math.max(1.85, Math.max(b.width, b.height) * 0.72);
      if (dist <= radius) {
        const isMine = this.buildingSystem.isPersonalBuilding(
          b,
          this.networkSystem.localPlayerId || undefined,
          this.playerProfile.name
        );
        if (b.type === 'campfire') {
          this.isNearCampfire = true;
        }
        if (isMine) {
          this.nearbyPlacedBuilding = b;
          if (b.type === 'storage_box') {
            this.nearbyStorageChest = b;
          }
        }
      }
    }

    // E. Nearby Resource Node & Zone Signposts
    const nearbyNode = this.resourceSystem.getNearbyNode(ptx, pty, 1.65);
    this.nearbySignpost =
      ZONE_SIGNPOSTS.find((s) => Math.hypot(ptx - s.tileX, pty - s.tileY) <= 1.85) || null;

    // Emit compact HUD prompt only when targetId changes
    if (this.isNearShop) {
      const shopId = distGrocery <= 2.05 ? 'shop_grocery' : distMarket <= 2.0 ? 'shop_market' : 'shop_general';
      const shopTitle =
        shopId === 'shop_grocery'
          ? 'မာယာ၏ ကုန်စိမ်းဆိုင်'
          : shopId === 'shop_market'
          ? 'အာရီယာ၏ ဈေးဆိုင်တန်း'
          : 'ဘားနဘီ၏ ကုန်စုံဆိုင်';
      this.emitInteractionPrompt({
        type: 'shop',
        title: shopTitle,
        subtitle: 'ဝယ်/ရောင်းရန်',
        actionKey: 'E',
        targetId: shopId,
      });
    } else if (this.isNearClothingShop) {
      this.emitInteractionPrompt({
        type: 'clothing_shop',
        title: AUNTY_GYI_LOCATION.name,
        subtitle: 'ဝတ်စုံများ ဝယ်ယူ/ဝတ်ဆင်ရန်',
        actionKey: 'E',
        targetId: AUNTY_GYI_LOCATION.id,
      });
    } else if (this.isNearCraftStation) {
      this.emitInteractionPrompt({
        type: 'crafting',
        title: 'လက်မှုလုပ်ငန်းခုံ',
        subtitle: 'ပစ္စည်းဖန်တီးရန်',
        actionKey: 'E',
        targetId: 'craft_station',
      });
    } else if (this.nearbyPlacedBuilding) {
      const b = this.nearbyPlacedBuilding;
      const bName =
        b.type === 'house_small'
          ? 'သစ်သားအိမ်ငယ်'
          : b.type === 'house_medium'
          ? 'နှစ်ထပ်သစ်သားအိမ်'
          : b.type === 'house_large'
          ? 'စံအိမ်ကြီး'
          : b.type === 'fence_wood'
          ? 'သစ်သားခြံစည်းရိုး'
          : b.type === 'storage_box'
          ? 'သိုလှောင်သေတ္တာ'
          : b.type === 'campfire'
          ? 'မီးဖို'
          : b.type === 'lantern'
          ? 'မီးအိမ်တိုင်'
          : b.type === 'decor_bench'
          ? 'ဥယျာဉ်ထိုင်ခုံ'
          : b.type === 'decor_flower_pot'
          ? 'ပန်းအိုးအလှ'
          : b.type === 'decor_flowerbed'
          ? 'ပန်းခင်းငယ်'
          : b.type === 'decor_flower_stand'
          ? 'ပန်းစင်အလှ'
          : 'အဆောက်အအုံ';
      this.emitInteractionPrompt({
        type: b.type === 'storage_box' ? 'storage' : 'building_manage',
        title: bName,
        subtitle: b.type === 'storage_box' ? 'သေတ္တာဖွင့်ရန်' : 'စီမံရန် / ရွှေ့ရန်',
        actionKey: 'E',
        targetId: `bld_${b.id}`,
      });
    } else if (nearbyNode) {
      let actionWord = 'ရိတ်သိမ်းမည်';
      let subtitleWord = 'စတင်ရိတ်သိမ်းရန်';
      let targetSuffix = '';
      if (nearbyNode.type === 'tree') actionWord = 'သစ်ခုတ်မည်';
      else if (nearbyNode.type === 'rock') actionWord = 'ကျောက်ခွဲမည်';
      else if (nearbyNode.type === 'bush') {
        actionWord = nearbyNode.spriteVariant === 'tall_grass' ? 'မြက်ပင်ရိတ်မည်' : 'အမျှင်ခူးမည်';
      }
      else if (nearbyNode.type === 'animal') actionWord = 'အမဲလိုက်မည်';
      else if (nearbyNode.type === 'lake_fish') {
        const hasRod = this.inventorySystem.hasItem('rod_basic', 1);
        targetSuffix = hasRod ? '_rod' : '_norod';
        actionWord = hasRod ? 'ငါးမျှားမည်' : '🎣 ငါးမျှားတံ လိုအပ်သည်';
        subtitleWord = hasRod ? 'စတင်ငါးမျှားရန်' : 'ဆိုင် (25🪙) သို့ ဖန်တီးခုံ';
      }

      this.emitInteractionPrompt({
        type: 'gather',
        title: actionWord,
        subtitle: subtitleWord,
        actionKey: 'E',
        targetId: `node_${nearbyNode.id}${targetSuffix}`,
      });
    } else if (this.isNearCampfire) {
      this.emitInteractionPrompt({
        type: 'campfire',
        title: 'မီးဖို',
        subtitle: 'ချက်ပြုတ်ရန်',
        actionKey: 'E',
        targetId: 'campfire_cook',
      });
    } else if (this.nearbyVillageNpc) {
      this.emitInteractionPrompt({
        type: 'npc',
        title: this.nearbyVillageNpc.title,
        subtitle: 'စကားပြောရန်',
        actionKey: 'E',
        targetId: `npc_${this.nearbyVillageNpc.role}`,
      });
    } else if (this.nearbySignpost) {
      this.emitInteractionPrompt({
        type: 'signpost',
        title: this.nearbySignpost.label,
        subtitle: 'လမ်းညွှန်ဖတ်ရန်',
        actionKey: 'E',
        targetId: `sign_${this.nearbySignpost.id}`,
      });
    } else {
      this.emitInteractionPrompt(null);
    }
  }

  public showGameplayGuide(options: {
    kind: 'merchant' | 'crafting' | 'fishing' | 'action';
    badgeIcon: string;
    title: string;
    subtitle: string;
    targetX: number;
    targetY: number;
    targetLabel?: string;
    requirements?: GuidanceRequirementItem[];
    autoCloseOnShop?: boolean;
    autoCloseOnCraft?: boolean;
    dismissWhenHasItem?: ItemId | null;
    durationMs?: number;
    cooldownKey?: string;
    cooldownMs?: number;
  }): boolean {
    const now = Date.now();
    if (options.cooldownKey) {
      const cooldownUntil = this.guidanceCooldowns.get(options.cooldownKey) ?? 0;
      if (now < cooldownUntil && this.merchantGuideUntil > now) {
        return false;
      }
      this.guidanceCooldowns.set(options.cooldownKey, now + (options.cooldownMs ?? 3500));
    }

    this.merchantGuideKind = options.kind;
    this.merchantGuideBadgeIcon = options.badgeIcon;
    this.merchantGuideTitle = options.title;
    this.merchantGuideSubtitle = options.subtitle;
    this.merchantGuideTargetX = options.targetX;
    this.merchantGuideTargetY = options.targetY;
    this.merchantGuideTargetLabel = options.targetLabel ?? '';
    this.merchantGuideRequirements = options.requirements;
    this.merchantGuideAutoCloseOnShop = Boolean(options.autoCloseOnShop);
    this.merchantGuideAutoCloseOnCraft = Boolean(options.autoCloseOnCraft);
    this.merchantGuideDismissItemId = options.dismissWhenHasItem ?? null;
    this.merchantGuideUntil = now + (options.durationMs ?? 5800);
    this.lastMerchantGuideKey = '';
    this.updateMerchantGuide();
    return true;
  }

  public showFishingRodGuidance(): boolean {
    const hasRod = this.inventorySystem.hasItem('rod_basic', 1);
    const woodHave = this.inventorySystem.getItemCount('wood');
    const fiberHave = this.inventorySystem.getItemCount('fiber');
    const coins = this.playerProfile?.coins ?? 0;
    const spec = WorldScene.buildFishingGuidanceSpec(hasRod, woodHave, fiberHave, coins);
    if (!spec) return false;
    return this.showGameplayGuide({
      ...spec,
      durationMs: 6200,
      cooldownKey: 'fishing_norod',
      cooldownMs: 3500,
    });
  }

  public showCraftingStationGuide(title = 'ပစ္စည်းဖန်တီးခုံသို့ သွားပါ', subtitle = 'Crafting Station [33,25] အနီးတွင် ဖန်တီးနိုင်သည်'): boolean {
    return this.showGameplayGuide({
      kind: 'crafting',
      badgeIcon: '🔨',
      title,
      subtitle,
      targetX: CRAFTING_STATION_LOCATION.tileX,
      targetY: CRAFTING_STATION_LOCATION.tileY,
      targetLabel: 'Crafting Station',
      autoCloseOnCraft: true,
      durationMs: 5500,
      cooldownKey: 'craft_station_guide',
      cooldownMs: 3200,
    });
  }

  public showMerchantGuide(title: string, subtitle: string, durationMs = 6000): void {
    this.showGameplayGuide({
      kind: 'merchant',
      badgeIcon: '🏪',
      title,
      subtitle,
      targetX: MERCHANT_LOCATION.tileX,
      targetY: MERCHANT_LOCATION.tileY,
      targetLabel: 'Barnaby ဆိုင်',
      autoCloseOnShop: true,
      durationMs,
      cooldownKey: 'merchant_guide',
      cooldownMs: 3200,
    });
  }

  public dismissMerchantGuide(): void {
    this.merchantGuideUntil = 0;
    this.merchantGuideRequirements = undefined;
    if (this.lastMerchantGuideKey !== '') {
      this.lastMerchantGuideKey = '';
      this.onMerchantGuideChange?.(null);
    }
  }

  private updateMerchantGuide(): void {
    if (!this.onMerchantGuideChange) return;
    const now = Date.now();
    const resolvedByShop = this.merchantGuideAutoCloseOnShop && this.isNearShop;
    const resolvedByCraft = this.merchantGuideAutoCloseOnCraft && this.isNearCraftStation;
    const resolvedByItem = Boolean(
      this.merchantGuideDismissItemId &&
        this.inventorySystem?.hasItem(this.merchantGuideDismissItemId, 1)
    );

    if (this.merchantGuideUntil <= now || resolvedByShop || resolvedByCraft || resolvedByItem) {
      if (this.lastMerchantGuideKey !== '') {
        this.lastMerchantGuideKey = '';
        this.merchantGuideUntil = 0;
        this.merchantGuideRequirements = undefined;
        this.onMerchantGuideChange(null);
      }
      return;
    }

    const dx = this.merchantGuideTargetX - this.playerTileX;
    const dy = this.merchantGuideTargetY - this.playerTileY;
    const distanceTiles = Math.max(1, Math.round(Math.hypot(dx, dy)));

    // Convert grid delta into isometric screen space so compass arrow matches player view
    const screenDx = dx - dy;
    const screenDy = (dx + dy) * 0.5;
    const angleDeg = Math.round(Math.atan2(screenDy, screenDx) * (180 / Math.PI));

    let directionLabelMy = 'အရှေ့';
    if (angleDeg >= -22 && angleDeg < 22) directionLabelMy = 'အရှေ့ဘက်';
    else if (angleDeg >= 22 && angleDeg < 67) directionLabelMy = 'အရှေ့တောင်';
    else if (angleDeg >= 67 && angleDeg < 112) directionLabelMy = 'တောင်ဘက်';
    else if (angleDeg >= 112 && angleDeg < 157) directionLabelMy = 'အနောက်တောင်';
    else if (angleDeg >= 157 || angleDeg < -157) directionLabelMy = 'အနောက်ဘက်';
    else if (angleDeg >= -157 && angleDeg < -112) directionLabelMy = 'အနောက်မြောက်';
    else if (angleDeg >= -112 && angleDeg < -67) directionLabelMy = 'မြောက်ဘက်';
    else directionLabelMy = 'အရှေ့မြောက်';

    const reqSig = this.merchantGuideRequirements
      ? this.merchantGuideRequirements.map((r) => `${r.itemId}:${r.have}/${r.need}`).join(',')
      : '';
    const key = `${this.merchantGuideKind}|${this.merchantGuideTitle}|${distanceTiles}|${directionLabelMy}|${reqSig}`;
    if (key !== this.lastMerchantGuideKey) {
      this.lastMerchantGuideKey = key;
      this.onMerchantGuideChange({
        active: true,
        title: this.merchantGuideTitle,
        subtitle: this.merchantGuideSubtitle,
        targetX: this.merchantGuideTargetX,
        targetY: this.merchantGuideTargetY,
        distanceTiles,
        directionLabelMy,
        angleDeg,
        kind: this.merchantGuideKind,
        badgeIcon: this.merchantGuideBadgeIcon,
        targetLabel: this.merchantGuideTargetLabel,
        requirements: this.merchantGuideRequirements,
      });
    }
  }

  public setZoom(zoom: number, immediate = false): void {
    const clamped = WorldScene.clampZoom(zoom);
    this.camTargetZoom = clamped;
    this.hasManualZoom = true;
    if (immediate && this.cameras?.main) {
      this.cameras.main.setZoom(clamped);
      const target = this.getDesiredCameraTarget(clamped);
      this.camFollowX = WorldScene.snapToPixelGrid(target.x, clamped);
      this.camFollowY = WorldScene.snapToPixelGrid(target.y, clamped);
      this.cameras.main.centerOn(this.camFollowX, this.camFollowY);
    }
  }

  public adjustZoom(delta: number): void {
    const base = this.camTargetZoom || this.cameras.main?.zoom || 1.125;
    const stepped = Math.round((base + delta) / WorldScene.ZOOM_STEP) * WorldScene.ZOOM_STEP;
    this.setZoom(stepped);
  }

  public resetZoom(): void {
    this.hasManualZoom = false;
    this.camTargetZoom = WorldScene.computeRecommendedZoom(this.scale.width, this.scale.height);
  }

  public getTargetZoom(): number {
    return this.camTargetZoom;
  }

  public getZoom(): number {
    return this.cameras.main ? this.cameras.main.zoom : this.camTargetZoom;
  }
}
