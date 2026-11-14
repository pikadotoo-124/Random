/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameRoomDO, Env } from './GameRoomDO';

export { GameRoomDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade endpoint for Random City multiplayer room
    if (url.pathname === '/ws' || url.pathname === '/ws/') {
      // Single authoritative room for random-city-main
      const id = env.GAME_ROOM.idFromName('random-city-main');
      const roomObject = env.GAME_ROOM.get(id);
      return roomObject.fetch(request);
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'random-city-multiplayer' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Serve built Vite/Phaser frontend static assets & SPA routes
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Random City Cloudflare Multiplayer Worker', { status: 200 });
  },
};
