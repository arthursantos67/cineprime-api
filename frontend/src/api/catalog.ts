import type { MovieStatus, CatalogMovie } from "@/types/catalog";

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
