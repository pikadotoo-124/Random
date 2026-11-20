/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AUNTY_GYI_CATALOG, CLOTHING_RENDER_LAYER_ORDER, getClothingItemById } from '../constants';
import { EquippedClothingState } from '../types';

const OUTLINE = '#1b1411';

interface FrameMotion {
  dirIndex: 0 | 1 | 2 | 3; // 0=down, 1=left, 2=right, 3=up
  stepIndex: 0 | 1 | 2 | 3; // 0=idle, 1=leftStride, 2=rightStride, 3=idleBreath
  isStride: boolean;
  strideBob: number;
  breathOffset: number;
  bodyBob: number;
  headBob: number;
  torsoW: number;
  torsoX: number;
}

function getFrameMotion(frameIndex: number, gender: 'male' | 'female'): FrameMotion {
  const f = Math.max(0, Math.min(15, Math.floor(frameIndex)));
  const dirIndex = Math.floor(f / 4) as 0 | 1 | 2 | 3;
  const stepIndex = (f % 4) as 0 | 1 | 2 | 3;
  const isStride = stepIndex === 1 || stepIndex === 2;
  const strideBob = isStride ? -1.05 : 0;
  const breathOffset = stepIndex === 3 ? -0.55 : 0;
  const bodyBob = strideBob + breathOffset;
  const headBob = strideBob * 0.95 + (stepIndex === 3 ? -0.65 : 0);
  const torsoW = gender === 'female' ? 11.6 : 12.6;
  const torsoX = 16 - torsoW / 2;
  return {
    dirIndex,
    stepIndex,
    isStride,
    strideBob,
    breathOffset,
    bodyBob,
    headBob,
    torsoW,
    torsoX,
  };
}

function forEachBootRect(
  m: FrameMotion,
  cb: (bx: number, by: number, w: number, h: number, shaded: boolean) => void
): void {
  if (m.dirIndex === 0 || m.dirIndex === 3) {
    const leftLegY = m.stepIndex === 1 ? 33.0 : m.stepIndex === 2 ? 34.8 : 34.4;
    const rightLegY = m.stepIndex === 2 ? 33.0 : m.stepIndex === 1 ? 34.8 : 34.4;
    cb(10.6, leftLegY + m.strideBob, 4.6, 5.2, m.stepIndex === 2);
    cb(16.8, rightLegY + m.strideBob, 4.6, 5.2, m.stepIndex === 1);
  } else if (m.dirIndex === 1) {
    const frontShift = m.stepIndex === 1 ? -2.7 : m.stepIndex === 2 ? 2.3 : 0;
    const backShift = -frontShift;
    const frontLift = m.stepIndex === 1 ? -0.8 : 0;
    const backLift = m.stepIndex === 2 ? -0.8 : 0;
    if (m.isStride) {
      cb(13.4 + backShift, 34.4 + m.strideBob + backLift, 4.3, 5.0, true);
    }
    cb(13.0 + frontShift, 34.4 + m.strideBob + frontLift, 4.8, 5.2, false);
  } else {
    const frontShift = m.stepIndex === 1 ? 2.7 : m.stepIndex === 2 ? -2.3 : 0;
    const backShift = -frontShift;
    const frontLift = m.stepIndex === 1 ? -0.8 : 0;
    const backLift = m.stepIndex === 2 ? -0.8 : 0;
    if (m.isStride) {
      cb(14.3 + backShift, 34.4 + m.strideBob + backLift, 4.3, 5.0, true);
    }
    cb(14.2 + frontShift, 34.4 + m.strideBob + frontLift, 4.8, 5.2, false);
  }
}

