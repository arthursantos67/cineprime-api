"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { catalogApi } from "@/api/catalog";
import { getApiErrorUserMessage } from "@/api/client";
import { FeaturedMovieBanner } from "@/components/movies";
import { MovieGrid } from "@/components/movies";
import { StateMessage } from "@/components/ui/StateMessage";
import type {
  CatalogGenre,
  CatalogMovie,
  MovieAvailabilityHint,
  MovieStatus,
} from "@/types/catalog";

type SectionStatus = "error" | "loading" | "success";

export type MovieSectionState = {
  errorMessage?: string;
  movies: CatalogMovie[];
  status: SectionStatus;
};

export type GenreFilterState = {
  errorMessage?: string;
  genres: CatalogGenre[];
  status: SectionStatus;
};

export type MovieDiscoveryFilters = {
  genre: string | null;
  status: MovieStatus | null;
  title: string;
};

export type MovieDiscoveryState = {
  availabilityByMovieId: Record<string, MovieAvailabilityHint>;
  errorMessage?: string;
  movies: CatalogMovie[];
  status: SectionStatus;
};

type HomeCatalogSectionsProps = {
  discovery: MovieDiscoveryState;
  featured: MovieSectionState;
  filters: MovieDiscoveryFilters;
  genres: GenreFilterState;
  onClearFilters?: () => void;
  onGenreChange?: (genre: string | null) => void;
  onRetryDiscovery?: () => void;
  onRetryFeatured?: () => void;
  onSearchChange?: (value: string) => void;
  onStatusChange?: (status: MovieStatus | null) => void;
  searchValue: string;
};

const loadingSectionState: MovieSectionState = {
  movies: [],
  status: "loading",
};

const loadingGenreState: GenreFilterState = {
  genres: [],
  status: "loading",
};

const loadingDiscoveryState: MovieDiscoveryState = {
  availabilityByMovieId: {},
  movies: [],
  status: "loading",
};

export const CATALOG_SEARCH_DEBOUNCE_MS = 350;
const SESSION_AVAILABILITY_LOOKAHEAD_DAYS = 3;

const statusFilterOptions: Array<{
  label: string;
  value: MovieStatus | null;
}> = [
  { label: "Todos", value: null },
  { label: "Em cartaz", value: "em_cartaz" },
  { label: "Pré-venda", value: "pre_venda" },
  { label: "Em breve", value: "em_breve" },
];

export function HomeCatalog() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => getMovieDiscoveryFiltersFromSearchParams(searchParams),
    [searchParams]
  );
  const [searchValue, setSearchValue] = useState(filters.title);
  const [featured, setFeatured] =
    useState<MovieSectionState>(loadingSectionState);
  const [genres, setGenres] = useState<GenreFilterState>(loadingGenreState);
  const [discovery, setDiscovery] =
    useState<MovieDiscoveryState>(loadingDiscoveryState);
  const [featuredRetryCount, setFeaturedRetryCount] = useState(0);
  const [discoveryRetryCount, setDiscoveryRetryCount] = useState(0);

  const updateCatalogUrl = useCallback(
    (nextFilters: MovieDiscoveryFilters) => {
      const nextParams = new URLSearchParams(searchParams.toString());

      setOrDeleteParam(nextParams, "q", nextFilters.title.trim());
      setOrDeleteParam(nextParams, "status", nextFilters.status);
      setOrDeleteParam(nextParams, "genre", nextFilters.genre);

      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    setSearchValue(filters.title);
  }, [filters.title]);

  useEffect(() => {
    const normalizedSearchValue = searchValue.trim();

    if (normalizedSearchValue === filters.title) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      updateCatalogUrl({
        ...filters,
        title: normalizedSearchValue,
      });
    }, CATALOG_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [filters, searchValue, updateCatalogUrl]);

  useEffect(() => {
    let isActive = true;

    setFeatured(loadingSectionState);

    catalogApi
      .listFeaturedMovies()
      .then((response) => {
        if (!isActive) {
          return;
        }

        setFeatured({
          movies: response.results,
          status: "success",
        });
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setFeatured({
          errorMessage: getApiErrorUserMessage(error),
          movies: [],
          status: "error",
        });
      });

    return () => {
      isActive = false;
    };
  }, [featuredRetryCount]);

  useEffect(() => {
    const abortController = new AbortController();

    setGenres(loadingGenreState);

    catalogApi
      .listGenres({ signal: abortController.signal })
      .then((response) => {
        setGenres({
          genres: response.results,
          status: "success",
        });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        setGenres({
          errorMessage: getApiErrorUserMessage(error),
          genres: [],
          status: "error",
        });
      });

    return () => {
      abortController.abort();
    };
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    setDiscovery(loadingDiscoveryState);

    catalogApi
      .listMovies(
        {
          genre: filters.genre ?? undefined,
          status: filters.status ?? undefined,
          title: filters.title || undefined,
        },
        { signal: abortController.signal }
      )
      .then(async (response) => {
        const movies = response.results;
        const loadingAvailability = createAvailabilityMap(movies, "loading");

        setDiscovery({
          availabilityByMovieId: loadingAvailability,
          movies,
          status: "success",
        });

        const availabilityByMovieId = await loadAvailabilityHints(
          movies,
          abortController.signal
        );

        if (abortController.signal.aborted) {
          return;
        }

        setDiscovery({
          availabilityByMovieId,
          movies,
          status: "success",
        });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        setDiscovery({
          availabilityByMovieId: {},
          errorMessage: getApiErrorUserMessage(error),
          movies: [],
          status: "error",
        });
      });

    return () => {
      abortController.abort();
    };
  }, [discoveryRetryCount, filters.genre, filters.status, filters.title]);

  const handleClearFilters = useCallback(() => {
    setSearchValue("");
    updateCatalogUrl({ genre: null, status: null, title: "" });
  }, [updateCatalogUrl]);

  const handleGenreChange = useCallback(
    (genre: string | null) => {
      updateCatalogUrl({
        ...filters,
        genre,
      });
    },
    [filters, updateCatalogUrl]
  );

  const handleStatusChange = useCallback(
    (status: MovieStatus | null) => {
      updateCatalogUrl({
        ...filters,
        status,
      });
    },
    [filters, updateCatalogUrl]
  );

  return (
    <HomeCatalogSections
      discovery={discovery}
      featured={featured}
      filters={filters}
      genres={genres}
      onClearFilters={handleClearFilters}
      onGenreChange={handleGenreChange}
      onRetryDiscovery={() => {
        setDiscoveryRetryCount((current) => current + 1);
      }}
      onRetryFeatured={() => {
        setFeaturedRetryCount((current) => current + 1);
      }}
      onSearchChange={setSearchValue}
      onStatusChange={handleStatusChange}
      searchValue={searchValue}
    />
  );
}

