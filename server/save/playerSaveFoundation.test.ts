/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameRoomDO } from '../cloudflare/GameRoomDO';
import { FarmPlotServerLedger } from '../farm/farmPlotService';
import { createStarterInventorySlots } from '../economy/inventoryAuthority';
import { CURRENT_SAVE_VERSION, SaveSystem } from '../../src/game/systems/SaveSystem';
import { PlacedBuilding } from '../../src/game/types';
import {
  DOStorageAdapter,
  FOUNDATION_SAVE_VERSION,
  PlayerSaveFoundationService,
  doesPlayerSaveMatchResetEpoch,
  getPlayerSaveStorageKey,
} from './playerSaveFoundation';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`ASSERTION FAILED: ${message} (expected=${String(expected)}, actual=${String(actual)})`);
  }
}

class MemoryDOStorage implements DOStorageAdapter {
  public store = new Map<string, any>();

  public async get<T = any>(key: string): Promise<T | undefined> {
    const val = this.store.get(key);
    return val === undefined ? undefined : (JSON.parse(JSON.stringify(val)) as T);
  }

  public async put<T = any>(key: string, value: T): Promise<void> {
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

function makeFirestoreMockFetch(
  fixtures: Record<
    string,
    {
      profile?: Record<string, any>;
      playerState?: Record<string, any>;
      worldState?: Record<string, any>;
    }
  >
) {
  const calls: Array<{ url: string; method: string; authHeader: string | null }> = [];

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
    const headers = init?.headers as Record<string, string> | undefined;
    const authHeader = headers?.Authorization || headers?.authorization || null;
    calls.push({ url, method, authHeader });

    if (method !== 'GET') {
      throw new Error(`SECURITY VIOLATION: Expected GET-only read from Firestore, got ${method} ${url}`);
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

  return { fetchImpl: fetchImpl as typeof fetch, calls };
}

async function runTests(): Promise<void> {
  const results: Array<{ name: string; ok: boolean }> = [];

  const test = async (name: string, fn: () => Promise<void> | void) => {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS: ${name}`);
  };

  // 1. Existing Player Save Preservation
  await test('1. Existing Player Save Preservation', async () => {
    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    const service = new PlayerSaveFoundationService();

    const fsMock = makeFirestoreMockFetch({
      uid_alpha: {
        profile: {
          uid: 'uid_alpha',
          playerName: 'AungAung',
          gender: 'male',
          gameVersion: 2,
          lastLoginAt: '2026-11-27T10:00:00.000Z',
        },
        playerState: {
          positionX: 44.5,
          positionY: 52.25,
          currentZone: 'Homestead District',
          gold: 180,
          inventory: [{ item: 'wood', quantity: 20 }],
          equipment: {
            currentTool: 'pickaxe_basic',
            facingDirection: 'right',
            ownedClothing: ['hat_straw_sun'],
            equippedClothing: { hat: 'hat_straw_sun' },
          },
          playerStats: {
            health: 95,
            stamina: 88,
            totalGathered: 42,
            totalCrafted: 7,
            totalBuilt: 3,
            totalSoldGold: 120,
          },
          lastSavedAt: '2026-11-27T10:05:00.000Z',
        },
        worldState: {
          placedBuildings: [
            {
              id: 'b_alpha_1',
              type: 'house_small',
              tileX: 50,
              tileY: 50,
              ownerId: 'uid_alpha',
              placedBy: 'AungAung',
              createdAt: 1700000000000,
            },
          ],
          playerWorldChanges: {
            tutorialCompleted: true,
            discoveredZones: ['Central Plaza (Main City)', 'Homestead District'],
          },
          lastSavedAt: '2026-11-27T10:05:00.000Z',
        },
      },
    });

    const mig = await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_alpha',
      idToken: 'token_alpha',
      fetchImpl: fsMock.fetchImpl,
    });

    assert(mig.ok && mig.didMigrate && mig.record, 'Expected alpha migration to succeed');
    assertEqual(mig.storageKey, 'player_save:uid_alpha', 'Storage key must match player_save:${uid}');
    assertEqual(mig.record.position.tileX, 44.5, 'Position X preserved');
    assertEqual(mig.record.position.tileY, 52.25, 'Position Y preserved');
    assertEqual(mig.record.player.name, 'AungAung', 'Player name preserved');
    assertEqual(mig.record.player.currentTool, 'pickaxe_basic', 'Current tool preserved');
    assertEqual(mig.record.player.equippedClothing.hat, 'hat_straw_sun', 'Equipped clothing preserved');
    assertEqual(mig.record.playerStats.totalGathered, 42, 'Stats preserved');
    assertEqual(mig.record.playerWorldChanges.tutorialCompleted, true, 'Tutorial completion preserved');
    assertEqual(mig.record.migration.legacyPersonalBuildingsCount, 1, 'Legacy building count tracked');
  });

  // 2. Existing Gold / Inventory Preservation
  await test('2. Existing Gold / Inventory Preservation', async () => {
    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    // DO ALREADY holds newer authoritative economy than legacy Firestore
    ledger.hydrateFromStorage(
      {},
      { uid_rich: 999 },
      { uid_rich: [{ item: 'axe_basic', quantity: 1 }, { item: 'fish', quantity: 12 }] },
      { uid_rich: ['suit_rose_dress'] }
    );

    const service = new PlayerSaveFoundationService();
    const fsMock = makeFirestoreMockFetch({
      uid_rich: {
        profile: { uid: 'uid_rich', playerName: 'SuSu', gender: 'female', gameVersion: 2 },
        playerState: {
          positionX: 33,
          positionY: 35,
          gold: 10, // STALE lower legacy gold in Firestore
          inventory: [{ item: 'wood', quantity: 1 }], // STALE legacy inventory
          equipment: { ownedClothing: [] }, // STALE legacy clothing
        },
      },
    });

    const mig = await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_rich',
      idToken: 'token_rich',
      fetchImpl: fsMock.fetchImpl,
    });

    assert(mig.ok && mig.economyPreservedFromDO, 'Must detect and preserve existing DO economy');
    assertEqual(ledger.getPlayerGold('uid_rich'), 999, 'DO Gold must NEVER be overwritten by legacy Firestore');
    assert(ledger.playerHasItem('uid_rich', 'fish', 12), 'DO Inventory must NEVER be overwritten');
    assertEqual(
      ledger.getPlayerOwnedClothing('uid_rich').includes('suit_rose_dress'),
      true,
      'DO Owned Clothing must NEVER be overwritten'
    );
  });

  // 3. Farm Ownership Preservation
  await test('3. Farm Ownership Preservation', async () => {
    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    const existingOwners = {
      farm_plot_1: {
        plotId: 'farm_plot_1',
        ownerId: 'uid_farmer',
        ownerName: 'FarmerOne',
        purchasedAt: 1700000000000,
        pricePaid: 500,
      },
    };
    ledger.hydrateFromStorage(existingOwners, { uid_farmer: 400 }, {}, {});
    await storage.put('farmPlotOwners', existingOwners);

    const service = new PlayerSaveFoundationService();
    const fsMock = makeFirestoreMockFetch({
      uid_farmer: {
        profile: { uid: 'uid_farmer', playerName: 'FarmerOne', gender: 'male', gameVersion: 2 },
        playerState: { positionX: 60, positionY: 75, gold: 400 },
        worldState: { playerWorldChanges: { ownedFarmPlots: [] } }, // Legacy missing plot!
      },
    });

    await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_farmer',
      idToken: 'token_farmer',
      fetchImpl: fsMock.fetchImpl,
    });

    const storedOwners = await storage.get<Record<string, any>>('farmPlotOwners');
    assertEqual(storedOwners?.farm_plot_1?.ownerId, 'uid_farmer', 'DO storage farmPlotOwners untouched');
    assertEqual(ledger.getPlotOwner('farm_plot_1')?.ownerId, 'uid_farmer', 'In-memory FarmPlotOwner preserved');
    const status = await service.getMigrationStatus({
      storage,
      uid: 'uid_farmer',
      farmLedger: ledger,
    });
    assertEqual(status.ownedFarmPlotIds.includes('farm_plot_1'), true, 'Status reports preserved Farm Plot ID');
  });

  // 4. Shared Building Preservation
  await test('4. Shared Building Preservation', async () => {
    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    const sharedBuildings: PlacedBuilding[] = [
      {
        id: 'shared_house_1',
        type: 'house_large',
        tileX: 55,
        tileY: 55,
        width: 3,
        height: 3,
        rotation: 0,
        ownerId: 'uid_builder',
        placedBy: 'Builder',
        createdAt: 1700000001000,
      },
    ];
    await storage.put('placedBuildings', sharedBuildings);

    const service = new PlayerSaveFoundationService();
    const fsMock = makeFirestoreMockFetch({
      uid_builder: {
        profile: { uid: 'uid_builder', playerName: 'Builder', gender: 'male', gameVersion: 2 },
        playerState: { positionX: 54, positionY: 54, gold: 100 },
        worldState: { placedBuildings: sharedBuildings },
      },
    });

    const mig = await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_builder',
      idToken: 'token_builder',
      fetchImpl: fsMock.fetchImpl,
    });

    assert(mig.ok && mig.record, 'Migration ok');
    assert(!('buildings' in (mig.record as any)), 'Shared buildings must NOT be duplicated inside player_save:${uid}');
    assert(!('placedBuildings' in (mig.record as any)), 'placedBuildings must NOT be duplicated inside player_save:${uid}');
    const persistedShared = await storage.get<PlacedBuilding[]>('placedBuildings');
    assertEqual(persistedShared?.length, 1, 'Shared DO placedBuildings preserved untouched');
    assertEqual(persistedShared?.[0]?.id, 'shared_house_1', 'Shared building ID intact');
  });

  // 5. UID Isolation
  await test('5. UID Isolation', async () => {
    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    const service = new PlayerSaveFoundationService();
    const fsMock = makeFirestoreMockFetch({
      uid_b: { profile: { uid: 'uid_b', playerName: 'PlayerB', gender: 'female', gameVersion: 2 } },
    });

    const crossMigrate = await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_a',
      targetUid: 'uid_b',
      idToken: 'token_a',
      fetchImpl: fsMock.fetchImpl,
    });
    assert(!crossMigrate.ok && crossMigrate.statusCode === 403, 'Cross-UID migration must be rejected with 403');
    assertEqual(crossMigrate.code, 'UID_MISMATCH', 'Cross-UID error code must be UID_MISMATCH');
    assertEqual(fsMock.calls.length, 0, 'Cross-UID rejection must happen BEFORE any Firestore call');

    const crossWrite = await service.savePlayerRecordToDO({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_a',
      input: { uid: 'uid_b', positionX: 40, positionY: 40 },
    });
    assert(!crossWrite.ok && crossWrite.statusCode === 403, 'Cross-UID DO write must be rejected with 403');
  });

  // 6. Unauthorized Access Rejection
  await test('6. Unauthorized Access Rejection', async () => {
    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    const service = new PlayerSaveFoundationService();

    const noUid = await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: '',
      idToken: 'some_token',
    });
    assert(!noUid.ok && noUid.statusCode === 401, 'Empty UID must be rejected with 401');

    const noToken = await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_valid',
      idToken: '',
    });
    assert(!noToken.ok && noToken.statusCode === 401, 'Missing token must be rejected with 401');

    // Also verify GameRoomDO HTTP status endpoint rejects unauthenticated requests
    const doInstance = new GameRoomDO(createMockDurableObjectState(storage) as any, {
      GAME_ROOM: {} as any,
      FIREBASE_PROJECT_ID: 'intrepid-cyclist-mbvhw',
    });
    const unauthRes = await doInstance.fetch(
      new Request('https://example.com/api/player/save-foundation/status', { method: 'GET' })
    );
    assertEqual(unauthRes.status, 401, 'GameRoomDO save-foundation status must reject unauthenticated requests with 401');
  });

  // 7. Duplicate Migration Prevention
  await test('7. Duplicate Migration Prevention', async () => {
    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    const service = new PlayerSaveFoundationService();
    const fsMock = makeFirestoreMockFetch({
      uid_dup: {
        profile: { uid: 'uid_dup', playerName: 'DupUser', gender: 'male', gameVersion: 2 },
        playerState: { positionX: 62, positionY: 63, gold: 250 },
      },
    });

    const first = await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_dup',
      idToken: 'token_dup',
      fetchImpl: fsMock.fetchImpl,
    });
    assert(first.ok && first.didMigrate && !first.alreadyMigrated, 'First migration succeeds');
    const callsAfterFirst = fsMock.calls.length;
    assert(callsAfterFirst === 3, 'First migration reads 3 Firestore docs (profile, playerState, worldState)');

    // Update DO position before 2nd migration call to prove 2nd call NEVER overwrites DO save
    await service.savePlayerRecordToDO({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_dup',
      input: { positionX: 88, positionY: 91 },
    });

    const second = await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_dup',
      idToken: 'token_dup',
      fetchImpl: fsMock.fetchImpl,
    });
    assert(second.ok && !second.didMigrate && second.alreadyMigrated, 'Second migration must short-circuit');
    assertEqual(second.performedFirestoreReads, false, 'Must NOT perform Firestore reads on already-migrated player');
    assertEqual(fsMock.calls.length, callsAfterFirst, 'Zero extra Firestore HTTP calls on duplicate migration');
    assertEqual(second.record?.position.tileX, 88, 'Existing DO save position must stay intact');
  });

  // 8. Firestore Read-Only Behavior
  await test('8. Firestore Read-Only Behavior', async () => {
    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    const service = new PlayerSaveFoundationService();
    const fsMock = makeFirestoreMockFetch({
      uid_ro: {
        profile: { uid: 'uid_ro', playerName: 'ReadOnly', gender: 'female', gameVersion: 2 },
        playerState: { positionX: 31, positionY: 32, gold: 77 },
      },
    });

    await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_ro',
      idToken: 'token_ro',
      fetchImpl: fsMock.fetchImpl,
    });

    assert(fsMock.calls.length > 0, 'Firestore GET calls recorded');
    for (const c of fsMock.calls) {
      assertEqual(c.method, 'GET', 'Every Firestore migration call must strictly use GET (Read-Only)');
    }
  });

  // 9. Offline Player Migration Compatibility
  await test('9. Offline Player Migration Compatibility', async () => {
    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    const service = new PlayerSaveFoundationService();

    const fsMock = makeFirestoreMockFetch({
      uid_online: {
        profile: { uid: 'uid_online', playerName: 'OnlineUser', gender: 'male', gameVersion: 2 },
        playerState: { positionX: 41, positionY: 42, gold: 120 },
      },
      uid_offline: {
        profile: { uid: 'uid_offline', playerName: 'OfflineFriend', gender: 'female', gameVersion: 2 },
        playerState: { positionX: 72, positionY: 84, gold: 640 },
        worldState: {
          playerWorldChanges: {
            tutorialCompleted: true,
            discoveredZones: ['Central Plaza (Main City)', 'Farm District'],
          },
        },
      },
    });

    // Only uid_online logs in initially
    await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_online',
      idToken: 'token_online',
      fetchImpl: fsMock.fetchImpl,
    });

    // uid_offline has not migrated yet — check status is cleanly 'not_migrated'
    const offlineBefore = await service.getMigrationStatus({
      storage,
      uid: 'uid_offline',
      farmLedger: ledger,
    });
    assertEqual(offlineBefore.hasDOPlayerSave, false, 'Offline player not prematurely initialized');
    assertEqual(offlineBefore.migrationStatus, 'not_migrated', 'Offline status is not_migrated');

    // Days later, uid_offline logs in with their own token
    const offlineMig = await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_offline',
      idToken: 'token_offline',
      fetchImpl: fsMock.fetchImpl,
    });
    assert(offlineMig.ok && offlineMig.didMigrate, 'Offline player migrates cleanly on login');
    assertEqual(offlineMig.record?.position.tileX, 72, 'Offline position preserved');
    assertEqual(ledger.getPlayerGold('uid_offline'), 640, 'Offline legacy gold preserved');
  });

  // 10. Save Revision Conflict Handling
  await test('10. Save Revision Conflict Handling', async () => {
    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    const service = new PlayerSaveFoundationService();

    const firstSave = await service.savePlayerRecordToDO({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_rev',
      input: {
        expectedRevision: 0,
        clientTimestamp: 10000,
        positionX: 45,
        positionY: 46,
      },
    });
    assert(firstSave.ok && firstSave.saveRevision === 1, 'Initial DO save sets revision=1');

    const conflictSave = await service.savePlayerRecordToDO({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_rev',
      input: {
        expectedRevision: 0, // Stale revision!
        clientTimestamp: 20000,
        positionX: 99,
        positionY: 99,
      },
    });
    assert(!conflictSave.ok && conflictSave.statusCode === 409, 'Mismatched expectedRevision returns 409');
    assertEqual(conflictSave.code, 'SAVE_REVISION_CONFLICT', 'Error code is SAVE_REVISION_CONFLICT');

    const staleTsSave = await service.savePlayerRecordToDO({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_rev',
      input: {
        expectedRevision: 1,
        clientTimestamp: 5000, // Older than 10000!
        positionX: 99,
        positionY: 99,
      },
    });
    assert(!staleTsSave.ok && staleTsSave.statusCode === 409, 'Older clientTimestamp returns 409');
    assertEqual(staleTsSave.code, 'STALE_SAVE', 'Error code is STALE_SAVE');

    const current = await service.getPlayerSave(storage, 'uid_rev');
    assertEqual(current?.position.tileX, 45, 'Conflicting saves must never overwrite committed position');
  });

  // 11. Existing Shop Purchase Compatibility
  await test('11. Existing Shop Purchase Compatibility', async () => {
    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    const service = new PlayerSaveFoundationService();

    const fsMock = makeFirestoreMockFetch({
      uid_shop: {
        profile: { uid: 'uid_shop', playerName: 'Shopper', gender: 'male', gameVersion: 2 },
        playerState: {
          positionX: 25,
          positionY: 28,
          gold: 200,
          inventory: createStarterInventorySlots(),
        },
      },
    });

    await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_shop',
      idToken: 'token_shop',
      fetchImpl: fsMock.fetchImpl,
    });

    const buyRes = await ledger.applyVerifiedShopTradeAtomic({
      uid: 'uid_shop',
      payload: { txId: 'tx_test_shop_1', action: 'buy_item', itemId: 'wood', quantity: 2 },
      persist: async (economy) => {
        await storage.put('playerGoldBalances', economy.goldBalances);
        await storage.put('playerInventories', economy.inventories);
      },
    });
    assert(buyRes.ok, 'Existing shop buy_item works seamlessly after foundation migration');
    assert(buyRes.balance < 200, 'Gold deducted accurately');
    assert(ledger.playerHasItem('uid_shop', 'wood', 12), 'Purchased wood added to starter 10 wood');
  });

  // 12. Existing Multiplayer Compatibility
  await test('12. Existing Multiplayer Compatibility', async () => {
    const storage = new MemoryDOStorage();
    await storage.put('officialResetEpoch', 'official_launch_1700000000');
    await storage.put('placedBuildings', [
      {
        id: 'b_mp_1',
        type: 'campfire',
        tileX: 60,
        tileY: 60,
        width: 1,
        height: 1,
        rotation: 0,
        ownerId: 'uid_mp',
        placedBy: 'MPUser',
        createdAt: 1700000000000,
      },
    ]);

    const mockState = createMockDurableObjectState(storage);
    const doInstance = new GameRoomDO(mockState as any, {
      GAME_ROOM: {} as any,
      FIREBASE_PROJECT_ID: 'intrepid-cyclist-mbvhw',
    });
    await mockState.waitForReady();

    const launchRes = await doInstance.fetch(new Request('https://example.com/api/launch-status'));
    assertEqual(launchRes.status, 200, 'Existing /api/launch-status remains intact');
    const launchBody = (await launchRes.json()) as any;
    assertEqual(launchBody.buildingCount, 1, 'Existing placedBuildings count preserved');
    assertEqual(launchBody.officialResetEpoch, 'official_launch_1700000000', 'Reset epoch preserved');
    assertEqual(
      doInstance.getPlayerSaveStorageKey('uid_mp'),
      'player_save:uid_mp',
      'GameRoomDO exposes player_save:${uid} key helper'
    );
  });

  // 13. Save Version 2 Compatibility
  await test('13. Save Version 2 Compatibility', async () => {
    assertEqual(CURRENT_SAVE_VERSION, 2, 'CURRENT_SAVE_VERSION must remain 2');
    assertEqual(FOUNDATION_SAVE_VERSION, 2, 'Foundation schemaVersion must match v2');

    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    const service = new PlayerSaveFoundationService();

    // Legacy v1 Firestore shape: nested inventory: { slots, coins } & version 1
    const fsMock = makeFirestoreMockFetch({
      uid_v1: {
        profile: { uid: 'uid_v1', playerName: 'LegacyV1', gender: 'male', gameVersion: 1 },
        playerState: {
          positionX: 35,
          positionY: 36,
          inventory: {
            coins: 150,
            slots: [{ item: 'stone', quantity: 14 }],
          },
        },
      },
    });

    const mig = await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_v1',
      idToken: 'token_v1',
      fetchImpl: fsMock.fetchImpl,
    });
    assert(mig.ok && mig.record, 'Legacy v1 migrates cleanly');
    assertEqual(mig.record.schemaVersion, 2, 'Upgraded to schemaVersion 2');
    assertEqual(ledger.getPlayerGold('uid_v1'), 150, 'Nested v1 coins recovered accurately');
    assert(ledger.playerHasItem('uid_v1', 'axe_basic', 1), 'Starter tools guaranteed');

    const clientMigrated = SaveSystem.migrateGameState(
      {
        version: 1,
        player: {
          name: 'LegacyV1',
          gender: 'male',
          skinTone: '#d97706',
          hairColor: '#292524',
          clothesColor: '#3b82f6',
          currentTool: 'axe_basic',
          coins: 150,
        },
      },
      'LegacyV1',
      'male'
    );
    assertEqual(clientMigrated.version, 2, 'Client SaveSystem v1->v2 remains compatible');
  });

  // 14. Official Reset Epoch Compatibility
  await test('14. Official Reset Epoch Compatibility', async () => {
    const storage = new MemoryDOStorage();
    const ledger = new FarmPlotServerLedger();
    const service = new PlayerSaveFoundationService();
    const epoch = 'official_launch_1764000000000';

    const fsMock = makeFirestoreMockFetch({
      uid_epoch: {
        profile: { uid: 'uid_epoch', playerName: 'EpochUser', gender: 'female', gameVersion: 2 },
        playerState: { positionX: 30, positionY: 30, gold: 25 },
        worldState: {
          playerWorldChanges: {
            tutorialCompleted: false,
            discoveredZones: ['Central Plaza (Main City)'],
            resetEpoch: epoch,
          },
        },
      },
    });

    const mig = await service.migratePlayerFromFirestoreReadOnly({
      storage,
      farmLedger: ledger,
      authenticatedUid: 'uid_epoch',
      idToken: 'token_epoch',
      fetchImpl: fsMock.fetchImpl,
    });

    assert(mig.ok && mig.record, 'Epoch migration ok');
    assertEqual(mig.record.playerWorldChanges.resetEpoch, epoch, 'resetEpoch preserved in DO save');
    assert(doesPlayerSaveMatchResetEpoch(mig.record, epoch), 'Matches current officialResetEpoch');
    assert(!doesPlayerSaveMatchResetEpoch(mig.record, 'official_launch_999'), 'Detects older epoch mismatch');

    const status = await service.getMigrationStatus({
      storage,
      uid: 'uid_epoch',
      farmLedger: ledger,
      officialResetEpoch: epoch,
    });
    assertEqual(status.resetEpoch, epoch, 'Status reports resetEpoch');
    assertEqual(status.matchesOfficialResetEpoch, true, 'Status reports matchesOfficialResetEpoch=true');
    assertEqual(getPlayerSaveStorageKey('uid_epoch'), 'player_save:uid_epoch', 'Storage key helper intact');
  });

  console.log(`\nALL ${results.length}/14 TESTS PASSED SUCCESSFULLY.`);
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('TEST SUITE FAILED:', err);
    process.exit(1);
  });
