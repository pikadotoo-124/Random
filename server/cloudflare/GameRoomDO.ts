/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ActiveAnnouncement,
  ClientMessage,
  PlayerPresenceState,
  ServerMessage,
  WorldSyncState,
  ChatMessage,
} from '../../src/game/multiplayer/types';
import { PlacedBuilding } from '../../src/game/types';
import { ClothingSystem } from '../../src/game/systems/ClothingSystem';
import { LAKESIDE_DOUBLE_BENCHES, getLakesideBenchById } from '../../src/game/data/LakesideBenches';
import { normalizeFenceRotation } from '../../src/game/systems/FenceTopology';
import {
  createAuthoritativeServerMap,
  getAuthoritativeFootprint,
  validateDismantleAction,
  validateServerOrClientBuild,
} from '../../src/game/systems/LandOwnershipSystem';
import { verifyFirebaseIdToken } from '../auth/tokenVerifier';
import { fetchVerifiedFirestorePlayerEconomy } from '../farm/firestoreGoldSync';
import { EconomyPersistPayload, FarmPlotServerLedger } from '../farm/farmPlotService';
import {
  MAX_PLAYER_SAVE_BYTES,
  buildAuthenticatedSaveCorsHeaders,
  commitPlayerAndWorldStateToFirestore,
} from '../firebase/firestoreServerSave';
import {
  DOPlayerSaveRecord,
  PlayerMigrationResult,
  PlayerSaveFoundationService,
  PlayerSaveMigrationStatusReport,
  SaveCutoverMode,
  buildHydratedClientBundleFromDO,
  getPlayerSaveStorageKey,
  resolveSaveCutoverMode,
  validateAuthenticatedUidAccess,
} from '../save/playerSaveFoundation';
import {
  checkStagingAccess,
  resolveAppEnvironment,
} from '../save/stagingIsolation';
import { FishingSessionTracker } from '../fishing/fishingService';
import { ResourceSystem } from '../../src/game/systems/ResourceSystem';
import { createStarterInventorySlots, normalizeStorageSlots } from '../economy/inventoryAuthority';
import {
  AdminOverviewResponse,
  AdminRateLimiter,
  BannedUserRecord,
  KnownPlayerRecord,
  PROJECT_OWNER_EMAIL,
  ServerErrorEntry,
  SessionCheckResponse,
  buildAdminPlayersList,
  isVerifiedOwnerClaims,
  recordServerError,
  sanitizeAdminReason,
  sanitizeOptionalName,
  upsertKnownPlayerRecord,
  validateAnnouncementMessage,
  validateTargetUid,
} from '../admin/adminService';

// Ambient declarations for Cloudflare Workers / Durable Objects environment
declare class WebSocketPair {
  0: any;
  1: any;
  [key: string]: any;
}

interface DurableObjectState {
  storage: {
    get<T = any>(key: string): Promise<T | undefined>;
    put<T = any>(key: string, value: T): Promise<void>;
  };
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

interface DurableObjectNamespace {
  idFromName(name: string): any;
  get(id: any): any;
}

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  GAME_ROOM_STAGING?: DurableObjectNamespace;
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
  APP_ENV?: string;
  STAGING_ALLOWED_TEST_UIDS?: string;
  STAGING_ALLOWED_TEST_EMAILS?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_DATABASE_ID?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  DO_SAVE_CUTOVER_MODE?: string;
}

export interface StagingEnv extends Omit<Env, 'GAME_ROOM'> {
  GAME_ROOM?: DurableObjectNamespace;
  GAME_ROOM_STAGING: DurableObjectNamespace;
}

export interface GameRoomDOTestHooks {
  fetchImpl?: typeof fetch;
  tokenVerifier?: typeof verifyFirebaseIdToken;
}

/**
 * Cloudflare Durable Object class for Random City Room authoritative sync
 */
export class GameRoomDO {
  private state: DurableObjectState;
  private env: Env | StagingEnv;

  // Authoritative In-Memory State
  private roomName = 'random-city-main';
  private maxPlayers = 10;
  private players = new Map<string, PlayerPresenceState>();
  private sockets = new Map<any, string>(); // WebSocket -> playerId
  private depletedResources = new Map<string, number>(); // nodeId -> respawnAt
  private placedBuildings: PlacedBuilding[] = [];
  private benchSeats = new Map<string, [string | null, string | null]>();
  private serverMap = createAuthoritativeServerMap();
  private serverResources = (() => {
    const rs = new ResourceSystem();
    rs.generateResources(this.serverMap);
    return rs;
  })();
  private fishingTracker = new FishingSessionTracker(
    this.serverResources.nodes.filter((n) => n.type === 'lake_fish').map((n) => n.id)
  );
  private chatHistory: ChatMessage[] = [];
  private officialResetEpoch: string | null = null;
  private officialResetExecutedAt: string | null = null;
  private farmLedger = new FarmPlotServerLedger();
  private saveFoundation = new PlayerSaveFoundationService();

  // Admin & Moderation State
  private bannedUsers = new Map<string, BannedUserRecord>();
  private knownPlayers = new Map<string, KnownPlayerRecord>();
  private activeAnnouncement: ActiveAnnouncement | null = null;
  private recentErrors: ServerErrorEntry[] = [];
  private rateLimiter = new AdminRateLimiter();
  private startedAtMs = Date.now();
  private startedAtIso = new Date().toISOString();
  private testHooks?: GameRoomDOTestHooks;

  constructor(state: DurableObjectState, env: Env | StagingEnv, testHooks?: GameRoomDOTestHooks) {
    this.state = state;
    this.env = env;
    this.testHooks = testHooks;

    // Load persisted world buildings, launch metadata, ban list, known players, farm plots, gold, inventories, clothing, and announcement
    this.state.blockConcurrencyWhile(async () => {
      const savedBuildings = (await this.state.storage.get<PlacedBuilding[]>('placedBuildings')) || [];
      this.placedBuildings = savedBuildings;
      const savedEpoch = await this.state.storage.get<string | null>('officialResetEpoch');
      this.officialResetEpoch = savedEpoch ?? null;
      const savedExecutedAt = await this.state.storage.get<string | null>('officialResetExecutedAt');
      this.officialResetExecutedAt = savedExecutedAt ?? null;

      const [
        savedPlotOwners,
        savedGoldBalances,
        savedInventories,
        savedOwnedClothing,
        savedSaveRevisions,
      ] = await Promise.all([
        this.state.storage.get<any>('farmPlotOwners'),
        this.state.storage.get<Record<string, number>>('playerGoldBalances'),
        this.state.storage.get<Record<string, any>>('playerInventories'),
        this.state.storage.get<Record<string, string[]>>('playerOwnedClothing'),
        this.state.storage.get<Record<string, number>>('playerSaveRevisions'),
      ]);
      this.farmLedger.hydrateFromStorage(
        savedPlotOwners,
        savedGoldBalances,
        savedInventories,
        savedOwnedClothing
      );
      this.farmLedger.hydrateSaveRevisions(savedSaveRevisions);

      const savedBans = (await this.state.storage.get<BannedUserRecord[]>('bannedUsers')) || [];
      if (Array.isArray(savedBans)) {
        for (const b of savedBans) {
          if (b && typeof b.uid === 'string' && b.uid.trim()) {
            this.bannedUsers.set(b.uid, b);
          }
        }
      }

      const savedKnown = (await this.state.storage.get<KnownPlayerRecord[]>('knownPlayers')) || [];
      if (Array.isArray(savedKnown)) {
        for (const k of savedKnown) {
          if (k && typeof k.uid === 'string' && k.uid.trim()) {
            this.knownPlayers.set(k.uid, k);
          }
        }
      }

      const savedAnnouncement = await this.state.storage.get<ActiveAnnouncement | null>('activeAnnouncement');
      this.activeAnnouncement = savedAnnouncement ?? null;
    });

    // Background interval for resource respawns
    setInterval(() => {
      this.checkResourceRespawns();
    }, 2000);
  }

