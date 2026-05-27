import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { initialAuthState } from "./auth-state";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_STORAGE = /localStorage/;
const SESSION_STORAGE = /sessionStorage/;
const ACCESS_TOKEN_PATTERN = /accessToken|access_token/;

function readSrc(relativePath: string) {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

test("auth state module does not reference browser storage APIs", () => {
  const source = readSrc("auth-state.ts");
  assert.doesNotMatch(
    source,
    LOCAL_STORAGE,
    "auth-state.ts must not use localStorage"
  );
  assert.doesNotMatch(
    source,
    SESSION_STORAGE,
    "auth-state.ts must not use sessionStorage"
  );
});

test("AuthContext does not use localStorage for any token", () => {
  const source = readSrc("AuthContext.tsx");
  assert.doesNotMatch(
    source,
    LOCAL_STORAGE,
    "AuthContext.tsx must not use localStorage"
  );
});

test("API client module does not use browser storage for token handling", () => {
  const source = readSrc("../api/client.ts");
  assert.doesNotMatch(
    source,
    LOCAL_STORAGE,
    "client.ts must not use localStorage"
  );
  assert.doesNotMatch(
    source,
    SESSION_STORAGE,
    "client.ts must not use sessionStorage"
  );
});

test("auth API module does not persist tokens in browser storage", () => {
  const source = readSrc("../api/auth.ts");
  assert.doesNotMatch(
    source,
    LOCAL_STORAGE,
    "auth.ts must not use localStorage"
  );
  assert.doesNotMatch(
    source,
    SESSION_STORAGE,
    "auth.ts must not use sessionStorage"
  );
});

test("auth persistence module uses sessionStorage by default and localStorage only when persistent flag is set", () => {
  const source = readSrc("auth-persistence.ts");
  assert.match(
    source,
    SESSION_STORAGE,
    "auth-persistence.ts must use sessionStorage for non-persistent refresh token storage"
  );
  assert.match(
    source,
    LOCAL_STORAGE,
    "auth-persistence.ts must use localStorage when persistent flag is true"
  );
  // Assert the exact conditional relationship:
  // if (persistent) { localStorage.setItem ... } else { sessionStorage.setItem ... }
  // This prevents regressions where localStorage is written unconditionally or the
  // branches are swapped.
  assert.match(
    source,
    /if\s*\(\s*persistent\s*\)[\s\S]*?localStorage\.setItem[\s\S]*?else[\s\S]*?sessionStorage\.setItem/,
    "auth-persistence.ts must use if(persistent) → localStorage.setItem and else → sessionStorage.setItem"
  );
});

test("auth persistence module does not store access tokens", () => {
  const source = readSrc("auth-persistence.ts");
  assert.doesNotMatch(
    source,
    ACCESS_TOKEN_PATTERN,
    "auth-persistence.ts must only persist the refresh token, never the access token"
  );
});

test("auth state initial value holds no tokens or user data", () => {
  assert.equal(initialAuthState.accessToken, null);
  assert.equal(initialAuthState.refreshToken, null);
  assert.equal(initialAuthState.user, null);
  assert.equal(initialAuthState.status, "unauthenticated");
});
