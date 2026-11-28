/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import firebaseAppletConfig from '../../firebase-applet-config.json';
import { InventorySlot } from '../../src/game/types';
import {
  createStarterInventorySlots,
  createStarterToolsOnlySlots,
  normalizeInventorySlots,
  normalizeOwnedClothingList,
} from '../economy/inventoryAuthority';

export interface VerifiedGoldSeedResult {
  ok: boolean;
  gold: number;
  source: 'firestore' | 'default_new_player' | 'unverified_error';
  error?: string;
}

export interface VerifiedPlayerEconomySeedResult {
  ok: boolean;
  gold: number;
  inventorySlots: InventorySlot[];
  ownedClothing: string[];
  source: 'firestore' | 'default_new_player' | 'unverified_error';
  error?: string;
}

const MAX_SEED_GOLD = 1_000_000;
const STARTER_GOLD = 25;

function parseFirestoreNumberField(field: unknown): number | null {
  if (!field || typeof field !== 'object') return null;
  const f = field as Record<string, unknown>;
  if (typeof f.integerValue === 'string' || typeof f.integerValue === 'number') {
    const n = Number(f.integerValue);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof f.doubleValue === 'number' && Number.isFinite(f.doubleValue)) {
    return f.doubleValue;
  }
  if (typeof f.doubleValue === 'string') {
    const n = Number(f.doubleValue);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseFirestoreStringField(field: unknown): string | null {
  if (!field || typeof field !== 'object') return null;
  const f = field as Record<string, unknown>;
  return typeof f.stringValue === 'string' ? f.stringValue : null;
}

function parseFirestoreInventoryField(fields: Record<string, any>): InventorySlot[] {
  const directArray = fields.inventory?.arrayValue?.values;
  const nestedSlotsArray = fields.inventory?.mapValue?.fields?.slots?.arrayValue?.values;
  const rawValues = Array.isArray(directArray)
    ? directArray
    : Array.isArray(nestedSlotsArray)
    ? nestedSlotsArray
    : null;

  if (!rawValues) {
    return createStarterToolsOnlySlots();
  }

  const rawParsed: Array<{ item: string; quantity: number }> = [];
  for (const val of rawValues) {
    const slotFields = val?.mapValue?.fields;
    if (!slotFields || typeof slotFields !== 'object') continue;
    const item = parseFirestoreStringField(slotFields.item);
    const quantity = parseFirestoreNumberField(slotFields.quantity);
    if (item && quantity !== null) {
      rawParsed.push({ item, quantity });
    }
  }

  return normalizeInventorySlots(rawParsed, { ensureStarter: true });
}

function parseFirestoreOwnedClothingField(fields: Record<string, any>): string[] {
  const rawValues = fields.equipment?.mapValue?.fields?.ownedClothing?.arrayValue?.values;
  if (!Array.isArray(rawValues)) return [];
  const rawIds: string[] = [];
  for (const val of rawValues) {
    const id = parseFirestoreStringField(val);
    if (id) rawIds.push(id);
  }
  return normalizeOwnedClothingList(rawIds);
}

/**
 * Fetches authoritative player Gold, Inventory slots, and Owned Clothing from Firestore
 * (`users/{uid}/gameData/playerState`) using the joining player's own verified Firebase ID Token.
 * Safe for both Cloudflare Workers and Node.js 18+ via global `fetch`.
 */
export async function fetchVerifiedFirestorePlayerEconomy(params: {
  uid: string;
  idToken: string;
  projectId?: string;
  databaseId?: string;
  fetchImpl?: typeof fetch;
}): Promise<VerifiedPlayerEconomySeedResult> {
  const uid = params.uid?.trim();
  const idToken = params.idToken?.trim();
  if (!uid || !idToken) {
    return {
      ok: false,
      gold: STARTER_GOLD,
      inventorySlots: createStarterToolsOnlySlots(),
      ownedClothing: [],
      source: 'unverified_error',
      error: 'Missing verified UID or ID token for Firestore economy seed.',
    };
  }

  const projectId =
    params.projectId?.trim() || firebaseAppletConfig.projectId || 'intrepid-cyclist-mbvhw';
  const databaseId =
    params.databaseId?.trim() ||
    firebaseAppletConfig.firestoreDatabaseId ||
    '(default)';
  const fetchFn = params.fetchImpl || fetch;

  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/${encodeURIComponent(databaseId)}/documents/users/${encodeURIComponent(uid)}/gameData/playerState`;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 3500) : null;

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (res.status === 404) {
      return {
        ok: true,
        gold: STARTER_GOLD,
        inventorySlots: createStarterInventorySlots(),
        ownedClothing: [],
        source: 'default_new_player',
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        gold: STARTER_GOLD,
        inventorySlots: createStarterToolsOnlySlots(),
        ownedClothing: [],
        source: 'unverified_error',
        error: `Firestore REST status ${res.status}`,
      };
    }

    const doc = (await res.json()) as {
      fields?: Record<string, any>;
    };
    const fields = doc?.fields || {};
    const topGold = parseFirestoreNumberField(fields.gold);
    const invCoins = parseFirestoreNumberField(
      fields.inventory?.mapValue?.fields?.coins
    );
    const resolvedGold = topGold ?? invCoins ?? STARTER_GOLD;
    const clampedGold = Math.max(0, Math.min(MAX_SEED_GOLD, Math.round(resolvedGold)));
    const inventorySlots = parseFirestoreInventoryField(fields);
    const ownedClothing = parseFirestoreOwnedClothingField(fields);

    return {
      ok: true,
      gold: clampedGold,
      inventorySlots,
      ownedClothing,
      source: 'firestore',
    };
  } catch (err: any) {
    return {
      ok: false,
      gold: STARTER_GOLD,
      inventorySlots: createStarterToolsOnlySlots(),
      ownedClothing: [],
      source: 'unverified_error',
      error: err?.message || String(err),
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Backward-compatible Gold-only wrapper over `fetchVerifiedFirestorePlayerEconomy`.
 */
export async function fetchVerifiedFirestoreGold(params: {
  uid: string;
  idToken: string;
  projectId?: string;
  databaseId?: string;
  fetchImpl?: typeof fetch;
}): Promise<VerifiedGoldSeedResult> {
  const res = await fetchVerifiedFirestorePlayerEconomy(params);
  return {
    ok: res.ok,
    gold: res.gold,
    source: res.source,
    error: res.error,
  };
}
