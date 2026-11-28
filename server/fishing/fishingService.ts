/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const FISHING_CATCH_REWARD = 3;
export const FISHING_RESPAWN_MS = 20000;
export const MIN_FISHING_WAIT_MS = 1800;
export const MAX_FISHING_SESSION_AGE_MS = 60000;

export interface ActiveFishingCast {
  sessionId: string;
  playerId: string;
  nodeId: string;
  startedAt: number;
  claimed: boolean;
}

export interface FishingStartResult {
  ok: boolean;
  sessionId?: string;
  nodeId?: string;
  code?: string;
  reason?: string;
}

export interface FishingClaimResult {
  ok: boolean;
  sessionId?: string;
  nodeId: string;
  caught: boolean;
  itemId: 'fish';
  quantity: number;
  respawnAt?: number;
  code?: string;
  reason?: string;
}

/**
 * Pure runtime-agnostic authoritative fishing session tracker.
 * Used identically by Node Express `/ws` and Cloudflare Durable Objects (`esbuild --platform=neutral`).
 * Prevents:
 * - Client-injected fish quantities (always ignores client amounts, strictly awards 3 on success or 0 on miss)
 * - Duplicate/replay `sessionId` claims (6/9 fish exploit)
 * - Instant zero-wait catch spoofing (`MIN_FISHING_WAIT_MS`)
 * - Harvesting already-depleted fishing spots
 */
export class FishingSessionTracker {
  private activeCasts = new Map<string, ActiveFishingCast>();
  private recentSessionIds = new Set<string>();
  private validFishingNodes: Set<string> | null;

  constructor(validFishingNodes?: Iterable<string>) {
    this.validFishingNodes = validFishingNodes ? new Set(validFishingNodes) : null;
  }

  public isKnownFishingNode(nodeId: string): boolean {
    if (typeof nodeId !== 'string' || !nodeId.startsWith('res_fish_')) {
      return false;
    }
    if (this.validFishingNodes) {
      return this.validFishingNodes.has(nodeId);
    }
    return true;
  }

  public startCast(params: {
    playerId: string;
    nodeId: string;
    sessionId: string;
    depletedResources: Map<string, number>;
    now?: number;
  }): FishingStartResult {
    const now = params.now ?? Date.now();
    const { playerId, nodeId, sessionId, depletedResources } = params;

    if (!playerId || typeof sessionId !== 'string' || sessionId.trim().length < 6 || sessionId.length > 80) {
      return {
        ok: false,
        code: 'INVALID_SESSION',
        reason: 'ငါးမျှား session မမှန်ကန်ပါ',
      };
    }

    const cleanSessionId = sessionId.trim();
    if (this.recentSessionIds.has(cleanSessionId)) {
      return {
        ok: false,
        code: 'DUPLICATE_SESSION',
        reason: 'ငါးမျှား session ကို ထပ်မံအသုံးပြု၍မရပါ',
      };
    }

    if (!this.isKnownFishingNode(nodeId)) {
      return {
        ok: false,
        code: 'INVALID_NODE',
        reason: 'ငါးမျှားနေရာ မမှန်ကန်ပါ',
      };
    }

    const depletedUntil = depletedResources.get(nodeId);
    if (depletedUntil && depletedUntil > now) {
      return {
        ok: false,
        code: 'NODE_DEPLETED',
        reason: 'ဤနေရာတွင် ငါးပြန်ပေါ်ရန် စောင့်ဆိုင်းနေပါသည်',
      };
    }

    this.activeCasts.set(playerId, {
      sessionId: cleanSessionId,
      playerId,
      nodeId,
      startedAt: now,
      claimed: false,
    });

    return {
      ok: true,
      sessionId: cleanSessionId,
      nodeId,
    };
  }

