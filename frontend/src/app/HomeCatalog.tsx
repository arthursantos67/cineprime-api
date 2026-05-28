"use client";

import { useCallback, useEffect, useState } from "react";

import { catalogApi } from "@/api/catalog";
import { Button } from "@/components/ui/Button";
import { FeaturedMovieBanner } from "@/components/movies";
import { MovieCarousel } from "@/components/movies";
import { StateMessage } from "@/components/ui/StateMessage";
import type { CatalogMovie } from "@/types/catalog";

type SectionStatus = "error" | "loading" | "success";

export type MovieSectionState = {
  errorMessage?: string;
  movies: CatalogMovie[];
  status: SectionStatus;
};

type HomeCatalogSectionsProps = {
  featured: MovieSectionState;
  nowShowing: MovieSectionState;
  onRetryFeatured?: () => void;
  onRetryNowShowing?: () => void;
  onRetryPreSale?: () => void;
  onRetryUpcoming?: () => void;
  preSale: MovieSectionState;
  upcoming: MovieSectionState;
};

const loadingSectionState: MovieSectionState = {
  movies: [],
  status: "loading",
};

export function HomeCatalog() {
  const [featured, setFeatured] =
    useState<MovieSectionState>(loadingSectionState);
  const [nowShowing, setNowShowing] =
    useState<MovieSectionState>(loadingSectionState);
  const [preSale, setPreSale] = useState<MovieSectionState>(loadingSectionState);
  const [upcoming, setUpcoming] = useState<MovieSectionState>(loadingSectionState);

  const loadFeatured = useCallback(async () => {
    await loadMovieSection(
      () => catalogApi.listFeaturedMovies(),
      setFeatured
    );
  }, []);

  const loadNowShowing = useCallback(async () => {
    await loadMovieSection(
      () => catalogApi.listNowShowingMovies(),
      setNowShowing
    );
  }, []);

  const loadPreSale = useCallback(async () => {
    await loadMovieSection(() => catalogApi.listPreSaleMovies(), setPreSale);
  }, []);

  const loadUpcoming = useCallback(async () => {
    await loadMovieSection(() => catalogApi.listUpcomingMovies(), setUpcoming);
  }, []);

  useEffect(() => {
    void loadFeatured();
    void loadNowShowing();
    void loadPreSale();
    void loadUpcoming();
  }, [loadFeatured, loadNowShowing, loadPreSale, loadUpcoming]);

  return (
    <HomeCatalogSections
      featured={featured}
      nowShowing={nowShowing}
      onRetryFeatured={() => void loadFeatured()}
      onRetryNowShowing={() => void loadNowShowing()}
      onRetryPreSale={() => void loadPreSale()}
      onRetryUpcoming={() => void loadUpcoming()}
      preSale={preSale}
      upcoming={upcoming}
    />
  );
}

