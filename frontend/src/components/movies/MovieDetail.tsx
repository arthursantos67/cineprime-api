"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, getApiErrorUserMessage } from "@/api/client";
import { catalogApi } from "@/api/catalog";
import { StateMessage } from "@/components/ui/StateMessage";
import type { CatalogMovieDetail, CatalogSession } from "@/types/catalog";

import {
  formatMovieDuration,
  formatMovieGenres,
  formatMovieReleaseDate,
} from "./movie-formatters";
import {
  buildSessionDateOptions,
  formatSessionFullDate,
  formatSessionPrice,
  formatSessionTime,
  getSessionSeatsHref,
  groupSessionsByRoom,
} from "./session-selection";

type MovieDetailStatus = "error" | "loading" | "not-found" | "success";
type SessionListStatus = "error" | "loading" | "success";

export type MovieDetailState = {
  errorMessage?: string;
  movie?: CatalogMovieDetail;
  status: MovieDetailStatus;
};

type SessionListState = {
  errorMessage?: string;
  sessions: CatalogSession[];
  status: SessionListStatus;
};

type MovieDetailProps = {
  movieId: string;
};

type MovieDetailViewProps = {
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
      onRetry={() => void loadMovie()}
      state={state}
    />
  );
}

export function MovieDetailView({ onRetry, state }: MovieDetailViewProps) {
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

  return <MovieDetailSuccess movie={state.movie} />;
}

function MovieDetailSuccess({ movie }: { movie: CatalogMovieDetail }) {
  const genres = formatMovieGenres(movie.genres);
  const duration = formatMovieDuration(movie.duration_minutes);
  const releaseDate = formatMovieReleaseDate(movie.release_date);

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

        <MovieSessionSelector movieId={movie.id} />
      </article>
    </div>
  );
}

function MovieSessionSelector({ movieId }: { movieId: string }) {
  const dateOptions = useMemo(() => buildSessionDateOptions(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0]?.value ?? "");
  const [state, setState] = useState<SessionListState>({
    sessions: [],
    status: "loading",
  });

  const loadSessions = useCallback(async () => {
    if (!selectedDate) {
      setState({ sessions: [], status: "success" });
      return;
    }

    setState({ sessions: [], status: "loading" });

    try {
      const response = await catalogApi.getSessions({
        date: selectedDate,
        movie: movieId,
      });

      setState({
        sessions: response.results,
        status: "success",
      });
    } catch (error) {
      setState({
        errorMessage: getApiErrorUserMessage(error),
        sessions: [],
        status: "error",
      });
    }
  }, [movieId, selectedDate]);

  useEffect(() => {
    let isActive = true;

    async function fetchSessions() {
      if (!selectedDate) {
        if (isActive) {
          setState({ sessions: [], status: "success" });
        }
        return;
      }

      setState({ sessions: [], status: "loading" });

      try {
        const response = await catalogApi.getSessions({
          date: selectedDate,
          movie: movieId,
        });

        if (isActive) {
          setState({
            sessions: response.results,
            status: "success",
          });
        }
      } catch (error) {
        if (isActive) {
          setState({
            errorMessage: getApiErrorUserMessage(error),
            sessions: [],
            status: "error",
          });
        }
      }
    }

    void fetchSessions();

    return () => {
      isActive = false;
    };
  }, [movieId, selectedDate]);

  return (
    <section
      aria-labelledby="selecionar-sessao"
      className="movie-detail__sessions"
    >
      <div className="movie-detail__sessions-header">
        <h2 id="selecionar-sessao">Sessões</h2>
        <p>{formatSessionFullDate(selectedDate)}</p>
      </div>

      <div
        aria-label="Datas disponíveis"
        className="session-date-selector"
      >
        {dateOptions.map((dateOption) => (
          <button
            aria-pressed={dateOption.value === selectedDate}
            className="session-date-selector__button"
            key={dateOption.value}
            onClick={() => setSelectedDate(dateOption.value)}
            type="button"
          >
            <span>{dateOption.weekday}</span>
            <strong>{dateOption.label}</strong>
          </button>
        ))}
      </div>

      <SessionList
        date={selectedDate}
        onRetry={() => void loadSessions()}
        state={state}
      />
    </section>
  );
}

function SessionList({
  date,
  onRetry,
  state,
}: {
  date: string;
  onRetry: () => void;
  state: SessionListState;
}) {
  if (state.status === "loading") {
    return (
      <StateMessage tone="loading" title="Carregando sessões">
        Buscando horários para {formatSessionFullDate(date)}.
      </StateMessage>
    );
  }

  if (state.status === "error") {
    return (
      <StateMessage
        action={
          <button className="button button-ghost" onClick={onRetry} type="button">
            Tentar novamente
          </button>
        }
        title="Sessões indisponíveis"
        tone="error"
      >
        {state.errorMessage ??
          "Não conseguimos carregar as sessões agora. Tente novamente em instantes."}
      </StateMessage>
    );
  }

  if (state.sessions.length === 0) {
    return (
      <StateMessage title="Nenhuma sessão nesta data">
        Não há sessões disponíveis para {formatSessionFullDate(date)}. Escolha outra
        data.
      </StateMessage>
    );
  }

  const groups = groupSessionsByRoom(state.sessions);

  return (
    <div aria-label="Sessões disponíveis" className="session-list">
      {groups.map((group) => (
        <section className="session-room-group" key={group.roomId}>
          <h3>{group.roomName}</h3>
          <div className="session-time-grid">
            {group.sessions.map((session) => (
              <Link
                aria-label={`Selecionar sessão das ${formatSessionTime(
                  session.start_time
                )}, sala ${group.roomName}, valor ${formatSessionPrice(
                  session.base_price
                )}`}
                className="session-option"
                href={getSessionSeatsHref(session.id)}
                key={session.id}
              >
                <strong>{formatSessionTime(session.start_time)}</strong>
                <span>até {formatSessionTime(session.end_time)}</span>
                <span>{formatSessionPrice(session.base_price)}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
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