  public claimCatch(params: {
    playerId: string;
    nodeId: string;
    sessionId: string;
    inSuccessZone: boolean;
    depletedResources: Map<string, number>;
    now?: number;
    canAcceptReward?: (
      quantity: number
    ) => { ok: boolean; code?: string; reason?: string };
  }): FishingClaimResult {
    const now = params.now ?? Date.now();
    const { playerId, nodeId, sessionId, inSuccessZone, depletedResources, canAcceptReward } = params;
    const cleanSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';

    if (!cleanSessionId || this.recentSessionIds.has(cleanSessionId)) {
      return {
        ok: false,
        sessionId: cleanSessionId,
        nodeId,
        caught: false,
        itemId: 'fish',
        quantity: 0,
        code: 'DUPLICATE_CLAIM',
        reason: 'ဤငါးမျှားဆုလာဘ်ကို ထပ်မံတောင်းခံ၍မရပါ',
      };
    }

    const active = this.activeCasts.get(playerId);
    if (!active || active.claimed || active.sessionId !== cleanSessionId || active.nodeId !== nodeId) {
      return {
        ok: false,
        sessionId: cleanSessionId,
        nodeId,
        caught: false,
        itemId: 'fish',
        quantity: 0,
        code: 'NO_ACTIVE_CAST',
        reason: 'တရားဝင် ငါးမျှားကြိုးချထားမှု မရှိပါ',
      };
    }

    const elapsed = now - active.startedAt;
    if (elapsed > MAX_FISHING_SESSION_AGE_MS) {
      this.activeCasts.delete(playerId);
      return {
        ok: false,
        sessionId: cleanSessionId,
        nodeId,
        caught: false,
        itemId: 'fish',
        quantity: 0,
        code: 'SESSION_EXPIRED',
        reason: 'ငါးမျှားချိန် သက်တမ်းကုန်ဆုံးသွားပါပြီ',
      };
    }

    if (inSuccessZone && elapsed < MIN_FISHING_WAIT_MS) {
      return {
        ok: false,
        sessionId: cleanSessionId,
        nodeId,
        caught: false,
        itemId: 'fish',
        quantity: 0,
        code: 'TOO_EARLY',
        reason: 'ငါးကိုက်ချိန် မစောင့်ဘဲ ဆွဲတင်၍မရပါ',
      };
    }

    // Atomically lock and consume session regardless of hit/miss so retries cannot reuse it
    active.claimed = true;
    this.activeCasts.delete(playerId);
    this.recordConsumedSession(cleanSessionId);

    if (!inSuccessZone) {
      return {
        ok: true,
        sessionId: cleanSessionId,
        nodeId,
        caught: false,
        itemId: 'fish',
        quantity: 0,
        reason: 'လွဲသွားသဖြင့် ငါးမမိပါ',
      };
    }

    const depletedUntil = depletedResources.get(nodeId);
    if (depletedUntil && depletedUntil > now) {
      return {
        ok: false,
        sessionId: cleanSessionId,
        nodeId,
        caught: false,
        itemId: 'fish',
        quantity: 0,
        code: 'NODE_DEPLETED',
        reason: 'အခြားကစားသမား ဖမ်းယူပြီးသွားပါပြီ',
      };
    }

    if (canAcceptReward) {
      const capCheck = canAcceptReward(FISHING_CATCH_REWARD);
      if (!capCheck.ok) {
        return {
          ok: false,
          sessionId: cleanSessionId,
          nodeId,
          caught: false,
          itemId: 'fish',
          quantity: 0,
          code: capCheck.code || 'INVENTORY_FULL',
          reason: capCheck.reason || '🎒 အိတ်ထဲတွင် နေရာလွတ်မရှိပါ',
        };
      }
    }

    const respawnAt = now + FISHING_RESPAWN_MS;
    depletedResources.set(nodeId, respawnAt);

    return {
      ok: true,
      sessionId: cleanSessionId,
      nodeId,
      caught: true,
      itemId: 'fish',
      quantity: FISHING_CATCH_REWARD,
      respawnAt,
    };
  }

  public clearPlayer(playerId: string): void {
    this.activeCasts.delete(playerId);
  }

  private recordConsumedSession(sessionId: string): void {
    this.recentSessionIds.add(sessionId);
    if (this.recentSessionIds.size > 500) {
      const oldest = this.recentSessionIds.values().next().value;
      if (oldest) {
        this.recentSessionIds.delete(oldest);
      }
    }
  }
}
