import { buildLoginRedirectUrl } from "@/api/client";
import type { AuthStatus } from "@/contexts/auth-state";

export const PROTECTED_ROUTES = [
  "/ticket-types",
  "/checkout",
  "/confirmation",
  "/my-tickets",
  "/profile",
] as const;

export const ADMIN_ROUTES = ["/admin"] as const;

type ProtectedRouteDecision = {
  renderContent: boolean;
  redirectToLogin: boolean;
};

type GuardedActionDecision =
  | {
      allowed: true;
      loginUrl: null;
      pending: false;
    }
  | {
      allowed: false;
      loginUrl: string;
      pending: false;
    }
  | {
      allowed: false;
      loginUrl: null;
      pending: true;
    };

type AuthGateInput = {
  isAuthenticated: boolean;
  status: AuthStatus;
};

type AdminRouteDecision = {
  renderContent: boolean;
  redirectToLogin: boolean;
  redirectToForbidden: boolean;
};

type LocationParts = {
  hash?: string;
  pathname: string;
  search?: string;
};

export function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function isAdminRoute(pathname: string) {
  return ADMIN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function getAdminRouteDecision({
  isAuthenticated,
  isAdmin,
  status,
}: AuthGateInput & { isAdmin: boolean }): AdminRouteDecision {
  if (status === "loading") {
    return { redirectToForbidden: false, redirectToLogin: false, renderContent: false };
  }

  if (!isAuthenticated) {
    return { redirectToForbidden: false, redirectToLogin: true, renderContent: false };
  }

  if (!isAdmin) {
    return { redirectToForbidden: true, redirectToLogin: false, renderContent: false };
  }

  return { redirectToForbidden: false, redirectToLogin: false, renderContent: true };
}

export function getProtectedRouteDecision({
  isAuthenticated,
  status,
}: AuthGateInput): ProtectedRouteDecision {
  if (isAuthenticated) {
    return {
      redirectToLogin: false,
      renderContent: true,
    };
  }

  return {
    redirectToLogin: status !== "loading",
    renderContent: false,
  };
}

export function getGuardedActionDecision({
  currentPath,
  isAuthenticated,
  status,
}: AuthGateInput & { currentPath: string }): GuardedActionDecision {
  if (isAuthenticated) {
    return {
      allowed: true,
      loginUrl: null,
      pending: false,
    };
  }

  if (status === "loading") {
    return {
      allowed: false,
      loginUrl: null,
      pending: true,
    };
  }

  return {
    allowed: false,
    loginUrl: buildLoginRedirectUrl(currentPath),
    pending: false,
  };
}

export function buildCurrentInternalPath({
  hash = "",
  pathname,
  search = "",
}: LocationParts) {
  return `${pathname}${search}${hash}`;
}

export function getBrowserCurrentPath() {
  if (typeof window === "undefined") {
    return "/";
  }

  return buildCurrentInternalPath(window.location);
}
