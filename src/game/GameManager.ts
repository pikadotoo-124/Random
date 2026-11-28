/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Phaser from 'phaser';
import { WorldScene } from './scenes/WorldScene';
import { BuildingSystem } from './systems/BuildingSystem';
import {
  ClothingEquipResult,
  ClothingPurchaseResult,
  ClothingSystem,
} from './systems/ClothingSystem';
import { CraftingSystem } from './systems/CraftingSystem';
import { InventorySystem } from './systems/InventorySystem';
import { validateDismantleAction } from './systems/LandOwnershipSystem';
import { MapSystem } from './systems/MapSystem';
import { NetworkSystem } from './systems/NetworkSystem';
import { ResourceSystem } from './systems/ResourceSystem';
import { CURRENT_SAVE_VERSION, SaveSystem, SavedGameState } from './systems/SaveSystem';
import { WorldAtmosphereSystem } from './systems/WorldAtmosphereSystem';
import {
  BuildingType,
  ClothingEquipmentSlot,
  FacingDirection,
  FarmPlotOwnerRecord,
  InventorySlot,
  ItemId,
  PlacedBuilding,
  PlayerProfile,
  PlayerStats,
  PlayerWorldChanges,
} from './types';

export class GameManager {
  public game: Phaser.Game | null = null;
  public worldScene: WorldScene | null = null;

  public userId?: string;
  public mapSystem: MapSystem;
  public inventorySystem: InventorySystem;
  public buildingSystem: BuildingSystem;
  public craftingSystem: CraftingSystem;
  public resourceSystem: ResourceSystem;
  public networkSystem: NetworkSystem;
  public atmosphereSystem: WorldAtmosphereSystem;
  public playerProfile: PlayerProfile;
  public initialPosition: { tileX: number; tileY: number; facingDirection: FacingDirection };
  public playerStats: PlayerStats;
  public playerWorldChanges: PlayerWorldChanges;
  public hasHydrated = false;
  public isSceneReady = false;
  public onSceneReady?: () => void;
  public onClothingChanged?: () => void;

  private pendingJoystickVector = { x: 0, y: 0 };
  private pendingUiOverlayOpen = false;
  private lastMovementCheckpointAt = 0;
  private unsubEconomyReconcile: (() => void) | null = null;

