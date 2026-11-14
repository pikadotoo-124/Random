/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ChatBox } from './components/ChatBox';
import { ActionPromptHUD } from './components/ActionPromptHUD';
import { BuildingPlacementHUD } from './components/BuildingPlacementHUD';
import { BuildingManageModal } from './components/BuildingManageModal';
import { BuildMenuModal } from './components/BuildMenuModal';
import { CharacterSelectModal } from './components/CharacterSelectModal';
import { CraftingModal } from './components/CraftingModal';
import { InventoryModal } from './components/InventoryModal';
import { LoginScreen } from './components/LoginScreen';
import { MobileControls } from './components/MobileControls';
import { SettingsModal } from './components/SettingsModal';
import { ShopModal } from './components/ShopModal';
import { StorageBoxModal } from './components/StorageBoxModal';
import { TopNavHUD } from './components/TopNavHUD';
import { WorldMapModal } from './components/WorldMapModal';
import { AuthProvider, useAuth } from './firebase/AuthContext';
import { GameManager } from './game/GameManager';
import { ChatMessage, ConnectionStatus } from './game/multiplayer/types';
import type { FishingHudState } from './game/scenes/WorldScene';
import { SaveSystem } from './game/systems/SaveSystem';
import { BuildingType, FenceRotation, PlacedBuilding, PlayerProfile } from './game/types';

function detectTouchViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const hasCoarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || 'ontouchstart' in window;
  return hasCoarse || (hasTouch && w <= 1180) || w < 768 || (w <= 1024 && h <= 540);
}

/**
 * GamePlay component mounted only after authentication, profile, and cloud gameState are hydrated
 */