export function HomeCatalogSections({
  discovery,
  featured,
  filters,
  genres,
  onClearFilters,
  onGenreChange,
  onRetryDiscovery,
  onRetryFeatured,
  onSearchChange,
  onStatusChange,
  searchValue,
}: HomeCatalogSectionsProps) {
  const featuredMovie = featured.movies[0];
  const hasFilters = hasActiveDiscoveryFilters(filters);

  return (
    <div className="home-catalog" id="catalogo">
      {featured.status === "loading" ? (
        <StateMessage title="Carregando filme em destaque" tone="loading">
          Buscando os destaques do catálogo.
        </StateMessage>
      ) : null}

      {featured.status === "error" ? (
        <CatalogErrorState
          message={
            featured.errorMessage ??
            "Não foi possível carregar o filme em destaque. Tente novamente."
          }
          onRetry={onRetryFeatured}
          title="Destaque indisponível"
        />
      ) : null}

      {featured.status === "success" && !featuredMovie ? (
        <StateMessage title="Nenhum destaque disponível">
          Ainda não há filme marcado como destaque no catálogo.
        </StateMessage>
      ) : null}

      {featured.status === "success" && featuredMovie ? (
        <FeaturedMovieBanner movie={featuredMovie} primaryActionLabel="Ver detalhes" />
      ) : null}

      <CatalogDiscoveryControls
        filters={filters}
        genres={genres}
        onClearFilters={onClearFilters}
        onGenreChange={onGenreChange}
        onSearchChange={onSearchChange}
        onStatusChange={onStatusChange}
        searchValue={searchValue}
      />

      {discovery.status === "error" ? (
        <CatalogErrorState
          message={
            discovery.errorMessage ??
            "Não foi possível buscar filmes agora. Tente novamente."
          }
          onRetry={onRetryDiscovery}
          title="Busca indisponível"
        />
      ) : null}

      {discovery.status === "loading" ? (
        <MovieGrid
          isLoading
          loadingLabel="Buscando filmes..."
          movies={[]}
          title="Catálogo"
        />
      ) : null}

      {discovery.status === "success" && discovery.movies.length === 0 ? (
        <StateMessage
          action={
            hasFilters && onClearFilters ? (
              <button
                className="button button-primary"
                onClick={onClearFilters}
                type="button"
              >
                Limpar filtros
              </button>
            ) : undefined
          }
          title={
            hasFilters
              ? "Nenhum filme encontrado"
              : "Nenhum filme disponível"
          }
        >
          {hasFilters
            ? "Não encontramos filmes para essa combinação de busca e filtros."
            : "Ainda não há filmes cadastrados no catálogo."}
        </StateMessage>
      ) : null}

      {discovery.status === "success" && discovery.movies.length > 0 ? (
        <MovieGrid
          availabilityByMovieId={discovery.availabilityByMovieId}
          movies={discovery.movies}
          title="Catálogo"
        />
      ) : null}
    </div>
  );
}