  constructor(profile?: PlayerProfile, userId?: string, initialState?: SavedGameState) {
    this.userId = userId;
    this.mapSystem = new MapSystem();
    this.inventorySystem = new InventorySystem();
    this.buildingSystem = new BuildingSystem();
    this.craftingSystem = new CraftingSystem();
    this.resourceSystem = new ResourceSystem();
    this.networkSystem = new NetworkSystem();
    this.atmosphereSystem = new WorldAtmosphereSystem();

    // Populate natural resource nodes before validating initial spawn walkability
    this.resourceSystem.generateResources(this.mapSystem);

    const saved = initialState
      ? SaveSystem.migrateGameState(initialState, profile?.name, profile?.gender)
      : !userId
      ? SaveSystem.loadGame(undefined)
      : null;

    if (saved) {
      const resolvedGender = (profile?.gender || saved.player.gender) === 'female' ? 'female' : 'male';
      const ownedClothing = ClothingSystem.normalizeOwnedClothing(
        saved.player.ownedClothing ?? profile?.ownedClothing
      );
      const equippedClothing = ClothingSystem.normalizeEquippedClothing(
        saved.player.equippedClothing ?? profile?.equippedClothing,
        ownedClothing,
        resolvedGender
      );
      const facingDirection = SaveSystem.normalizeDirection(
        saved.position?.facingDirection ?? saved.player?.facingDirection ?? profile?.facingDirection
      );

      this.playerProfile = {
        ...(profile || saved.player),
        gender: resolvedGender,
        coins: saved.inventory.coins,
        currentTool: saved.player.currentTool ?? profile?.currentTool ?? 'axe_basic',
        facingDirection,
        ownedClothing,
        equippedClothing,
      };
      this.inventorySystem.deserialize(saved.inventory);
      this.buildingSystem.deserialize(saved.buildings, this.mapSystem, userId);
      this.playerStats = {
        ...SaveSystem.getDefaultStats(),
        ...(saved.playerStats || {}),
      };
      this.playerWorldChanges = {
        ...SaveSystem.getDefaultWorldChanges(),
        ...(saved.playerWorldChanges || {}),
      };

      const rawX = saved.position?.tileX ?? 30;
      const rawY = saved.position?.tileY ?? 30;
      const safePos = this.mapSystem.findNearestWalkableTile(rawX, rawY);
      this.initialPosition = {
        tileX: safePos.snapped ? safePos.tileX : Math.max(0, Math.min(119, rawX)),
        tileY: safePos.snapped ? safePos.tileY : Math.max(0, Math.min(119, rawY)),
        facingDirection,
      };
      this.hasHydrated = true;
    } else {
      const baseProf = profile || {
        name: 'Settler',
        gender: 'male' as const,
        skinTone: '#d97706',
        hairColor: '#292524',
        clothesColor: '#3b82f6',
        coins: 25,
        currentTool: 'axe_basic' as const,
      };
      const ownedClothing = ClothingSystem.normalizeOwnedClothing(baseProf.ownedClothing);
      const equippedClothing = ClothingSystem.normalizeEquippedClothing(
        baseProf.equippedClothing,
        ownedClothing,
        baseProf.gender
      );
      const facingDirection = SaveSystem.normalizeDirection(baseProf.facingDirection);
      this.playerProfile = {
        ...baseProf,
        facingDirection,
        ownedClothing,
        equippedClothing,
      };
      this.inventorySystem.initStarterItems();
      this.playerStats = SaveSystem.getDefaultStats();
      this.playerWorldChanges = SaveSystem.getDefaultWorldChanges();
      this.initialPosition = { tileX: 30, tileY: 30, facingDirection };
      this.hasHydrated = !userId;
    }

    this.setupAuthoritativeGoldSync();
    if (this.userId) {
      this.unsubEconomyReconcile = SaveSystem.subscribeEconomyReconciled((targetUid, economy) => {
        if (targetUid === this.userId) {
          this.applyAuthoritativeSnapshot({
            gold: economy.gold,
            inventorySlots: economy.inventorySlots as InventorySlot[],
            ownedClothing: economy.ownedClothing,
          });
        }
      });
    }
  }

  private applyAuthoritativeSnapshot(payload: {
    gold?: number;
    inventorySlots?: InventorySlot[];
    ownedClothing?: string[];
  }): void {
    let profileChanged = false;

    if (typeof payload.gold === 'number' && Number.isFinite(payload.gold)) {
      const targetGold = Math.max(0, Math.round(payload.gold));
      if (this.inventorySystem.coins !== targetGold || this.playerProfile.coins !== targetGold) {
        this.inventorySystem.coins = targetGold;
        this.playerProfile.coins = targetGold;
        profileChanged = true;
      }
    }

    if (Array.isArray(payload.inventorySlots)) {
      this.inventorySystem.replaceSlotsFromServer(payload.inventorySlots);
      profileChanged = true;
    }

    if (Array.isArray(payload.ownedClothing)) {
      const cleanOwned = ClothingSystem.normalizeOwnedClothing(payload.ownedClothing);
      this.playerProfile.ownedClothing = cleanOwned;
      this.playerProfile.equippedClothing = ClothingSystem.normalizeEquippedClothing(
        this.playerProfile.equippedClothing,
        cleanOwned,
        this.playerProfile.gender
      );
      this.worldScene?.applyEquippedClothing(this.playerProfile.equippedClothing);
      profileChanged = true;
    }

    if (profileChanged) {
      this.onClothingChanged?.();
    }
  }

