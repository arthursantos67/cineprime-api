"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Heart,
  HelpCircle,
  LogIn,
} from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ApiError, getApiErrorUserMessage } from "@/api/client";
import { catalogApi } from "@/api/catalog";
import { interestApi } from "@/api/interest";
import { ResponsiveImage } from "@/components/ui/ResponsiveImage";
import { StateMessage } from "@/components/ui/StateMessage";
import { useAuth } from "@/contexts/AuthContext";
import type { CatalogMovieDetail, CatalogSession, MovieInterestStatus } from "@/types/catalog";
import { useI18n } from "@/i18n";

import {
  formatMovieDuration,
  formatMovieGenres,
  formatMovieReleaseDate,
} from "./movie-formatters";
import { MovieReviewsPanel } from "./MovieReviews";
import { SessionBadgeList } from "./SessionBadges";
import {
  buildSessionDateOptions,
  formatScheduleDateHeading,
  formatSessionFullDate,
  formatSessionPrice,
  formatSessionTime,
  getSessionSeatsHref,
  getSessionBadges,
  groupSessionsByRoom,
  isSessionPurchasable,
} from "./session-selection";

type MovieDetailStatus = "error" | "loading" | "not-found" | "success";
type SessionListStatus = "error" | "loading" | "success";
type InterestStatus = "error" | "idle" | "loading" | "success";

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

type InterestState = {
  data?: MovieInterestStatus;
  status: InterestStatus;
};

type MovieDetailProps = {
  movieId: string;
};

type MovieDetailViewProps = {
  currentUserId?: string | null;
  interestState?: InterestState;
  isAdmin?: boolean;
  isAuthenticated?: boolean;
  isInterestToggling?: boolean;
  onInterestToggle?: () => void;
  onRetry?: () => void;
  state: MovieDetailState;
};

const loadingState: MovieDetailState = {
  status: "loading",
};

export function MovieDetail({ movieId }: MovieDetailProps) {
  const { locale } = useI18n();
  const { isAuthenticated, user } = useAuth();
  const [state, setState] = useState<MovieDetailState>(loadingState);
  const [interestState, setInterestState] = useState<InterestState>({ status: "idle" });
  const [isToggling, setIsToggling] = useState(false);

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
      setState(toMovieDetailErrorState(error, locale));
    }
  }, [locale, movieId]);

  const loadInterest = useCallback(async (movie: CatalogMovieDetail) => {
    if (movie.status !== "em_breve") return;

    setInterestState({ status: "loading" });

    try {
      const data = await interestApi.getMovieInterest(movie.id);
      setInterestState({ data, status: "success" });
    } catch {
      setInterestState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void loadMovie();
  }, [loadMovie]);

  useEffect(() => {
    if (state.status === "success" && state.movie) {
      void loadInterest(state.movie);
    }
  }, [state.status, state.movie, loadInterest, isAuthenticated]);

  const handleInterestToggle = useCallback(async () => {
    if (!state.movie || isToggling) return;

    const movieId = state.movie.id;
    const currentlyInterested = interestState.data?.user_interested === true;

    setIsToggling(true);
    try {
      if (currentlyInterested) {
        await interestApi.unmarkMovieInterest(movieId);
        const data = await interestApi.getMovieInterest(movieId);
        setInterestState({ data, status: "success" });
      } else {
        const data = await interestApi.markMovieInterest(movieId);
        setInterestState({ data, status: "success" });
      }
    } catch {
      setInterestState((prev) => ({ ...prev, status: "error" }));
    } finally {
      setIsToggling(false);
    }
  }, [state.movie, interestState.data, isToggling]);

  return (
    <MovieDetailView
      currentUserId={user?.id ?? null}
      interestState={interestState}
      isAdmin={user?.is_staff ?? false}
      isAuthenticated={isAuthenticated}
      isInterestToggling={isToggling}
      onInterestToggle={() => void handleInterestToggle()}
      onRetry={() => void loadMovie()}
      state={state}
    />
  );
}

