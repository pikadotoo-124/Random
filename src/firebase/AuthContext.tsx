/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, testConnection } from './config';
import { CloudSaveService, UserProfileDoc } from './cloudSaveService';
import { SaveSystem, SavedGameState } from '../game/systems/SaveSystem';

interface AuthContextType {
  user: User | null;
  profile: UserProfileDoc | null;
  gameState: SavedGameState | null;
  loading: boolean;
  authError: string | null;
  isOffline: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  createProfileAndStart: (playerName: string, gender: 'male' | 'female') => Promise<void>;
  updateName: (newName: string) => Promise<void>;
  reloadGameState: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [gameState, setGameState] = useState<SavedGameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  // Initial connection test & auth listener
  useEffect(() => {
    let isMounted = true;

    testConnection().then((ok) => {
      if (isMounted) setIsOffline(!ok);
    });

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!isMounted) return;
        setAuthError(null);
        setUser(firebaseUser);

        if (firebaseUser) {
          setLoading(true);
          try {
            // Load user profile from users/{uid}
            const existingProfile = await CloudSaveService.loadUserProfile(firebaseUser.uid);
            if (existingProfile) {
              setProfile(existingProfile);
              // Update last login timestamp in background
              CloudSaveService.updateLastLogin(firebaseUser.uid);

              // Load game data: playerState & worldState
              const loadedState = await CloudSaveService.loadGameState(firebaseUser.uid, existingProfile);
              if (loadedState) {
                setGameState(loadedState);
                // Also cache locally
                SaveSystem.saveGame(loadedState, firebaseUser.uid);
              } else {
                // If cloud state empty but profile exists, check local cache or default
                const local = SaveSystem.loadGame(firebaseUser.uid) || SaveSystem.getDefaultState(existingProfile.playerName, existingProfile.gender);
                setGameState(local);
              }

              // Check pending offline changes to sync
              SaveSystem.syncPendingCloudChanges();
            } else {
              // New user! Needs character selection
              setProfile(null);
              setGameState(null);
            }
          } catch (err: any) {
            console.error('Error fetching player profile from cloud:', err);
            // Fallback to local storage
            const local = SaveSystem.loadGame(firebaseUser.uid);
            if (local) {
              setProfile({
                uid: firebaseUser.uid,
                playerName: local.player.name,
                gender: local.player.gender,
                createdAt: new Date(local.lastSaved).toISOString(),
                lastLoginAt: new Date().toISOString(),
                gameVersion: 1,
              });
              setGameState(local);
            } else {
              setAuthError('Connected in offline mode. Local profile will be used.');
            }
          } finally {
            if (isMounted) setLoading(false);
          }
        } else {
          // Logged out
          setProfile(null);
          setGameState(null);
          setLoading(false);
        }
      },
      (err) => {
        console.error('Auth state listener error:', err);
        if (isMounted) {
          setAuthError('Authentication service connection error. Please try again.');
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Sign In with Google Popup
  const signInWithGoogle = async () => {
    setLoading(true);
    setAuthError(null);
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

  // Sign Out
  const signOutUser = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setProfile(null);
      setGameState(null);
    } catch (err: any) {
      console.error('Sign out error:', err);
      setAuthError('Could not sign out. Please try again.');
    } finally {
      setLoading(false);
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

    try {
      // 1. Create Firestore Profile Document: users/{uid}
      const newProfile = await CloudSaveService.createUserProfile(user.uid, trimmed, gender);
      setProfile(newProfile);

      // 2. Initialize Default Game State
      const defaultState = SaveSystem.getDefaultState(trimmed, gender);
      setGameState(defaultState);

      // 3. Save initial state both to Firestore and LocalStorage
      await CloudSaveService.saveGameState(user.uid, defaultState, 'Central Plaza');
      SaveSystem.saveGame(defaultState, user.uid);
    } catch (err: any) {
      console.error('Failed to create player profile on Firestore:', err);
      // Fallback: start with local save so the user is never blocked!
      const defaultState = SaveSystem.getDefaultState(trimmed, gender);
      setGameState(defaultState);
      SaveSystem.saveGame(defaultState, user.uid);
      setProfile({
        uid: user.uid,
        playerName: trimmed,
        gender,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        gameVersion: 1,
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

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        gameState,
        loading,
        authError,
        isOffline,
        signInWithGoogle,
        signOutUser,
        createProfileAndStart,
        updateName,
        reloadGameState,
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