  private setupAuthoritativeGoldSync(): void {
    this.networkSystem.on('room_state', (evt) => {
      const syncState = evt.payload;
      if (!syncState) return;
      this.applyAuthoritativeSnapshot({
        gold:
          syncState.goldLedgerVerified &&
          typeof syncState.goldBalance === 'number' &&
          Number.isFinite(syncState.goldBalance)
            ? syncState.goldBalance
            : undefined,
        inventorySlots:
          syncState.inventoryVerified && Array.isArray(syncState.inventorySlots)
            ? syncState.inventorySlots
            : undefined,
        ownedClothing: Array.isArray(syncState.ownedClothing) ? syncState.ownedClothing : undefined,
      });
    });

    this.networkSystem.on('shop_trade_result', (evt) => {
      const res = evt.payload as {
        ok: boolean;
        balance?: number;
        inventorySlots?: InventorySlot[];
        ownedClothing?: string[];
      };
      if (!res) return;
      this.applyAuthoritativeSnapshot({
        gold: typeof res.balance === 'number' && Number.isFinite(res.balance) ? res.balance : undefined,
        inventorySlots: Array.isArray(res.inventorySlots) ? res.inventorySlots : undefined,
        ownedClothing: Array.isArray(res.ownedClothing) ? res.ownedClothing : undefined,
      });
      if (res.ok) {
        void this.saveCurrentState(false);
      }
    });

    this.networkSystem.on('inventory_sync', (evt) => {
      const payload = evt.payload as { inventorySlots?: InventorySlot[] };
      if (Array.isArray(payload?.inventorySlots)) {
        this.applyAuthoritativeSnapshot({ inventorySlots: payload.inventorySlots });
        void this.saveCurrentState(false);
      }
    });

    this.networkSystem.on('craft_result', (evt) => {
      const payload = evt.payload as { ok?: boolean; inventorySlots?: InventorySlot[] };
      if (Array.isArray(payload?.inventorySlots)) {
        this.applyAuthoritativeSnapshot({ inventorySlots: payload.inventorySlots });
        if (payload.ok) {
          void this.saveCurrentState(false);
        }
      }
    });

    this.networkSystem.on('storage_transfer_result', (evt) => {
      const payload = evt.payload as {
        ok?: boolean;
        buildingId?: string;
        inventorySlots?: InventorySlot[];
        storage?: InventorySlot[];
      };
      if (!payload) return;
      if (payload.buildingId && Array.isArray(payload.storage)) {
        const box = this.buildingSystem.buildings.find((b) => b.id === payload.buildingId);
        if (box) {
          box.storage = payload.storage.map((s) => ({ item: s.item, quantity: s.quantity }));
        }
      }
      if (Array.isArray(payload.inventorySlots)) {
        this.applyAuthoritativeSnapshot({ inventorySlots: payload.inventorySlots });
      }
      if (payload.ok) {
        void this.saveCurrentState(false);
      }
    });
  }

  public isOnlineEconomyVerified(): boolean {
    return (
      this.networkSystem.status === 'connected' &&
      Boolean(this.networkSystem.lastRoomState?.goldLedgerVerified) &&
      Boolean(this.networkSystem.lastRoomState?.inventoryVerified)
    );
  }

  public initGame(parentContainerId: string): void {
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
    }

    this.isSceneReady = false;
    const initPos = this.initialPosition || { tileX: 30, tileY: 30 };

    this.worldScene = new WorldScene();
    this.worldScene.joystickVector = { ...this.pendingJoystickVector };
    this.worldScene.isUiOverlayOpen = this.pendingUiOverlayOpen;
    this.worldScene.onSceneReady = () => {
      this.isSceneReady = true;
      if (this.worldScene) {
        this.worldScene.joystickVector = { ...this.pendingJoystickVector };
        this.worldScene.isUiOverlayOpen = this.pendingUiOverlayOpen;
      }
      this.onSceneReady?.();
    };
    this.worldScene.setupData({
      mapSystem: this.mapSystem,
      inventorySystem: this.inventorySystem,
      buildingSystem: this.buildingSystem,
      craftingSystem: this.craftingSystem,
      resourceSystem: this.resourceSystem,
      networkSystem: this.networkSystem,
      atmosphereSystem: this.atmosphereSystem,
      playerProfile: this.playerProfile,
      initialPosition: initPos,
    });