export function MovieDetailView({
  currentUserId,
  interestState,
  isAdmin,
  isAuthenticated,
  isInterestToggling,
  onInterestToggle,
  onRetry,
  state,
}: MovieDetailViewProps) {
  const { t } = useI18n();

  if (state.status === "loading") {
    return <MovieDetailLoadingState />;
  }

  if (state.status === "error") {
    return (
      <StateMessage
        action={
          onRetry ? (
            <button className="button button-ghost" onClick={onRetry} type="button">
              {t("common.tryAgain")}
            </button>
          ) : undefined
        }
        title={t("movie.detailsUnavailable")}
        tone="error"
      >
        {state.errorMessage ?? t("movie.detailsLoadError")}
      </StateMessage>
    );
  }

  if (state.status === "not-found" || !state.movie) {
    return <MovieDetailNotFoundState />;
  }

  return (
    <MovieDetailSuccess
      currentUserId={currentUserId}
      interestState={interestState}
      isAdmin={isAdmin}
      isAuthenticated={isAuthenticated}
      isInterestToggling={isInterestToggling}
      movie={state.movie}
      onInterestToggle={onInterestToggle}
    />
  );
}

function MovieDetailSuccess({
  currentUserId,
  interestState,
  isAdmin,
  isAuthenticated,
  isInterestToggling,
  movie,
  onInterestToggle,
}: {
  currentUserId?: string | null;
  interestState?: InterestState;
  isAdmin?: boolean;
  isAuthenticated?: boolean;
  isInterestToggling?: boolean;
  movie: CatalogMovieDetail;
  onInterestToggle?: () => void;
}) {
  const { locale, t } = useI18n();
  const ageRatingLabel = movie.age_rating
    ? movie.age_rating === "L"
      ? t("movie.ageRatingFree")
      : t("movie.ageRatingYears", { rating: movie.age_rating })
    : null;
  const genres = formatMovieGenres(movie.genres, locale);
  const duration = formatMovieDuration(movie.duration_minutes, locale);
  const releaseDate = formatMovieReleaseDate(movie.release_date, locale);

  return (
    <div className="movie-detail">
      {/* Left column: poster + reviews stacked so reviews sit directly below the poster */}
      <div className="flex flex-col gap-4 max-[820px]:[grid-row:span_3]">
        <div className="movie-detail__poster-frame">
          {movie.poster_url ? (
            <ResponsiveImage
              alt={t("movie.posterAlt", { title: movie.title })}
              className="movie-detail__poster"
              height={720}
              priority
              src={movie.poster_url}
              sizes="(max-width: 820px) 100vw, 340px"
              unoptimized
              width={480}
            />
          ) : (
            <div
              aria-label={t("movie.posterUnavailableAlt", { title: movie.title })}
              className="movie-detail__poster-placeholder"
              role="img"
            >
              {t("movie.posterUnavailable")}
            </div>
          )}
        </div>

        <MovieReviewsPanel
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          isAuthenticated={isAuthenticated}
          movie={movie}
        />
      </div>

      <article className="movie-detail__content">
        <div className="movie-detail__heading">
          <p className="eyebrow">{t("movie.eyebrow")}</p>
          <h1>{movie.title}</h1>
        </div>

        <div className="movie-detail__metadata" aria-label={t("movie.infoLabel")}>
          {ageRatingLabel ? (
            <span className="movie-detail__rating">{ageRatingLabel}</span>
          ) : null}
          <span>{duration}</span>
          <span aria-hidden="true">·</span>
          <span>{genres}</span>
          {movie.release_date ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{t("movie.releaseWithDate", { date: releaseDate })}</span>
            </>
          ) : null}
        </div>

        {(movie.director || (movie.cast && movie.cast.length > 0)) && (
          <div className="movie-detail__credits">
            {movie.director && (
              <p>
                <strong>{t("movie.director")}:</strong> {movie.director}
              </p>
            )}
            {movie.cast && movie.cast.length > 0 && (
              <p>
                <strong>{t("movie.cast")}:</strong> {movie.cast.join(", ")}
              </p>
            )}
          </div>
        )}

        <section className="movie-detail__synopsis" aria-labelledby="sinopse">
          <h2 id="sinopse">{t("movie.synopsis")}</h2>
          <p>{movie.synopsis || t("movie.synopsisUnavailable")}</p>
        </section>

        {movie.trailer_url && isTrustedTrailerUrl(movie.trailer_url) ? (
          <MovieTrailerSection trailerUrl={movie.trailer_url} />
        ) : null}

        {movie.status === "em_breve" ? (
          <MovieComingSoonSection
            interestState={interestState}
            isAuthenticated={isAuthenticated}
            isInterestToggling={isInterestToggling}
            onInterestToggle={onInterestToggle}
          />
        ) : (
          <MovieSessionSelector movieId={movie.id} />
        )}
      </article>
    </div>
  );
}

