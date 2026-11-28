/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, testConnection } from './config';
import { CloudSaveRequestError, CloudSaveService, DOLoadResult, UserProfileDoc } from './cloudSaveService';
import { fetchLaunchStatus } from './officialLaunchService';
import { fetchSessionCheck } from './adminService';
import { ActiveAnnouncement } from '../game/multiplayer/types';
import { CloudSyncState, CURRENT_SAVE_VERSION, SaveSystem, SavedGameState } from '../game/systems/SaveSystem';

export interface BanStatusInfo {
  banned: boolean;
  reason: string;
  bannedAt?: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfileDoc | null;
  gameState: SavedGameState | null;
  loading: boolean;
  authError: string | null;
  cloudLoadError: string | null;
  isOffline: boolean;
  cloudSyncStatus: CloudSyncState;
  isVerifiedOwner: boolean;
  banStatus: BanStatusInfo | null;
  initialAnnouncement: ActiveAnnouncement | null;
  reportServerBan: (reason?: string, bannedAt?: string | null) => void;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  createProfileAndStart: (playerName: string, gender: 'male' | 'female') => Promise<void>;
  updateName: (newName: string) => Promise<void>;
  reloadGameState: () => Promise<void>;
  retryInitialLoad: () => Promise<void>;
  retryCloudSave: () => Promise<boolean>;
  applyOfficialReset: (epoch: string) => Promise<void>;
  registerBeforeSignOutSave: (handler: (() => Promise<boolean>) | null) => void;
  isSignOutInProgress: () => boolean;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [gameState, setGameState] = useState<SavedGameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [cloudLoadError, setCloudLoadError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncState>(() => SaveSystem.getSyncStatus());
  const [isVerifiedOwner, setIsVerifiedOwner] = useState(false);
  const [banStatus, setBanStatus] = useState<BanStatusInfo | null>(null);
  const [initialAnnouncement, setInitialAnnouncement] = useState<ActiveAnnouncement | null>(null);

  const beforeSignOutSaveRef = useRef<(() => Promise<boolean>) | null>(null);
  const signingOutRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reportServerBan = useCallback((reason?: string, bannedAt?: string | null) => {
    if (!mountedRef.current) return;
    setBanStatus({
      banned: true,
      reason: reason || 'Admin မှ ဂိမ်းဝင်ခွင့် ပိတ်ပင်ထားပါသည်။',
      bannedAt: bannedAt ?? null,
    });
  }, []);

  const registerBeforeSignOutSave = useCallback((handler: (() => Promise<boolean>) | null) => {
    beforeSignOutSaveRef.current = handler;
  }, []);

  const isSignOutInProgress = useCallback(() => signingOutRef.current, []);

  // Subscribe to SaveSystem cloud sync status and server-authoritative economy reconciliation
  useEffect(() => {
    const unsubStatus = SaveSystem.subscribeSyncStatus(setCloudSyncStatus);
    const unsubEconomy = SaveSystem.subscribeEconomyReconciled((targetUid, economy) => {
      if (!mountedRef.current || auth.currentUser?.uid !== targetUid) return;
      setGameState((prev) => {
        if (!prev) return prev;
        return SaveSystem.migrateGameState(
          {
            ...prev,
            player: {
              ...prev.player,
              coins: economy.gold,
              ownedClothing: economy.ownedClothing,
            },
            inventory: {
              slots: economy.inventorySlots as any,
              coins: economy.gold,
            },
          },
          prev.player.name,
          prev.player.gender
        );
      });
    });
    return () => {
      unsubStatus();
      unsubEconomy();
    };
  }, []);

  // Auto-sync pending changes whenever network comes back online
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      if (auth.currentUser?.uid) {
        SaveSystem.syncPendingCloudChanges(auth.currentUser.uid);
      }
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const hydrateUserSession = useCallback(async (firebaseUser: User) => {
    if (!mountedRef.current) return;
    setLoading(true);
    setAuthError(null);
    setCloudLoadError(null);
    setProfile(null);
    setGameState(null);
    setIsVerifiedOwner(false);
    setBanStatus(null);
    setInitialAnnouncement(null);

    try {
      // 0. Server-authoritative Firebase ID token session check (Ban & Verified Owner verification)
      try {
        const idToken = await firebaseUser.getIdToken(false);
        if (idToken) {
          const sessionCheck = await fetchSessionCheck(idToken, undefined, 3500);
          if (!mountedRef.current) return;
          if (sessionCheck) {
            setIsVerifiedOwner(Boolean(sessionCheck.isOwner && firebaseUser.emailVerified));
            setInitialAnnouncement(sessionCheck.announcement || null);
            if (sessionCheck.banned && !sessionCheck.isOwner) {
              setBanStatus({
                banned: true,
                reason: sessionCheck.banReason || 'Admin မှ ဂိမ်းဝင်ခွင့် ပိတ်ပင်ထားပါသည်။',
                bannedAt: sessionCheck.bannedAt,
              });
              return;
            }
          }
        }
      } catch (sessionErr) {
        console.warn('[SessionCheck] Deferred to WebSocket auth check:', sessionErr);
      }

      // 1. Staged Phase 1: Try DO Primary Load (`GET /api/player/load`) first when enabled
      if (CloudSaveService.isDOPrimaryEnabled()) {
        const [doLoad, launchStatus] = await Promise.all([
          CloudSaveService.loadGameStateFromDO(firebaseUser.uid).catch((err: any): DOLoadResult => ({
            ok: false,
            mode: 'do_primary',
            exists: false,
            fallbackAllowed:
              err instanceof CloudSaveRequestError ? err.fallbackAllowed !== false : true,
            code: err?.code || 'DO_LOAD_FAILED',
            error: err?.message || 'DO load failed',
          })),
          fetchLaunchStatus(undefined, 3500),
        ]);
        if (!mountedRef.current) return;

        if (!doLoad.ok && doLoad.fallbackAllowed === false) {
          throw new CloudSaveRequestError(
            doLoad.error || 'Authentication mismatch while loading player save.',
            doLoad.status || 403,
            doLoad.code || 'ACCESS_DENIED',
            false,
            undefined,
            undefined,
            undefined,
            false
          );
        }

        if (doLoad.ok && !doLoad.fallbackToLegacy) {
          if (doLoad.needsCharacterCreation) {
            SaveSystem.setKnownSaveRevision(firebaseUser.uid, null);
            setProfile(null);
            setGameState(null);
            return;
          }

          if (doLoad.exists && doLoad.profile && doLoad.gameState) {
            SaveSystem.setKnownSaveRevision(firebaseUser.uid, doLoad.saveRevision ?? 1);
            setProfile(doLoad.profile);
            if (!CloudSaveService.isStagingEnvironment()) {
              void CloudSaveService.updateLastLogin(firebaseUser.uid);
            }

            const serverResetEpoch =
              doLoad.officialResetEpoch || launchStatus?.officialResetEpoch || null;
            const playerResetEpoch = doLoad.gameState.playerWorldChanges?.resetEpoch || null;

            if (serverResetEpoch && playerResetEpoch !== serverResetEpoch) {
              SaveSystem.clearSave(firebaseUser.uid);
              const resetState = SaveSystem.createOfficialResetStarterState(
                doLoad.profile.playerName,
                doLoad.profile.gender,
                serverResetEpoch,
                doLoad.gameState.lastSaved || 0
              );
              setGameState(resetState);
              await SaveSystem.saveGameWithCloud(
                firebaseUser.uid,
                resetState,
                'Central Plaza (Main City)',
                true
              );
              return;
            }

            const pending = SaveSystem.getPendingSync(firebaseUser.uid);
            if (pending && pending.state.lastSaved > doLoad.gameState.lastSaved) {
              // Preserve DO-authoritative Gold, Inventory, Clothing & Farm ownership even when merging offline local movement/stats
              const merged = SaveSystem.migrateGameState(
                {
                  ...pending.state,
                  player: {
                    ...pending.state.player,
                    coins: doLoad.gameState.inventory.coins,
                    ownedClothing: doLoad.gameState.player.ownedClothing,
                  },
                  inventory: doLoad.gameState.inventory,
                  buildings:
                    doLoad.gameState.buildings.length > 0
                      ? doLoad.gameState.buildings
                      : pending.state.buildings,
                  playerWorldChanges: {
                    ...SaveSystem.getDefaultWorldChanges(),
                    ...(pending.state.playerWorldChanges || {}),
                    ...(doLoad.gameState.playerWorldChanges?.ownedFarmPlots?.length
                      ? { ownedFarmPlots: doLoad.gameState.playerWorldChanges.ownedFarmPlots }
                      : {}),
                    ...(doLoad.gameState.playerWorldChanges?.resetEpoch
                      ? { resetEpoch: doLoad.gameState.playerWorldChanges.resetEpoch }
                      : {}),
                  },
                },
                doLoad.profile.playerName,
                doLoad.profile.gender
              );
              setGameState(merged);
              SaveSystem.queuePendingLocalSave(
                firebaseUser.uid,
                merged,
                merged.currentZone || 'Central Plaza (Main City)',
                pending.saveId
              );
              await SaveSystem.syncPendingCloudChanges(firebaseUser.uid);
            } else {
              setGameState(doLoad.gameState);
              SaveSystem.saveGame(doLoad.gameState, firebaseUser.uid);
              if (pending && pending.state.lastSaved <= doLoad.gameState.lastSaved) {
                SaveSystem.clearPendingSync(firebaseUser.uid);
              }
            }
            return;
          }
        }
      }

      // Legacy Firestore fallback (used ONLY on rollback flag `legacy_firestore` or transient DO unavailability)
      const existingProfile = await CloudSaveService.loadUserProfile(firebaseUser.uid);
      if (!mountedRef.current) return;

      if (existingProfile) {
        setProfile(existingProfile);
        CloudSaveService.updateLastLogin(firebaseUser.uid);

        // 2. Check authoritative Official Launch Reset epoch BEFORE merging pending/local caches
        const [cloudState, launchStatus] = await Promise.all([
          CloudSaveService.loadGameState(firebaseUser.uid, existingProfile),
          fetchLaunchStatus(undefined, 3500),
        ]);
        if (!mountedRef.current) return;

        const serverResetEpoch = launchStatus?.officialResetEpoch || null;
        const playerResetEpoch = cloudState?.playerWorldChanges?.resetEpoch || null;

        if (serverResetEpoch && playerResetEpoch !== serverResetEpoch) {
          // One-Time Official Launch Reset: wipe stale localStorage/pending queue FIRST,
          // then write clean starter state stamped with serverResetEpoch (minLastSaved guarantees clock skew safety).
          SaveSystem.clearSave(firebaseUser.uid);
          const resetState = SaveSystem.createOfficialResetStarterState(
            existingProfile.playerName,
            existingProfile.gender,
            serverResetEpoch,
            cloudState?.lastSaved || 0
          );
          setGameState(resetState);
          await SaveSystem.saveGameWithCloud(
            firebaseUser.uid,
            resetState,
            'Central Plaza (Main City)',
            true
          );
          return;
        }

        const pending = SaveSystem.getPendingSync(firebaseUser.uid);
        const localCache = SaveSystem.loadGame(firebaseUser.uid);

        if (pending && (!cloudState || pending.state.lastSaved > cloudState.lastSaved)) {
          // Pending offline/local changes are newer than Firestore:
          // preserve authoritative cloud economy if available while syncing non-economy fields via backend.
          const upgraded = SaveSystem.migrateGameState(
            {
              ...pending.state,
              ...(cloudState
                ? {
                    player: {
                      ...pending.state.player,
                      coins: cloudState.inventory.coins,
                      ownedClothing: cloudState.player.ownedClothing,
                    },
                    inventory: cloudState.inventory,
                  }
                : {}),
              buildings:
                pending.state.buildings.length > 0 || !cloudState?.buildings?.length
                  ? pending.state.buildings
                  : cloudState.buildings,
            },
            existingProfile.playerName,
            existingProfile.gender
          );
          setGameState(upgraded);
          SaveSystem.queuePendingLocalSave(
            firebaseUser.uid,
            upgraded,
            upgraded.currentZone || 'Central Plaza (Main City)',
            pending.saveId
          );
          await SaveSystem.syncPendingCloudChanges(firebaseUser.uid);
        } else if (cloudState) {
          // Cloud is authoritative and up-to-date
          setGameState(cloudState);
          SaveSystem.saveGame(cloudState, firebaseUser.uid);
          if (pending && pending.state.lastSaved <= cloudState.lastSaved) {
            SaveSystem.clearPendingSync(firebaseUser.uid);
          }
        } else if (localCache) {
          // Profile exists but cloud gameData wasn't written yet: restore local & upload
          const upgraded = SaveSystem.migrateGameState(
            localCache,
            existingProfile.playerName,
            existingProfile.gender
          );
          setGameState(upgraded);
          await SaveSystem.saveGameWithCloud(
            firebaseUser.uid,
            upgraded,
            upgraded.currentZone || 'Central Plaza (Main City)',
            true
          );
        } else {
          // Fresh profile with no gameData yet: create initial save once
          const starter = SaveSystem.getDefaultState(existingProfile.playerName, existingProfile.gender);
          if (serverResetEpoch) {
            starter.playerWorldChanges = {
              ...SaveSystem.getDefaultWorldChanges(),
              ...(starter.playerWorldChanges || {}),
              resetEpoch: serverResetEpoch,
            };
          }
          setGameState(starter);
          await SaveSystem.saveGameWithCloud(
            firebaseUser.uid,
            starter,
            starter.currentZone || 'Central Plaza (Main City)',
            true
          );
        }
      } else {
        // Verified no profile exists yet: new user -> Character Selection
        setProfile(null);
        setGameState(null);
      }
    } catch (err: any) {
      console.error('[CloudSave Error] Error fetching player profile/save:', err);
      const isHardAccessDenied =
        err instanceof CloudSaveRequestError && err.fallbackAllowed === false;

      if (isHardAccessDenied) {
        if (mountedRef.current) {
          setProfile(null);
          setGameState(null);
          setCloudLoadError(
            err.message ||
              'Access denied while loading cloud save. Please sign in with an authorized account.'
          );
        }
        return;
      }

      const local = SaveSystem.loadGame(firebaseUser.uid);
      const pending = SaveSystem.getPendingSync(firebaseUser.uid);
      const fallback = pending?.state || local;

      if (fallback && mountedRef.current) {
        setProfile({
          uid: firebaseUser.uid,
          playerName: fallback.player.name,
          gender: fallback.player.gender,
          createdAt: new Date(fallback.lastSaved).toISOString(),
          lastLoginAt: new Date().toISOString(),
          gameVersion: CURRENT_SAVE_VERSION,
        });
        setGameState(fallback);
        setAuthError(
          'Cloud ချိတ်ဆက်မှု ယာယီနှောင့်နှေးနေသဖြင့် စက်ထဲရှိ နောက်ဆုံးအချက်အလက်ကို ဖွင့်ပေးထားပါသည်။'
        );
      } else if (mountedRef.current) {
        // CRITICAL: Never silently drop a returning user into CharacterSelectModal / starter defaults on network error!
        setCloudLoadError(
          'Cloud Save အချက်အလက်များကို ရယူ၍ မရနိုင်သေးပါ။ မူလအချက်အလက်များ မပျောက်ဆုံးစေရန် ထပ်မံချိတ်ဆက်ပေးပါ။'
        );
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Initial connection test & auth listener
  useEffect(() => {
    testConnection().then((ok) => {
      if (mountedRef.current) setIsOffline(!ok);
    });

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!mountedRef.current) return;
        setAuthError(null);
        setCloudLoadError(null);
        setUser(firebaseUser);

        if (firebaseUser) {
          await hydrateUserSession(firebaseUser);
        } else {
          setProfile(null);
          setGameState(null);
          setIsVerifiedOwner(false);
          setBanStatus(null);
          setInitialAnnouncement(null);
          setLoading(false);
        }
      },
      (err) => {
        console.error('Auth state listener error:', err);
        if (mountedRef.current) {
          setAuthError('Authentication service connection error. Please try again.');
          setLoading(false);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [hydrateUserSession]);

  const retryInitialLoad = useCallback(async () => {
    if (!auth.currentUser) return;
    await hydrateUserSession(auth.currentUser);
  }, [hydrateUserSession]);

  // Sign In with Google Popup
  const signInWithGoogle = async () => {
    setLoading(true);
    setAuthError(null);
    setCloudLoadError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Google sign in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in cancelled. Please complete the Google login dialog.');
      } else if (err.code === 'auth/network-request-failed') {
        setAuthError('Network error. Check your connection or try again.');
      } else {
        setAuthError(err.message || 'Google sign-in could not be completed.');
      }
      setLoading(false);
    }
  };

  // Sign Out: MUST flush & drain sequential Cloud Save Queue BEFORE revoking auth token!
  const signOutUser = async () => {
    const activeUid = auth.currentUser?.uid;
    signingOutRef.current = true;
    setLoading(true);
    try {
      if (beforeSignOutSaveRef.current) {
        try {
          const savedOk = await beforeSignOutSaveRef.current();
          if (!savedOk) {
            console.warn('[CloudSave Warning] Pre-logout cloud save did not complete cleanly; pending local copy preserved.');
          }
        } catch (flushErr) {
          console.error('[CloudSave Error] Flush before sign-out failed:', flushErr);
        }
      }
      if (activeUid) {
        await SaveSystem.flushQueue(activeUid);
        SaveSystem.cleanupUidSession(activeUid);
      }
      await signOut(auth);
      setProfile(null);
      setGameState(null);
      setCloudLoadError(null);
      setIsVerifiedOwner(false);
      setBanStatus(null);
      setInitialAnnouncement(null);
    } catch (err: any) {
      console.error('Sign out error:', err);
      setAuthError('Could not sign out. Please try again.');
    } finally {
      signingOutRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  // Create Profile and Start Game (for new players)
  const createProfileAndStart = async (playerName: string, gender: 'male' | 'female') => {
    if (!user) {
      throw new Error('User must be logged in to create profile');
    }

    const trimmed = playerName.trim();
    if (trimmed.length < 3 || trimmed.length > 16) {
      throw new Error('Player Name must be between 3 and 16 characters.');
    }

    setLoading(true);
    setAuthError(null);
    setCloudLoadError(null);

    try {
      if (CloudSaveService.isDOPrimaryEnabled()) {
        const initRes = await CloudSaveService.initPlayerSaveInDO(user.uid, trimmed, gender);
        SaveSystem.setKnownSaveRevision(user.uid, initRes.saveRevision);
        setProfile(initRes.profile);
        setGameState(initRes.gameState);
        SaveSystem.saveGame(initRes.gameState, user.uid);
        if (!CloudSaveService.isStagingEnvironment()) {
          void CloudSaveService.createUserProfile(user.uid, trimmed, gender).catch(() => undefined);
        }
      } else {
        const newProfile = await CloudSaveService.createUserProfile(user.uid, trimmed, gender);
        setProfile(newProfile);

        const defaultState = SaveSystem.getDefaultState(trimmed, gender);
        const launchStatus = await fetchLaunchStatus(undefined, 2500);
        if (launchStatus?.officialResetEpoch) {
          defaultState.playerWorldChanges = {
            ...SaveSystem.getDefaultWorldChanges(),
            ...(defaultState.playerWorldChanges || {}),
            resetEpoch: launchStatus.officialResetEpoch,
          };
        }
        setGameState(defaultState);

        await SaveSystem.saveGameWithCloud(user.uid, defaultState, 'Central Plaza (Main City)', true);
      }
    } catch (err: any) {
      console.error('[CloudSave Error] Failed to initialize player save:', err);
      const defaultState = SaveSystem.getDefaultState(trimmed, gender);
      setGameState(defaultState);
      SaveSystem.queuePendingLocalSave(user.uid, defaultState, 'Central Plaza (Main City)');
      setProfile({
        uid: user.uid,
        playerName: trimmed,
        gender,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        gameVersion: CURRENT_SAVE_VERSION,
      });
      setAuthError('Profile saved locally. Cloud will sync automatically when available.');
    } finally {
      setLoading(false);
    }
  };

  // Update Player Name
  const updateName = async (newName: string) => {
    if (!user || !profile) return;
    const trimmed = newName.trim();
    if (trimmed.length < 3 || trimmed.length > 16) {
      throw new Error('Player Name must be between 3 and 16 characters.');
    }

    try {
      if (CloudSaveService.isDOPrimaryEnabled()) {
        if (!CloudSaveService.isStagingEnvironment()) {
          await CloudSaveService.updatePlayerName(user.uid, trimmed).catch(() => undefined);
        }
      } else {
        await CloudSaveService.updatePlayerName(user.uid, trimmed);
      }
      setProfile((prev) => (prev ? { ...prev, playerName: trimmed } : null));
    } catch (err) {
      console.error('Failed to update name:', err);
      throw err;
    }
  };

  // Reload Game State
  const reloadGameState = async () => {
    if (!user || !profile) return;
    try {
      if (CloudSaveService.isDOPrimaryEnabled()) {
        const doLoad = await CloudSaveService.loadGameStateFromDO(user.uid).catch(() => null);
        if (doLoad?.ok && !doLoad.fallbackToLegacy && doLoad.exists && doLoad.gameState) {
          SaveSystem.setKnownSaveRevision(user.uid, doLoad.saveRevision ?? 1);
          setGameState(doLoad.gameState);
          SaveSystem.saveGame(doLoad.gameState, user.uid);
          return;
        }
      }
      const state = await CloudSaveService.loadGameState(user.uid, profile);
      if (state) {
        setGameState(state);
        SaveSystem.saveGame(state, user.uid);
      }
    } catch (err) {
      console.warn('Could not reload game state from cloud:', err);
    }
  };

  // Manual Retry Cloud Save
  const retryCloudSave = useCallback(async () => {
    if (!user) return false;
    return SaveSystem.retryLastSave(user.uid);
  }, [user]);

  // Apply Official Launch Reset cleanly while online without leaving stale pending saves
  const applyOfficialReset = useCallback(
    async (epoch: string) => {
      const activeUid = auth.currentUser?.uid || user?.uid;
      if (!activeUid) return;
      const pName = profile?.playerName || gameState?.player?.name || 'Settler';
      const pGender = profile?.gender || gameState?.player?.gender || 'male';
      SaveSystem.clearSave(activeUid);
      const resetState = SaveSystem.createOfficialResetStarterState(
        pName,
        pGender,
        epoch,
        gameState?.lastSaved || 0
      );
      await SaveSystem.saveGameWithCloud(activeUid, resetState, 'Central Plaza (Main City)', true);
      if (mountedRef.current) {
        setGameState(resetState);
      }
    },
    [user?.uid, profile, gameState]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        gameState,
        loading,
        authError,
        cloudLoadError,
        isOffline,
        cloudSyncStatus,
        isVerifiedOwner,
        banStatus,
        initialAnnouncement,
        reportServerBan,
        signInWithGoogle,
        signOutUser,
        createProfileAndStart,
        updateName,
        reloadGameState,
        retryInitialLoad,
        retryCloudSave,
        applyOfficialReset,
        registerBeforeSignOutSave,
        isSignOutInProgress,
        clearAuthError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