function drawTorsoSleeves(
  ctx: CanvasRenderingContext2D,
  m: FrameMotion,
  sleeveColor: string,
  highlightColor: string,
  sleeveHeight: number
): void {
  const armBreath = m.stepIndex === 3 ? 0.35 : 0;
  if (m.dirIndex === 0 || m.dirIndex === 3) {
    const leftArmSwing = m.stepIndex === 1 ? 1.7 : m.stepIndex === 2 ? -1.7 : 0;
    const rightArmSwing = -leftArmSwing;
    const armLeftX = m.torsoX - 2.6 - armBreath;
    const armRightX = m.torsoX + m.torsoW - 0.4 + armBreath;

    for (const [ax, swing] of [
      [armLeftX, leftArmSwing],
      [armRightX, rightArmSwing],
    ]) {
      const sy = 23.0 + m.bodyBob + swing * 0.55;
      ctx.fillStyle = OUTLINE;
      ctx.beginPath();
      ctx.roundRect(ax - 0.45, sy - 0.4, 3.7, sleeveHeight + 0.85, 1.0);
      ctx.fill();
      ctx.fillStyle = sleeveColor;
      ctx.fillRect(ax, sy, 2.8, sleeveHeight);
      ctx.fillStyle = highlightColor;
      ctx.fillRect(ax, sy, 2.8, 1.0);
    }
  } else if (m.dirIndex === 1) {
    const armOffset = m.stepIndex === 1 ? 2.7 : m.stepIndex === 2 ? -2.7 : 0;
    const sy = 23.6 + m.bodyBob;
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.roundRect(13.2 + armOffset, sy - 0.45, 4.2, sleeveHeight + 0.9, 1.05);
    ctx.fill();
    ctx.fillStyle = sleeveColor;
    ctx.fillRect(13.6 + armOffset, sy, 3.4, sleeveHeight);
    ctx.fillStyle = highlightColor;
    ctx.fillRect(13.6 + armOffset, sy, 3.4, 1.0);
  } else {
    const armOffset = m.stepIndex === 1 ? -2.7 : m.stepIndex === 2 ? 2.7 : 0;
    const sy = 23.6 + m.bodyBob;
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.roundRect(14.6 + armOffset, sy - 0.45, 4.2, sleeveHeight + 0.9, 1.05);
    ctx.fill();
    ctx.fillStyle = sleeveColor;
    ctx.fillRect(15.0 + armOffset, sy, 3.4, sleeveHeight);
    ctx.fillStyle = highlightColor;
    ctx.fillRect(15.0 + armOffset, sy, 3.4, 1.0);
  }
}

