/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import {
  ActiveAnnouncement,
  ClientMessage,
  PlayerPresenceState,
  ServerMessage,
  WorldSyncState,
  ChatMessage,
} from './src/game/multiplayer/types';
import { PlacedBuilding } from './src/game/types';
import { ClothingSystem } from './src/game/systems/ClothingSystem';
import { LAKESIDE_DOUBLE_BENCHES, getLakesideBenchById } from './src/game/data/LakesideBenches';
import { normalizeFenceRotation } from './src/game/systems/FenceTopology';
import {
  createAuthoritativeServerMap,
  getAuthoritativeFootprint,
  validateDismantleAction,
  validateServerOrClientBuild,
} from './src/game/systems/LandOwnershipSystem';
import { verifyFirebaseIdToken } from './server/auth/tokenVerifier';
import {
  fetchVerifiedFirestorePlayerEconomy,
  VerifiedGoldSeedResult,
  VerifiedPlayerEconomySeedResult,
} from './server/farm/firestoreGoldSync';
import { EconomyPersistPayload, FarmPlotServerLedger } from './server/farm/farmPlotService';
import {
  FirestorePlayerSaveDocs,
  FirestoreSaveWriterResult,
  buildAuthenticatedSaveCorsHeaders,
  commitPlayerAndWorldStateToFirestore,
} from './server/firebase/firestoreServerSave';
import {
  DOStorageAdapter,
  PlayerSaveFoundationService,
  SaveCutoverMode,
  buildHydratedClientBundleFromDO,
  resolveSaveCutoverMode,
  validateAuthenticatedUidAccess,
} from './server/save/playerSaveFoundation';
import { FishingSessionTracker } from './server/fishing/fishingService';
import { ResourceSystem } from './src/game/systems/ResourceSystem';
import { createStarterInventorySlots, normalizeStorageSlots } from './server/economy/inventoryAuthority';
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
} from './server/admin/adminService';

dotenv.config();

