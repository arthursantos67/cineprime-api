import type {
  CatalogGenre,
  CatalogMovie,
  CatalogMovieDetail,
  MovieStatus,
} from "@/types/catalog";

import {
  apiRequest,
  isPaginatedResponse,
  type PaginatedResponse,
} from "./client";

export type ListMoviesParams = {
  is_featured?: boolean;
  page?: number;
  status?: MovieStatus;
};

const MOVIES_PATH = "/api/v1/catalog/movies/";

export const catalogApi = {
  getMovie(movieId: string) {
    return getMovie(movieId);
  },

  listMovies(params: ListMoviesParams = {}) {
    return listMovies(params);
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
};

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

async function listMovies(params: ListMoviesParams) {
  const response = await apiRequest<unknown>(buildMoviesPath(params), {
    auth: "none",
    method: "GET",
  });

  if (!isPaginatedResponse<CatalogMovie>(response)) {
    throw new Error("Unexpected catalog movie list response.");
  }

  return response satisfies PaginatedResponse<CatalogMovie>;
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
    (value.status === "em_cartaz" || value.status === "pre_venda") &&
    typeof value.is_featured === "boolean" &&
    typeof value.synopsis === "string" &&
    (typeof value.release_date === "string" ||
      value.release_date === null ||
      value.release_date === undefined)
  );
}

function isCatalogGenre(value: unknown): value is CatalogGenre {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildMoviesPath({ is_featured, page, status }: ListMoviesParams) {
  const searchParams = new URLSearchParams();

  if (status) {
    searchParams.set("status", status);
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
