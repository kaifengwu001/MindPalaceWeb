// src/hooks/useAuth.ts
import { useState, useEffect } from 'react';
import { getCurrentUser, signOut, fetchAuthSession } from 'aws-amplify/auth';
import type { AuthState } from '../lib/types';

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({ isAuthenticated: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const user = await getCurrentUser();
      const { tokens } = await fetchAuthSession();
      
      if (tokens?.idToken) {
        setAuthState({
          isAuthenticated: true,
          user: {
            sub: user.userId,
            email: user.username,
            accessToken: tokens.idToken.toString(),
          },
        });
      }
    } catch {
      // If there's an error, user is not authenticated
      setAuthState({ isAuthenticated: false });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setAuthState({ isAuthenticated: false });
  };

  return {
    authState,
    loading,
    signOut: handleSignOut,
    checkAuth,
  };
};