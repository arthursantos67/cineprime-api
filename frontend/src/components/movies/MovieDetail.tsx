"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ApiError, getApiErrorUserMessage } from "@/api/client";
import { catalogApi } from "@/api/catalog";
import { StateMessage } from "@/components/ui/StateMessage";
import type { CatalogMovieDetail } from "@/types/catalog";

import {
  formatMovieDuration,
  formatMovieGenres,
  formatMovieReleaseDate,
} from "./movie-formatters";

type MovieDetailStatus = "error" | "loading" | "not-found" | "success";

export type MovieDetailState = {
  errorMessage?: string;
  movie?: CatalogMovieDetail;
  status: MovieDetailStatus;
};

type MovieDetailProps = {
  movieId: string;
};

type MovieDetailViewProps = {
  movieId?: string;
  onRetry?: () => void;
  state: MovieDetailState;
};

const loadingState: MovieDetailState = {
  status: "loading",
};

export function MovieDetail({ movieId }: MovieDetailProps) {
  const [state, setState] = useState<MovieDetailState>(loadingState);

  const loadMovie = useCallback(async () => {
    const trimmedMovieId = movieId.trim();

    if (!trimmedMovieId) {
      setState({ status: "not-found" });
      return;
    }

    setState(loadingState);

    try {
      const movie = await catalogApi.getMovie(trimmedMovieId);

      setState(
        movie?.id
          ? {
              movie,
              status: "success",
            }
          : { status: "not-found" }
      );
    } catch (error) {
      setState(toMovieDetailErrorState(error));
    }
  }, [movieId]);

  useEffect(() => {
    void loadMovie();
  }, [loadMovie]);

  return (
    <MovieDetailView
      movieId={movieId}
      onRetry={() => void loadMovie()}
      state={state}
    />
  );
}

export function MovieDetailView({ movieId, onRetry, state }: MovieDetailViewProps) {
  if (state.status === "loading") {
    return <MovieDetailLoadingState />;
  }

  if (state.status === "error") {
    return (
      <StateMessage
        action={
          onRetry ? (
            <button className="button button-ghost" onClick={onRetry} type="button">
              Tentar novamente
            </button>
          ) : undefined
        }
        title="Detalhes indisponíveis"
        tone="error"
      >
        {state.errorMessage ??
          "Não conseguimos carregar este filme agora. Tente novamente em instantes."}
      </StateMessage>
    );
  }

  if (state.status === "not-found" || !state.movie) {
    return <MovieDetailNotFoundState />;
  }

  return <MovieDetailSuccess movie={state.movie} movieId={movieId} />;
}

function MovieDetailSuccess({
  movie,
  movieId,
}: {
  movie: CatalogMovieDetail;
  movieId?: string;
}) {
  const genres = formatMovieGenres(movie.genres);
  const duration = formatMovieDuration(movie.duration_minutes);
  const releaseDate = formatMovieReleaseDate(movie.release_date);
  const movieHref = movieId ? `/movies/${movieId}` : `/movies/${movie.id}`;

  return (
    <div className="movie-detail">
      <div className="movie-detail__poster-frame">
        {movie.poster_url ? (
          <>
            {/* API poster URLs are arbitrary remote images until image domains are configured. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`Poster de ${movie.title}`}
              className="movie-detail__poster"
              loading="eager"
              src={movie.poster_url}
            />
          </>
        ) : (
          <div
            aria-label={`Poster indisponível de ${movie.title}`}
            className="movie-detail__poster-placeholder"
            role="img"
          >
            Poster indisponível
          </div>
        )}
      </div>

      <article className="movie-detail__content">
        <div className="movie-detail__heading">
          <p className="eyebrow">Filme</p>
          <h1>{movie.title}</h1>
        </div>

        <dl className="movie-detail__metadata" aria-label="Informações do filme">
          <div>
            <dt>Gêneros</dt>
            <dd>{genres}</dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd>{duration}</dd>
          </div>
          {movie.release_date ? (
            <div>
              <dt>Estreia</dt>
              <dd>{releaseDate}</dd>
            </div>
          ) : null}
        </dl>

        <section className="movie-detail__synopsis" aria-labelledby="sinopse">
          <h2 id="sinopse">Sinopse</h2>
          <p>{movie.synopsis || "Sinopse indisponível."}</p>
        </section>

        <section
          aria-labelledby="selecionar-sessao"
          className="movie-detail__action-panel"
        >
          <div>
            <h2 id="selecionar-sessao">Sessões</h2>
            <p>
              As datas e horários disponíveis serão exibidos antes da escolha dos
              assentos.
            </p>
          </div>
          <Link className="button button-primary" href={`${movieHref}#selecionar-sessao`}>
            Escolher sessão
          </Link>
        </section>
      </article>
    </div>
  );
}

function MovieDetailLoadingState() {
  return (
    <div aria-busy="true" className="movie-detail-loading" role="status">
      <div className="movie-detail-loading__poster" />
      <div className="movie-detail-loading__content">
        <span>Carregando detalhes do filme...</span>
        <span className="skeleton-line skeleton-line--title" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-line--short" />
        <span className="skeleton-line" />
      </div>
    </div>
  );
}

function MovieDetailNotFoundState() {
  return (
    <StateMessage title="Filme não encontrado">
      Não encontramos esse filme no catálogo. Volte para a página inicial e escolha
      outro título disponível.
    </StateMessage>
  );
}

function toMovieDetailErrorState(error: unknown): MovieDetailState {
  if (error instanceof ApiError && error.code === "RESOURCE_NOT_FOUND") {
    return { status: "not-found" };
  }

  return {
    errorMessage: getApiErrorUserMessage(error),
    status: "error",
  };
}
