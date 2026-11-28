/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TimePhase = 'morning' | 'day' | 'evening' | 'night';
export type WeatherType = 'clear' | 'rain';

export interface AtmosphereSnapshot {
  hour: number;
  minute: number;
  dayNumber: number;
  phase: TimePhase;
  phaseLabelMy: string;
  formattedTimeMy: string;
  weather: WeatherType;
  weatherLabelMy: string;
  rainIntensity: number; // 0..1 (raw world rain curve)
  effectiveRainIntensity: number; // 0..1 (respects user weatherEffectsEnabled preference)
  weatherEffectsEnabled: boolean;
  lightIntensity: number; // 0..1 (for lanterns, campfires, plaza fountain, house windows)
  sunlightFactor: number; // 0..1 (1 = bright noon, 0.25 = night)
  tintColor: number; // 0xRRGGBB
  tintAlpha: number; // 0..0.38
}

interface TintKeyframe {
  hour: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  light: number;
  sunlight: number;
}

const BURMESE_DIGITS = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];

export function toBurmeseDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BURMESE_DIGITS[Number(d)] ?? d);
}

/**
 * Shared deterministic in-game world atmosphere engine:
 * - 1 full in-game day = 12 real minutes (720,000 ms), so players naturally experience
 *   Morning, Day, Evening Sunset, and Night within a single play session.
 * - Progresses strictly via independent in-game timer starting at 07:00 Morning on game start,
 *   with zero server-clock synchronization or WebSocket time traffic.
 */
export class WorldAtmosphereSystem {
  public static readonly DAY_DURATION_MS = 12 * 60 * 1000; // 12 real minutes per 24 game hours
  public static readonly WEATHER_PREF_STORAGE_KEY = 'random_city_weather_fx_v1';
  private static readonly WEATHER_SLOTS_PER_DAY = 6; // 4 in-game hours per slot (2 real minutes)
  private static readonly RAIN_FADE_HOURS = 0.42; // ~12.6s smooth fade in/out

  // Every new play session starts cleanly at 07:00 AM Morning
  public static readonly START_HOUR = 7.0;

  // Carefully balanced 24-hour keyframes so Player, NPCs, Buildings & UI remain crisp & readable at every hour
  private static readonly KEYFRAMES: TintKeyframe[] = [
    { hour: 0.0, r: 15, g: 23, b: 52, alpha: 0.34, light: 1.0, sunlight: 0.25 },   // Midnight cool deep blue
    { hour: 4.5, r: 18, g: 27, b: 58, alpha: 0.32, light: 0.96, sunlight: 0.28 },  // Late night pre-dawn
    { hour: 5.8, r: 125, g: 112, b: 148, alpha: 0.19, light: 0.58, sunlight: 0.52 }, // Dawn violet-mist
    { hour: 7.0, r: 253, g: 214, b: 165, alpha: 0.09, light: 0.14, sunlight: 0.80 }, // Fresh golden morning
    { hour: 9.0, r: 245, g: 248, b: 255, alpha: 0.03, light: 0.0, sunlight: 0.96 },  // Crisp morning
    { hour: 12.5, r: 255, g: 252, b: 242, alpha: 0.01, light: 0.0, sunlight: 1.0 },  // Clear bright noon
    { hour: 15.8, r: 255, g: 238, b: 205, alpha: 0.04, light: 0.0, sunlight: 0.94 }, // Warm afternoon
    { hour: 17.5, r: 245, g: 138, b: 66, alpha: 0.21, light: 0.48, sunlight: 0.68 }, // Golden-amber Sunset
    { hour: 18.8, r: 168, g: 82, b: 110, alpha: 0.26, light: 0.80, sunlight: 0.44 }, // Twilight dusk rose-indigo
    { hour: 20.0, r: 24, g: 34, b: 74, alpha: 0.32, light: 0.96, sunlight: 0.28 },   // Evening settles into night
    { hour: 24.0, r: 15, g: 23, b: 52, alpha: 0.34, light: 1.0, sunlight: 0.25 },   // Wrap cleanly to Midnight
  ];

  private weatherEffectsEnabled: boolean;
  private gameElapsedMs = 0;

