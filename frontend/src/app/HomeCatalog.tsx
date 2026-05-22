"use client";

import { useCallback, useEffect, useState } from "react";

import { catalogApi } from "@/api/catalog";
import { FeaturedMovieBanner } from "@/components/movies";
import { MovieGrid } from "@/components/movies";
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
  preSale: MovieSectionState;
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

  useEffect(() => {
    void loadFeatured();
    void loadNowShowing();
    void loadPreSale();
  }, [loadFeatured, loadNowShowing, loadPreSale]);

  return (
    <HomeCatalogSections
      featured={featured}
      nowShowing={nowShowing}
      onRetryFeatured={() => void loadFeatured()}
      onRetryNowShowing={() => void loadNowShowing()}
      onRetryPreSale={() => void loadPreSale()}
      preSale={preSale}
    />
  );
}

export function HomeCatalogSections({
  featured,
  nowShowing,
  onRetryFeatured,
  onRetryNowShowing,
  onRetryPreSale,
  preSale,
}: HomeCatalogSectionsProps) {
  const featuredMovie = featured.movies[0];

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
        <MovieGrid
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
        <MovieGrid
          emptyDescription="Ainda não há filmes em pré-venda no catálogo."
          emptyTitle="Nenhum filme em pré-venda"
          isLoading={preSale.status === "loading"}
          loadingLabel="Carregando filmes em pré-venda..."
          movies={preSale.movies}
          title="Pré-venda"
        />
      )}
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
