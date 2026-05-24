import assert from "node:assert/strict";
import test from "node:test";

import {
  API_ERROR_MESSAGES,
  ApiError,
  apiRequest,
  buildLoginRedirectUrl,
  buildApiUrl,
  getApiErrorUserMessage,
  isNetworkError,
  isPaginatedResponse,
  resolveApiBaseUrl,
  sanitizeRedirectPath,
  setApiAuthController,
  type PaginatedResponse,
} from "./client";

test("resolveApiBaseUrl uses the configured backend base URL without trailing slashes", () => {
  assert.equal(
    resolveApiBaseUrl("http://api.local:8000///"),
    "http://api.local:8000"
  );
});

test("resolveApiBaseUrl falls back to the local backend URL", () => {
  assert.equal(resolveApiBaseUrl(""), "http://localhost:8000");
});

test("buildApiUrl joins relative paths with the normalized backend base URL", () => {
  assert.equal(
    buildApiUrl("api/v1/catalog/movies/", "http://api.local:8000/"),
    "http://api.local:8000/api/v1/catalog/movies/"
  );
});

test("apiRequest applies JSON headers, bearer token, and custom request options", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "http://api.local:8000/api/v1/protected/");
      assert.equal(init?.method, "POST");
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.body, JSON.stringify({ ok: true }));

      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Accept"), "application/json");
      assert.equal(headers.get("Content-Type"), "application/json");
      assert.equal(headers.get("Authorization"), "Bearer access-token");

      return Response.json({ success: true });
    };

    const response = await apiRequest<{ success: boolean }>(
      "/api/v1/protected/",
      {
        baseUrl: "http://api.local:8000/",
        cache: "no-store",
        json: { ok: true },
        method: "POST",
        token: "access-token",
      }
    );

    assert.deepEqual(response, { success: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("apiRequest safely returns null for empty responses", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => new Response(null, { status: 204 });

    const response = await apiRequest<null>("/api/v1/logout/", {
      baseUrl: "http://api.local:8000",
    });

    assert.equal(response, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("apiRequest throws ApiError with backend envelope metadata", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      Response.json(
        {
          error: {
            code: "SEAT_ALREADY_RESERVED",
            details: { session_seat_id: 42 },
            message: "One or more selected seats are already reserved.",
            status: 409,
          },
        },
        {
          headers: { "X-Correlation-ID": "request-123" },
          status: 409,
        }
      );

    await assert.rejects(
      apiRequest("/api/v1/reservations/seats/", {
        baseUrl: "http://api.local:8000",
      }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 409);
        assert.equal(error.code, "SEAT_ALREADY_RESERVED");
        assert.equal(error.message, "One or more selected seats are already reserved.");
        assert.deepEqual(error.details, { session_seat_id: 42 });
        assert.equal(error.correlationId, "request-123");
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("apiRequest refreshes and retries a protected request once after 401", async () => {
  const originalFetch = globalThis.fetch;
  const seenAuthorizationHeaders: Array<string | null> = [];

  try {
    setApiAuthController({
      getAccessToken: () => "old-access",
      refreshAccessToken: async () => "new-access",
    });

    globalThis.fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      seenAuthorizationHeaders.push(headers.get("Authorization"));

      if (seenAuthorizationHeaders.length === 1) {
        return Response.json(
          {
            error: {
              code: "NOT_AUTHENTICATED",
              details: {},
              message: "Token is invalid or expired.",
              status: 401,
            },
          },
          { status: 401 }
        );
      }

      return Response.json({ ok: true });
    };

    const response = await apiRequest<{ ok: boolean }>("/api/v1/users/me/", {
      auth: "required",
      baseUrl: "http://api.local:8000",
    });

    assert.deepEqual(response, { ok: true });
    assert.deepEqual(seenAuthorizationHeaders, [
      "Bearer old-access",
      "Bearer new-access",
    ]);
  } finally {
    setApiAuthController(null);
    globalThis.fetch = originalFetch;
  }
});

test("apiRequest clears auth through the controller when refresh fails", async () => {
  const originalFetch = globalThis.fetch;
  let refreshAttempts = 0;
  let handledRefreshFailureFor: string | null = null;

  try {
    setApiAuthController({
      getAccessToken: () => "old-access",
      handleRefreshFailure: (path) => {
        handledRefreshFailureFor = path;
      },
      refreshAccessToken: async () => {
        refreshAttempts += 1;
        throw new Error("refresh failed");
      },
    });

    globalThis.fetch = async () =>
      Response.json(
        {
          error: {
            code: "NOT_AUTHENTICATED",
            details: {},
            message: "Token is invalid or expired.",
            status: 401,
          },
        },
        { status: 401 }
      );

    await assert.rejects(
      apiRequest("/api/v1/users/me/", {
        auth: "required",
        baseUrl: "http://api.local:8000",
      }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 401);
        assert.equal(error.code, "NOT_AUTHENTICATED");
        return true;
      }
    );

    assert.equal(refreshAttempts, 1);
    assert.equal(handledRefreshFailureFor, "/api/v1/users/me/");
  } finally {
    setApiAuthController(null);
    globalThis.fetch = originalFetch;
  }
});

test("getApiErrorUserMessage maps known backend codes without exposing raw backend messages", () => {
  for (const [code, message] of Object.entries(API_ERROR_MESSAGES)) {
    const error = new ApiError("Raw backend message.", 400, {
      code,
      details: {},
    });

    assert.equal(getApiErrorUserMessage(error), message);
    assert.notEqual(getApiErrorUserMessage(error), error.message);
  }
});

test("getApiErrorUserMessage falls back safely for unknown backend codes", () => {
  const error = new ApiError("Raw backend detail.", 400, {
    code: "UNEXPECTED_BACKEND_CODE",
    details: {},
  });

  assert.equal(
    getApiErrorUserMessage(error),
    "Não foi possível concluir a solicitação. Tente novamente."
  );
});

test("getApiErrorUserMessage returns a connection-specific message for network errors", () => {
  const networkError = new TypeError("Failed to fetch");
  const message = getApiErrorUserMessage(networkError);

  assert.match(message, /servidor/);
  assert.match(message, /conexão/);
  assert.doesNotMatch(message, /Failed to fetch/);
});

test("isNetworkError distinguishes network failures from API errors", () => {
  assert.equal(isNetworkError(new TypeError("Failed to fetch")), true);
  assert.equal(isNetworkError(new Error("Generic error")), true);
  assert.equal(
    isNetworkError(new ApiError("API failure", 500, { code: "INTERNAL_SERVER_ERROR", details: {} })),
    false
  );
});

test("isPaginatedResponse recognizes reusable DRF paginated response shape", () => {
  type MovieSummary = {
    id: number;
    title: string;
  };

  const response: unknown = {
    count: 1,
    next: null,
    previous: null,
    results: [{ id: 1, title: "Interestelar" }],
  };

  assert.equal(isPaginatedResponse<MovieSummary>(response), true);

  if (isPaginatedResponse<MovieSummary>(response)) {
    const paginated: PaginatedResponse<MovieSummary> = response;
    assert.equal(paginated.results[0]?.title, "Interestelar");
  }
});

test("sanitizeRedirectPath removes sensitive query parameters", () => {
  assert.equal(
    sanitizeRedirectPath(
      "/checkout?email=user@example.com&token=secret&reservation=123#summary"
    ),
    "/checkout?reservation=123#summary"
  );
  assert.equal(sanitizeRedirectPath("/checkout#access=secret"), "/checkout");
});

test("sanitizeRedirectPath rejects external redirect targets", () => {
  assert.equal(sanitizeRedirectPath("https://evil.example/checkout"), "/");
  assert.equal(sanitizeRedirectPath("//evil.example/checkout"), "/");
  assert.equal(sanitizeRedirectPath(String.raw`\\evil.example\checkout`), "/");
  assert.equal(sanitizeRedirectPath(String.raw`\checkout`), "/");
  assert.equal(sanitizeRedirectPath(String.raw`/checkout\evil`), "/");
  assert.equal(sanitizeRedirectPath("http://[malformed"), "/");
});

test("buildLoginRedirectUrl keeps redirects path-only and avoids login loops", () => {
  assert.equal(
    buildLoginRedirectUrl("/my-tickets?access=secret&type=upcoming"),
    "/login?redirect=%2Fmy-tickets%3Ftype%3Dupcoming"
  );
  assert.equal(buildLoginRedirectUrl("/login?redirect=/checkout"), "/login");
});
