/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, testConnection } from './config';
import { CloudSaveService, UserProfileDoc } from './cloudSaveService';
import { CloudSyncState, CURRENT_SAVE_VERSION, SaveSystem, SavedGameState } from '../game/systems/SaveSystem';

interface AuthContextType {
  user: User | null;
  profile: UserProfileDoc | null;
  gameState: SavedGameState | null;
  loading: boolean;
  authError: string | null;
  cloudLoadError: string | null;
  isOffline: boolean;
  cloudSyncStatus: CloudSyncState;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  createProfileAndStart: (playerName: string, gender: 'male' | 'female') => Promise<void>;
  updateName: (newName: string) => Promise<void>;
  reloadGameState: () => Promise<void>;
  retryInitialLoad: () => Promise<void>;
  retryCloudSave: () => Promise<boolean>;
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

  const beforeSignOutSaveRef = useRef<(() => Promise<boolean>) | null>(null);
  const signingOutRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const registerBeforeSignOutSave = useCallback((handler: (() => Promise<boolean>) | null) => {
    beforeSignOutSaveRef.current = handler;
  }, []);

  const isSignOutInProgress = useCallback(() => signingOutRef.current, []);

  // Subscribe to SaveSystem cloud sync status
  useEffect(() => {
    return SaveSystem.subscribeSyncStatus(setCloudSyncStatus);
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

    try {
      // 1. Load user profile from users/{uid}
      const existingProfile = await CloudSaveService.loadUserProfile(firebaseUser.uid);
      if (!mountedRef.current) return;

      if (existingProfile) {
        setProfile(existingProfile);
        CloudSaveService.updateLastLogin(firebaseUser.uid);

        // 2. Load cloud game data AND inspect UID-scoped pending offline queue
        const cloudState = await CloudSaveService.loadGameState(firebaseUser.uid, existingProfile);
        if (!mountedRef.current) return;

        const pending = SaveSystem.getPendingSync(firebaseUser.uid);
        const localCache = SaveSystem.loadGame(firebaseUser.uid);

        if (pending && (!cloudState || pending.state.lastSaved > cloudState.lastSaved)) {
          // Pending offline/local changes are newer than Firestore: hydrate & flush sequentially!
          const upgraded = SaveSystem.migrateGameState(
            {
              ...pending.state,
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
            upgraded.currentZone || 'Central Plaza (Main City)'
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
      console.error('[CloudSave Error] Error fetching player profile/save from Firestore:', err);
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
      const newProfile = await CloudSaveService.createUserProfile(user.uid, trimmed, gender);
      setProfile(newProfile);

      const defaultState = SaveSystem.getDefaultState(trimmed, gender);
      setGameState(defaultState);

      await SaveSystem.saveGameWithCloud(user.uid, defaultState, 'Central Plaza (Main City)', true);
    } catch (err: any) {
      console.error('[CloudSave Error] Failed to create player profile on Firestore:', err);
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
      await CloudSaveService.updatePlayerName(user.uid, trimmed);
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
        signInWithGoogle,
        signOutUser,
        createProfileAndStart,
        updateName,
        reloadGameState,
        retryInitialLoad,
        retryCloudSave,
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