// trailer_url is admin-editable persisted data; only embed hosts we trust,
// so an arbitrary URL can never be framed with the site's chrome around it.
const TRUSTED_EMBED_HOSTS =
  /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com)\//;

export function isTrustedTrailerUrl(trailerUrl: string): boolean {
  return TRUSTED_EMBED_HOSTS.test(trailerUrl);
}

export function MovieTrailerSection({ trailerUrl }: { trailerUrl: string }) {
  const { t } = useI18n();
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const trailerLabel = t("session.previewPanel.trailer");

  return (
    <section aria-labelledby="movie-trailer" className="grid gap-2">
      <h2 className="sr-only" id="movie-trailer">
        {trailerLabel}
      </h2>
      <button
        aria-expanded={isTrailerOpen}
        className="flex w-full items-center justify-between gap-2 rounded-[6px] border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-sm font-extrabold text-white/80 transition hover:bg-white/[0.08]"
        onClick={() => setIsTrailerOpen((open) => !open)}
        type="button"
      >
        {trailerLabel}
        {isTrailerOpen ? (
          <ChevronUp aria-hidden="true" className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
        )}
      </button>
      {isTrailerOpen ? (
        <div
          className="overflow-hidden rounded-[6px] border border-white/[0.07]"
          style={{ aspectRatio: "16/9" }}
        >
          <iframe
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-fullscreen"
            src={trailerUrl}
            title={trailerLabel}
          />
        </div>
      ) : null}
    </section>
  );
}

function MovieComingSoonSection({
  interestState,
  isAuthenticated,
  isInterestToggling,
  onInterestToggle,
}: {
  interestState?: InterestState;
  isAuthenticated?: boolean;
  isInterestToggling?: boolean;
  onInterestToggle?: () => void;
}) {
  const { t } = useI18n();
  const interested = interestState?.data?.user_interested === true;
  const count = interestState?.data?.count ?? 0;

  return (
    <section aria-labelledby="coming-soon-heading" className="movie-coming-soon">
      <StateMessage title={t("movie.comingSoonTitle")}>
        {t("movie.comingSoonDescription")}
      </StateMessage>

      <div className="movie-coming-soon__interest">
        {count > 0 && (
          <p className="movie-coming-soon__count" aria-live="polite">
            {t("movie.interestedCount", { count })}
          </p>
        )}

        {interestState?.status === "error" && (
          <p className="movie-coming-soon__error" role="alert">
            {t("movie.interestError")}
          </p>
        )}

        {isAuthenticated ? (
          <button
            aria-pressed={interested}
            className={`button ${interested ? "button-ghost" : "button-primary"}`}
            disabled={isInterestToggling || interestState?.status === "loading"}
            onClick={onInterestToggle}
            type="button"
          >
            <Heart
              aria-hidden="true"
              fill={interested ? "currentColor" : "none"}
              size={16}
            />
            {interested ? t("movie.interestRemove") : t("movie.interestCta")}
          </button>
        ) : (
          <Link className="movie-coming-soon__sign-in" href="/login">
            <LogIn aria-hidden="true" size={16} />
            {t("movie.interestSignIn")}
          </Link>
        )}
      </div>
    </section>
  );
}

