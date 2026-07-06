import { DEFAULT_LOCALE, type Locale, resolveLocale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";

const DEFAULT_API_BASE_URL = "http://localhost:8000";

export const KNOWN_BACKEND_ERROR_CODES = [
  "VALIDATION_FAILED",
  "INVALID_CREDENTIALS",
  "NOT_AUTHENTICATED",
  "PERMISSION_DENIED",
  "RESOURCE_NOT_FOUND",
  "SEAT_ALREADY_RESERVED",
  "INVALID_TICKET_TYPE",
  "INVALID_PAYMENT_METHOD",
  "THROTTLED",
  "INTERNAL_SERVER_ERROR",
] as const;

export type KnownBackendErrorCode = (typeof KNOWN_BACKEND_ERROR_CODES)[number];

export type BackendErrorCode = KnownBackendErrorCode | (string & {});

export type ApiErrorEnvelope = {
  error: {
    code: BackendErrorCode;
    message: string;
    status: number;
    details: unknown;
  };
};

export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type ApiAuthMode = "none" | "optional" | "required";

export type ApiRequestOptions = RequestInit & {
  auth?: ApiAuthMode;
  baseUrl?: string;
  json?: unknown;
  retryOnUnauthorized?: boolean;
  token?: string;
};

export type ApiAuthController = {
  getAccessToken: () => string | null;
  handleRefreshFailure?: (path: string) => void;
  refreshAccessToken: () => Promise<string | null>;
};

let apiAuthController: ApiAuthController | null = null;
let apiLocale: Locale = DEFAULT_LOCALE;

export class ApiError extends Error {
  public readonly code: BackendErrorCode;
  public readonly details: unknown;
  public readonly correlationId: string | null;

  constructor(
    message: string,
    public readonly status: number,
    {
      code,
      correlationId = null,
      details,
    }: {
      code: BackendErrorCode;
      correlationId?: string | null;
      details: unknown;
    }
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.correlationId = correlationId;
  }
}

export function resolveApiBaseUrl(
  configuredUrl = process.env.NEXT_PUBLIC_API_BASE_URL
) {
  const baseUrl = configuredUrl?.trim() || DEFAULT_API_BASE_URL;
  return baseUrl.replace(/\/+$/, "") || DEFAULT_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();

export function buildApiUrl(path: string, baseUrl = API_BASE_URL) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${resolveApiBaseUrl(baseUrl)}${normalizedPath}`;
}

export function setApiAuthController(controller: ApiAuthController | null) {
  apiAuthController = controller;
}

export function setApiLocale(locale: string) {
  apiLocale = resolveLocale(locale);
}

export function getApiLocale() {
  return apiLocale;
}

export async function apiRequest<T>(
  path: string,
  {
    auth = "optional",
    baseUrl,
    json,
    retryOnUnauthorized = true,
    token,
    headers,
    ...options
  }: ApiRequestOptions = {}
): Promise<T> {
  const accessToken =
    token ?? (auth === "none" ? undefined : apiAuthController?.getAccessToken() ?? undefined);
  const requestHeaders = buildHeaders(headers, accessToken);
  const requestBody =
    json !== undefined && options.body === undefined
      ? JSON.stringify(json)
      : options.body;

  const response = await fetch(buildApiUrl(path, baseUrl), {
    ...options,
    body: requestBody,
    headers: requestHeaders,
  });

  const body = await readResponseBody(response);

  if (
    response.status === 401 &&
    (auth === "required" || (auth === "optional" && accessToken)) &&
    retryOnUnauthorized &&
    apiAuthController
  ) {
    const refreshedAccessToken = await tryRefreshAccessToken();

    if (refreshedAccessToken) {
      return apiRequest<T>(path, {
        ...options,
        auth,
        baseUrl,
        body: options.body,
        headers,
        json,
        retryOnUnauthorized: false,
        token: refreshedAccessToken,
      });
    }

    if (auth === "optional") {
      // A stale token must not break public endpoints: retry anonymously
      // instead of surfacing the 401 (or logging the user out).
      return apiRequest<T>(path, {
        ...options,
        auth: "none",
        baseUrl,
        body: options.body,
        headers,
        json,
        retryOnUnauthorized: false,
      });
    }

    apiAuthController?.handleRefreshFailure?.(path);
  }

  if (!response.ok) {
    throw buildApiError(response, body);
  }

  return body as T;
}

export function createApiClient({
  auth = "optional",
  baseUrl,
  token,
}: {
  auth?: ApiAuthMode;
  baseUrl?: string;
  token?: string;
} = {}) {
  return {
    request<T>(path: string, options: ApiRequestOptions = {}) {
      return apiRequest<T>(path, {
        ...options,
        auth: options.auth ?? auth,
        baseUrl: options.baseUrl ?? baseUrl,
        token: options.token ?? token,
      });
    },
  };
}

export function sanitizeRedirectPath(path: string) {
  const candidate = path.trim();

  if (!candidate || candidate.startsWith("//") || candidate.includes("\\")) {
    return "/";
  }

  let redirectUrl: URL;

  try {
    redirectUrl = new URL(candidate, "http://frontend.local");
  } catch {
    return "/";
  }

  if (redirectUrl.origin !== "http://frontend.local") {
    return "/";
  }

  for (const key of Array.from(redirectUrl.searchParams.keys())) {
    if (/token|access|refresh|email/i.test(key)) {
      redirectUrl.searchParams.delete(key);
    }
  }

  const sanitizedHash = /token|access|refresh|email/i.test(redirectUrl.hash)
    ? ""
    : redirectUrl.hash;
  const sanitizedPath = `${redirectUrl.pathname}${redirectUrl.search}${sanitizedHash}`;
  return sanitizedPath.startsWith("/") ? sanitizedPath : "/";
}

export function buildLoginRedirectUrl(path: string) {
  const redirectPath = sanitizeRedirectPath(path);

  if (redirectPath === "/login" || redirectPath.startsWith("/login?")) {
    return "/login";
  }

  return `/login?redirect=${encodeURIComponent(redirectPath)}`;
}

const API_ERROR_MESSAGES: Record<KnownBackendErrorCode, string> =
  Object.fromEntries(
    KNOWN_BACKEND_ERROR_CODES.map((code) => [
      code,
      messages[DEFAULT_LOCALE][`error.${code}`] ?? messages[DEFAULT_LOCALE]["error.fallback"],
    ])
  ) as Record<KnownBackendErrorCode, string>;

export function isNetworkError(error: unknown): boolean {
  return !(error instanceof ApiError);
}

export function getApiErrorUserMessage(
  error: unknown,
  locale: Locale | string = apiLocale
) {
  const resolvedLocale = resolveLocale(locale);

  if (
    error instanceof ApiError &&
    Object.hasOwn(API_ERROR_MESSAGES, error.code)
  ) {
    return (
      messages[resolvedLocale][`error.${error.code}`] ??
      messages[DEFAULT_LOCALE][`error.${error.code}`] ??
      messages[resolvedLocale]["error.fallback"] ??
      messages[DEFAULT_LOCALE]["error.fallback"]
    );
  }

  if (isNetworkError(error)) {
    return messages[resolvedLocale]["error.network"] ?? messages[DEFAULT_LOCALE]["error.network"];
  }

  return messages[resolvedLocale]["error.fallback"] ?? messages[DEFAULT_LOCALE]["error.fallback"];
}

export function isPaginatedResponse<T = unknown>(
  value: unknown
): value is PaginatedResponse<T> {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.count === "number" &&
    (typeof value.next === "string" || value.next === null) &&
    (typeof value.previous === "string" || value.previous === null) &&
    Array.isArray(value.results)
  );
}

function buildHeaders(headers: HeadersInit | undefined, token: string | undefined) {
  const requestHeaders = new Headers(headers);

  if (!requestHeaders.has("Accept")) {
    requestHeaders.set("Accept", "application/json");
  }

  if (!requestHeaders.has("Accept-Language")) {
    requestHeaders.set("Accept-Language", apiLocale);
  }

  if (!requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  return requestHeaders;
}

async function tryRefreshAccessToken() {
  try {
    return await apiAuthController?.refreshAccessToken();
  } catch {
    return null;
  }
}

async function readResponseBody(response: Response) {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildApiError(response: Response, body: unknown) {
  const envelope = parseApiErrorEnvelope(body, response.status);
  const error = envelope.error;

  return new ApiError(error.message, response.status, {
    code: error.code,
    correlationId: response.headers.get("X-Correlation-ID"),
    details: error.details,
  });
}

function parseApiErrorEnvelope(
  body: unknown,
  responseStatus: number
): ApiErrorEnvelope {
  if (isRecord(body) && isRecord(body.error)) {
    const { code, details, message, status } = body.error;

    if (typeof code === "string" && typeof message === "string") {
      return {
        error: {
          code,
          details: details ?? {},
          message,
          status: typeof status === "number" ? status : responseStatus,
        },
      };
    }
  }

  return {
    error: {
      code: fallbackErrorCode(responseStatus),
      details: {},
      message: `Request failed with status ${responseStatus}`,
      status: responseStatus,
    },
  };
}

function fallbackErrorCode(status: number): BackendErrorCode {
  if (status === 400) {
    return "VALIDATION_FAILED";
  }

  if (status === 401) {
    return "NOT_AUTHENTICATED";
  }

  if (status === 403) {
    return "PERMISSION_DENIED";
  }

  if (status === 404) {
    return "RESOURCE_NOT_FOUND";
  }

  if (status === 429) {
    return "THROTTLED";
  }

  return "INTERNAL_SERVER_ERROR";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