  constructor(initialWeatherEnabled?: boolean) {
    if (typeof initialWeatherEnabled === 'boolean') {
      this.weatherEffectsEnabled = initialWeatherEnabled;
    } else {
      this.weatherEffectsEnabled = WorldAtmosphereSystem.loadWeatherPreference();
    }
  }

  public advance(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    // Clamp per-tick delta to prevent jumps on tab suspend/resume
    this.gameElapsedMs += Math.min(250, deltaMs);
  }

  public resetToMorning(): void {
    this.gameElapsedMs = 0;
  }

  public getGameElapsedMs(): number {
    return this.gameElapsedMs;
  }

  public static loadWeatherPreference(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    try {
      const saved = window.localStorage.getItem(WorldAtmosphereSystem.WEATHER_PREF_STORAGE_KEY);
      if (saved === 'off' || saved === 'false') return false;
    } catch {
      // Ignore storage access errors
    }
    return true;
  }

  public setWeatherEffectsEnabled(enabled: boolean): void {
    this.weatherEffectsEnabled = Boolean(enabled);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(
          WorldAtmosphereSystem.WEATHER_PREF_STORAGE_KEY,
          this.weatherEffectsEnabled ? 'on' : 'off'
        );
      } catch {
        // Ignore storage errors
      }
    }
  }

  public isWeatherEffectsEnabled(): boolean {
    return this.weatherEffectsEnabled;
  }

  private static smoothstep(t: number): number {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  }

  private static isSlotRainy(dayIndex: number, slotIndex: number): boolean {
    // Deterministic passing rain showers (~28% chance per 4-game-hour slot)
    const normalizedSlot =
      ((slotIndex % WorldAtmosphereSystem.WEATHER_SLOTS_PER_DAY) +
        WorldAtmosphereSystem.WEATHER_SLOTS_PER_DAY) %
      WorldAtmosphereSystem.WEATHER_SLOTS_PER_DAY;
    const adjustedDay = dayIndex + Math.floor(slotIndex / WorldAtmosphereSystem.WEATHER_SLOTS_PER_DAY);
    const seed = Math.abs((adjustedDay * 1103515245 + normalizedSlot * 2654435761) ^ 0x5bd1e995);
    return seed % 11 < 3;
  }

  public static computeWeatherState(
    dayIndex: number,
    hourFloat: number
  ): { weather: WeatherType; rainIntensity: number } {
    const slotHours = 24 / WorldAtmosphereSystem.WEATHER_SLOTS_PER_DAY; // 4.0h
    const slotIdx = Math.floor(hourFloat / slotHours);
    const localHour = hourFloat - slotIdx * slotHours;

    const currentRain = WorldAtmosphereSystem.isSlotRainy(dayIndex, slotIdx);
    const prevRain = WorldAtmosphereSystem.isSlotRainy(dayIndex, slotIdx - 1);
    const nextRain = WorldAtmosphereSystem.isSlotRainy(dayIndex, slotIdx + 1);

    const fade = WorldAtmosphereSystem.RAIN_FADE_HOURS;
    let intensity = currentRain ? 1 : 0;

    if (currentRain && !prevRain && localHour < fade) {
      intensity = WorldAtmosphereSystem.smoothstep(localHour / fade);
    } else if (currentRain && !nextRain && localHour > slotHours - fade) {
      intensity = WorldAtmosphereSystem.smoothstep((slotHours - localHour) / fade);
    } else if (!currentRain && prevRain && localHour < fade * 0.35) {
      intensity = (1 - WorldAtmosphereSystem.smoothstep(localHour / (fade * 0.35))) * 0.3;
    }

    return {
      weather: currentRain || intensity > 0.12 ? 'rain' : 'clear',
      rainIntensity: Math.max(0, Math.min(1, intensity)),
    };
  }

  public evaluate(elapsedGameMs: number = this.gameElapsedMs): AtmosphereSnapshot {
    const safeElapsed = Number.isFinite(elapsedGameMs) ? Math.max(0, elapsedGameMs) : 0;
    const totalHours =
      WorldAtmosphereSystem.START_HOUR + (safeElapsed / WorldAtmosphereSystem.DAY_DURATION_MS) * 24;
    const dayIndex = Math.floor(totalHours / 24);
    const hourFloat = ((totalHours % 24) + 24) % 24;

    const hour = Math.floor(hourFloat) % 24;
    const minute = Math.floor((hourFloat - Math.floor(hourFloat)) * 60) % 60;

    // Interpolate tint keyframes cleanly
    const frames = WorldAtmosphereSystem.KEYFRAMES;
    let k0 = frames[0];
    let k1 = frames[frames.length - 1];
    for (let i = 0; i < frames.length - 1; i++) {
      if (hourFloat >= frames[i].hour && hourFloat <= frames[i + 1].hour) {
        k0 = frames[i];
        k1 = frames[i + 1];
        break;
      }
    }

    const span = Math.max(0.0001, k1.hour - k0.hour);
    const t = WorldAtmosphereSystem.smoothstep((hourFloat - k0.hour) / span);

    let r = Math.round(k0.r + (k1.r - k0.r) * t);
    let g = Math.round(k0.g + (k1.g - k0.g) * t);
    let b = Math.round(k0.b + (k1.b - k0.b) * t);
    let alpha = k0.alpha + (k1.alpha - k0.alpha) * t;
    const lightIntensity = Math.max(0, Math.min(1, k0.light + (k1.light - k0.light) * t));
    const sunlightFactor = Math.max(0.2, Math.min(1, k0.sunlight + (k1.sunlight - k0.sunlight) * t));

    const { weather, rainIntensity } = WorldAtmosphereSystem.computeWeatherState(dayIndex, hourFloat);
    const effectiveRainIntensity = this.weatherEffectsEnabled ? rainIntensity : 0;

    // Subtle cool overcast haze during daytime rain without darkening buildings/UI
    if (effectiveRainIntensity > 0.01) {
      const overcastMix = effectiveRainIntensity * 0.35;
      r = Math.round(r * (1 - overcastMix) + 46 * overcastMix);
      g = Math.round(g * (1 - overcastMix) + 74 * overcastMix);
      b = Math.round(b * (1 - overcastMix) + 114 * overcastMix);
      alpha = Math.min(0.38, alpha + effectiveRainIntensity * 0.06 * (1 - alpha * 1.4));
    }

    const tintColor = ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);

    // Determine Burmese Time-of-Day Phase & Formatted Clock
    let phase: TimePhase;
    let phaseLabelMy: string;
    if (hour >= 5 && hour < 10) {
      phase = 'morning';
      phaseLabelMy = 'နံနက်ခင်း';
    } else if (hour >= 10 && hour < 16) {
      phase = 'day';
      phaseLabelMy = 'နေ့လယ်';
    } else if (hour >= 16 && hour < 19) {
      phase = 'evening';
      phaseLabelMy = 'ညနေခင်း';
    } else {
      phase = 'night';
      phaseLabelMy = 'ညအချိန်';
    }

    // 12-hour Burmese period prefix + clock
    const periodMy = hour < 12 ? (hour < 5 ? 'ည' : 'နံနက်') : hour < 16 ? 'နေ့လယ်' : hour < 19 ? 'ညနေ' : 'ည';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    const hhStr = String(hour12).padStart(2, '0');
    const mmStr = String(minute).padStart(2, '0');
    const formattedTimeMy = `${periodMy} ${toBurmeseDigits(hhStr)}:${toBurmeseDigits(mmStr)}`;

    const weatherLabelMy = !this.weatherEffectsEnabled
      ? 'ကြည်လင် (Effect ပိတ်)'
      : weather === 'rain'
      ? 'မိုးရွာနေသည်'
      : 'ရာသီဥတု ကြည်လင်';

    return {
      hour,
      minute,
      dayNumber: Math.max(1, (dayIndex % 1000) + 1),
      phase,
      phaseLabelMy,
      formattedTimeMy,
      weather,
      weatherLabelMy,
      rainIntensity,
      effectiveRainIntensity,
      weatherEffectsEnabled: this.weatherEffectsEnabled,
      lightIntensity,
      sunlightFactor,
      tintColor,
      tintAlpha: Math.max(0, Math.min(0.38, alpha)),
    };
  }
}

