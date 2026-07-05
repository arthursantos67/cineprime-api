export type AuthUser = {
  created_at?: string;
  email: string;
  id?: string;
  is_staff?: boolean;
  is_verified?: boolean;
  role: "user" | "staff" | "master";
  name?: string;
  username: string;
};

export type AuthStatus = "unauthenticated" | "loading" | "authenticated";

export type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  status: AuthStatus;
};

export type AuthTokens = {
  access: string;
  refresh: string;
};

export const initialAuthState: AuthState = {
  accessToken: null,
  refreshToken: null,
  status: "unauthenticated",
  user: null,
};

export function startAuthLoading(state: AuthState): AuthState {
  return {
    ...state,
    status: "loading",
  };
}

export function applyLogin(
  state: AuthState,
  tokens: AuthTokens,
  user: AuthUser | null = state.user
): AuthState {
  return {
    accessToken: tokens.access,
    refreshToken: tokens.refresh,
    status: user ? "authenticated" : "loading",
    user,
  };
}

export function applyCurrentUser(state: AuthState, user: AuthUser): AuthState {
  return {
    ...state,
    status: "authenticated",
    user,
  };
}

export function applyAccessRefresh(
  state: AuthState,
  accessToken: string
): AuthState {
  return {
    ...state,
    accessToken,
  };
}

export function applyLogout(): AuthState {
  return { ...initialAuthState };
}

export function isAuthenticated(state: AuthState) {
  return Boolean(state.accessToken && state.refreshToken && state.user);
}
