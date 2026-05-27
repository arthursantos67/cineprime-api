const REFRESH_TOKEN_KEY = "cineprime:refresh_token";

export function persistRefreshToken(token: string, persistent: boolean): void {
  if (typeof window === "undefined") return;
  if (persistent) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
  }
}

export function getPersistedRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY) ?? sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearPersistedRefreshToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}