export interface BuildingGlowAnchor {
  windows: Array<{ dx: number; dy: number; side: 'left' | 'right' }>;
  sconce?: { dx: number; dy: number };
  haloOffsetY: number;
  haloScale: number;
}

/**
 * Computes exact pixel offsets relative to the building sprite anchor (0.5, baseCenterY / canvasH)
 * matching PixelArtGenerator.drawIsoBuildingCanvas window, sconce & hearth positions.
 */
export function getBuildingLightAnchors(
  buildingKind:
    | 'house_small'
    | 'house_medium'
    | 'house_large'
    | 'house_bakery'
    | 'house_general'
    | 'house_grocery'
    | 'house_blacksmith'
    | 'house_florist'
    | 'house_clothing'
    | 'town_house'
): BuildingGlowAnchor {
  let tileW = 2;
  let tileH = 2;
  let wallH = 46;
  let upperH = 0;
  const doorSide: 'left' | 'right' = 'left';
  let footprintScale = 0.94;
  let hasForgeHearth = false;

  switch (buildingKind) {
    case 'house_small':
      tileW = 2; tileH = 2; wallH = 46; upperH = 0; footprintScale = 0.94;
      break;
    case 'house_medium':
      tileW = 3; tileH = 2; wallH = 44; upperH = 30; footprintScale = 0.94;
      break;
    case 'house_large':
      tileW = 3; tileH = 3; wallH = 48; upperH = 34; footprintScale = 0.95;
      break;
    case 'house_bakery':
      tileW = 3; tileH = 2; wallH = 48; upperH = 0; footprintScale = 0.94;
      break;
    case 'house_general':
      tileW = 3; tileH = 2; wallH = 44; upperH = 24; footprintScale = 0.94;
      break;
    case 'house_grocery':
      tileW = 3; tileH = 2; wallH = 48; upperH = 0; footprintScale = 0.94;
      break;
    case 'house_blacksmith':
      tileW = 3; tileH = 2; wallH = 48; upperH = 0; footprintScale = 0.94; hasForgeHearth = true;
      break;
    case 'house_florist':
    case 'house_clothing':
      tileW = 2; tileH = 2; wallH = 46; upperH = 0; footprintScale = 0.94;
      break;
    case 'town_house':
      tileW = 2; tileH = 2; wallH = 40; upperH = 26; footprintScale = 0.94;
      break;
  }

  const s = footprintScale;
  const left = { x: -(tileW + tileH) * 16 * s, y: (tileH - tileW) * 8 * s };
  const bottom = { x: (tileW - tileH) * 16 * s, y: (tileW + tileH) * 8 * s };
  const right = { x: (tileW + tileH) * 16 * s, y: (tileW - tileH) * 8 * s };

  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number, yOff: number) => ({
    dx: a.x + (b.x - a.x) * t,
    dy: a.y + (b.y - a.y) * t + yOff,
  });

  const plinthH = 11;
  const winH = Math.min(14, Math.max(10, wallH - plinthH - 16));
  const groundCenterY = -(plinthH + 7 + winH / 2);

  const windows: Array<{ dx: number; dy: number; side: 'left' | 'right' }> = [];
  let sconce: { dx: number; dy: number } | undefined;
  if (doorSide === 'left') {
    const wL = lerp(left, bottom, 0.29, groundCenterY);
    windows.push({ dx: wL.dx, dy: wL.dy, side: 'left' });
    const wR = lerp(bottom, right, 0.405, groundCenterY);
    windows.push({ dx: wR.dx, dy: wR.dy, side: 'right' });
    sconce = lerp(left, bottom, 0.49, -(plinthH + 22));
  }

  if (hasForgeHearth) {
    const hearth = lerp(bottom, right, 0.75, -(plinthH + 8));
    windows.push({ dx: hearth.dx, dy: hearth.dy, side: 'right' });
  }

  if (upperH > 0) {
    const upWinH = Math.max(9, upperH - 9);
    const upCenterY = -(wallH + 4 + upWinH / 2);
    const u1 = lerp(left, bottom, 0.29, upCenterY);
    const u2 = lerp(left, bottom, 0.69, upCenterY);
    const u3 = lerp(bottom, right, 0.50, upCenterY);
    windows.push({ dx: u1.dx, dy: u1.dy, side: 'left' });
    windows.push({ dx: u2.dx, dy: u2.dy, side: 'left' });
    windows.push({ dx: u3.dx, dy: u3.dy, side: 'right' });
  }

  return {
    windows,
    sconce,
    haloOffsetY: -wallH * 0.35,
    haloScale: tileW >= 3 ? 1.45 : 1.15,
  };
}