  private jsonResponse(body: any, status = 200, extraHeaders?: Record<string, string>): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        ...(extraHeaders || {}),
      },
    });
  }

  private async persistBannedUsers(): Promise<void> {
    await this.state.storage.put('bannedUsers', Array.from(this.bannedUsers.values()));
  }

  private async persistKnownPlayers(): Promise<void> {
    await this.state.storage.put('knownPlayers', Array.from(this.knownPlayers.values()));
  }

  private async persistEconomyStorage(economy?: EconomyPersistPayload): Promise<void> {
    const payload = economy || this.farmLedger.getEconomyPersistPayload();
    await Promise.all([
      this.state.storage.put('playerGoldBalances', payload.goldBalances),
      this.state.storage.put('playerInventories', payload.inventories),
      this.state.storage.put('playerOwnedClothing', payload.ownedClothing),
    ]);
  }

  public getPlayerSaveStorageKey(uid: string): string {
    return getPlayerSaveStorageKey(uid);
  }

  public async getPlayerSaveRecord(uid: string): Promise<DOPlayerSaveRecord | null> {
    return this.saveFoundation.getPlayerSave(this.state.storage, uid);
  }

  public async getPlayerSaveMigrationStatus(uid: string): Promise<PlayerSaveMigrationStatusReport> {
    return this.saveFoundation.getMigrationStatus({
      storage: this.state.storage,
      uid,
      farmLedger: this.farmLedger,
      placedBuildings: this.placedBuildings,
      officialResetEpoch: this.officialResetEpoch,
    });
  }

  public async prepareZeroLossPlayerSaveFoundation(params: {
    authenticatedUid: string | null | undefined;
    targetUid?: string | null;
    idToken: string | null | undefined;
    fallbackName?: string;
    fallbackGender?: 'male' | 'female';
    fetchImpl?: typeof fetch;
  }): Promise<PlayerMigrationResult> {
    return this.saveFoundation.migratePlayerFromFirestoreReadOnly({
      storage: this.state.storage,
      farmLedger: this.farmLedger,
      authenticatedUid: params.authenticatedUid,
      targetUid: params.targetUid,
      idToken: params.idToken,
      projectId: this.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw',
      databaseId: this.env.FIREBASE_DATABASE_ID,
      fallbackName: params.fallbackName,
      fallbackGender: params.fallbackGender,
      fetchImpl: params.fetchImpl || this.testHooks?.fetchImpl,
      persistEconomy: () => this.persistEconomyStorage(),
    });
  }

  public resolveCutoverMode(): SaveCutoverMode {
    return resolveSaveCutoverMode(this.env as unknown as Record<string, unknown>);
  }

  private disconnectPlayerSockets(
    targetUid: string,
    closeCode: number,
    closeReason: string,
    finalMessage?: ServerMessage
  ): boolean {
    let disconnected = false;
    for (const [socket, pid] of Array.from(this.sockets.entries())) {
      if (pid === targetUid) {
        disconnected = true;
        this.sockets.delete(socket);
        if (finalMessage) {
          try {
            socket.send(JSON.stringify(finalMessage));
          } catch {}
        }
        try {
          socket.close(closeCode, closeReason);
        } catch {}
      }
    }
    this.releasePlayerBenchSeat(targetUid, true);
    if (this.players.delete(targetUid)) {
      disconnected = true;
      this.broadcast({
        type: 's:player_left',
        payload: {
          playerId: targetUid,
          playerCount: this.players.size,
        },
      });
    }
    return disconnected;
  }

  private async verifyAuthenticatedUser(
    request: Request
  ): Promise<
    | { ok: true; uid: string; idToken: string; email?: string; isOwner: boolean }
    | { ok: false; response: Response }
  > {
    const authHeader = request.headers.get('Authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]) {
      return {
        ok: false,
        response: this.jsonResponse({ ok: false, error: 'Missing Authorization Bearer token.' }, 401),
      };
    }

    const idToken = match[1].trim();
    const projectId = this.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw';
    const verifyFn = this.testHooks?.tokenVerifier || verifyFirebaseIdToken;
    const result = await verifyFn(idToken, projectId);
    if (!result.valid || !result.claims) {
      return {
        ok: false,
        response: this.jsonResponse({ ok: false, error: result.error || 'Invalid Firebase ID token.' }, 401),
      };
    }

    const stagingGate = checkStagingAccess({
      env: this.env as unknown as Record<string, unknown>,
      uid: result.claims.uid,
      email: result.claims.email,
      emailVerified: result.claims.email_verified,
    });
    if (!stagingGate.allowed) {
      return {
        ok: false,
        response: this.jsonResponse(
          {
            ok: false,
            code: stagingGate.code,
            error: stagingGate.error,
            fallbackAllowed: false,
          },
          stagingGate.statusCode
        ),
      };
    }

    return {
      ok: true,
      uid: result.claims.uid,
      idToken,
      email: result.claims.email,
      isOwner: isVerifiedOwnerClaims(result.claims),
    };
  }

  private async verifyAdminRequest(
    request: Request,
    actionType: 'read' | 'write' = 'read'
  ): Promise<{ ok: true; uid: string; email: string } | { ok: false; response: Response }> {
    const authHeader = request.headers.get('Authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]) {
      return {
        ok: false,
        response: this.jsonResponse({ ok: false, error: 'Missing Authorization Bearer token.' }, 401),
      };
    }

    const projectId = this.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw';
    const verifyFn = this.testHooks?.tokenVerifier || verifyFirebaseIdToken;
    const result = await verifyFn(match[1].trim(), projectId);
    if (!result.valid || !result.claims) {
      return {
        ok: false,
        response: this.jsonResponse({ ok: false, error: result.error || 'Invalid Firebase ID token.' }, 401),
      };
    }

    const stagingGate = checkStagingAccess({
      env: this.env as unknown as Record<string, unknown>,
      uid: result.claims.uid,
      email: result.claims.email,
      emailVerified: result.claims.email_verified,
    });
    if (!stagingGate.allowed) {
      return {
        ok: false,
        response: this.jsonResponse(
          {
            ok: false,
            code: stagingGate.code,
            error: stagingGate.error,
          },
          stagingGate.statusCode
        ),
      };
    }

    if (!isVerifiedOwnerClaims(result.claims)) {
      return {
        ok: false,
        response: this.jsonResponse(
          { ok: false, error: 'Forbidden: Only the verified Project Owner can access admin controls.' },
          403
        ),
      };
    }

    const maxRequests = actionType === 'write' ? 30 : 90;
    const rate = this.rateLimiter.check(`admin:${result.claims.uid}:${actionType}`, maxRequests, 60000);
    if (!rate.allowed) {
      return {
        ok: false,
        response: this.jsonResponse(
          { ok: false, error: 'Too many admin requests. Please wait a moment and try again.' },
          429,
          { 'Retry-After': String(rate.retryAfterSeconds) }
        ),
      };
    }

    return {
      ok: true,
      uid: result.claims.uid,
      email: (result.claims.email || PROJECT_OWNER_EMAIL).toLowerCase().trim(),
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/player/load') {
      const loadCors = buildAuthenticatedSaveCorsHeaders(
        request.headers.get('Origin'),
        url.origin
      );
      const respondLoad = (body: any, status = 200, extra?: Record<string, string>) =>
        new Response(JSON.stringify(body), {
          status,
          headers: {
            'Content-Type': 'application/json',
            ...loadCors,
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            ...(extra || {}),
          },
        });

      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: { ...loadCors, 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
        });
      }
      if (request.method !== 'GET') {
        return respondLoad({ ok: false, error: 'Method not allowed.' }, 405);
      }

      const authHeader = request.headers.get('Authorization') || '';
      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!tokenMatch || !tokenMatch[1]) {
        return respondLoad(
          { ok: false, code: 'AUTH_REQUIRED', error: 'Missing Authorization Bearer token.', fallbackAllowed: false },
          401
        );
      }

      const idToken = tokenMatch[1].trim();
      const projectId = this.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw';
      const verifyFn = this.testHooks?.tokenVerifier || verifyFirebaseIdToken;
      const tokenResult = await verifyFn(idToken, projectId);
      if (!tokenResult.valid || !tokenResult.claims) {
        return respondLoad(
          {
            ok: false,
            code: 'AUTH_FAILED',
            error: tokenResult.error || 'Invalid or expired Firebase ID token.',
            fallbackAllowed: false,
          },
          401
        );
      }

      const verifiedUid = tokenResult.claims.uid;
      const stagingGate = checkStagingAccess({
        env: this.env as unknown as Record<string, unknown>,
        uid: verifiedUid,
        email: tokenResult.claims.email,
        emailVerified: tokenResult.claims.email_verified,
      });
      if (!stagingGate.allowed) {
        return respondLoad(
          {
            ok: false,
            mode: this.resolveCutoverMode(),
            code: stagingGate.code,
            error: stagingGate.error,
            fallbackAllowed: false,
          },
          stagingGate.statusCode
        );
      }

      const requestedUid = url.searchParams.get('uid');
      const uidAccess = validateAuthenticatedUidAccess({
        authenticatedUid: verifiedUid,
        targetUid: requestedUid,
      });
      if (!uidAccess.ok) {
        return respondLoad(
          { ok: false, code: uidAccess.code, error: uidAccess.error, fallbackAllowed: false },
          uidAccess.statusCode
        );
      }

      const rate = this.rateLimiter.check(`player_load:${verifiedUid}`, 60, 60000);
      if (!rate.allowed) {
        return respondLoad(
          {
            ok: false,
            code: 'RATE_LIMITED',
            error: 'Too many load requests. Please wait a moment.',
            fallbackAllowed: true,
          },
          429,
          { 'Retry-After': String(rate.retryAfterSeconds) }
        );
      }

      const cutoverMode = this.resolveCutoverMode();
      const loadRes = await this.saveFoundation.loadOrMigratePlayerSave({
        storage: this.state.storage,
        farmLedger: this.farmLedger,
        authenticatedUid: verifiedUid,
        targetUid: requestedUid,
        idToken,
        mode: cutoverMode,
        projectId,
        databaseId: this.env.FIREBASE_DATABASE_ID,
        fallbackName: this.players.get(verifiedUid)?.playerName || tokenResult.claims.name,
        fetchImpl: this.testHooks?.fetchImpl,
        persistEconomy: () => this.persistEconomyStorage(),
      });

      if (loadRes.fallbackToLegacy) {
        return respondLoad(
          {
            ok: true,
            mode: 'legacy_firestore',
            fallbackToLegacy: true,
            officialResetEpoch: this.officialResetEpoch,
          },
          200
        );
      }

      if (!loadRes.ok) {
        return respondLoad(
          {
            ok: false,
            mode: loadRes.mode,
            code: loadRes.code,
            error: loadRes.error,
            fallbackAllowed: Boolean(loadRes.fallbackAllowed),
          },
          loadRes.statusCode
        );
      }

      if (loadRes.needsCharacterCreation || !loadRes.record) {
        return respondLoad(
          {
            ok: true,
            mode: loadRes.mode,
            exists: false,
            needsCharacterCreation: true,
            performedFirestoreReads: loadRes.performedFirestoreReads,
            officialResetEpoch: this.officialResetEpoch,
          },
          200
        );
      }

      // Ensure starter economy exists if a DO player_save record had somehow unverified economy
      if (!this.farmLedger.isEconomyFullyVerified(verifiedUid)) {
        const seeded = this.farmLedger.seedAuthoritativeEconomy(
          verifiedUid,
          {
            gold: 25,
            inventorySlots: createStarterInventorySlots(),
            ownedClothing: [],
          },
          true
        );
        if (seeded.seededGold || seeded.seededInventory || seeded.seededClothing) {
          await this.persistEconomyStorage();
        }
      }

      const bundle = buildHydratedClientBundleFromDO({
        record: loadRes.record,
        farmLedger: this.farmLedger,
        placedBuildings: this.placedBuildings,
      });

      return respondLoad(
        {
          ok: true,
          mode: loadRes.mode,
          exists: true,
          source: loadRes.source,
          didMigrate: loadRes.didMigrate,
          performedFirestoreReads: loadRes.performedFirestoreReads,
          economyPreservedFromDO: loadRes.economyPreservedFromDO,
          storageKey: loadRes.storageKey,
          saveRevision: loadRes.record.saveRevision,
          officialResetEpoch: this.officialResetEpoch,
          profile: bundle.profile,
          gameState: bundle.gameState,
          authoritativeEconomy: bundle.authoritativeEconomy,
        },
        200
      );
    }

    if (url.pathname === '/api/player/init') {
      const initCors = buildAuthenticatedSaveCorsHeaders(
        request.headers.get('Origin'),
        url.origin
      );
      const respondInit = (body: any, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: {
            'Content-Type': 'application/json',
            ...initCors,
          },
        });

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: initCors });
      }
      if (request.method !== 'POST') {
        return respondInit({ ok: false, error: 'Method not allowed.' }, 405);
      }

      const authHeader = request.headers.get('Authorization') || '';
      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!tokenMatch || !tokenMatch[1]) {
        return respondInit({ ok: false, code: 'AUTH_REQUIRED', error: 'Unauthorized.' }, 401);
      }

      const projectId = this.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw';
      const verifyFn = this.testHooks?.tokenVerifier || verifyFirebaseIdToken;
      const tokenResult = await verifyFn(tokenMatch[1].trim(), projectId);
      if (!tokenResult.valid || !tokenResult.claims) {
        return respondInit({ ok: false, code: 'AUTH_FAILED', error: 'Invalid Firebase ID token.' }, 401);
      }

      const verifiedUid = tokenResult.claims.uid;
      const stagingGate = checkStagingAccess({
        env: this.env as unknown as Record<string, unknown>,
        uid: verifiedUid,
        email: tokenResult.claims.email,
        emailVerified: tokenResult.claims.email_verified,
      });
      if (!stagingGate.allowed) {
        return respondInit(
          {
            ok: false,
            code: stagingGate.code,
            error: stagingGate.error,
            fallbackAllowed: false,
          },
          stagingGate.statusCode
        );
      }

      let body: any = null;
      try {
        body = await request.json();
      } catch {
        return respondInit({ ok: false, code: 'INVALID_JSON', error: 'Invalid JSON body.' }, 400);
      }

      const claimedUid =
        typeof body?.uid === 'string' && body.uid.trim() ? body.uid.trim() : undefined;
      const uidAccess = validateAuthenticatedUidAccess({
        authenticatedUid: verifiedUid,
        targetUid: claimedUid,
      });
      if (!uidAccess.ok) {
        return respondInit({ ok: false, code: uidAccess.code, error: uidAccess.error }, uidAccess.statusCode);
      }

      const playerName = typeof body?.playerName === 'string' ? body.playerName.trim() : '';
      if (playerName.length < 3 || playerName.length > 16) {
        return respondInit(
          { ok: false, code: 'INVALID_NAME', error: 'Player Name must be between 3 and 16 characters.' },
          400
        );
      }

      const initRes = await this.saveFoundation.initializeNewPlayerSaveToDO({
        storage: this.state.storage,
        farmLedger: this.farmLedger,
        authenticatedUid: verifiedUid,
        playerName,
        gender: body?.gender,
        officialResetEpoch: this.officialResetEpoch,
        persistEconomy: () => this.persistEconomyStorage(),
      });

      if (!initRes.ok || !initRes.record) {
        return respondInit(
          { ok: false, code: initRes.code || 'DO_INIT_FAILED', error: initRes.error },
          initRes.statusCode || 500
        );
      }

      const bundle = buildHydratedClientBundleFromDO({
        record: initRes.record,
        farmLedger: this.farmLedger,
        placedBuildings: this.placedBuildings,
      });

      return respondInit(
        {
          ok: true,
          mode: this.resolveCutoverMode(),
          storageKey: initRes.storageKey,
          saveRevision: initRes.saveRevision,
          lastSavedAt: initRes.lastSavedAt,
          profile: bundle.profile,
          gameState: bundle.gameState,
          authoritativeEconomy: bundle.authoritativeEconomy,
        },
        200
      );
    }

    if (url.pathname === '/api/player/save') {
      const saveCorsHeaders = buildAuthenticatedSaveCorsHeaders(
        request.headers.get('Origin'),
        url.origin
      );
      const saveJson = (body: any, status = 200, extra?: Record<string, string>) =>
        new Response(JSON.stringify(body), {
          status,
          headers: {
            'Content-Type': 'application/json',
            ...saveCorsHeaders,
            ...(extra || {}),
          },
        });

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: saveCorsHeaders });
      }
      if (request.method !== 'POST') {
        return saveJson({ ok: false, error: 'Method not allowed.' }, 405);
      }

      const authHeader = request.headers.get('Authorization') || '';
      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!tokenMatch || !tokenMatch[1]) {
        return saveJson(
          { ok: false, code: 'AUTH_REQUIRED', error: 'Missing Authorization Bearer token.' },
          401
        );
      }

      const idToken = tokenMatch[1].trim();
      const projectId = this.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw';
      const verifyFn = this.testHooks?.tokenVerifier || verifyFirebaseIdToken;
      const tokenResult = await verifyFn(idToken, projectId);
      if (!tokenResult.valid || !tokenResult.claims) {
        return saveJson(
          {
            ok: false,
            code: 'AUTH_FAILED',
            error: tokenResult.error || 'Invalid or expired Firebase ID token.',
          },
          401
        );
      }

      const verifiedUid = tokenResult.claims.uid;
      const stagingGate = checkStagingAccess({
        env: this.env as unknown as Record<string, unknown>,
        uid: verifiedUid,
        email: tokenResult.claims.email,
        emailVerified: tokenResult.claims.email_verified,
      });
      if (!stagingGate.allowed) {
        return saveJson(
          {
            ok: false,
            code: stagingGate.code,
            error: stagingGate.error,
            fallbackAllowed: false,
          },
          stagingGate.statusCode
        );
      }

      const rate = this.rateLimiter.check(`player_save:${verifiedUid}`, 90, 60000);
      if (!rate.allowed) {
        return saveJson(
          {
            ok: false,
            code: 'RATE_LIMITED',
            error: 'Cloud save requests are too frequent. Please wait a moment.',
          },
          429,
          { 'Retry-After': String(rate.retryAfterSeconds) }
        );
      }

      const contentLengthHeader = request.headers.get('Content-Length');
      if (contentLengthHeader) {
        const len = parseInt(contentLengthHeader, 10);
        if (Number.isFinite(len) && len > MAX_PLAYER_SAVE_BYTES) {
          return saveJson(
            { ok: false, code: 'PAYLOAD_TOO_LARGE', error: 'Save payload exceeds 512KB limit.' },
            413
          );
        }
      }

      let rawBody: unknown;
      try {
        const rawText = await request.text();
        if (new TextEncoder().encode(rawText).length > MAX_PLAYER_SAVE_BYTES) {
          return saveJson(
            { ok: false, code: 'PAYLOAD_TOO_LARGE', error: 'Save payload exceeds 512KB limit.' },
            413
          );
        }
        rawBody = JSON.parse(rawText);
      } catch {
        return saveJson(
          { ok: false, code: 'INVALID_JSON', error: 'Invalid JSON request body.' },
          400
        );
      }

      if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
        return saveJson(
          { ok: false, code: 'INVALID_PAYLOAD', error: 'Save payload must be a JSON object.' },
          400
        );
      }

      const cutoverMode = this.resolveCutoverMode();
      if (cutoverMode === 'legacy_firestore') {
        if (resolveAppEnvironment(this.env as unknown as Record<string, unknown>) === 'staging') {
          return saveJson(
            {
              ok: false,
              mode: 'legacy_firestore',
              code: 'STAGING_FIRESTORE_WRITE_BLOCKED',
              error:
                'Staging never writes to Production Firestore even during legacy_firestore rollback verification.',
              fallbackAllowed: false,
            },
            403
          );
        }

        const saveResult = await this.farmLedger.executeAuthoritativePlayerSave({
          uid: verifiedUid,
          rawBody,
          serverPlacedBuildings: this.placedBuildings,
          fallbackPlayerName:
            this.players.get(verifiedUid)?.playerName || tokenResult.claims.name || 'Settler',
          ensureEconomySeeded: async () => {
            const seedRes = await fetchVerifiedFirestorePlayerEconomy({
              uid: verifiedUid,
              idToken,
              projectId,
              databaseId: this.env.FIREBASE_DATABASE_ID,
              fetchImpl: this.testHooks?.fetchImpl,
            });
            const seeded = this.farmLedger.seedAuthoritativeEconomy(
              verifiedUid,
              {
                gold: seedRes.gold,
                inventorySlots: seedRes.inventorySlots,
                ownedClothing: seedRes.ownedClothing,
              },
              seedRes.ok
            );
            if (seeded.seededGold || seeded.seededInventory || seeded.seededClothing) {
              await this.persistEconomyStorage();
            }
          },
          commitToFirestore: (docs) =>
            commitPlayerAndWorldStateToFirestore({
              uid: verifiedUid,
              docs,
              env: this.env as unknown as Record<string, string | undefined>,
              userIdToken: idToken,
              fetchImpl: this.testHooks?.fetchImpl,
            }),
          persistSaveRevisions: async (revisions) => {
            await this.state.storage.put('playerSaveRevisions', revisions);
          },
        });

        return saveJson(
          {
            ok: saveResult.ok,
            mode: 'legacy_firestore',
            saveRevision: saveResult.saveRevision,
            lastSavedAt: saveResult.lastSavedAt,
            ...(saveResult.deduplicated ? { deduplicated: true } : {}),
            ...(saveResult.stale ? { stale: true } : {}),
            ...(saveResult.code ? { code: saveResult.code } : {}),
            ...(saveResult.error ? { error: saveResult.error } : {}),
            ...(saveResult.authoritativeEconomy
              ? { authoritativeEconomy: saveResult.authoritativeEconomy }
              : {}),
          },
          saveResult.statusCode
        );
      }

      // Phase 2 — DO Save (Primary):
      const body = rawBody as Record<string, unknown>;
      const claimedUid =
        typeof body.uid === 'string' && body.uid.trim()
          ? body.uid.trim()
          : typeof body.playerId === 'string' && body.playerId.trim()
          ? body.playerId.trim()
          : undefined;
      const uidAccess = validateAuthenticatedUidAccess({
        authenticatedUid: verifiedUid,
        targetUid: claimedUid,
      });
      if (!uidAccess.ok) {
        return saveJson({ ok: false, code: uidAccess.code, error: uidAccess.error }, uidAccess.statusCode);
      }

      // If DO doesn't hold player_save:${uid} yet, perform zero-loss Read-Only migration BEFORE applying client save
      // so legacy Firestore data and DO economy are preserved before writing.
      const existingDORecord = await this.saveFoundation.getPlayerSave(this.state.storage, verifiedUid);
      if (!existingDORecord) {
        const preMigrate = await this.saveFoundation.loadOrMigratePlayerSave({
          storage: this.state.storage,
          farmLedger: this.farmLedger,
          authenticatedUid: verifiedUid,
          idToken,
          mode: 'do_primary',
          projectId,
          databaseId: this.env.FIREBASE_DATABASE_ID,
          fallbackName:
            typeof body.playerName === 'string'
              ? body.playerName
              : this.players.get(verifiedUid)?.playerName || tokenResult.claims.name,
          fallbackGender: body.gender === 'female' ? 'female' : 'male',
          fetchImpl: this.testHooks?.fetchImpl,
          persistEconomy: () => this.persistEconomyStorage(),
        });
        if (!preMigrate.ok) {
          return saveJson(
            {
              ok: false,
              mode: 'do_primary',
              code: preMigrate.code || 'MIGRATION_FAILED',
              error: preMigrate.error || 'Failed to verify legacy save before DO write; legacy data preserved.',
              fallbackAllowed: Boolean(preMigrate.fallbackAllowed),
            },
            preMigrate.statusCode
          );
        }
      }

      // Ensure verified DO economy exists without overwriting pre-existing DO values
      if (!this.farmLedger.isEconomyFullyVerified(verifiedUid)) {
        const seeded = this.farmLedger.seedAuthoritativeEconomy(
          verifiedUid,
          {
            gold: 25,
            inventorySlots: createStarterInventorySlots(),
            ownedClothing: [],
          },
          true
        );
        if (seeded.seededGold || seeded.seededInventory || seeded.seededClothing) {
          await this.persistEconomyStorage();
        }
      }

      const eqRaw =
        body.equipment && typeof body.equipment === 'object' && !Array.isArray(body.equipment)
          ? (body.equipment as Record<string, unknown>)
          : {};
      const statsRaw =
        body.playerStats && typeof body.playerStats === 'object' && !Array.isArray(body.playerStats)
          ? (body.playerStats as Record<string, unknown>)
          : undefined;
      const wcRaw =
        body.playerWorldChanges &&
        typeof body.playerWorldChanges === 'object' &&
        !Array.isArray(body.playerWorldChanges)
          ? (body.playerWorldChanges as Record<string, unknown>)
          : undefined;

      if (
        body.clientTimestamp !== undefined &&
        (typeof body.clientTimestamp !== 'number' ||
          !Number.isFinite(body.clientTimestamp) ||
          body.clientTimestamp <= 0)
      ) {
        return saveJson(
          { ok: false, code: 'INVALID_TIMESTAMP', error: 'Invalid clientTimestamp.' },
          400
        );
      }

      const expectedRevRaw = body.expectedRevision;
      const expectedRevision =
        typeof expectedRevRaw === 'number' && Number.isInteger(expectedRevRaw) && expectedRevRaw >= 0
          ? expectedRevRaw
          : undefined;

      const doSaveRes = await this.saveFoundation.savePlayerRecordToDO({
        storage: this.state.storage,
        farmLedger: this.farmLedger,
        authenticatedUid: verifiedUid,
        input: {
          uid: claimedUid,
          saveId: typeof body.saveId === 'string' ? body.saveId : undefined,
          expectedRevision,
          clientTimestamp:
            typeof body.clientTimestamp === 'number' ? Math.floor(body.clientTimestamp) : undefined,
          currentZone: typeof body.currentZone === 'string' ? body.currentZone : undefined,
          playerName: typeof body.playerName === 'string' ? body.playerName : undefined,
          gender: body.gender === 'female' ? 'female' : body.gender === 'male' ? 'male' : undefined,
          positionX: typeof body.positionX === 'number' ? body.positionX : undefined,
          positionY: typeof body.positionY === 'number' ? body.positionY : undefined,
          facingDirection: eqRaw.facingDirection as any,
          currentTool:
            eqRaw.currentTool === null
              ? null
              : typeof eqRaw.currentTool === 'string'
              ? eqRaw.currentTool
              : undefined,
          equippedClothing: eqRaw.equippedClothing as any,
          playerStats: statsRaw as any,
          playerWorldChanges: wcRaw
            ? {
                tutorialCompleted:
                  wcRaw.tutorialCompleted !== undefined ? Boolean(wcRaw.tutorialCompleted) : undefined,
                discoveredZones: Array.isArray(wcRaw.discoveredZones)
                  ? (wcRaw.discoveredZones as string[])
                  : undefined,
                resetEpoch: typeof wcRaw.resetEpoch === 'string' ? wcRaw.resetEpoch : undefined,
              }
            : undefined,
        },
      });

      const authoritativeEconomy = this.farmLedger.getAuthoritativeEconomySnapshot(verifiedUid);

      return saveJson(
        {
          ok: doSaveRes.ok,
          mode: 'do_primary',
          storageKey: doSaveRes.storageKey,
          saveRevision: doSaveRes.saveRevision,
          lastSavedAt: doSaveRes.lastSavedAt,
          ...(doSaveRes.deduplicated ? { deduplicated: true } : {}),
          ...(doSaveRes.stale ? { stale: true } : {}),
          ...(doSaveRes.code ? { code: doSaveRes.code } : {}),
          ...(doSaveRes.error ? { error: doSaveRes.error } : {}),
          authoritativeEconomy,
        },
        doSaveRes.statusCode
      );
    }

    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      }

      if (url.pathname === '/api/session/check' && request.method === 'GET') {
        const authCheck = await this.verifyAuthenticatedUser(request);
        if (!authCheck.ok) return authCheck.response;

        const rate = this.rateLimiter.check(`session:${authCheck.uid}`, 60, 60000);
        if (!rate.allowed) {
          return this.jsonResponse(
            { ok: false, error: 'Rate limit exceeded.' },
            429,
            { 'Retry-After': String(rate.retryAfterSeconds) }
          );
        }

        const ban = authCheck.isOwner ? undefined : this.bannedUsers.get(authCheck.uid);
        const payload: SessionCheckResponse = {
          ok: true,
          uid: authCheck.uid,
          banned: Boolean(ban),
          banReason: ban?.reason || null,
          bannedAt: ban?.bannedAt || null,
          announcement: this.activeAnnouncement,
          isOwner: authCheck.isOwner,
        };
        return this.jsonResponse(payload);
      }

      if (url.pathname === '/api/launch-status' && request.method === 'GET') {
        return this.jsonResponse({
          ok: true,
          officialResetEpoch: this.officialResetEpoch,
          officialResetExecutedAt: this.officialResetExecutedAt,
          buildingCount: this.placedBuildings.length,
        });
      }

      if (url.pathname === '/api/player/save-foundation/status') {
        const statusCors = buildAuthenticatedSaveCorsHeaders(
          request.headers.get('Origin'),
          url.origin
        );
        const respondStatus = (body: any, status = 200) =>
          new Response(JSON.stringify(body), {
            status,
            headers: {
              'Content-Type': 'application/json',
              ...statusCors,
            },
          });

        if (request.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: { ...statusCors, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
        }
        if (request.method !== 'GET') {
          return respondStatus({ ok: false, error: 'Method not allowed.' }, 405);
        }

        const authCheck = await this.verifyAuthenticatedUser(request);
        if (!authCheck.ok) {
          const cloned = await authCheck.response.json().catch(() => ({ ok: false, code: 'AUTH_REQUIRED', error: 'Unauthorized.' }));
          return respondStatus(cloned, authCheck.response.status);
        }

        const requestedUid = url.searchParams.get('uid');
        const access = validateAuthenticatedUidAccess({
          authenticatedUid: authCheck.uid,
          targetUid: requestedUid,
        });
        if (!access.ok) {
          return respondStatus({ ok: false, code: access.code, error: access.error }, access.statusCode);
        }

        const report = await this.getPlayerSaveMigrationStatus(access.uid);
        return respondStatus({ ok: true, status: report }, 200);
      }

      if (url.pathname === '/api/admin/overview' && request.method === 'GET') {
        const authCheck = await this.verifyAdminRequest(request, 'read');
        if (!authCheck.ok) return authCheck.response;

        const playersList = buildAdminPlayersList({
          onlinePlayers: this.players,
          knownPlayers: this.knownPlayers,
          bannedUsers: this.bannedUsers,
          ownerUid: authCheck.uid,
        });

        const overview: AdminOverviewResponse = {
          ok: true,
          owner: {
            uid: authCheck.uid,
            email: authCheck.email,
          },
          serverStatus: {
            health: this.recentErrors.length >= 5 ? 'degraded' : 'healthy',
            runtime: 'cloudflare-do',
            roomName: this.roomName,
            connectionStatus: 'online',
            onlineCount: this.players.size,
            maxPlayers: this.maxPlayers,
            startedAt: this.startedAtIso,
            uptimeMs: Math.max(0, Date.now() - this.startedAtMs),
            recentErrorCount: this.recentErrors.length,
            recentErrors: [...this.recentErrors].reverse(),
          },
          players: playersList,
          bannedCount: this.bannedUsers.size,
          activeAnnouncement: this.activeAnnouncement,
          officialResetEpoch: this.officialResetEpoch,
          officialResetExecutedAt: this.officialResetExecutedAt,
          buildingCount: this.placedBuildings.length,
        };
        return this.jsonResponse(overview);
      }

      if (url.pathname === '/api/admin/kick' && request.method === 'POST') {
        const authCheck = await this.verifyAdminRequest(request, 'write');
        if (!authCheck.ok) return authCheck.response;

        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return this.jsonResponse({ ok: false, error: 'Invalid JSON request body.' }, 400);
        }

        const uidCheck = validateTargetUid(body?.uid);
        if (!uidCheck.ok) {
          return this.jsonResponse({ ok: false, error: uidCheck.error }, 400);
        }
        if (uidCheck.uid === authCheck.uid || this.knownPlayers.get(uidCheck.uid)?.isOwner) {
          return this.jsonResponse({ ok: false, error: 'Cannot kick the Project Owner.' }, 400);
        }

        const reason = sanitizeAdminReason(body?.reason, 'Admin မှ ဂိမ်းခန်းမှ ထုတ်ပယ်လိုက်ပါသည်။');
        const kicked = this.disconnectPlayerSockets(uidCheck.uid, 4001, 'Kicked by owner', {
          type: 's:kicked',
          payload: {
            reason,
            kickedAt: new Date().toISOString(),
          },
        });

        return this.jsonResponse({
          ok: true,
          uid: uidCheck.uid,
          kicked,
          onlineCount: this.players.size,
        });
      }

      if (url.pathname === '/api/admin/ban' && request.method === 'POST') {
        const authCheck = await this.verifyAdminRequest(request, 'write');
        if (!authCheck.ok) return authCheck.response;

        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return this.jsonResponse({ ok: false, error: 'Invalid JSON request body.' }, 400);
        }

        const uidCheck = validateTargetUid(body?.uid);
        if (!uidCheck.ok) {
          return this.jsonResponse({ ok: false, error: uidCheck.error }, 400);
        }
        if (uidCheck.uid === authCheck.uid || this.knownPlayers.get(uidCheck.uid)?.isOwner) {
          return this.jsonResponse({ ok: false, error: 'Cannot ban the Project Owner.' }, 400);
        }

        const reason = sanitizeAdminReason(body?.reason, 'Admin မှ ဂိမ်းဝင်ခွင့် ပိတ်ပင်ထားပါသည်။');
        const known = this.knownPlayers.get(uidCheck.uid);
        const online = this.players.get(uidCheck.uid);
        const banRecord: BannedUserRecord = {
          uid: uidCheck.uid,
          playerName: online?.playerName || known?.playerName || sanitizeOptionalName(body?.playerName),
          reason,
          bannedAt: new Date().toISOString(),
          bannedBy: authCheck.email,
        };

        this.bannedUsers.set(uidCheck.uid, banRecord);
        await this.persistBannedUsers();

        const disconnectedOnline = this.disconnectPlayerSockets(uidCheck.uid, 4003, 'Banned by owner', {
          type: 's:banned',
          payload: {
            reason: banRecord.reason,
            bannedAt: banRecord.bannedAt,
          },
        });

        return this.jsonResponse({
          ok: true,
          banned: banRecord,
          disconnectedOnline,
          onlineCount: this.players.size,
        });
      }

      if (url.pathname === '/api/admin/unban' && request.method === 'POST') {
        const authCheck = await this.verifyAdminRequest(request, 'write');
        if (!authCheck.ok) return authCheck.response;

        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return this.jsonResponse({ ok: false, error: 'Invalid JSON request body.' }, 400);
        }

        const uidCheck = validateTargetUid(body?.uid);
        if (!uidCheck.ok) {
          return this.jsonResponse({ ok: false, error: uidCheck.error }, 400);
        }

        const existed = this.bannedUsers.delete(uidCheck.uid);
        if (existed) {
          await this.persistBannedUsers();
        }

        return this.jsonResponse({
          ok: true,
          uid: uidCheck.uid,
          unbanned: existed,
        });
      }

      if (url.pathname === '/api/admin/announcement' && request.method === 'POST') {
        const authCheck = await this.verifyAdminRequest(request, 'write');
        if (!authCheck.ok) return authCheck.response;

        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return this.jsonResponse({ ok: false, error: 'Invalid JSON request body.' }, 400);
        }

        const msgCheck = validateAnnouncementMessage(body?.message);
        if (!msgCheck.ok) {
          return this.jsonResponse({ ok: false, error: msgCheck.error }, 400);
        }

        const now = Date.now();
        this.activeAnnouncement = {
          id: `ann_${now}`,
          message: msgCheck.message,
          createdAt: this.activeAnnouncement?.createdAt || now,
          updatedAt: now,
        };
        await this.state.storage.put('activeAnnouncement', this.activeAnnouncement);

        this.broadcast({
          type: 's:announcement',
          payload: { announcement: this.activeAnnouncement },
        });

        return this.jsonResponse({
          ok: true,
          announcement: this.activeAnnouncement,
        });
      }

      if (
        (url.pathname === '/api/admin/announcement' && request.method === 'DELETE') ||
        (url.pathname === '/api/admin/announcement/clear' && request.method === 'POST')
      ) {
        const authCheck = await this.verifyAdminRequest(request, 'write');
        if (!authCheck.ok) return authCheck.response;

        this.activeAnnouncement = null;
        await this.state.storage.put('activeAnnouncement', null);

        this.broadcast({
          type: 's:announcement',
          payload: { announcement: null },
        });

        return this.jsonResponse({
          ok: true,
          announcement: null,
        });
      }

      if (url.pathname === '/api/admin/backup-world' && request.method === 'GET') {
        const authCheck = await this.verifyAdminRequest(request, 'read');
        if (!authCheck.ok) return authCheck.response;

        const ownerCounts = new Map<string, { ownerId: string; ownerName: string; count: number }>();
        for (const b of this.placedBuildings) {
          const oid = b.ownerId || b.placedBy || 'unknown';
          const existing = ownerCounts.get(oid);
          if (existing) {
            existing.count += 1;
          } else {
            ownerCounts.set(oid, {
              ownerId: oid,
              ownerName: b.placedBy || oid,
              count: 1,
            });
          }
        }

        return this.jsonResponse({
          backupVersion: 1,
          exportedAt: new Date().toISOString(),
          projectId: this.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw',
          roomName: this.roomName,
          officialResetEpoch: this.officialResetEpoch,
          officialResetExecutedAt: this.officialResetExecutedAt,
          buildingCount: this.placedBuildings.length,
          uniqueOwnerCount: ownerCounts.size,
          ownerSummary: Array.from(ownerCounts.values()),
          placedBuildings: this.placedBuildings,
        });
      }

      if (url.pathname === '/api/admin/restore-world' && request.method === 'POST') {
        const authCheck = await this.verifyAdminRequest(request, 'write');
        if (!authCheck.ok) return authCheck.response;

        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return this.jsonResponse({ ok: false, error: 'Invalid JSON request body.' }, 400);
        }

        if (!body || !Array.isArray(body.placedBuildings)) {
          return this.jsonResponse({ ok: false, error: 'Backup payload must include placedBuildings array.' }, 400);
        }

        const sanitized: PlacedBuilding[] = [];
        for (const item of body.placedBuildings) {
          if (
            !item ||
            typeof item.id !== 'string' ||
            typeof item.type !== 'string' ||
            typeof item.tileX !== 'number' ||
            typeof item.tileY !== 'number' ||
            !Number.isFinite(item.tileX) ||
            !Number.isFinite(item.tileY)
          ) {
            return this.jsonResponse({ ok: false, error: 'Invalid building entry detected in backup JSON.' }, 400);
          }
          sanitized.push(item as PlacedBuilding);
        }

        this.placedBuildings = sanitized;
        await this.state.storage.put('placedBuildings', this.placedBuildings);

        for (const b of this.placedBuildings) {
          this.broadcast({
            type: 's:building_placed',
            payload: { building: b },
          });
        }

        return this.jsonResponse({
          ok: true,
          restoredCount: this.placedBuildings.length,
        });
      }

      if (url.pathname === '/api/admin/official-reset' && request.method === 'POST') {
        const authCheck = await this.verifyAdminRequest(request, 'write');
        if (!authCheck.ok) return authCheck.response;

        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return this.jsonResponse({ ok: false, error: 'Invalid JSON request body.' }, 400);
        }

        if (!body || body.confirmText !== 'RESET') {
          return this.jsonResponse(
            { ok: false, error: 'Confirmation failed: confirmText must equal "RESET".' },
            400
          );
        }

        if (body.backupVerified !== true) {
          return this.jsonResponse(
            { ok: false, error: 'Backup verification required before running Official Reset.' },
            400
          );
        }

        if (this.officialResetEpoch && body.forceNewEpoch !== true) {
          return this.jsonResponse({
            ok: true,
            alreadyReset: true,
            epoch: this.officialResetEpoch,
            executedAt: this.officialResetExecutedAt,
            clearedBuildingsCount: 0,
          });
        }

        const clearedBuildingsCount = this.placedBuildings.length;
        const epoch = `official_launch_${Date.now()}`;
        const executedAt = new Date().toISOString();

        this.placedBuildings = [];
        this.officialResetEpoch = epoch;
        this.officialResetExecutedAt = executedAt;

        await this.state.storage.put('placedBuildings', this.placedBuildings);
        await this.state.storage.put('officialResetEpoch', epoch);
        await this.state.storage.put('officialResetExecutedAt', executedAt);

        this.broadcast({
          type: 's:official_reset',
          payload: {
            epoch,
            message: 'Random City Official Launch Reset ပြီးစီးပါပြီ။ အစကနေ ပြန်လည်စတင်ပါမည်။',
          },
        });

        return this.jsonResponse({
          ok: true,
          alreadyReset: false,
          epoch,
          executedAt,
          clearedBuildingsCount,
        });
      }

      return this.jsonResponse({ ok: false, error: 'API endpoint not found.' }, 404);
    }

    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Check player limit
    if (this.players.size >= this.maxPlayers) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      const fullMsg: ServerMessage = {
        type: 's:room_full',
        payload: {
          message: 'The Random City world room is currently full (10/10 players). Please try again shortly.',
          maxPlayers: this.maxPlayers,
        },
      };
      server.send(JSON.stringify(fullMsg));
      server.close(1008, 'Room is full');
      return new Response(null, { status: 101, webSocket: client } as any);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as any);
  }

  private handleSession(ws: any): void {
    ws.accept();

    ws.addEventListener('message', async (event: MessageEvent) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
        const msg = JSON.parse(raw) as ClientMessage;
        await this.handleClientMessage(ws, msg);
      } catch (err: any) {
        console.error('Error handling WebSocket message in DO:', err);
        recordServerError(this.recentErrors, 'ws_message', err?.message || String(err));
      }
    });

    ws.addEventListener('close', () => {
      this.handleClientDisconnect(ws);
    });

    ws.addEventListener('error', () => {
      this.handleClientDisconnect(ws);
    });
  }

  private async handleClientMessage(ws: any, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'c:auth_join': {
        const { idToken, profile } = msg.payload;

        // Cryptographically verify Firebase ID token using Google JWKS
        const projectId = this.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw';
        const verifyFn = this.testHooks?.tokenVerifier || verifyFirebaseIdToken;
        const authResult = await verifyFn(idToken, projectId);

        if (!authResult.valid || !authResult.claims) {
          const errorReason = authResult.error || 'Authentication failed: Invalid or expired Firebase ID token.';
          ws.send(JSON.stringify({
            type: 's:auth_error',
            payload: { message: errorReason },
          }));
          ws.send(JSON.stringify({
            type: 's:error',
            payload: { code: 'AUTH_FAILED', message: errorReason },
          }));
          ws.close(1008, 'Authentication failed');
          return;
        }

        // CRITICAL: Strictly use verified UID from Google
        const verifiedUid = authResult.claims.uid;
        const stagingGate = checkStagingAccess({
          env: this.env as unknown as Record<string, unknown>,
          uid: verifiedUid,
          email: authResult.claims.email,
          emailVerified: authResult.claims.email_verified,
        });
        if (!stagingGate.allowed) {
          ws.send(
            JSON.stringify({
              type: 's:auth_error',
              payload: { message: stagingGate.error || 'Staging access denied.' },
            })
          );
          ws.send(
            JSON.stringify({
              type: 's:error',
              payload: {
                code: stagingGate.code || 'STAGING_ACCOUNT_NOT_ALLOWED',
                message: stagingGate.error || 'Staging access denied.',
              },
            })
          );
          ws.close(4003, stagingGate.code || 'Staging access denied');
          return;
        }

        const isOwnerUser = isVerifiedOwnerClaims(authResult.claims);
        const playerName = (profile?.name || authResult.claims.name || 'Settler').slice(0, 16);

        // Enforce server-side ban check (Owner can never be locked out)
        const banRecord = !isOwnerUser ? this.bannedUsers.get(verifiedUid) : undefined;
        if (banRecord) {
          ws.send(JSON.stringify({
            type: 's:banned',
            payload: {
              reason: banRecord.reason,
              bannedAt: banRecord.bannedAt,
            },
          }));
          ws.send(JSON.stringify({
            type: 's:auth_error',
            payload: { message: `သင့်အကောင့်ကို Admin မှ ပိတ်ပင်ထားပါသည် (${banRecord.reason})` },
          }));
          ws.close(4003, 'Banned by owner');
          return;
        }

        // Verify player capacity limit (allow reconnecting player already in room)
        if (!this.players.has(verifiedUid) && this.players.size >= this.maxPlayers) {
          const fullMsg: ServerMessage = {
            type: 's:room_full',
            payload: {
              message: 'Room capacity reached (10/10).',
              maxPlayers: this.maxPlayers,
            },
          };
          ws.send(JSON.stringify(fullMsg));
          ws.close(1008, 'Room full');
          return;
        }

        // Seed authoritative Gold, Inventory, and Clothing ledgers via verified Firestore REST read ONLY if not yet verified.
        // Never trust client-supplied `profile.coins`. Existing DO state remains 100% preserved.
        if (
          !this.farmLedger.isGoldVerified(verifiedUid) ||
          !this.farmLedger.isInventoryVerified(verifiedUid) ||
          !this.farmLedger.isClothingVerified(verifiedUid)
        ) {
          const seedRes = await fetchVerifiedFirestorePlayerEconomy({
            uid: verifiedUid,
            idToken,
            projectId,
            databaseId: this.env.FIREBASE_DATABASE_ID,
            fetchImpl: this.testHooks?.fetchImpl,
          });
          const seeded = this.farmLedger.seedAuthoritativeEconomy(
            verifiedUid,
            {
              gold: seedRes.gold,
              inventorySlots: seedRes.inventorySlots,
              ownedClothing: seedRes.ownedClothing,
            },
            seedRes.ok
          );
          if (seeded.seededGold || seeded.seededInventory || seeded.seededClothing) {
            void this.persistEconomyStorage();
          }
        }

        // Disconnect previous session of the same player if exists
        this.releasePlayerBenchSeat(verifiedUid, true);
        for (const [s, pid] of this.sockets.entries()) {
          if (pid === verifiedUid && s !== ws) {
            try {
              s.close(1000, 'Replaced by new session');
            } catch (e) {}
            this.sockets.delete(s);
          }
        }

        const gender = profile?.gender === 'female' ? 'female' : 'male';
        const equippedClothing = ClothingSystem.normalizeEquippedClothing(
          profile?.equippedClothing,
          undefined,
          gender
        );
        const rawDir = profile?.facingDirection;
        const facingDirection: 'down' | 'left' | 'right' | 'up' =
          rawDir === 'up' || rawDir === 'left' || rawDir === 'right' || rawDir === 'down'
            ? rawDir
            : 'down';
        const newPlayer: PlayerPresenceState = {
          playerId: verifiedUid,
          playerName,
          gender,
          positionX: Math.max(0, Math.min(119, profile?.positionX ?? 30)),
          positionY: Math.max(0, Math.min(119, profile?.positionY ?? 30)),
          facingDirection,
          movementState: 'idle',
          equippedClothing,
          color: gender === 'female' ? '#10b981' : '#3b82f6',
          lastUpdate: Date.now(),
        };

        this.players.set(verifiedUid, newPlayer);
        this.sockets.set(ws, verifiedUid);

        const knownChanged = upsertKnownPlayerRecord(this.knownPlayers, {
          uid: verifiedUid,
          playerName,
          gender,
          lastSeenAt: Date.now(),
          isOwner: isOwnerUser,
        });
        if (knownChanged) {
          void this.persistKnownPlayers();
        }

        // 1. Send full authoritative room sync to this joined player (including authoritative Gold balance)
        const syncState: WorldSyncState = {
          roomName: this.roomName,
          maxPlayers: this.maxPlayers,
          playerCount: this.players.size,
          players: Object.fromEntries(this.players),
          depletedResources: Object.fromEntries(this.depletedResources),
          placedBuildings: [...this.placedBuildings],
          farmPlotOwners: this.farmLedger.serializeOwners(),
          goldBalance: this.farmLedger.getPlayerGold(verifiedUid),
          goldLedgerVerified: this.farmLedger.isGoldVerified(verifiedUid),
          inventorySlots: this.farmLedger.getPlayerInventory(verifiedUid),
          inventoryVerified: this.farmLedger.isInventoryVerified(verifiedUid),
          ownedClothing: this.farmLedger.getPlayerOwnedClothing(verifiedUid),
          benchSeats: this.serializeBenchSeats(),
          recentChat: this.chatHistory.slice(-20),
          officialResetEpoch: this.officialResetEpoch,
          activeAnnouncement: this.activeAnnouncement,
        };

        const stateMsg: ServerMessage = {
          type: 's:room_state',
          payload: syncState,
        };
        ws.send(JSON.stringify(stateMsg));

        // 2. Broadcast player_joined to everyone else
        const joinMsg: ServerMessage = {
          type: 's:player_joined',
          payload: {
            player: newPlayer,
            playerCount: this.players.size,
          },
        };
        this.broadcast(joinMsg, ws);
        break;
      }

      case 'c:player_move': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;

        const player = this.players.get(playerId);
        if (!player) return;

        // Validate movement bounds (120x120 map: 0..119)
        const targetX = Math.max(0, Math.min(119, msg.payload.x));
        const targetY = Math.max(0, Math.min(119, msg.payload.y));
        const action = msg.payload.action || 'idle';
        const actionTool = action === 'gathering' ? msg.payload.actionTool : undefined;

        player.positionX = targetX;
        player.positionY = targetY;
        player.facingDirection = msg.payload.direction;
        player.movementState = action === 'fishing' ? 'fishing' : msg.payload.isMoving ? 'walking' : 'idle';
        player.animationState = action === 'fishing' ? 'fishing' : action === 'gathering' ? 'gathering' : action === 'building' ? 'building' : 'none';
        player.actionTool = actionTool;
        player.lastUpdate = Date.now();

        if (player.seatedBenchId) {
          const bench = getLakesideBenchById(player.seatedBenchId);
          if (
            msg.payload.isMoving ||
            !bench ||
            Math.hypot(targetX - bench.tileX, targetY - bench.tileY) > 1.8
          ) {
            this.releasePlayerBenchSeat(playerId, true);
          }
        }

        // Broadcast move update to other clients
        const moveMsg: ServerMessage = {
          type: 's:player_moved',
          payload: {
            playerId,
            x: targetX,
            y: targetY,
            direction: msg.payload.direction,
            isMoving: msg.payload.isMoving,
            action,
            actionTool,
          },
        };
        this.broadcast(moveMsg, ws);
        break;
      }

      case 'c:outfit_update': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;

        const player = this.players.get(playerId);
        if (!player) return;

        const cleanOutfit = ClothingSystem.normalizeEquippedClothing(
          msg.payload?.equippedClothing,
          undefined,
          player.gender
        );
        player.equippedClothing = cleanOutfit;
        player.lastUpdate = Date.now();

        const outfitMsg: ServerMessage = {
          type: 's:player_outfit',
          payload: {
            playerId,
            equippedClothing: cleanOutfit,
          },
        };
        this.broadcast(outfitMsg, ws);
        break;
      }

      case 'c:gather_request': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;

        const nodeId = typeof msg.payload?.nodeId === 'string' ? msg.payload.nodeId.trim() : '';
        if (!nodeId) return;
        const node = this.serverResources.nodes.find((n) => n.id === nodeId);
        if (!node || node.type === 'lake_fish') return;

        const rate = this.rateLimiter.check(`gather:${playerId}`, 60, 60000);
        if (!rate.allowed) {
          ws.send(
            JSON.stringify({
              type: 's:inventory_sync',
              payload: {
                ok: false,
                inventorySlots: this.farmLedger.getPlayerInventory(playerId),
                code: 'RATE_LIMITED',
                reason: 'သယံဇာတ စုဆောင်းမှု မြန်ဆန်လွန်းနေပါသည် (ခဏစောင့်ပါ)',
              },
            })
          );
          return;
        }

        const gatherRes = await this.farmLedger.gatherResourceAtomic({
          uid: playerId,
          nodeId,
          yieldItem: node.yieldItem,
          yieldAmount: node.yieldAmount,
          respawnDurationMs: node.respawnTimeSeconds * 1000,
          depletedResources: this.depletedResources,
          persist: async (economy) => {
            await this.state.storage.put('playerInventories', economy.inventories);
          },
        });

        ws.send(
          JSON.stringify({
            type: 's:inventory_sync',
            payload: {
              ok: gatherRes.ok,
              inventorySlots: gatherRes.inventorySlots,
              code: gatherRes.code,
              reason: gatherRes.reason,
            },
          })
        );

        if (gatherRes.ok && gatherRes.respawnAt) {
          const harvestMsg: ServerMessage = {
            type: 's:resource_harvested',
            payload: {
              nodeId,
              respawnAt: gatherRes.respawnAt,
              harvestedBy: playerId,
            },
          };
          this.broadcast(harvestMsg);
        }
        break;
      }

      case 'c:fishing_start': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;
        const rate = this.rateLimiter.check(`fishing_start:${playerId}`, 30, 60000);
        if (!rate.allowed) {
          ws.send(
            JSON.stringify({
              type: 's:fishing_result',
              payload: {
                ok: false,
                sessionId: typeof msg.payload?.sessionId === 'string' ? msg.payload.sessionId : undefined,
                nodeId: typeof msg.payload?.nodeId === 'string' ? msg.payload.nodeId : '',
                caught: false,
                itemId: 'fish',
                quantity: 0,
                code: 'RATE_LIMITED',
                reason: 'ငါးမျှားတောင်းဆိုမှု များပြားနေပါသည် (ခဏစောင့်ပါ)',
              },
            })
          );
          return;
        }
        const res = this.fishingTracker.startCast({
          playerId,
          nodeId: msg.payload?.nodeId,
          sessionId: msg.payload?.sessionId,
          depletedResources: this.depletedResources,
        });
        if (!res.ok) {
          ws.send(
            JSON.stringify({
              type: 's:fishing_result',
              payload: {
                ok: false,
                sessionId: typeof msg.payload?.sessionId === 'string' ? msg.payload.sessionId : undefined,
                nodeId: typeof msg.payload?.nodeId === 'string' ? msg.payload.nodeId : '',
                caught: false,
                itemId: 'fish',
                quantity: 0,
                code: res.code,
                reason: res.reason,
              },
            })
          );
        }
        break;
      }

      case 'c:fishing_catch': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;
        const rate = this.rateLimiter.check(`fishing_catch:${playerId}`, 30, 60000);
        if (!rate.allowed) {
          ws.send(
            JSON.stringify({
              type: 's:fishing_result',
              payload: {
                ok: false,
                sessionId: typeof msg.payload?.sessionId === 'string' ? msg.payload.sessionId : undefined,
                nodeId: typeof msg.payload?.nodeId === 'string' ? msg.payload.nodeId : '',
                caught: false,
                itemId: 'fish',
                quantity: 0,
                inventorySlots: this.farmLedger.getPlayerInventory(playerId),
                code: 'RATE_LIMITED',
                reason: 'ငါးမျှားတောင်းဆိုမှု များပြားနေပါသည် (ခဏစောင့်ပါ)',
              },
            })
          );
          return;
        }
        const claim = await this.farmLedger.claimFishingCatchAtomic({
          uid: playerId,
          nodeId: typeof msg.payload?.nodeId === 'string' ? msg.payload.nodeId : '',
          sessionId: typeof msg.payload?.sessionId === 'string' ? msg.payload.sessionId : '',
          inSuccessZone: Boolean(msg.payload?.inSuccessZone),
          fishingTracker: this.fishingTracker,
          depletedResources: this.depletedResources,
          persist: async (economy) => {
            await this.state.storage.put('playerInventories', economy.inventories);
          },
        });
        ws.send(
          JSON.stringify({
            type: 's:fishing_result',
            payload: claim,
          })
        );
        if (claim.ok && claim.caught && claim.respawnAt) {
          this.broadcast({
            type: 's:resource_harvested',
            payload: {
              nodeId: claim.nodeId,
              respawnAt: claim.respawnAt,
              harvestedBy: playerId,
            },
          });
        }
        break;
      }

      case 'c:build_request': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;

        const { building, useRawFenceMaterials } = msg.payload || ({} as any);
        if (!building || typeof building.id !== 'string') return;

        const player = this.players.get(playerId);
        const existingIdx = this.placedBuildings.findIndex((b) => b.id === building.id);
        const isMove = existingIdx !== -1;
        const prevBuilding = isMove ? this.placedBuildings[existingIdx] : undefined;
        const sanitizedBuilding: PlacedBuilding = {
          ...building,
          tileX: Math.round(building.tileX),
          tileY: Math.round(building.tileY),
          ownerId: playerId,
          placedBy: building.placedBy || player?.playerName || playerId,
          rotation: building.type === 'fence_wood' ? normalizeFenceRotation(building.rotation) : 0,
          storage:
            building.type === 'storage_box'
              ? isMove
                ? normalizeStorageSlots(prevBuilding?.storage || [])
                : []
              : undefined,
        };
        const fp = getAuthoritativeFootprint(sanitizedBuilding.type);
        sanitizedBuilding.width = fp.width;
        sanitizedBuilding.height = fp.height;

        const validation = validateServerOrClientBuild(
          this.placedBuildings,
          sanitizedBuilding,
          playerId,
          this.serverMap,
          {
            excludeBuildingId: isMove ? building.id : undefined,
            farmPlotOwners: this.farmLedger.serializeOwners(),
          }
        );

        if (!validation.allowed) {
          const rejectMsg: ServerMessage = {
            type: 's:build_rejected',
            payload: {
              buildingId: building.id,
              code: validation.code || 'BUILD_REJECTED',
              message: validation.reason || 'ဤနေရာတွင် ဆောက်လုပ်ခွင့်မရှိပါ',
              isMove,
              prevBuilding,
              inventorySlots: this.farmLedger.getPlayerInventory(playerId),
            },
          };
          ws.send(JSON.stringify(rejectMsg));
          ws.send(
            JSON.stringify({
              type: 's:error',
              payload: {
                code: validation.code || 'BUILD_REJECTED',
                message: validation.reason || 'ဤနေရာတွင် ဆောက်လုပ်ခွင့်မရှိပါ',
              },
            })
          );
          return;
        }

        const commitRes = await this.farmLedger.commitBuildWithWorldAtomic({
          uid: playerId,
          buildingType: sanitizedBuilding.type,
          isMove,
          useRawFenceMaterials: Boolean(useRawFenceMaterials),
          commitWorld: () => {
            if (isMove) {
              this.placedBuildings[existingIdx] = sanitizedBuilding;
            } else {
              this.placedBuildings.push(sanitizedBuilding);
            }
          },
          rollbackWorld: () => {
            if (isMove && prevBuilding) {
              this.placedBuildings[existingIdx] = prevBuilding;
            } else if (!isMove) {
              const rmIdx = this.placedBuildings.findIndex((b) => b.id === sanitizedBuilding.id);
              if (rmIdx !== -1) this.placedBuildings.splice(rmIdx, 1);
            }
          },
          persist: async (economy) => {
            await Promise.all([
              this.state.storage.put('placedBuildings', this.placedBuildings),
              this.state.storage.put('playerInventories', economy.inventories),
            ]);
          },
        });

        if (!commitRes.ok) {
          ws.send(
            JSON.stringify({
              type: 's:build_rejected',
              payload: {
                buildingId: building.id,
                code: commitRes.code || 'BUILD_REJECTED',
                message: commitRes.reason || 'ဆောက်လုပ်၍မရပါ',
                isMove,
                prevBuilding,
                inventorySlots: commitRes.inventorySlots,
              },
            })
          );
          ws.send(
            JSON.stringify({
              type: 's:error',
              payload: {
                code: commitRes.code || 'BUILD_REJECTED',
                message: commitRes.reason || 'ဆောက်လုပ်၍မရပါ',
              },
            })
          );
          return;
        }

        if (!isMove) {
          ws.send(
            JSON.stringify({
              type: 's:inventory_sync',
              payload: {
                ok: true,
                inventorySlots: commitRes.inventorySlots,
              },
            })
          );
        }

        // Broadcast to ALL players
        const buildMsg: ServerMessage = {
          type: 's:building_placed',
          payload: {
            building: sanitizedBuilding,
          },
        };
        this.broadcast(buildMsg);
        break;
      }

      case 'c:dismantle_request': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;

        const { buildingId } = msg.payload;
        const check = validateDismantleAction(
          this.placedBuildings,
          buildingId,
          playerId,
          this.farmLedger.serializeOwners()
        );
        if (!check.allowed) {
          const target = this.placedBuildings.find((b) => b.id === buildingId);
          ws.send(
            JSON.stringify({
              type: 's:dismantle_rejected',
              payload: {
                buildingId,
                code: check.code || 'FORBIDDEN',
                message: check.reason || 'You can only dismantle your own structures.',
                building: target,
                inventorySlots: this.farmLedger.getPlayerInventory(playerId),
              },
            })
          );
          ws.send(
            JSON.stringify({
              type: 's:error',
              payload: {
                code: check.code || 'FORBIDDEN',
                message: check.reason || 'You can only dismantle your own structures.',
              },
            })
          );
          return;
        }

        const idx = this.placedBuildings.findIndex((b) => b.id === buildingId);
        if (idx === -1) return;
        const target = this.placedBuildings[idx];

        const dismantleRes = await this.farmLedger.commitDismantleWithWorldAtomic({
          uid: playerId,
          buildingType: target.type,
          commitWorld: () => {
            const currentIdx = this.placedBuildings.findIndex((b) => b.id === buildingId);
            if (currentIdx !== -1) this.placedBuildings.splice(currentIdx, 1);
          },
          rollbackWorld: () => {
            if (!this.placedBuildings.some((b) => b.id === buildingId)) {
              this.placedBuildings.splice(Math.min(idx, this.placedBuildings.length), 0, target);
            }
          },
          persist: async (economy) => {
            await Promise.all([
              this.state.storage.put('placedBuildings', this.placedBuildings),
              this.state.storage.put('playerInventories', economy.inventories),
            ]);
          },
        });

        if (!dismantleRes.ok) {
          ws.send(
            JSON.stringify({
              type: 's:dismantle_rejected',
              payload: {
                buildingId,
                code: dismantleRes.code || 'DISMANTLE_REJECTED',
                message: dismantleRes.reason || 'ဖျက်သိမ်း၍မရပါ',
                building: target,
                inventorySlots: dismantleRes.inventorySlots,
              },
            })
          );
          ws.send(
            JSON.stringify({
              type: 's:error',
              payload: {
                code: dismantleRes.code || 'DISMANTLE_REJECTED',
                message: dismantleRes.reason || 'ဖျက်သိမ်း၍မရပါ',
              },
            })
          );
          return;
        }

        ws.send(
          JSON.stringify({
            type: 's:inventory_sync',
            payload: {
              ok: true,
              inventorySlots: dismantleRes.inventorySlots,
            },
          })
        );

        const dismantleMsg: ServerMessage = {
          type: 's:building_dismantled',
          payload: {
            buildingId,
          },
        };
        this.broadcast(dismantleMsg);
        break;
      }

      case 'c:craft_request': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;
        const rate = this.rateLimiter.check(`craft:${playerId}`, 30, 60000);
        if (!rate.allowed) {
          ws.send(
            JSON.stringify({
              type: 's:craft_result',
              payload: {
                ok: false,
                txId: typeof msg.payload?.txId === 'string' ? msg.payload.txId : undefined,
                recipeId: typeof msg.payload?.recipeId === 'string' ? msg.payload.recipeId : '',
                inventorySlots: this.farmLedger.getPlayerInventory(playerId),
                code: 'RATE_LIMITED',
                reason: 'ဖန်တီးမှု တောင်းဆိုမှု များပြားနေပါသည် (ခဏစောင့်ပါ)',
              },
            })
          );
          return;
        }
        const craftRes = await this.farmLedger.craftRecipeAtomic({
          uid: playerId,
          recipeId: msg.payload?.recipeId,
          txId: msg.payload?.txId,
          persist: async (economy) => {
            await this.state.storage.put('playerInventories', economy.inventories);
          },
        });
        ws.send(
          JSON.stringify({
            type: 's:craft_result',
            payload: craftRes,
          })
        );
        break;
      }

      case 'c:storage_transfer': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;
        const rate = this.rateLimiter.check(`storage:${playerId}`, 45, 60000);
        if (!rate.allowed) {
          ws.send(
            JSON.stringify({
              type: 's:storage_transfer_result',
              payload: {
                ok: false,
                txId: typeof msg.payload?.txId === 'string' ? msg.payload.txId : undefined,
                buildingId: typeof msg.payload?.buildingId === 'string' ? msg.payload.buildingId : '',
                direction: msg.payload?.direction === 'withdraw' ? 'withdraw' : 'deposit',
                itemId: typeof msg.payload?.itemId === 'string' ? msg.payload.itemId : '',
                quantity: 0,
                inventorySlots: this.farmLedger.getPlayerInventory(playerId),
                code: 'RATE_LIMITED',
                reason: 'သေတ္တာအသုံးပြုမှု မြန်ဆန်လွန်းနေပါသည် (ခဏစောင့်ပါ)',
              },
            })
          );
          return;
        }
        const targetBox = this.placedBuildings.find((b) => b.id === msg.payload?.buildingId);
        const transferRes = await this.farmLedger.transferStorageBoxAtomic({
          uid: playerId,
          txId: msg.payload?.txId,
          building: targetBox,
          direction: msg.payload?.direction,
          itemId: msg.payload?.itemId,
          quantity: msg.payload?.quantity,
          persist: async (economy) => {
            await Promise.all([
              this.state.storage.put('placedBuildings', this.placedBuildings),
              this.state.storage.put('playerInventories', economy.inventories),
            ]);
          },
        });
        ws.send(
          JSON.stringify({
            type: 's:storage_transfer_result',
            payload: transferRes,
          })
        );
        break;
      }

      case 'c:shop_trade': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;
        const rate = this.rateLimiter.check(`shop_trade:${playerId}`, 45, 60000);
        if (!rate.allowed) {
          ws.send(
            JSON.stringify({
              type: 's:shop_trade_result',
              payload: {
                ok: false,
                txId: typeof msg.payload?.txId === 'string' ? msg.payload.txId : undefined,
                action: msg.payload?.action,
                itemId: msg.payload?.itemId,
                quantity: typeof msg.payload?.quantity === 'number' ? msg.payload.quantity : undefined,
                balance: this.farmLedger.getPlayerGold(playerId),
                inventorySlots: this.farmLedger.getPlayerInventory(playerId),
                ownedClothing: this.farmLedger.getPlayerOwnedClothing(playerId),
                code: 'RATE_LIMITED',
                reason: 'အရောင်းအဝယ် တောင်းဆိုမှု များပြားနေပါသည် (ခဏစောင့်ပါ)',
              },
            })
          );
          return;
        }
        const trade = await this.farmLedger.applyVerifiedShopTradeAtomic({
          uid: playerId,
          payload: msg.payload || {},
          persist: async (economy) => {
            await this.persistEconomyStorage(economy);
          },
        });
        ws.send(
          JSON.stringify({
            type: 's:shop_trade_result',
            payload: {
              ok: trade.ok,
              txId: trade.txId,
              action: trade.action,
              itemId: trade.itemId,
              quantity: trade.quantity,
              balance: trade.balance,
              inventorySlots: trade.inventorySlots,
              ownedClothing: trade.ownedClothing,
              reason: trade.reason,
              code: trade.code,
              deduplicated: trade.deduplicated,
            },
          })
        );
        break;
      }

      case 'c:buy_farm_plot': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;
        const rate = this.rateLimiter.check(`buy_farm_plot:${playerId}`, 12, 60000);
        if (!rate.allowed) {
          ws.send(
            JSON.stringify({
              type: 's:farm_plot_purchase_result',
              payload: {
                ok: false,
                plotId: typeof msg.payload?.plotId === 'string' ? msg.payload.plotId : '',
                code: 'PURCHASE_IN_PROGRESS',
                message: 'ဝယ်ယူမှု တောင်းဆိုမှု များပြားနေပါသည် (ခဏစောင့်ပါ)',
                remainingGold: this.farmLedger.getPlayerGold(playerId),
              },
            })
          );
          return;
        }
        const player = this.players.get(playerId);
        const result = await this.farmLedger.purchasePlotAtomic({
          plotId: msg.payload?.plotId,
          buyerUid: playerId,
          buyerName: player?.playerName || 'Settler',
          persist: async (owners, goldBalances) => {
            await Promise.all([
              this.state.storage.put('farmPlotOwners', owners),
              this.state.storage.put('playerGoldBalances', goldBalances),
            ]);
          },
        });
        ws.send(
          JSON.stringify({
            type: 's:farm_plot_purchase_result',
            payload: result,
          })
        );
        if (result.ok && result.owner) {
          this.broadcast({
            type: 's:farm_plot_updated',
            payload: {
              plotId: result.plotId,
              owner: result.owner,
              farmPlotOwners: this.farmLedger.serializeOwners(),
            },
          });
        }
        break;
      }

      case 'c:bench_sit': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;
        const player = this.players.get(playerId);
        if (!player) return;

        const bench = getLakesideBenchById(msg.payload?.benchId);
        if (!bench) {
          ws.send(
            JSON.stringify({
              type: 's:error',
              payload: { code: 'BENCH_NOT_FOUND', message: 'ထိုင်ခုံတည်နေရာ မတွေ့ရှိပါ' },
            })
          );
          return;
        }

        if (Math.hypot(player.positionX - bench.tileX, player.positionY - bench.tileY) > 3.6) {
          ws.send(
            JSON.stringify({
              type: 's:error',
              payload: { code: 'BENCH_TOO_FAR', message: 'ထိုင်ခုံနှင့် အနီးကပ်သွားပြီးမှ ထိုင်ပါ' },
            })
          );
          return;
        }

        this.releasePlayerBenchSeat(playerId, false);
        const seats = this.getOrInitBenchPair(bench.id);
        const preferred = msg.payload?.seatIndex;
        let chosen: 0 | 1 | null = null;
        if (preferred === 0 || preferred === 1) {
          if (seats[preferred] === null || seats[preferred] === playerId) {
            chosen = preferred;
          }
        }
        if (chosen === null) {
          if (seats[0] === null || seats[0] === playerId) chosen = 0;
          else if (seats[1] === null || seats[1] === playerId) chosen = 1;
        }

        if (chosen === null) {
          ws.send(
            JSON.stringify({
              type: 's:error',
              payload: { code: 'BENCH_FULL', message: 'ဤ ၂ ဦးထိုင်ခုံတွင် နေရာအားလုံး ပြည့်နေပါပြီ' },
            })
          );
          return;
        }

        seats[chosen] = playerId;
        player.seatedBenchId = bench.id;
        player.seatedSeatIndex = chosen;
        player.facingDirection = bench.facing;
        player.movementState = 'idle';
        player.animationState = 'none';
        player.lastUpdate = Date.now();

        this.broadcast({
          type: 's:bench_state',
          payload: { benchSeats: this.serializeBenchSeats() },
        });
        break;
      }

      case 'c:bench_stand': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;
        this.releasePlayerBenchSeat(playerId, true);
        break;
      }

      case 'c:chat': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;
        const player = this.players.get(playerId);
        if (!player) return;

        const text = msg.payload.text?.trim().slice(0, 120);
        if (!text) return;

        const chatMsg: ChatMessage = {
          id: `chat_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          senderId: playerId,
          senderName: player.playerName,
          text,
          timestamp: Date.now(),
        };

        this.chatHistory.push(chatMsg);
        if (this.chatHistory.length > 50) this.chatHistory.shift();

        this.broadcast({
          type: 's:chat',
          payload: chatMsg,
        });
        break;
      }
    }
  }

  private getOrInitBenchPair(benchId: string): [string | null, string | null] {
    let pair = this.benchSeats.get(benchId);
    if (!pair) {
      pair = [null, null];
      this.benchSeats.set(benchId, pair);
    }
    return pair;
  }

  private serializeBenchSeats(): Record<string, [string | null, string | null]> {
    const out: Record<string, [string | null, string | null]> = {};
    for (const b of LAKESIDE_DOUBLE_BENCHES) {
      const pair = this.benchSeats.get(b.id);
      out[b.id] = pair ? [pair[0], pair[1]] : [null, null];
    }
    return out;
  }

  private releasePlayerBenchSeat(playerId: string, broadcastUpdate: boolean): boolean {
    let changed = false;
    for (const pair of this.benchSeats.values()) {
      if (pair[0] === playerId) {
        pair[0] = null;
        changed = true;
      }
      if (pair[1] === playerId) {
        pair[1] = null;
        changed = true;
      }
    }
    const player = this.players.get(playerId);
    if (player && (player.seatedBenchId || player.seatedSeatIndex !== undefined)) {
      player.seatedBenchId = undefined;
      player.seatedSeatIndex = undefined;
      changed = true;
    }
    if (changed && broadcastUpdate) {
      this.broadcast({
        type: 's:bench_state',
        payload: { benchSeats: this.serializeBenchSeats() },
      });
    }
    return changed;
  }

  private handleClientDisconnect(ws: any): void {
    const playerId = this.sockets.get(ws);
    if (!playerId) return;

    this.sockets.delete(ws);
    this.fishingTracker.clearPlayer(playerId);
    this.releasePlayerBenchSeat(playerId, true);
    this.players.delete(playerId);

    const leaveMsg: ServerMessage = {
      type: 's:player_left',
      payload: {
        playerId,
        playerCount: this.players.size,
      },
    };
    this.broadcast(leaveMsg);
  }

  private checkResourceRespawns(): void {
    const now = Date.now();
    for (const [nodeId, respawnAt] of this.depletedResources.entries()) {
      if (respawnAt <= now) {
        this.depletedResources.delete(nodeId);
        this.broadcast({
          type: 's:resource_respawned',
          payload: { nodeId },
        });
      }
    }
  }

  private broadcast(message: ServerMessage, excludeWs?: any): void {
    const payload = JSON.stringify(message);
    for (const [socket] of this.sockets.entries()) {
      if (socket !== excludeWs) {
        try {
          socket.send(payload);
        } catch (e) {
          // Socket might have closed
        }
      }
    }
  }
}
