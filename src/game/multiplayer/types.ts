/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ActionToolKind,
  EquippedClothingState,
  FarmPlotOwnerRecord,
  FarmPlotOwnersMap,
  InventorySlot,
  ItemId,
  PlacedBuilding,
} from '../types';

export interface PlayerPresenceState {
  playerId: string; // Firebase UID
  playerName: string;
  gender: 'male' | 'female';
  positionX: number; // tileX
  positionY: number; // tileY
  facingDirection: 'down' | 'left' | 'right' | 'up';
  movementState: 'idle' | 'walking' | 'fishing';
  animationState?: 'none' | 'gathering' | 'building' | 'fishing';
  actionTool?: ActionToolKind;
  equippedClothing?: EquippedClothingState;
  seatedBenchId?: string;
  seatedSeatIndex?: 0 | 1;
  color: string;
  lastUpdate: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface ActiveAnnouncement {
  id: string;
  message: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorldSyncState {
  roomName: string;
  maxPlayers: number;
  playerCount: number;
  players: Record<string, PlayerPresenceState>;
  depletedResources: Record<string, number>; // nodeId -> respawnTimestamp
  placedBuildings: PlacedBuilding[];
  farmPlotOwners?: FarmPlotOwnersMap;
  goldBalance?: number;
  goldLedgerVerified?: boolean;
  inventorySlots?: InventorySlot[];
  inventoryVerified?: boolean;
  ownedClothing?: string[];
  benchSeats?: Record<string, [string | null, string | null]>;
  recentChat: ChatMessage[];
  officialResetEpoch?: string | null;
  activeAnnouncement?: ActiveAnnouncement | null;
}

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'room_full'
  | 'auth_error';

export type ClientMessage =
  | {
      type: 'c:auth_join';
      payload: {
        idToken: string;
        profile: {
          name: string;
          gender: 'male' | 'female';
          positionX: number;
          positionY: number;
          facingDirection?: 'down' | 'left' | 'right' | 'up';
          equippedClothing?: EquippedClothingState;
          coins?: number;
        };
      };
    }
  | {
      type: 'c:player_move';
      payload: {
        x: number;
        y: number;
        direction: 'down' | 'left' | 'right' | 'up';
        isMoving: boolean;
        action?: 'idle' | 'gathering' | 'building' | 'fishing';
        actionTool?: ActionToolKind;
      };
    }
  | {
      type: 'c:gather_request';
      payload: {
        nodeId: string;
        toolUsed?: string;
      };
    }
  | {
      type: 'c:build_request';
      payload: {
        building: PlacedBuilding;
        useRawFenceMaterials?: boolean;
      };
    }
  | {
      type: 'c:dismantle_request';
      payload: {
        buildingId: string;
      };
    }
  | {
      type: 'c:craft_request';
      payload: {
        txId?: string;
        recipeId: string;
      };
    }
  | {
      type: 'c:storage_transfer';
      payload: {
        txId?: string;
        buildingId: string;
        direction: 'deposit' | 'withdraw';
        itemId: ItemId | string;
        quantity?: number;
      };
    }
  | {
      type: 'c:chat';
      payload: {
        text: string;
      };
    }
  | {
      type: 'c:outfit_update';
      payload: {
        equippedClothing: EquippedClothingState;
      };
    }
  | {
      type: 'c:bench_sit';
      payload: {
        benchId: string;
        seatIndex?: 0 | 1;
      };
    }
  | {
      type: 'c:bench_stand';
      payload: Record<string, never>;
    }
  | {
      type: 'c:buy_farm_plot';
      payload: {
        plotId: string;
      };
    }
  | {
      type: 'c:shop_trade';
      payload: {
        txId?: string;
        action: 'sell_item' | 'buy_item' | 'buy_clothing';
        itemId: string;
        quantity?: number;
      };
    }
  | {
      type: 'c:fishing_start';
      payload: {
        nodeId: string;
        sessionId: string;
      };
    }
  | {
      type: 'c:fishing_catch';
      payload: {
        nodeId: string;
        sessionId: string;
        inSuccessZone: boolean;
      };
    };

export type ServerMessage =
  | {
      type: 's:room_state';
      payload: WorldSyncState;
    }
  | {
      type: 's:room_full';
      payload: {
        message: string;
        maxPlayers: number;
      };
    }
  | {
      type: 's:auth_error';
      payload: {
        message: string;
      };
    }
  | {
      type: 's:player_joined';
      payload: {
        player: PlayerPresenceState;
        playerCount: number;
      };
    }
  | {
      type: 's:player_left';
      payload: {
        playerId: string;
        playerCount: number;
      };
    }
  | {
      type: 's:player_moved';
      payload: {
        playerId: string;
        x: number;
        y: number;
        direction: 'down' | 'left' | 'right' | 'up';
        isMoving: boolean;
        action?: 'idle' | 'gathering' | 'building' | 'fishing';
        actionTool?: ActionToolKind;
      };
    }
  | {
      type: 's:resource_harvested';
      payload: {
        nodeId: string;
        respawnAt: number;
        harvestedBy: string;
      };
    }
  | {
      type: 's:resource_respawned';
      payload: {
        nodeId: string;
      };
    }
  | {
      type: 's:building_placed';
      payload: {
        building: PlacedBuilding;
      };
    }
  | {
      type: 's:building_dismantled';
      payload: {
        buildingId: string;
      };
    }
  | {
      type: 's:chat';
      payload: ChatMessage;
    }
  | {
      type: 's:player_outfit';
      payload: {
        playerId: string;
        equippedClothing: EquippedClothingState;
      };
    }
  | {
      type: 's:official_reset';
      payload: {
        epoch: string;
        message: string;
      };
    }
  | {
      type: 's:bench_state';
      payload: {
        benchSeats: Record<string, [string | null, string | null]>;
      };
    }
  | {
      type: 's:build_rejected';
      payload: {
        buildingId: string;
        code: string;
        message: string;
        isMove?: boolean;
        prevBuilding?: PlacedBuilding;
        inventorySlots?: InventorySlot[];
      };
    }
  | {
      type: 's:dismantle_rejected';
      payload: {
        buildingId: string;
        code: string;
        message: string;
        building?: PlacedBuilding;
        inventorySlots?: InventorySlot[];
      };
    }
  | {
      type: 's:farm_plot_purchase_result';
      payload: {
        ok: boolean;
        plotId: string;
        code?: string;
        message: string;
        owner?: FarmPlotOwnerRecord;
        remainingGold?: number;
      };
    }
  | {
      type: 's:farm_plot_updated';
      payload: {
        plotId: string;
        owner: FarmPlotOwnerRecord;
        farmPlotOwners: FarmPlotOwnersMap;
      };
    }
  | {
      type: 's:shop_trade_result';
      payload: {
        ok: boolean;
        txId?: string;
        action?: 'sell_item' | 'buy_item' | 'buy_clothing';
        itemId?: string;
        quantity?: number;
        balance: number;
        inventorySlots?: InventorySlot[];
        ownedClothing?: string[];
        reason?: string;
        code?: string;
        deduplicated?: boolean;
      };
    }
  | {
      type: 's:fishing_result';
      payload: {
        ok: boolean;
        sessionId?: string;
        nodeId: string;
        caught: boolean;
        itemId: 'fish';
        quantity: number;
        respawnAt?: number;
        inventorySlots?: InventorySlot[];
        reason?: string;
        code?: string;
      };
    }
  | {
      type: 's:inventory_sync';
      payload: {
        ok?: boolean;
        inventorySlots: InventorySlot[];
        reason?: string;
        code?: string;
      };
    }
  | {
      type: 's:craft_result';
      payload: {
        ok: boolean;
        txId?: string;
        recipeId: string;
        resultItem?: ItemId;
        resultCount?: number;
        inventorySlots: InventorySlot[];
        reason?: string;
        code?: string;
        deduplicated?: boolean;
      };
    }
  | {
      type: 's:storage_transfer_result';
      payload: {
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
      };
    }
  | {
      type: 's:announcement';
      payload: {
        announcement: ActiveAnnouncement | null;
      };
    }
  | {
      type: 's:kicked';
      payload: {
        reason: string;
        kickedAt: string;
      };
    }
  | {
      type: 's:banned';
      payload: {
        reason: string;
        bannedAt: string;
      };
    }
  | {
      type: 's:error';
      payload: {
        code: string;
        message: string;
      };
    };
