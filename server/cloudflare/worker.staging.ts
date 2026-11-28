/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameRoomDO, StagingEnv } from './GameRoomDO';

/**
 * Dedicated Durable Object class for Staging so Cloudflare provisions a completely
 * separate SQLite storage namespace (`random-city-multiplayer-staging_GameRoomStagingDO`)
 * isolated from Production (`random-city-multiplayer_GameRoomDO`).
 */
export class GameRoomStagingDO extends GameRoomDO {}

export default {
  async fetch(request: Request, env: StagingEnv): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint (exposes staging identity without any secret values)
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'random-city-multiplayer-staging',
          environment: env.APP_ENV || 'staging',
          doBinding: 'GAME_ROOM_STAGING',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Route WebSocket upgrade, Player Save, Session Check & API endpoints strictly to isolated Staging DO
    if (
      url.pathname === '/ws' ||
      url.pathname === '/ws/' ||
      url.pathname.startsWith('/api/player/') ||
      url.pathname === '/api/launch-status' ||
      url.pathname === '/api/session/check' ||
      url.pathname.startsWith('/api/admin/')
    ) {
      if (!env.GAME_ROOM_STAGING) {
        return new Response(
          JSON.stringify({
            ok: false,
            code: 'STAGING_DO_BINDING_MISSING',
            error: 'GAME_ROOM_STAGING Durable Object binding is missing in staging runtime.',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const id = env.GAME_ROOM_STAGING.idFromName('random-city-staging-main');
      const roomObject = env.GAME_ROOM_STAGING.get(id);
      return roomObject.fetch(request);
    }

    // Serve isolated staging Vite/Phaser bundle from ./dist-staging
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Random City Cloudflare Staging Worker', { status: 200 });
  },
};
