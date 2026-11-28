/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import workerDefault from '../cloudflare/worker';
import workerStagingDefault, { GameRoomStagingDO } from '../cloudflare/worker.staging';
import { GameRoomDO } from '../cloudflare/GameRoomDO';
import { CloudSaveService } from '../../src/firebase/cloudSaveService';
import {
  DOStorageAdapter,
  getPlayerSaveStorageKey,
} from './playerSaveFoundation';
import { checkStagingAccess, resolveAppEnvironment } from './stagingIsolation';

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

function createMockWebSocketPair() {
  const sentMessages: any[] = [];
  let closed: { code?: number; reason?: string } | null = null;
  const listeners = new Map<string, Array<(ev: any) => any>>();

  const socket = {
    accept: () => {},
    send: (raw: string) => {
      try {
        sentMessages.push(JSON.parse(raw));
      } catch {
        sentMessages.push(raw);
      }
    },
    close: (code?: number, reason?: string) => {
      closed = { code, reason };
    },
    addEventListener: (event: string, fn: (ev: any) => any) => {
      const arr = listeners.get(event) || [];
      arr.push(fn);
      listeners.set(event, arr);
    },
    dispatchMessage: async (msgObj: unknown) => {
      const fns = listeners.get('message') || [];
      for (const fn of fns) {
        await fn({ data: JSON.stringify(msgObj) });
      }
    },
  };

  return { socket, sentMessages, getClosed: () => closed };
}

function createStagingHarness(params?: {
  appEnv?: string;
  allowedUids?: string;
  allowedEmails?: string;
  cutoverMode?: 'do_primary' | 'legacy_firestore';
}) {
  const storage = new MemoryDOStorage();
  const state = createMockDurableObjectState(storage);
  const firestoreCalls: Array<{ url: string; method: string }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method || 'GET').toUpperCase();
    firestoreCalls.push({ url, method });

    if (method !== 'GET') {
      throw new Error(`ISOLATION VIOLATION: Unexpected non-GET Firestore call (${method} ${url})`);
    }
    // Simulate brand-new test user (404 in Firestore) or empty legacy doc
    return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
  };

  const verifier = makeMockTokenVerifier({
    tok_owner: {
      uid: 'uid_owner_prod',
      email: 'pikadotoo124@gmail.com',
      email_verified: true,
      name: 'Owner',
    },
    tok_friend: {
      uid: 'uid_friend_prod',
      email: 'friend.prod@gmail.com',
      email_verified: true,
      name: 'ProdFriend',
    },
    tok_test_email: {
      uid: 'uid_test_1',
      email: 'randomcity.staging.test@gmail.com',
      email_verified: true,
      name: 'StagingTester',
    },
    tok_test_unverified: {
      uid: 'uid_spoof_unverified',
      email: 'randomcity.staging.test@gmail.com',
      email_verified: false,
      name: 'UnverifiedSpoofer',
    },
    tok_test_uid: {
      uid: 'uid_test_allowlisted_only',
      email: 'uidonly.tester@gmail.com',
      email_verified: true,
      name: 'UidTester',
    },
  });

  const env: any = {
    APP_ENV: params?.appEnv ?? 'staging',
    DO_SAVE_CUTOVER_MODE: params?.cutoverMode ?? 'do_primary',
    FIREBASE_PROJECT_ID: 'intrepid-cyclist-mbvhw',
    FIREBASE_DATABASE_ID: 'ai-studio-randomcity-5937d77e-b2d8-41e1-a0e0-e3c9da9af426',
    STAGING_ALLOWED_TEST_UIDS: params?.allowedUids ?? '',
    STAGING_ALLOWED_TEST_EMAILS: params?.allowedEmails ?? '',
  };

  const room = new GameRoomStagingDO(state as any, env, {
    fetchImpl,
    tokenVerifier: verifier,
  });

  env.GAME_ROOM_STAGING = {
    idFromName: (name: string) => ({ name }),
    get: () => ({
      fetch: async (req: Request) => {
        await state.waitForReady();
        return room.fetch(req);
      },
    }),
  };

  const stagingFetch = async (pathOrUrl: string, init?: RequestInit) => {
    await state.waitForReady();
    const fullUrl = pathOrUrl.startsWith('http')
      ? pathOrUrl
      : `https://random-city-multiplayer-staging.test.workers.dev${pathOrUrl}`;
    return workerStagingDefault.fetch(new Request(fullUrl, init), env);
  };

  return { storage, state, env, room, firestoreCalls, stagingFetch };
}