export class ClothingRenderer {
  /**
   * Draws a single clothing item layer in 32x44 logical sprite space
   * matching PixelArtGenerator.createCharacterSpritesheet's exact 16-frame coordinate system.
   */
  public static drawClothingFrame(
    ctx: CanvasRenderingContext2D,
    itemId: string,
    gender: 'male' | 'female',
    frameIndex: number
  ): void {
    const m = getFrameMotion(frameIndex, gender);
    const ty = 22.8 + m.bodyBob;

    switch (itemId) {
      case 'shoes_leather_boots': {
        forEachBootRect(m, (bx, by, w, h, shaded) => {
          const sy = by + 1.45;
          const sh = h - 1.45;
          ctx.fillStyle = OUTLINE;
          ctx.beginPath();
          ctx.roundRect(bx - 0.65, sy - 0.3, w + 1.3, sh + 0.95, 0.95);
          ctx.fill();
          ctx.fillStyle = shaded ? '#6b270b' : '#9a3412';
          ctx.fillRect(bx, sy, w, sh - 1.15);
          ctx.fillStyle = shaded ? '#7c2d12' : '#c2410c';
          ctx.fillRect(bx + 0.45, sy + 0.25, w * 0.48, sh - 1.65);
          // Brass buckle cuff highlight
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(bx + w * 0.36, sy + 0.2, 1.1, 0.8);
          // Rugged dark sole
          ctx.fillStyle = '#291509';
          ctx.fillRect(bx - 0.25, by + h - 1.25, w + 0.5, 1.25);
        });
        break;
      }

      case 'shoes_sky_sneakers': {
        forEachBootRect(m, (bx, by, w, h, shaded) => {
          const sy = by + 1.65;
          const sh = h - 1.65;
          ctx.fillStyle = OUTLINE;
          ctx.beginPath();
          ctx.roundRect(bx - 0.65, sy - 0.25, w + 1.3, sh + 0.9, 0.95);
          ctx.fill();
          ctx.fillStyle = shaded ? '#0369a1' : '#0284c7';
          ctx.fillRect(bx, sy, w, sh - 1.25);
          ctx.fillStyle = shaded ? '#0284c7' : '#38bdf8';
          ctx.fillRect(bx + 0.4, sy + 0.2, w * 0.52, sh - 1.65);
          // White lace stripe
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(bx + w * 0.28, sy + 0.35, w * 0.42, 0.7);
          // Crisp white rubber sole & toe rim
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(bx - 0.25, by + h - 1.3, w + 0.5, 1.3);
        });
        break;
      }

      case 'pants_classic_denim':
      case 'pants_olive_chino': {
        const isDenim = itemId === 'pants_classic_denim';
        const mainCol = isDenim ? '#1d4ed8' : '#4d7c0f';
        const shadeCol = isDenim ? '#1e40af' : '#3f6212';
        const hlCol = isDenim ? '#60a5fa' : '#84cc16';
        const beltCol = isDenim ? '#78350f' : '#573619';

        // Waistband covering belt transition cleanly (especially over female skirt hem)
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(m.torsoX - 0.7, 30.8 + m.bodyBob, m.torsoW + 1.4, 4.6);
        ctx.fillStyle = beltCol;
        ctx.fillRect(m.torsoX, 31.1 + m.bodyBob, m.torsoW, 1.5);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(15.0, 31.0 + m.bodyBob, 2.0, 1.6);

        ctx.fillStyle = mainCol;
        ctx.fillRect(m.torsoX - 0.35, 32.5 + m.bodyBob, m.torsoW + 0.7, 2.8);

        // Trouser legs synced to boot stride positions
        forEachBootRect(m, (bx, by, w, _h, shaded) => {
          ctx.fillStyle = OUTLINE;
          ctx.fillRect(bx - 0.55, by - 0.45, w + 1.1, 2.75);
          ctx.fillStyle = shaded ? shadeCol : mainCol;
          ctx.fillRect(bx - 0.1, by - 0.1, w + 0.2, 2.25);
          ctx.fillStyle = hlCol;
          ctx.fillRect(bx + 0.25, by + 1.5, w - 0.5, 0.55);
        });
        break;
      }

      case 'tshirt_coral_sunset':
      case 'tshirt_mint_breeze': {
        const isCoral = itemId === 'tshirt_coral_sunset';
        const mainCol = isCoral ? '#ea580c' : '#0d9488';
        const trimCol = isCoral ? '#ffedd5' : '#ccfbf1';
        const accentCol = isCoral ? '#fb923c' : '#2dd4bf';

        // Torso tee shape (stops cleanly above leather belt)
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.roundRect(m.torsoX - 0.75, ty - 0.55, m.torsoW + 1.5, 9.2, 2.4);
        ctx.fill();

        ctx.fillStyle = mainCol;
        ctx.beginPath();
        ctx.roundRect(m.torsoX, ty, m.torsoW, 8.35, 2.0);
        ctx.fill();

        // Top highlight
        ctx.fillStyle = accentCol;
        ctx.fillRect(m.torsoX + 0.8, ty + 0.35, m.torsoW - 1.6, 1.3);

        if (m.dirIndex === 0) {
          // Crew neck & horizontal chest band
          ctx.fillStyle = trimCol;
          ctx.fillRect(13.6, ty + 0.2, 4.8, 1.15);
          ctx.fillRect(m.torsoX + 0.4, ty + 4.0, m.torsoW - 0.8, 1.35);
          if (!isCoral) {
            // Mint pocket detail
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(m.torsoX + 1.7, ty + 2.2, 2.2, 1.6);
          }
        } else if (m.dirIndex === 3) {
          ctx.fillStyle = trimCol;
          ctx.fillRect(m.torsoX + 0.4, ty + 4.0, m.torsoW - 0.8, 1.2);
        } else {
          ctx.fillStyle = trimCol;
          ctx.fillRect(m.torsoX + 0.6, ty + 4.0, m.torsoW - 1.2, 1.2);
        }

        // Short sleeves
        drawTorsoSleeves(ctx, m, mainCol, accentCol, 3.6);
        break;
      }

      case 'suit_noble_coat': {
        const coatCol = '#1e3a5f';
        const coatHl = '#2b5485';
        const shirtCol = '#f8fafc';
        const cravatCol = '#9f1239';

        // Coat body & tailored tails
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.roundRect(m.torsoX - 0.85, ty - 0.7, m.torsoW + 1.7, 14.3, 2.7);
        ctx.fill();

        ctx.fillStyle = coatCol;
        ctx.beginPath();
        ctx.roundRect(m.torsoX - 0.1, ty, m.torsoW + 0.2, 13.4, 2.2);
        ctx.fill();

        // Shoulder highlight
        ctx.fillStyle = coatHl;
        ctx.fillRect(m.torsoX + 0.6, ty + 0.4, m.torsoW - 1.2, 1.6);

        if (m.dirIndex === 0) {
          // White shirt V & burgundy cravat
          ctx.fillStyle = shirtCol;
          ctx.beginPath();
          ctx.moveTo(13.0, ty);
          ctx.lineTo(16, ty + 4.2);
          ctx.lineTo(19.0, ty);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = cravatCol;
          ctx.fillRect(15.2, ty + 0.8, 1.6, 3.0);

          // Lapels & brass double buttons
          ctx.fillStyle = '#0f2540';
          ctx.fillRect(m.torsoX + 2.1, ty + 4.2, m.torsoW - 4.2, 0.8);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(13.7, ty + 5.6, 1.2, 1.2);
          ctx.fillRect(17.1, ty + 5.6, 1.2, 1.2);
          ctx.fillRect(13.7, ty + 8.1, 1.2, 1.2);
          ctx.fillRect(17.1, ty + 8.1, 1.2, 1.2);

          // Belt sash
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(m.torsoX, ty + 9.4, m.torsoW, 1.3);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(15.0, ty + 9.3, 2.0, 1.5);
        } else if (m.dirIndex === 3) {
          // Back coat vent & belt strap
          ctx.fillStyle = '#0f2540';
          ctx.fillRect(m.torsoX + 1.2, ty + 8.8, m.torsoW - 2.4, 1.4);
          ctx.fillRect(15.6, ty + 9.6, 0.8, 3.6);
        } else {
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(m.dirIndex === 1 ? m.torsoX + 2.2 : m.torsoX + m.torsoW - 3.4, ty + 6.0, 1.2, 1.2);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(m.torsoX, ty + 9.4, m.torsoW, 1.3);
        }

        // Long coat sleeves (leaving skin hand visible at bottom)
        drawTorsoSleeves(ctx, m, coatCol, coatHl, 4.9);
        break;
      }

      case 'suit_rose_dress': {
        const dressCol = '#be185d';
        const dressHl = '#ec4899';
        const bodiceCol = '#9d174d';
        const laceCol = '#fff1f2';

        // Bodice
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.roundRect(m.torsoX - 0.8, ty - 0.65, m.torsoW + 1.6, 10.6, 2.5);
        ctx.fill();

        ctx.fillStyle = bodiceCol;
        ctx.beginPath();
        ctx.roundRect(m.torsoX, ty, m.torsoW, 9.6, 2.1);
        ctx.fill();

        // Flared pleated skirt draping cleanly over waist & hips
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.moveTo(m.torsoX - 0.2, ty + 7.5);
        ctx.lineTo(m.torsoX + m.torsoW + 0.2, ty + 7.5);
        ctx.lineTo(m.torsoX + m.torsoW + 2.0, ty + 14.3);
        ctx.lineTo(m.torsoX - 2.0, ty + 14.3);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = dressCol;
        ctx.beginPath();
        ctx.moveTo(m.torsoX + 0.4, ty + 7.8);
        ctx.lineTo(m.torsoX + m.torsoW - 0.4, ty + 7.8);
        ctx.lineTo(m.torsoX + m.torsoW + 1.4, ty + 13.7);
        ctx.lineTo(m.torsoX - 1.4, ty + 13.7);
        ctx.closePath();
        ctx.fill();

        // Skirt pleat highlights & white lace hem
        ctx.fillStyle = dressHl;
        ctx.fillRect(13.2, ty + 8.6, 1.2, 4.2);
        ctx.fillRect(17.6, ty + 8.6, 1.2, 4.2);
        ctx.fillStyle = laceCol;
        ctx.fillRect(m.torsoX - 1.2, ty + 12.8, m.torsoW + 2.4, 0.95);

        // Cream collar & ribbon sash
        if (m.dirIndex === 0) {
          ctx.fillStyle = laceCol;
          ctx.beginPath();
          ctx.moveTo(12.6, ty);
          ctx.lineTo(16, ty + 3.0);
          ctx.lineTo(19.4, ty);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = '#fda4af';
        ctx.fillRect(m.torsoX, ty + 7.5, m.torsoW, 1.4);
        ctx.fillStyle = '#ffe4e6';
        ctx.fillRect(15.0, ty + 7.2, 2.0, 2.0);

        // Puffed short boutique sleeves
        drawTorsoSleeves(ctx, m, dressCol, dressHl, 3.6);
        break;
      }

      case 'hat_straw_sun': {
        // Positioned above hair crown (y = 2.6..9.6 + headBob) so face/eyes/brows stay 100% uncovered
        const hy = 7.9 + m.headBob;
        const rx = m.dirIndex === 1 || m.dirIndex === 2 ? 9.8 : 10.6;
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.ellipse(16, hy, rx, 2.9, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.ellipse(16, hy - 0.15, rx - 0.7, 2.35, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ca8a04';
        ctx.beginPath();
        ctx.roundRect(10.8, 3.6 + m.headBob, 10.4, 4.2, 2.0);
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Highlight & crimson hat band
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(12.0, 4.2 + m.headBob, 6.2, 0.9);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(10.8, 6.4 + m.headBob, 10.4, 1.3);
        break;
      }

      case 'hat_plum_beret': {
        const tilt = m.dirIndex === 2 ? 0.1 : -0.1;
        const cy = 6.3 + m.headBob;
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.ellipse(16, cy, 8.2, 3.4, tilt, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#7e22ce';
        ctx.beginPath();
        ctx.ellipse(16, cy, 7.4, 2.7, tilt, 0, Math.PI * 2);
        ctx.fill();

        // Top stem nib & highlight band
        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.ellipse(15.2, cy - 0.7, 4.6, 1.3, tilt, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(15.4, cy - 3.6, 1.4, 1.1);

        // Gold feather clasp on visible side
        if (m.dirIndex !== 3) {
          const pinX = m.dirIndex === 2 ? 19.2 : 11.2;
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(pinX, cy - 0.4, 1.8, 1.5);
        }
        break;
      }

      case 'acc_crimson_scarf': {
        const sy = 21.6 + m.bodyBob;
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.roundRect(m.torsoX + 0.2, sy, m.torsoW - 0.4, 3.0, 1.1);
        ctx.fill();

        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.roundRect(m.torsoX + 0.7, sy + 0.4, m.torsoW - 1.4, 2.2, 0.8);
        ctx.fill();
        ctx.fillStyle = '#f87171';
        ctx.fillRect(m.torsoX + 1.2, sy + 0.65, m.torsoW - 2.4, 0.7);

        if (m.dirIndex === 0) {
          // Front scarf tail
          ctx.fillStyle = OUTLINE;
          ctx.fillRect(16.3, sy + 2.4, 3.2, 4.3);
          ctx.fillStyle = '#b91c1c';
          ctx.fillRect(16.7, sy + 2.6, 2.4, 3.7);
          ctx.fillStyle = '#fca5a5';
          ctx.fillRect(16.7, sy + 5.7, 2.4, 0.6);
        } else if (m.dirIndex === 3) {
          // Back scarf tails
          ctx.fillStyle = OUTLINE;
          ctx.fillRect(13.6, sy + 2.3, 4.8, 3.8);
          ctx.fillStyle = '#b91c1c';
          ctx.fillRect(14.0, sy + 2.5, 1.8, 3.2);
          ctx.fillRect(16.2, sy + 2.5, 1.8, 3.2);
        } else {
          const tailX = m.dirIndex === 1 ? m.torsoX + 1.2 : m.torsoX + m.torsoW - 3.6;
          ctx.fillStyle = OUTLINE;
          ctx.fillRect(tailX - 0.4, sy + 2.3, 2.8, 3.9);
          ctx.fillStyle = '#b91c1c';
          ctx.fillRect(tailX, sy + 2.5, 2.0, 3.3);
        }
        break;
      }

      case 'acc_satchel_bag': {
        // Crossbody honey-leather strap + side satchel pouch
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2.3;
        ctx.beginPath();
        if (m.dirIndex === 2) {
          ctx.moveTo(m.torsoX + m.torsoW - 1.5, ty + 0.4);
          ctx.lineTo(m.torsoX + 1.5, ty + 9.2);
        } else {
          ctx.moveTo(m.torsoX + 1.5, ty + 0.4);
          ctx.lineTo(m.torsoX + m.torsoW - 1.5, ty + 9.2);
        }
        ctx.stroke();

        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        if (m.dirIndex === 2) {
          ctx.moveTo(m.torsoX + m.torsoW - 1.5, ty + 0.4);
          ctx.lineTo(m.torsoX + 1.5, ty + 9.2);
        } else {
          ctx.moveTo(m.torsoX + 1.5, ty + 0.4);
          ctx.lineTo(m.torsoX + m.torsoW - 1.5, ty + 9.2);
        }
        ctx.stroke();

        // Satchel pouch on hip
        const bagX =
          m.dirIndex === 2 ? m.torsoX - 0.6 : m.torsoX + m.torsoW - 3.6;
        const bagY = ty + 7.4;
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.roundRect(bagX - 0.5, bagY - 0.5, 5.2, 5.2, 1.1);
        ctx.fill();
        ctx.fillStyle = '#b45309';
        ctx.beginPath();
        ctx.roundRect(bagX, bagY, 4.2, 4.2, 0.8);
        ctx.fill();
        ctx.fillStyle = '#d97706';
        ctx.fillRect(bagX, bagY, 4.2, 2.0);
        // Gold clasp
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(bagX + 1.5, bagY + 1.6, 1.2, 1.2);
        break;
      }
    }
  }

  /**
   * Draws a crisp pixel-art base player frame (matching PixelArtGenerator player_male/player_female)
   * into a 32x44 logical space (pre-scaled by caller) for Shop & Wardrobe previews.
   */
  public static drawBasePlayerFrame(
    ctx: CanvasRenderingContext2D,
    gender: 'male' | 'female',
    frameIndex: number
  ): void {
    const m = getFrameMotion(frameIndex, gender);
    const skinColor = gender === 'female' ? '#f2a65a' : '#e08e45';
    const hairColor = gender === 'female' ? '#7c2d12' : '#1c1917';
    const clothesColor = gender === 'female' ? '#059669' : '#2563eb';
    const pantsColor = '#2b3648';
    const bootLeatherColor = '#5c3317';
    const bootHighlightColor = '#854d27';
    const bootSoleColor = '#170e08';

    // 1. Boots & Trousers
    forEachBootRect(m, (bx, by, w, h, shaded) => {
      ctx.fillStyle = OUTLINE;
      ctx.beginPath();
      ctx.roundRect(bx - 0.65, by - 0.5, w + 1.3, h + 1.15, 1.15);
      ctx.fill();
      ctx.fillStyle = pantsColor;
      ctx.fillRect(bx, by, w, 1.55);
      ctx.fillStyle = shaded ? '#422410' : bootLeatherColor;
      ctx.fillRect(bx, by + 1.45, w, h - 2.45);
      if (!shaded) {
        ctx.fillStyle = bootHighlightColor;
        ctx.fillRect(bx + 0.45, by + 1.65, w * 0.44, h - 2.9);
      }
      ctx.fillStyle = bootSoleColor;
      ctx.fillRect(bx - 0.25, by + h - 1.25, w + 0.5, 1.25);
    });

    // 2. Torso
    const torsoH = 12.2;
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.roundRect(m.torsoX - 0.85, 22.0 + m.bodyBob, m.torsoW + 1.7, torsoH + 1.6, 3.0);
    ctx.fill();

    ctx.fillStyle = clothesColor;
    ctx.beginPath();
    ctx.roundRect(m.torsoX, 22.8 + m.bodyBob, m.torsoW, torsoH, 2.3);
    ctx.fill();

    // Collar & Belt
    if (m.dirIndex === 0) {
      ctx.fillStyle = gender === 'female' ? '#fff1f2' : '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(13.2, 22.8 + m.bodyBob);
      ctx.lineTo(16, 25.8 + m.bodyBob);
      ctx.lineTo(18.8, 22.8 + m.bodyBob);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#6b3410';
    ctx.fillRect(m.torsoX, 31.0 + m.bodyBob, m.torsoW, 2.5);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(14.5, 30.8 + m.bodyBob, 3.0, 2.7);
    if (gender === 'female') {
      ctx.fillStyle = clothesColor;
      ctx.fillRect(m.torsoX - 0.4, 33.2 + m.bodyBob, m.torsoW + 0.8, 2.2);
    }

    // Arms
    const armBreath = m.stepIndex === 3 ? 0.35 : 0;
    if (m.dirIndex === 0 || m.dirIndex === 3) {
      const leftArmSwing = m.stepIndex === 1 ? 1.7 : m.stepIndex === 2 ? -1.7 : 0;
      const rightArmSwing = -leftArmSwing;
      const armLeftX = m.torsoX - 2.6 - armBreath;
      const armRightX = m.torsoX + m.torsoW - 0.4 + armBreath;
      for (const [ax, swing] of [
        [armLeftX, leftArmSwing],
        [armRightX, rightArmSwing],
      ]) {
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.roundRect(ax - 0.5, 22.6 + m.bodyBob + swing * 0.55, 3.8, 8.2, 1.25);
        ctx.fill();
        ctx.fillStyle = clothesColor;
        ctx.fillRect(ax, 23.1 + m.bodyBob + swing * 0.55, 2.8, 4.1);
        ctx.fillStyle = skinColor;
        ctx.fillRect(ax, 27.1 + m.bodyBob + swing * 0.55, 2.8, 3.1);
      }
    } else if (m.dirIndex === 1) {
      const armOffset = m.stepIndex === 1 ? 2.7 : m.stepIndex === 2 ? -2.7 : 0;
      ctx.fillStyle = OUTLINE;
      ctx.beginPath();
      ctx.roundRect(13.2 + armOffset, 23.2 + m.bodyBob, 4.2, 8.2, 1.25);
      ctx.fill();
      ctx.fillStyle = clothesColor;
      ctx.fillRect(13.6 + armOffset, 23.7 + m.bodyBob, 3.4, 4.0);
      ctx.fillStyle = skinColor;
      ctx.fillRect(13.6 + armOffset, 27.7 + m.bodyBob, 3.4, 3.2);
    } else {
      const armOffset = m.stepIndex === 1 ? -2.7 : m.stepIndex === 2 ? 2.7 : 0;
      ctx.fillStyle = OUTLINE;
      ctx.beginPath();
      ctx.roundRect(14.6 + armOffset, 23.2 + m.bodyBob, 4.2, 8.2, 1.25);
      ctx.fill();
      ctx.fillStyle = clothesColor;
      ctx.fillRect(15.0 + armOffset, 23.7 + m.bodyBob, 3.4, 4.0);
      ctx.fillStyle = skinColor;
      ctx.fillRect(15.0 + armOffset, 27.7 + m.bodyBob, 3.4, 3.2);
    }

    // 3. Head & Face
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.roundRect(8.3, 7.5 + m.headBob, 15.4, 14.9, 6.6);
    ctx.fill();
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.roundRect(9.2, 8.3 + m.headBob, 13.6, 13.4, 5.8);
    ctx.fill();

    if (m.dirIndex === 0) {
      ctx.fillStyle = skinColor;
      ctx.fillRect(8.4, 14.3 + m.headBob, 1.2, 2.6);
      ctx.fillRect(22.4, 14.3 + m.headBob, 1.2, 2.6);
      ctx.fillStyle = hairColor;
      ctx.fillRect(11.8, 12.1 + m.headBob, 2.9, 0.95);
      ctx.fillRect(17.3, 12.1 + m.headBob, 2.9, 0.95);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(11.9, 13.4 + m.headBob, 2.9, 3.0);
      ctx.fillRect(17.2, 13.4 + m.headBob, 2.9, 3.0);
      ctx.fillStyle = '#17131d';
      ctx.fillRect(12.3, 13.5 + m.headBob, 2.3, 2.8);
      ctx.fillRect(17.4, 13.5 + m.headBob, 2.3, 2.8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(12.5, 13.8 + m.headBob, 1.0, 1.0);
      ctx.fillRect(17.6, 13.8 + m.headBob, 1.0, 1.0);
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(14.5, 18.6 + m.headBob);
      ctx.quadraticCurveTo(16, 19.5 + m.headBob, 17.5, 18.6 + m.headBob);
      ctx.stroke();
    } else if (m.dirIndex === 1) {
      ctx.fillStyle = hairColor;
      ctx.fillRect(10.6, 12.1 + m.headBob, 2.5, 0.95);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(10.6, 13.4 + m.headBob, 2.6, 2.9);
      ctx.fillStyle = '#17131d';
      ctx.fillRect(10.7, 13.5 + m.headBob, 2.2, 2.8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(10.9, 13.8 + m.headBob, 1.0, 1.0);
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(10.2, 18.6 + m.headBob, 2.1, 0.9);
    } else if (m.dirIndex === 2) {
      ctx.fillStyle = hairColor;
      ctx.fillRect(18.9, 12.1 + m.headBob, 2.5, 0.95);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(18.8, 13.4 + m.headBob, 2.6, 2.9);
      ctx.fillStyle = '#17131d';
      ctx.fillRect(19.1, 13.5 + m.headBob, 2.2, 2.8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(19.2, 13.8 + m.headBob, 1.0, 1.0);
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(19.7, 18.6 + m.headBob, 2.1, 0.9);
    }

    // 4. Hair
    ctx.fillStyle = hairColor;
    if (m.dirIndex === 0) {
      ctx.beginPath();
      ctx.arc(16, 11.4 + m.headBob, 7.6, Math.PI * 0.92, Math.PI * 2.08);
      ctx.fill();
      ctx.fillRect(8.8, 10.6 + m.headBob, 3.2, 5.2);
      ctx.fillRect(20.0, 10.6 + m.headBob, 3.2, 5.2);
      ctx.fillRect(11.8, 9.5 + m.headBob, 8.4, 2.4);
      if (gender === 'female') {
        ctx.fillRect(8.0, 15.0 + m.headBob, 2.9, 8.6);
        ctx.fillRect(21.1, 15.0 + m.headBob, 2.9, 8.6);
        ctx.fillStyle = '#f472b6';
        ctx.fillRect(8.0, 17.5 + m.headBob, 2.9, 1.5);
        ctx.fillRect(21.1, 17.5 + m.headBob, 2.9, 1.5);
      }
    } else if (m.dirIndex === 1) {
      ctx.beginPath();
      ctx.arc(16.4, 11.4 + m.headBob, 7.5, Math.PI * 0.72, Math.PI * 1.98);
      ctx.fill();
      ctx.fillRect(10.0, 10.6 + m.headBob, 4.4, 3.0);
      ctx.fillRect(17.6, 12.2 + m.headBob, 5.8, 7.2);
      if (gender === 'female') {
        ctx.fillRect(17.4, 15.0 + m.headBob, 4.5, 9.0);
        ctx.fillStyle = '#f472b6';
        ctx.fillRect(17.8, 17.2 + m.headBob, 3.2, 1.4);
      }
    } else if (m.dirIndex === 2) {
      ctx.beginPath();
      ctx.arc(15.6, 11.4 + m.headBob, 7.5, Math.PI * 1.02, Math.PI * 2.28);
      ctx.fill();
      ctx.fillRect(17.6, 10.6 + m.headBob, 4.4, 3.0);
      ctx.fillRect(8.6, 12.2 + m.headBob, 5.8, 7.2);
      if (gender === 'female') {
        ctx.fillRect(10.1, 15.0 + m.headBob, 4.5, 9.0);
        ctx.fillStyle = '#f472b6';
        ctx.fillRect(11.0, 17.2 + m.headBob, 3.2, 1.4);
      }
    } else {
      ctx.beginPath();
      ctx.roundRect(8.4, 6.2 + m.headBob, 15.2, 15.8, 6.8);
      ctx.fill();
      if (gender === 'female') {
        ctx.fillRect(9.2, 16.0 + m.headBob, 3.6, 8.0);
        ctx.fillRect(19.2, 16.0 + m.headBob, 3.6, 8.0);
        ctx.fillStyle = '#f472b6';
        ctx.fillRect(9.2, 18.0 + m.headBob, 3.6, 1.4);
        ctx.fillRect(19.2, 18.0 + m.headBob, 3.6, 1.4);
      }
    }
  }

  /**
   * Renders a full character + equipped outfit onto a React <canvas> for live Shop/Wardrobe previews.
   */
  public static renderCharacterPreviewCanvas(
    canvas: HTMLCanvasElement,
    gender: 'male' | 'female',
    equipped: EquippedClothingState | undefined | null,
    dirIndex: 0 | 1 | 2 | 3 = 0
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    const scale = Math.min(w / 32, h / 44);
    const offsetX = (w - 32 * scale) / 2;
    const offsetY = (h - 44 * scale) / 2;
    const frameIndex = dirIndex * 4;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(16, 40.2, 7.6, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();

    this.drawBasePlayerFrame(ctx, gender, frameIndex);

    if (equipped) {
      const hasSuit = Boolean(
        equipped.suit &&
          getClothingItemById(equipped.suit)?.equipmentSlot === 'suit' &&
          (getClothingItemById(equipped.suit)?.applicableGender === 'both' ||
            getClothingItemById(equipped.suit)?.applicableGender === gender)
      );
      for (const slot of CLOTHING_RENDER_LAYER_ORDER) {
        if (slot === 'tshirt' && hasSuit) continue;
        const itemId = equipped[slot];
        if (!itemId) continue;
        const item = getClothingItemById(itemId);
        if (!item || item.equipmentSlot !== slot) continue;
        if (item.applicableGender !== 'both' && item.applicableGender !== gender) continue;
        this.drawClothingFrame(ctx, item.itemId, gender, frameIndex);
      }
    }

    ctx.restore();
  }

  /**
   * Renders a cropped & centered icon preview of a single clothing garment onto a <canvas>.
   */
  public static renderClothingItemPreviewCanvas(
    canvas: HTMLCanvasElement,
    itemId: string,
    preferredGender: 'male' | 'female'
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const item = getClothingItemById(itemId);
    const renderGender: 'male' | 'female' =
      item && item.applicableGender !== 'both' ? item.applicableGender : preferredGender;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    // Smart crop region per slot in 32x44 space so each garment fills the card icon crisply
    let cropX = 4;
    let cropY = 18;
    let cropSize = 24;
    switch (item?.equipmentSlot) {
      case 'hat':
        cropX = 4;
        cropY = 0;
        cropSize = 24;
        break;
      case 'shoes':
        cropX = 7;
        cropY = 26;
        cropSize = 18;
        break;
      case 'pants':
        cropX = 7;
        cropY = 25;
        cropSize = 18;
        break;
      case 'tshirt':
      case 'accessory':
        cropX = 6;
        cropY = 18;
        cropSize = 20;
        break;
      case 'suit':
        cropX = 5;
        cropY = 18;
        cropSize = 22;
        break;
    }

    const scale = Math.min(w, h) / cropSize;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-cropX, -cropY);
    this.drawClothingFrame(ctx, itemId, renderGender, 0);
    ctx.restore();
  }

  public static getSupportedGendersForItem(itemId: string): Array<'male' | 'female'> {
    const item = AUNTY_GYI_CATALOG.find((c) => c.itemId === itemId);
    if (!item) return ['male', 'female'];
    if (item.applicableGender === 'both') return ['male', 'female'];
    return [item.applicableGender];
  }
}
