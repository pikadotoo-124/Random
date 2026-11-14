/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PlacedBuilding } from '../types';

export interface PlayerPresenceState {
  playerId: string; // Firebase UID
  playerName: string;
  gender: 'male' | 'female';
  positionX: number; // tileX
  positionY: number; // tileY
  facingDirection: 'down' | 'left' | 'right' | 'up';
  movementState: 'idle' | 'walking' | 'fishing';
  animationState?: 'none' | 'gathering' | 'building' | 'fishing';
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

export interface WorldSyncState {
  roomName: string;
  maxPlayers: number;
  playerCount: number;
  players: Record<string, PlayerPresenceState>;
  depletedResources: Record<string, number>; // nodeId -> respawnTimestamp
  placedBuildings: PlacedBuilding[];
  recentChat: ChatMessage[];
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
      };
    }
  | {
      type: 'c:dismantle_request';
      payload: {
        buildingId: string;
      };
    }
  | {
      type: 'c:chat';
      payload: {
        text: string;
      };
    }
  | {
      type: 'c:ping';
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
      type: 's:pong';
    }
  | {
      type: 's:error';
      payload: {
        code: string;
        message: string;
      };
    };
