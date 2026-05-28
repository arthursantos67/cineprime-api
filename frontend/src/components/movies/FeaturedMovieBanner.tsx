"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
      className="featured-movie-carousel cinematic-hero"
    >
      <h2 className="sr-only" id="featured-movies-heading">
        Filmes em destaque
      </h2>

      {/* Full-bleed backdrop with per-slide images */}
      <div className="cinematic-hero__backdrop" aria-hidden="true">
        {featuredMovies.map((fm, i) => (
          <div
            key={fm.id}
            className={`cinematic-hero__slide-bg${
              i === activeIndex ? " cinematic-hero__slide-bg--active" : ""
            }`}
          >
            <ResponsiveImage
              alt={`Poster de ${fm.title}`}
              className="cinematic-hero__bg-img"
              height={1080}
              priority={i === 0}
              src={fm.poster_url}
              sizes="100vw"
              unoptimized
              width={1920}
            />
          </div>
        ))}
        <div className="cinematic-hero__overlay" />
      </div>

      {/* Content stage — shell-container constrains the text width */}
      <div className="cinematic-hero__stage">
        <div className="shell-container cinematic-hero__inner">
          {featuredMovies.map((fm, i) => (
            <article
              key={fm.id}
              aria-label={`Filme em destaque: ${fm.title}`}
              aria-hidden={i !== activeIndex || undefined}
              className={`cinematic-hero__content${
                i === activeIndex ? " cinematic-hero__content--active" : ""
              }`}
            >
              <p className="eyebrow cinematic-hero__eyebrow">Destaque</p>
              <h3 className="cinematic-hero__title">{fm.title}</h3>
              <p className="cinematic-hero__meta">
                {formatMovieGenres(fm.genres)} |{" "}
                {formatMovieDuration(fm.duration_minutes)}
              </p>
              <Link
                aria-label={`${primaryActionLabel} de ${fm.title}`}
                className="button button-primary cinematic-hero__cta"
                href={getMovieDetailsHref(fm.id)}
              >
                {primaryActionLabel}
              </Link>
            </article>
          ))}

          {featuredMovies.length > 1 ? (
            <div
              aria-label="Destaques"
              className="cinematic-hero__dots"
              role="tablist"
            >
              {featuredMovies.map((fm, i) => (
                <button
                  key={fm.id}
                  aria-label={`Destaque ${i + 1}: ${fm.title}`}
                  aria-selected={i === activeIndex}
                  className={`cinematic-hero__dot${
                    i === activeIndex ? " cinematic-hero__dot--active" : ""
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
            className="carousel-button carousel-button--side carousel-button--prev carousel-button--on-dark"
            onClick={() => scrollFeatured("previous")}
            type="button"
          >
            <span aria-hidden="true" />
          </button>
          <button
            aria-label="Mostrar próximo destaque"
            className="carousel-button carousel-button--side carousel-button--next carousel-button--on-dark"
            onClick={() => scrollFeatured("next")}
            type="button"
          >
            <span aria-hidden="true" />
          </button>
        </>
      ) : null}

      {/* Scroll hint to catalog */}
      <a
        aria-label="Rolar para o catálogo de filmes"
        className="cinematic-hero__scroll-hint"
        href="#catalogo"
      >
        <span aria-hidden="true" className="cinematic-hero__scroll-arrow" />
        <span className="sr-only">Ver catálogo</span>
      </a>
    </section>
  );
}
