import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { useFirebase } from '@/lib/backendConfig';
import { userRepository } from '@/data/firebase';
import { setCurrentIdentityId } from '@/lib/currentIdentity';
import { firebaseAuthService as fbAuth } from '@/services/firebaseAuthService';
import { resolveIdentity, storeIdentityId, getStoredIdentityId, clearStoredIdentityId } from '@/services/identityService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    if (useFirebase) {
      initFirebaseAuth();
    } else {
      checkAppState();
    }
  }, []);

  // ── Firebase Auth Flow ──────────────────────────────────
  const initFirebaseAuth = () => {
    setIsLoadingPublicSettings(false);
    setIsLoadingAuth(true);

    const unsubscribe = fbAuth.onAuthStateChange(async (fbUser) => {
      if (fbUser) {
        // Ensure loading state is active during identity resolution.
        // A previous null fire (e.g. before session restore) may have
        // set isLoadingAuth=false; this prevents the app from rendering
        // routes and redirecting before the user state is loaded.
        setIsLoadingAuth(true);
        try {
          // Get Firebase ID token
          const idToken = await fbUser.getIdToken();

          // Resolve Interactive Identity (creates mapping if needed)
          let result;
          try {
            result = await resolveIdentity(idToken);
          } catch (err) {
            // If email not verified, still set the Firebase user but no identity
            if (err.code === 'EMAIL_NOT_VERIFIED' || err.message?.includes('EMAIL_NOT_VERIFIED')) {
              setAuthError({
                type: 'email_not_verified',
                message: 'Please verify your email address',
              });
              setIsLoadingAuth(false);
              setAuthChecked(true);
              return;
            }
            throw err;
          }

          const { identityId } = result;

          // Store identity ID for service-layer use
          setCurrentIdentityId(identityId);
          storeIdentityId(identityId);

          // Load user application state from Firestore
          let userState = null;
          try {
            userState = await userRepository.getUser(identityId);
          } catch {
            // User document might not exist yet for new identities
          }

          // Merge Firebase auth data with Firestore user state
          const interactiveUser = {
            id: identityId,
            email: fbUser.email,
            full_name: fbUser.displayName || userState?.full_name || '',
            ...userState,
          };

          setUser(interactiveUser);
          setIsAuthenticated(true);
          setAuthError(null);
          setIsLoadingAuth(false);
          setAuthChecked(true);
        } catch (error) {
          console.error('Firebase auth + identity resolution failed:', error);
          setAuthError({
            type: 'identity_resolution_failed',
            message: error.message || 'Failed to resolve identity',
          });
          setIsLoadingAuth(false);
          setAuthChecked(true);
        }
      } else {
        // No Firebase user — signed out
        setCurrentIdentityId(null);
        clearStoredIdentityId();
        setUser(null);
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    });

    return unsubscribe;
  };

  // ── Base44 Auth Flow (existing) ──────────────────────────
  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: { 'X-App-Id': appParams.appId },
        token: appParams.token,
        interceptResponses: true,
      });

      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);

        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);

        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({ type: 'auth_required', message: 'Authentication required' });
          } else if (reason === 'user_not_registered') {
            setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
          } else {
            setAuthError({ type: reason, message: appError.message });
          }
        } else {
          setAuthError({ type: 'unknown', message: appError.message || 'Failed to load app' });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({ type: 'unknown', message: error.message || 'An unexpected error occurred' });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);

      if (error.status === 401 || error.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);

    if (useFirebase) {
      setCurrentIdentityId(null);
      clearStoredIdentityId();
      fbAuth.logout().then(() => {
        if (shouldRedirect) {
          window.location.href = '/login';
        }
      });
    } else {
      if (shouldRedirect) {
        base44.auth.logout(window.location.href);
      } else {
        base44.auth.logout();
      }
    }
  };

  const navigateToLogin = () => {
    if (useFirebase) {
      window.location.href = '/login';
    } else {
      base44.auth.redirectToLogin(window.location.href);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};