function MovieSessionSelector({ movieId }: { movieId: string }) {
  const { locale, t } = useI18n();
  const dateOptions = useMemo(
    () => buildSessionDateOptions(new Date(), 7, locale),
    [locale]
  );
  const [selectedDate, setSelectedDate] = useState(dateOptions[0]?.value ?? "");
  const calendarInputRef = useRef<HTMLInputElement>(null);
  const dateRailRef = useRef<HTMLDivElement>(null);
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
        errorMessage: getApiErrorUserMessage(error, locale),
        sessions: [],
        status: "error",
      });
    }
  }, [locale, movieId, selectedDate]);

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
            errorMessage: getApiErrorUserMessage(error, locale),
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
  }, [locale, movieId, selectedDate]);

  useEffect(() => {
    const selectedButton = dateRailRef.current?.querySelector<HTMLButtonElement>(
      `[data-session-date="${selectedDate}"]`
    );

    selectedButton?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
  }, [selectedDate]);

  const selectedDateIdx = dateOptions.findIndex(
    (dateOption) => dateOption.value === selectedDate
  );
  const canGoPrev = selectedDateIdx > 0;
  const canGoNext = selectedDateIdx < dateOptions.length - 1;

  function goToPrevDate() {
    if (canGoPrev) {
      setSelectedDate(dateOptions[selectedDateIdx - 1].value);
    }
  }

  function goToNextDate() {
    if (canGoNext) {
      setSelectedDate(dateOptions[selectedDateIdx + 1].value);
    }
  }

  function handleCalendarChange(event: ChangeEvent<HTMLInputElement>) {
    const pickedDate = event.target.value;
    const matchingDate = dateOptions.find(
      (dateOption) => dateOption.value === pickedDate
    );

    if (matchingDate) {
      setSelectedDate(matchingDate.value);
    }
  }

  function openCalendarPicker() {
    const calendarInput = calendarInputRef.current;

    if (!calendarInput) {
      return;
    }

    if (typeof calendarInput.showPicker === "function") {
      calendarInput.showPicker();
      return;
    }

    calendarInput.click();
  }

  return (
    <section
      aria-labelledby="selecionar-sessao"
      className="movie-detail__sessions"
    >
      <div className="movie-detail__sessions-header">
        <h2 id="selecionar-sessao">{t("movie.sessions")}</h2>
        <p>{formatSessionFullDate(selectedDate, locale)}</p>
      </div>

      <div
        aria-label={t("schedule.selectDate")}
        className="session-date-carousel"
        role="group"
      >
        <button
          aria-label={t("schedule.previousDate")}
          className="session-date-carousel__nav"
          disabled={!canGoPrev}
          onClick={goToPrevDate}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </button>

        <div
          aria-label={t("schedule.availableDates")}
          className="session-date-selector"
          ref={dateRailRef}
        >
          {dateOptions.map((dateOption) => {
            const isSelected = dateOption.value === selectedDate;
            const dayNumber = dateOption.label.split("/")[0];

            return (
              <button
                aria-label={`${dateOption.weekday}, ${formatSessionFullDate(dateOption.value, locale)}`}
                aria-pressed={isSelected}
                className="session-date-selector__button"
                data-session-date={dateOption.value}
                key={dateOption.value}
                onClick={() => setSelectedDate(dateOption.value)}
                type="button"
              >
                <span>{dateOption.weekday}</span>
                <strong>{dayNumber}</strong>
              </button>
            );
          })}
        </div>

        <button
          aria-label={t("schedule.nextDate")}
          className="session-date-carousel__nav"
          disabled={!canGoNext}
          onClick={goToNextDate}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={18} />
        </button>

        <div className="session-date-carousel__calendar">
          <button
            aria-label={t("schedule.openCalendar")}
            className="session-date-carousel__nav"
            onClick={openCalendarPicker}
            type="button"
          >
            <CalendarDays aria-hidden="true" size={18} />
          </button>
          <input
            aria-hidden="true"
            max={dateOptions[dateOptions.length - 1]?.value}
            min={dateOptions[0]?.value}
            onChange={handleCalendarChange}
            ref={calendarInputRef}
            tabIndex={-1}
            type="date"
            value={selectedDate}
          />
        </div>
      </div>

      <SessionList
        date={selectedDate}
        onRetry={() => void loadSessions()}
        state={state}
      />
    </section>
  );
}

