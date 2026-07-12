"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { adminApi, type AdminMovieWritePayload } from "@/api/admin";
import { revalidateTmdbToken } from "@/app/admin/actions";
import { ApiError, getApiErrorUserMessage } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import type { CatalogGenre, CatalogMovieDetail, CatalogMovieAgeRating, MovieStatus } from "@/types/catalog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useI18n } from "@/i18n";

const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w500";

const AVAILABLE_TRANSLATION_LOCALES = [
  { code: "en-US", label: "Inglês", sublabel: "English (US)" },
  { code: "es-ES", label: "Espanhol", sublabel: "Español (España)" },
  { code: "fr-FR", label: "Francês", sublabel: "Français (France)" },
  { code: "de-DE", label: "Alemão", sublabel: "Deutsch (Deutschland)" },
  { code: "it-IT", label: "Italiano", sublabel: "Italiano (Italia)" },
  { code: "zh-CN", label: "Chinês (Simpl.)", sublabel: "中文（简体）" },
  { code: "ja-JP", label: "Japonês", sublabel: "日本語" },
] as const;

type TranslationLocaleCode = typeof AVAILABLE_TRANSLATION_LOCALES[number]["code"];
type TranslationFields = { title: string; synopsis: string };

type FieldErrors = Partial<Record<keyof AdminMovieWritePayload | "non_field_errors", string>>;

type AdminMovieFormProps = {
  movie?: CatalogMovieDetail;
};

type TmdbSearchResult = {
  id: number;
  title: string;
  original_title: string;
  year: string | null;
  poster_path: string | null;
};

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_FAILED") {
    return {};
  }

  const details = error.details as Record<string, unknown> | null;
  if (!details || typeof details !== "object") {
    return {};
  }

  const result: FieldErrors = {};

  for (const [key, val] of Object.entries(details)) {
    const messages = Array.isArray(val) ? val : [val];
    result[key as keyof FieldErrors] = messages.join(" ");
  }

  return result;
}

function TmdbTokenModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [status, setStatus] = useState<{ configured: boolean; hint: string | null } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      dialog.showModal();
      setTokenInput("");
      setError(null);
      setSaved(false);
      setIsLoading(true);
      const controller = new AbortController();
      adminApi.getTmdbTokenStatus({ signal: controller.signal })
        .then((s) => setStatus(s))
        .catch(() => setStatus(null))
        .finally(() => setIsLoading(false));
      return () => controller.abort();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  async function handleSave() {
    const value = tokenInput.trim();
    if (!value) return;
    setIsSaving(true);
    setError(null);
    try {
      await adminApi.setTmdbToken(value);
      await revalidateTmdbToken();
      setStatus({ configured: true, hint: value.slice(-4) });
      setTokenInput("");
      setSaved(true);
    } catch {
      setError("Erro ao salvar token. Verifique sua conexão e tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <dialog
      className="w-full max-w-sm rounded-[10px] border border-white/[0.10] bg-[#1a2030] p-6 text-white shadow-xl backdrop:bg-black/60 open:flex open:flex-col open:gap-4"
      onCancel={onClose}
      ref={dialogRef}
    >
      <div className="flex flex-col gap-1">
        <strong className="text-base font-[850]">Configurar token TMDB</strong>
        <p className="text-sm text-white/60">
          Obtenha o token em{" "}
          <a
            className="text-brand underline"
            href="https://www.themoviedb.org/settings/api"
            rel="noopener noreferrer"
            target="_blank"
          >
            themoviedb.org/settings/api
          </a>
          {" "}(API Read Access Token).
        </p>
      </div>

      {isLoading ? (
        <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
      ) : status?.configured ? (
        <p className="text-sm text-brand/80">
          Token configurado — termina em <span className="font-mono font-bold">…{status.hint}</span>
        </p>
      ) : (
        <p className="text-sm text-white/40">Nenhum token configurado.</p>
      )}

      {saved ? (
        <p className="text-sm font-bold text-brand">Token salvo com sucesso.</p>
      ) : null}

      <div className="grid gap-2">
        <label className="text-xs font-bold text-white/60">Novo token</label>
        <input
          autoComplete="off"
          className="min-h-[var(--control-height-lg)] w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-brand focus:shadow-focus"
          disabled={isSaving}
          onChange={(e) => { setTokenInput(e.target.value); setSaved(false); }}
          placeholder="eyJhbGciOiJIUzI1NiJ9..."
          type="password"
          value={tokenInput}
        />
        {error ? <p className="text-sm font-bold text-error">{error}</p> : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={onClose} variant="ghost">Fechar</Button>
        <Button
          disabled={isSaving || !tokenInput.trim()}
          isLoading={isSaving}
          onClick={handleSave}
          variant="primary"
        >
          Salvar
        </Button>
      </div>
    </dialog>
  );
}

function FormField({
  children,
  error,
  hint,
  label,
  labelFor,
}: {
  children: React.ReactNode;
  error?: string;
  hint?: string;
  label: string;
  labelFor: string;
}) {
  const errorId = error ? `${labelFor}-error` : undefined;
  const hintId = hint ? `${labelFor}-hint` : undefined;

  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-extrabold text-white" htmlFor={labelFor}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-xs text-white/45" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-bold text-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TextInput({
  error,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <input
      aria-invalid={error ? "true" : undefined}
      className={[
        "min-h-[var(--control-height-lg)] w-full rounded-control border bg-surface px-3 py-2",
        "text-sm text-white placeholder:text-white/30 outline-none transition",
        "focus:border-brand focus:shadow-focus disabled:cursor-not-allowed disabled:opacity-[0.68]",
        error ? "border-error" : "border-border",
      ].join(" ")}
      id={id}
      {...props}
    />
  );
}

function Textarea({
  error,
  id,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }) {
  return (
    <textarea
      aria-invalid={error ? "true" : undefined}
      className={[
        "w-full rounded-control border bg-surface px-3 py-2 min-h-[120px]",
        "text-sm text-white placeholder:text-white/30 outline-none transition resize-y",
        "focus:border-brand focus:shadow-focus disabled:cursor-not-allowed disabled:opacity-[0.68]",
        error ? "border-error" : "border-border",
      ].join(" ")}
      id={id}
      {...props}
    />
  );
}

export function AdminMovieForm({ movie }: AdminMovieFormProps) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { user } = useAuth();
  const isMaster = user?.role === "master";
  const isEditing = movie !== undefined;
  const [showTmdbTokenModal, setShowTmdbTokenModal] = useState(false);

  const [title, setTitle] = useState(movie?.title ?? "");
  const [synopsis, setSynopsis] = useState(movie?.synopsis ?? "");

  const [activeTranslations, setActiveTranslations] = useState<
    Partial<Record<TranslationLocaleCode, TranslationFields>>
  >(() => {
    const initial: Partial<Record<TranslationLocaleCode, TranslationFields>> = {};
    for (const { code } of AVAILABLE_TRANSLATION_LOCALES) {
      const saved = movie?.translations?.[code];
      initial[code] = { title: saved?.title ?? "", synopsis: saved?.synopsis ?? "" };
    }
    return initial;
  });
  const [selectedEditLocale, setSelectedEditLocale] = useState<TranslationLocaleCode | null>(null);
  const [localeSearch, setLocaleSearch] = useState("");
  const [showLocaleDropdown, setShowLocaleDropdown] = useState(false);
  const localeSearchRef = useRef<HTMLDivElement>(null);
  const [durationMinutes, setDurationMinutes] = useState(
    movie?.duration_minutes ? String(movie.duration_minutes) : ""
  );
  const [releaseDate, setReleaseDate] = useState(movie?.release_date ?? "");
  const [posterUrl, setPosterUrl] = useState(movie?.poster_url ?? "");
  const [spotlightUrl, setSpotlightUrl] = useState(movie?.spotlight_url ?? "");
  const [ticketImageUrl, setTicketImageUrl] = useState(
    movie?.ticket_image_url ?? ""
  );
  // Tracks a broken ticket-image URL so the preview shows the placeholder
  // instead of a browser's broken-image glyph.
  const [ticketImageError, setTicketImageError] = useState(false);
  const [trailerUrl, setTrailerUrl] = useState(movie?.trailer_url ?? "");
  const [status, setStatus] = useState<MovieStatus>(movie?.status ?? "em_cartaz");
  const [isFeatured, setIsFeatured] = useState(movie?.is_featured ?? false);
  const [ageRating, setAgeRating] = useState<CatalogMovieAgeRating>(
    (movie?.age_rating as CatalogMovieAgeRating) ?? ""
  );
  const [classificationDescription, setClassificationDescription] = useState(movie?.classification_description ?? "");
  const [director, setDirector] = useState(movie?.director ?? "");
  const [selectedGenres, setSelectedGenres] = useState<CatalogGenre[]>(
    movie?.genres ?? []
  );
  const [castMembers, setCastMembers] = useState<string[]>(movie?.cast ?? []);
  const [castInput, setCastInput] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [showNewGenreInput, setShowNewGenreInput] = useState(false);
  const [newGenreName, setNewGenreName] = useState("");
  const [isCreatingGenre, setIsCreatingGenre] = useState(false);
  const [localGenres, setLocalGenres] = useState<CatalogGenre[]>([]);
  const [genresLoading, setGenresLoading] = useState(true);
  const [genresPage, setGenresPage] = useState(1);
  const [genresHasMore, setGenresHasMore] = useState(false);
  const [genresLoadingMore, setGenresLoadingMore] = useState(false);
  const [genreSearch, setGenreSearch] = useState("");
  const [debouncedGenreSearch, setDebouncedGenreSearch] = useState("");

  // TMDB search state
  const [tmdbQuery, setTmdbQuery] = useState("");
  const [tmdbResults, setTmdbResults] = useState<TmdbSearchResult[]>([]);
  const [isTmdbSearching, setIsTmdbSearching] = useState(false);
  const [isTmdbFilling, setIsTmdbFilling] = useState(false);
  const [tmdbError, setTmdbError] = useState<string | null>(null);
  const [tmdbFilled, setTmdbFilled] = useState(false);
  const [showTmdbResults, setShowTmdbResults] = useState(false);
  const tmdbSearchRef = useRef<HTMLDivElement>(null);

  const newGenreInputRef = useRef<HTMLInputElement>(null);
  const genreScrollRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const synopsisId = useId();
  const durationId = useId();
  const releaseDateId = useId();
  const posterUrlId = useId();
  const spotlightUrlId = useId();
  const ticketImageUrlId = useId();
  const trailerUrlId = useId();
  const classificationDescriptionId = useId();
  const directorId = useId();
  const castInputId = useId();
  const tmdbInputId = useId();

  const statusOptions = [
    { label: t("domain.movieStatus.em_cartaz"), value: "em_cartaz" },
    { label: t("domain.movieStatus.pre_venda"), value: "pre_venda" },
    { label: t("domain.movieStatus.em_breve"), value: "em_breve" },
  ];
  const ageRatingOptions = [
    { label: `${t("movie.ageRatingFree")} (L)`, value: "L" },
    { label: t("movie.ageRatingYears", { rating: 10 }), value: "10" },
    { label: t("movie.ageRatingYears", { rating: 12 }), value: "12" },
    { label: t("movie.ageRatingYears", { rating: 14 }), value: "14" },
    { label: t("movie.ageRatingYears", { rating: 16 }), value: "16" },
    { label: t("movie.ageRatingYears", { rating: 18 }), value: "18" },
  ];

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedGenreSearch(genreSearch), 300);
    return () => clearTimeout(timer);
  }, [genreSearch]);

  useEffect(() => {
    setGenresLoading(true);
    adminApi.listGenres({ page: 1, search: debouncedGenreSearch || undefined })
      .then((res) => {
        setLocalGenres(res.results);
        setGenresHasMore(res.next !== null);
        setGenresPage(1);
      })
      .catch(() => {})
      .finally(() => setGenresLoading(false));
  }, [debouncedGenreSearch]);

  useEffect(() => {
    if (showNewGenreInput) {
      newGenreInputRef.current?.focus();
    }
  }, [showNewGenreInput]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tmdbSearchRef.current && !tmdbSearchRef.current.contains(event.target as Node)) {
        setShowTmdbResults(false);
      }
      if (localeSearchRef.current && !localeSearchRef.current.contains(event.target as Node)) {
        setShowLocaleDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleGenre(genre: CatalogGenre) {
    setSelectedGenres((prev) =>
      prev.some((g) => g.id === genre.id)
        ? prev.filter((g) => g.id !== genre.id)
        : [...prev, genre]
    );
  }

  function handleGenreScroll(e: React.UIEvent<HTMLDivElement>) {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight >= 80 || !genresHasMore || genresLoadingMore || genresLoading) return;
    const nextPage = genresPage + 1;
    setGenresLoadingMore(true);
    adminApi.listGenres({ page: nextPage, search: debouncedGenreSearch || undefined })
      .then((res) => {
        setLocalGenres((prev) => {
          const ids = new Set(prev.map((g) => g.id));
          return [...prev, ...res.results.filter((g) => !ids.has(g.id))];
        });
        setGenresHasMore(res.next !== null);
        setGenresPage(nextPage);
      })
      .catch(() => {})
      .finally(() => setGenresLoadingMore(false));
  }

  function addCastMember() {
    const name = castInput.trim();
    if (!name || castMembers.includes(name)) return;
    setCastMembers((prev) => [...prev, name]);
    setCastInput("");
  }

  function removeCastMember(name: string) {
    setCastMembers((prev) => prev.filter((m) => m !== name));
  }

  async function handleTmdbSearch() {
    const query = tmdbQuery.trim();
    if (!query) return;

    setIsTmdbSearching(true);
    setTmdbError(null);
    setTmdbResults([]);
    setShowTmdbResults(false);

    try {
      const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&locale=${encodeURIComponent(locale)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTmdbResults(data.results ?? []);
      setShowTmdbResults(true);
    } catch {
      setTmdbError(t("admin.movie.tmdbSearchError"));
    } finally {
      setIsTmdbSearching(false);
    }
  }

  async function handleTmdbSelect(result: TmdbSearchResult) {
    setShowTmdbResults(false);
    setIsTmdbFilling(true);
    setTmdbError(null);

    try {
      const res = await fetch(`/api/tmdb/movie/${result.id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();

      setTitle(data.pt.title || result.title);
      setSynopsis(data.pt.synopsis || "");
      if (data.translations && typeof data.translations === "object") {
        setActiveTranslations((prev) => {
          const next = { ...prev };
          for (const { code } of AVAILABLE_TRANSLATION_LOCALES) {
            const t = data.translations[code];
            if (t?.title || t?.synopsis) {
              next[code] = { title: t.title ?? "", synopsis: t.synopsis ?? "" };
            }
          }
          return next;
        });
      }

      if (data.poster_path) {
        setPosterUrl(`${TMDB_POSTER_BASE}${data.poster_path}`);
      }
      if (data.runtime) {
        setDurationMinutes(String(data.runtime));
      }
      if (data.release_date) {
        setReleaseDate(data.release_date);
      }
      if (data.director) {
        setDirector(data.director);
      }
      if (data.cast?.length > 0) {
        setCastMembers(data.cast);
      }
      if (data.trailer_url) {
        setTrailerUrl(data.trailer_url);
      }

      setTmdbFilled(true);
    } catch {
      setTmdbError(t("admin.movie.tmdbSearchError"));
    } finally {
      setIsTmdbFilling(false);
    }
  }

  async function handleCreateGenre() {
    const name = newGenreName.trim();
    if (!name) return;

    setIsCreatingGenre(true);
    try {
      const created = await adminApi.createGenre({ name });
      setLocalGenres((prev) => prev.some((g) => g.id === created.id) ? prev : [...prev, created]);
      setSelectedGenres((prev) => prev.some((g) => g.id === created.id) ? prev : [...prev, created]);
      setNewGenreName("");
      setShowNewGenreInput(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") {
        const details = err.details as Record<string, unknown> | null;
        const nameError = details?.name;
        const msg = Array.isArray(nameError) ? nameError[0] : String(nameError ?? "");
        if (msg.toLowerCase().includes("already exists")) {
          setGlobalError(t("admin.genre.alreadyExists"));
        } else {
          setGlobalError(t("admin.movie.genreError", { message: msg || t("admin.genre.emptyName") }));
        }
      } else {
        setGlobalError(t("admin.genre.createError"));
      }
    } finally {
      setIsCreatingGenre(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setGlobalError(null);
    setIsSubmitting(true);

    const payload: AdminMovieWritePayload = {
      age_rating: ageRating || undefined,
      cast: castMembers,
      classification_description: classificationDescription,
      director: director || undefined,
      duration_minutes: Number(durationMinutes),
      genres: selectedGenres.map((g) => g.id),
      is_featured: isFeatured,
      poster_url: posterUrl,
      spotlight_url: spotlightUrl ? spotlightUrl : isEditing ? null : undefined,
      ticket_image_url: ticketImageUrl
        ? ticketImageUrl
        : isEditing
          ? null
          : undefined,
      trailer_url: trailerUrl ? trailerUrl : isEditing ? null : undefined,
      release_date: releaseDate,
      status,
      synopsis,
      title,
      translations: Object.fromEntries(
        Object.entries(activeTranslations)
          .filter(([, v]) => v.title.trim() || v.synopsis.trim())
          .map(([locale, v]) => [locale, { title: v.title, synopsis: v.synopsis }])
      ),
    };

    try {
      if (isEditing) {
        await adminApi.updateMovie(movie.id, payload);
      } else {
        await adminApi.createMovie(payload);
      }
      router.push("/admin/movies");
      router.refresh();
    } catch (err) {
      const errors = extractFieldErrors(err);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setGlobalError(t("admin.error.fixFields"));
      } else {
        setGlobalError(getApiErrorUserMessage(err, locale));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      {globalError ? (
        <p className="rounded-[8px] border border-error/30 bg-error/10 px-4 py-3 text-sm font-bold text-error" role="alert">
          {globalError}
        </p>
      ) : null}
      {fieldErrors.non_field_errors ? (
        <p className="rounded-[8px] border border-error/30 bg-error/10 px-4 py-3 text-sm font-bold text-error" role="alert">
          {fieldErrors.non_field_errors}
        </p>
      ) : null}

      {/* TMDB search */}
      <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.02] p-4 grid gap-3">
        <p className="text-sm font-extrabold text-white">{t("admin.movie.tmdbSearch")}</p>
        <div className="relative" ref={tmdbSearchRef}>
          <div className="flex gap-2">
            <TextInput
              disabled={isSubmitting || isTmdbFilling}
              id={tmdbInputId}
              onChange={(e) => setTmdbQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleTmdbSearch();
                }
              }}
              placeholder={t("admin.movie.tmdbSearchPlaceholder")}
              value={tmdbQuery}
            />
            <Button
              disabled={isSubmitting || isTmdbSearching || isTmdbFilling || !tmdbQuery.trim()}
              isLoading={isTmdbSearching || isTmdbFilling}
              onClick={handleTmdbSearch}
              size="md"
              type="button"
              variant="secondary"
            >
              {isTmdbSearching || isTmdbFilling
                ? t("admin.movie.tmdbSearching")
                : t("admin.movie.tmdbSearch")}
            </Button>
          </div>

          {showTmdbResults && tmdbResults.length === 0 ? (
            <div className="absolute z-10 mt-1 w-full rounded-[8px] border border-white/[0.10] bg-[#1e2535] p-3 text-sm text-white/50">
              {t("admin.movie.tmdbNoResults")}
            </div>
          ) : null}

          {showTmdbResults && tmdbResults.length > 0 ? (
            <ul className="absolute z-10 mt-1 w-full rounded-[8px] border border-white/[0.10] bg-[#1e2535] shadow-lg overflow-hidden">
              {tmdbResults.map((result) => (
                <li key={result.id}>
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.06] focus:bg-white/[0.06] outline-none"
                    onClick={() => handleTmdbSelect(result)}
                    type="button"
                  >
                    {result.poster_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt=""
                        className="h-10 w-7 shrink-0 rounded object-cover"
                        src={`${TMDB_POSTER_BASE}${result.poster_path}`}
                      />
                    ) : (
                      <div className="h-10 w-7 shrink-0 rounded bg-white/[0.06]" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-white">
                        {result.title}
                      </span>
                      {result.title !== result.original_title ? (
                        <span className="block truncate text-xs text-white/40">
                          {result.original_title}
                        </span>
                      ) : null}
                    </span>
                    {result.year ? (
                      <span className="ml-auto shrink-0 text-xs text-white/40">{result.year}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {tmdbError ? (
          <p className="text-sm font-bold text-error">{tmdbError}</p>
        ) : null}
        {tmdbFilled ? (
          <p className="text-sm font-bold text-brand/80">{t("admin.movie.tmdbFilled")}</p>
        ) : null}
        {isMaster ? (
          <button
            className="self-start text-xs text-white/40 underline-offset-2 transition hover:text-white/70 hover:underline"
            onClick={() => setShowTmdbTokenModal(true)}
            type="button"
          >
            Configurar token TMDB
          </button>
        ) : null}
      </div>

      <TmdbTokenModal isOpen={showTmdbTokenModal} onClose={() => setShowTmdbTokenModal(false)} />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left column */}
        <div className="grid gap-4 content-start">
          <FormField error={fieldErrors.title} label={t("admin.movie.titleField")} labelFor={titleId}>
            <TextInput
              disabled={isSubmitting}
              error={fieldErrors.title}
              id={titleId}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("admin.movie.titlePlaceholder")}
              required
              value={title}
            />
          </FormField>

          <FormField error={fieldErrors.synopsis} label={t("admin.movie.synopsis")} labelFor={synopsisId}>
            <Textarea
              disabled={isSubmitting}
              error={fieldErrors.synopsis}
              id={synopsisId}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder={t("admin.movie.synopsisPlaceholder")}
              required
              value={synopsis}
            />
          </FormField>

          <div className="grid gap-3 rounded-[8px] border border-white/[0.08] p-4">
            <p className="text-sm font-extrabold text-white">{t("admin.movie.translations")}</p>

            {/* Locale search */}
            <div className="relative" ref={localeSearchRef}>
              <TextInput
                disabled={isSubmitting}
                onChange={(e) => {
                  setLocaleSearch(e.target.value);
                  setShowLocaleDropdown(true);
                }}
                onFocus={() => setShowLocaleDropdown(true)}
                onKeyDown={(e) => { if (e.key === "Escape") setShowLocaleDropdown(false); }}
                placeholder={t("admin.movie.translationSearchLocale")}
                value={localeSearch}
              />
              {showLocaleDropdown ? (() => {
                const q = localeSearch.toLowerCase();
                const options = AVAILABLE_TRANSLATION_LOCALES.filter(
                  (l) =>
                    l.label.toLowerCase().includes(q) ||
                    l.sublabel.toLowerCase().includes(q) ||
                    l.code.toLowerCase().includes(q)
                );
                return options.length > 0 ? (
                  <ul className="absolute z-10 mt-1 w-full rounded-[8px] border border-white/[0.10] bg-[#1e2535] shadow-lg overflow-hidden">
                    {options.map((locale) => (
                      <li key={locale.code}>
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-white/[0.06] outline-none"
                          onClick={() => {
                            setSelectedEditLocale(locale.code);
                            setLocaleSearch(locale.label);
                            setShowLocaleDropdown(false);
                          }}
                          type="button"
                        >
                          <span className="text-sm font-bold text-white">{locale.label}</span>
                          <span className="text-xs text-white/40">{locale.sublabel}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : localeSearch ? (
                  <div className="absolute z-10 mt-1 w-full rounded-[8px] border border-white/[0.10] bg-[#1e2535] p-3 text-sm text-white/40">
                    {t("admin.movie.translationNoLocales")}
                  </div>
                ) : null;
              })() : null}
            </div>

            {/* Edit fields for selected locale */}
            {selectedEditLocale ? (() => {
              const meta = AVAILABLE_TRANSLATION_LOCALES.find((l) => l.code === selectedEditLocale)!;
              const fields = activeTranslations[selectedEditLocale] ?? { title: "", synopsis: "" };
              return (
                <div className="grid gap-3 rounded-[8px] border border-white/[0.06] bg-white/[0.02] p-3">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-white/50">
                    {meta.label}
                    <span className="ml-1.5 font-normal">{meta.sublabel}</span>
                  </span>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-white/60">
                      {t("admin.movie.translationTitle")}
                    </label>
                    <TextInput
                      disabled={isSubmitting}
                      error={fieldErrors.translations}
                      onChange={(e) =>
                        setActiveTranslations((prev) => ({
                          ...prev,
                          [selectedEditLocale]: { ...fields, title: e.target.value },
                        }))
                      }
                      placeholder={t("admin.movie.titlePlaceholder")}
                      value={fields.title}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-white/60">
                      {t("admin.movie.translationSynopsis")}
                    </label>
                    <Textarea
                      disabled={isSubmitting}
                      error={fieldErrors.translations}
                      onChange={(e) =>
                        setActiveTranslations((prev) => ({
                          ...prev,
                          [selectedEditLocale]: { ...fields, synopsis: e.target.value },
                        }))
                      }
                      placeholder={t("admin.movie.synopsisPlaceholder")}
                      value={fields.synopsis}
                    />
                  </div>
                </div>
              );
            })() : null}

            {fieldErrors.translations ? (
              <p className="text-sm font-bold text-error">{fieldErrors.translations}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField error={fieldErrors.duration_minutes} label={t("admin.movie.durationMinutes")} labelFor={durationId}>
              <TextInput
                disabled={isSubmitting}
                error={fieldErrors.duration_minutes}
                id={durationId}
                min={1}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="120"
                required
                type="number"
                value={durationMinutes}
              />
            </FormField>

            <FormField error={fieldErrors.release_date} label={t("admin.movie.releaseDate")} labelFor={releaseDateId}>
              <TextInput
                disabled={isSubmitting}
                error={fieldErrors.release_date}
                id={releaseDateId}
                onChange={(e) => setReleaseDate(e.target.value)}
                required
                type="date"
                value={releaseDate}
              />
            </FormField>
          </div>

          <FormField error={fieldErrors.director} label={t("admin.movie.director")} labelFor={directorId}>
            <TextInput
              disabled={isSubmitting}
              error={fieldErrors.director}
              id={directorId}
              onChange={(e) => setDirector(e.target.value)}
              placeholder={t("admin.movie.directorPlaceholder")}
              value={director}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              disabled={isSubmitting}
              error={fieldErrors.status}
              label={t("admin.movie.status")}
              onChange={(e) => setStatus(e.target.value as MovieStatus)}
              options={statusOptions}
              value={status}
            />

            <Select
              disabled={isSubmitting}
              error={fieldErrors.age_rating}
              label={t("admin.movie.ageRating")}
              onChange={(e) => setAgeRating(e.target.value as CatalogMovieAgeRating)}
              options={ageRatingOptions}
              placeholder={t("admin.movie.unclassified")}
              value={ageRating}
            />
          </div>

          <FormField
            error={fieldErrors.classification_description as string | undefined}
            label={t("admin.movie.classificationDescription")}
            labelFor={classificationDescriptionId}
          >
            <Textarea
              disabled={isSubmitting}
              id={classificationDescriptionId}
              onChange={(e) => setClassificationDescription(e.target.value)}
              placeholder={t("admin.movie.classificationDescriptionPlaceholder")}
              value={classificationDescription}
            />
          </FormField>

          <div className="flex items-center gap-3">
            <input
              checked={isFeatured}
              className="h-4 w-4 accent-brand"
              disabled={isSubmitting}
              id="is_featured"
              onChange={(e) => setIsFeatured(e.target.checked)}
              type="checkbox"
            />
            <label className="text-sm font-extrabold text-white" htmlFor="is_featured">
              {t("admin.movie.featuredCarousel")}
            </label>
          </div>
        </div>

        {/* Right column */}
        <div className="grid gap-4 content-start">
          <FormField error={fieldErrors.poster_url} label={t("admin.movie.posterUrl")} labelFor={posterUrlId}>
            <TextInput
              disabled={isSubmitting}
              error={fieldErrors.poster_url}
              id={posterUrlId}
              onChange={(e) => setPosterUrl(e.target.value)}
              placeholder="https://..."
              required
              type="url"
              value={posterUrl}
            />
          </FormField>

          {posterUrl ? (
            <div className="overflow-hidden rounded-[8px] border border-white/[0.07]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={t("admin.movie.posterPreview")}
                className="w-full object-cover"
                src={posterUrl}
                style={{ maxHeight: 280 }}
              />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-[8px] border border-dashed border-white/[0.12] text-sm text-white/30">
              {t("admin.movie.posterPreview")}
            </div>
          )}

          <FormField
            error={fieldErrors.spotlight_url}
            label={t("admin.movie.spotlightUrl")}
            labelFor={spotlightUrlId}
          >
            <TextInput
              disabled={isSubmitting}
              error={fieldErrors.spotlight_url}
              id={spotlightUrlId}
              onChange={(e) => setSpotlightUrl(e.target.value)}
              placeholder={t("admin.movie.spotlightUrlPlaceholder")}
              type="url"
              value={spotlightUrl}
            />
          </FormField>
          {spotlightUrl ? (
            <div className="overflow-hidden rounded-[8px] border border-white/[0.07]" style={{ aspectRatio: "16/9" }}>
              <iframe
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-fullscreen"
                src={spotlightUrl}
                title={t("admin.movie.spotlightPreview")}
              />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-[8px] border border-dashed border-white/[0.12] text-sm text-white/30">
              {t("admin.movie.spotlightPreview")}
            </div>
          )}

          <FormField
            error={fieldErrors.ticket_image_url}
            hint={t("admin.movie.ticketImageHint")}
            label={t("admin.movie.ticketImageUrl")}
            labelFor={ticketImageUrlId}
          >
            <TextInput
              disabled={isSubmitting}
              error={fieldErrors.ticket_image_url}
              id={ticketImageUrlId}
              onChange={(e) => {
                setTicketImageUrl(e.target.value);
                setTicketImageError(false);
              }}
              placeholder={t("admin.movie.ticketImageUrlPlaceholder")}
              type="url"
              value={ticketImageUrl}
            />
          </FormField>
          {ticketImageUrl && !ticketImageError ? (
            <div
              className="overflow-hidden rounded-[8px] border border-white/[0.07]"
              style={{ aspectRatio: "16/9" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={t("admin.movie.ticketImagePreview")}
                className="h-full w-full object-cover"
                onError={() => setTicketImageError(true)}
                src={ticketImageUrl}
              />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-[8px] border border-dashed border-white/[0.12] text-sm text-white/30">
              {t("admin.movie.ticketImagePreview")}
            </div>
          )}

          <FormField
            error={fieldErrors.trailer_url}
            label={t("admin.movie.trailerUrl")}
            labelFor={trailerUrlId}
          >
            <TextInput
              disabled={isSubmitting}
              error={fieldErrors.trailer_url}
              id={trailerUrlId}
              onChange={(e) => setTrailerUrl(e.target.value)}
              placeholder={t("admin.movie.trailerUrlPlaceholder")}
              type="url"
              value={trailerUrl}
            />
          </FormField>
          {trailerUrl ? (
            <div className="overflow-hidden rounded-[8px] border border-white/[0.07]" style={{ aspectRatio: "16/9" }}>
              <iframe
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-fullscreen"
                src={trailerUrl}
                title={t("admin.movie.trailerPreview")}
              />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-[8px] border border-dashed border-white/[0.12] text-sm text-white/30">
              {t("admin.movie.trailerPreview")}
            </div>
          )}

          {/* Genres */}
          <div className="grid gap-2">
            <span className="text-sm font-extrabold text-white">{t("admin.movie.genres")}</span>
            {fieldErrors.genres ? (
              <p className="text-sm font-bold text-error" role="alert">
                {fieldErrors.genres}
              </p>
            ) : null}

            {/* Selected genre chips */}
            {selectedGenres.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedGenres.map((genre) => (
                  <button
                    className="flex items-center gap-1 rounded-pill border border-brand bg-brand/20 px-2.5 py-1 text-xs font-bold text-brand transition hover:bg-brand/30 disabled:opacity-60"
                    disabled={isSubmitting}
                    key={genre.id}
                    onClick={() => toggleGenre(genre)}
                    type="button"
                  >
                    {genre.name}
                    <span aria-hidden="true" className="opacity-70">×</span>
                  </button>
                ))}
              </div>
            ) : null}

            {/* Search input */}
            <input
              className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-brand focus:shadow-focus"
              onChange={(e) => setGenreSearch(e.target.value)}
              placeholder={t("admin.genre.searchPlaceholder")}
              type="text"
              value={genreSearch}
            />

            {/* Genre list */}
            {genresLoading ? (
              <div className="flex flex-col gap-1">
                {[0, 1, 2].map((i) => (
                  <div className="h-9 animate-pulse rounded-[6px] bg-white/[0.06]" key={i} />
                ))}
              </div>
            ) : (
              <div
                className="max-h-[220px] overflow-y-auto rounded-[8px] border border-border"
                onScroll={handleGenreScroll}
                ref={genreScrollRef}
              >
                {localGenres.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-white/40">
                    {t("admin.genre.noResults")}
                  </p>
                ) : (
                  localGenres.map((genre) => {
                    const selected = selectedGenres.some((g) => g.id === genre.id);
                    return (
                      <button
                        className={[
                          "flex w-full items-center gap-2.5 border-b border-white/[0.05] px-3 py-2.5 text-sm text-left transition last:border-b-0",
                          selected
                            ? "bg-brand/10 text-brand"
                            : "text-white/70 hover:bg-white/[0.04] hover:text-white",
                        ].join(" ")}
                        disabled={isSubmitting}
                        key={genre.id}
                        onClick={() => toggleGenre(genre)}
                        type="button"
                      >
                        <span className={["w-4 shrink-0 text-xs font-bold", selected ? "opacity-100" : "opacity-0"].join(" ")}>✓</span>
                        {genre.name}
                      </button>
                    );
                  })
                )}
                {genresLoadingMore ? (
                  <p className="border-t border-white/[0.05] py-2 text-center text-xs text-white/40">
                    {t("admin.genre.loadingMore")}
                  </p>
                ) : null}
              </div>
            )}

            {/* New genre */}
            {showNewGenreInput ? (
              <div className="flex items-center gap-1.5">
                <input
                  className="h-7 rounded-control border border-brand/50 bg-brand/10 px-2 text-xs text-white outline-none focus:border-brand"
                  disabled={isCreatingGenre}
                  onChange={(e) => setNewGenreName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateGenre();
                    }
                    if (e.key === "Escape") {
                      setShowNewGenreInput(false);
                      setNewGenreName("");
                    }
                  }}
                  placeholder={t("admin.genre.namePlaceholder")}
                  ref={newGenreInputRef}
                  value={newGenreName}
                />
                <Button
                  disabled={isCreatingGenre || !newGenreName.trim()}
                  isLoading={isCreatingGenre}
                  onClick={handleCreateGenre}
                  size="sm"
                  type="button"
                  variant="primary"
                >
                  {t("admin.create")}
                </Button>
                <Button
                  onClick={() => {
                    setShowNewGenreInput(false);
                    setNewGenreName("");
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t("admin.cancel")}
                </Button>
              </div>
            ) : (
              <button
                className="self-start rounded-pill border border-dashed border-white/[0.15] px-3 py-1 text-xs font-bold text-white/40 transition hover:border-brand/50 hover:text-brand"
                disabled={isSubmitting}
                onClick={() => setShowNewGenreInput(true)}
                type="button"
              >
                + {t("admin.genre.new")}
              </button>
            )}
          </div>

          {/* Cast */}
          <div className="grid gap-1.5">
            <label className="text-sm font-extrabold text-white" htmlFor={castInputId}>
              {t("admin.movie.cast")}
            </label>
            {fieldErrors.cast ? (
              <p className="text-sm font-bold text-error" role="alert">
                {fieldErrors.cast}
              </p>
            ) : null}
            <div className="flex gap-2">
              <TextInput
                disabled={isSubmitting}
                id={castInputId}
                onChange={(e) => setCastInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCastMember();
                  }
                }}
                placeholder={t("admin.movie.castPlaceholder")}
                value={castInput}
              />
              <Button
                disabled={isSubmitting || !castInput.trim()}
                onClick={addCastMember}
                size="sm"
                type="button"
                variant="secondary"
              >
                {t("common.add")}
              </Button>
            </div>
            {castMembers.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {castMembers.map((name) => (
                  <li
                    className="flex items-center gap-1.5 rounded-pill border border-white/[0.10] bg-white/[0.04] pl-3 pr-2 py-1 text-xs text-white/80"
                    key={name}
                  >
                    {name}
                    <button
                      aria-label={t("common.removeName", { name })}
                      className="text-white/40 transition hover:text-error"
                      disabled={isSubmitting}
                      onClick={() => removeCastMember(name)}
                      type="button"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-white/[0.07] pt-4">
        <Button
          disabled={isSubmitting}
          onClick={() => router.push("/admin/movies")}
          type="button"
          variant="ghost"
        >
          {t("admin.cancel")}
        </Button>
        <Button isLoading={isSubmitting} type="submit" variant="primary">
          {isEditing ? t("admin.saveChanges") : t("admin.movie.create")}
        </Button>
      </div>
    </form>
  );
}
