/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ActiveAnnouncement,
  ChatMessage,
  ClientMessage,
  ConnectionStatus,
  PlayerPresenceState,
  ServerMessage,
  WorldSyncState,
} from '../multiplayer/types';
import {
  ActionToolKind,
  EquippedClothingState,
  FarmPlotOwnersMap,
  InventorySlot,
  ItemId,
  PlacedBuilding,
} from '../types';
import { ClothingSystem } from './ClothingSystem';

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
  actionTool?: ActionToolKind;
  equippedClothing?: EquippedClothingState;
  seatedBenchId?: string;
  seatedSeatIndex?: 0 | 1;
  color: string;
}

export type NetworkEventType =
  | 'status_changed'
  | 'player_joined'
  | 'player_moved'
  | 'player_outfit'
  | 'player_left'
  | 'building_placed'
  | 'building_dismantled'
  | 'build_rejected'
  | 'dismantle_rejected'
  | 'farm_plot_updated'
  | 'farm_plot_purchase_result'
  | 'shop_trade_result'
  | 'fishing_result'
  | 'inventory_sync'
  | 'craft_result'
  | 'storage_transfer_result'
  | 'bench_state'
  | 'resource_harvested'
  | 'resource_respawned'
  | 'chat_message'
  | 'room_state'
  | 'world_sync'
  | 'official_reset'
  | 'auth_error'
  | 'announcement'
  | 'kicked'
  | 'banned';

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
  public benchSeats = new Map<string, [string | null, string | null]>();
  public farmPlotOwners: FarmPlotOwnersMap = {};
  public chatMessages: ChatMessage[] = [];
  public errorMessage: string | null = null;
  public lastRoomState: WorldSyncState | null = null;
  public activeAnnouncement: ActiveAnnouncement | null = null;

  private listeners = new Map<NetworkEventType, ((event: NetworkEvent) => void)[]>();
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private lastMoveSendTime = 0;
  private cachedAuthData: { idToken: string; profile: any } | null = null;
  private tokenRefresher?: () => Promise<string>;
  private lastBroadcastOutfitSig: string | null = null;
  private preventReconnect = false;
  private hasSyncedRoomOnce = false;
  private txSeq = 0;

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

  public getServerHttpBaseUrl(): string {
    const envWsUrl = (import.meta as any).env?.VITE_WS_URL;
    if (envWsUrl && typeof envWsUrl === 'string' && envWsUrl.trim()) {
      return envWsUrl
        .trim()
        .replace(/^wss:/i, 'https:')
        .replace(/^ws:/i, 'http:')
        .replace(/\/ws\/?$/i, '');
    }
    return '';
  }

  /**
   * Connect to authoritative multiplayer room with Firebase Auth credentials
   */
  public connect(
    idToken: string,
    profile: {
      name: string;
      gender: 'male' | 'female';
      positionX: number;
      positionY: number;
      facingDirection?: 'down' | 'left' | 'right' | 'up';
      equippedClothing?: EquippedClothingState;
      coins?: number;
    },
    tokenRefresher?: () => Promise<string>
  ): void {
    const cleanOutfit = ClothingSystem.normalizeEquippedClothing(
      profile.equippedClothing,
      undefined,
      profile.gender
    );
    const normalizedProfile = {
      ...profile,
      equippedClothing: cleanOutfit,
    };
    this.lastBroadcastOutfitSig = ClothingSystem.getOutfitSignature(cleanOutfit);
    this.cachedAuthData = { idToken, profile: normalizedProfile };
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

    this.preventReconnect = false;
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
            profile: normalizedProfile,
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
        if (event.code === 4001 || event.code === 4003 || this.preventReconnect) {
          this.setStatus(event.code === 4003 ? 'auth_error' : 'disconnected');
          return;
        }

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
    if (this.status === 'room_full' || this.preventReconnect) return;
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
        this.lastRoomState = state;
        this.hasSyncedRoomOnce = true;
        this.playerCount = state.playerCount;
        this.chatMessages = state.recentChat || [];
        this.activeAnnouncement = state.activeAnnouncement ?? null;
        this.farmPlotOwners = state.farmPlotOwners ? { ...state.farmPlotOwners } : {};

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
              action:
                p.movementState === 'fishing' || p.animationState === 'fishing'
                  ? 'fishing'
                  : p.animationState === 'gathering'
                  ? 'gathering'
                  : p.animationState === 'building'
                  ? 'building'
                  : 'idle',
              actionTool: p.actionTool,
              equippedClothing: ClothingSystem.normalizeEquippedClothing(
                p.equippedClothing,
                undefined,
                p.gender
              ),
              seatedBenchId: p.seatedBenchId,
              seatedSeatIndex: p.seatedSeatIndex,
              color: p.color,
            });
          }
        }

        this.applyBenchSeatsSnapshot(state.benchSeats);
        this.emit('room_state', state);
        this.emit('announcement', { announcement: this.activeAnnouncement });
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
            action:
              player.movementState === 'fishing' || player.animationState === 'fishing'
                ? 'fishing'
                : player.animationState === 'gathering'
                ? 'gathering'
                : player.animationState === 'building'
                ? 'building'
                : 'idle',
            actionTool: player.actionTool,
            equippedClothing: ClothingSystem.normalizeEquippedClothing(
              player.equippedClothing,
              undefined,
              player.gender
            ),
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
        for (const pair of this.benchSeats.values()) {
          if (pair[0] === playerId) pair[0] = null;
          if (pair[1] === playerId) pair[1] = null;
        }
        this.emit('player_left', msg.payload);
        break;
      }

      case 's:player_moved': {
        const { playerId, x, y, direction, isMoving, action, actionTool } = msg.payload;
        if (playerId === this.localPlayerId) return;

        const peer = this.remotePlayers.get(playerId);
        if (peer) {
          peer.targetTileX = x;
          peer.targetTileY = y;
          peer.direction = direction;
          peer.isMoving = isMoving;
          if (action !== undefined) {
            peer.action = action;
            peer.actionTool = action === 'gathering' ? actionTool : undefined;
          } else if (isMoving) {
            peer.action = 'idle';
            peer.actionTool = undefined;
          }
        }

        this.emit('player_moved', msg.payload);
        break;
      }

      case 's:player_outfit': {
        const { playerId, equippedClothing } = msg.payload;
        if (playerId === this.localPlayerId) return;

        const peer = this.remotePlayers.get(playerId);
        if (peer) {
          peer.equippedClothing = ClothingSystem.normalizeEquippedClothing(
            equippedClothing,
            undefined,
            peer.gender
          );
          this.emit('player_outfit', {
            playerId,
            equippedClothing: peer.equippedClothing,
          });
        }
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

      case 's:official_reset': {
        this.emit('official_reset', msg.payload);
        break;
      }

      case 's:bench_state': {
        this.applyBenchSeatsSnapshot(msg.payload.benchSeats);
        this.emit('bench_state', msg.payload);
        break;
      }

      case 's:build_rejected': {
        this.emit('build_rejected', msg.payload);
        break;
      }

      case 's:dismantle_rejected': {
        this.emit('dismantle_rejected', msg.payload);
        break;
      }

      case 's:farm_plot_purchase_result': {
        if (msg.payload?.ok && msg.payload?.owner && msg.payload?.plotId) {
          this.farmPlotOwners = {
            ...this.farmPlotOwners,
            [msg.payload.plotId]: msg.payload.owner,
          };
        }
        this.emit('farm_plot_purchase_result', msg.payload);
        break;
      }

      case 's:farm_plot_updated': {
        this.farmPlotOwners = msg.payload?.farmPlotOwners
          ? { ...msg.payload.farmPlotOwners }
          : msg.payload?.plotId && msg.payload?.owner
          ? { ...this.farmPlotOwners, [msg.payload.plotId]: msg.payload.owner }
          : this.farmPlotOwners;
        this.emit('farm_plot_updated', msg.payload);
        break;
      }

      case 's:shop_trade_result': {
        this.emit('shop_trade_result', msg.payload);
        break;
      }

      case 's:fishing_result': {
        this.emit('fishing_result', msg.payload);
        break;
      }

      case 's:inventory_sync': {
        this.emit('inventory_sync', msg.payload);
        break;
      }

      case 's:craft_result': {
        this.emit('craft_result', msg.payload);
        break;
      }

      case 's:storage_transfer_result': {
        this.emit('storage_transfer_result', msg.payload);
        break;
      }

      case 's:announcement': {
        this.activeAnnouncement = msg.payload?.announcement ?? null;
        this.emit('announcement', { announcement: this.activeAnnouncement });
        break;
      }

      case 's:kicked': {
        this.preventReconnect = true;
        this.errorMessage = msg.payload?.reason || 'Admin မှ ဂိမ်းခန်းမှ ထုတ်ပယ်လိုက်ပါသည်။';
        this.emit('kicked', msg.payload);
        break;
      }

      case 's:banned': {
        this.preventReconnect = true;
        this.setStatus('auth_error');
        this.errorMessage = msg.payload?.reason || 'Admin မှ ဂိမ်းဝင်ခွင့် ပိတ်ပင်ထားပါသည်။';
        this.emit('banned', msg.payload);
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

  private applyBenchSeatsSnapshot(snapshot?: Record<string, [string | null, string | null]>): void {
    this.benchSeats.clear();
    if (snapshot) {
      for (const [benchId, seats] of Object.entries(snapshot)) {
        if (Array.isArray(seats) && seats.length >= 2) {
          this.benchSeats.set(benchId, [seats[0] ?? null, seats[1] ?? null]);
        }
      }
    }
    // Sync seatedBenchId / seatedSeatIndex across remotePlayers
    for (const rp of this.remotePlayers.values()) {
      rp.seatedBenchId = undefined;
      rp.seatedSeatIndex = undefined;
    }
    for (const [benchId, [s0, s1]] of this.benchSeats.entries()) {
      if (s0 && this.remotePlayers.has(s0)) {
        const rp = this.remotePlayers.get(s0)!;
        rp.seatedBenchId = benchId;
        rp.seatedSeatIndex = 0;
      }
      if (s1 && this.remotePlayers.has(s1)) {
        const rp = this.remotePlayers.get(s1)!;
        rp.seatedBenchId = benchId;
        rp.seatedSeatIndex = 1;
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
    action: 'idle' | 'gathering' | 'building' | 'fishing' = 'idle',
    actionTool?: ActionToolKind
  ): void {
    const now = Date.now();
    if (now - this.lastMoveSendTime < 80) return; // ~12 updates per second
    this.lastMoveSendTime = now;

    this.send({
      type: 'c:player_move',
      payload: {
        x: Math.round(tileX * 100) / 100,
        y: Math.round(tileY * 100) / 100,
        direction,
        isMoving,
        action,
        actionTool,
      },
    });
  }

  /**
   * Immediately broadcast an action state change (e.g. starting/stopping fishing or gathering)
   */
  public broadcastActionState(
    tileX: number,
    tileY: number,
    direction: 'down' | 'left' | 'right' | 'up',
    action: 'idle' | 'gathering' | 'building' | 'fishing',
    actionTool?: ActionToolKind
  ): void {
    this.lastMoveSendTime = Date.now();
    this.send({
      type: 'c:player_move',
      payload: {
        x: Math.round(tileX * 100) / 100,
        y: Math.round(tileY * 100) / 100,
        direction,
        isMoving: false,
        action,
        actionTool,
      },
    });
  }

  /**
   * Broadcast equipped outfit changes only when the outfit signature actually changes.
   */
  public broadcastOutfit(equippedClothing: EquippedClothingState | undefined | null): boolean {
    const clean = ClothingSystem.normalizeEquippedClothing(
      equippedClothing,
      undefined,
      this.cachedAuthData?.profile?.gender
    );
    if (this.cachedAuthData?.profile) {
      this.cachedAuthData.profile.equippedClothing = clean;
    }

    const sig = ClothingSystem.getOutfitSignature(clean);
    if (sig === this.lastBroadcastOutfitSig) {
      return false;
    }
    this.lastBroadcastOutfitSig = sig;

    this.send({
      type: 'c:outfit_update',
      payload: { equippedClothing: clean },
    });
    return true;
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
   * Register an authoritative fishing cast session with the multiplayer server.
   */
  public startFishingSession(nodeId: string, sessionId: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.send({
      type: 'c:fishing_start',
      payload: { nodeId, sessionId },
    });
    return true;
  }

  /**
   * Submit a catch attempt; server ignores client amounts and decides 3 fish (success) or 0 fish (miss).
   */
  public claimFishingCatch(nodeId: string, sessionId: string, inSuccessZone: boolean): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.send({
      type: 'c:fishing_catch',
      payload: { nodeId, sessionId, inSuccessZone: Boolean(inSuccessZone) },
    });
    return true;
  }

  /**
   * Broadcast newly placed building
   */
  public broadcastBuilding(building: PlacedBuilding, useRawFenceMaterials?: boolean): void {
    this.send({
      type: 'c:build_request',
      payload: useRawFenceMaterials ? { building, useRawFenceMaterials: true } : { building },
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
   * Purchase an unowned Farming Plot via authoritative server Gold check
   */
  public buyFarmPlot(plotId: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.send({
      type: 'c:buy_farm_plot',
      payload: { plotId },
    });
    return true;
  }

  /**
   * Execute verified shop/clothing trade online and wait for server confirmation (no offline queueing).
   */
  public executeShopTrade(
    action: 'sell_item' | 'buy_item' | 'buy_clothing',
    itemId: string,
    quantity = 1
  ): Promise<{
    ok: boolean;
    txId?: string;
    action?: 'sell_item' | 'buy_item' | 'buy_clothing';
    itemId?: string;
    quantity?: number;
    balance?: number;
    inventorySlots?: InventorySlot[];
    ownedClothing?: string[];
    reason?: string;
    code?: string;
  }> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.status !== 'connected') {
      return Promise.resolve({
        ok: false,
        action,
        itemId,
        code: 'OFFLINE',
        reason: 'အွန်လိုင်းဆာဗာနှင့် ချိတ်ဆက်ထားမှသာ ဈေးဝယ်/ရောင်းချနိုင်ပါသည်',
      });
    }

    const cleanQty = Math.max(1, Math.min(99, Math.floor(Number.isFinite(quantity) ? quantity : 1)));
    this.txSeq += 1;
    const txId = `tx_${Date.now()}_${this.txSeq}`;

    return new Promise((resolve) => {
      let settled = false;
      let unsubResult: (() => void) | null = null;
      let unsubStatus: (() => void) | null = null;

      const finish = (res: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubResult?.();
        unsubStatus?.();
        resolve(res);
      };

      const timer = setTimeout(() => {
        finish({
          ok: false,
          txId,
          action,
          itemId,
          quantity: cleanQty,
          code: 'TIMEOUT',
          reason: 'ဆာဗာမှ တုံ့ပြန်မှု ကြာမြင့်နေပါသည် — ထပ်မံကြိုးစားပါ',
        });
      }, 8000);

      unsubResult = this.on('shop_trade_result', (evt) => {
        const p = evt.payload;
        if (!p) return;
        if (p.txId && p.txId !== txId) return;
        finish(p);
      });

      unsubStatus = this.on('status_changed', (evt) => {
        const st = evt.payload?.status || evt.payload;
        if (st !== 'connected') {
          finish({
            ok: false,
            txId,
            action,
            itemId,
            quantity: cleanQty,
            code: 'OFFLINE',
            reason: 'ချိတ်ဆက်မှု ပြတ်တောက်သွားပါသည်',
          });
        }
      });

      this.send({
        type: 'c:shop_trade',
        payload: { txId, action, itemId, quantity: cleanQty },
      });
    });
  }

  /**
   * Request authoritative crafting via WebSocket server.
   */
  public requestCraft(recipeId: string): Promise<{
    ok: boolean;
    txId?: string;
    recipeId: string;
    resultItem?: ItemId;
    resultCount?: number;
    inventorySlots?: InventorySlot[];
    reason?: string;
    code?: string;
  }> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.status !== 'connected') {
      return Promise.resolve({
        ok: false,
        recipeId,
        code: 'OFFLINE',
        reason: 'Offline mode',
      });
    }

    this.txSeq += 1;
    const txId = `craft_${Date.now()}_${this.txSeq}`;

    return new Promise((resolve) => {
      let settled = false;
      let unsubResult: (() => void) | null = null;
      let unsubStatus: (() => void) | null = null;

      const finish = (res: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubResult?.();
        unsubStatus?.();
        resolve(res);
      };

      const timer = setTimeout(() => {
        finish({
          ok: false,
          txId,
          recipeId,
          code: 'TIMEOUT',
          reason: 'ဆာဗာမှ တုံ့ပြန်မှု ကြာမြင့်နေပါသည်',
        });
      }, 8000);

      unsubResult = this.on('craft_result', (evt) => {
        const p = evt.payload;
        if (!p) return;
        if (p.txId && p.txId !== txId) return;
        finish(p);
      });

      unsubStatus = this.on('status_changed', (evt) => {
        const st = evt.payload?.status || evt.payload;
        if (st !== 'connected') {
          finish({
            ok: false,
            txId,
            recipeId,
            code: 'OFFLINE',
            reason: 'ချိတ်ဆက်မှု ပြတ်တောက်သွားပါသည်',
          });
        }
      });

      this.send({
        type: 'c:craft_request',
        payload: { txId, recipeId },
      });
    });
  }

  /**
   * Request authoritative Storage Box deposit / withdraw via WebSocket server.
   */
  public requestStorageTransfer(
    buildingId: string,
    direction: 'deposit' | 'withdraw',
    itemId: ItemId,
    quantity = 1
  ): Promise<{
    ok: boolean;
    txId?: string;
    buildingId: string;
    direction: 'deposit' | 'withdraw';
    itemId: string;
    quantity: number;
    inventorySlots?: InventorySlot[];
    storage?: InventorySlot[];
    reason?: string;
    code?: string;
  }> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.status !== 'connected') {
      return Promise.resolve({
        ok: false,
        buildingId,
        direction,
        itemId,
        quantity,
        code: 'OFFLINE',
        reason: 'Offline mode',
      });
    }

    const cleanQty = Math.max(1, Math.min(99, Math.floor(Number.isFinite(quantity) ? quantity : 1)));
    this.txSeq += 1;
    const txId = `st_${Date.now()}_${this.txSeq}`;

    return new Promise((resolve) => {
      let settled = false;
      let unsubResult: (() => void) | null = null;
      let unsubStatus: (() => void) | null = null;

      const finish = (res: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubResult?.();
        unsubStatus?.();
        resolve(res);
      };

      const timer = setTimeout(() => {
        finish({
          ok: false,
          txId,
          buildingId,
          direction,
          itemId,
          quantity: cleanQty,
          code: 'TIMEOUT',
          reason: 'ဆာဗာမှ တုံ့ပြန်မှု ကြာမြင့်နေပါသည်',
        });
      }, 8000);

      unsubResult = this.on('storage_transfer_result', (evt) => {
        const p = evt.payload;
        if (!p) return;
        if (p.txId && p.txId !== txId) return;
        finish(p);
      });

      unsubStatus = this.on('status_changed', (evt) => {
        const st = evt.payload?.status || evt.payload;
        if (st !== 'connected') {
          finish({
            ok: false,
            txId,
            buildingId,
            direction,
            itemId,
            quantity: cleanQty,
            code: 'OFFLINE',
            reason: 'ချိတ်ဆက်မှု ပြတ်တောက်သွားပါသည်',
          });
        }
      });

      this.send({
        type: 'c:storage_transfer',
        payload: { txId, buildingId, direction, itemId, quantity: cleanQty },
      });
    });
  }

  /**
   * Request sitting on a lakeside 2-seater bench
   */
  public sitOnBench(benchId: string, seatIndex?: 0 | 1): void {
    this.send({
      type: 'c:bench_sit',
      payload: { benchId, seatIndex },
    });
  }

  /**
   * Notify server when standing up from a bench
   */
  public standFromBench(): void {
    this.send({
      type: 'c:bench_stand',
      payload: {},
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
    this.preventReconnect = true;
    this.cachedAuthData = null;
    this.tokenRefresher = undefined;
    this.lastBroadcastOutfitSig = null;
    this.activeAnnouncement = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
    this.setStatus('disconnected');
    this.remotePlayers.clear();
    this.benchSeats.clear();
    this.farmPlotOwners = {};
    this.hasSyncedRoomOnce = false;
    this.lastRoomState = null;
  }
}
