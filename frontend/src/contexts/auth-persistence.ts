const REFRESH_TOKEN_KEY = "cineprime:refresh_token";

export function persistRefreshToken(token: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function getPersistedRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearPersistedRefreshToken(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}
