const DEFAULT_API_BASE_URL = "http://localhost:8000";

export type KnownBackendErrorCode =
  | "VALIDATION_FAILED"
  | "INVALID_CREDENTIALS"
  | "NOT_AUTHENTICATED"
  | "PERMISSION_DENIED"
  | "RESOURCE_NOT_FOUND"
  | "SEAT_ALREADY_RESERVED"
  | "INVALID_TICKET_TYPE"
  | "INVALID_PAYMENT_METHOD"
  | "THROTTLED"
  | "INTERNAL_SERVER_ERROR";

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
    auth === "required" &&
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

export const API_ERROR_MESSAGES: Record<KnownBackendErrorCode, string> = {
  VALIDATION_FAILED: "Confira as informações preenchidas e tente novamente.",
  INVALID_CREDENTIALS: "E-mail ou senha incorretos.",
  NOT_AUTHENTICATED: "Sua sessão expirou. Faça login novamente.",
  PERMISSION_DENIED: "Você não tem permissão para realizar esta ação.",
  RESOURCE_NOT_FOUND: "Não encontramos o recurso solicitado.",
  SEAT_ALREADY_RESERVED:
    "Este assento foi reservado por outra pessoa. Escolha outro assento.",
  INVALID_TICKET_TYPE: "O tipo de ingresso selecionado é inválido.",
  INVALID_PAYMENT_METHOD: "A forma de pagamento selecionada é inválida.",
  THROTTLED: "Muitas tentativas. Aguarde um momento e tente novamente.",
  INTERNAL_SERVER_ERROR:
    "Não foi possível concluir a solicitação. Tente novamente mais tarde.",
};

export function isNetworkError(error: unknown): boolean {
  return !(error instanceof ApiError);
}

export function getApiErrorUserMessage(error: unknown) {
  if (
    error instanceof ApiError &&
    Object.hasOwn(API_ERROR_MESSAGES, error.code)
  ) {
    return API_ERROR_MESSAGES[
      error.code as keyof typeof API_ERROR_MESSAGES
    ];
  }

  if (isNetworkError(error)) {
    return "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";
  }

  return "Não foi possível concluir a solicitação. Tente novamente.";
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
