/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AUNTY_GYI_CATALOG_MAP,
  FARM_PLOT_PURCHASES_LOCKED,
  FARM_PLOT_PURCHASE_LOCK_REASON,
  ITEMS,
  MERCHANT_CATALOG,
  isStarterTool,
} from '../../src/game/constants';
import {
  BuildingType,
  FarmPlotOwnerRecord,
  FarmPlotOwnersMap,
  InventorySlot,
  ItemId,
  PlacedBuilding,
} from '../../src/game/types';
import {
  getFarmPlotById,
  normalizeFarmPlotOwners,
  sanitizeOwnerName,
} from '../../src/game/systems/FarmPlotOwnershipSystem';
import { canOwnerModifyBuilding } from '../../src/game/systems/LandOwnershipSystem';
import {
  CRAFTING_RECIPE_MAP,
  MAX_INVENTORY_SLOTS,
  MAX_STORAGE_BOX_SLOTS,
  addItemToSlots,
  canFitInSlots,
  cloneSlots,
  createStarterInventorySlots,
  createStarterToolsOnlySlots,
  hasItemInSlots,
  normalizeInventorySlots,
  normalizeOwnedClothingList,
  normalizeStorageSlots,
  removeItemFromSlots,
} from '../economy/inventoryAuthority';
import {
  FishingClaimResult,
  FishingSessionTracker,
} from '../fishing/fishingService';
import {
  AuthoritativeEconomySnapshot,
  FirestorePlayerSaveDocs,
  FirestoreSaveWriterResult,
  SanitizedPlayerSavePayload,
  buildAuthoritativeFirestoreDocs,
  validateAndSanitizeClientSaveBody,
} from '../firebase/firestoreServerSave';

export interface FarmPlotPurchaseAttemptResult {
  ok: boolean;
  plotId: string;
  code?:
    | 'INVALID_PLAYER'
    | 'PLOT_NOT_FOUND'
    | 'PLOT_ALREADY_OWNED'
    | 'PURCHASE_IN_PROGRESS'
    | 'PURCHASES_LOCKED'
    | 'LEDGER_UNVERIFIED'
    | 'INSUFFICIENT_GOLD'
    | 'PERSIST_FAILED';
  message: string;
  owner?: FarmPlotOwnerRecord;
  remainingGold?: number;
}

export type ShopTradeAction = 'sell_item' | 'buy_item' | 'buy_clothing';

export interface ShopTradeResult {
  ok: boolean;
  txId?: string;
  action?: ShopTradeAction;
  itemId?: string;
  quantity?: number;
  balance: number;
  inventorySlots?: InventorySlot[];
  ownedClothing?: string[];
  reason?: string;
  code?: string;
  deduplicated?: boolean;
}

export interface CraftServerResult {
  ok: boolean;
  txId?: string;
  recipeId: string;
  resultItem?: ItemId;
  resultCount?: number;
  inventorySlots: InventorySlot[];
  reason?: string;
  code?: string;
  deduplicated?: boolean;
}

export interface StorageTransferServerResult {
  ok: boolean;
  txId?: string;
  buildingId: string;
  direction: 'deposit' | 'withdraw';
  itemId: string;
  quantity: number;
  inventorySlots: InventorySlot[];
  storage?: InventorySlot[];
  reason?: string;
  code?: string;
  deduplicated?: boolean;
}

export interface GatherServerResult {
  ok: boolean;
  nodeId: string;
  itemId?: ItemId;
  quantity?: number;
  respawnAt?: number;
  inventorySlots: InventorySlot[];
  reason?: string;
  code?: string;
}

export interface BuildInventoryCommitResult {
  ok: boolean;
  inventorySlots: InventorySlot[];
  code?: string;
  reason?: string;
}

const MERCHANT_PRICE_MAP = new Map<string, number>(
  MERCHANT_CATALOG.map((entry) => [entry.id, entry.price])
);

const MAX_SEED_INITIAL_GOLD = 1_000_000;
const MAX_GOLD_BALANCE = 10_000_000;
const MAX_PROCESSED_TX_CACHE = 500;

export interface EconomyPersistPayload {
  goldBalances: Record<string, number>;
  inventories: Record<string, InventorySlot[]>;
  ownedClothing: Record<string, string[]>;
}

export interface PlayerSaveCommitResult {
  ok: boolean;
  statusCode: number;
  saveRevision: number;
  lastSavedAt: string;
  deduplicated?: boolean;
  stale?: boolean;
  code?: string;
  error?: string;
  authoritativeEconomy?: AuthoritativeEconomySnapshot;
}

/**
 * Authoritative server-side Farm Plot Ownership, Gold, Inventory & Clothing Ledger.
 * Shared across both Express (Node.js) and Cloudflare Durable Object runtimes.
 * Enforces synchronous mutual exclusion locks before any async persistence I/O
 * so concurrent trades, fishing catches, crafts, or plot purchases can never
 * double-spend Gold, duplicate items, or race on partial failures.
 */
export class FarmPlotServerLedger {
  private owners = new Map<string, FarmPlotOwnerRecord>();
  private playerGold = new Map<string, number>();
  private verifiedGoldUids = new Set<string>();
  private playerInventories = new Map<string, InventorySlot[]>();
  private verifiedInventoryUids = new Set<string>();
  private playerOwnedClothing = new Map<string, string[]>();
  private verifiedClothingUids = new Set<string>();
  private playerSaveRevisions = new Map<string, number>();
  private playerLastClientTimestamps = new Map<string, number>();
  private playerLastSavedAtMs = new Map<string, number>();
  private inFlightPlots = new Set<string>();
  private inFlightBuyers = new Set<string>();
  private inFlightEconomyPlayers = new Set<string>();
  private saveTailByUid = new Map<string, Promise<unknown>>();
  private processedShopTx = new Map<string, ShopTradeResult>();
  private processedCraftTx = new Map<string, CraftServerResult>();
  private processedStorageTx = new Map<string, StorageTransferServerResult>();
  private processedSaveIds = new Map<string, PlayerSaveCommitResult>();

  public hydrateFromStorage(
    rawOwners: unknown,
    rawGoldBalances: unknown,
    rawInventories?: unknown,
    rawOwnedClothing?: unknown
  ): void {
    this.owners.clear();
    const normOwners = normalizeFarmPlotOwners(rawOwners);
    for (const [plotId, record] of Object.entries(normOwners)) {
      this.owners.set(plotId, record);
    }

    this.playerGold.clear();
    this.verifiedGoldUids.clear();
    if (rawGoldBalances && typeof rawGoldBalances === 'object') {
      for (const [uid, val] of Object.entries(rawGoldBalances as Record<string, unknown>)) {
        if (typeof uid === 'string' && uid.trim() && typeof val === 'number' && Number.isFinite(val)) {
          const cleanUid = uid.trim();
          this.playerGold.set(cleanUid, Math.max(0, Math.min(MAX_GOLD_BALANCE, Math.round(val))));
          this.verifiedGoldUids.add(cleanUid);
        }
      }
    }

    this.playerInventories.clear();
    this.verifiedInventoryUids.clear();
    if (rawInventories && typeof rawInventories === 'object') {
      for (const [uid, rawSlots] of Object.entries(rawInventories as Record<string, unknown>)) {
        if (typeof uid === 'string' && uid.trim() && Array.isArray(rawSlots)) {
          const cleanUid = uid.trim();
          this.playerInventories.set(cleanUid, normalizeInventorySlots(rawSlots, { ensureStarter: true }));
          this.verifiedInventoryUids.add(cleanUid);
        }
      }
    }

    this.playerOwnedClothing.clear();
    this.verifiedClothingUids.clear();
    if (rawOwnedClothing && typeof rawOwnedClothing === 'object') {
      for (const [uid, rawOwned] of Object.entries(rawOwnedClothing as Record<string, unknown>)) {
        if (typeof uid === 'string' && uid.trim() && Array.isArray(rawOwned)) {
          const cleanUid = uid.trim();
          this.playerOwnedClothing.set(cleanUid, normalizeOwnedClothingList(rawOwned));
          this.verifiedClothingUids.add(cleanUid);
        }
      }
    }
  }

  public serializeOwners(): FarmPlotOwnersMap {
    const out: FarmPlotOwnersMap = {};
    for (const [plotId, record] of this.owners.entries()) {
      out[plotId] = { ...record };
    }
    return out;
  }

