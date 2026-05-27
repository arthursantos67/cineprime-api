import type {
  CatalogGenre,
  CatalogMovie,
  CatalogMovieDetail,
  CatalogRoomSummary,
  CatalogSession,
  MovieStatus,
} from "@/types/catalog";

import {
  apiRequest,
  isPaginatedResponse,
  type ApiRequestOptions,
  type PaginatedResponse,
} from "./client";

export type ListMoviesParams = {
  genre?: string;
  is_featured?: boolean;
  page?: number;
  status?: MovieStatus;
  title?: string;
};

export type GetSessionsParams = {
  date?: string;
  movie?: string;
  page?: number;
  start_from?: string;
  start_to?: string;
};

type CatalogRequestOptions = Pick<ApiRequestOptions, "signal">;

const GENRES_PATH = "/api/v1/catalog/genres/";
const MOVIES_PATH = "/api/v1/catalog/movies/";
const SESSIONS_PATH = "/api/v1/catalog/sessions/";

export const catalogApi = {
  listGenres(options: CatalogRequestOptions = {}) {
    return listGenres(options);
  },

  getMovie(movieId: string) {
    return getMovie(movieId);
  },

  getSession(sessionId: string) {
    return getSession(sessionId);
  },

  getSessions(params: GetSessionsParams = {}, options: CatalogRequestOptions = {}) {
    return getSessions(params, options);
  },

  listMovies(params: ListMoviesParams = {}, options: CatalogRequestOptions = {}) {
    return listMovies(params, options);
  },

  listFeaturedMovies() {
    return listMovies({ is_featured: true });
  },

  listNowShowingMovies() {
    return listMovies({ status: "em_cartaz" });
  },

  listPreSaleMovies() {
    return listMovies({ status: "pre_venda" });
  },

  listUpcomingMovies() {
    return listMovies({ status: "em_breve" });
  },
};

async function listGenres(options: CatalogRequestOptions) {
  const response = await apiRequest<unknown>(GENRES_PATH, {
    ...options,
    auth: "none",
    method: "GET",
  });

  if (
    !isPaginatedResponse<CatalogGenre>(response) ||
    !response.results.every(isCatalogGenre)
  ) {
    throw new Error("Unexpected catalog genre list response.");
  }

  return response satisfies PaginatedResponse<CatalogGenre>;
}

async function getMovie(movieId: string) {
  const response = await apiRequest<unknown>(`${MOVIES_PATH}${movieId}/`, {
    auth: "none",
    method: "GET",
  });

  if (!isCatalogMovieDetail(response)) {
    throw new Error("Unexpected catalog movie detail response.");
  }

  return response satisfies CatalogMovieDetail;
}

async function getSession(sessionId: string) {
  const response = await apiRequest<unknown>(`${SESSIONS_PATH}${sessionId}/`, {
    auth: "none",
    method: "GET",
  });

  if (!isCatalogSession(response)) {
    throw new Error("Unexpected catalog session detail response.");
  }

  return response satisfies CatalogSession;
}

async function listMovies(
  params: ListMoviesParams,
  options: CatalogRequestOptions = {}
) {
  const response = await apiRequest<unknown>(buildMoviesPath(params), {
    ...options,
    auth: "none",
    method: "GET",
  });

  if (
    !isPaginatedResponse<CatalogMovie>(response) ||
    !response.results.every(isCatalogMovie)
  ) {
    throw new Error("Unexpected catalog movie list response.");
  }

  return response satisfies PaginatedResponse<CatalogMovie>;
}

async function getSessions(
  params: GetSessionsParams,
  options: CatalogRequestOptions = {}
) {
  const response = await apiRequest<unknown>(buildSessionsPath(params), {
    ...options,
    auth: "none",
    method: "GET",
  });

  if (
    !isPaginatedResponse<CatalogSession>(response) ||
    !response.results.every(isCatalogSession)
  ) {
    throw new Error("Unexpected catalog session list response.");
  }

  return response satisfies PaginatedResponse<CatalogSession>;
}

function isCatalogMovieDetail(value: unknown): value is CatalogMovieDetail {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.genres) &&
    value.genres.every(isCatalogGenre) &&
    typeof value.duration_minutes === "number" &&
    typeof value.poster_url === "string" &&
    isMovieStatus(value.status) &&
    typeof value.is_featured === "boolean" &&
    typeof value.synopsis === "string" &&
    (typeof value.release_date === "string" ||
      value.release_date === null ||
      value.release_date === undefined)
  );
}

function isCatalogMovie(value: unknown): value is CatalogMovie {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.genres) &&
    value.genres.every(isCatalogGenre) &&
    typeof value.duration_minutes === "number" &&
    (typeof value.release_date === "string" ||
      value.release_date === null ||
      value.release_date === undefined) &&
    typeof value.poster_url === "string" &&
    isMovieStatus(value.status) &&
    typeof value.is_featured === "boolean"
  );
}

function isCatalogGenre(value: unknown): value is CatalogGenre {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isMovieStatus(value: unknown): value is MovieStatus {
  return value === "em_cartaz" || value === "pre_venda" || value === "em_breve";
}

function isCatalogRoom(value: unknown): value is CatalogRoomSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.capacity === "number"
  );
}

function isCatalogSession(value: unknown): value is CatalogSession {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isCatalogMovie(value.movie) &&
    isCatalogRoom(value.room) &&
    typeof value.start_time === "string" &&
    typeof value.end_time === "string" &&
    typeof value.base_price === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildMoviesPath({
  genre,
  is_featured,
  page,
  status,
  title,
}: ListMoviesParams) {
  const searchParams = new URLSearchParams();

  if (status) {
    searchParams.set("status", status);
  }

  if (genre) {
    searchParams.set("genre", genre);
  }

  if (title) {
    searchParams.set("title", title);
  }

  if (is_featured !== undefined) {
    searchParams.set("is_featured", String(is_featured));
  }

  if (page !== undefined) {
    searchParams.set("page", String(page));
  }

  const query = searchParams.toString();
  return query ? `${MOVIES_PATH}?${query}` : MOVIES_PATH;
}

function buildSessionsPath({
  date,
  movie,
  page,
  start_from,
  start_to,
}: GetSessionsParams) {
  const searchParams = new URLSearchParams();

  if (movie) {
    searchParams.set("movie", movie);
  }

  if (date) {
    searchParams.set("date", date);
  }

  if (start_from) {
    searchParams.set("start_from", start_from);
  }

  if (start_to) {
    searchParams.set("start_to", start_to);
  }

  if (page !== undefined) {
    searchParams.set("page", String(page));
  }

  const query = searchParams.toString();
  return query ? `${SESSIONS_PATH}?${query}` : SESSIONS_PATH;
}
