import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { initialAuthState } from "./auth-state";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BROWSER_STORAGE = /localStorage|sessionStorage/;

function readSrc(relativePath: string) {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

test("auth state module does not reference browser storage APIs", () => {
  const source = readSrc("auth-state.ts");
  assert.doesNotMatch(
    source,
    BROWSER_STORAGE,
    "auth-state.ts must not use localStorage or sessionStorage"
  );
});

test("AuthContext does not store access or refresh tokens in browser storage", () => {
  const source = readSrc("AuthContext.tsx");
  assert.doesNotMatch(
    source,
    BROWSER_STORAGE,
    "AuthContext.tsx must not use localStorage or sessionStorage"
  );
});

test("API client module does not use browser storage for token handling", () => {
  const source = readSrc("../api/client.ts");
  assert.doesNotMatch(
    source,
    BROWSER_STORAGE,
    "client.ts must not use localStorage or sessionStorage"
  );
});

test("auth API module does not persist tokens in browser storage", () => {
  const source = readSrc("../api/auth.ts");
  assert.doesNotMatch(
    source,
    BROWSER_STORAGE,
    "auth.ts must not use localStorage or sessionStorage"
  );
});

test("auth state initial value holds no tokens or user data", () => {
  assert.equal(initialAuthState.accessToken, null);
  assert.equal(initialAuthState.refreshToken, null);
  assert.equal(initialAuthState.user, null);
  assert.equal(initialAuthState.status, "unauthenticated");
});
