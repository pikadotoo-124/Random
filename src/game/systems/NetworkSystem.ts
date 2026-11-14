/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChatMessage,
  ClientMessage,
  ConnectionStatus,
  PlayerPresenceState,
  ServerMessage,
  WorldSyncState,
} from '../multiplayer/types';
import { PlacedBuilding } from '../types';

export interface RemotePlayer {
  id: string;
  name: string;
  gender: 'male' | 'female';
  tileX: number;
  tileY: number;
  targetTileX: number;
  targetTileY: number;
  worldX: number;
  worldY: number;
  direction: 'down' | 'left' | 'right' | 'up';
  isMoving: boolean;
  action?: 'gathering' | 'building' | 'fishing' | 'idle';
  color: string;
}

export type NetworkEventType =
  | 'status_changed'
  | 'player_joined'
  | 'player_moved'
  | 'player_left'
  | 'building_placed'
  | 'building_dismantled'
  | 'resource_harvested'
  | 'resource_respawned'
  | 'chat_message'
  | 'room_state'
  | 'world_sync'
  | 'auth_error';

export interface NetworkEvent {
  type: NetworkEventType;
  payload: any;
  timestamp: number;
}

export class NetworkSystem {
  public socket: WebSocket | null = null;
  public status: ConnectionStatus = 'disconnected';
  public roomName = 'random-city-main';
  public maxPlayers = 10;
  public playerCount = 1;
  public localPlayerId: string | null = null;
  public remotePlayers = new Map<string, RemotePlayer>();
  public chatMessages: ChatMessage[] = [];
  public errorMessage: string | null = null;

  private listeners = new Map<NetworkEventType, ((event: NetworkEvent) => void)[]>();
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private lastMoveSendTime = 0;
  private cachedAuthData: { idToken: string; profile: any } | null = null;
  private tokenRefresher?: () => Promise<string>;

  constructor(roomName = 'random-city-main', maxPlayers = 10) {
    this.roomName = roomName;
    this.maxPlayers = maxPlayers;
  }

  /**
   * Determine the WebSocket URL:
   * Defaults to local express server `/ws` (or env/custom Cloudflare Worker URL)
   */
  public getWebSocketUrl(): string {
    const envWsUrl = (import.meta as any).env?.VITE_WS_URL;
    if (envWsUrl && typeof envWsUrl === 'string' && envWsUrl.trim()) {
      return envWsUrl.trim();
    }
    if (typeof window === 'undefined') return 'ws://localhost:3000/ws';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  /**
   * Connect to authoritative multiplayer room with Firebase Auth credentials
   */
  public connect(
    idToken: string,
    profile: { name: string; gender: 'male' | 'female'; positionX: number; positionY: number },
    tokenRefresher?: () => Promise<string>
  ): void {
    this.cachedAuthData = { idToken, profile };
    if (tokenRefresher) {
      this.tokenRefresher = tokenRefresher;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.setStatus('connecting');
    const wsUrl = this.getWebSocketUrl();

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        this.errorMessage = null;

        // Send auth join handshake
        const joinMsg: ClientMessage = {
          type: 'c:auth_join',
          payload: {
            idToken,
            profile,
          },
        };
        this.send(joinMsg);
      };

      this.socket.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          this.handleServerMessage(msg);
        } catch (e) {
          console.error('Error parsing incoming WS message:', e);
        }
      };

      this.socket.onclose = (event: CloseEvent) => {
        if (event.code === 1008 && event.reason.includes('full')) {
          this.setStatus('room_full');
          this.errorMessage = 'Random City is at max capacity (10/10 settlers).';
          return;
        }

        if (event.code === 1008 && (event.reason.includes('Auth') || event.reason.includes('auth'))) {
          this.setStatus('auth_error');
          this.errorMessage = event.reason || 'Authentication failed: Invalid or expired token.';
          // If we have a token refresher, try refreshing after delay, otherwise do not loop
          if (!this.tokenRefresher) return;
        }

        this.setStatus('disconnected');
        this.scheduleReconnect();
      };