export function SessionList({
  date,
  onRetry,
  state,
}: {
  date: string;
  onRetry: () => void;
  state: SessionListState;
}) {
  const { locale, t } = useI18n();

  if (state.status === "loading") {
    return (
      <StateMessage tone="loading" title={t("movie.sessionsLoadingTitle")}>
        {t("movie.sessionsLoadingDescription", {
          date: formatSessionFullDate(date, locale),
        })}
      </StateMessage>
    );
  }

  if (state.status === "error") {
    return (
      <StateMessage
        action={
          <button className="button button-ghost" onClick={onRetry} type="button">
            {t("common.tryAgain")}
          </button>
        }
        title={t("movie.sessionsUnavailable")}
        tone="error"
      >
        {state.errorMessage ?? t("movie.sessionsLoadError")}
      </StateMessage>
    );
  }

  if (state.sessions.length === 0) {
    return (
      <StateMessage title={t("schedule.emptyTitle")}>
        {t("schedule.emptyDescription", {
          date: formatSessionFullDate(date, locale),
        })}
      </StateMessage>
    );
  }

  const groups = groupSessionsByRoom(state.sessions);

  return (
    <div aria-label={t("movie.availableSessions")} className="session-list">
      <p className="session-list__date-heading">
        {formatScheduleDateHeading(date, new Date(), locale)}
      </p>
      {groups.map((group) => (
        <section className="session-room-group" key={group.roomId}>
          <div className="session-room-group__heading">
            <div>
              <h3>{group.roomName}</h3>
              {group.sessions[0] ? (
                <SessionBadgeList badges={getSessionBadges(group.sessions[0], locale)} />
              ) : null}
            </div>
            <HelpCircle aria-hidden="true" size={16} />
          </div>
          <div className="session-time-grid">
            {group.sessions.map((session) => {
              const badges = getSessionBadges(session, locale);
              const badgeText = badges.map((badge) => badge.label).join(", ");
              const badgeDescription = badgeText
                ? t("schedule.badgeDescription", { badges: badgeText })
                : "";
              const purchasable = isSessionPurchasable(session);

              if (!purchasable) {
                return (
                  <span
                    aria-disabled="true"
                    aria-label={t("schedule.sessionUnavailable", {
                      time: formatSessionTime(session.start_time, locale),
                    })}
                    className="session-option cursor-not-allowed opacity-40"
                    key={session.id}
                  >
                    <strong>{formatSessionTime(session.start_time, locale)}</strong>
                  </span>
                );
              }

              return (
                <Link
                  aria-label={t("schedule.selectSession", {
                    badges: badgeDescription,
                    price: formatSessionPrice(session.base_price, locale),
                    room: group.roomName,
                    time: formatSessionTime(session.start_time, locale),
                  })}
                  className="session-option"
                  href={getSessionSeatsHref(session.id)}
                  key={session.id}
                >
                  <strong>{formatSessionTime(session.start_time, locale)}</strong>
                  <span className="sr-only">
                    {t("movie.sessionEndsAt", {
                      price: formatSessionPrice(session.base_price, locale),
                      time: formatSessionTime(session.end_time, locale),
                    })}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function MovieDetailLoadingState() {
  const { t } = useI18n();

  return (
    <div aria-busy="true" className="movie-detail-loading" role="status">
      <div className="movie-detail-loading__poster" />
      <div className="movie-detail-loading__content">
        <span>{t("movie.detailsLoading")}</span>
        <span className="skeleton-line skeleton-line--title" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-line--short" />
        <span className="skeleton-line" />
      </div>
    </div>
  );
}

function MovieDetailNotFoundState() {
  const { t } = useI18n();

  return (
    <StateMessage title={t("movie.notFoundTitle")}>
      {t("movie.notFoundDescription")}
    </StateMessage>
  );
}

function toMovieDetailErrorState(error: unknown, locale: string): MovieDetailState {
  if (error instanceof ApiError && error.code === "RESOURCE_NOT_FOUND") {
    return { status: "not-found" };
  }

  return {
    errorMessage: getApiErrorUserMessage(error, locale),
    status: "error",
  };
}
