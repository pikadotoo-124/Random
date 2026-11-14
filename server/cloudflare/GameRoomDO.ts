/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ClientMessage,
  PlayerPresenceState,
  ServerMessage,
  WorldSyncState,
  ChatMessage,
} from '../../src/game/multiplayer/types';
import { PlacedBuilding } from '../../src/game/types';
import { verifyFirebaseIdToken } from '../auth/tokenVerifier';

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
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
  FIREBASE_PROJECT_ID?: string;
}

/**
 * Cloudflare Durable Object class for Random City Room authoritative sync
 */
export class GameRoomDO {
  private state: DurableObjectState;
  private env: Env;

  // Authoritative In-Memory State
  private roomName = 'random-city-main';
  private maxPlayers = 10;
  private players = new Map<string, PlayerPresenceState>();
  private sockets = new Map<any, string>(); // WebSocket -> playerId
  private depletedResources = new Map<string, number>(); // nodeId -> respawnAt
  private placedBuildings: PlacedBuilding[] = [];
  private chatHistory: ChatMessage[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Load persisted world buildings & resources if available
    this.state.blockConcurrencyWhile(async () => {
      const savedBuildings = (await this.state.storage.get<PlacedBuilding[]>('placedBuildings')) || [];
      this.placedBuildings = savedBuildings;
    });

    // Background interval for resource respawns
    setInterval(() => {
      this.checkResourceRespawns();
    }, 2000);
  }

  async fetch(request: Request): Promise<Response> {
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
      } catch (err) {
        console.error('Error handling WebSocket message in DO:', err);
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
        const authResult = await verifyFirebaseIdToken(idToken, projectId);

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
        const playerName = (profile?.name || authResult.claims.name || 'Settler').slice(0, 16);

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

        // Disconnect previous session of the same player if exists
        for (const [s, pid] of this.sockets.entries()) {
          if (pid === verifiedUid && s !== ws) {
            try {
              s.close(1000, 'Replaced by new session');
            } catch (e) {}
            this.sockets.delete(s);
          }
        }

        const gender = profile?.gender === 'female' ? 'female' : 'male';
        const newPlayer: PlayerPresenceState = {
          playerId: verifiedUid,
          playerName,
          gender,
          positionX: Math.max(0, Math.min(119, profile?.positionX ?? 30)),
          positionY: Math.max(0, Math.min(119, profile?.positionY ?? 30)),
          facingDirection: 'down',
          movementState: 'idle',
          color: gender === 'female' ? '#10b981' : '#3b82f6',
          lastUpdate: Date.now(),
        };

        this.players.set(verifiedUid, newPlayer);
        this.sockets.set(ws, verifiedUid);

        // 1. Send full authoritative room sync to this joined player
        const syncState: WorldSyncState = {
          roomName: this.roomName,
          maxPlayers: this.maxPlayers,
          playerCount: this.players.size,
          players: Object.fromEntries(this.players),
          depletedResources: Object.fromEntries(this.depletedResources),
          placedBuildings: [...this.placedBuildings],
          recentChat: this.chatHistory.slice(-20),
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

        player.positionX = targetX;
        player.positionY = targetY;
        player.facingDirection = msg.payload.direction;
        player.movementState = msg.payload.isMoving ? 'walking' : 'idle';
        player.lastUpdate = Date.now();

        // Broadcast move update to other clients
        const moveMsg: ServerMessage = {
          type: 's:player_moved',
          payload: {
            playerId,
            x: targetX,
            y: targetY,
            direction: msg.payload.direction,
            isMoving: msg.payload.isMoving,
          },
        };
        this.broadcast(moveMsg, ws);
        break;
      }

      case 'c:gather_request': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;

        const { nodeId } = msg.payload;
        const now = Date.now();

        // Check if node is already depleted
        const depletedUntil = this.depletedResources.get(nodeId);
        if (depletedUntil && depletedUntil > now) {
          return; // Already depleted, reject redundant gather
        }

        const respawnDuration = nodeId.includes('tree') ? 25000 : nodeId.includes('rock') ? 30000 : 20000;
        const respawnAt = now + respawnDuration;
        this.depletedResources.set(nodeId, respawnAt);

        // Broadcast resource harvested to ALL clients including sender
        const harvestMsg: ServerMessage = {
          type: 's:resource_harvested',
          payload: {
            nodeId,
            respawnAt,
            harvestedBy: playerId,
          },
        };
        this.broadcast(harvestMsg);
        break;
      }

      case 'c:build_request': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;

        const { building } = msg.payload;
        if (!building) return;

        const player = this.players.get(playerId);
        building.ownerId = playerId;
        building.placedBy = building.placedBy || player?.playerName || playerId;
        const existingIdx = this.placedBuildings.findIndex((b) => b.id === building.id);
        if (existingIdx !== -1) {
          this.placedBuildings[existingIdx] = building;
        } else {
          this.placedBuildings.push(building);
        }

        // Persist to Durable Object storage
        await this.state.storage.put('placedBuildings', this.placedBuildings);

        // Broadcast to ALL players
        const buildMsg: ServerMessage = {
          type: 's:building_placed',
          payload: {
            building,
          },
        };
        this.broadcast(buildMsg);
        break;
      }

      case 'c:dismantle_request': {
        const playerId = this.sockets.get(ws);
        if (!playerId) return;

        const { buildingId } = msg.payload;
        const idx = this.placedBuildings.findIndex((b) => b.id === buildingId);
        if (idx === -1) return;

        // Authoritative validation: only building owner can dismantle
        const owner = this.placedBuildings[idx].ownerId || this.placedBuildings[idx].placedBy;
        if (owner !== playerId) {
          ws.send(JSON.stringify({ type: 's:error', payload: { code: 'FORBIDDEN', message: 'You can only dismantle your own structures.' } }));
          return;
        }

        this.placedBuildings.splice(idx, 1);
        await this.state.storage.put('placedBuildings', this.placedBuildings);

        const dismantleMsg: ServerMessage = {
          type: 's:building_dismantled',
          payload: {
            buildingId,
          },
        };
        this.broadcast(dismantleMsg);
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

      case 'c:ping': {
        ws.send(JSON.stringify({ type: 's:pong' }));
        break;
      }
    }
  }

  private handleClientDisconnect(ws: any): void {
    const playerId = this.sockets.get(ws);
    if (!playerId) return;

    this.sockets.delete(ws);
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
