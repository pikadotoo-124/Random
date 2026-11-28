/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LakesideDoubleBenchDef {
  id: string;
  name: string;
  tileX: number;
  tileY: number;
  orientation: 'nw_se' | 'ne_sw';
  facing: 'down' | 'left' | 'right' | 'up';
  textureKey: 'obj_double_bench_nw_se' | 'obj_double_bench_ne_sw';
  originY: number;
  /** World pixel offsets relative to the bench tile anchor (world.x, world.y + 16) */
  seatOffsets: readonly [{ dx: number; dy: number }, { dx: number; dy: number }];
}

/**
 * Curated Lakeside & Scenic Overlook 2-Seater Benches placed cleanly on wooden piers
 * and lakeside overlooks without obstructing walkways or fishing casting tiles.
 * Shared single source of truth across Client (WorldScene) & Server (DO / Express).
 */
export const LAKESIDE_DOUBLE_BENCHES: readonly LakesideDoubleBenchDef[] = [
  {
    id: 'bench_mirror_east_pier',
    name: 'မှန်ကြည်ကန် အရှေ့တံတား ၂ ဦးထိုင်ခုံ',
    tileX: 30,
    tileY: 62,
    orientation: 'ne_sw',
    facing: 'left',
    textureKey: 'obj_double_bench_ne_sw',
    originY: 0.78,
    seatOffsets: [
      { dx: 8, dy: -6 },
      { dx: -9, dy: 2 },
    ],
  },
  {
    id: 'bench_mirror_north_pier',
    name: 'မှန်ကြည်ကန် မြောက်တံတား ၂ ဦးထိုင်ခုံ',
    tileX: 14,
    tileY: 55,
    orientation: 'nw_se',
    facing: 'down',
    textureKey: 'obj_double_bench_nw_se',
    originY: 0.78,
    seatOffsets: [
      { dx: -9, dy: -6 },
      { dx: 8, dy: 2 },
    ],
  },
  {
    id: 'bench_emerald_glade_pier',
    name: 'တောအုပ်ကန် ၂ ဦးထိုင်ခုံ',
    tileX: 83,
    tileY: 24,
    orientation: 'ne_sw',
    facing: 'left',
    textureKey: 'obj_double_bench_ne_sw',
    originY: 0.78,
    seatOffsets: [
      { dx: 8, dy: -6 },
      { dx: -9, dy: 2 },
    ],
  },
  {
    id: 'bench_highland_spring_pier',
    name: 'တောင်ပေါ်စမ်းကန် ၂ ဦးထိုင်ခုံ',
    tileX: 16,
    tileY: 16,
    orientation: 'ne_sw',
    facing: 'left',
    textureKey: 'obj_double_bench_ne_sw',
    originY: 0.78,
    seatOffsets: [
      { dx: 8, dy: -6 },
      { dx: -9, dy: 2 },
    ],
  },
  {
    id: 'bench_silverbrook_overlook',
    name: 'ငွေချောင်းရှုခင်းသာ ၂ ဦးထိုင်ခုံ',
    tileX: 90,
    tileY: 69,
    orientation: 'nw_se',
    facing: 'down',
    textureKey: 'obj_double_bench_nw_se',
    originY: 0.78,
    seatOffsets: [
      { dx: -9, dy: -6 },
      { dx: 8, dy: 2 },
    ],
  },
];

export const LAKESIDE_DOUBLE_BENCH_BY_ID = new Map<string, LakesideDoubleBenchDef>(
  LAKESIDE_DOUBLE_BENCHES.map((b) => [b.id, b])
);

export function getLakesideBenchById(id: string): LakesideDoubleBenchDef | undefined {
  return LAKESIDE_DOUBLE_BENCH_BY_ID.get(id);
}

export function getNearestLakesideBench(
  tileX: number,
  tileY: number,
  maxDistTiles = 2.05
): { bench: LakesideDoubleBenchDef; distance: number } | null {
  let best: { bench: LakesideDoubleBenchDef; distance: number } | null = null;
  for (const bench of LAKESIDE_DOUBLE_BENCHES) {
    const dist = Math.hypot(bench.tileX - tileX, bench.tileY - tileY);
    if (dist <= maxDistTiles && (!best || dist < best.distance)) {
      best = { bench, distance: dist };
    }
  }
  return best;
}
