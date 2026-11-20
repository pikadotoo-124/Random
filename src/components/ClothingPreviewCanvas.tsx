/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { ClothingRenderer } from '../game/textures/ClothingRenderer';
import { EquippedClothingState } from '../game/types';

interface ClothingItemCanvasProps {
  itemId: string;
  gender: 'male' | 'female';
  className?: string;
}

export const ClothingItemPreviewCanvas: React.FC<ClothingItemCanvasProps> = ({
  itemId,
  gender,
  className = 'w-11 h-11',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    ClothingRenderer.renderClothingItemPreviewCanvas(canvasRef.current, itemId, gender);
  }, [itemId, gender]);

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={64}
      style={{ imageRendering: 'pixelated' }}
      className={className}
      aria-hidden="true"
    />
  );
};

interface CharacterOutfitPreviewCanvasProps {
  gender: 'male' | 'female';
  equipped: EquippedClothingState;
  direction?: 0 | 1 | 2 | 3;
  className?: string;
}

export const CharacterOutfitPreviewCanvas: React.FC<CharacterOutfitPreviewCanvasProps> = ({
  gender,
  equipped,
  direction = 0,
  className = 'w-24 h-32',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    ClothingRenderer.renderCharacterPreviewCanvas(canvasRef.current, gender, equipped, direction);
  }, [gender, equipped, direction]);

  return (
    <canvas
      ref={canvasRef}
      width={128}
      height={176}
      style={{ imageRendering: 'pixelated' }}
      className={className}
    />
  );
};