async function runTests(): Promise<void> {
  let passed = 0;

  // 1. Config & Namespace Isolation Check (Production untouched vs Staging isolated)
  {
    const prodConfig = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'wrangler.jsonc'), 'utf8')
    );
    const stagingConfig = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'wrangler.staging.jsonc'), 'utf8')
    );

    assertEqual(prodConfig.name, 'random-city-multiplayer', 'Prod worker name must remain intact');
    assertEqual(prodConfig.main, 'server/cloudflare/worker.ts', 'Prod main worker must remain intact');
    assertEqual(prodConfig.assets?.directory, './dist', 'Prod assets dir must remain ./dist');
    assertEqual(
      prodConfig.durable_objects?.bindings?.[0]?.name,
      'GAME_ROOM',
      'Prod DO binding must remain GAME_ROOM'
    );
    assertEqual(
      prodConfig.durable_objects?.bindings?.[0]?.class_name,
      'GameRoomDO',
      'Prod DO class must remain GameRoomDO'
    );

    assert(
      stagingConfig.name !== prodConfig.name,
      'Staging worker name must be distinct from Production'
    );
    assertEqual(
      stagingConfig.name,
      'random-city-multiplayer-staging',
      'Staging worker name must be random-city-multiplayer-staging'
    );
    assertEqual(
      stagingConfig.main,
      'server/cloudflare/worker.staging.ts',
      'Staging main must use worker.staging.ts'
    );
    assertEqual(
      stagingConfig.assets?.directory,
      './dist-staging',
      'Staging assets dir must be isolated in ./dist-staging'
    );
    assertEqual(stagingConfig.vars?.APP_ENV, 'staging', 'Staging APP_ENV must be staging');
    assertEqual(
      stagingConfig.vars?.DO_SAVE_CUTOVER_MODE,
      'do_primary',
      'Staging DO_SAVE_CUTOVER_MODE must be do_primary'
    );
    assertEqual(
      stagingConfig.vars?.FIREBASE_DATABASE_ID,
      'ai-studio-randomcity-5937d77e-b2d8-41e1-a0e0-e3c9da9af426',
      'Staging FIREBASE_DATABASE_ID must match applet config'
    );
    assertEqual(
      stagingConfig.durable_objects?.bindings?.[0]?.name,
      'GAME_ROOM_STAGING',
      'Staging DO binding must be isolated GAME_ROOM_STAGING'
    );
    assertEqual(
      stagingConfig.durable_objects?.bindings?.[0]?.class_name,
      'GameRoomStagingDO',
      'Staging DO class must be isolated GameRoomStagingDO'
    );
    assert(
      !stagingConfig.durable_objects?.bindings?.[0]?.script_name,
      'Staging DO binding must NOT point script_name back to Production worker'
    );
    assert(
      !stagingConfig.routes && !stagingConfig.route,
      'Staging config must NOT attach production custom domains or routes'
    );
    passed++;
  }

  // 2. Staging Worker /health exposes safe staging metadata & fails cleanly if binding missing
  {
    const h = createStagingHarness();
    const healthRes = await h.stagingFetch('/health');
    assertEqual(healthRes.status, 200, 'Staging /health must return 200');
    const healthJson = await healthRes.json();
    assertEqual(healthJson.service, 'random-city-multiplayer-staging', 'Health reports staging service');
    assertEqual(healthJson.environment, 'staging', 'Health reports staging environment');

    const brokenRes = await workerStagingDefault.fetch(
      new Request('https://random-city-multiplayer-staging.test.workers.dev/api/launch-status'),
      { APP_ENV: 'staging' } as any
    );
    assertEqual(brokenRes.status, 500, 'Missing GAME_ROOM_STAGING binding fails cleanly with 500');
    passed++;
  }

  // 3. Fail-Closed Staging Access when allowlist is empty
  {
    const h = createStagingHarness({ allowedUids: '', allowedEmails: '' });
    const loadRes = await h.stagingFetch('/api/player/load', {
      headers: { Authorization: 'Bearer tok_test_email' },
    });
    assertEqual(loadRes.status, 403, 'Empty staging allowlist must fail closed with 403');
    const body = await loadRes.json();
    assertEqual(body.code, 'STAGING_TEST_ACCOUNT_REQUIRED', 'Expected STAGING_TEST_ACCOUNT_REQUIRED code');
    assertEqual(body.fallbackAllowed, false, 'Blocked staging response must disallow Firestore fallback');
    assertEqual(h.firestoreCalls.length, 0, 'Blocked staging user must trigger 0 Firestore reads');
    passed++;
  }

  // 4. Hard Block on Production Owner (pikadotoo124@gmail.com) even if mistakenly added to allowlist
  {
    const h = createStagingHarness({
      allowedEmails: 'pikadotoo124@gmail.com, randomcity.staging.test@gmail.com',
      allowedUids: 'uid_owner_prod',
    });

    const gate = checkStagingAccess({
      env: h.env,
      uid: 'uid_owner_prod',
      email: 'pikadotoo124@gmail.com',
      emailVerified: true,
    });
    assertEqual(gate.allowed, false, 'Owner must always be blocked in staging');
    assertEqual(gate.code, 'STAGING_OWNER_BLOCKED', 'Owner block code must be STAGING_OWNER_BLOCKED');

    const loadRes = await h.stagingFetch('/api/player/load', {
      headers: { Authorization: 'Bearer tok_owner' },
    });
    assertEqual(loadRes.status, 403, 'Staging /api/player/load must block Owner with 403');
    assertEqual((await loadRes.json()).code, 'STAGING_OWNER_BLOCKED', 'Load returns STAGING_OWNER_BLOCKED');

    const initRes = await h.stagingFetch('/api/player/init', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok_owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: 'OwnerTest', gender: 'male' }),
    });
    assertEqual(initRes.status, 403, 'Staging /api/player/init must block Owner with 403');

    const saveRes = await h.stagingFetch('/api/player/save', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok_owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientTimestamp: Date.now() }),
    });
    assertEqual(saveRes.status, 403, 'Staging /api/player/save must block Owner with 403');

    const sessionRes = await h.stagingFetch('/api/session/check', {
      headers: { Authorization: 'Bearer tok_owner' },
    });
    assertEqual(sessionRes.status, 403, 'Staging /api/session/check must block Owner with 403');

    const adminRes = await h.stagingFetch('/api/admin/overview', {
      headers: { Authorization: 'Bearer tok_owner' },
    });
    assertEqual(adminRes.status, 403, 'Staging /api/admin/overview must block Owner with 403');

    const wsPair = createMockWebSocketPair();
    await (h.room as any).handleClientMessage(wsPair.socket, {
      type: 'c:auth_join',
      payload: {
        idToken: 'tok_owner',
        profile: { name: 'Owner', gender: 'male', positionX: 30, positionY: 30 },
      },
    });
    assertEqual(wsPair.getClosed()?.code, 4003, 'Staging WS c:auth_join must close Owner socket with 4003');
    assert(
      wsPair.sentMessages.some((m) => m.type === 's:error' && m.payload?.code === 'STAGING_OWNER_BLOCKED'),
      'Staging WS must send STAGING_OWNER_BLOCKED error'
    );
    assertEqual(h.firestoreCalls.length, 0, 'Owner staging attempts must perform 0 Firestore reads');
    passed++;
  }

  // 5. Block Non-Test Friend Accounts & Unverified Email Spoofing in Staging
  {
    const h = createStagingHarness({
      allowedEmails: 'randomcity.staging.test@gmail.com',
      allowedUids: 'uid_test_allowlisted_only',
    });

    const friendLoad = await h.stagingFetch('/api/player/load', {
      headers: { Authorization: 'Bearer tok_friend' },
    });
    assertEqual(friendLoad.status, 403, 'Non-test friend UID/email must be blocked with 403');
    assertEqual(
      (await friendLoad.json()).code,
      'STAGING_ACCOUNT_NOT_ALLOWED',
      'Friend receives STAGING_ACCOUNT_NOT_ALLOWED'
    );

    const unverifiedLoad = await h.stagingFetch('/api/player/load', {
      headers: { Authorization: 'Bearer tok_test_unverified' },
    });
    assertEqual(
      unverifiedLoad.status,
      403,
      'Unverified email claiming allowlisted staging email must be rejected with 403'
    );

    const wsPair = createMockWebSocketPair();
    await (h.room as any).handleClientMessage(wsPair.socket, {
      type: 'c:auth_join',
      payload: {
        idToken: 'tok_friend',
        profile: { name: 'ProdFriend', gender: 'female', positionX: 30, positionY: 30 },
      },
    });
    assertEqual(wsPair.getClosed()?.code, 4003, 'Staging WS must reject non-test friend with close 4003');
    assertEqual(h.firestoreCalls.length, 0, 'Non-test friends trigger 0 Firestore calls in staging');
    passed++;
  }

  // 6. Approved Test Gmail Account & Test UID succeed end-to-end in Staging DO Primary
  {
    const h = createStagingHarness({
      allowedEmails: 'randomcity.staging.test@gmail.com',
      allowedUids: 'uid_test_allowlisted_only',
    });

    // Session check allowed
    const sessRes = await h.stagingFetch('/api/session/check', {
      headers: { Authorization: 'Bearer tok_test_email' },
    });
    assertEqual(sessRes.status, 200, 'Approved staging test account passes /api/session/check');

    // First load -> needsCharacterCreation (read-only Firestore check finds 404)
    const firstLoad = await h.stagingFetch('/api/player/load', {
      headers: { Authorization: 'Bearer tok_test_email' },
    });
    assertEqual(firstLoad.status, 200, 'Approved staging test account passes /api/player/load');
    const firstJson = await firstLoad.json();
    assertEqual(firstJson.needsCharacterCreation, true, 'Fresh test account prompts character select');

    // Init directly inside Staging DO SQLite (0 Firestore writes)
    const initRes = await h.stagingFetch('/api/player/init', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok_test_email', 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'uid_test_1', playerName: 'StageHero', gender: 'male' }),
    });
    assertEqual(initRes.status, 200, 'Staging /api/player/init initializes DO record cleanly');
    const initJson = await initRes.json();
    assertEqual(
      initJson.storageKey,
      getPlayerSaveStorageKey('uid_test_1'),
      'DO record stored under player_save:${uid}'
    );

    const fsCallsBeforeReload = h.firestoreCalls.length;
    const secondLoad = await h.stagingFetch('/api/player/load', {
      headers: { Authorization: 'Bearer tok_test_email' },
    });
    assertEqual(secondLoad.status, 200, 'Second load succeeds from Staging DO SQLite');
    const secondJson = await secondLoad.json();
    assertEqual(secondJson.source, 'do_primary', 'Second load comes from do_primary');
    assertEqual(secondJson.performedFirestoreReads, false, 'Second load performs 0 Firestore reads');
    assertEqual(
      h.firestoreCalls.length,
      fsCallsBeforeReload,
      'Zero Firestore calls happen after DO Primary record exists'
    );

    // Save with spoofed economy fields -> stripped/rejected from overwriting DO gold
    const saveRes = await h.stagingFetch('/api/player/save', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok_test_email', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saveId: 'staging_save_1',
        expectedRevision: secondJson.saveRevision,
        clientTimestamp: Date.now(),
        positionX: 42,
        positionY: 48,
        currentZone: 'Central Plaza (Main City)',
        coins: 999999,
        gold: 999999,
      }),
    });
    assertEqual(saveRes.status, 200, 'Staging /api/player/save persists cleanly to DO SQLite');
    const saveJson = await saveRes.json();
    assertEqual(saveJson.mode, 'do_primary', 'Save mode is do_primary');
    assertEqual(saveJson.authoritativeEconomy.gold, 25, 'Spoofed Gold 999999 cannot overwrite DO Gold 25');

    // WebSocket c:auth_join succeeds for approved test UID too
    const wsPair = createMockWebSocketPair();
    await (h.room as any).handleClientMessage(wsPair.socket, {
      type: 'c:auth_join',
      payload: {
        idToken: 'tok_test_uid',
        profile: { name: 'UidTester', gender: 'female', positionX: 30, positionY: 30 },
      },
    });
    assertEqual(wsPair.getClosed(), null, 'Approved test UID stays connected on Staging WS');
    assert(
      wsPair.sentMessages.some((m) => m.type === 's:room_state'),
      'Approved test UID receives s:room_state on Staging WS'
    );
    passed++;
  }

  // 7. Staging Legacy Rollback Safety Guard: NEVER write to Production Firestore
  {
    const h = createStagingHarness({
      allowedEmails: 'randomcity.staging.test@gmail.com',
      cutoverMode: 'legacy_firestore',
    });

    const loadRes = await h.stagingFetch('/api/player/load', {
      headers: { Authorization: 'Bearer tok_test_email' },
    });
    assertEqual(loadRes.status, 200, 'Rollback GET /api/player/load returns 200');
    assertEqual((await loadRes.json()).fallbackToLegacy, true, 'Rollback mode signals fallbackToLegacy=true');

    const saveRes = await h.stagingFetch('/api/player/save', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok_test_email', 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientTimestamp: Date.now() }),
    });
    assertEqual(saveRes.status, 403, 'Staging must block legacy_firestore Firestore writes with 403');
    assertEqual(
      (await saveRes.json()).code,
      'STAGING_FIRESTORE_WRITE_BLOCKED',
      'Expected STAGING_FIRESTORE_WRITE_BLOCKED'
    );
    passed++;
  }

  // 8. Production Unchanged & Client Staging Helpers
  {
    assertEqual(resolveAppEnvironment(undefined), 'production', 'Default APP_ENV resolves to production');
    assertEqual(resolveAppEnvironment({ APP_ENV: 'staging' }), 'staging', 'APP_ENV=staging resolves cleanly');
    assertEqual(
      CloudSaveService.isStagingEnvironment({ VITE_APP_ENV: 'staging' }),
      true,
      'Client detects staging build'
    );
    assertEqual(
      CloudSaveService.isStagingEnvironment({}),
      false,
      'Default client build is not staging'
    );

    // Production GameRoomDO allows Owner & Friends identically without staging allowlist
    const storage = new MemoryDOStorage();
    const state = createMockDurableObjectState(storage);
    const prodEnv: any = {
      FIREBASE_PROJECT_ID: 'intrepid-cyclist-mbvhw',
      FIREBASE_DATABASE_ID: 'ai-studio-randomcity-5937d77e-b2d8-41e1-a0e0-e3c9da9af426',
    };
    const prodRoom = new GameRoomDO(state as any, prodEnv, {
      tokenVerifier: makeMockTokenVerifier({
        tok_owner: {
          uid: 'uid_owner_prod',
          email: 'pikadotoo124@gmail.com',
          email_verified: true,
          name: 'Owner',
        },
        tok_friend: {
          uid: 'uid_friend_prod',
          email: 'friend.prod@gmail.com',
          email_verified: true,
          name: 'ProdFriend',
        },
      }),
    });
    prodEnv.GAME_ROOM = {
      idFromName: (name: string) => ({ name }),
      get: () => ({
        fetch: async (req: Request) => {
          await state.waitForReady();
          return prodRoom.fetch(req);
        },
      }),
    };

    const ownerSess = await workerDefault.fetch(
      new Request('https://random-city-multiplayer.example.workers.dev/api/session/check', {
        headers: { Authorization: 'Bearer tok_owner' },
      }),
      prodEnv
    );
    assertEqual(ownerSess.status, 200, 'Production continues allowing Owner cleanly');
    const friendSess = await workerDefault.fetch(
      new Request('https://random-city-multiplayer.example.workers.dev/api/session/check', {
        headers: { Authorization: 'Bearer tok_friend' },
      }),
      prodEnv
    );
    assertEqual(friendSess.status, 200, 'Production continues allowing Friends cleanly');
    passed++;
  }

  console.log(`ALL STEP 38C STAGING ISOLATION TESTS PASSED (${passed}/${passed})`);
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('STEP 38C TEST FAILED:', err);
    process.exit(1);
  });