function GamePlay() {
  const { user, profile, gameState, cloudSyncStatus, retryCloudSave, registerBeforeSignOutSave } = useAuth();
  const gameManagerRef = useRef<GameManager | null>(null);

  const [playerProfile, setPlayerProfile] = useState<PlayerProfile>(() => {
    if (gameState?.player) return gameState.player;
    return {
      name: profile?.playerName || 'Settler',
      gender: profile?.gender || 'male',
      skinTone: profile?.gender === 'female' ? '#f59e0b' : '#d97706',
      hairColor: profile?.gender === 'female' ? '#78350f' : '#292524',
      clothesColor: profile?.gender === 'female' ? '#10b981' : '#3b82f6',
      coins: gameState?.inventory?.coins ?? 25,
      currentTool: 'axe_basic',
    };
  });

  const [coins, setCoins] = useState<number>(() => gameState?.inventory?.coins ?? 25);
  const [currentZone, setCurrentZone] = useState<string>(
    () => gameState?.currentZone || 'Central Plaza (Main City)'
  );
  const [playerCoords, setPlayerCoords] = useState<{ x: number; y: number }>(() => {
    if (gameState?.position) {
      return { x: gameState.position.tileX, y: gameState.position.tileY };
    }
    return { x: 30, y: 30 };
  });

  const [tutorialCompleted, setTutorialCompleted] = useState<boolean>(() =>
    Boolean(gameState?.playerWorldChanges?.tutorialCompleted)
  );
  const [isTouchMode, setIsTouchMode] = useState<boolean>(detectTouchViewport);

  const [interactionPrompt, setInteractionPrompt] = useState<{
    type: string;
    title: string;
    subtitle: string;
    actionKey: string;
    targetId?: string;
  } | null>(null);
  const [fishingHudState, setFishingHudState] = useState<FishingHudState | null>(null);
  const [enteredZoneBanner, setEnteredZoneBanner] = useState<{ name: string; color: string } | null>(null);
  const zoneBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active Modals
  const [activeModal, setActiveModal] = useState<
    'inventory' | 'crafting' | 'shop' | 'building' | 'map' | 'storage' | 'settings' | null
  >(null);

  const [selectedStorageBuilding, setSelectedStorageBuilding] = useState<PlacedBuilding | null>(null);
  const [selectedManageBuilding, setSelectedManageBuilding] = useState<PlacedBuilding | null>(null);
  const [activeBuildingPiece, setActiveBuildingPiece] = useState<BuildingType | null>(null);
  const [placementStatus, setPlacementStatus] = useState<{
    active: boolean;
    buildingType: BuildingType | null;
    isMoving: boolean;
    tileX: number;
    tileY: number;
    rotation: FenceRotation;
    valid: boolean;
    reason?: string;
  } | null>(null);
  const [_, setInventoryVersion] = useState(0);

  // Multiplayer State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [roomFullNotice, setRoomFullNotice] = useState<boolean>(false);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

  useEffect(() => {
    const updateTouch = () => setIsTouchMode(detectTouchViewport());
    window.addEventListener('resize', updateTouch);
    window.addEventListener('orientationchange', updateTouch);
    return () => {
      window.removeEventListener('resize', updateTouch);
      window.removeEventListener('orientationchange', updateTouch);
    };
  }, []);

  // Initialize Phaser Game instance and Multiplayer
  useEffect(() => {
    if (!user || !gameState) return;

    const initialProf = gameState.player || playerProfile;
    setPlayerProfile(initialProf);
    setCoins(gameState.inventory.coins);
    setPlayerCoords({ x: gameState.position.tileX, y: gameState.position.tileY });
    if (gameState.currentZone) setCurrentZone(gameState.currentZone);
    setTutorialCompleted(Boolean(gameState.playerWorldChanges?.tutorialCompleted));

    const gm = new GameManager(initialProf, user.uid, gameState);
    gameManagerRef.current = gm;

    // Register authoritative pre-signout cloud flush BEFORE Phaser cleanup
    registerBeforeSignOutSave(async () => {
      await gm.saveCurrentState(true);
    });

    gm.initGame('phaser-canvas-container');

    // Subscribe to inventory updates (shop, crafting, chest transfer, building)
    gm.inventorySystem.onUpdate = () => {
      setCoins(gm.inventorySystem.coins);
      setInventoryVersion((v) => v + 1);
      gm.saveCurrentState(false);
    };

    // Connect to Realtime Multiplayer Server with Firebase Auth Token
    gm.networkSystem.localPlayerId = user.uid;
    const tokenGetter = async (forceRefresh = false) => {
      try {
        return await user.getIdToken(forceRefresh);
      } catch (err) {
        console.warn('Firebase token retrieval error:', err);
        return '';
      }
    };

    tokenGetter(false).then((token) => {
      if (token) {
        gm.networkSystem.connect(
          token,
          {
            name: initialProf.name,
            gender: initialProf.gender,
            positionX: gameState.position.tileX,
            positionY: gameState.position.tileY,
          },
          () => tokenGetter(true)
        );
      }
    });

    // Multiplayer Network Event Listeners
    const unsubs = [
      gm.networkSystem.on('status_changed', (evt) => {
        const status = (evt.payload?.status || evt.payload) as ConnectionStatus;
        setConnectionStatus(status);
        if (typeof evt.payload?.playerCount === 'number') {
          setOnlineCount(evt.payload.playerCount);
        }
        if (status === 'room_full') {
          setRoomFullNotice(true);
        }
      }),
      gm.networkSystem.on('room_state', (evt) => {
        const syncState = evt.payload;
        if (typeof syncState?.playerCount === 'number') {
          setOnlineCount(syncState.playerCount);
        }
      }),
      gm.networkSystem.on('player_joined', (evt) => {
        const count = evt.payload?.playerCount ?? gm.networkSystem.getOnlinePlayers().length + 1;
        setOnlineCount(count);
      }),
      gm.networkSystem.on('player_left', (evt) => {
        const count = evt.payload?.playerCount ?? gm.networkSystem.getOnlinePlayers().length + 1;
        setOnlineCount(count);
      }),
      gm.networkSystem.on('chat_message', (evt) => {
        const msg = evt.payload as ChatMessage;
        setChatMessages((prev) => [...prev.slice(-50), msg]);
        setIsChatOpen((open) => {
          if (!open) {
            setUnreadChatCount((c) => c + 1);
          }
          return open;
        });
      }),
    ];

    // Hook up scene callbacks immediately
    if (gm.worldScene) {
      gm.worldScene.onInteractionChange = (prompt) => {
        setInteractionPrompt(prompt);
      };

      gm.worldScene.onPlayerMove = (x, y, zone) => {
        setPlayerCoords({ x, y });
        setCurrentZone(zone);
      };

      gm.worldScene.onZoneEntered = (zone) => {
        setEnteredZoneBanner({ name: zone.name, color: zone.color });
        if (zoneBannerTimerRef.current) {
          clearTimeout(zoneBannerTimerRef.current);
        }
        zoneBannerTimerRef.current = setTimeout(() => {
          setEnteredZoneBanner(null);
        }, 2600);
      };

      gm.worldScene.onFishingStateChange = (state) => {
        setFishingHudState(state);
      };

      gm.worldScene.onOpenUIModal = (modal, data) => {
        if (modal === 'storage') {
          setSelectedStorageBuilding(data);
          setActiveModal('storage');
        } else {
          setActiveModal(modal);
        }
      };

      gm.worldScene.onPlacementStatusChange = (status) => {
        setPlacementStatus(status.active ? status : null);
        if (!status.active) {
          setActiveBuildingPiece(null);
        }
      };

      gm.worldScene.onSelectPlacedBuilding = (building) => {
        setSelectedManageBuilding(building);
      };

      gm.worldScene.onResourceGathered = () => {
        gm.recordStat('totalGathered', 1);
      };

      gm.worldScene.onBuildingBuilt = (isMove) => {
        if (!isMove) {
          gm.recordStat('totalBuilt', 1);
        }
      };

      gm.worldScene.onStateChanged = () => {
        gm.saveCurrentState(false);
      };
    }

    // Periodic safety auto-save every 20 seconds
    const autoSaveTimer = setInterval(() => {
      gm.saveCurrentState(false);
    }, 20000);

    // Reliable flush on page hide / tab switch / unload
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        gm.flushPendingLocalOnly();
        gm.saveCurrentState(true);
      }
    };
    const handlePageHide = () => {
      gm.flushPendingLocalOnly();
      gm.saveCurrentState(true);
    };
    const handleBeforeUnload = () => {
      gm.flushPendingLocalOnly();
      gm.saveCurrentState(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(autoSaveTimer);
      if (zoneBannerTimerRef.current) clearTimeout(zoneBannerTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      registerBeforeSignOutSave(null);
      unsubs.forEach((unsub) => unsub());
      gm.flushPendingLocalOnly();
      gm.saveCurrentState(true);
      gm.destroy();
      gameManagerRef.current = null;
    };
  }, [user?.uid]);

  // Handle Character Name Update from Settings
  const handleNameUpdated = (newName: string) => {
    setPlayerProfile((prev) => ({ ...prev, name: newName }));
    if (gameManagerRef.current) {
      gameManagerRef.current.playerProfile.name = newName;
      if (gameManagerRef.current.worldScene?.playerNameText) {
        gameManagerRef.current.worldScene.playerNameText.setText(newName);
      }
      gameManagerRef.current.saveCurrentState(true);
    }
  };

  // Trigger Action
  const handleTriggerAction = useCallback(() => {
    if (!tutorialCompleted) {
      setTutorialCompleted(true);
      gameManagerRef.current?.markTutorialCompleted();
    }
    gameManagerRef.current?.triggerAction();
  }, [tutorialCompleted]);

  const handleDismissTutorial = useCallback(() => {
    setTutorialCompleted(true);
    gameManagerRef.current?.markTutorialCompleted();
  }, []);

  // Mobile Joystick move
  const handleJoystickMove = useCallback((vx: number, vy: number) => {
    gameManagerRef.current?.setJoystickVector(vx, vy);
  }, []);

  // Zoom controls
  const handleZoomIn = () => gameManagerRef.current?.zoomIn();
  const handleZoomOut = () => gameManagerRef.current?.zoomOut();

  // Building placement selection
  const handleSelectBuildingPiece = (type: BuildingType) => {
    setActiveBuildingPiece(type);
    setActiveModal(null);
    gameManagerRef.current?.setBuildMode(type);
  };

  const handleCancelBuildMode = () => {
    setActiveBuildingPiece(null);
    setPlacementStatus(null);
    gameManagerRef.current?.setBuildMode(null);
  };

  const handleRotateBuildPreview = () => {
    gameManagerRef.current?.rotateBuildPreview();
  };

  // Town Chat Toggle & Shortcuts
  const handleToggleChat = () => {
    setIsChatOpen((prev) => {
      const next = !prev;
      if (next) {
        setUnreadChatCount(0);
      }
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        if (e.key === 'Escape') {
          setIsChatOpen(false);
        }
        return;
      }

      if (e.key === 't' || e.key === 'T') {
        if (!activeModal) {
          e.preventDefault();
          handleToggleChat();
        }
      } else if (e.key === 'Escape') {
        if (isChatOpen) {
          setIsChatOpen(false);
        } else if (activeModal) {
          setActiveModal(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal, isChatOpen]);

  // Reset Game
  const handleResetGame = () => {
    SaveSystem.clearSave(user?.uid);
    if (gameManagerRef.current) {
      gameManagerRef.current.destroy();
      gameManagerRef.current = null;
    }
    window.location.reload();
  };

  const isBuildActive = Boolean(placementStatus?.active || activeBuildingPiece);

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-stone-950 font-sans select-none">
      {/* 1. Phaser 3 Canvas Viewport */}
      <div id="phaser-canvas-container" className="absolute inset-0 w-full h-full" />

      {/* 2. Top Navigation & Status Bar */}
      <TopNavHUD
        playerProfile={playerProfile}
        coins={coins}
        currentZone={currentZone}
        coords={playerCoords}
        onOpenModal={(modal) => setActiveModal(modal)}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        isBuildMode={isBuildActive}
        onCancelBuildMode={handleCancelBuildMode}
        onlineCount={onlineCount}
        maxPlayers={10}
        connectionStatus={connectionStatus}
        cloudSyncStatus={cloudSyncStatus}
        onRetryCloudSave={() => {
          gameManagerRef.current?.saveCurrentState(true);
          retryCloudSave();
        }}
        isChatOpen={isChatOpen}
        unreadChatCount={unreadChatCount}
        onToggleChat={handleToggleChat}
      />

      {/* 2B. Town Chat System (Hidden by default; opens via T key or TopNav button) */}
      <ChatBox
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={chatMessages}
        currentUserId={user?.uid || ''}
        onSendMessage={(text) => {
          gameManagerRef.current?.networkSystem.sendChatMessage(text);
        }}
        onlineCount={onlineCount}
        maxPlayers={10}
      />

      {/* Room Full Notification Dialog */}
      {roomFullNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="max-w-md w-full bg-stone-900 border border-amber-600/60 rounded-2xl p-6 text-stone-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-lg font-bold">လူဦးရေပြည့်နေပါသည် (၁၀/၁၀)</h2>
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">
              Random City အွန်လိုင်းဆာဗာတွင် ကစားသူ ၁၀ ဦး ပြည့်နေပါသည်။ အော့ဖ်လိုင်း (တစ်ဦးတည်း) ဆက်လက်ဆော့ကစားနိုင်သလို ပြန်လည်ချိတ်ဆက်ရန်လည်း ကြိုးစားနိုင်ပါသည်။
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRoomFullNotice(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-stone-800 text-stone-300 hover:bg-stone-700 transition cursor-pointer"
              >
                တစ်ဦးတည်း ဆက်လက်ကစားမည်
              </button>
              <button
                onClick={() => {
                  setRoomFullNotice(false);
                  user?.getIdToken(true).then((token) => {
                    if (token) {
                      gameManagerRef.current?.networkSystem.connect(
                        token,
                        {
                          name: playerProfile.name,
                          gender: playerProfile.gender,
                          positionX: playerCoords.x,
                          positionY: playerCoords.y,
                        },
                        () => user.getIdToken(true)
                      );
                    }
                  });
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition cursor-pointer"
              >
                ပြန်လည်ချိတ်ဆက်မည်
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Context-sensitive Action Prompt, Zone Entry Toast & Fishing Timing HUD */}
      <ActionPromptHUD
        prompt={interactionPrompt}
        onTrigger={handleTriggerAction}
        isTouchMode={isTouchMode}
        tutorialCompleted={tutorialCompleted}
        onDismissTutorial={handleDismissTutorial}
        isBuildMode={isBuildActive}
        enteredZoneBanner={enteredZoneBanner}
        fishingState={fishingHudState}
        onCatchFishing={() => gameManagerRef.current?.triggerFishingCatch()}
        onCancelFishing={() => gameManagerRef.current?.cancelFishing()}
      />

      {/* 4. Mobile Virtual Joystick & Touch Controls */}
      <MobileControls
        onJoystickMove={handleJoystickMove}
        onInteract={handleTriggerAction}
        onOpenModal={(modal) => setActiveModal(modal)}
        hasNearbyInteraction={Boolean(interactionPrompt || fishingHudState?.active)}
        isBuildMode={isBuildActive}
        isModalOpen={Boolean(activeModal || selectedManageBuilding)}
      />

      {/* 5. Inventory Modal */}
      {activeModal === 'inventory' && gameManagerRef.current && (
        <InventoryModal
          inventory={gameManagerRef.current.inventorySystem}
          onClose={() => setActiveModal(null)}
          onSelectBuilding={handleSelectBuildingPiece}
        />
      )}

      {/* 6. Crafting Station Modal */}
      {activeModal === 'crafting' && gameManagerRef.current && (
        <CraftingModal
          craftingSystem={gameManagerRef.current.craftingSystem}
          inventory={gameManagerRef.current.inventorySystem}
          isNearWorkbench={gameManagerRef.current.worldScene?.isNearCraftStation ?? true}
          isNearCampfire={gameManagerRef.current.worldScene?.isNearCampfire ?? false}
          onCrafted={() => {
            gameManagerRef.current?.recordStat('totalCrafted', 1);
            gameManagerRef.current?.saveCurrentState(false);
          }}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* 7. Merchant General Store Modal */}
      {activeModal === 'shop' && gameManagerRef.current && (
        <ShopModal
          inventory={gameManagerRef.current.inventorySystem}
          onSold={(goldEarned) => {
            gameManagerRef.current?.recordStat('totalSoldGold', goldEarned);
            gameManagerRef.current?.saveCurrentState(false);
          }}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* 8. Building Construction Menu */}
      {activeModal === 'building' && gameManagerRef.current && (
        <BuildMenuModal
          buildingSystem={gameManagerRef.current.buildingSystem}
          inventory={gameManagerRef.current.inventorySystem}
          onSelectPiece={handleSelectBuildingPiece}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* 9. World Radar Map (120x120 Live Canvas with Zoom & Pan) */}
      {activeModal === 'map' && gameManagerRef.current && (
        <WorldMapModal
          playerCoords={playerCoords}
          currentZone={currentZone}
          mapSystem={gameManagerRef.current.mapSystem}
          placedBuildings={gameManagerRef.current.buildingSystem.buildings}
          resourceNodes={gameManagerRef.current.resourceSystem.nodes}
          onlinePlayers={gameManagerRef.current.networkSystem.getOnlinePlayers()}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* 10. Storage Chest Modal */}
      {activeModal === 'storage' && selectedStorageBuilding && gameManagerRef.current && (
        <StorageBoxModal
          building={selectedStorageBuilding}
          inventory={gameManagerRef.current.inventorySystem}
          onStorageChanged={() => {
            gameManagerRef.current?.saveCurrentState(false);
          }}
          onClose={() => {
            setActiveModal(null);
            setSelectedStorageBuilding(null);
            gameManagerRef.current?.saveCurrentState(true);
          }}
        />
      )}

      {/* 11. Settings & Guide Modal */}
      {activeModal === 'settings' && gameManagerRef.current && (
        <SettingsModal
          playerProfile={playerProfile}
          onClose={() => setActiveModal(null)}
          onSave={() => {
            gameManagerRef.current?.saveCurrentState(true);
          }}
          onReset={handleResetGame}
          onNameUpdated={handleNameUpdated}
        />
      )}

      {/* 12. Building Placement HUD (Ghost Preview, Fence Rotation & Position Confirmation) */}
      {placementStatus && placementStatus.active && placementStatus.buildingType && (
        <BuildingPlacementHUD
          buildingType={placementStatus.buildingType}
          isMoving={placementStatus.isMoving}
          tileX={placementStatus.tileX}
          tileY={placementStatus.tileY}
          rotation={placementStatus.rotation}
          valid={placementStatus.valid}
          reason={placementStatus.reason}
          onRotate={handleRotateBuildPreview}
          onConfirm={() => {
            gameManagerRef.current?.confirmBuildPlacement();
          }}
          onCancel={handleCancelBuildMode}
        />
      )}

      {/* 13. Building Management Modal (Move / Demolish & Refund / Open Storage) */}
      {selectedManageBuilding && (
        <BuildingManageModal
          building={selectedManageBuilding}
          onMove={(b) => {
            setSelectedManageBuilding(null);
            setActiveBuildingPiece(b.type);
            gameManagerRef.current?.setBuildMode(b.type, b.id);
          }}
          onDemolish={(b) => {
            gameManagerRef.current?.dismantleBuilding(b.id);
            setSelectedManageBuilding(null);
          }}
          onOpenStorage={(b) => {
            setSelectedManageBuilding(null);
            setSelectedStorageBuilding(b);
            setActiveModal('storage');
          }}
          onClose={() => setSelectedManageBuilding(null)}
        />
      )}
    </div>
  );
}

/**
 * Root Application Container with strict Cloud Hydration Gate
 */
function RootContainer() {
  const { user, profile, gameState, loading, createProfileAndStart } = useAuth();

  // 1. Wait for Auth AND Cloud Save hydration before mounting Character Select or GamePlay
  if (loading || (user && profile && !gameState)) {
    return (
      <div className="w-screen h-[100dvh] flex flex-col items-center justify-center bg-stone-950 text-stone-200 gap-3 select-none">
        <Loader2 size={36} className="animate-spin text-amber-500" />
        <div className="text-sm font-semibold tracking-wide text-stone-300">
          Connecting to Random City Cloud...
        </div>
      </div>
    );
  }

  // 2. Unauthenticated: Display Google Login Screen
  if (!user) {
    return <LoginScreen />;
  }

  // 3. Authenticated but New User: Display Character Selection
  if (!profile) {
    return (
      <CharacterSelectModal
        onStart={(chosen) => {
          createProfileAndStart(chosen.name, chosen.gender);
        }}
        isLoading={loading}
      />
    );
  }

  // 4. Authenticated, Profile & Cloud Save ready: Start the World!
  return <GamePlay />;
}

export default function App() {
  return (
    <AuthProvider>
      <RootContainer />
    </AuthProvider>
  );
}