      this.socket.onerror = () => {
        this.setStatus('disconnected');
      };
    } catch (err: any) {
      console.warn('Could not establish WebSocket connection. Falling back to local mode.', err);
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.status === 'room_full') return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 12000);
    this.setStatus('reconnecting');

    this.reconnectTimer = setTimeout(async () => {
      if (this.cachedAuthData) {
        let tokenToUse = this.cachedAuthData.idToken;
        if (this.tokenRefresher) {
          try {
            const fresh = await this.tokenRefresher();
            if (fresh) {
              tokenToUse = fresh;
              this.cachedAuthData.idToken = fresh;
            }
          } catch (e) {
            console.warn('Failed to refresh token before reconnecting:', e);
          }
        }
        this.connect(tokenToUse, this.cachedAuthData.profile, this.tokenRefresher);
      }
    }, delay);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.emit('status_changed', { status, playerCount: this.playerCount });
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 's:room_state': {
        const state: WorldSyncState = msg.payload;
        this.playerCount = state.playerCount;
        this.chatMessages = state.recentChat || [];

        // Hydrate remote players
        this.remotePlayers.clear();
        for (const [pid, p] of Object.entries(state.players)) {
          if (pid !== this.localPlayerId) {
            this.remotePlayers.set(pid, {
              id: p.playerId,
              name: p.playerName,
              gender: p.gender,
              tileX: p.positionX,
              tileY: p.positionY,
              targetTileX: p.positionX,
              targetTileY: p.positionY,
              worldX: 0,
              worldY: 0,
              direction: p.facingDirection,
              isMoving: p.movementState === 'walking',
              action: p.movementState === 'fishing' ? 'fishing' : p.animationState === 'fishing' ? 'fishing' : 'idle',
              color: p.color,
            });
          }
        }

        this.emit('room_state', state);
        break;
      }

      case 's:room_full': {
        this.setStatus('room_full');
        this.errorMessage = msg.payload.message;
        break;
      }

      case 's:player_joined': {
        const { player, playerCount } = msg.payload;
        this.playerCount = playerCount;

        if (player.playerId !== this.localPlayerId) {
          this.remotePlayers.set(player.playerId, {
            id: player.playerId,
            name: player.playerName,
            gender: player.gender,
            tileX: player.positionX,
            tileY: player.positionY,
            targetTileX: player.positionX,
            targetTileY: player.positionY,
            worldX: 0,
            worldY: 0,
            direction: player.facingDirection,
            isMoving: player.movementState === 'walking',
            action: player.movementState === 'fishing' ? 'fishing' : 'idle',
            color: player.color,
          });
        }

        this.emit('player_joined', msg.payload);
        break;
      }

      case 's:player_left': {
        const { playerId, playerCount } = msg.payload;
        this.playerCount = playerCount;
        this.remotePlayers.delete(playerId);
        this.emit('player_left', msg.payload);
        break;
      }

      case 's:player_moved': {
        const { playerId, x, y, direction, isMoving, action } = msg.payload;
        if (playerId === this.localPlayerId) return;

        const peer = this.remotePlayers.get(playerId);
        if (peer) {
          peer.targetTileX = x;
          peer.targetTileY = y;
          peer.direction = direction;
          peer.isMoving = isMoving;
          if (action !== undefined) {
            peer.action = action;
          } else if (isMoving) {
            peer.action = 'idle';
          }
        }

        this.emit('player_moved', msg.payload);
        break;
      }

      case 's:resource_harvested': {
        this.emit('resource_harvested', msg.payload);
        break;
      }

      case 's:resource_respawned': {
        this.emit('resource_respawned', msg.payload);
        break;
      }

      case 's:building_placed': {
        this.emit('building_placed', msg.payload.building);
        break;
      }

      case 's:building_dismantled': {
        this.emit('building_dismantled', msg.payload);
        break;
      }

      case 's:chat': {
        this.chatMessages.push(msg.payload);
        if (this.chatMessages.length > 50) this.chatMessages.shift();
        this.emit('chat_message', msg.payload);
        break;
      }

      case 's:auth_error': {
        this.setStatus('auth_error');
        this.errorMessage = msg.payload.message;
        this.emit('auth_error', msg.payload);
        break;
      }

      case 's:error': {
        if (msg.payload.code === 'AUTH_FAILED') {
          this.setStatus('auth_error');
          this.errorMessage = msg.payload.message;
        }
        console.warn('Multiplayer Server error:', msg.payload.message);
        break;
      }
    }
  }

  public send(msg: ClientMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(msg));
      } catch (e) {
        console.error('Failed to send WS message:', e);
      }
    }
  }

  /**
   * Broadcast local player movement (rate-limited to 10-12 updates/sec)
   */
  public broadcastPosition(
    tileX: number,
    tileY: number,
    direction: 'down' | 'left' | 'right' | 'up',
    isMoving: boolean,
    action: 'idle' | 'gathering' | 'building' | 'fishing' = 'idle'
  ): void {
    const now = Date.now();
    if (now - this.lastMoveSendTime < 80) return; // ~12 updates per second
    this.lastMoveSendTime = now;

    this.send({
      type: 'c:player_move',
      payload: {
        x: Math.round(tileX * 10) / 10,
        y: Math.round(tileY * 10) / 10,
        direction,
        isMoving,
        action,
      },
    });
  }

  /**
   * Immediately broadcast an action state change (e.g. starting/stopping fishing)
   */
  public broadcastActionState(
    tileX: number,
    tileY: number,
    direction: 'down' | 'left' | 'right' | 'up',
    action: 'idle' | 'gathering' | 'building' | 'fishing'
  ): void {
    this.lastMoveSendTime = Date.now();
    this.send({
      type: 'c:player_move',
      payload: {
        x: Math.round(tileX * 10) / 10,
        y: Math.round(tileY * 10) / 10,
        direction,
        isMoving: false,
        action,
      },
    });
  }

  /**
   * Request shared resource harvest
   */
  public broadcastHarvest(nodeId: string): void {
    this.send({
      type: 'c:gather_request',
      payload: { nodeId },
    });
  }

  /**
   * Broadcast newly placed building
   */
  public broadcastBuilding(building: PlacedBuilding): void {
    this.send({
      type: 'c:build_request',
      payload: { building },
    });
  }

  /**
   * Request building dismantle
   */
  public broadcastDismantle(buildingId: string): void {
    this.send({
      type: 'c:dismantle_request',
      payload: { buildingId },
    });
  }

  /**
   * Send room chat message
   */
  public sendChatMessage(text: string): void {
    const clean = text.trim().slice(0, 120);
    if (!clean) return;

    this.send({
      type: 'c:chat',
      payload: { text: clean },
    });
  }

  public getOnlinePlayers(): RemotePlayer[] {
    return Array.from(this.remotePlayers.values());
  }

  public on(eventType: NetworkEventType, callback: (event: NetworkEvent) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(callback);
    return () => this.off(eventType, callback);
  }

  public off(eventType: NetworkEventType, callback: (event: NetworkEvent) => void): void {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      this.listeners.set(eventType, handlers.filter((h) => h !== callback));
    }
  }

  public emit(eventType: NetworkEventType, payload: any): void {
    const event: NetworkEvent = {
      type: eventType,
      payload,
      timestamp: Date.now(),
    };
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      for (const h of handlers) {
        h(event);
      }
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus('disconnected');
    this.remotePlayers.clear();
  }
}