    const parentEl =
      typeof document !== 'undefined' ? document.getElementById(parentContainerId) : null;
    const initWidth = parentEl && parentEl.clientWidth > 0 ? parentEl.clientWidth : window.innerWidth;
    const initHeight = parentEl && parentEl.clientHeight > 0 ? parentEl.clientHeight : window.innerHeight;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: parentContainerId,
      width: initWidth,
      height: initHeight,
      pixelArt: true,
      render: {
        pixelArt: true,
        antialias: false,
        roundPixels: true,
      },
      backgroundColor: '#1c1917',
      physics: {
        default: 'arcade',
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [this.worldScene],
    };

    this.game = new Phaser.Game(config);
  }

  public setJoystickVector(vx: number, vy: number): void {
    this.pendingJoystickVector = { x: vx, y: vy };
    if (this.worldScene) {
      this.worldScene.joystickVector = { x: vx, y: vy };
    }
  }

  public triggerAction(): void {
    if (this.worldScene) {
      this.worldScene.triggerInteraction();
    }
  }

  public triggerFishingCatch(): void {
    if (this.worldScene) {
      this.worldScene.triggerFishingCatch();
    }
  }

  public cancelFishing(): void {
    if (this.worldScene) {
      this.worldScene.cancelFishing(false);
    }
  }

  public setBuildMode(type: BuildingType | null, movingBuildingId?: string): void {
    if (this.worldScene) {
      this.worldScene.setBuildMode(type, movingBuildingId);
    }
  }

  public rotateBuildPreview(): void {
    if (this.worldScene) {
      this.worldScene.rotateBuildPreview();
    }
  }

  public confirmBuildPlacement(tx?: number, ty?: number): void {
    if (this.worldScene) {
      this.worldScene.confirmPlacementFromUI(tx, ty);
    }
  }

  public dismantleBuilding(buildingId: string): boolean {
    if (this.userId && this.networkSystem.status !== 'connected') {
      this.worldScene?.onPlacementNotice?.(
        'အွန်လိုင်းဆာဗာနှင့် ချိတ်ဆက်ထားမှသာ အဆောက်အအုံ ဖျက်သိမ်းနိုင်ပါသည်',
        'error'
      );
      return false;
    }
    const target = this.buildingSystem.buildings.find((b) => b.id === buildingId);
    if (!target || !this.buildingSystem.isPersonalBuilding(target, this.userId, this.playerProfile.name)) {
      return false;
    }
    const effectiveUid = this.userId || this.playerProfile.name;
    const check = validateDismantleAction(
      this.buildingSystem.buildings,
      buildingId,
      effectiveUid,
      this.buildingSystem.farmPlotOwners
    );
    if (!check.allowed) {
      this.worldScene?.onPlacementNotice?.(
        check.reason || 'ဤအဆောက်အအုံကို ဖျက်သိမ်းခွင့်မရှိပါ',
        'error'
      );
      return false;
    }
    if (!this.inventorySystem.canFitItem(target.type, 1)) {
      this.worldScene?.onPlacementNotice?.(
        '🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိသဖြင့် ဖျက်သိမ်း၍မရပါ',
        'error'
      );
      return false;
    }
    const targetSnapshot = { ...target };
    const success = this.buildingSystem.dismantleBuilding(buildingId, this.mapSystem, this.inventorySystem);
    if (success) {
      this.worldScene?.recordPendingDismantle(targetSnapshot);
      this.worldScene?.renderPlacedBuildings();
      this.networkSystem.broadcastDismantle(buildingId);
      this.saveCurrentState(false);
    }
    return success;
  }

  public zoomIn(): void {
    if (this.worldScene) {
      this.worldScene.adjustZoom(WorldScene.ZOOM_STEP);
    }
  }

  public zoomOut(): void {
    if (this.worldScene) {
      this.worldScene.adjustZoom(-WorldScene.ZOOM_STEP);
    }
  }

  public resetZoom(): void {
    if (this.worldScene) {
      this.worldScene.resetZoom();
    }
  }

  public setUiOverlayOpen(open: boolean): void {
    this.pendingUiOverlayOpen = open;
    if (this.worldScene) {
      this.worldScene.isUiOverlayOpen = open;
    }
  }

  public syncViewportSize(): void {
    if (!this.game || typeof document === 'undefined') return;
    const parentEl = document.getElementById('phaser-canvas-container');
    const targetW = parentEl && parentEl.clientWidth > 0 ? parentEl.clientWidth : window.innerWidth;
    const targetH = parentEl && parentEl.clientHeight > 0 ? parentEl.clientHeight : window.innerHeight;
    if (targetW > 0 && targetH > 0) {
      if (this.game.scale.width !== targetW || this.game.scale.height !== targetH) {
        this.game.scale.resize(targetW, targetH);
      } else {
        this.game.scale.refresh();
      }
    }
  }

  public setWeatherEffectsEnabled(enabled: boolean): void {
    this.atmosphereSystem.setWeatherEffectsEnabled(enabled);
    this.worldScene?.refreshAtmosphereImmediately();
  }

  public isWeatherEffectsEnabled(): boolean {
    return this.atmosphereSystem.isWeatherEffectsEnabled();
  }

  public async buyClothing(itemId: string): Promise<ClothingPurchaseResult> {
    if (!this.isOnlineEconomyVerified()) {
      return {
        ok: false,
        messageMy: 'အွန်လိုင်းဆာဗာနှင့် ချိတ်ဆက်ထားမှသာ ဝတ်စုံဝယ်ယူနိုင်ပါသည်',
      };
    }

    const res = await this.networkSystem.executeShopTrade('buy_clothing', itemId, 1);
    if (res.ok) {
      return {
        ok: true,
        messageMy: 'ဝတ်စုံအသစ်ကို အောင်မြင်စွာ ဝယ်ယူပြီးပါပြီ! ဗီရိုထဲတွင် ချက်ချင်းဝတ်ဆင်နိုင်ပါသည်။',
      };
    }
    return {
      ok: false,
      messageMy: res.reason || 'ဝတ်စုံဝယ်ယူမှု မအောင်မြင်ပါ',
    };
  }

  public async executeShopItemTrade(
    action: 'buy_item' | 'sell_item',
    itemId: string,
    quantity = 1
  ): Promise<{
    ok: boolean;
    balance: number;
    goldDelta: number;
    reason?: string;
    code?: string;
  }> {
    if (!this.isOnlineEconomyVerified()) {
      return {
        ok: false,
        balance: this.inventorySystem.coins,
        goldDelta: 0,
        code: 'OFFLINE',
        reason: 'အွန်လိုင်းဆာဗာနှင့် ချိတ်ဆက်ထားမှသာ ဈေးဝယ်/ရောင်းချနိုင်ပါသည်',
      };
    }

    const prevGold = this.inventorySystem.coins;
    const cleanQty = Math.max(1, Math.min(99, Math.floor(Number.isFinite(quantity) ? quantity : 1)));
    const res = await this.networkSystem.executeShopTrade(action, itemId, cleanQty);
    const nextBalance =
      typeof res.balance === 'number' && Number.isFinite(res.balance)
        ? Math.max(0, Math.round(res.balance))
        : this.inventorySystem.coins;

    if (res.ok) {
      const goldDelta = Math.max(0, nextBalance - prevGold);
      if (action === 'sell_item' && goldDelta > 0) {
        this.recordStat('totalSoldGold', goldDelta);
      }
      await this.saveCurrentState(false);
      return {
        ok: true,
        balance: nextBalance,
        goldDelta,
      };
    }

    return {
      ok: false,
      balance: nextBalance,
      goldDelta: 0,
      code: res.code,
      reason: res.reason || 'အရောင်းအဝယ် အတည်ပြုမှု မအောင်မြင်ပါ',
    };
  }

  public async craftRecipe(recipeId: string): Promise<{ ok: boolean; reason?: string }> {
    const recipe = this.craftingSystem.recipes.find((r) => r.id === recipeId);
    if (!recipe) {
      return { ok: false, reason: 'ဖန်တီးမှုပုံစံငယ် ရှာမတွေ့ပါ' };
    }
    const nearWb = this.worldScene?.isNearCraftStation ?? true;
    const nearCf = this.worldScene?.isNearCampfire ?? false;
    const canLocal = this.craftingSystem.canCraft(recipe, this.inventorySystem, nearWb, nearCf);
    if (!canLocal.can) {
      return { ok: false, reason: canLocal.reason || 'လိုအပ်သော ပစ္စည်းများ မပြည့်စုံသေးပါ' };
    }

    if (this.userId) {
      if (!this.isOnlineEconomyVerified()) {
        return {
          ok: false,
          reason: 'အွန်လိုင်းဆာဗာနှင့် ချိတ်ဆက်ထားမှသာ ပစ္စည်းဖန်တီးနိုင်ပါသည်',
        };
      }
      const res = await this.networkSystem.requestCraft(recipeId);
      if (res.ok) {
        this.recordStat('totalCrafted', 1);
        await this.saveCurrentState(false);
      }
      return {
        ok: res.ok,
        reason: res.reason,
      };
    }

    if (!this.inventorySystem.canFitItem(recipe.resultItem, recipe.resultCount)) {
      return { ok: false, reason: '🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိပါ' };
    }

    const ok = this.craftingSystem.craft(recipe, this.inventorySystem, nearWb, nearCf);
    if (ok) {
      this.recordStat('totalCrafted', 1);
      await this.saveCurrentState(false);
      return { ok: true };
    }
    return { ok: false, reason: 'ဖန်တီးမှု မအောင်မြင်ပါ' };
  }

  public async transferStorageItem(
    building: PlacedBuilding,
    direction: 'deposit' | 'withdraw',
    itemId: ItemId,
    quantity = 1
  ): Promise<{ ok: boolean; storage?: InventorySlot[]; reason?: string }> {
    if (this.userId) {
      if (!this.isOnlineEconomyVerified()) {
        return {
          ok: false,
          reason: 'အွန်လိုင်းဆာဗာနှင့် ချိတ်ဆက်ထားမှသာ သေတ္တာအသုံးပြုနိုင်ပါသည်',
        };
      }
      const res = await this.networkSystem.requestStorageTransfer(building.id, direction, itemId, quantity);
      if (res.ok && Array.isArray(res.storage)) {
        building.storage = res.storage.map((s) => ({ item: s.item, quantity: s.quantity }));
      }
      return {
        ok: res.ok,
        storage: res.storage,
        reason: res.reason,
      };
    }

    if (!building.storage) {
      building.storage = [];
    }
    if (direction === 'deposit') {
      if (!this.inventorySystem.hasItem(itemId, 1)) {
        return { ok: false, reason: 'အိတ်ထဲတွင် ပစ္စည်းမရှိပါ' };
      }
      this.inventorySystem.removeItem(itemId, 1);
      const existing = building.storage.find((s) => s.item === itemId);
      if (existing) {
        existing.quantity += 1;
      } else {
        building.storage.push({ item: itemId, quantity: 1 });
      }
      await this.saveCurrentState(false);
      return { ok: true, storage: building.storage };
    } else {
      const existing = building.storage.find((s) => s.item === itemId);
      if (!existing || existing.quantity <= 0) {
        return { ok: false, reason: 'သေတ္တာထဲတွင် ပစ္စည်းမရှိပါ' };
      }
      if (!this.inventorySystem.canFitItem(itemId, 1)) {
        return { ok: false, reason: '🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိပါ' };
      }
      existing.quantity -= 1;
      if (existing.quantity <= 0) {
        building.storage = building.storage.filter((s) => s.item !== itemId);
      }
      this.inventorySystem.addItem(itemId, 1);
      await this.saveCurrentState(false);
      return { ok: true, storage: building.storage };
    }
  }

  public recordOwnedFarmPlot(plotId: string): void {
    if (!plotId) return;
    const existing = this.playerWorldChanges.ownedFarmPlots || [];
    if (!existing.includes(plotId)) {
      this.playerWorldChanges = {
        ...this.playerWorldChanges,
        ownedFarmPlots: [...existing, plotId],
      };
    }
  }

  public purchaseFarmPlot(plotId: string): Promise<{
    ok: boolean;
    plotId: string;
    code?: string;
    message: string;
    owner?: FarmPlotOwnerRecord;
    remainingGold?: number;
  }> {
    if (this.networkSystem.status !== 'connected') {
      return Promise.resolve({
        ok: false,
        plotId,
        code: 'OFFLINE',
        message: 'အွန်လိုင်းဆာဗာနှင့် ချိတ်ဆက်ထားမှသာ စိုက်ပျိုးမြေကွက် ဝယ်ယူနိုင်ပါသည်',
      });
    }

    return new Promise((resolve) => {
      let settled = false;
      let unsub: (() => void) | null = null;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        unsub?.();
        resolve({
          ok: false,
          plotId,
          code: 'TIMEOUT',
          message: 'ဆာဗာမှ တုံ့ပြန်မှု ကြာမြင့်နေပါသည် — ခဏအကြာ ထပ်မံကြိုးစားပါ',
        });
      }, 8000);

      unsub = this.networkSystem.on('farm_plot_purchase_result', (evt) => {
        const res = evt.payload as {
          ok: boolean;
          plotId: string;
          code?: string;
          message: string;
          owner?: FarmPlotOwnerRecord;
          remainingGold?: number;
        };
        if (!res || res.plotId !== plotId) return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsub?.();

        if (res.ok) {
          if (typeof res.remainingGold === 'number' && Number.isFinite(res.remainingGold)) {
            const delta = res.remainingGold - this.inventorySystem.coins;
            if (delta !== 0) {
              this.inventorySystem.addCoins(delta);
            }
            this.playerProfile.coins = res.remainingGold;
          }
          this.buildingSystem.setFarmPlotOwners(this.networkSystem.farmPlotOwners);
          this.recordOwnedFarmPlot(plotId);
          this.worldScene?.renderFarmPlotOwnershipOverlays();
          this.onClothingChanged?.();
          void this.saveCurrentState(true);
        }

        resolve(res);
      });

      const sent = this.networkSystem.buyFarmPlot(plotId);
      if (!sent && !settled) {
        settled = true;
        clearTimeout(timer);
        unsub?.();
        resolve({
          ok: false,
          plotId,
          code: 'OFFLINE',
          message: 'အွန်လိုင်းဆာဗာနှင့် ချိတ်ဆက်မှု ပြတ်တောက်နေပါသည်',
        });
      }
    });
  }

  public equipClothing(itemId: string): ClothingEquipResult {
    const result = ClothingSystem.equipClothing(itemId, this.playerProfile);
    if (result.ok && result.equippedClothing) {
      this.worldScene?.applyEquippedClothing(result.equippedClothing);
      this.networkSystem.broadcastOutfit(result.equippedClothing);
      this.onClothingChanged?.();
      this.saveCurrentState(false);
    }
    return result;
  }

  public unequipClothing(slot: ClothingEquipmentSlot): ClothingEquipResult {
    const result = ClothingSystem.unequipSlot(slot, this.playerProfile);
    if (result.ok && result.equippedClothing) {
      this.worldScene?.applyEquippedClothing(result.equippedClothing);
      this.networkSystem.broadcastOutfit(result.equippedClothing);
      this.onClothingChanged?.();
      this.saveCurrentState(false);
    }
    return result;
  }

  public unequipAllClothing(): ClothingEquipResult {
    const result = ClothingSystem.unequipAll(this.playerProfile);
    if (result.ok && result.equippedClothing) {
      this.worldScene?.applyEquippedClothing(result.equippedClothing);
      this.networkSystem.broadcastOutfit(result.equippedClothing);
      this.onClothingChanged?.();
      this.saveCurrentState(false);
    }
    return result;
  }

  public recordStat(
    key: 'totalGathered' | 'totalCrafted' | 'totalBuilt' | 'totalSoldGold',
    delta = 1
  ): void {
    this.playerStats = {
      ...this.playerStats,
      [key]: (this.playerStats[key] || 0) + delta,
    };
  }

  public markTutorialCompleted(): void {
    if (this.playerWorldChanges.tutorialCompleted) return;
    this.playerWorldChanges = {
      ...this.playerWorldChanges,
      tutorialCompleted: true,
    };
    this.saveCurrentState(false);
  }

  public recordZoneDiscovered(zoneName: string): void {
    if (!zoneName) return;
    if (!this.playerWorldChanges.discoveredZones.includes(zoneName)) {
      this.playerWorldChanges = {
        ...this.playerWorldChanges,
        discoveredZones: [...this.playerWorldChanges.discoveredZones, zoneName],
      };
    }
  }

  private buildSnapshot(): { state: SavedGameState; currentZone: string } | null {
    if (!this.worldScene || !this.hasHydrated) return null;

    const safePos = this.worldScene.getSafeSavePosition();
    const tileX = safePos.tileX;
    const tileY = safePos.tileY;
    const facingDirection = safePos.facingDirection;
    const currentZone = this.mapSystem.getZoneAt(Math.round(tileX), Math.round(tileY)).name;

    this.recordZoneDiscovered(currentZone);
    this.playerProfile.facingDirection = facingDirection;

    const state: SavedGameState = {
      version: CURRENT_SAVE_VERSION,
      lastSaved: Date.now(),
      currentZone,
      player: {
        ...this.playerProfile,
        coins: this.inventorySystem.coins,
        facingDirection,
      },
      position: {
        tileX,
        tileY,
        facingDirection,
      },
      inventory: this.inventorySystem.serialize(),
      buildings: this.buildingSystem.serialize(this.userId, this.playerProfile.name),
      playerStats: { ...this.playerStats },
      playerWorldChanges: {
        tutorialCompleted: this.playerWorldChanges.tutorialCompleted,
        discoveredZones: [...this.playerWorldChanges.discoveredZones],
        ...(this.playerWorldChanges.resetEpoch ? { resetEpoch: this.playerWorldChanges.resetEpoch } : {}),
        ...(this.playerWorldChanges.ownedFarmPlots?.length
          ? { ownedFarmPlots: [...this.playerWorldChanges.ownedFarmPlots] }
          : {}),
      },
    };

    return { state, currentZone };
  }

  /**
   * Throttled movement checkpoint (saves every 3.5s during sustained travel or immediately on stop/zone change)
   */
  public saveMovementCheckpoint(immediate = false): Promise<boolean> {
    if (!this.hasHydrated || !this.worldScene) return Promise.resolve(false);
    const now = Date.now();
    const minGapMs = immediate ? 1500 : 5000;
    if (now - this.lastMovementCheckpointAt < minGapMs) {
      return Promise.resolve(false);
    }
    this.lastMovementCheckpointAt = now;
    return this.saveCurrentState(false);
  }

  /**
   * Synchronously store pending state into UID-scoped localStorage on pagehide/beforeunload
   */
  public flushPendingLocalOnly(): void {
    const snap = this.buildSnapshot();
    if (!snap) return;
    SaveSystem.queuePendingLocalSave(this.userId, snap.state, snap.currentZone);
  }

  public saveCurrentState(immediate = false): Promise<boolean> {
    const snap = this.buildSnapshot();
    if (!snap) return Promise.resolve(false);
    if (immediate) {
      this.lastMovementCheckpointAt = Date.now();
    }

    return SaveSystem.saveGameWithCloud(this.userId, snap.state, snap.currentZone, immediate);
  }

  /**
   * Flush current live state and wait for the entire Cloud Save queue to drain before signing out
   */
  public async flushBeforeSignOut(): Promise<boolean> {
    const ok = await this.saveCurrentState(true);
    if (this.userId) {
      const queueOk = await SaveSystem.flushQueue(this.userId);
      return ok && queueOk;
    }
    return ok;
  }

  public destroy(): void {
    this.unsubEconomyReconcile?.();
    this.unsubEconomyReconcile = null;
    this.networkSystem.disconnect();
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
      this.worldScene = null;
    }
  }
}
