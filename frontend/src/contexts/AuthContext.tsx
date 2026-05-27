"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { usePathname, useRouter } from "next/navigation";

import { authApi, type LoginCredentials } from "@/api/auth";
import {
  buildLoginRedirectUrl,
  sanitizeRedirectPath,
  setApiAuthController,
} from "@/api/client";
import {
  applyAccessRefresh,
  applyCurrentUser,
  applyLogin,
  applyLogout,
  initialAuthState,
  isAuthenticated as getIsAuthenticated,
  startAuthLoading,
  type AuthState,
  type AuthUser,
} from "./auth-state";
import {
  clearPersistedRefreshToken,
  getPersistedRefreshToken,
  persistRefreshToken,
} from "./auth-persistence";

export type { AuthUser } from "./auth-state";

export const AUTH_PROTECTED_STATE_RESET_EVENT =
  "cineprime:protected-state-reset";

type AuthContextValue = {
  accessToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (credentials: LoginCredentials, options?: { stayLoggedIn?: boolean }) => Promise<AuthUser>;
  logout: (options?: { redirectToLogin?: boolean }) => void;
  refreshAccessToken: () => Promise<string | null>;
  refreshToken: string | null;
  reloadCurrentUser: () => Promise<AuthUser>;
  signOut: () => void;
  status: AuthState["status"];
  user: AuthUser | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Start in "loading" so ProtectedRoute holds rendering while we check for a
  // persisted refresh token. Resolves to "authenticated" or "unauthenticated"
  // after the on-mount restoration attempt completes.
  const [state, setState] = useState<AuthState>({
    ...initialAuthState,
    status: "loading",
  });
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
  const authGenerationRef = useRef(0);

  const clearProtectedState = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_PROTECTED_STATE_RESET_EVENT));
    }
  }, []);

  const clearAuthState = useCallback(() => {
    authGenerationRef.current += 1;
    refreshPromiseRef.current = null;
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    clearPersistedRefreshToken();
    setState(applyLogout());
    clearProtectedState();
  }, [clearProtectedState]);

  const redirectToLogin = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    router.replace(buildLoginRedirectUrl(currentPath));
  }, [router]);

  const logout = useCallback(
    ({ redirectToLogin: shouldRedirect = false } = {}) => {
      clearAuthState();

      if (shouldRedirect) {
        redirectToLogin();
      }
    },
    [clearAuthState, redirectToLogin]
  );

  const reloadCurrentUser = useCallback(async () => {
    setState((currentState) => startAuthLoading(currentState));
    const user = await authApi.currentUser();
    setState((currentState) => applyCurrentUser(currentState, user));
    return user;
  }, []);

  const refreshAccessToken = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshToken = refreshTokenRef.current;

    if (!refreshToken) {
      clearAuthState();
      return null;
    }

    const generationAtStart = authGenerationRef.current;
    const refreshPromise = authApi
      .refreshAccess(refreshToken)
      .then(({ access }) => {
        if (
          authGenerationRef.current !== generationAtStart ||
          refreshTokenRef.current !== refreshToken
        ) {
          return null;
        }

        accessTokenRef.current = access;
        setState((currentState) => applyAccessRefresh(currentState, access));
        return access;
      })
      .catch((error) => {
        if (authGenerationRef.current !== generationAtStart) {
          return null;
        }

        clearAuthState();
        throw error;
      })
      .finally(() => {
        if (refreshPromiseRef.current === refreshPromise) {
          refreshPromiseRef.current = null;
        }
      });

    refreshPromiseRef.current = refreshPromise;
    return refreshPromiseRef.current;
  }, [clearAuthState]);

  const login = useCallback(async (credentials: LoginCredentials, options?: { stayLoggedIn?: boolean }) => {
    const generationAtStart = authGenerationRef.current + 1;
    authGenerationRef.current = generationAtStart;
    refreshPromiseRef.current = null;
    setState((currentState) => startAuthLoading(currentState));

    try {
      const tokens = await authApi.login(credentials);

      if (authGenerationRef.current !== generationAtStart) {
        throw new Error("Authentication request was superseded.");
      }

      accessTokenRef.current = tokens.access;
      refreshTokenRef.current = tokens.refresh;
      persistRefreshToken(tokens.refresh, options?.stayLoggedIn ?? false);
      setState((currentState) => applyLogin(currentState, tokens));

      const user = await authApi.currentUser(tokens.access);

      if (authGenerationRef.current !== generationAtStart) {
        throw new Error("Authentication request was superseded.");
      }

      setState((currentState) => applyCurrentUser(currentState, user));
      return user;
    } catch (error) {
      if (authGenerationRef.current === generationAtStart) {
        clearAuthState();
      }

      throw error;
    }
  }, [clearAuthState]);

  useEffect(() => {
    accessTokenRef.current = state.accessToken;
    refreshTokenRef.current = state.refreshToken;
  }, [state.accessToken, state.refreshToken]);

  // On mount: attempt to restore auth from a persisted refresh token so that
  // protected routes survive page reload without requiring a new login.
  useEffect(() => {
    const storedRefresh = getPersistedRefreshToken();

    if (!storedRefresh) {
      setState(applyLogout());
      return;
    }

    const generationAtStart = authGenerationRef.current + 1;
    authGenerationRef.current = generationAtStart;

    authApi
      .refreshAccess(storedRefresh)
      .then(({ access }) => {
        if (authGenerationRef.current !== generationAtStart) return null;
        accessTokenRef.current = access;
        refreshTokenRef.current = storedRefresh;
        setState((s) => applyAccessRefresh({ ...s, refreshToken: storedRefresh }, access));
        return authApi.currentUser(access);
      })
      .then((user) => {
        if (!user) return;
        if (authGenerationRef.current !== generationAtStart) return;
        setState((s) => applyCurrentUser(s, user));
      })
      .catch(() => {
        if (authGenerationRef.current !== generationAtStart) return;
        clearPersistedRefreshToken();
        setState(applyLogout());
      });
  }, []);

  useEffect(() => {
    setApiAuthController({
      getAccessToken: () => accessTokenRef.current,
      handleRefreshFailure: () => {
        clearAuthState();
        redirectToLogin();
      },
      refreshAccessToken,
    });

    return () => {
      setApiAuthController(null);
    };
  }, [clearAuthState, redirectToLogin, refreshAccessToken]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const redirect = new URLSearchParams(window.location.search).get("redirect");

    if (pathname === "/login" && state.status === "authenticated" && redirect) {
      router.replace(sanitizeRedirectPath(redirect));
    }
  }, [pathname, router, state.status]);

  const value = useMemo(
    () => ({
      accessToken: state.accessToken,
      isAuthenticated: getIsAuthenticated(state),
      loading: state.status === "loading",
      login,
      logout,
      refreshAccessToken,
      refreshToken: state.refreshToken,
      reloadCurrentUser,
      signOut: logout,
      status: state.status,
      user: state.user,
    }),
    [login, logout, refreshAccessToken, reloadCurrentUser, state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }

  return context;
}
