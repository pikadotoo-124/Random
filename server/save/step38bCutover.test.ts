/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import WebSocket from 'ws';
import workerDefault from '../cloudflare/worker';
import { GameRoomDO } from '../cloudflare/GameRoomDO';
import { createServer } from '../../server';
import { FarmPlotServerLedger } from '../farm/farmPlotService';
import { createStarterInventorySlots } from '../economy/inventoryAuthority';
import { CloudSaveService, CloudSaveRequestError } from '../../src/firebase/cloudSaveService';
import { SaveSystem } from '../../src/game/systems/SaveSystem';
import { PlacedBuilding } from '../../src/game/types';
import {
  DOStorageAdapter,
  PlayerSaveFoundationService,
  getPlayerSaveStorageKey,
} from './playerSaveFoundation';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERTION FAILED: ${message} (expected=${String(expected)}, actual=${String(actual)})`
    );
  }
}

class MemoryLocalStorage implements Storage {
  private map = new Map<string, string>();
  public get length(): number {
    return this.map.size;
  }
  public clear(): void {
    this.map.clear();
  }
  public getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  public key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  public removeItem(key: string): void {
    this.map.delete(key);
  }
  public setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

class MemoryDOStorage implements DOStorageAdapter {
  public store = new Map<string, any>();
  public failNextPutKey: string | null = null;

  public async get<T = any>(key: string): Promise<T | undefined> {
    const val = this.store.get(key);
    return val === undefined ? undefined : (JSON.parse(JSON.stringify(val)) as T);
  }

  public async put<T = any>(key: string, value: T): Promise<void> {
    if (this.failNextPutKey && (this.failNextPutKey === '*' || this.failNextPutKey === key)) {
      this.failNextPutKey = null;
      throw new Error(`Simulated DO storage failure on key ${key}`);
    }
    this.store.set(key, JSON.parse(JSON.stringify(value)));
  }
}

function createMockDurableObjectState(storage: MemoryDOStorage) {
  let pending: Promise<any> = Promise.resolve();
  return {
    storage,
    blockConcurrencyWhile: <T>(cb: () => Promise<T>): Promise<T> => {
      const next = pending.then(() => cb());
      pending = next.catch(() => undefined);
      return next;
    },
    waitForReady: () => pending,
  };
}

interface FirestoreMockFixture {
  profile?: Record<string, any>;
  playerState?: Record<string, any>;
  worldState?: Record<string, any>;
}

function makeFirestoreMockFetch(
  fixtures: Record<string, FirestoreMockFixture>,
  opts?: { allowCommitWrites?: boolean; forceStatusOnRead?: number }
) {
  const calls: Array<{ url: string; method: string; authHeader: string | null }> = [];
  const committedWrites: Array<{ url: string; method: string; body: any }> = [];

  const toFsVal = (v: unknown): any => {
    if (v === null) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') {
      return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    }
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsVal) } };
    if (typeof v === 'object') {
      const fields: Record<string, any> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (val !== undefined) fields[k] = toFsVal(val);
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
  };

  const toFsDoc = (obj: Record<string, unknown>) => {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) fields[k] = toFsVal(v);
    }
    return { fields };
  };

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method || 'GET').toUpperCase();
    const headers = (init?.headers || {}) as Record<string, string>;
    const authHeader = headers.Authorization || headers.authorization || null;
    calls.push({ url, method, authHeader });

    if (method !== 'GET') {
      if (opts?.allowCommitWrites && url.includes(':commit')) {
        const bodyText = typeof init?.body === 'string' ? init.body : '{}';
        committedWrites.push({ url, method, body: JSON.parse(bodyText) });
        return new Response(JSON.stringify({ writeResults: [{ updateTime: new Date().toISOString() }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`SECURITY VIOLATION: Unexpected Firestore non-GET call (${method} ${url})`);
    }

    if (opts?.forceStatusOnRead) {
      return new Response(JSON.stringify({ error: { message: 'Forced Firestore read failure' } }), {
        status: opts.forceStatusOnRead,
      });
    }

    const match = url.match(/\/documents\/users\/([^/]+)(\/gameData\/(playerState|worldState))?$/);
    if (!match) {
      return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
    }

    const uid = decodeURIComponent(match[1]);
    const subDoc = match[3] as 'playerState' | 'worldState' | undefined;
    const entry = fixtures[uid];
    if (!entry) {
      return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
    }

    const docData = subDoc ? entry[subDoc] : entry.profile;
    if (!docData) {
      return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
    }

    return new Response(JSON.stringify(toFsDoc(docData)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return { fetchImpl: fetchImpl as typeof fetch, calls, committedWrites };
}

function makeMockTokenVerifier(
  tokens: Record<string, { uid: string; email?: string; email_verified?: boolean; name?: string }>
) {
  return async (token: string) => {
    const clean = token.trim();
    const claims = tokens[clean];
    if (!claims) {
      return { valid: false, error: 'Invalid test token' };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    return {
      valid: true,
      claims: {
        uid: claims.uid,
        email: claims.email,
        email_verified: claims.email_verified,
        name: claims.name,
        iss: 'https://securetoken.google.com/intrepid-cyclist-mbvhw',
        aud: 'intrepid-cyclist-mbvhw',
        sub: claims.uid,
        auth_time: nowSec - 60,
        iat: nowSec - 60,
        exp: nowSec + 3600,
      },
    };
  };
}

function createWorkerHarness(params?: {
  fixtures?: Record<string, FirestoreMockFixture>;
  allowCommitWrites?: boolean;
  forceStatusOnRead?: number;
  cutoverMode?: 'do_primary' | 'legacy_firestore';
  tokens?: Record<string, { uid: string; email?: string; email_verified?: boolean; name?: string }>;
  initialStorage?: Record<string, any>;
}) {
  const storage = new MemoryDOStorage();
  if (params?.initialStorage) {
    for (const [k, v] of Object.entries(params.initialStorage)) {
      storage.store.set(k, JSON.parse(JSON.stringify(v)));
    }
  }
  const state = createMockDurableObjectState(storage);
  const fsMock = makeFirestoreMockFetch(params?.fixtures || {}, {
    allowCommitWrites: params?.allowCommitWrites,
    forceStatusOnRead: params?.forceStatusOnRead,
  });
  const tokenMap = params?.tokens || {
    tok_a: { uid: 'uid_a', name: 'AungAung' },
    tok_b: { uid: 'uid_b', name: 'MyaMya' },
    tok_new: { uid: 'uid_new', name: 'NewPlayer' },
    tok_owner: {
      uid: 'uid_owner',
      email: 'pikadotoo124@gmail.com',
      email_verified: true,
      name: 'Owner',
    },
  };
  const verifier = makeMockTokenVerifier(tokenMap);
  const env: any = {
    FIREBASE_PROJECT_ID: 'intrepid-cyclist-mbvhw',
    FIREBASE_DATABASE_ID: 'ai-studio-randomcity-5937d77e-b2d8-41e1-a0e0-e3c9da9af426',
    ...(params?.cutoverMode ? { DO_SAVE_CUTOVER_MODE: params.cutoverMode } : {}),
    GAME_ROOM: {
      idFromName: (name: string) => ({ name }),
      get: () => ({
        fetch: async (req: Request) => {
          await state.waitForReady();
          return room.fetch(req);
        },
      }),
    },
  };
  const room = new GameRoomDO(state, env, {
    fetchImpl: fsMock.fetchImpl,
    tokenVerifier: verifier,
  });

  const workerFetch = async (urlOrReq: RequestInfo | URL, init?: RequestInit) => {
    await state.waitForReady();
    const req = urlOrReq instanceof Request ? urlOrReq : new Request(String(urlOrReq), init);
    return workerDefault.fetch(req, env);
  };

  return { storage, state, room, env, fsMock, workerFetch: workerFetch as typeof fetch };
}

async function runTests(): Promise<void> {
  if (typeof globalThis.localStorage === 'undefined') {
    (globalThis as any).localStorage = new MemoryLocalStorage();
  }

  let passed = 0;
  const runTest = async (name: string, fn: () => Promise<void> | void) => {
    globalThis.localStorage.clear();
    SaveSystem.setCloudAdaptersForTest(null);
    await fn();
    passed += 1;
    console.log(`PASS [Mock/Local Harness]: ${name}`);
  };

  // 1. DO Load Returns Existing player_save:${uid} Without Reading Firestore
  await runTest('1. DO Load returns existing player_save:${uid} without reading Firestore', async () => {
    const service = new PlayerSaveFoundationService();
    const ledger = new FarmPlotServerLedger();
    ledger.seedAuthoritativeEconomy(
      'uid_a',
      {
        gold: 420,
        inventorySlots: [...createStarterInventorySlots(), { item: 'wood', quantity: 14 }],
        ownedClothing: ['hat_straw_sun'],
      },
      true
    );
    const existingRecord = {
      schemaVersion: 2,
      uid: 'uid_a',
      saveRevision: 5,
      lastSavedAt: new Date().toISOString(),
      lastClientTimestamp: 1700000005000,
      currentZone: 'Riverside',
      player: {
        name: 'AungAung',
        gender: 'male' as const,
        skinTone: '#d97706',
        hairColor: '#292524',
        clothesColor: '#3b82f6',
        currentTool: 'pickaxe_basic',
        facingDirection: 'right' as const,
        equippedClothing: { hat: 'hat_straw_sun' },
      },
      position: { tileX: 64, tileY: 42, facingDirection: 'right' as const },
      playerStats: { health: 95, stamina: 88, totalGathered: 12, totalCrafted: 3, totalBuilt: 2, totalSoldGold: 100 },
      playerWorldChanges: { tutorialCompleted: true, discoveredZones: ['Central Plaza (Main City)', 'Riverside'] },
    };
    const h = createWorkerHarness({
      initialStorage: {
        playerGoldBalances: ledger.getEconomyPersistPayload().goldBalances,
        playerInventories: ledger.getEconomyPersistPayload().inventories,
        playerOwnedClothing: ledger.getEconomyPersistPayload().ownedClothing,
        [getPlayerSaveStorageKey('uid_a')]: existingRecord,
      },
    });
    assert(typeof service !== 'undefined', 'foundation service available');

    const res = await h.workerFetch('https://game.example.com/api/player/load', {
      headers: { Authorization: 'Bearer tok_a' },
    });
    assertEqual(res.status, 200, 'DO load should succeed');
    const json: any = await res.json();
    assertEqual(json.ok, true, 'ok true');
    assertEqual(json.source, 'do_primary', 'source should be do_primary');
    assertEqual(json.didMigrate, false, 'should not migrate existing DO save');
    assertEqual(json.performedFirestoreReads, false, 'should perform 0 Firestore reads');
    assertEqual(h.fsMock.calls.length, 0, 'zero fetch calls to Firestore');
    assertEqual(json.saveRevision, 5, 'saveRevision preserved');
    assertEqual(json.gameState.position.tileX, 64, 'positionX hydrated');
    assertEqual(json.gameState.player.coins, 420, 'gold hydrated from DO economy');
  });

  // 2. Legacy Player First Login Migrates Read-Only from Firestore to DO
  await runTest('2. Legacy player first login migrates read-only from Firestore to DO', async () => {
    const h = createWorkerHarness({
      fixtures: {
        uid_a: {
          profile: {
            uid: 'uid_a',
            playerName: 'KoKo',
            gender: 'male',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastLoginAt: '2026-01-10T00:00:00.000Z',
            gameVersion: 2,
          },
          playerState: {
            positionX: 52,
            positionY: 71,
            currentZone: 'Oak Forest',
            gold: 310,
            inventory: [...createStarterInventorySlots(), { item: 'stone', quantity: 22 }],
            equipment: { currentTool: 'axe_basic', facingDirection: 'left', ownedClothing: ['outfit_farmer'] },
            playerStats: { health: 90, stamina: 75, totalGathered: 33, totalCrafted: 4, totalBuilt: 1, totalSoldGold: 95 },
            lastSavedAt: '2026-01-10T01:00:00.000Z',
          },
          worldState: {
            placedBuildings: [],
            playerWorldChanges: { tutorialCompleted: true, discoveredZones: ['Central Plaza (Main City)', 'Oak Forest'] },
          },
        },
      },
    });

    const first = await (
      await h.workerFetch('https://game.example.com/api/player/load', {
        headers: { Authorization: 'Bearer tok_a' },
      })
    ).json() as any;

    assertEqual(first.ok, true, 'first load ok');
    assertEqual(first.didMigrate, true, 'didMigrate true');
    assertEqual(first.source, 'migrated_from_firestore', 'source migrated_from_firestore');
    assertEqual(first.performedFirestoreReads, true, 'read Firestore once');
    assert(h.fsMock.calls.every((c) => c.method === 'GET'), 'Firestore calls MUST be GET-only');
    assertEqual(first.gameState.position.tileX, 52, 'migrated tileX');
    assertEqual(first.gameState.inventory.coins, 310, 'migrated gold');

    const stored = await h.storage.get<any>(getPlayerSaveStorageKey('uid_a'));
    assert(Boolean(stored), 'player_save:uid_a persisted in DO');
    assertEqual(stored.player.name, 'KoKo', 'playerName persisted');

    const callsAfterFirst = h.fsMock.calls.length;
    const second = await (
      await h.workerFetch('https://game.example.com/api/player/load', {
        headers: { Authorization: 'Bearer tok_a' },
      })
    ).json() as any;
    assertEqual(second.source, 'do_primary', 'second login serves from DO');
    assertEqual(second.didMigrate, false, 'second login does not re-migrate');
    assertEqual(h.fsMock.calls.length, callsAfterFirst, 'second login hits Firestore 0 times');
  });

  // 3. Offline Legacy Player Preserved Untouched Until Future Login
  await runTest('3. Offline legacy player preserved untouched until future login', async () => {
    const h = createWorkerHarness({
      fixtures: {
        uid_a: {
          profile: { uid: 'uid_a', playerName: 'OnlineFriend', gender: 'male' },
          playerState: { positionX: 15, positionY: 18, gold: 100 },
        },
        uid_b: {
          profile: { uid: 'uid_b', playerName: 'OfflineFriend', gender: 'female' },
          playerState: { positionX: 88, positionY: 92, gold: 777 },
        },
      },
    });

    await h.workerFetch('https://game.example.com/api/player/load', {
      headers: { Authorization: 'Bearer tok_a' },
    });

    assert(h.fsMock.calls.every((c) => !c.url.includes('uid_b')), 'offline uid_b untouched when uid_a logs in');
    assertEqual(await h.storage.get(getPlayerSaveStorageKey('uid_b')), undefined, 'uid_b has no DO key yet');

    const laterLoad = (await (
      await h.workerFetch('https://game.example.com/api/player/load', {
        headers: { Authorization: 'Bearer tok_b' },
      })
    ).json()) as any;
    assertEqual(laterLoad.didMigrate, true, 'offline player migrates cleanly on later login');
    assertEqual(laterLoad.gameState.inventory.coins, 777, 'offline player gold intact');
    assertEqual(laterLoad.gameState.position.tileX, 88, 'offline player position intact');
  });

  // 4. Concurrent/Duplicate First Login Never Triggers Duplicate Firestore Migration
  await runTest('4. Concurrent login never triggers duplicate Firestore migration', async () => {
    const h = createWorkerHarness({
      fixtures: {
        uid_a: {
          profile: { uid: 'uid_a', playerName: 'AungAung', gender: 'male' },
          playerState: { positionX: 44, positionY: 45, gold: 199 },
        },
      },
    });

    const [r1, r2] = await Promise.all([
      h.workerFetch('https://game.example.com/api/player/load', { headers: { Authorization: 'Bearer tok_a' } }).then((r) => r.json() as Promise<any>),
      h.workerFetch('https://game.example.com/api/player/load', { headers: { Authorization: 'Bearer tok_a' } }).then((r) => r.json() as Promise<any>),
    ]);

    assert(r1.ok && r2.ok, 'both concurrent loads succeed');
    const migratedCount = [r1, r2].filter((r) => r.didMigrate).length;
    assertEqual(migratedCount, 1, 'exactly one concurrent call performs migration');
    assertEqual(h.fsMock.calls.length, 3, 'Firestore read once (3 docs total)');
  });

  // 5. Pre-existing DO Economy Never Overwritten During Migration
  await runTest('5. Pre-existing DO economy never overwritten by stale Firestore data', async () => {
    const h = createWorkerHarness({
      initialStorage: {
        playerGoldBalances: { uid_a: 980 },
        playerInventories: {
          uid_a: [...createStarterInventorySlots(), { item: 'fish', quantity: 4 }],
        },
        playerOwnedClothing: { uid_a: ['hat_straw_sun'] },
      },
      fixtures: {
        uid_a: {
          profile: { uid: 'uid_a', playerName: 'AungAung', gender: 'male' },
          playerState: {
            positionX: 49,
            positionY: 51,
            gold: 25,
            inventory: createStarterInventorySlots(),
            equipment: { ownedClothing: [] },
          },
        },
      },
    });

    const res = (await (
      await h.workerFetch('https://game.example.com/api/player/load', {
        headers: { Authorization: 'Bearer tok_a' },
      })
    ).json()) as any;

    assertEqual(res.ok, true, 'load succeeded');
    assertEqual(res.didMigrate, true, 'non-economy profile migrated');
    assertEqual(res.economyPreservedFromDO, true, 'DO economy preserved flag true');
    assertEqual(res.gameState.inventory.coins, 980, 'DO gold 980 preserved over stale 25');
    assert(
      res.gameState.inventory.slots.some((s: any) => s.item === 'fish' && s.quantity === 4),
      'DO fish inventory preserved'
    );
    assert(
      res.gameState.player.ownedClothing.includes('hat_straw_sun'),
      'DO owned clothing preserved'
    );
  });

  // 6. New Player Character Creation (/api/player/init)
  await runTest('6. Brand-new player needsCharacterCreation -> /api/player/init creates safe DO save', async () => {
    const h = createWorkerHarness({ fixtures: {} });

    const loadRes = (await (
      await h.workerFetch('https://game.example.com/api/player/load', {
        headers: { Authorization: 'Bearer tok_new' },
      })
    ).json()) as any;
    assertEqual(loadRes.ok, true, 'load ok');
    assertEqual(loadRes.needsCharacterCreation, true, 'brand-new player prompts character creation');

    const initRes = (await (
      await h.workerFetch('https://game.example.com/api/player/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_new' },
        body: JSON.stringify({ uid: 'uid_new', playerName: 'SuSu', gender: 'female' }),
      })
    ).json()) as any;

    assertEqual(initRes.ok, true, 'init ok');
    assertEqual(initRes.saveRevision, 1, 'initial revision 1');
    assertEqual(initRes.profile.playerName, 'SuSu', 'profile name SuSu');
    assertEqual(initRes.gameState.inventory.coins, 25, 'starter coins 25');

    // Re-calling init does not clobber existing DO record after progress
    await h.workerFetch('https://game.example.com/api/player/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_new' },
      body: JSON.stringify({ positionX: 73, positionY: 61, clientTimestamp: Date.now() }),
    });

    const secondInit = (await (
      await h.workerFetch('https://game.example.com/api/player/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_new' },
        body: JSON.stringify({ uid: 'uid_new', playerName: 'Overwrite', gender: 'male' }),
      })
    ).json()) as any;
    assertEqual(secondInit.gameState.position.tileX, 73, 'second init does not overwrite active save');
  });

  // 7. DO Save Updates Non-Economy State Without Touching Firestore
  await runTest('7. DO save updates position/zone/stats without any Firestore writes', async () => {
    const h = createWorkerHarness({ fixtures: {} });
    await h.workerFetch('https://game.example.com/api/player/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
      body: JSON.stringify({ playerName: 'AungAung', gender: 'male' }),
    });
    const beforeFsCalls = h.fsMock.calls.length;

    const saveRes = (await (
      await h.workerFetch('https://game.example.com/api/player/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
        body: JSON.stringify({
          saveId: 'save_move_1',
          expectedRevision: 1,
          clientTimestamp: Date.now(),
          positionX: 77,
          positionY: 88,
          currentZone: 'Oak Forest',
          equipment: { currentTool: 'rod_basic', facingDirection: 'up' },
          playerStats: { totalGathered: 42 },
          playerWorldChanges: { tutorialCompleted: true },
        }),
      })
    ).json()) as any;

    assertEqual(saveRes.ok, true, 'DO save succeeds');
    assertEqual(saveRes.mode, 'do_primary', 'mode do_primary');
    assertEqual(saveRes.saveRevision, 2, 'revision incremented to 2');
    assertEqual(h.fsMock.calls.length, beforeFsCalls, '0 Firestore calls during DO save');

    const reloaded = (await (
      await h.workerFetch('https://game.example.com/api/player/load', {
        headers: { Authorization: 'Bearer tok_a' },
      })
    ).json()) as any;
    assertEqual(reloaded.gameState.position.tileX, 77, 'saved tileX persisted');
    assertEqual(reloaded.gameState.currentZone, 'Oak Forest', 'saved zone persisted');
    assertEqual(reloaded.gameState.playerStats.totalGathered, 42, 'saved stats persisted');
  });

  // 8. DO Save Rejects Client Economy Spoofing
  await runTest('8. DO save ignores client Gold/Inventory/Clothing spoof attempts', async () => {
    const h = createWorkerHarness({
      initialStorage: {
        playerGoldBalances: { uid_a: 150 },
        playerInventories: { uid_a: createStarterInventorySlots() },
        playerOwnedClothing: { uid_a: ['hat_straw_sun'] },
      },
    });

    await h.workerFetch('https://game.example.com/api/player/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
      body: JSON.stringify({ playerName: 'AungAung', gender: 'male' }),
    });

    const saveRes = (await (
      await h.workerFetch('https://game.example.com/api/player/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
        body: JSON.stringify({
          clientTimestamp: Date.now(),
          positionX: 40,
          positionY: 40,
          gold: 999999,
          inventory: [{ item: 'fish', quantity: 999 }],
          ownedClothing: ['suit_noble_coat'],
        }),
      })
    ).json()) as any;

    assertEqual(saveRes.ok, true, 'non-economy save succeeds');
    assertEqual(saveRes.authoritativeEconomy.gold, 150, 'spoofed gold rejected');
    assert(
      !saveRes.authoritativeEconomy.inventorySlots.some((s: any) => s.item === 'fish'),
      'spoofed inventory rejected'
    );
    assert(
      !saveRes.authoritativeEconomy.ownedClothing.includes('suit_noble_coat'),
      'spoofed clothing rejected'
    );
  });

  // 9. Personal Buildings Not Duplicated in player_save & Shared placedBuildings Preserved
  await runTest('9. Buildings not duplicated in player_save:${uid}; hydrated from shared DO placedBuildings', async () => {
    const h = createWorkerHarness();
    const sharedBuildings: PlacedBuilding[] = [
      { id: 'b1', type: 'house_small', tileX: 45, tileY: 45, width: 3, height: 3, rotation: 0, ownerId: 'uid_a', placedBy: 'AungAung', createdAt: 1000 },
      { id: 'b2', type: 'decor_bench', tileX: 50, tileY: 50, width: 2, height: 1, rotation: 0, ownerId: 'uid_b', placedBy: 'MyaMya', createdAt: 1001 },
    ];
    await h.storage.put('placedBuildings', sharedBuildings);
    // Re-create room with preloaded storage to simulate DO wake-up
    const room2 = new GameRoomDO(h.state, h.env, {
      fetchImpl: h.fsMock.fetchImpl,
      tokenVerifier: makeMockTokenVerifier({ tok_a: { uid: 'uid_a', name: 'AungAung' } }),
    });
    await h.state.waitForReady();

    await room2.fetch(
      new Request('https://game.example.com/api/player/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
        body: JSON.stringify({ playerName: 'AungAung', gender: 'male' }),
      })
    );

    const rawSaved = await h.storage.get<any>(getPlayerSaveStorageKey('uid_a'));
    assert(!('buildings' in rawSaved) && !('placedBuildings' in rawSaved), 'no duplicated buildings inside player_save');

    const loadJson = (await (
      await room2.fetch(
        new Request('https://game.example.com/api/player/load', {
          headers: { Authorization: 'Bearer tok_a' },
        })
      )
    ).json()) as any;
    assertEqual(loadJson.gameState.buildings.length, 1, 'personal buildings filtered dynamically');
    assertEqual(loadJson.gameState.buildings[0].id, 'b1', 'uid_a owns b1');
  });

  // 10. Farm Ownership (farmPlotOwners) Preserved
  await runTest('10. Farm plot ownership stays authoritative in DO farmLedger', async () => {
    const h = createWorkerHarness();
    await h.storage.put('farmPlotOwners', {
      farm_plot_2: {
        plotId: 'farm_plot_2',
        ownerId: 'uid_a',
        ownerName: 'AungAung',
        purchasedAt: new Date().toISOString(),
      },
    });

    const room2 = new GameRoomDO(h.state, h.env, {
      fetchImpl: h.fsMock.fetchImpl,
      tokenVerifier: makeMockTokenVerifier({ tok_a: { uid: 'uid_a', name: 'AungAung' } }),
    });
    await h.state.waitForReady();

    await room2.fetch(
      new Request('https://game.example.com/api/player/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
        body: JSON.stringify({ playerName: 'AungAung', gender: 'male' }),
      })
    );

    const loaded = (await (
      await room2.fetch(
        new Request('https://game.example.com/api/player/load', {
          headers: { Authorization: 'Bearer tok_a' },
        })
      )
    ).json()) as any;
    assert(
      loaded.gameState.playerWorldChanges.ownedFarmPlots.includes('farm_plot_2'),
      'ownedFarmPlots hydrated from DO farmPlotOwners'
    );
  });

  // 11. Real Express + WebSocket Multiplayer + HTTP DO Save Integration (server.ts)
  await runTest('11. Shared world sync, shop trade & DO save across real WebSocket server', async () => {
    const fsMock = makeFirestoreMockFetch({});
    const storage = new MemoryDOStorage();
    const srv = await createServer({
      port: 0,
      skipVite: true,
      saveStorageAdapter: storage,
      firestoreFetchImpl: fsMock.fetchImpl,
      tokenVerifier: makeMockTokenVerifier({
        tok_a: { uid: 'uid_a', name: 'AungAung' },
        tok_b: { uid: 'uid_b', name: 'MyaMya' },
      }),
    });

    const baseUrl = `http://127.0.0.1:${srv.port}`;
    const wsUrl = `ws://127.0.0.1:${srv.port}/ws`;

    try {
      // Seed uid_a & uid_b via HTTP /api/player/init
      const initA = await CloudSaveService.initPlayerSaveInDO('uid_a', 'AungAung', 'male', {
        baseUrlOverride: baseUrl,
        idTokenOverride: 'tok_a',
      });
      assertEqual(initA.saveRevision, 1, 'initA rev 1');

      await CloudSaveService.initPlayerSaveInDO('uid_b', 'MyaMya', 'female', {
        baseUrlOverride: baseUrl,
        idTokenOverride: 'tok_b',
      });

      const wsA = new WebSocket(wsUrl);
      const wsB = new WebSocket(wsUrl);

      const waitMsg = (ws: WebSocket, type: string) =>
        new Promise<any>((resolve, reject) => {
          const timer = setTimeout(() => {
            ws.off('message', handler);
            reject(new Error(`Timed out waiting for WS message ${type}`));
          }, 4000);
          const handler = (raw: WebSocket.RawData) => {
            const parsed = JSON.parse(raw.toString());
            if (parsed.type === type) {
              clearTimeout(timer);
              ws.off('message', handler);
              resolve(parsed.payload);
            } else if (parsed.type === 's:build_rejected' && type === 's:building_placed') {
              clearTimeout(timer);
              ws.off('message', handler);
              reject(new Error(`Build rejected: ${JSON.stringify(parsed.payload)}`));
            }
          };
          ws.on('message', handler);
        });

      await Promise.all([
        new Promise<void>((res) => wsA.once('open', () => res())),
        new Promise<void>((res) => wsB.once('open', () => res())),
      ]);

      const roomStateAP = waitMsg(wsA, 's:room_state');
      wsA.send(JSON.stringify({ type: 'c:auth_join', payload: { idToken: 'tok_a', profile: { name: 'AungAung', gender: 'male' } } }));
      await roomStateAP;

      const roomStateBP = waitMsg(wsB, 's:room_state');
      wsB.send(JSON.stringify({ type: 'c:auth_join', payload: { idToken: 'tok_b', profile: { name: 'MyaMya', gender: 'female' } } }));
      await roomStateBP;

      // Player A trades in shop (buys fence_wood x1 for 8 gold -> 25 - 8 = 17 gold)
      const tradeResP = waitMsg(wsA, 's:shop_trade_result');
      wsA.send(JSON.stringify({ type: 'c:shop_trade', payload: { action: 'buy_item', itemId: 'fence_wood', quantity: 1 } }));
      const tradeRes = await tradeResP;
      assertEqual(tradeRes.ok, true, 'shop buy succeeds');
      assertEqual(tradeRes.balance, 17, 'authoritative balance reduced to 17');

      // Player A places fence_wood -> Player B sees broadcast
      const bPlacedForBP = waitMsg(wsB, 's:building_placed');
      const aRejectWatch = new Promise<void>((_, reject) => {
        wsA.on('message', (raw) => {
          const p = JSON.parse(raw.toString());
          if (p.type === 's:build_rejected') {
            reject(new Error(`Player A build rejected: ${JSON.stringify(p.payload)}`));
          }
        });
      });
      wsA.send(
        JSON.stringify({
          type: 'c:build_request',
          payload: {
            building: {
              id: 'fence_shared_1',
              type: 'fence_wood',
              tileX: 50,
              tileY: 50,
              width: 1,
              height: 1,
              rotation: 0,
              ownerId: 'uid_a',
              placedBy: 'AungAung',
              createdAt: Date.now(),
            },
          },
        })
      );
      const placedForB = await Promise.race([bPlacedForBP, aRejectWatch]);
      assertEqual((placedForB as any).building.id, 'fence_shared_1', 'Player B receives shared building');

      // Save position via /api/player/save and verify DO load preserves shop gold + building
      const saveRes = await CloudSaveService.saveGameState(
        'uid_a',
        { ...initA.gameState, position: { tileX: 51, tileY: 50, facingDirection: 'right' } },
        'Homestead District',
        { baseUrlOverride: baseUrl, idTokenOverride: 'tok_a', expectedRevision: 1 }
      );
      assertEqual(saveRes.authoritativeEconomy?.gold, 17, 'DO save preserves shop balance 17');

      const reloaded = await CloudSaveService.loadGameStateFromDO('uid_a', {
        baseUrlOverride: baseUrl,
        idTokenOverride: 'tok_a',
      });
      assertEqual(reloaded.gameState?.inventory.coins, 17, 'reload preserves shop gold');
      assertEqual(reloaded.gameState?.buildings.length, 1, 'reload hydrates placed building');

      wsA.close();
      wsB.close();
    } finally {
      await srv.close();
    }
  });

  // 12. Stale Timestamp Rejected (409 STALE_SAVE)
  await runTest('12. Stale timestamp save rejected (409 STALE_SAVE) without overwriting newer DO save', async () => {
    const h = createWorkerHarness();
    await h.workerFetch('https://game.example.com/api/player/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
      body: JSON.stringify({ playerName: 'AungAung', gender: 'male' }),
    });

    const t2 = Date.now() + 10000;
    const t1 = t2 - 5000;

    await h.workerFetch('https://game.example.com/api/player/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
      body: JSON.stringify({ clientTimestamp: t2, positionX: 90, positionY: 91 }),
    });

    const staleRes = await h.workerFetch('https://game.example.com/api/player/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
      body: JSON.stringify({ clientTimestamp: t1, positionX: 12, positionY: 13 }),
    });
    assertEqual(staleRes.status, 409, 'stale timestamp returns 409');
    const staleJson: any = await staleRes.json();
    assertEqual(staleJson.code, 'STALE_SAVE', 'code STALE_SAVE');

    const stored = await h.storage.get<any>(getPlayerSaveStorageKey('uid_a'));
    assertEqual(stored.position.tileX, 90, 'newer DO save preserved');
  });

  // 13. Duplicate saveId Idempotency
  await runTest('13. Duplicate saveId idempotency returns deduplicated:true without double increment', async () => {
    const h = createWorkerHarness();
    await h.workerFetch('https://game.example.com/api/player/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
      body: JSON.stringify({ playerName: 'AungAung', gender: 'male' }),
    });

    const body = JSON.stringify({
      saveId: 'idem_save_01',
      expectedRevision: 1,
      clientTimestamp: Date.now(),
      positionX: 55,
      positionY: 56,
    });

    const first = (await (
      await h.workerFetch('https://game.example.com/api/player/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
        body,
      })
    ).json()) as any;
    const second = (await (
      await h.workerFetch('https://game.example.com/api/player/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
        body,
      })
    ).json()) as any;

    assertEqual(first.saveRevision, 2, 'first save advances revision to 2');
    assertEqual(second.deduplicated, true, 'duplicate saveId returns deduplicated');
    assertEqual(second.saveRevision, 2, 'duplicate does not double increment revision');
  });

  // 14. Concurrent Tab Revision Conflict (409 SAVE_REVISION_CONFLICT) Handled Safely
  await runTest('14. Concurrent tab SAVE_REVISION_CONFLICT preserves newer tab save', async () => {
    const h = createWorkerHarness();
    const init = await CloudSaveService.initPlayerSaveInDO('uid_a', 'AungAung', 'male', {
      baseUrlOverride: 'https://game.example.com',
      idTokenOverride: 'tok_a',
      fetchImpl: h.workerFetch,
    });

    // Tab 1 advances rev 1 -> 2
    const tab1Save = await CloudSaveService.saveGameState(
      'uid_a',
      { ...init.gameState, position: { tileX: 81, tileY: 82, facingDirection: 'down' } },
      'Oak Forest',
      {
        baseUrlOverride: 'https://game.example.com',
        idTokenOverride: 'tok_a',
        fetchImpl: h.workerFetch,
        expectedRevision: 1,
      }
    );
    assertEqual(tab1Save.saveRevision, 2, 'Tab 1 advances rev to 2');

    // Tab 2 still holds rev 1 in SaveSystem
    SaveSystem.setCloudAdaptersForTest({
      isAuthorized: (uid) => uid === 'uid_a',
      isOnline: () => true,
      writer: (uid, state, zone, opts) =>
        CloudSaveService.saveGameState(uid, state, zone, {
          ...opts,
          baseUrlOverride: 'https://game.example.com',
          idTokenOverride: 'tok_a',
          fetchImpl: h.workerFetch,
        }),
    });
    SaveSystem.setKnownSaveRevision('uid_a', 1);

    const tab2Ok = await SaveSystem.saveGameWithCloud(
      'uid_a',
      { ...init.gameState, position: { tileX: 11, tileY: 12, facingDirection: 'down' } },
      'Central Plaza (Main City)',
      true
    );
    assertEqual(tab2Ok, false, 'Tab 2 conflict rejected safely');
    assertEqual(SaveSystem.getKnownSaveRevision('uid_a'), 2, 'SaveSystem updates knownSaveRevision to server rev 2');
    assertEqual(SaveSystem.hasPendingSync('uid_a'), false, 'stale conflicting pending sync cleared');

    const checkDO = await CloudSaveService.loadGameStateFromDO('uid_a', {
      baseUrlOverride: 'https://game.example.com',
      idTokenOverride: 'tok_a',
      fetchImpl: h.workerFetch,
    });
    assertEqual(checkDO.gameState?.position.tileX, 81, 'Tab 1 newer save NOT overwritten');
  });

  // 15. Auth & Cross-User Isolation Blocked Without Fallback
  await runTest('15. 401/403 UID_MISMATCH rejected on all /api/player/* endpoints without legacy fallback', async () => {
    const h = createWorkerHarness();

    const unauth = await h.workerFetch('https://game.example.com/api/player/load');
    assertEqual(unauth.status, 401, 'unauthenticated load returns 401');

    const crossLoad = await CloudSaveService.loadGameStateFromDO('uid_b', {
      baseUrlOverride: 'https://game.example.com',
      idTokenOverride: 'tok_a',
      fetchImpl: h.workerFetch,
    });
    // Wait: client sends GET /api/player/load without query, let's also hit ?uid=uid_b directly!
    assertEqual(crossLoad.ok, true, 'valid token loads own uid_a when no target uid query');

    const mismatchLoad = await h.workerFetch('https://game.example.com/api/player/load?uid=uid_b', {
      headers: { Authorization: 'Bearer tok_a' },
    });
    assertEqual(mismatchLoad.status, 403, 'cross-uid load returns 403');
    const mismatchJson: any = await mismatchLoad.json();
    assertEqual(mismatchJson.code, 'UID_MISMATCH', 'UID_MISMATCH code');
    assertEqual(mismatchJson.fallbackAllowed, false, 'no fallback on UID_MISMATCH');

    const mismatchSave = await h.workerFetch('https://game.example.com/api/player/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
      body: JSON.stringify({ uid: 'uid_b', positionX: 1, positionY: 1 }),
    });
    assertEqual(mismatchSave.status, 403, 'cross-uid save returns 403');

    const mismatchInit = await h.workerFetch('https://game.example.com/api/player/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
      body: JSON.stringify({ uid: 'uid_b', playerName: 'Hacker', gender: 'male' }),
    });
    assertEqual(mismatchInit.status, 403, 'cross-uid init returns 403');
  });

  // 16. DO Storage Failure Preserves Valid Previous Save & Migration Fallback Safety
  await runTest('16. DO storage put failure preserves previous valid DO save & returns safe error', async () => {
    const h = createWorkerHarness({
      fixtures: {
        uid_b: {
          profile: { uid: 'uid_b', playerName: 'MyaMya', gender: 'female' },
          playerState: { positionX: 60, positionY: 60, gold: 300 },
        },
      },
    });

    await h.workerFetch('https://game.example.com/api/player/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
      body: JSON.stringify({ playerName: 'AungAung', gender: 'male' }),
    });

    // Fail DO put during save for uid_a
    h.storage.failNextPutKey = getPlayerSaveStorageKey('uid_a');
    const failedSave = await h.workerFetch('https://game.example.com/api/player/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
      body: JSON.stringify({ clientTimestamp: Date.now(), positionX: 99, positionY: 99 }),
    });
    assertEqual(failedSave.status, 500, 'DO write failure returns 500');
    const prevRecord = await h.storage.get<any>(getPlayerSaveStorageKey('uid_a'));
    assertEqual(prevRecord.position.tileX, 30, 'previous valid save preserved intact');

    // Fail DO put during migration for uid_b -> fallbackAllowed: true, 0 Firestore writes
    h.storage.failNextPutKey = getPlayerSaveStorageKey('uid_b');
    const failedMig = (await (
      await h.workerFetch('https://game.example.com/api/player/load', {
        headers: { Authorization: 'Bearer tok_b' },
      })
    ).json()) as any;
    assertEqual(failedMig.ok, false, 'migration persist fail returns ok:false');
    assertEqual(failedMig.fallbackAllowed, true, 'fallbackAllowed true on transient DO failure');
    assert(h.fsMock.calls.every((c) => c.method === 'GET'), 'zero Firestore mutations');
  });

  // 17. End-to-End Client CloudSaveService + SaveSystem Flow Against DO Worker
  await runTest('17. Client CloudSaveService + SaveSystem end-to-end save & reload', async () => {
    const h = createWorkerHarness({
      fixtures: {
        uid_a: {
          profile: { uid: 'uid_a', playerName: 'AungAung', gender: 'male' },
          playerState: { positionX: 35, positionY: 38, gold: 200 },
        },
      },
    });

    const load1 = await CloudSaveService.loadGameStateFromDO('uid_a', {
      baseUrlOverride: 'https://game.example.com',
      idTokenOverride: 'tok_a',
      fetchImpl: h.workerFetch,
    });
    assertEqual(load1.ok, true, 'DO load ok');
    assert(load1.gameState !== undefined, 'gameState present');
    SaveSystem.setKnownSaveRevision('uid_a', load1.saveRevision);
    SaveSystem.setCloudAdaptersForTest({
      isAuthorized: (uid) => uid === 'uid_a',
      isOnline: () => true,
      writer: (uid, state, zone, opts) =>
        CloudSaveService.saveGameState(uid, state, zone, {
          ...opts,
          baseUrlOverride: 'https://game.example.com',
          idTokenOverride: 'tok_a',
          fetchImpl: h.workerFetch,
        }),
    });

    const movedState = {
      ...load1.gameState!,
      position: { tileX: 68, tileY: 74, facingDirection: 'left' as const },
    };
    const ok = await SaveSystem.saveGameWithCloud('uid_a', movedState, 'Riverside', true);
    assertEqual(ok, true, 'SaveSystem flush ok');
    assertEqual(SaveSystem.getKnownSaveRevision('uid_a'), (load1.saveRevision || 1) + 1, 'revision tracked');

    const load2 = await CloudSaveService.loadGameStateFromDO('uid_a', {
      baseUrlOverride: 'https://game.example.com',
      idTokenOverride: 'tok_a',
      fetchImpl: h.workerFetch,
    });
    assertEqual(load2.gameState?.position.tileX, 68, 'reloaded position matches saved');
    assertEqual(load2.gameState?.inventory.coins, 200, 'authoritative coins preserved');
  });

  // 18. Rollback Feature Flag (legacy_firestore & VITE_DO_SAVE_CUTOVER_ENABLED=false)
  await runTest('18. Rollback feature flag switches cleanly back to legacy Firestore path without losing DO data', async () => {
    assertEqual(
      CloudSaveService.isDOPrimaryEnabled({ VITE_DO_SAVE_CUTOVER_ENABLED: 'false' }),
      false,
      'client flag disables DO primary cleanly'
    );
    assertEqual(
      CloudSaveService.isDOPrimaryEnabled({}),
      true,
      'client flag defaults to DO primary'
    );

    const h = createWorkerHarness({
      cutoverMode: 'legacy_firestore',
      allowCommitWrites: true,
      initialStorage: {
        playerGoldBalances: { uid_a: 610 },
        [getPlayerSaveStorageKey('uid_a')]: {
          schemaVersion: 2,
          uid: 'uid_a',
          saveRevision: 4,
          lastSavedAt: new Date().toISOString(),
          lastClientTimestamp: 1700000000000,
          currentZone: 'Central Plaza (Main City)',
          player: { name: 'AungAung', gender: 'male', skinTone: '#d97706', hairColor: '#292524', clothesColor: '#3b82f6', currentTool: 'axe_basic', facingDirection: 'down', equippedClothing: {} },
          position: { tileX: 50, tileY: 50, facingDirection: 'down' },
          playerStats: { health: 100, stamina: 100, totalGathered: 0, totalCrafted: 0, totalBuilt: 0, totalSoldGold: 0 },
          playerWorldChanges: { tutorialCompleted: false, discoveredZones: ['Central Plaza (Main City)'] },
        },
      },
      fixtures: {
        uid_a: {
          profile: { uid: 'uid_a', playerName: 'AungAung', gender: 'male' },
          playerState: { positionX: 30, positionY: 30, gold: 25 },
        },
      },
    });

    const loadRes = await CloudSaveService.loadGameStateFromDO('uid_a', {
      baseUrlOverride: 'https://game.example.com',
      idTokenOverride: 'tok_a',
      fetchImpl: h.workerFetch,
    });
    assertEqual(loadRes.fallbackToLegacy, true, 'legacy_firestore mode directs client to legacy Firestore load');

    const saveRes = (await (
      await h.workerFetch('https://game.example.com/api/player/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_a' },
        body: JSON.stringify({
          clientTimestamp: Date.now(),
          positionX: 44,
          positionY: 44,
          gold: 99999,
        }),
      })
    ).json()) as any;
    assertEqual(saveRes.ok, true, 'legacy rollback save ok');
    assertEqual(saveRes.mode, 'legacy_firestore', 'mode legacy_firestore');
    assertEqual(h.fsMock.committedWrites.length, 1, 'Firestore commit executed in rollback mode');
    assertEqual(saveRes.authoritativeEconomy.gold, 610, 'DO authoritative gold still enforced');

    const doSaveAfter = await h.storage.get<any>(getPlayerSaveStorageKey('uid_a'));
    assertEqual(doSaveAfter.saveRevision, 4, 'pre-existing DO save untouched during legacy rollback');
  });

  // 19. Official Launch Reset Epoch Compatibility Under do_primary Mode
  await runTest('19. Official Launch Reset epoch propagates & applies cleanly under do_primary mode', async () => {
    const h = createWorkerHarness();
    const init = await CloudSaveService.initPlayerSaveInDO('uid_a', 'AungAung', 'male', {
      baseUrlOverride: 'https://game.example.com',
      idTokenOverride: 'tok_a',
      fetchImpl: h.workerFetch,
    });

    // Owner triggers official reset
    const resetHttp = await h.workerFetch('https://game.example.com/api/admin/official-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok_owner' },
      body: JSON.stringify({ confirmText: 'RESET', backupVerified: true }),
    });
    assertEqual(resetHttp.status, 200, 'official reset ok');
    const resetJson: any = await resetHttp.json();
    const epoch = resetJson.epoch;
    assert(typeof epoch === 'string' && epoch.startsWith('official_launch_'), 'valid reset epoch');

    const loadAfterReset = await CloudSaveService.loadGameStateFromDO('uid_a', {
      baseUrlOverride: 'https://game.example.com',
      idTokenOverride: 'tok_a',
      fetchImpl: h.workerFetch,
    });
    assertEqual(loadAfterReset.officialResetEpoch, epoch, 'DO load surfaces officialResetEpoch');

    // Client applies official reset starter state with active DO revision
    SaveSystem.setKnownSaveRevision('uid_a', loadAfterReset.saveRevision);
    SaveSystem.setCloudAdaptersForTest({
      isAuthorized: (uid) => uid === 'uid_a',
      isOnline: () => true,
      writer: (uid, state, zone, opts) =>
        CloudSaveService.saveGameState(uid, state, zone, {
          ...opts,
          baseUrlOverride: 'https://game.example.com',
          idTokenOverride: 'tok_a',
          fetchImpl: h.workerFetch,
        }),
    });

    SaveSystem.clearSave('uid_a');
    assertEqual(
      SaveSystem.getKnownSaveRevision('uid_a'),
      loadAfterReset.saveRevision,
      'clearSave preserves active DO knownSaveRevision for reset write'
    );

    const resetStarter = SaveSystem.createOfficialResetStarterState(
      'AungAung',
      'male',
      epoch,
      init.gameState.lastSaved
    );
    const savedReset = await SaveSystem.saveGameWithCloud(
      'uid_a',
      resetStarter,
      'Central Plaza (Main City)',
      true
    );
    assertEqual(savedReset, true, 'reset starter state saved to DO');

    const reload2 = await CloudSaveService.loadGameStateFromDO('uid_a', {
      baseUrlOverride: 'https://game.example.com',
      idTokenOverride: 'tok_a',
      fetchImpl: h.workerFetch,
    });
    assertEqual(reload2.gameState?.playerWorldChanges?.resetEpoch, epoch, 'resetEpoch persisted in DO');
  });

  // 20. CORS Security Check on /api/player/* Endpoints (No Wildcard *)
  await runTest('20. Authenticated /api/player/* CORS never returns wildcard Access-Control-Allow-Origin', async () => {
    const h = createWorkerHarness();
    for (const path of ['/api/player/load', '/api/player/init', '/api/player/save']) {
      const preflight = await h.workerFetch(`https://game.example.com${path}`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil-attacker.example' },
      });
      assertEqual(preflight.status, 204, `preflight ${path} 204`);
      const allowOrigin = preflight.headers.get('Access-Control-Allow-Origin');
      assert(allowOrigin !== '*', `wildcard CORS forbidden on ${path}`);
      assert(allowOrigin !== 'https://evil-attacker.example', `untrusted origin must not be reflected on ${path}`);

      const sameOrigin = await h.workerFetch(`https://game.example.com${path}`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://game.example.com' },
      });
      assertEqual(
        sameOrigin.headers.get('Access-Control-Allow-Origin'),
        'https://game.example.com',
        `same-origin CORS allowed on ${path}`
      );
    }
  });

  // 21. Server Ephemeral Restart Recovery (expectedRevision > serverRevision auto-resyncs without error)
  await runTest('21. Server restart revision drop (expected 3616 > current 1) auto-resyncs and persists save', async () => {
    const h = createWorkerHarness();
    const init = await CloudSaveService.initPlayerSaveInDO('uid_a', 'AungAung', 'male', {
      baseUrlOverride: 'https://game.example.com',
      idTokenOverride: 'tok_a',
      fetchImpl: h.workerFetch,
    });
    assertEqual(init.saveRevision, 1, 'server holds saveRevision 1');

    SaveSystem.setCloudAdaptersForTest({
      isAuthorized: (uid) => uid === 'uid_a',
      isOnline: () => true,
      writer: (uid, state, zone, opts) =>
        CloudSaveService.saveGameState(uid, state, zone, {
          ...opts,
          baseUrlOverride: 'https://game.example.com',
          idTokenOverride: 'tok_a',
          fetchImpl: h.workerFetch,
        }),
    });
    // Simulate open browser tab holding high revision after dev server restarted back to rev 1
    SaveSystem.setKnownSaveRevision('uid_a', 3616);

    const savedOk = await SaveSystem.saveGameWithCloud(
      'uid_a',
      { ...init.gameState, position: { tileX: 64, tileY: 72, facingDirection: 'right' } },
      'River Valley',
      true
    );
    assertEqual(savedOk, true, 'SaveSystem auto-resyncs and completes save cleanly');
    assertEqual(SaveSystem.getKnownSaveRevision('uid_a'), 2, 'knownSaveRevision advances to 2 after resync');
    assertEqual(SaveSystem.hasPendingSync('uid_a'), false, 'pending sync cleared after recovery save');

    const checkDO = await CloudSaveService.loadGameStateFromDO('uid_a', {
      baseUrlOverride: 'https://game.example.com',
      idTokenOverride: 'tok_a',
      fetchImpl: h.workerFetch,
    });
    assertEqual(checkDO.gameState?.position.tileX, 64, 'recovered position persisted cleanly');
    assertEqual(checkDO.gameState?.currentZone, 'River Valley', 'recovered zone persisted cleanly');
  });

  console.log(`\nALL ${passed}/21 STEP 38B TESTS PASSED (Mock / Local Harness).`);
  console.log('NOTE: Real Firebase & Cloudflare Workers Production Integration was NOT executed in local sandbox.');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