  public serializeGoldBalances(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [uid, gold] of this.playerGold.entries()) {
      if (this.verifiedGoldUids.has(uid)) {
        out[uid] = gold;
      }
    }
    return out;
  }

  public serializeInventories(): Record<string, InventorySlot[]> {
    const out: Record<string, InventorySlot[]> = {};
    for (const [uid, slots] of this.playerInventories.entries()) {
      if (this.verifiedInventoryUids.has(uid)) {
        out[uid] = cloneSlots(slots);
      }
    }
    return out;
  }

  public serializeOwnedClothing(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [uid, list] of this.playerOwnedClothing.entries()) {
      if (this.verifiedClothingUids.has(uid)) {
        out[uid] = [...list];
      }
    }
    return out;
  }

  public getEconomyPersistPayload(): EconomyPersistPayload {
    return {
      goldBalances: this.serializeGoldBalances(),
      inventories: this.serializeInventories(),
      ownedClothing: this.serializeOwnedClothing(),
    };
  }

  public hydrateSaveRevisions(rawRevisions: unknown): void {
    this.playerSaveRevisions.clear();
    if (rawRevisions && typeof rawRevisions === 'object') {
      for (const [uid, rev] of Object.entries(rawRevisions as Record<string, unknown>)) {
        if (typeof uid === 'string' && uid.trim() && typeof rev === 'number' && Number.isFinite(rev) && rev >= 0) {
          this.playerSaveRevisions.set(uid.trim(), Math.floor(rev));
        }
      }
    }
  }

  public serializeSaveRevisions(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [uid, rev] of this.playerSaveRevisions.entries()) {
      out[uid] = rev;
    }
    return out;
  }

  public getSaveRevision(uid: string): number {
    return this.playerSaveRevisions.get(uid) ?? 0;
  }

  public isEconomyFullyVerified(uid: string): boolean {
    return (
      this.verifiedGoldUids.has(uid) &&
      this.verifiedInventoryUids.has(uid) &&
      this.verifiedClothingUids.has(uid)
    );
  }

  public getAuthoritativeEconomySnapshot(uid: string): AuthoritativeEconomySnapshot {
    return {
      gold: this.getPlayerGold(uid),
      inventorySlots: this.getPlayerInventory(uid),
      ownedClothing: this.getPlayerOwnedClothing(uid),
    };
  }

  public hasPlayerGold(uid: string): boolean {
    return this.playerGold.has(uid);
  }

  public isGoldVerified(uid: string): boolean {
    return this.verifiedGoldUids.has(uid);
  }

  public isInventoryVerified(uid: string): boolean {
    return this.verifiedInventoryUids.has(uid);
  }

  public isClothingVerified(uid: string): boolean {
    return this.verifiedClothingUids.has(uid);
  }

  public getPlayerGold(uid: string): number {
    return this.playerGold.get(uid) ?? 0;
  }

  public getPlayerInventory(uid: string): InventorySlot[] {
    const slots = this.playerInventories.get(uid);
    return slots ? cloneSlots(slots) : createStarterToolsOnlySlots();
  }

  public getPlayerOwnedClothing(uid: string): string[] {
    const owned = this.playerOwnedClothing.get(uid);
    return owned ? [...owned] : [];
  }

  public canPlayerFitItem(uid: string, itemId: ItemId | string, quantity = 1): boolean {
    const slots = this.playerInventories.get(uid) ?? createStarterToolsOnlySlots();
    return canFitInSlots(slots, itemId, quantity, MAX_INVENTORY_SLOTS);
  }

  public playerHasItem(uid: string, itemId: ItemId | string, quantity = 1): boolean {
    const slots = this.playerInventories.get(uid);
    if (!slots) return false;
    return hasItemInSlots(slots, itemId, quantity);
  }

  public getPlotOwner(plotId: string): FarmPlotOwnerRecord | undefined {
    return this.owners.get(plotId);
  }

  /**
   * Authoritatively seeds missing economy dimensions (Gold, Inventory, Owned Clothing)
   * from a trusted Firestore/server source without overwriting already-verified DO state.
   */
  public seedAuthoritativeEconomy(
    uid: string,
    seed: {
      gold: number;
      inventorySlots: InventorySlot[];
      ownedClothing: string[];
    },
    verified: boolean
  ): {
    gold: number;
    inventorySlots: InventorySlot[];
    ownedClothing: string[];
    seededGold: boolean;
    seededInventory: boolean;
    seededClothing: boolean;
  } {
    let seededGold = false;
    let seededInventory = false;
    let seededClothing = false;

    if (!this.verifiedGoldUids.has(uid) || !this.playerGold.has(uid)) {
      this.seedAuthoritativeGold(uid, seed.gold, verified);
      seededGold = verified;
    }

    if (!this.verifiedInventoryUids.has(uid) || !this.playerInventories.has(uid)) {
      this.seedAuthoritativeInventory(uid, seed.inventorySlots, verified);
      seededInventory = verified;
    }

    if (!this.verifiedClothingUids.has(uid) || !this.playerOwnedClothing.has(uid)) {
      this.seedAuthoritativeClothing(uid, seed.ownedClothing, verified);
      seededClothing = verified;
    }

    return {
      gold: this.getPlayerGold(uid),
      inventorySlots: this.getPlayerInventory(uid),
      ownedClothing: this.getPlayerOwnedClothing(uid),
      seededGold,
      seededInventory,
      seededClothing,
    };
  }

  /**
   * Authoritatively seeds initial Gold from a trusted server/Firestore source if no verified
   * balance exists yet for this UID. Never trusts client-supplied `profile.coins`.
   */
  public seedAuthoritativeGold(uid: string, trustedGold: number, verified: boolean): number {
    if (this.verifiedGoldUids.has(uid) && this.playerGold.has(uid)) {
      return this.playerGold.get(uid)!;
    }
    const clamped =
      typeof trustedGold === 'number' && Number.isFinite(trustedGold)
        ? Math.max(0, Math.min(MAX_SEED_INITIAL_GOLD, Math.round(trustedGold)))
        : 25;
    this.playerGold.set(uid, clamped);
    if (verified) {
      this.verifiedGoldUids.add(uid);
    }
    return clamped;
  }

  public seedAuthoritativeInventory(
    uid: string,
    rawSlots: unknown,
    verified = true
  ): InventorySlot[] {
    if (this.verifiedInventoryUids.has(uid) && this.playerInventories.has(uid)) {
      return this.getPlayerInventory(uid);
    }
    const normalized = normalizeInventorySlots(rawSlots, { ensureStarter: true });
    this.playerInventories.set(uid, normalized);
    if (verified) {
      this.verifiedInventoryUids.add(uid);
    }
    return cloneSlots(normalized);
  }

  public seedAuthoritativeClothing(
    uid: string,
    rawOwned: unknown,
    verified = true
  ): string[] {
    if (this.verifiedClothingUids.has(uid) && this.playerOwnedClothing.has(uid)) {
      return this.getPlayerOwnedClothing(uid);
    }
    const normalized = normalizeOwnedClothingList(rawOwned);
    this.playerOwnedClothing.set(uid, normalized);
    if (verified) {
      this.verifiedClothingUids.add(uid);
    }
    return [...normalized];
  }

  /**
   * Backward-compatible test/legacy helper — also seeds default starter inventory & clothing if unset
   * when `verified` is true so legacy tests that only seed Gold still run shop tests cleanly.
   */
  public seedPlayerGoldIfUnset(uid: string, initialCoins?: unknown, verified = true): number {
    const gold = this.seedAuthoritativeGold(
      uid,
      typeof initialCoins === 'number' && Number.isFinite(initialCoins) ? initialCoins : 25,
      verified
    );
    if (!this.verifiedInventoryUids.has(uid)) {
      this.seedAuthoritativeInventory(uid, createStarterInventorySlots(), verified);
    }
    if (!this.verifiedClothingUids.has(uid)) {
      this.seedAuthoritativeClothing(uid, [], verified);
    }
    return gold;
  }

  private rememberBoundedTx<T>(map: Map<string, T>, cacheKey: string, result: T): void {
    map.set(cacheKey, result);
    if (map.size > MAX_PROCESSED_TX_CACHE) {
      const oldestKey = map.keys().next().value;
      if (oldestKey) {
        map.delete(oldestKey);
      }
    }
  }

  private executeVerifiedShopTradeSync(
    uid: string,
    payload: { txId?: unknown; action?: unknown; itemId?: unknown; quantity?: unknown },
    options?: { skipTxCache?: boolean }
  ): { result: ShopTradeResult; mutated: boolean; cacheResult: boolean } {
    const current = this.playerGold.get(uid) ?? 25;
    const currentInv = this.getPlayerInventory(uid);
    const currentClothing = this.getPlayerOwnedClothing(uid);
    const rawTxId =
      typeof payload.txId === 'string' && payload.txId.trim().length > 0
        ? payload.txId.trim().slice(0, 80)
        : undefined;

    if (rawTxId && !options?.skipTxCache) {
      const cached = this.processedShopTx.get(`${uid}:${rawTxId}`);
      if (cached) {
        return {
          result: {
            ...cached,
            inventorySlots: cached.inventorySlots ? cloneSlots(cached.inventorySlots) : this.getPlayerInventory(uid),
            ownedClothing: cached.ownedClothing ? [...cached.ownedClothing] : this.getPlayerOwnedClothing(uid),
            deduplicated: true,
          },
          mutated: false,
          cacheResult: false,
        };
      }
    }

    const action = payload.action;
    const itemId = typeof payload.itemId === 'string' ? payload.itemId.trim() : '';

    if (
      !this.verifiedGoldUids.has(uid) ||
      !this.verifiedInventoryUids.has(uid) ||
      (action === 'buy_clothing' && !this.verifiedClothingUids.has(uid))
    ) {
      return {
        result: {
          ok: false,
          txId: rawTxId,
          itemId,
          balance: current,
          inventorySlots: currentInv,
          ownedClothing: currentClothing,
          code: 'LEDGER_UNVERIFIED',
          reason: 'Gold နှင့် Inventory စာရင်း အတည်ပြုနေဆဲ ဖြစ်ပါသည် (ခဏအကြာ ပြန်လည်ချိတ်ဆက်ပါ)',
        },
        mutated: false,
        cacheResult: false,
      };
    }

    let qty = 1;
    if (payload.quantity !== undefined) {
      if (
        typeof payload.quantity !== 'number' ||
        !Number.isFinite(payload.quantity) ||
        !Number.isInteger(payload.quantity) ||
        payload.quantity < 1 ||
        payload.quantity > 99
      ) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            itemId,
            balance: current,
            inventorySlots: currentInv,
            code: 'INVALID_QUANTITY',
            reason: 'ပမာဏ (Quantity) သည် ၁ မှ ၉၉ အတွင်း ကိန်းပြည့် ဖြစ်ရပါမည်',
          },
          mutated: false,
          cacheResult: true,
        };
      }
      qty = payload.quantity;
    }

    if (!itemId) {
      return {
        result: {
          ok: false,
          txId: rawTxId,
          balance: current,
          inventorySlots: currentInv,
          code: 'INVALID_ITEM',
          reason: 'Invalid itemId',
        },
        mutated: false,
        cacheResult: true,
      };
    }

    const inv = this.playerInventories.get(uid)!;

    if (action === 'sell_item') {
      if (isStarterTool(itemId)) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: qty,
            balance: current,
            inventorySlots: cloneSlots(inv),
            code: 'STARTER_TOOL_LOCKED',
            reason: 'အခြေခံကိရိယာများကို ရောင်းချ၍မရပါ',
          },
          mutated: false,
          cacheResult: true,
        };
      }
      const def = (ITEMS as Record<string, { sellPrice?: number }>)[itemId];
      if (!def || typeof def.sellPrice !== 'number' || def.sellPrice <= 0) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: qty,
            balance: current,
            inventorySlots: cloneSlots(inv),
            code: 'ITEM_NOT_SELLABLE',
            reason: 'ဤပစ္စည်းကို ရောင်းချ၍မရပါ',
          },
          mutated: false,
          cacheResult: true,
        };
      }

      if (!hasItemInSlots(inv, itemId, qty)) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: qty,
            balance: current,
            inventorySlots: cloneSlots(inv),
            code: 'INSUFFICIENT_ITEMS',
            reason: 'သင့်အိတ်ထဲတွင် ရောင်းချရန် ပစ္စည်းအလုံအလောက် မရှိပါ',
          },
          mutated: false,
          cacheResult: true,
        };
      }

      const removed = removeItemFromSlots(inv, itemId, qty);
      if (!removed) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: qty,
            balance: current,
            inventorySlots: cloneSlots(inv),
            code: 'INSUFFICIENT_ITEMS',
            reason: 'သင့်အိတ်ထဲတွင် ရောင်းချရန် ပစ္စည်းအလုံအလောက် မရှိပါ',
          },
          mutated: false,
          cacheResult: true,
        };
      }

      const next = Math.min(MAX_GOLD_BALANCE, current + def.sellPrice * qty);
      this.playerGold.set(uid, next);
      return {
        result: {
          ok: true,
          txId: rawTxId,
          action,
          itemId,
          quantity: qty,
          balance: next,
          inventorySlots: cloneSlots(inv),
        },
        mutated: true,
        cacheResult: true,
      };
    }

    if (action === 'buy_item') {
      if (isStarterTool(itemId)) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: qty,
            balance: current,
            inventorySlots: cloneSlots(inv),
            code: 'STARTER_TOOL_LOCKED',
            reason: 'အခြေခံကိရိယာများကို ဝယ်ယူ၍မရပါ',
          },
          mutated: false,
          cacheResult: true,
        };
      }
      const price = MERCHANT_PRICE_MAP.get(itemId);
      if (typeof price !== 'number' || price <= 0) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: qty,
            balance: current,
            inventorySlots: cloneSlots(inv),
            code: 'ITEM_NOT_FOUND',
            reason: 'ဆိုင်စာရင်းတွင် ဤပစ္စည်း မရှိပါ',
          },
          mutated: false,
          cacheResult: true,
        };
      }
      const total = price * qty;
      if (current < total) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: qty,
            balance: current,
            inventorySlots: cloneSlots(inv),
            code: 'INSUFFICIENT_GOLD',
            reason: 'ရွှေဒင်္ဂါး မလုံလောက်ပါ',
          },
          mutated: false,
          cacheResult: true,
        };
      }

      if (!canFitInSlots(inv, itemId, qty, MAX_INVENTORY_SLOTS)) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: qty,
            balance: current,
            inventorySlots: cloneSlots(inv),
            code: 'INVENTORY_FULL',
            reason: '🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိပါ (ဝယ်ယူမှု မအောင်မြင်ပါ)',
          },
          mutated: false,
          cacheResult: true,
        };
      }

      const added = addItemToSlots(inv, itemId, qty, MAX_INVENTORY_SLOTS);
      if (!added) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: qty,
            balance: current,
            inventorySlots: cloneSlots(inv),
            code: 'INVENTORY_FULL',
            reason: '🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိပါ',
          },
          mutated: false,
          cacheResult: true,
        };
      }

      const next = current - total;
      this.playerGold.set(uid, next);
      return {
        result: {
          ok: true,
          txId: rawTxId,
          action,
          itemId,
          quantity: qty,
          balance: next,
          inventorySlots: cloneSlots(inv),
        },
        mutated: true,
        cacheResult: true,
      };
    }

    if (action === 'buy_clothing') {
      const ownedList = this.playerOwnedClothing.get(uid) ?? [];
      if (qty !== 1) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: qty,
            balance: current,
            ownedClothing: [...ownedList],
            code: 'INVALID_QUANTITY',
            reason: 'ဝတ်စုံကို တစ်ကြိမ်လျှင် ၁ ထည်သာ ဝယ်ယူနိုင်ပါသည်',
          },
          mutated: false,
          cacheResult: true,
        };
      }
      const cloth = AUNTY_GYI_CATALOG_MAP[itemId];
      if (!cloth || typeof cloth.goldPrice !== 'number' || cloth.goldPrice <= 0) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: 1,
            balance: current,
            ownedClothing: [...ownedList],
            code: 'CLOTHING_NOT_FOUND',
            reason: 'အဝတ်အစားပစ္စည်း ရှာမတွေ့ပါ',
          },
          mutated: false,
          cacheResult: true,
        };
      }
      if (ownedList.includes(itemId)) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: 1,
            balance: current,
            ownedClothing: [...ownedList],
            code: 'ALREADY_OWNED',
            reason: 'ဤအဝတ်အစားကို ဝယ်ယူပြီးသား ဖြစ်ပါသည်',
          },
          mutated: false,
          cacheResult: true,
        };
      }
      if (current < cloth.goldPrice) {
        return {
          result: {
            ok: false,
            txId: rawTxId,
            action,
            itemId,
            quantity: 1,
            balance: current,
            ownedClothing: [...ownedList],
            code: 'INSUFFICIENT_GOLD',
            reason: 'ရွှေဒင်္ဂါး မလုံလောက်ပါ',
          },
          mutated: false,
          cacheResult: true,
        };
      }

      const nextOwned = [...ownedList, itemId];
      const next = current - cloth.goldPrice;
      this.playerGold.set(uid, next);
      this.playerOwnedClothing.set(uid, nextOwned);
      return {
        result: {
          ok: true,
          txId: rawTxId,
          action,
          itemId,
          quantity: 1,
          balance: next,
          ownedClothing: [...nextOwned],
        },
        mutated: true,
        cacheResult: true,
      };
    }

    return {
      result: {
        ok: false,
        txId: rawTxId,
        itemId,
        balance: current,
        inventorySlots: currentInv,
        code: 'UNSUPPORTED_ACTION',
        reason: 'Unsupported shop trade action',
      },
      mutated: false,
      cacheResult: true,
    };
  }

  /**
   * Synchronous verified shop trade (preserves compatibility with synchronous unit tests).
   * Enforces server catalog pricing, server inventory ownership/capacity, and txId idempotency.
   */
  public applyVerifiedShopTrade(
    uid: string,
    payload: { txId?: unknown; action?: unknown; itemId?: unknown; quantity?: unknown }
  ): ShopTradeResult {
    const rawTxId =
      typeof payload.txId === 'string' && payload.txId.trim().length > 0
        ? payload.txId.trim().slice(0, 80)
        : undefined;

    if (rawTxId) {
      const cached = this.processedShopTx.get(`${uid}:${rawTxId}`);
      if (cached) {
        return {
          ...cached,
          inventorySlots: cached.inventorySlots ? cloneSlots(cached.inventorySlots) : this.getPlayerInventory(uid),
          ownedClothing: cached.ownedClothing ? [...cached.ownedClothing] : this.getPlayerOwnedClothing(uid),
          deduplicated: true,
        };
      }
    }

    if (this.inFlightEconomyPlayers.has(uid)) {
      return {
        ok: false,
        txId: rawTxId,
        balance: this.getPlayerGold(uid),
        inventorySlots: this.getPlayerInventory(uid),
        ownedClothing: this.getPlayerOwnedClothing(uid),
        code: 'TRADE_IN_PROGRESS',
        reason: 'အရောင်းအဝယ် လုပ်ဆောင်နေဆဲ ဖြစ်ပါသည် (ခဏစောင့်ပါ)',
      };
    }

    const { result, cacheResult } = this.executeVerifiedShopTradeSync(uid, payload, { skipTxCache: true });
    if (rawTxId && cacheResult) {
      this.rememberBoundedTx(this.processedShopTx, `${uid}:${rawTxId}`, result);
    }
    return result;
  }

  /**
   * Async atomic Shop Trade with synchronous per-player lock and strict rollback if persistence fails.
   */
  public async applyVerifiedShopTradeAtomic(params: {
    uid: string;
    payload: { txId?: unknown; action?: unknown; itemId?: unknown; quantity?: unknown };
    persist?: (economy: EconomyPersistPayload) => Promise<void>;
  }): Promise<ShopTradeResult> {
    const { uid, payload, persist } = params;
    const rawTxId =
      typeof payload.txId === 'string' && payload.txId.trim().length > 0
        ? payload.txId.trim().slice(0, 80)
        : undefined;

    if (rawTxId) {
      const cached = this.processedShopTx.get(`${uid}:${rawTxId}`);
      if (cached) {
        return {
          ...cached,
          inventorySlots: cached.inventorySlots ? cloneSlots(cached.inventorySlots) : this.getPlayerInventory(uid),
          ownedClothing: cached.ownedClothing ? [...cached.ownedClothing] : this.getPlayerOwnedClothing(uid),
          deduplicated: true,
        };
      }
    }

    if (this.inFlightEconomyPlayers.has(uid) || this.inFlightBuyers.has(uid)) {
      return {
        ok: false,
        txId: rawTxId,
        action: typeof payload.action === 'string' ? (payload.action as ShopTradeAction) : undefined,
        itemId: typeof payload.itemId === 'string' ? payload.itemId : undefined,
        balance: this.getPlayerGold(uid),
        inventorySlots: this.getPlayerInventory(uid),
        ownedClothing: this.getPlayerOwnedClothing(uid),
        code: 'TRADE_IN_PROGRESS',
        reason: 'အရောင်းအဝယ် လုပ်ဆောင်နေဆဲ ဖြစ်ပါသည် (ခဏစောင့်ပါ)',
      };
    }

    this.inFlightEconomyPlayers.add(uid);
    const prevGold = this.playerGold.get(uid);
    const prevInv = this.playerInventories.has(uid) ? cloneSlots(this.playerInventories.get(uid)!) : null;
    const prevClothing = this.playerOwnedClothing.has(uid)
      ? [...this.playerOwnedClothing.get(uid)!]
      : null;

    try {
      const { result, mutated, cacheResult } = this.executeVerifiedShopTradeSync(uid, payload, {
        skipTxCache: true,
      });

      if (mutated && persist) {
        try {
          await persist(this.getEconomyPersistPayload());
        } catch {
          if (prevGold !== undefined) this.playerGold.set(uid, prevGold);
          else this.playerGold.delete(uid);
          if (prevInv !== null) this.playerInventories.set(uid, prevInv);
          if (prevClothing !== null) this.playerOwnedClothing.set(uid, prevClothing);

          return {
            ok: false,
            txId: rawTxId,
            action: result.action,
            itemId: result.itemId,
            quantity: result.quantity,
            balance: prevGold ?? 0,
            inventorySlots: prevInv ? cloneSlots(prevInv) : this.getPlayerInventory(uid),
            ownedClothing: prevClothing ? [...prevClothing] : this.getPlayerOwnedClothing(uid),
            code: 'PERSIST_FAILED',
            reason: 'အရောင်းအဝယ် သိမ်းဆည်းရာတွင် အမှားဖြစ်ပေါ်ခဲ့ပါသည် (ပြန်လည်ပယ်ဖျက်ပြီးပါပြီ)',
          };
        }
      }

      if (rawTxId && cacheResult) {
        this.rememberBoundedTx(this.processedShopTx, `${uid}:${rawTxId}`, result);
      }
      return result;
    } finally {
      this.inFlightEconomyPlayers.delete(uid);
    }
  }

  /**
   * Authoritatively claims a fishing catch into Server Inventory.
   * Pre-checks capacity for ALL 3 fish before depleting the fishing spot so full bags never
   * receive partial fish or deplete nodes unnecessarily.
   */
  public async claimFishingCatchAtomic(params: {
    uid: string;
    nodeId: string;
    sessionId: string;
    inSuccessZone: boolean;
    fishingTracker: FishingSessionTracker;
    depletedResources: Map<string, number>;
    now?: number;
    persist?: (economy: EconomyPersistPayload) => Promise<void>;
  }): Promise<FishingClaimResult & { inventorySlots: InventorySlot[] }> {
    const { uid, nodeId, sessionId, inSuccessZone, fishingTracker, depletedResources, now, persist } = params;

    if (this.inFlightEconomyPlayers.has(uid)) {
      return {
        ok: false,
        sessionId,
        nodeId,
        caught: false,
        itemId: 'fish',
        quantity: 0,
        code: 'TRADE_IN_PROGRESS',
        reason: 'စာရင်းလုပ်ဆောင်နေဆဲ ဖြစ်ပါသည် (ခဏစောင့်ပါ)',
        inventorySlots: this.getPlayerInventory(uid),
      };
    }

    this.inFlightEconomyPlayers.add(uid);
    const prevInv = this.playerInventories.has(uid) ? cloneSlots(this.playerInventories.get(uid)!) : null;
    const prevDepleted = depletedResources.get(nodeId);

    try {
      const claim = fishingTracker.claimCatch({
        playerId: uid,
        nodeId,
        sessionId,
        inSuccessZone,
        depletedResources,
        now,
        canAcceptReward: (qty) => {
          if (!this.verifiedInventoryUids.has(uid) || !this.playerInventories.has(uid)) {
            return {
              ok: false,
              code: 'LEDGER_UNVERIFIED',
              reason: 'Inventory စာရင်း အတည်ပြုနေဆဲ ဖြစ်ပါသည်',
            };
          }
          const inv = this.playerInventories.get(uid)!;
          if (!canFitInSlots(inv, 'fish', qty, MAX_INVENTORY_SLOTS)) {
            return {
              ok: false,
              code: 'INVENTORY_FULL',
              reason: '🎒 အိတ်ထဲတွင် ငါး ၃ ကောင်အတွက် နေရာလွတ်မရှိပါ',
            };
          }
          return { ok: true };
        },
      });

      if (!claim.ok || !claim.caught || claim.quantity <= 0) {
        return {
          ...claim,
          inventorySlots: this.getPlayerInventory(uid),
        };
      }

      const inv = this.playerInventories.get(uid)!;
      const added = addItemToSlots(inv, 'fish', claim.quantity, MAX_INVENTORY_SLOTS);
      if (!added) {
        if (prevDepleted !== undefined) depletedResources.set(nodeId, prevDepleted);
        else depletedResources.delete(nodeId);
        return {
          ok: false,
          sessionId: claim.sessionId,
          nodeId,
          caught: false,
          itemId: 'fish',
          quantity: 0,
          code: 'INVENTORY_FULL',
          reason: '🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိပါ',
          inventorySlots: cloneSlots(inv),
        };
      }

      if (persist) {
        try {
          await persist(this.getEconomyPersistPayload());
        } catch {
          if (prevInv !== null) this.playerInventories.set(uid, prevInv);
          if (prevDepleted !== undefined) depletedResources.set(nodeId, prevDepleted);
          else depletedResources.delete(nodeId);
          return {
            ok: false,
            sessionId: claim.sessionId,
            nodeId,
            caught: false,
            itemId: 'fish',
            quantity: 0,
            code: 'PERSIST_FAILED',
            reason: 'ငါးမျှားရလဒ် သိမ်းဆည်းရာတွင် အမှားဖြစ်ပေါ်ခဲ့ပါသည်',
            inventorySlots: prevInv ? cloneSlots(prevInv) : this.getPlayerInventory(uid),
          };
        }
      }

      return {
        ...claim,
        inventorySlots: cloneSlots(inv),
      };
    } finally {
      this.inFlightEconomyPlayers.delete(uid);
    }
  }

  /**
   * Authoritatively grants resource gathering yield into Server Inventory.
   */
  public async gatherResourceAtomic(params: {
    uid: string;
    nodeId: string;
    yieldItem: ItemId;
    yieldAmount: number;
    respawnDurationMs: number;
    depletedResources: Map<string, number>;
    now?: number;
    persist?: (economy: EconomyPersistPayload) => Promise<void>;
  }): Promise<GatherServerResult> {
    const now = params.now ?? Date.now();
    const { uid, nodeId, yieldItem, yieldAmount, respawnDurationMs, depletedResources, persist } = params;

    if (!this.verifiedInventoryUids.has(uid) || !this.playerInventories.has(uid)) {
      return {
        ok: false,
        nodeId,
        code: 'LEDGER_UNVERIFIED',
        reason: 'Inventory စာရင်း အတည်ပြုနေဆဲ ဖြစ်ပါသည်',
        inventorySlots: this.getPlayerInventory(uid),
      };
    }

    if (this.inFlightEconomyPlayers.has(uid)) {
      return {
        ok: false,
        nodeId,
        code: 'TRADE_IN_PROGRESS',
        reason: 'စာရင်းလုပ်ဆောင်နေဆဲ ဖြစ်ပါသည်',
        inventorySlots: this.getPlayerInventory(uid),
      };
    }

    const depletedUntil = depletedResources.get(nodeId);
    if (depletedUntil && depletedUntil > now) {
      return {
        ok: false,
        nodeId,
        code: 'NODE_DEPLETED',
        reason: 'သယံဇာတ ပြန်ပေါ်ရန် စောင့်ဆိုင်းနေပါသည်',
        inventorySlots: this.getPlayerInventory(uid),
      };
    }

    this.inFlightEconomyPlayers.add(uid);
    const inv = this.playerInventories.get(uid)!;
    const prevInv = cloneSlots(inv);
    const prevDepleted = depletedResources.get(nodeId);

    try {
      if (!canFitInSlots(inv, yieldItem, yieldAmount, MAX_INVENTORY_SLOTS)) {
        return {
          ok: false,
          nodeId,
          code: 'INVENTORY_FULL',
          reason: '🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိပါ',
          inventorySlots: cloneSlots(inv),
        };
      }

      addItemToSlots(inv, yieldItem, yieldAmount, MAX_INVENTORY_SLOTS);
      const respawnAt = now + respawnDurationMs;
      depletedResources.set(nodeId, respawnAt);

      if (persist) {
        try {
          await persist(this.getEconomyPersistPayload());
        } catch {
          this.playerInventories.set(uid, prevInv);
          if (prevDepleted !== undefined) depletedResources.set(nodeId, prevDepleted);
          else depletedResources.delete(nodeId);
          return {
            ok: false,
            nodeId,
            code: 'PERSIST_FAILED',
            reason: 'သယံဇာတ စုဆောင်းမှု သိမ်းဆည်းမရပါ',
            inventorySlots: cloneSlots(prevInv),
          };
        }
      }

      return {
        ok: true,
        nodeId,
        itemId: yieldItem,
        quantity: yieldAmount,
        respawnAt,
        inventorySlots: cloneSlots(inv),
      };
    } finally {
      this.inFlightEconomyPlayers.delete(uid);
    }
  }

  /**
   * Authoritatively executes a Crafting recipe against Server Inventory.
   */
  public async craftRecipeAtomic(params: {
    uid: string;
    recipeId: unknown;
    txId?: unknown;
    persist?: (economy: EconomyPersistPayload) => Promise<void>;
  }): Promise<CraftServerResult> {
    const { uid, persist } = params;
    const recipeId = typeof params.recipeId === 'string' ? params.recipeId.trim() : '';
    const rawTxId =
      typeof params.txId === 'string' && params.txId.trim().length > 0
        ? params.txId.trim().slice(0, 80)
        : undefined;

    if (rawTxId) {
      const cached = this.processedCraftTx.get(`${uid}:${rawTxId}`);
      if (cached) {
        return {
          ...cached,
          inventorySlots: this.getPlayerInventory(uid),
          deduplicated: true,
        };
      }
    }

    const recipe = CRAFTING_RECIPE_MAP.get(recipeId);
    if (!recipe) {
      return {
        ok: false,
        txId: rawTxId,
        recipeId,
        code: 'RECIPE_NOT_FOUND',
        reason: 'ဖန်တီးမှုပုံစံငယ် ရှာမတွေ့ပါ',
        inventorySlots: this.getPlayerInventory(uid),
      };
    }

    if (!this.verifiedInventoryUids.has(uid) || !this.playerInventories.has(uid)) {
      return {
        ok: false,
        txId: rawTxId,
        recipeId,
        code: 'LEDGER_UNVERIFIED',
        reason: 'Inventory စာရင်း အတည်ပြုနေဆဲ ဖြစ်ပါသည်',
        inventorySlots: this.getPlayerInventory(uid),
      };
    }

    if (this.inFlightEconomyPlayers.has(uid)) {
      return {
        ok: false,
        txId: rawTxId,
        recipeId,
        code: 'TRADE_IN_PROGRESS',
        reason: 'လုပ်ဆောင်နေဆဲ ဖြစ်ပါသည် (ခဏစောင့်ပါ)',
        inventorySlots: this.getPlayerInventory(uid),
      };
    }

    this.inFlightEconomyPlayers.add(uid);
    const prevInv = cloneSlots(this.playerInventories.get(uid)!);
    const workingInv = cloneSlots(prevInv);

    try {
      for (const ing of recipe.ingredients) {
        if (!hasItemInSlots(workingInv, ing.item, ing.quantity)) {
          const res: CraftServerResult = {
            ok: false,
            txId: rawTxId,
            recipeId,
            code: 'MISSING_INGREDIENTS',
            reason: 'လိုအပ်သော ပစ္စည်းများ မပြည့်စုံသေးပါ',
            inventorySlots: cloneSlots(prevInv),
          };
          if (rawTxId) this.rememberBoundedTx(this.processedCraftTx, `${uid}:${rawTxId}`, res);
          return res;
        }
      }

      for (const ing of recipe.ingredients) {
        removeItemFromSlots(workingInv, ing.item, ing.quantity);
      }

      if (!addItemToSlots(workingInv, recipe.resultItem, recipe.resultCount, MAX_INVENTORY_SLOTS)) {
        const res: CraftServerResult = {
          ok: false,
          txId: rawTxId,
          recipeId,
          code: 'INVENTORY_FULL',
          reason: '🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိပါ',
          inventorySlots: cloneSlots(prevInv),
        };
        if (rawTxId) this.rememberBoundedTx(this.processedCraftTx, `${uid}:${rawTxId}`, res);
        return res;
      }

      this.playerInventories.set(uid, workingInv);

      if (persist) {
        try {
          await persist(this.getEconomyPersistPayload());
        } catch {
          this.playerInventories.set(uid, prevInv);
          return {
            ok: false,
            txId: rawTxId,
            recipeId,
            code: 'PERSIST_FAILED',
            reason: 'ဖန်တီးမှု သိမ်းဆည်းရာတွင် အမှားဖြစ်ပေါ်ခဲ့ပါသည်',
            inventorySlots: cloneSlots(prevInv),
          };
        }
      }

      const res: CraftServerResult = {
        ok: true,
        txId: rawTxId,
        recipeId,
        resultItem: recipe.resultItem,
        resultCount: recipe.resultCount,
        inventorySlots: cloneSlots(workingInv),
      };
      if (rawTxId) this.rememberBoundedTx(this.processedCraftTx, `${uid}:${rawTxId}`, res);
      return res;
    } finally {
      this.inFlightEconomyPlayers.delete(uid);
    }
  }

  /**
   * Atomically consumes building placement material from Server Inventory (or skips for move)
   * and commits + persists world building placement with full rollback on error.
   */
  public async commitBuildWithWorldAtomic(params: {
    uid: string;
    buildingType: BuildingType;
    isMove: boolean;
    useRawFenceMaterials?: boolean;
    commitWorld: () => void;
    rollbackWorld: () => void;
    persist?: (economy: EconomyPersistPayload) => Promise<void>;
  }): Promise<BuildInventoryCommitResult> {
    const { uid, buildingType, isMove, useRawFenceMaterials, commitWorld, rollbackWorld, persist } = params;

    if (!this.verifiedInventoryUids.has(uid) || !this.playerInventories.has(uid)) {
      return {
        ok: false,
        inventorySlots: this.getPlayerInventory(uid),
        code: 'LEDGER_UNVERIFIED',
        reason: 'Inventory စာရင်း အတည်ပြုနေဆဲ ဖြစ်ပါသည်',
      };
    }

    if (this.inFlightEconomyPlayers.has(uid)) {
      return {
        ok: false,
        inventorySlots: this.getPlayerInventory(uid),
        code: 'TRADE_IN_PROGRESS',
        reason: 'လုပ်ဆောင်နေဆဲ ဖြစ်ပါသည် (ခဏစောင့်ပါ)',
      };
    }

    this.inFlightEconomyPlayers.add(uid);
    const inv = this.playerInventories.get(uid)!;
    const prevInv = cloneSlots(inv);

    try {
      if (!isMove) {
        if (buildingType === 'fence_wood' && useRawFenceMaterials) {
          if (!hasItemInSlots(inv, 'wood', 2) || !hasItemInSlots(inv, 'fiber', 1)) {
            return {
              ok: false,
              inventorySlots: cloneSlots(prevInv),
              code: 'INSUFFICIENT_ITEMS',
              reason: 'ခြံစည်းရိုးဆောက်ရန် သစ်သား ၂ ခု နှင့် အမျှင် ၁ ခု လိုအပ်ပါသည်',
            };
          }
          removeItemFromSlots(inv, 'wood', 2);
          removeItemFromSlots(inv, 'fiber', 1);
        } else {
          if (!hasItemInSlots(inv, buildingType, 1)) {
            return {
              ok: false,
              inventorySlots: cloneSlots(prevInv),
              code: 'INSUFFICIENT_ITEMS',
              reason: 'အိတ်ထဲတွင် ဆောက်လုပ်ရန် ဤအဆောက်အအုံပစ္စည်း မရှိပါ',
            };
          }
          removeItemFromSlots(inv, buildingType, 1);
        }
      }

      commitWorld();

      if (persist) {
        try {
          await persist(this.getEconomyPersistPayload());
        } catch {
          this.playerInventories.set(uid, prevInv);
          rollbackWorld();
          return {
            ok: false,
            inventorySlots: cloneSlots(prevInv),
            code: 'PERSIST_FAILED',
            reason: 'အဆောက်အအုံ သိမ်းဆည်းရာတွင် အမှားဖြစ်ပေါ်ခဲ့ပါသည်',
          };
        }
      }

      return {
        ok: true,
        inventorySlots: cloneSlots(inv),
      };
    } finally {
      this.inFlightEconomyPlayers.delete(uid);
    }
  }

  /**
   * Atomically refunds a dismantled building item back into Server Inventory and commits world removal.
   */
  public async commitDismantleWithWorldAtomic(params: {
    uid: string;
    buildingType: BuildingType;
    commitWorld: () => void;
    rollbackWorld: () => void;
    persist?: (economy: EconomyPersistPayload) => Promise<void>;
  }): Promise<BuildInventoryCommitResult> {
    const { uid, buildingType, commitWorld, rollbackWorld, persist } = params;

    if (!this.verifiedInventoryUids.has(uid) || !this.playerInventories.has(uid)) {
      return {
        ok: false,
        inventorySlots: this.getPlayerInventory(uid),
        code: 'LEDGER_UNVERIFIED',
        reason: 'Inventory စာရင်း အတည်ပြုနေဆဲ ဖြစ်ပါသည်',
      };
    }

    if (this.inFlightEconomyPlayers.has(uid)) {
      return {
        ok: false,
        inventorySlots: this.getPlayerInventory(uid),
        code: 'TRADE_IN_PROGRESS',
        reason: 'လုပ်ဆောင်နေဆဲ ဖြစ်ပါသည် (ခဏစောင့်ပါ)',
      };
    }

    this.inFlightEconomyPlayers.add(uid);
    const inv = this.playerInventories.get(uid)!;
    const prevInv = cloneSlots(inv);

    try {
      if (!canFitInSlots(inv, buildingType, 1, MAX_INVENTORY_SLOTS)) {
        return {
          ok: false,
          inventorySlots: cloneSlots(prevInv),
          code: 'INVENTORY_FULL',
          reason: '🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိသဖြင့် ဖျက်သိမ်း၍မရပါ',
        };
      }

      addItemToSlots(inv, buildingType, 1, MAX_INVENTORY_SLOTS);
      commitWorld();

      if (persist) {
        try {
          await persist(this.getEconomyPersistPayload());
        } catch {
          this.playerInventories.set(uid, prevInv);
          rollbackWorld();
          return {
            ok: false,
            inventorySlots: cloneSlots(prevInv),
            code: 'PERSIST_FAILED',
            reason: 'ဖျက်သိမ်းမှု သိမ်းဆည်းရာတွင် အမှားဖြစ်ပေါ်ခဲ့ပါသည်',
          };
        }
      }

      return {
        ok: true,
        inventorySlots: cloneSlots(inv),
      };
    } finally {
      this.inFlightEconomyPlayers.delete(uid);
    }
  }

  /**
   * Authoritatively transfers items between a player's Server Inventory and an owned Storage Box.
   */
  public async transferStorageBoxAtomic(params: {
    uid: string;
    txId?: unknown;
    building?: PlacedBuilding;
    direction: unknown;
    itemId: unknown;
    quantity?: unknown;
    persist?: (economy: EconomyPersistPayload) => Promise<void>;
  }): Promise<StorageTransferServerResult> {
    const { uid, building, direction, persist } = params;
    const buildingId = building?.id || '';
    const itemId = typeof params.itemId === 'string' ? params.itemId.trim() : '';
    const rawTxId =
      typeof params.txId === 'string' && params.txId.trim().length > 0
        ? params.txId.trim().slice(0, 80)
        : undefined;
    const dir = direction === 'deposit' || direction === 'withdraw' ? direction : 'deposit';

    if (rawTxId) {
      const cached = this.processedStorageTx.get(`${uid}:${rawTxId}`);
      if (cached) {
        return {
          ...cached,
          inventorySlots: this.getPlayerInventory(uid),
          storage: building?.storage ? cloneSlots(building.storage) : cached.storage,
          deduplicated: true,
        };
      }
    }

    if (!building || building.type !== 'storage_box') {
      return {
        ok: false,
        txId: rawTxId,
        buildingId,
        direction: dir,
        itemId,
        quantity: 0,
        inventorySlots: this.getPlayerInventory(uid),
        code: 'STORAGE_NOT_FOUND',
        reason: 'သိုလှောင်သေတ္တာ ရှာမတွေ့ပါ',
      };
    }

    if (!canOwnerModifyBuilding(building, uid)) {
      return {
        ok: false,
        txId: rawTxId,
        buildingId,
        direction: dir,
        itemId,
        quantity: 0,
        inventorySlots: this.getPlayerInventory(uid),
        storage: cloneSlots(building.storage || []),
        code: 'FORBIDDEN',
        reason: 'မိမိပိုင်ဆိုင်သော သိုလှောင်သေတ္တာကိုသာ အသုံးပြုနိုင်ပါသည်',
      };
    }

    if (direction !== 'deposit' && direction !== 'withdraw') {
      return {
        ok: false,
        txId: rawTxId,
        buildingId,
        direction: dir,
        itemId,
        quantity: 0,
        inventorySlots: this.getPlayerInventory(uid),
        storage: cloneSlots(building.storage || []),
        code: 'INVALID_ACTION',
        reason: 'Invalid transfer direction',
      };
    }

    let qty = 1;
    if (params.quantity !== undefined) {
      if (
        typeof params.quantity !== 'number' ||
        !Number.isFinite(params.quantity) ||
        !Number.isInteger(params.quantity) ||
        params.quantity < 1 ||
        params.quantity > 99
      ) {
        return {
          ok: false,
          txId: rawTxId,
          buildingId,
          direction: dir,
          itemId,
          quantity: 0,
          inventorySlots: this.getPlayerInventory(uid),
          storage: cloneSlots(building.storage || []),
          code: 'INVALID_QUANTITY',
          reason: 'ပမာဏ (Quantity) သည် ၁ မှ ၉၉ အတွင်း ကိန်းပြည့် ဖြစ်ရပါမည်',
        };
      }
      qty = params.quantity;
    }

    if (!itemId || isStarterTool(itemId) || !(ITEMS as Record<string, unknown>)[itemId]) {
      return {
        ok: false,
        txId: rawTxId,
        buildingId,
        direction: dir,
        itemId,
        quantity: qty,
        inventorySlots: this.getPlayerInventory(uid),
        storage: cloneSlots(building.storage || []),
        code: isStarterTool(itemId) ? 'STARTER_TOOL_LOCKED' : 'INVALID_ITEM',
        reason: isStarterTool(itemId)
          ? 'အခြေခံကိရိယာများကို သေတ္တာထဲသို့ ထည့်၍မရပါ'
          : 'Invalid itemId',
      };
    }

    if (!this.verifiedInventoryUids.has(uid) || !this.playerInventories.has(uid)) {
      return {
        ok: false,
        txId: rawTxId,
        buildingId,
        direction: dir,
        itemId,
        quantity: qty,
        inventorySlots: this.getPlayerInventory(uid),
        storage: cloneSlots(building.storage || []),
        code: 'LEDGER_UNVERIFIED',
        reason: 'Inventory စာရင်း အတည်ပြုနေဆဲ ဖြစ်ပါသည်',
      };
    }

    if (this.inFlightEconomyPlayers.has(uid)) {
      return {
        ok: false,
        txId: rawTxId,
        buildingId,
        direction: dir,
        itemId,
        quantity: qty,
        inventorySlots: this.getPlayerInventory(uid),
        storage: cloneSlots(building.storage || []),
        code: 'TRADE_IN_PROGRESS',
        reason: 'လုပ်ဆောင်နေဆဲ ဖြစ်ပါသည် (ခဏစောင့်ပါ)',
      };
    }

    this.inFlightEconomyPlayers.add(uid);
    const inv = this.playerInventories.get(uid)!;
    const prevInv = cloneSlots(inv);
    const prevStorage = normalizeStorageSlots(building.storage || []);
    const workingStorage = cloneSlots(prevStorage);

    try {
      if (dir === 'deposit') {
        if (!hasItemInSlots(inv, itemId, qty)) {
          return {
            ok: false,
            txId: rawTxId,
            buildingId,
            direction: dir,
            itemId,
            quantity: qty,
            inventorySlots: cloneSlots(prevInv),
            storage: cloneSlots(prevStorage),
            code: 'INSUFFICIENT_ITEMS',
            reason: 'သင့်အိတ်ထဲတွင် ထည့်သွင်းရန် ပစ္စည်းမလုံလောက်ပါ',
          };
        }
        const existingSlot = workingStorage.find((s) => s.item === itemId);
        if (!existingSlot && workingStorage.length >= MAX_STORAGE_BOX_SLOTS) {
          return {
            ok: false,
            txId: rawTxId,
            buildingId,
            direction: dir,
            itemId,
            quantity: qty,
            inventorySlots: cloneSlots(prevInv),
            storage: cloneSlots(prevStorage),
            code: 'STORAGE_FULL',
            reason: 'သိုလှောင်သေတ္တာထဲတွင် နေရာပြည့်နေပါပြီ',
          };
        }
        removeItemFromSlots(inv, itemId, qty);
        if (existingSlot) {
          existingSlot.quantity += qty;
        } else {
          workingStorage.push({ item: itemId as ItemId, quantity: qty });
        }
      } else {
        if (!hasItemInSlots(workingStorage, itemId, qty)) {
          return {
            ok: false,
            txId: rawTxId,
            buildingId,
            direction: dir,
            itemId,
            quantity: qty,
            inventorySlots: cloneSlots(prevInv),
            storage: cloneSlots(prevStorage),
            code: 'INSUFFICIENT_ITEMS',
            reason: 'သေတ္တာထဲတွင် ထုတ်ယူရန် ပစ္စည်းမရှိပါ',
          };
        }
        if (!canFitInSlots(inv, itemId, qty, MAX_INVENTORY_SLOTS)) {
          return {
            ok: false,
            txId: rawTxId,
            buildingId,
            direction: dir,
            itemId,
            quantity: qty,
            inventorySlots: cloneSlots(prevInv),
            storage: cloneSlots(prevStorage),
            code: 'INVENTORY_FULL',
            reason: '🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိပါ',
          };
        }
        removeItemFromSlots(workingStorage, itemId, qty);
        addItemToSlots(inv, itemId, qty, MAX_INVENTORY_SLOTS);
      }

      building.storage = workingStorage;

      if (persist) {
        try {
          await persist(this.getEconomyPersistPayload());
        } catch {
          this.playerInventories.set(uid, prevInv);
          building.storage = prevStorage;
          return {
            ok: false,
            txId: rawTxId,
            buildingId,
            direction: dir,
            itemId,
            quantity: qty,
            inventorySlots: cloneSlots(prevInv),
            storage: cloneSlots(prevStorage),
            code: 'PERSIST_FAILED',
            reason: 'သေတ္တာပြောင်းလဲမှု သိမ်းဆည်းမရပါ',
          };
        }
      }

      const res: StorageTransferServerResult = {
        ok: true,
        txId: rawTxId,
        buildingId,
        direction: dir,
        itemId,
        quantity: qty,
        inventorySlots: cloneSlots(inv),
        storage: cloneSlots(workingStorage),
      };
      if (rawTxId) this.rememberBoundedTx(this.processedStorageTx, `${uid}:${rawTxId}`, res);
      return res;
    } finally {
      this.inFlightEconomyPlayers.delete(uid);
    }
  }

  /**
   * Atomically purchases an unowned Farm Plot with Gold.
   * Respects the Step 35 Production Safety Gate (`FARM_PLOT_PURCHASES_LOCKED`)
   * unless `allowLockedForTest` is explicitly passed in isolated automated tests.
   */
  public async purchasePlotAtomic(params: {
    plotId: unknown;
    buyerUid: string;
    buyerName: unknown;
    allowLockedForTest?: boolean;
    persist?: (owners: FarmPlotOwnersMap, goldBalances: Record<string, number>) => Promise<void>;
  }): Promise<FarmPlotPurchaseAttemptResult> {
    const plotId = typeof params.plotId === 'string' ? params.plotId.trim() : '';
    const buyerUid = typeof params.buyerUid === 'string' ? params.buyerUid.trim() : '';

    if (!buyerUid) {
      return {
        ok: false,
        plotId,
        code: 'INVALID_PLAYER',
        message: 'ကစားသမားအတည်ပြုချက် မမှန်ကန်ပါ',
      };
    }

    if (FARM_PLOT_PURCHASES_LOCKED && !params.allowLockedForTest) {
      return {
        ok: false,
        plotId,
        code: 'PURCHASES_LOCKED',
        message: FARM_PLOT_PURCHASE_LOCK_REASON,
        remainingGold: this.getPlayerGold(buyerUid),
      };
    }

    const plot = getFarmPlotById(plotId);
    if (!plot) {
      return {
        ok: false,
        plotId,
        code: 'PLOT_NOT_FOUND',
        message: 'စိုက်ပျိုးမြေကွက်ကို ရှာမတွေ့ပါ',
      };
    }

    if (!this.verifiedGoldUids.has(buyerUid)) {
      return {
        ok: false,
        plotId,
        code: 'LEDGER_UNVERIFIED',
        message: 'Gold စာရင်း အတည်ပြုနေဆဲ ဖြစ်ပါသည် (ခဏအကြာ ထပ်မံကြိုးစားပါ)',
        remainingGold: this.getPlayerGold(buyerUid),
      };
    }

    // Synchronous atomic mutex check BEFORE any await
    if (
      this.inFlightPlots.has(plotId) ||
      this.inFlightBuyers.has(buyerUid) ||
      this.inFlightEconomyPlayers.has(buyerUid)
    ) {
      return {
        ok: false,
        plotId,
        code: 'PURCHASE_IN_PROGRESS',
        message: 'ဝယ်ယူမှု လုပ်ဆောင်နေဆဲ ဖြစ်ပါသည် (ခဏစောင့်ပါ)',
        remainingGold: this.getPlayerGold(buyerUid),
      };
    }

    this.inFlightPlots.add(plotId);
    this.inFlightBuyers.add(buyerUid);

    try {
      const existingOwner = this.owners.get(plotId);
      if (existingOwner) {
        return {
          ok: false,
          plotId,
          code: 'PLOT_ALREADY_OWNED',
          message:
            existingOwner.ownerId === buyerUid
              ? 'ဤစိုက်ပျိုးမြေကွက်ကို သင်ဝယ်ယူပိုင်ဆိုင်ပြီးသား ဖြစ်ပါသည်'
              : `ဤစိုက်ပျိုးမြေကွက်ကို ${existingOwner.ownerName} က ဝယ်ယူပြီးသား ဖြစ်ပါသည်`,
          owner: existingOwner,
          remainingGold: this.getPlayerGold(buyerUid),
        };
      }

      const currentGold = this.getPlayerGold(buyerUid);
      if (currentGold < plot.purchasePrice) {
        const missing = plot.purchasePrice - currentGold;
        return {
          ok: false,
          plotId,
          code: 'INSUFFICIENT_GOLD',
          message: `ရွှေဒင်္ဂါး မလုံလောက်ပါ (နောက်ထပ် ${missing.toLocaleString()} ရွှေ လိုအပ်သည်)`,
          remainingGold: currentGold,
        };
      }

      const newGold = currentGold - plot.purchasePrice;
      const newOwnerRecord: FarmPlotOwnerRecord = {
        plotId: plot.id,
        ownerId: buyerUid,
        ownerName: sanitizeOwnerName(params.buyerName, 'Settler'),
        purchasedAt: Date.now(),
        pricePaid: plot.purchasePrice,
      };

      // Synchronous atomic state commit prior to async storage persist
      this.playerGold.set(buyerUid, newGold);
      this.owners.set(plot.id, newOwnerRecord);

      if (params.persist) {
        try {
          await params.persist(this.serializeOwners(), this.serializeGoldBalances());
        } catch {
          // Strict rollback on storage failure
          this.playerGold.set(buyerUid, currentGold);
          this.owners.delete(plot.id);
          return {
            ok: false,
            plotId,
            code: 'PERSIST_FAILED',
            message: 'မြေကွက်ဝယ်ယူမှု သိမ်းဆည်းရာတွင် အမှားဖြစ်ပေါ်ခဲ့ပါသည် (ရွှေမနှုတ်ပါ)',
            remainingGold: currentGold,
          };
        }
      }

      return {
        ok: true,
        plotId: plot.id,
        message: `${plot.label} ကို 🪙 ${plot.purchasePrice.toLocaleString()} ရွှေဖြင့် အောင်မြင်စွာ ဝယ်ယူပြီးပါပြီ!`,
        owner: newOwnerRecord,
        remainingGold: newGold,
      };
    } finally {
      this.inFlightPlots.delete(plotId);
      this.inFlightBuyers.delete(buyerUid);
    }
  }

  /**
   * Serializes per-UID Backend-Mediated Cloud Saves, enforces authoritative economy
   * (Gold, Inventory, Owned Clothing), rejects UID tampering and unverified ledgers,
   * prevents stale out-of-order overwrites, and deduplicates `saveId` retries.
   */
  public async executeAuthoritativePlayerSave(params: {
    uid: string;
    rawBody: unknown;
    serverPlacedBuildings?: PlacedBuilding[];
    fallbackPlayerName?: string;
    ensureEconomySeeded?: () => Promise<void>;
    commitToFirestore: (docs: FirestorePlayerSaveDocs) => Promise<FirestoreSaveWriterResult>;
    persistSaveRevisions?: (revisions: Record<string, number>) => Promise<void>;
  }): Promise<PlayerSaveCommitResult> {
    const uid = typeof params.uid === 'string' ? params.uid.trim() : '';
    if (!uid) {
      return {
        ok: false,
        statusCode: 401,
        saveRevision: 0,
        lastSavedAt: new Date().toISOString(),
        code: 'INVALID_PLAYER',
        error: 'Missing authenticated player UID.',
      };
    }

    const previousTail = this.saveTailByUid.get(uid) || Promise.resolve();
    const currentTask = previousTail
      .catch(() => undefined)
      .then(async (): Promise<PlayerSaveCommitResult> => {
        if (!this.isEconomyFullyVerified(uid) && params.ensureEconomySeeded) {
          await params.ensureEconomySeeded();
        }

        if (!this.isEconomyFullyVerified(uid)) {
          return {
            ok: false,
            statusCode: 409,
            saveRevision: this.getSaveRevision(uid),
            lastSavedAt: new Date().toISOString(),
            code: 'LEDGER_UNVERIFIED',
            error:
              'Server economy ledger could not be verified from Firestore; economy save rejected to protect existing player data.',
          };
        }

        const authoritativeEconomy = this.getAuthoritativeEconomySnapshot(uid);
        const validation = validateAndSanitizeClientSaveBody({
          rawBody: params.rawBody,
          verifiedUid: uid,
          authoritativeEconomy,
          farmPlotOwners: this.serializeOwners(),
          serverPlacedBuildings: params.serverPlacedBuildings,
          fallbackPlayerName: params.fallbackPlayerName,
        });

        if (!validation.ok) {
          return {
            ok: false,
            statusCode: validation.status,
            saveRevision: this.getSaveRevision(uid),
            lastSavedAt: new Date().toISOString(),
            code: validation.code,
            error: validation.error,
          };
        }

        const sanitized: SanitizedPlayerSavePayload = validation.sanitized;

        if (sanitized.saveId) {
          const cached = this.processedSaveIds.get(`${uid}:${sanitized.saveId}`);
          if (cached) {
            return {
              ...cached,
              deduplicated: true,
              authoritativeEconomy: this.getAuthoritativeEconomySnapshot(uid),
            };
          }
        }

        const lastClientTs = this.playerLastClientTimestamps.get(uid) ?? 0;
        if (sanitized.clientTimestamp !== undefined && sanitized.clientTimestamp < lastClientTs) {
          return {
            ok: false,
            statusCode: 409,
            saveRevision: this.getSaveRevision(uid),
            lastSavedAt: new Date(this.playerLastSavedAtMs.get(uid) || Date.now()).toISOString(),
            stale: true,
            code: 'STALE_SAVE',
            error: 'Newer player save already committed on server.',
            authoritativeEconomy: this.getAuthoritativeEconomySnapshot(uid),
          };
        }

        // Capture freshest server economy snapshot immediately before building commit docs
        const latestEconomy = this.getAuthoritativeEconomySnapshot(uid);
        const prevSavedMs = this.playerLastSavedAtMs.get(uid) ?? 0;
        const monotonicSavedMs = Math.max(Date.now(), prevSavedMs + 1);
        const lastSavedAtIso = new Date(monotonicSavedMs).toISOString();

        const docs = buildAuthoritativeFirestoreDocs({
          sanitized,
          authoritativeEconomy: latestEconomy,
          lastSavedAtIso,
        });

        const commitRes = await params.commitToFirestore(docs);
        if (!commitRes.ok) {
          return {
            ok: false,
            statusCode: commitRes.statusCode || 500,
            saveRevision: this.getSaveRevision(uid),
            lastSavedAt: lastSavedAtIso,
            code: commitRes.code || 'FIRESTORE_COMMIT_FAILED',
            error: commitRes.error || 'Failed to persist player save to Firestore.',
          };
        }

        const nextRevision = this.getSaveRevision(uid) + 1;
        this.playerSaveRevisions.set(uid, nextRevision);
        this.playerLastSavedAtMs.set(uid, monotonicSavedMs);
        if (sanitized.clientTimestamp !== undefined) {
          this.playerLastClientTimestamps.set(uid, sanitized.clientTimestamp);
        }

        if (params.persistSaveRevisions) {
          try {
            await params.persistSaveRevisions(this.serializeSaveRevisions());
          } catch {
            // Firestore commit already succeeded; DO revision metadata will resync on next save
          }
        }

        const successResult: PlayerSaveCommitResult = {
          ok: true,
          statusCode: 200,
          saveRevision: nextRevision,
          lastSavedAt: lastSavedAtIso,
          authoritativeEconomy: latestEconomy,
        };

        if (sanitized.saveId) {
          this.rememberBoundedTx(
            this.processedSaveIds,
            `${uid}:${sanitized.saveId}`,
            successResult
          );
        }

        return successResult;
      });

    this.saveTailByUid.set(uid, currentTask);
    try {
      return await currentTask;
    } finally {
      if (this.saveTailByUid.get(uid) === currentTask) {
        this.saveTailByUid.delete(uid);
      }
    }
  }
}
