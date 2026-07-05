import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCurrentInternalPath,
  getAdminRouteDecision,
  getGuardedActionDecision,
  getProtectedRouteDecision,
  isAdminRoute,
  isProtectedRoute,
} from "./route-guards";

test("protected route list matches purchase and ticket pages", () => {
  assert.equal(isProtectedRoute("/ticket-types"), true);
  assert.equal(isProtectedRoute("/checkout"), true);
  assert.equal(isProtectedRoute("/confirmation"), true);
  assert.equal(isProtectedRoute("/my-tickets"), true);
  assert.equal(isProtectedRoute("/profile"), true);
  assert.equal(isProtectedRoute("/sessions/123/seats"), false);
});

test("protected route decision never renders protected content before auth is confirmed", () => {
  assert.deepEqual(
    getProtectedRouteDecision({
      isAuthenticated: false,
      status: "loading",
    }),
    {
      redirectToLogin: false,
      renderContent: false,
    }
  );

  assert.deepEqual(
    getProtectedRouteDecision({
      isAuthenticated: false,
      status: "unauthenticated",
    }),
    {
      redirectToLogin: true,
      renderContent: false,
    }
  );
});

test("protected route decision renders content only for authenticated users", () => {
  assert.deepEqual(
    getProtectedRouteDecision({
      isAuthenticated: true,
      status: "authenticated",
    }),
    {
      redirectToLogin: false,
      renderContent: true,
    }
  );
});

test("guarded seat actions redirect unauthenticated users with the current internal URL", () => {
  const currentPath = buildCurrentInternalPath({
    hash: "#A1",
    pathname: "/sessions/session-123/seats",
    search: "?date=2026-05-21",
  });

  assert.deepEqual(
    getGuardedActionDecision({
      currentPath,
      isAuthenticated: false,
      status: "unauthenticated",
    }),
    {
      allowed: false,
      loginUrl:
        "/login?redirect=%2Fsessions%2Fsession-123%2Fseats%3Fdate%3D2026-05-21%23A1",
      pending: false,
    }
  );
});

test("guarded actions wait during auth resolution and allow authenticated users", () => {
  assert.deepEqual(
    getGuardedActionDecision({
      currentPath: "/checkout",
      isAuthenticated: false,
      status: "loading",
    }),
    {
      allowed: false,
      loginUrl: null,
      pending: true,
    }
  );

  assert.deepEqual(
    getGuardedActionDecision({
      currentPath: "/checkout",
      isAuthenticated: true,
      status: "authenticated",
    }),
    {
      allowed: true,
      loginUrl: null,
      pending: false,
    }
  );
});

test("admin route list matches /admin and nested paths", () => {
  assert.equal(isAdminRoute("/admin"), true);
  assert.equal(isAdminRoute("/admin/users"), true);
  assert.equal(isAdminRoute("/my-tickets"), false);
  assert.equal(isAdminRoute("/checkout"), false);
});

test("admin route decision waits during auth resolution", () => {
  assert.deepEqual(
    getAdminRouteDecision({ isAdmin: false, isAuthenticated: false, status: "loading" }),
    { redirectToForbidden: false, redirectToLogin: false, renderContent: false }
  );
});

test("admin route decision redirects unauthenticated users to login", () => {
  assert.deepEqual(
    getAdminRouteDecision({ isAdmin: false, isAuthenticated: false, status: "unauthenticated" }),
    { redirectToForbidden: false, redirectToLogin: true, renderContent: false }
  );
});

test("admin route decision shows forbidden for authenticated non-admin users", () => {
  assert.deepEqual(
    getAdminRouteDecision({ isAdmin: false, isAuthenticated: true, status: "authenticated" }),
    { redirectToForbidden: true, redirectToLogin: false, renderContent: false }
  );
});

test("admin route decision renders content for authenticated admin users", () => {
  assert.deepEqual(
    getAdminRouteDecision({ isAdmin: true, isAuthenticated: true, status: "authenticated" }),
    { redirectToForbidden: false, redirectToLogin: false, renderContent: true }
  );
});

test("guarded actions normalize unsafe current URLs through the login redirect builder", () => {
  assert.deepEqual(
    getGuardedActionDecision({
      currentPath: "https://evil.example/checkout",
      isAuthenticated: false,
      status: "unauthenticated",
    }),
    {
      allowed: false,
      loginUrl: "/login?redirect=%2F",
      pending: false,
    }
  );
});
