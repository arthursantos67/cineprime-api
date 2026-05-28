"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { ResponsiveImage } from "@/components/ui/ResponsiveImage";
import type { CatalogMovie } from "@/types/catalog";

import {
  formatMovieDuration,
  formatMovieGenres,
  getMovieDetailsHref,
} from "./movie-formatters";

type FeaturedMovieBannerProps = {
  movie?: CatalogMovie;
  movies?: CatalogMovie[];
  primaryActionLabel?: string;
};

export function FeaturedMovieBanner({
  movie,
  movies,
  primaryActionLabel = "Ver sessões",
}: FeaturedMovieBannerProps) {
  const featuredMovies = movies?.length ? movies : movie ? [movie] : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearAutoAdvance() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function startAutoAdvance() {
    if (featuredMovies.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setActiveIndex((i) => (i + 1) % featuredMovies.length);
    }, 7000);
  }

  function resetAutoAdvance() {
    clearAutoAdvance();
    startAutoAdvance();
  }

  function scrollFeatured(direction: "next" | "previous") {
    setActiveIndex((i) =>
      direction === "next"
        ? (i + 1) % featuredMovies.length
        : (i - 1 + featuredMovies.length) % featuredMovies.length
    );
    resetAutoAdvance();
  }

  useEffect(() => {
    startAutoAdvance();
    return clearAutoAdvance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredMovies.length]);

  if (featuredMovies.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="featured-movies-heading"
      className="featured-movie-carousel relative overflow-hidden text-white ml-[calc(50%_-_50vw)] mr-[calc(50%_-_50vw)] w-screen h-[75svh] min-h-[400px] mt-[calc(-1_*_var(--layout-page-block))]"
    >
      <h2 className="sr-only" id="featured-movies-heading">
        Filmes em destaque
      </h2>

      {/* Full-bleed backdrop with per-slide images */}
      <div aria-hidden="true" className="absolute inset-0">
        {featuredMovies.map((fm, i) => (
          <div
            key={fm.id}
            className={`absolute inset-0 transition-opacity duration-700 [will-change:opacity] ${
              i === activeIndex ? "opacity-100" : "opacity-0"
            }`}
          >
            <ResponsiveImage
              alt={`Poster de ${fm.title}`}
              className="block h-full w-full object-cover object-top"
              height={1080}
              priority={i === 0}
              src={fm.poster_url}
              sizes="100vw"
              unoptimized
              width={1920}
            />
          </div>
        ))}
        {/* Cinematic gradient overlay */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: [
              "linear-gradient(to right, rgb(5 8 16 / 90%) 0%, rgb(5 8 16 / 72%) 35%, rgb(5 8 16 / 42%) 60%, rgb(5 8 16 / 18%) 100%)",
              "linear-gradient(to top, rgb(5 8 16 / 60%) 0%, transparent 40%)",
            ].join(", "),
          }}
        />
      </div>

      {/* Content stage — anchored to bottom */}
      <div className="absolute inset-0 flex items-end pb-20">
        <div className="shell-container relative z-[2] grid gap-5">
          {featuredMovies.map((fm, i) => (
            <article
              key={fm.id}
              aria-label={`Filme em destaque: ${fm.title}`}
              aria-hidden={i !== activeIndex || undefined}
              className={`grid gap-4 max-w-[580px] transition-opacity duration-[600ms] ${
                i === activeIndex
                  ? "opacity-100 pointer-events-auto static"
                  : "opacity-0 pointer-events-none absolute top-0"
              }`}
            >
              <Badge className="w-fit" tone="accent">
                Destaque
              </Badge>
              <h3
                className="m-0 text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.05] text-white"
                style={{ textShadow: "0 2px 20px rgb(0 0 0 / 50%)" }}
              >
                {fm.title}
              </h3>
              <p className="m-0 text-base font-semibold text-white/75">
                {formatMovieGenres(fm.genres)} |{" "}
                {formatMovieDuration(fm.duration_minutes)}
              </p>
              <ButtonLink
                aria-label={`${primaryActionLabel} de ${fm.title}`}
                className="w-fit min-h-[48px] px-7"
                href={getMovieDetailsHref(fm.id)}
                size="lg"
                variant="primary"
              >
                {primaryActionLabel}
              </ButtonLink>
            </article>
          ))}

          {featuredMovies.length > 1 ? (
            <div
              aria-label="Destaques"
              className="flex gap-2 pt-2"
              role="tablist"
            >
              {featuredMovies.map((fm, i) => (
                <button
                  key={fm.id}
                  aria-label={`Destaque ${i + 1}: ${fm.title}`}
                  aria-selected={i === activeIndex}
                  className={`h-1.5 rounded-pill border-0 cursor-pointer p-0 transition-all duration-200 ${
                    i === activeIndex
                      ? "w-10 bg-white"
                      : "w-6 bg-white/35 hover:bg-white/60"
                  }`}
                  onClick={() => {
                    setActiveIndex(i);
                    resetAutoAdvance();
                  }}
                  role="tab"
                  type="button"
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Directional controls — only rendered when more than one featured movie */}
      {featuredMovies.length > 1 ? (
        <>
          <button
            aria-label="Mostrar destaque anterior"
            className="absolute left-1 top-1/2 z-[3] -translate-y-1/2 flex h-[52px] w-9 items-center justify-center rounded-[6px] bg-white/55 text-[rgb(20_20_20/0.65)] transition-all hover:bg-white/[0.92] hover:scale-[1.08] focus-visible:outline-none focus-visible:shadow-focus"
            onClick={() => scrollFeatured("previous")}
            type="button"
          >
            <span
              aria-hidden="true"
              className="block h-2.5 w-2.5 -rotate-[135deg] border-r-2 border-t-2 border-current"
            />
          </button>
          <button
            aria-label="Mostrar próximo destaque"
            className="absolute right-1 top-1/2 z-[3] -translate-y-1/2 flex h-[52px] w-9 items-center justify-center rounded-[6px] bg-white/55 text-[rgb(20_20_20/0.65)] transition-all hover:bg-white/[0.92] hover:scale-[1.08] focus-visible:outline-none focus-visible:shadow-focus"
            onClick={() => scrollFeatured("next")}
            type="button"
          >
            <span
              aria-hidden="true"
              className="block h-2.5 w-2.5 rotate-45 border-r-2 border-t-2 border-current"
            />
          </button>
        </>
      ) : null}

      {/* Scroll hint to catalog */}
      <a
        aria-label="Rolar para o catálogo de filmes"
        className="absolute bottom-6 left-1/2 z-[3] flex -translate-x-1/2 flex-col items-center gap-1 text-white/55 transition-colors hover:text-white focus-visible:outline-none"
        href="#catalogo"
      >
        <span
          aria-hidden="true"
          className="block h-2.5 w-2.5 rotate-45 border-b-2 border-r-2 border-current animate-scroll-bounce"
        />
        <span className="sr-only">Ver catálogo</span>
      </a>
    </section>
  );
}
