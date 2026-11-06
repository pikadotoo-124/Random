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
  ClientMessage,
  PlayerPresenceState,
  ServerMessage,
  WorldSyncState,
  ChatMessage,
} from './src/game/multiplayer/types';
import { PlacedBuilding } from './src/game/types';
import { verifyFirebaseIdToken } from './server/auth/tokenVerifier';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function createServer() {
  const app = express();
  const server = http.createServer(app);

  // Authoritative Room State (random-city-main, max 10 players)
  const roomName = 'random-city-main';
  const maxPlayers = 10;
  const players = new Map<string, PlayerPresenceState>();
  const sockets = new Map<WebSocket, string>(); // ws -> playerId
  const depletedResources = new Map<string, number>(); // nodeId -> respawnAt
  const placedBuildings: PlacedBuilding[] = [];
  const chatHistory: ChatMessage[] = [];

  // WebSocket Server on /ws
  const wss = new WebSocketServer({ server, path: '/ws' });

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

  // Periodic resource respawn checker
  setInterval(() => {
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
            if (players.size >= maxPlayers) {
              ws.send(JSON.stringify({
                type: 's:room_full',
                payload: { message: 'Room capacity reached (10/10).', maxPlayers },
              }));
              ws.close(1008, 'Room full');
              return;
            }

            const { idToken, profile } = msg.payload;

            // Cryptographically verify Firebase ID Token using Google JWKS
            const projectId = process.env.FIREBASE_PROJECT_ID || 'intrepid-cyclist-mbvhw';
            const authResult = await verifyFirebaseIdToken(idToken, projectId);

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
            const playerName = (profile?.name || authResult.claims.name || 'Settler').slice(0, 16);

            // Close any existing stale socket for this user
            for (const [s, pid] of sockets.entries()) {
              if (pid === verifiedUid && s !== ws) {
                try {
                  s.close(1000, 'Replaced by new session');
                } catch (e) {}
                sockets.delete(s);
              }
            }

            const newPlayer: PlayerPresenceState = {
              playerId: verifiedUid,
              playerName,
              gender: profile.gender || 'male',
              positionX: Math.max(0, Math.min(59, profile.positionX || 30)),
              positionY: Math.max(0, Math.min(59, profile.positionY || 30)),
              facingDirection: 'down',
              movementState: 'idle',
              color: profile.gender === 'female' ? '#10b981' : '#3b82f6',
              lastUpdate: Date.now(),
            };

            players.set(verifiedUid, newPlayer);
            sockets.set(ws, verifiedUid);

            // 1. Send authoritative room state to joining player
            const syncState: WorldSyncState = {
              roomName,
              maxPlayers,
              playerCount: players.size,
              players: Object.fromEntries(players),
              depletedResources: Object.fromEntries(depletedResources),
              placedBuildings: [...placedBuildings],
              recentChat: chatHistory.slice(-20),
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

            const targetX = Math.max(0, Math.min(59, msg.payload.x));
            const targetY = Math.max(0, Math.min(59, msg.payload.y));

            player.positionX = targetX;
            player.positionY = targetY;
            player.facingDirection = msg.payload.direction;
            player.movementState = msg.payload.isMoving ? 'walking' : 'idle';
            player.lastUpdate = Date.now();

            broadcast({
              type: 's:player_moved',
              payload: {
                playerId,
                x: targetX,
                y: targetY,
                direction: msg.payload.direction,
                isMoving: msg.payload.isMoving,
              },
            }, ws);
            break;
          }

          case 'c:gather_request': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const { nodeId } = msg.payload;
            const now = Date.now();

            const depletedUntil = depletedResources.get(nodeId);
            if (depletedUntil && depletedUntil > now) return;

            const duration = nodeId.includes('tree') ? 25000 : nodeId.includes('rock') ? 30000 : 20000;
            const respawnAt = now + duration;
            depletedResources.set(nodeId, respawnAt);

            broadcast({
              type: 's:resource_harvested',
              payload: {
                nodeId,
                respawnAt,
                harvestedBy: playerId,
              },
            });
            break;
          }

          case 'c:build_request': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const { building } = msg.payload;
            if (!building) return;

            building.placedBy = playerId;
            placedBuildings.push(building);

            broadcast({
              type: 's:building_placed',
              payload: { building },
            });
            break;
          }

          case 'c:dismantle_request': {
            const playerId = sockets.get(ws);
            if (!playerId) return;
            const { buildingId } = msg.payload;
            const idx = placedBuildings.findIndex((b) => b.id === buildingId);
            if (idx === -1) return;

            if (placedBuildings[idx].placedBy !== playerId) {
              ws.send(JSON.stringify({
                type: 's:error',
                payload: { code: 'FORBIDDEN', message: 'You can only dismantle your own structures.' },
              }));
              return;
            }

            placedBuildings.splice(idx, 1);
            broadcast({
              type: 's:building_dismantled',
              payload: { buildingId },
            });
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

          case 'c:ping': {
            ws.send(JSON.stringify({ type: 's:pong' }));
            break;
          }
        }
      } catch (err) {
        console.error('Server WebSocket error:', err);
      }
    });

    const handleDisconnect = () => {
      const playerId = sockets.get(ws);
      if (!playerId) return;

      sockets.delete(ws);
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
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      playersOnline: players.size,
      maxPlayers,
      room: roomName,
    });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Random City] Server listening on http://0.0.0.0:${PORT} (WebSocket on /ws)`);
  });
}

createServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