export function HomeCatalogSections({
  featured,
  nowShowing,
  onRetryFeatured,
  onRetryNowShowing,
  onRetryPreSale,
  onRetryUpcoming,
  preSale,
  upcoming,
}: HomeCatalogSectionsProps) {
  return (
    <div>
      {/* Cinematic hero area — full-bleed, full-height */}
      {featured.status === "loading" ? (
        <div
          aria-busy="true"
          className="relative overflow-hidden text-white ml-[calc(50%_-_50vw)] mr-[calc(50%_-_50vw)] w-screen mt-[calc(-1_*_var(--layout-page-block))] bg-[rgb(8_10_16)] h-[75svh] min-h-[400px] flex items-center justify-center"
        >
          <div className="shell-container">
            <StateMessage title="Carregando filme em destaque" tone="loading">
              Buscando os destaques do catálogo.
            </StateMessage>
          </div>
        </div>
      ) : null}

      {featured.status === "error" ? (
        <div className="relative overflow-hidden text-white ml-[calc(50%_-_50vw)] mr-[calc(50%_-_50vw)] w-screen mt-[calc(-1_*_var(--layout-page-block))] bg-[rgb(8_10_16)] h-[75svh] min-h-[400px] flex items-center justify-center">
          <div className="shell-container">
            <CatalogErrorState
              message={
                featured.errorMessage ??
                "Não foi possível carregar o filme em destaque. Tente novamente."
              }
              onRetry={onRetryFeatured}
              title="Destaque indisponível"
            />
          </div>
        </div>
      ) : null}

      {featured.status === "success" && featured.movies.length === 0 ? (
        <div
          aria-hidden="true"
          className="ml-[calc(50%_-_50vw)] mr-[calc(50%_-_50vw)] w-screen mt-[calc(-1_*_var(--layout-page-block))] bg-[rgb(8_10_16)] min-h-[320px]"
        />
      ) : null}

      {featured.status === "success" && featured.movies.length > 0 ? (
        <FeaturedMovieBanner
          movies={featured.movies}
          primaryActionLabel="Ver detalhes"
        />
      ) : null}

      {/* Catalog sections — anchored for scroll-to-catalog links */}
      <div
        className="grid gap-7 pt-[var(--layout-page-block)] max-md:pt-[var(--layout-page-block-compact)]"
        id="catalogo"
      >
        {nowShowing.status === "error" ? (
          <CatalogErrorState
            message={
              nowShowing.errorMessage ??
              "Não foi possível carregar os filmes em cartaz. Tente novamente."
            }
            onRetry={onRetryNowShowing}
            title="Em cartaz indisponível"
          />
        ) : (
          <MovieCarousel
            emptyDescription="Ainda não há filmes em cartaz no catálogo."
            emptyTitle="Nenhum filme em cartaz"
            isLoading={nowShowing.status === "loading"}
            loadingLabel="Carregando filmes em cartaz..."
            movies={nowShowing.movies}
            title="Em cartaz"
          />
        )}

        {preSale.status === "error" ? (
          <CatalogErrorState
            message={
              preSale.errorMessage ??
              "Não foi possível carregar os filmes em pré-venda. Tente novamente."
            }
            onRetry={onRetryPreSale}
            title="Pré-venda indisponível"
          />
        ) : (
          <MovieCarousel
            emptyDescription="Ainda não há filmes em pré-venda no catálogo."
            emptyTitle="Nenhum filme em pré-venda"
            isLoading={preSale.status === "loading"}
            loadingLabel="Carregando filmes em pré-venda..."
            movies={preSale.movies}
            title="Pré-venda"
          />
        )}

        {upcoming.status === "error" ? (
          <CatalogErrorState
            message={
              upcoming.errorMessage ??
              "Não foi possível carregar os filmes em breve. Tente novamente."
            }
            onRetry={onRetryUpcoming}
            title="Em breve indisponível"
          />
        ) : (
          <MovieCarousel
            emptyDescription="Ainda não há filmes em breve no catálogo."
            emptyTitle="Nenhum filme em breve"
            isLoading={upcoming.status === "loading"}
            loadingLabel="Carregando filmes em breve..."
            movies={upcoming.movies}
            title="Em breve"
          />
        )}
      </div>
    </div>
  );
}

async function loadMovieSection(
  requestMovies: () => Promise<{ results: CatalogMovie[] }>,
  setSection: (state: MovieSectionState) => void
) {
  setSection(loadingSectionState);

  try {
    const response = await requestMovies();
    setSection({
      movies: response.results,
      status: "success",
    });
  } catch {
    setSection({
      errorMessage:
        "Não conseguimos carregar esta seção agora. Verifique sua conexão e tente novamente.",
      movies: [],
      status: "error",
    });
  }
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
          <Button onClick={onRetry} variant="ghost">
            Tentar novamente
          </Button>
        ) : undefined
      }
      title={title}
      tone="error"
    >
      {message}
    </StateMessage>
  );
}