function resolvePort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    } else if (args[i].startsWith('--port=')) {
      const parsed = parseInt(args[i].slice('--port='.length), 10);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  const envPort = process.env.PORT;
  const nginxPort = process.env.NGINX_PORT;
  if (envPort && (!nginxPort || envPort !== nginxPort)) {
    const parsed = parseInt(envPort, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  if (process.env.DEFAULT_APP_PORT) {
    const parsed = parseInt(process.env.DEFAULT_APP_PORT, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  return 3000;
}

const isProduction = process.env.NODE_ENV === 'production';
const PORT = resolvePort();

export async function createServer(options?: {
  port?: number;
  skipVite?: boolean;
  tokenVerifier?: typeof verifyFirebaseIdToken;
  goldSeedResolver?: (params: {
    uid: string;
    idToken: string;
    projectId: string;
  }) => Promise<VerifiedGoldSeedResult>;
  economySeedResolver?: (params: {
    uid: string;
    idToken: string;
    projectId: string;
  }) => Promise<VerifiedPlayerEconomySeedResult>;
  allowLockedFarmPurchasesForTest?: boolean;
  persistFarmPlot?: (owners: any, goldBalances: Record<string, number>) => Promise<void>;
  persistEconomy?: (economy: EconomyPersistPayload) => Promise<void>;
  firestoreSaveCommitter?: (params: {
    uid: string;
    docs: FirestorePlayerSaveDocs;
  }) => Promise<FirestoreSaveWriterResult>;
  saveCutoverMode?: SaveCutoverMode;
  saveStorageAdapter?: DOStorageAdapter;
  firestoreFetchImpl?: typeof fetch;
}) {
  const app = express();
  const server = http.createServer(app);
  const verifyToken = options?.tokenVerifier || verifyFirebaseIdToken;
  const listenPort = options?.port ?? PORT;

  // Authoritative Room State (random-city-main, max 10 players)
  const roomName = 'random-city-main';
  const maxPlayers = 10;
  const players = new Map<string, PlayerPresenceState>();
  const sockets = new Map<WebSocket, string>(); // ws -> playerId
  const depletedResources = new Map<string, number>(); // nodeId -> respawnAt
  const placedBuildings: PlacedBuilding[] = [];
  const benchSeats = new Map<string, [string | null, string | null]>();
  const serverMap = createAuthoritativeServerMap();
  const serverResources = new ResourceSystem();
  serverResources.generateResources(serverMap);
  const fishingTracker = new FishingSessionTracker(
    serverResources.nodes.filter((n) => n.type === 'lake_fish').map((n) => n.id)
  );
  const farmLedger = new FarmPlotServerLedger();
  const saveFoundation = new PlayerSaveFoundationService();
  const localSaveMap = new Map<string, any>();
  const localSaveStorage: DOStorageAdapter = options?.saveStorageAdapter || {
    async get<T = any>(key: string): Promise<T | undefined> {
      const v = localSaveMap.get(key);
      return v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as T);
    },
    async put<T = any>(key: string, value: T): Promise<void> {
      localSaveMap.set(key, JSON.parse(JSON.stringify(value)));
    },
  };
  const getActiveCutoverMode = (): SaveCutoverMode =>
    options?.saveCutoverMode || resolveSaveCutoverMode(process.env as Record<string, unknown>);
  const chatHistory: ChatMessage[] = [];
  let officialResetEpoch: string | null = null;
  let officialResetExecutedAt: string | null = null;

  // Admin & Moderation State
  const bannedUsers = new Map<string, BannedUserRecord>();
  const knownPlayers = new Map<string, KnownPlayerRecord>();
  let activeAnnouncement: ActiveAnnouncement | null = null;
  const recentErrors: ServerErrorEntry[] = [];
  const rateLimiter = new AdminRateLimiter();
  const startedAtMs = Date.now();
  const startedAtIso = new Date().toISOString();

  // WebSocket Server on /ws
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('error', (err) => {
    console.error('[Random City] WebSocketServer error:', err);
    recordServerError(recentErrors, 'wss', err?.message || String(err));
  });
  server.on('error', (err) => {
    console.error('[Random City] HTTP server error:', err);
    recordServerError(recentErrors, 'http_server', err?.message || String(err));
    if (!options?.skipVite) {
      process.exit(1);
    }
  });

  function broadcast(message: ServerMessage, excludeWs?: WebSocket) {
    const data = JSON.stringify(message);
    for (const [ws] of sockets.entries()) {
      if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch (e) {
          // Socket closed
        }
      }
    }
  }

  function disconnectPlayerSockets(
    targetUid: string,
    closeCode: number,
    closeReason: string,
    finalMessage?: ServerMessage
  ): boolean {
    let disconnected = false;
    for (const [socket, pid] of Array.from(sockets.entries())) {
      if (pid === targetUid) {
        disconnected = true;
        sockets.delete(socket);
        if (finalMessage && socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify(finalMessage));
          } catch {}
        }
        try {
          socket.close(closeCode, closeReason);
        } catch {}
      }
    }
    releasePlayerBenchSeat(targetUid, true);
    if (players.delete(targetUid)) {
      disconnected = true;
      broadcast({
        type: 's:player_left',
        payload: {
          playerId: targetUid,
          playerCount: players.size,
        },
      });
    }
    return disconnected;
  }

  function getOrInitBenchPair(benchId: string): [string | null, string | null] {
    let pair = benchSeats.get(benchId);
    if (!pair) {
      pair = [null, null];
      benchSeats.set(benchId, pair);
    }
    return pair;
  }

  function serializeBenchSeats(): Record<string, [string | null, string | null]> {
    const out: Record<string, [string | null, string | null]> = {};
    for (const b of LAKESIDE_DOUBLE_BENCHES) {
      const pair = benchSeats.get(b.id);
      out[b.id] = pair ? [pair[0], pair[1]] : [null, null];
    }
    return out;
  }

  function releasePlayerBenchSeat(playerId: string, broadcastUpdate: boolean): boolean {
    let changed = false;
    for (const pair of benchSeats.values()) {
      if (pair[0] === playerId) {
        pair[0] = null;
        changed = true;
      }
      if (pair[1] === playerId) {
        pair[1] = null;
        changed = true;
      }
    }
    const player = players.get(playerId);
    if (player && (player.seatedBenchId || player.seatedSeatIndex !== undefined)) {
      player.seatedBenchId = undefined;
      player.seatedSeatIndex = undefined;
      changed = true;
    }
    if (changed && broadcastUpdate) {
      broadcast({
        type: 's:bench_state',
        payload: { benchSeats: serializeBenchSeats() },
      });
    }
    return changed;
  }

  // Periodic resource respawn checker
  const respawnInterval = setInterval(() => {
    const now = Date.now();
    for (const [nodeId, respawnAt] of depletedResources.entries()) {
      if (respawnAt <= now) {
        depletedResources.delete(nodeId);
        broadcast({
          type: 's:resource_respawned',
          payload: { nodeId },
        });
      }
    }
  }, 2000);

  wss.on('connection', (ws: WebSocket) => {
    // Check 10-player room capacity
    if (players.size >= maxPlayers) {
      const fullMsg: ServerMessage = {
        type: 's:room_full',
        payload: {
          message: 'The Random City world room is currently full (10/10 players). Please try again shortly.',
          maxPlayers,
        },
      };
      ws.send(JSON.stringify(fullMsg));
      ws.close(1008, 'Room full');
      return;
    }

    ws.on('message', async (rawData) => {
      try {
        const text = rawData.toString();
        const msg = JSON.parse(text) as ClientMessage;

        switch (msg.type) {
          case 'c:auth_join': {
            const { idToken, profile } = msg.payload;

            // Cryptographically verify Firebase ID Token using Google JWKS
            const projectId = process.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw';
            const authResult = await verifyToken(idToken, projectId);

            if (!authResult.valid || !authResult.claims) {
              const errorReason = authResult.error || 'Authentication failed: Invalid or expired Firebase ID token.';
              console.warn(`[Multiplayer Auth] Rejected client connection: ${errorReason}`);
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

            // CRITICAL: NEVER trust client-supplied UID/playerId! Strictly use Google-verified UID
            const verifiedUid = authResult.claims.uid;
            const isOwnerUser = isVerifiedOwnerClaims(authResult.claims);
            const playerName = (profile?.name || authResult.claims.name || 'Settler').slice(0, 16);

            // Enforce server-side ban check (Owner can never be locked out)
            const banRecord = !isOwnerUser ? bannedUsers.get(verifiedUid) : undefined;
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

            if (!players.has(verifiedUid) && players.size >= maxPlayers) {
              ws.send(JSON.stringify({
                type: 's:room_full',
                payload: { message: 'Room capacity reached (10/10).', maxPlayers },
              }));
              ws.close(1008, 'Room full');
              return;
            }

            // Seed authoritative Gold, Inventory, and Clothing ledgers from Firestore (or injectable resolver)
            // ONLY for dimensions not yet verified in server ledger. Never trust client-supplied values.
            if (
              !farmLedger.isGoldVerified(verifiedUid) ||
              !farmLedger.isInventoryVerified(verifiedUid) ||
              !farmLedger.isClothingVerified(verifiedUid)
            ) {
              const seedRes = options?.economySeedResolver
                ? await options.economySeedResolver({ uid: verifiedUid, idToken, projectId })
                : options?.goldSeedResolver
                ? await options.goldSeedResolver({ uid: verifiedUid, idToken, projectId }).then((g) => ({
                    ok: g.ok,
                    gold: g.gold,
                    inventorySlots: createStarterInventorySlots(),
                    ownedClothing: [] as string[],
                    source: g.source,
                    error: g.error,
                  }))
                : await fetchVerifiedFirestorePlayerEconomy({ uid: verifiedUid, idToken, projectId });

              const seeded = farmLedger.seedAuthoritativeEconomy(
                verifiedUid,
                {
                  gold: seedRes.gold,
                  inventorySlots: seedRes.inventorySlots,
                  ownedClothing: seedRes.ownedClothing,
                },
                seedRes.ok
              );
              if (
                options?.persistEconomy &&
                (seeded.seededGold || seeded.seededInventory || seeded.seededClothing)
              ) {
                try {
                  await options.persistEconomy(farmLedger.getEconomyPersistPayload());
                } catch {}
              }
            }

            if (ws.readyState !== WebSocket.OPEN) {
              return;
            }

            // Close any existing stale socket for this user
            releasePlayerBenchSeat(verifiedUid, true);
            for (const [s, pid] of sockets.entries()) {
              if (pid === verifiedUid && s !== ws) {
                try {
                  s.close(1000, 'Replaced by new session');
                } catch (e) {}
                sockets.delete(s);
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

            players.set(verifiedUid, newPlayer);
            sockets.set(ws, verifiedUid);

            upsertKnownPlayerRecord(knownPlayers, {
              uid: verifiedUid,
              playerName,
              gender,
              lastSeenAt: Date.now(),
              isOwner: isOwnerUser,
            });

            // 1. Send authoritative room state to joining player (including authoritative Gold balance)
            const syncState: WorldSyncState = {
              roomName,
              maxPlayers,
              playerCount: players.size,
              players: Object.fromEntries(players),
              depletedResources: Object.fromEntries(depletedResources),
              placedBuildings: [...placedBuildings],
              farmPlotOwners: farmLedger.serializeOwners(),
              goldBalance: farmLedger.getPlayerGold(verifiedUid),
              goldLedgerVerified: farmLedger.isGoldVerified(verifiedUid),
              inventorySlots: farmLedger.getPlayerInventory(verifiedUid),
              inventoryVerified: farmLedger.isInventoryVerified(verifiedUid),
              ownedClothing: farmLedger.getPlayerOwnedClothing(verifiedUid),
              benchSeats: serializeBenchSeats(),
              recentChat: chatHistory.slice(-20),
              officialResetEpoch,
              activeAnnouncement,
            };

            ws.send(JSON.stringify({
              type: 's:room_state',
              payload: syncState,
            }));

            // 2. Broadcast join to others
            broadcast({
              type: 's:player_joined',
              payload: {
                player: newPlayer,
                playerCount: players.size,
              },
            }, ws);
            break;
          }

          case 'c:player_move': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const player = players.get(playerId);
            if (!player) return;

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
                releasePlayerBenchSeat(playerId, true);
              }
            }

            broadcast({
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
            }, ws);
            break;
          }

          case 'c:outfit_update': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const player = players.get(playerId);
            if (!player) return;

            const cleanOutfit = ClothingSystem.normalizeEquippedClothing(
              msg.payload?.equippedClothing,
              undefined,
              player.gender
            );
            player.equippedClothing = cleanOutfit;
            player.lastUpdate = Date.now();

            broadcast({
              type: 's:player_outfit',
              payload: {
                playerId,
                equippedClothing: cleanOutfit,
              },
            }, ws);
            break;
          }

          case 'c:gather_request': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const nodeId = typeof msg.payload?.nodeId === 'string' ? msg.payload.nodeId.trim() : '';
            if (!nodeId) return;
            const node = serverResources.nodes.find((n) => n.id === nodeId);
            if (!node || node.type === 'lake_fish') return;

            const rate = rateLimiter.check(`gather:${playerId}`, 60, 60000);
            if (!rate.allowed) {
              ws.send(JSON.stringify({
                type: 's:inventory_sync',
                payload: {
                  ok: false,
                  inventorySlots: farmLedger.getPlayerInventory(playerId),
                  code: 'RATE_LIMITED',
                  reason: 'သယံဇာတ စုဆောင်းမှု မြန်ဆန်လွန်းနေပါသည် (ခဏစောင့်ပါ)',
                },
              }));
              return;
            }

            const gatherRes = await farmLedger.gatherResourceAtomic({
              uid: playerId,
              nodeId,
              yieldItem: node.yieldItem,
              yieldAmount: node.yieldAmount,
              respawnDurationMs: node.respawnTimeSeconds * 1000,
              depletedResources,
              persist: options?.persistEconomy,
            });

            ws.send(JSON.stringify({
              type: 's:inventory_sync',
              payload: {
                ok: gatherRes.ok,
                inventorySlots: gatherRes.inventorySlots,
                code: gatherRes.code,
                reason: gatherRes.reason,
              },
            }));

            if (gatherRes.ok && gatherRes.respawnAt) {
              broadcast({
                type: 's:resource_harvested',
                payload: {
                  nodeId,
                  respawnAt: gatherRes.respawnAt,
                  harvestedBy: playerId,
                },
              });
            }
            break;
          }

          case 'c:fishing_start': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const rate = rateLimiter.check(`fishing_start:${playerId}`, 30, 60000);
            if (!rate.allowed) {
              ws.send(JSON.stringify({
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
              }));
              return;
            }
            const res = fishingTracker.startCast({
              playerId,
              nodeId: msg.payload?.nodeId,
              sessionId: msg.payload?.sessionId,
              depletedResources,
            });
            if (!res.ok) {
              ws.send(JSON.stringify({
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
              }));
            }
            break;
          }

          case 'c:fishing_catch': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const rate = rateLimiter.check(`fishing_catch:${playerId}`, 30, 60000);
            if (!rate.allowed) {
              ws.send(JSON.stringify({
                type: 's:fishing_result',
                payload: {
                  ok: false,
                  sessionId: typeof msg.payload?.sessionId === 'string' ? msg.payload.sessionId : undefined,
                  nodeId: typeof msg.payload?.nodeId === 'string' ? msg.payload.nodeId : '',
                  caught: false,
                  itemId: 'fish',
                  quantity: 0,
                  inventorySlots: farmLedger.getPlayerInventory(playerId),
                  code: 'RATE_LIMITED',
                  reason: 'ငါးမျှားတောင်းဆိုမှု များပြားနေပါသည် (ခဏစောင့်ပါ)',
                },
              }));
              return;
            }
            const claim = await farmLedger.claimFishingCatchAtomic({
              uid: playerId,
              nodeId: typeof msg.payload?.nodeId === 'string' ? msg.payload.nodeId : '',
              sessionId: typeof msg.payload?.sessionId === 'string' ? msg.payload.sessionId : '',
              inSuccessZone: Boolean(msg.payload?.inSuccessZone),
              fishingTracker,
              depletedResources,
              persist: options?.persistEconomy,
            });
            ws.send(JSON.stringify({
              type: 's:fishing_result',
              payload: claim,
            }));
            if (claim.ok && claim.caught && claim.respawnAt) {
              broadcast({
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
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const { building, useRawFenceMaterials } = msg.payload || ({} as any);
            if (!building || typeof building.id !== 'string') return;

            const player = players.get(playerId);
            const existingIdx = placedBuildings.findIndex((b) => b.id === building.id);
            const isMove = existingIdx !== -1;
            const prevBuilding = isMove ? placedBuildings[existingIdx] : undefined;
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
              placedBuildings,
              sanitizedBuilding,
              playerId,
              serverMap,
              {
                excludeBuildingId: isMove ? building.id : undefined,
                farmPlotOwners: farmLedger.serializeOwners(),
              }
            );
            if (!validation.allowed) {
              ws.send(JSON.stringify({
                type: 's:build_rejected',
                payload: {
                  buildingId: building.id,
                  code: validation.code || 'BUILD_REJECTED',
                  message: validation.reason || 'ဤနေရာတွင် ဆောက်လုပ်ခွင့်မရှိပါ',
                  isMove,
                  prevBuilding,
                  inventorySlots: farmLedger.getPlayerInventory(playerId),
                },
              }));
              ws.send(JSON.stringify({
                type: 's:error',
                payload: {
                  code: validation.code || 'BUILD_REJECTED',
                  message: validation.reason || 'ဤနေရာတွင် ဆောက်လုပ်ခွင့်မရှိပါ',
                },
              }));
              return;
            }

            const commitRes = await farmLedger.commitBuildWithWorldAtomic({
              uid: playerId,
              buildingType: sanitizedBuilding.type,
              isMove,
              useRawFenceMaterials: Boolean(useRawFenceMaterials),
              commitWorld: () => {
                if (isMove) {
                  placedBuildings[existingIdx] = sanitizedBuilding;
                } else {
                  placedBuildings.push(sanitizedBuilding);
                }
              },
              rollbackWorld: () => {
                if (isMove && prevBuilding) {
                  placedBuildings[existingIdx] = prevBuilding;
                } else if (!isMove) {
                  const rmIdx = placedBuildings.findIndex((b) => b.id === sanitizedBuilding.id);
                  if (rmIdx !== -1) placedBuildings.splice(rmIdx, 1);
                }
              },
              persist: options?.persistEconomy,
            });

            if (!commitRes.ok) {
              ws.send(JSON.stringify({
                type: 's:build_rejected',
                payload: {
                  buildingId: building.id,
                  code: commitRes.code || 'BUILD_REJECTED',
                  message: commitRes.reason || 'ဆောက်လုပ်၍မရပါ',
                  isMove,
                  prevBuilding,
                  inventorySlots: commitRes.inventorySlots,
                },
              }));
              ws.send(JSON.stringify({
                type: 's:error',
                payload: {
                  code: commitRes.code || 'BUILD_REJECTED',
                  message: commitRes.reason || 'ဆောက်လုပ်၍မရပါ',
                },
              }));
              return;
            }

            if (!isMove) {
              ws.send(JSON.stringify({
                type: 's:inventory_sync',
                payload: {
                  ok: true,
                  inventorySlots: commitRes.inventorySlots,
                },
              }));
            }

            broadcast({
              type: 's:building_placed',
              payload: { building: sanitizedBuilding },
            });
            break;
          }

          case 'c:dismantle_request': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const { buildingId } = msg.payload;
            const check = validateDismantleAction(
              placedBuildings,
              buildingId,
              playerId,
              farmLedger.serializeOwners()
            );
            if (!check.allowed) {
              const target = placedBuildings.find((b) => b.id === buildingId);
              ws.send(JSON.stringify({
                type: 's:dismantle_rejected',
                payload: {
                  buildingId,
                  code: check.code || 'FORBIDDEN',
                  message: check.reason || 'You can only dismantle your own structures.',
                  building: target,
                  inventorySlots: farmLedger.getPlayerInventory(playerId),
                },
              }));
              ws.send(JSON.stringify({
                type: 's:error',
                payload: {
                  code: check.code || 'FORBIDDEN',
                  message: check.reason || 'You can only dismantle your own structures.',
                },
              }));
              return;
            }
            const idx = placedBuildings.findIndex((b) => b.id === buildingId);
            if (idx === -1) return;
            const target = placedBuildings[idx];

            const dismantleRes = await farmLedger.commitDismantleWithWorldAtomic({
              uid: playerId,
              buildingType: target.type,
              commitWorld: () => {
                const currentIdx = placedBuildings.findIndex((b) => b.id === buildingId);
                if (currentIdx !== -1) placedBuildings.splice(currentIdx, 1);
              },
              rollbackWorld: () => {
                if (!placedBuildings.some((b) => b.id === buildingId)) {
                  placedBuildings.splice(Math.min(idx, placedBuildings.length), 0, target);
                }
              },
              persist: options?.persistEconomy,
            });

            if (!dismantleRes.ok) {
              ws.send(JSON.stringify({
                type: 's:dismantle_rejected',
                payload: {
                  buildingId,
                  code: dismantleRes.code || 'DISMANTLE_REJECTED',
                  message: dismantleRes.reason || 'ဖျက်သိမ်း၍မရပါ',
                  building: target,
                  inventorySlots: dismantleRes.inventorySlots,
                },
              }));
              ws.send(JSON.stringify({
                type: 's:error',
                payload: {
                  code: dismantleRes.code || 'DISMANTLE_REJECTED',
                  message: dismantleRes.reason || 'ဖျက်သိမ်း၍မရပါ',
                },
              }));
              return;
            }

            ws.send(JSON.stringify({
              type: 's:inventory_sync',
              payload: {
                ok: true,
                inventorySlots: dismantleRes.inventorySlots,
              },
            }));

            broadcast({
              type: 's:building_dismantled',
              payload: { buildingId },
            });
            break;
          }

          case 'c:craft_request': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const rate = rateLimiter.check(`craft:${playerId}`, 30, 60000);
            if (!rate.allowed) {
              ws.send(JSON.stringify({
                type: 's:craft_result',
                payload: {
                  ok: false,
                  txId: typeof msg.payload?.txId === 'string' ? msg.payload.txId : undefined,
                  recipeId: typeof msg.payload?.recipeId === 'string' ? msg.payload.recipeId : '',
                  inventorySlots: farmLedger.getPlayerInventory(playerId),
                  code: 'RATE_LIMITED',
                  reason: 'ဖန်တီးမှု တောင်းဆိုမှု များပြားနေပါသည် (ခဏစောင့်ပါ)',
                },
              }));
              return;
            }
            const craftRes = await farmLedger.craftRecipeAtomic({
              uid: playerId,
              recipeId: msg.payload?.recipeId,
              txId: msg.payload?.txId,
              persist: options?.persistEconomy,
            });
            ws.send(JSON.stringify({
              type: 's:craft_result',
              payload: craftRes,
            }));
            break;
          }

          case 'c:storage_transfer': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const rate = rateLimiter.check(`storage:${playerId}`, 45, 60000);
            if (!rate.allowed) {
              ws.send(JSON.stringify({
                type: 's:storage_transfer_result',
                payload: {
                  ok: false,
                  txId: typeof msg.payload?.txId === 'string' ? msg.payload.txId : undefined,
                  buildingId: typeof msg.payload?.buildingId === 'string' ? msg.payload.buildingId : '',
                  direction: msg.payload?.direction === 'withdraw' ? 'withdraw' : 'deposit',
                  itemId: typeof msg.payload?.itemId === 'string' ? msg.payload.itemId : '',
                  quantity: 0,
                  inventorySlots: farmLedger.getPlayerInventory(playerId),
                  code: 'RATE_LIMITED',
                  reason: 'သေတ္တာအသုံးပြုမှု မြန်ဆန်လွန်းနေပါသည် (ခဏစောင့်ပါ)',
                },
              }));
              return;
            }
            const targetBox = placedBuildings.find((b) => b.id === msg.payload?.buildingId);
            const transferRes = await farmLedger.transferStorageBoxAtomic({
              uid: playerId,
              txId: msg.payload?.txId,
              building: targetBox,
              direction: msg.payload?.direction,
              itemId: msg.payload?.itemId,
              quantity: msg.payload?.quantity,
              persist: options?.persistEconomy,
            });
            ws.send(JSON.stringify({
              type: 's:storage_transfer_result',
              payload: transferRes,
            }));
            break;
          }

          case 'c:shop_trade': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const rate = rateLimiter.check(`shop_trade:${playerId}`, 45, 60000);
            if (!rate.allowed) {
              ws.send(JSON.stringify({
                type: 's:shop_trade_result',
                payload: {
                  ok: false,
                  txId: typeof msg.payload?.txId === 'string' ? msg.payload.txId : undefined,
                  action: msg.payload?.action,
                  itemId: msg.payload?.itemId,
                  quantity: typeof msg.payload?.quantity === 'number' ? msg.payload.quantity : undefined,
                  balance: farmLedger.getPlayerGold(playerId),
                  inventorySlots: farmLedger.getPlayerInventory(playerId),
                  ownedClothing: farmLedger.getPlayerOwnedClothing(playerId),
                  code: 'RATE_LIMITED',
                  reason: 'အရောင်းအဝယ် တောင်းဆိုမှု များပြားနေပါသည် (ခဏစောင့်ပါ)',
                },
              }));
              return;
            }
            const trade = await farmLedger.applyVerifiedShopTradeAtomic({
              uid: playerId,
              payload: msg.payload || {},
              persist: options?.persistEconomy,
            });
            ws.send(JSON.stringify({
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
            }));
            break;
          }

          case 'c:buy_farm_plot': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const rate = rateLimiter.check(`buy_farm_plot:${playerId}`, 12, 60000);
            if (!rate.allowed) {
              ws.send(JSON.stringify({
                type: 's:farm_plot_purchase_result',
                payload: {
                  ok: false,
                  plotId: typeof msg.payload?.plotId === 'string' ? msg.payload.plotId : '',
                  code: 'PURCHASE_IN_PROGRESS',
                  message: 'ဝယ်ယူမှု တောင်းဆိုမှု များပြားနေပါသည် (ခဏစောင့်ပါ)',
                  remainingGold: farmLedger.getPlayerGold(playerId),
                },
              }));
              return;
            }
            const player = players.get(playerId);
            const result = await farmLedger.purchasePlotAtomic({
              plotId: msg.payload?.plotId,
              buyerUid: playerId,
              buyerName: player?.playerName || 'Settler',
              allowLockedForTest: Boolean(options?.allowLockedFarmPurchasesForTest),
              persist:
                options?.persistFarmPlot ||
                (async () => {
                  await Promise.resolve();
                }),
            });
            ws.send(JSON.stringify({
              type: 's:farm_plot_purchase_result',
              payload: result,
            }));
            if (result.ok && result.owner) {
              broadcast({
                type: 's:farm_plot_updated',
                payload: {
                  plotId: result.plotId,
                  owner: result.owner,
                  farmPlotOwners: farmLedger.serializeOwners(),
                },
              });
            }
            break;
          }

          case 'c:bench_sit': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const player = players.get(playerId);
            if (!player) return;

            const bench = getLakesideBenchById(msg.payload?.benchId);
            if (!bench) {
              ws.send(JSON.stringify({
                type: 's:error',
                payload: { code: 'BENCH_NOT_FOUND', message: 'ထိုင်ခုံတည်နေရာ မတွေ့ရှိပါ' },
              }));
              return;
            }

            if (Math.hypot(player.positionX - bench.tileX, player.positionY - bench.tileY) > 3.6) {
              ws.send(JSON.stringify({
                type: 's:error',
                payload: { code: 'BENCH_TOO_FAR', message: 'ထိုင်ခုံနှင့် အနီးကပ်သွားပြီးမှ ထိုင်ပါ' },
              }));
              return;
            }

            releasePlayerBenchSeat(playerId, false);
            const seats = getOrInitBenchPair(bench.id);
            const preferred = msg.payload?.seatIndex;
            let chosen: 0 | 1 | null = null;
            if (preferred === 0 || preferred === 1) {
              if (seats[preferred] === null || seats[preferred] === playerId) chosen = preferred;
            }
            if (chosen === null) {
              if (seats[0] === null || seats[0] === playerId) chosen = 0;
              else if (seats[1] === null || seats[1] === playerId) chosen = 1;
            }

            if (chosen === null) {
              ws.send(JSON.stringify({
                type: 's:error',
                payload: { code: 'BENCH_FULL', message: 'ဤ ၂ ဦးထိုင်ခုံတွင် နေရာအားလုံး ပြည့်နေပါပြီ' },
              }));
              return;
            }

            seats[chosen] = playerId;
            player.seatedBenchId = bench.id;
            player.seatedSeatIndex = chosen;
            player.facingDirection = bench.facing;
            player.movementState = 'idle';
            player.animationState = 'none';
            player.lastUpdate = Date.now();

            broadcast({
              type: 's:bench_state',
              payload: { benchSeats: serializeBenchSeats() },
            });
            break;
          }

          case 'c:bench_stand': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            releasePlayerBenchSeat(playerId, true);
            break;
          }

          case 'c:chat': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const player = players.get(playerId);
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

            chatHistory.push(chatMsg);
            if (chatHistory.length > 50) chatHistory.shift();

            broadcast({
              type: 's:chat',
              payload: chatMsg,
            });
            break;
          }
        }
      } catch (err: any) {
        console.error('Server WebSocket error:', err);
        recordServerError(recentErrors, 'ws_message', err?.message || String(err));
      }
    });

    const handleDisconnect = () => {
      const playerId = sockets.get(ws);
      if (!playerId) return;

      sockets.delete(ws);
      fishingTracker.clearPlayer(playerId);
      releasePlayerBenchSeat(playerId, true);
      players.delete(playerId);

      broadcast({
        type: 's:player_left',
        payload: {
          playerId,
          playerCount: players.size,
        },
      });
    };

    ws.on('close', handleDisconnect);
    ws.on('error', handleDisconnect);
  });

  // REST endpoints & Vite integration
  app.use('/api/admin', express.json({ limit: '5mb' }));
  app.use('/api/session', express.json({ limit: '64kb' }));
  app.use('/api/player', express.json({ limit: '512kb' }));
  app.use('/api/player', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      res.status(413).json({ ok: false, code: 'PAYLOAD_TOO_LARGE', error: 'Save payload exceeds 512KB limit.' });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ ok: false, code: 'INVALID_JSON', error: 'Invalid JSON request body.' });
      return;
    }
    next(err);
  });

  const verifyLocalSessionUser = async (
    req: express.Request,
    res: express.Response
  ): Promise<{ uid: string; idToken: string; name?: string; email?: string; isOwner: boolean } | null> => {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]) {
      res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', error: 'Missing Authorization Bearer token.' });
      return null;
    }
    const idToken = match[1].trim();
    const projectId = process.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw';
    const result = await verifyToken(idToken, projectId);
    if (!result.valid || !result.claims) {
      res.status(401).json({
        ok: false,
        code: 'AUTH_FAILED',
        error: result.error || 'Invalid Firebase ID token.',
      });
      return null;
    }
    return {
      uid: result.claims.uid,
      idToken,
      name: result.claims.name,
      email: result.claims.email,
      isOwner: isVerifiedOwnerClaims(result.claims),
    };
  };

  const verifyLocalAdmin = async (
    req: express.Request,
    res: express.Response,
    actionType: 'read' | 'write' = 'read'
  ): Promise<{ uid: string; email: string } | null> => {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]) {
      res.status(401).json({ ok: false, error: 'Missing Authorization Bearer token.' });
      return null;
    }
    const projectId = process.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw';
    const result = await verifyToken(match[1].trim(), projectId);
    if (!result.valid || !result.claims) {
      res.status(401).json({ ok: false, error: result.error || 'Invalid Firebase ID token.' });
      return null;
    }
    if (!isVerifiedOwnerClaims(result.claims)) {
      res.status(403).json({
        ok: false,
        error: 'Forbidden: Only the verified Project Owner can access admin controls.',
      });
      return null;
    }
    const maxRequests = actionType === 'write' ? 30 : 90;
    const rate = rateLimiter.check(`admin:${result.claims.uid}:${actionType}`, maxRequests, 60000);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      res.status(429).json({
        ok: false,
        error: 'Too many admin requests. Please wait a moment and try again.',
      });
      return null;
    }
    return {
      uid: result.claims.uid,
      email: (result.claims.email || PROJECT_OWNER_EMAIL).toLowerCase().trim(),
    };
  };

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      playersOnline: players.size,
      maxPlayers,
      room: roomName,
    });
  });

  app.get('/api/session/check', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const sessionUser = await verifyLocalSessionUser(req, res);
    if (!sessionUser) return;

    const rate = rateLimiter.check(`session:${sessionUser.uid}`, 60, 60000);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      res.status(429).json({ ok: false, error: 'Rate limit exceeded.' });
      return;
    }

    const ban = sessionUser.isOwner ? undefined : bannedUsers.get(sessionUser.uid);
    const payload: SessionCheckResponse = {
      ok: true,
      uid: sessionUser.uid,
      banned: Boolean(ban),
      banReason: ban?.reason || null,
      bannedAt: ban?.bannedAt || null,
      announcement: activeAnnouncement,
      isOwner: sessionUser.isOwner,
    };
    res.json(payload);
  });

  const applyPlayerCors = (req: express.Request, res: express.Response, methods = 'POST, OPTIONS') => {
    const reqUrlOrigin = req.headers.host ? `${req.protocol}://${req.headers.host}` : undefined;
    const corsHeaders = buildAuthenticatedSaveCorsHeaders(
      typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
      reqUrlOrigin
    );
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.setHeader(k, v);
    }
    res.setHeader('Access-Control-Allow-Methods', methods);
  };

  app.options('/api/player/load', (req, res) => {
    applyPlayerCors(req, res, 'GET, OPTIONS');
    res.status(204).end();
  });

  app.get('/api/player/load', async (req, res) => {
    applyPlayerCors(req, res, 'GET, OPTIONS');
    const sessionUser = await verifyLocalSessionUser(req, res);
    if (!sessionUser) return;

    const requestedUid = typeof req.query?.uid === 'string' ? req.query.uid : undefined;
    const uidAccess = validateAuthenticatedUidAccess({
      authenticatedUid: sessionUser.uid,
      targetUid: requestedUid,
    });
    if (!uidAccess.ok) {
      res.status(uidAccess.statusCode).json({
        ok: false,
        code: uidAccess.code,
        error: uidAccess.error,
        fallbackAllowed: false,
      });
      return;
    }

    const rate = rateLimiter.check(`player_load:${sessionUser.uid}`, 60, 60000);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Too many load requests. Please wait a moment.',
        fallbackAllowed: true,
      });
      return;
    }

    const cutoverMode = getActiveCutoverMode();
    const projectId = process.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw';
    const loadRes = await saveFoundation.loadOrMigratePlayerSave({
      storage: localSaveStorage,
      farmLedger,
      authenticatedUid: sessionUser.uid,
      targetUid: requestedUid,
      idToken: sessionUser.idToken,
      mode: cutoverMode,
      projectId,
      fallbackName: players.get(sessionUser.uid)?.playerName || sessionUser.name,
      fetchImpl: options?.firestoreFetchImpl,
      persistEconomy: options?.persistEconomy
        ? () => options.persistEconomy!(farmLedger.getEconomyPersistPayload())
        : undefined,
    });

    if (loadRes.fallbackToLegacy) {
      res.status(200).json({
        ok: true,
        mode: 'legacy_firestore',
        fallbackToLegacy: true,
        officialResetEpoch,
      });
      return;
    }

    if (!loadRes.ok) {
      res.status(loadRes.statusCode).json({
        ok: false,
        mode: loadRes.mode,
        code: loadRes.code,
        error: loadRes.error,
        fallbackAllowed: Boolean(loadRes.fallbackAllowed),
      });
      return;
    }

    if (loadRes.needsCharacterCreation || !loadRes.record) {
      res.status(200).json({
        ok: true,
        mode: loadRes.mode,
        exists: false,
        needsCharacterCreation: true,
        performedFirestoreReads: loadRes.performedFirestoreReads,
        officialResetEpoch,
      });
      return;
    }

    if (!farmLedger.isEconomyFullyVerified(sessionUser.uid)) {
      const seeded = farmLedger.seedAuthoritativeEconomy(
        sessionUser.uid,
        {
          gold: 25,
          inventorySlots: createStarterInventorySlots(),
          ownedClothing: [],
        },
        true
      );
      if (
        options?.persistEconomy &&
        (seeded.seededGold || seeded.seededInventory || seeded.seededClothing)
      ) {
        try {
          await options.persistEconomy(farmLedger.getEconomyPersistPayload());
        } catch {}
      }
    }

    const bundle = buildHydratedClientBundleFromDO({
      record: loadRes.record,
      farmLedger,
      placedBuildings,
    });

    res.status(200).json({
      ok: true,
      mode: loadRes.mode,
      exists: true,
      source: loadRes.source,
      didMigrate: loadRes.didMigrate,
      performedFirestoreReads: loadRes.performedFirestoreReads,
      economyPreservedFromDO: loadRes.economyPreservedFromDO,
      storageKey: loadRes.storageKey,
      saveRevision: loadRes.record.saveRevision,
      officialResetEpoch,
      profile: bundle.profile,
      gameState: bundle.gameState,
      authoritativeEconomy: bundle.authoritativeEconomy,
    });
  });

  app.options('/api/player/init', (req, res) => {
    applyPlayerCors(req, res, 'POST, OPTIONS');
    res.status(204).end();
  });

  app.post('/api/player/init', async (req, res) => {
    applyPlayerCors(req, res, 'POST, OPTIONS');
    const sessionUser = await verifyLocalSessionUser(req, res);
    if (!sessionUser) return;

    const claimedUid =
      typeof req.body?.uid === 'string' && req.body.uid.trim() ? req.body.uid.trim() : undefined;
    const uidAccess = validateAuthenticatedUidAccess({
      authenticatedUid: sessionUser.uid,
      targetUid: claimedUid,
    });
    if (!uidAccess.ok) {
      res.status(uidAccess.statusCode).json({ ok: false, code: uidAccess.code, error: uidAccess.error });
      return;
    }

    const playerName = typeof req.body?.playerName === 'string' ? req.body.playerName.trim() : '';
    if (playerName.length < 3 || playerName.length > 16) {
      res.status(400).json({
        ok: false,
        code: 'INVALID_NAME',
        error: 'Player Name must be between 3 and 16 characters.',
      });
      return;
    }

    const initRes = await saveFoundation.initializeNewPlayerSaveToDO({
      storage: localSaveStorage,
      farmLedger,
      authenticatedUid: sessionUser.uid,
      playerName,
      gender: req.body?.gender,
      officialResetEpoch,
      persistEconomy: options?.persistEconomy
        ? () => options.persistEconomy!(farmLedger.getEconomyPersistPayload())
        : undefined,
    });

    if (!initRes.ok || !initRes.record) {
      res.status(initRes.statusCode || 500).json({
        ok: false,
        code: initRes.code || 'DO_INIT_FAILED',
        error: initRes.error,
      });
      return;
    }

    const bundle = buildHydratedClientBundleFromDO({
      record: initRes.record,
      farmLedger,
      placedBuildings,
    });

    res.status(200).json({
      ok: true,
      mode: getActiveCutoverMode(),
      storageKey: initRes.storageKey,
      saveRevision: initRes.saveRevision,
      lastSavedAt: initRes.lastSavedAt,
      profile: bundle.profile,
      gameState: bundle.gameState,
      authoritativeEconomy: bundle.authoritativeEconomy,
    });
  });

  app.get('/api/player/save-foundation/status', async (req, res) => {
    applyPlayerCors(req, res, 'GET, OPTIONS');
    const sessionUser = await verifyLocalSessionUser(req, res);
    if (!sessionUser) return;

    const requestedUid = typeof req.query?.uid === 'string' ? req.query.uid : undefined;
    const uidAccess = validateAuthenticatedUidAccess({
      authenticatedUid: sessionUser.uid,
      targetUid: requestedUid,
    });
    if (!uidAccess.ok) {
      res.status(uidAccess.statusCode).json({ ok: false, code: uidAccess.code, error: uidAccess.error });
      return;
    }

    const status = await saveFoundation.getMigrationStatus({
      storage: localSaveStorage,
      uid: uidAccess.uid,
      farmLedger,
      placedBuildings,
      officialResetEpoch,
    });
    res.status(200).json({ ok: true, status });
  });

  app.options('/api/player/save', (req, res) => {
    applyPlayerCors(req, res, 'POST, OPTIONS');
    res.status(204).end();
  });

  app.post('/api/player/save', async (req, res) => {
    applyPlayerCors(req, res, 'POST, OPTIONS');

    const sessionUser = await verifyLocalSessionUser(req, res);
    if (!sessionUser) return;

    const rate = rateLimiter.check(`player_save:${sessionUser.uid}`, 90, 60000);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Cloud save requests are too frequent. Please wait a moment.',
      });
      return;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw';
    const cutoverMode = getActiveCutoverMode();
    if (cutoverMode === 'legacy_firestore') {
      const saveResult = await farmLedger.executeAuthoritativePlayerSave({
        uid: sessionUser.uid,
        rawBody: req.body,
        serverPlacedBuildings: placedBuildings,
        fallbackPlayerName: players.get(sessionUser.uid)?.playerName || sessionUser.name || 'Settler',
        ensureEconomySeeded: async () => {
          const seedRes = options?.economySeedResolver
            ? await options.economySeedResolver({
                uid: sessionUser.uid,
                idToken: sessionUser.idToken,
                projectId,
              })
            : options?.goldSeedResolver
            ? await options
                .goldSeedResolver({
                  uid: sessionUser.uid,
                  idToken: sessionUser.idToken,
                  projectId,
                })
                .then((g) => ({
                  ok: g.ok,
                  gold: g.gold,
                  inventorySlots: createStarterInventorySlots(),
                  ownedClothing: [] as string[],
                  source: g.source,
                  error: g.error,
                }))
            : await fetchVerifiedFirestorePlayerEconomy({
                uid: sessionUser.uid,
                idToken: sessionUser.idToken,
                projectId,
                fetchImpl: options?.firestoreFetchImpl,
              });

          const seeded = farmLedger.seedAuthoritativeEconomy(
            sessionUser.uid,
            {
              gold: seedRes.gold,
              inventorySlots: seedRes.inventorySlots,
              ownedClothing: seedRes.ownedClothing,
            },
            seedRes.ok
          );
          if (
            options?.persistEconomy &&
            (seeded.seededGold || seeded.seededInventory || seeded.seededClothing)
          ) {
            try {
              await options.persistEconomy(farmLedger.getEconomyPersistPayload());
            } catch {}
          }
        },
        commitToFirestore: (docs) =>
          options?.firestoreSaveCommitter
            ? options.firestoreSaveCommitter({ uid: sessionUser.uid, docs })
            : commitPlayerAndWorldStateToFirestore({
                uid: sessionUser.uid,
                docs,
                userIdToken: sessionUser.idToken,
                fetchImpl: options?.firestoreFetchImpl,
              }),
      });

      res.status(saveResult.statusCode).json({
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
      });
      return;
    }

    // Phase 2 — DO Save (Primary):
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : null;
    if (!body) {
      res.status(400).json({ ok: false, code: 'INVALID_PAYLOAD', error: 'Save payload must be a JSON object.' });
      return;
    }

    const claimedUid =
      typeof body.uid === 'string' && body.uid.trim()
        ? body.uid.trim()
        : typeof body.playerId === 'string' && body.playerId.trim()
        ? body.playerId.trim()
        : undefined;
    const uidAccess = validateAuthenticatedUidAccess({
      authenticatedUid: sessionUser.uid,
      targetUid: claimedUid,
    });
    if (!uidAccess.ok) {
      res.status(uidAccess.statusCode).json({ ok: false, code: uidAccess.code, error: uidAccess.error });
      return;
    }

    const existingRecord = await saveFoundation.getPlayerSave(localSaveStorage, sessionUser.uid);
    if (!existingRecord) {
      const preMigrate = await saveFoundation.loadOrMigratePlayerSave({
        storage: localSaveStorage,
        farmLedger,
        authenticatedUid: sessionUser.uid,
        idToken: sessionUser.idToken,
        mode: 'do_primary',
        projectId,
        fallbackName:
          typeof body.playerName === 'string'
            ? body.playerName
            : players.get(sessionUser.uid)?.playerName || sessionUser.name,
        fallbackGender: body.gender === 'female' ? 'female' : 'male',
        fetchImpl: options?.firestoreFetchImpl,
        persistEconomy: options?.persistEconomy
          ? () => options.persistEconomy!(farmLedger.getEconomyPersistPayload())
          : undefined,
      });
      if (!preMigrate.ok) {
        res.status(preMigrate.statusCode).json({
          ok: false,
          mode: 'do_primary',
          code: preMigrate.code || 'MIGRATION_FAILED',
          error: preMigrate.error || 'Migration failed; legacy data preserved.',
          fallbackAllowed: Boolean(preMigrate.fallbackAllowed),
        });
        return;
      }
    }

    if (!farmLedger.isEconomyFullyVerified(sessionUser.uid)) {
      const seeded = farmLedger.seedAuthoritativeEconomy(
        sessionUser.uid,
        {
          gold: 25,
          inventorySlots: createStarterInventorySlots(),
          ownedClothing: [],
        },
        true
      );
      if (
        options?.persistEconomy &&
        (seeded.seededGold || seeded.seededInventory || seeded.seededClothing)
      ) {
        try {
          await options.persistEconomy(farmLedger.getEconomyPersistPayload());
        } catch {}
      }
    }

    if (
      body.clientTimestamp !== undefined &&
      (typeof body.clientTimestamp !== 'number' ||
        !Number.isFinite(body.clientTimestamp) ||
        body.clientTimestamp <= 0)
    ) {
      res.status(400).json({ ok: false, code: 'INVALID_TIMESTAMP', error: 'Invalid clientTimestamp.' });
      return;
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

    const doSaveRes = await saveFoundation.savePlayerRecordToDO({
      storage: localSaveStorage,
      farmLedger,
      authenticatedUid: sessionUser.uid,
      input: {
        uid: claimedUid,
        saveId: typeof body.saveId === 'string' ? body.saveId : undefined,
        expectedRevision:
          typeof body.expectedRevision === 'number' &&
          Number.isInteger(body.expectedRevision) &&
          body.expectedRevision >= 0
            ? body.expectedRevision
            : undefined,
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

    const authoritativeEconomy = farmLedger.getAuthoritativeEconomySnapshot(sessionUser.uid);

    res.status(doSaveRes.statusCode).json({
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
    });
  });

  app.get('/api/launch-status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      officialResetEpoch,
      officialResetExecutedAt,
      buildingCount: placedBuildings.length,
    });
  });

  app.get('/api/admin/overview', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const admin = await verifyLocalAdmin(req, res, 'read');
    if (!admin) return;

    const playersList = buildAdminPlayersList({
      onlinePlayers: players,
      knownPlayers,
      bannedUsers,
      ownerUid: admin.uid,
    });

    const overview: AdminOverviewResponse = {
      ok: true,
      owner: {
        uid: admin.uid,
        email: admin.email,
      },
      serverStatus: {
        health: recentErrors.length >= 5 ? 'degraded' : 'healthy',
        runtime: 'express-local',
        roomName,
        connectionStatus: 'online',
        onlineCount: players.size,
        maxPlayers,
        startedAt: startedAtIso,
        uptimeMs: Math.max(0, Date.now() - startedAtMs),
        recentErrorCount: recentErrors.length,
        recentErrors: [...recentErrors].reverse(),
      },
      players: playersList,
      bannedCount: bannedUsers.size,
      activeAnnouncement,
      officialResetEpoch,
      officialResetExecutedAt,
      buildingCount: placedBuildings.length,
    };
    res.json(overview);
  });

  app.post('/api/admin/kick', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const admin = await verifyLocalAdmin(req, res, 'write');
    if (!admin) return;

    const uidCheck = validateTargetUid(req.body?.uid);
    if (!uidCheck.ok) {
      res.status(400).json({ ok: false, error: uidCheck.error });
      return;
    }
    if (uidCheck.uid === admin.uid || knownPlayers.get(uidCheck.uid)?.isOwner) {
      res.status(400).json({ ok: false, error: 'Cannot kick the Project Owner.' });
      return;
    }

    const reason = sanitizeAdminReason(req.body?.reason, 'Admin မှ ဂိမ်းခန်းမှ ထုတ်ပယ်လိုက်ပါသည်။');
    const kicked = disconnectPlayerSockets(uidCheck.uid, 4001, 'Kicked by owner', {
      type: 's:kicked',
      payload: {
        reason,
        kickedAt: new Date().toISOString(),
      },
    });

    res.json({
      ok: true,
      uid: uidCheck.uid,
      kicked,
      onlineCount: players.size,
    });
  });

  app.post('/api/admin/ban', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const admin = await verifyLocalAdmin(req, res, 'write');
    if (!admin) return;

    const uidCheck = validateTargetUid(req.body?.uid);
    if (!uidCheck.ok) {
      res.status(400).json({ ok: false, error: uidCheck.error });
      return;
    }
    if (uidCheck.uid === admin.uid || knownPlayers.get(uidCheck.uid)?.isOwner) {
      res.status(400).json({ ok: false, error: 'Cannot ban the Project Owner.' });
      return;
    }

    const reason = sanitizeAdminReason(req.body?.reason, 'Admin မှ ဂိမ်းဝင်ခွင့် ပိတ်ပင်ထားပါသည်။');
    const known = knownPlayers.get(uidCheck.uid);
    const online = players.get(uidCheck.uid);
    const banRecord: BannedUserRecord = {
      uid: uidCheck.uid,
      playerName: online?.playerName || known?.playerName || sanitizeOptionalName(req.body?.playerName),
      reason,
      bannedAt: new Date().toISOString(),
      bannedBy: admin.email,
    };

    bannedUsers.set(uidCheck.uid, banRecord);

    const disconnectedOnline = disconnectPlayerSockets(uidCheck.uid, 4003, 'Banned by owner', {
      type: 's:banned',
      payload: {
        reason: banRecord.reason,
        bannedAt: banRecord.bannedAt,
      },
    });

    res.json({
      ok: true,
      banned: banRecord,
      disconnectedOnline,
      onlineCount: players.size,
    });
  });

  app.post('/api/admin/unban', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const admin = await verifyLocalAdmin(req, res, 'write');
    if (!admin) return;

    const uidCheck = validateTargetUid(req.body?.uid);
    if (!uidCheck.ok) {
      res.status(400).json({ ok: false, error: uidCheck.error });
      return;
    }

    const existed = bannedUsers.delete(uidCheck.uid);
    res.json({
      ok: true,
      uid: uidCheck.uid,
      unbanned: existed,
    });
  });

  app.post('/api/admin/announcement', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const admin = await verifyLocalAdmin(req, res, 'write');
    if (!admin) return;

    const msgCheck = validateAnnouncementMessage(req.body?.message);
    if (!msgCheck.ok) {
      res.status(400).json({ ok: false, error: msgCheck.error });
      return;
    }

    const now = Date.now();
    activeAnnouncement = {
      id: `ann_${now}`,
      message: msgCheck.message,
      createdAt: activeAnnouncement?.createdAt || now,
      updatedAt: now,
    };

    broadcast({
      type: 's:announcement',
      payload: { announcement: activeAnnouncement },
    });

    res.json({
      ok: true,
      announcement: activeAnnouncement,
    });
  });

  const handleClearAnnouncement = async (req: express.Request, res: express.Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const admin = await verifyLocalAdmin(req, res, 'write');
    if (!admin) return;

    activeAnnouncement = null;
    broadcast({
      type: 's:announcement',
      payload: { announcement: null },
    });

    res.json({
      ok: true,
      announcement: null,
    });
  };

  app.delete('/api/admin/announcement', handleClearAnnouncement);
  app.post('/api/admin/announcement/clear', handleClearAnnouncement);

  app.get('/api/admin/backup-world', async (req, res) => {
    const admin = await verifyLocalAdmin(req, res, 'read');
    if (!admin) return;
    const ownerCounts = new Map<string, { ownerId: string; ownerName: string; count: number }>();
    for (const b of placedBuildings) {
      const oid = b.ownerId || b.placedBy || 'unknown';
      const existing = ownerCounts.get(oid);
      if (existing) existing.count += 1;
      else ownerCounts.set(oid, { ownerId: oid, ownerName: b.placedBy || oid, count: 1 });
    }
    res.json({
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      projectId: process.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw',
      roomName,
      officialResetEpoch,
      officialResetExecutedAt,
      buildingCount: placedBuildings.length,
      uniqueOwnerCount: ownerCounts.size,
      ownerSummary: Array.from(ownerCounts.values()),
      placedBuildings,
    });
  });

  app.post('/api/admin/restore-world', async (req, res) => {
    const admin = await verifyLocalAdmin(req, res, 'write');
    if (!admin) return;
    const list = req.body?.placedBuildings;
    if (!Array.isArray(list)) {
      res.status(400).json({ ok: false, error: 'Backup payload must include placedBuildings array.' });
      return;
    }
    for (const item of list) {
      if (
        !item ||
        typeof item.id !== 'string' ||
        typeof item.type !== 'string' ||
        typeof item.tileX !== 'number' ||
        typeof item.tileY !== 'number' ||
        !Number.isFinite(item.tileX) ||
        !Number.isFinite(item.tileY)
      ) {
        res.status(400).json({ ok: false, error: 'Invalid building entry detected in backup JSON.' });
        return;
      }
    }
    placedBuildings.splice(0, placedBuildings.length, ...list);
    for (const b of placedBuildings) {
      broadcast({ type: 's:building_placed', payload: { building: b } });
    }
    res.json({ ok: true, restoredCount: placedBuildings.length });
  });

  app.post('/api/admin/official-reset', async (req, res) => {
    const admin = await verifyLocalAdmin(req, res, 'write');
    if (!admin) return;
    if (req.body?.confirmText !== 'RESET') {
      res.status(400).json({ ok: false, error: 'Confirmation failed: confirmText must equal "RESET".' });
      return;
    }
    if (req.body?.backupVerified !== true) {
      res.status(400).json({ ok: false, error: 'Backup verification required before running Official Reset.' });
      return;
    }
    if (officialResetEpoch && req.body?.forceNewEpoch !== true) {
      res.json({
        ok: true,
        alreadyReset: true,
        epoch: officialResetEpoch,
        executedAt: officialResetExecutedAt,
        clearedBuildingsCount: 0,
      });
      return;
    }
    const clearedBuildingsCount = placedBuildings.length;
    placedBuildings.splice(0, placedBuildings.length);
    officialResetEpoch = `official_launch_${Date.now()}`;
    officialResetExecutedAt = new Date().toISOString();
    broadcast({
      type: 's:official_reset',
      payload: {
        epoch: officialResetEpoch,
        message: 'Random City Official Launch Reset ပြီးစီးပါပြီ။ အစကနေ ပြန်လည်စတင်ပါမည်။',
      },
    });
    res.json({
      ok: true,
      alreadyReset: false,
      epoch: officialResetEpoch,
      executedAt: officialResetExecutedAt,
      clearedBuildingsCount,
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({
      ok: false,
      code: 'API_NOT_FOUND',
      error: 'API endpoint not found.',
    });
  });

  if (!options?.skipVite) {
    if (!isProduction) {
      const hmrDisabled = process.env.DISABLE_HMR === 'true';
      const viteReady = import('vite').then(({ createServer: createViteServer }) =>
        createViteServer({
          server: {
            middlewareMode: true,
            hmr: !hmrDisabled,
            ws: hmrDisabled ? false : undefined,
            watch: hmrDisabled ? null : {},
          },
          appType: 'spa',
        })
      );

      app.use(async (req, res, next) => {
        try {
          const vite = await viteReady;
          vite.middlewares(req, res, next);
        } catch (err) {
          next(err);
        }
      });
    } else {
      const distPath = path.resolve(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  await new Promise<void>((resolve) => {
    server.listen(listenPort, '0.0.0.0', () => {
      if (!options?.skipVite) {
        console.log(`[Random City] Server listening on http://0.0.0.0:${listenPort} (WebSocket on /ws)`);
      }
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : listenPort;

  return {
    app,
    server,
    wss,
    farmLedger,
    port: actualPort,
    close: async () => {
      clearInterval(respawnInterval);
      for (const client of wss.clients) {
        try {
          client.close(1001, 'Server shutting down');
        } catch {}
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const isDirectEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  /(?:^|[\\/])server\.(?:ts|js|mjs|cjs)$/.test(process.argv[1]);

if (isDirectEntry && process.env.RANDOM_CITY_NO_AUTOSTART !== '1') {
  createServer().catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
}