function CatalogDiscoveryControls({
  filters,
  genres,
  onClearFilters,
  onGenreChange,
  onSearchChange,
  onStatusChange,
  searchValue,
}: {
  filters: MovieDiscoveryFilters;
  genres: GenreFilterState;
  onClearFilters?: () => void;
  onGenreChange?: (genre: string | null) => void;
  onSearchChange?: (value: string) => void;
  onStatusChange?: (status: MovieStatus | null) => void;
  searchValue: string;
}) {
  const hasFilters = hasActiveDiscoveryFilters(filters);
  const hasGenreOptions = genres.status === "success" && genres.genres.length > 0;

  return (
    <section aria-labelledby="catalog-discovery-title" className="catalog-discovery">
      <div className="catalog-discovery__header">
        <div>
          <h2 id="catalog-discovery-title">Encontrar filmes</h2>
        </div>

        {hasFilters && onClearFilters ? (
          <button className="button button-ghost" onClick={onClearFilters} type="button">
            Limpar filtros
          </button>
        ) : null}
      </div>

      <div className="catalog-discovery__controls">
        <div className="form-field catalog-search-field">
          <label htmlFor="catalog-search">Título</label>
          <input
            id="catalog-search"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              onSearchChange?.(event.target.value);
            }}
            placeholder="Ex.: A Jornada"
            type="search"
            value={searchValue}
          />
        </div>

        <div className="catalog-filter-group" role="group" aria-label="Status">
          {statusFilterOptions.map((option) => {
            const isActive = filters.status === option.value;

            return (
              <button
                aria-pressed={isActive}
                className={`button ${
                  isActive ? "button-secondary" : "button-ghost"
                }`}
                key={option.label}
                onClick={() => {
                  onStatusChange?.(option.value);
                }}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="form-field catalog-genre-field">
          <label htmlFor="catalog-genre-filter">Gênero</label>
          <select
            disabled={!hasGenreOptions}
            id="catalog-genre-filter"
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              onGenreChange?.(event.target.value || null);
            }}
            value={filters.genre ?? ""}
          >
            <option value="">Todos os gêneros</option>
            {genres.genres.map((genre) => (
              <option key={genre.id} value={genre.id}>
                {genre.name}
              </option>
            ))}
          </select>
          {genres.status === "loading" ? (
            <span className="catalog-filter-help">Carregando gêneros...</span>
          ) : null}
          {genres.status === "error" ? (
            <span className="catalog-filter-help">
              {genres.errorMessage ?? "Não foi possível carregar os gêneros."}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

async function loadAvailabilityHints(
  movies: CatalogMovie[],
  signal: AbortSignal
): Promise<Record<string, MovieAvailabilityHint>> {
  if (movies.length === 0) {
    return {};
  }

  const availabilityWindow = getSessionAvailabilityWindow();
  const entries = await Promise.all(
    movies.map(async (movie) => {
      try {
        const response = await catalogApi.getSessions(
          {
            movie: movie.id,
            start_from: availabilityWindow.startFrom,
            start_to: availabilityWindow.startTo,
          },
          { signal }
        );

        return [
          movie.id,
          response.count > 0 ? "available" : "unavailable",
        ] as const;
      } catch {
        return [movie.id, "unknown"] as const;
      }
    })
  );

  return Object.fromEntries(entries);
}

function createAvailabilityMap(
  movies: CatalogMovie[],
  hint: MovieAvailabilityHint
) {
  return Object.fromEntries(movies.map((movie) => [movie.id, hint]));
}

function getSessionAvailabilityWindow(now = new Date()) {
  const end = new Date(now);
  end.setDate(end.getDate() + SESSION_AVAILABILITY_LOOKAHEAD_DAYS);

  return {
    startFrom: now.toISOString(),
    startTo: end.toISOString(),
  };
}

function CatalogErrorState({
  message,
  onRetry,
  title,
}: {
  message: string;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <StateMessage
      action={
        onRetry ? (
          <button className="button button-ghost" onClick={onRetry} type="button">
            Tentar novamente
          </button>
        ) : undefined
      }
      title={title}
      tone="error"
    >
      {message}
    </StateMessage>
  );
}

export function getMovieDiscoveryFiltersFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">
): MovieDiscoveryFilters {
  const status = searchParams.get("status");
  const genre = searchParams.get("genre")?.trim() || null;
  const title = searchParams.get("q")?.trim() ?? "";

  return {
    genre,
    status: isMovieStatus(status) ? status : null,
    title,
  };
}

function hasActiveDiscoveryFilters(filters: MovieDiscoveryFilters) {
  return Boolean(filters.title || filters.status || filters.genre);
}

function isMovieStatus(value: string | null): value is MovieStatus {
  return value === "em_cartaz" || value === "pre_venda" || value === "em_breve";
}

function setOrDeleteParam(
  searchParams: URLSearchParams,
  key: string,
  value: string | null
) {
  if (value) {
    searchParams.set(key, value);
    return;
  }

  searchParams.delete(key);
}
