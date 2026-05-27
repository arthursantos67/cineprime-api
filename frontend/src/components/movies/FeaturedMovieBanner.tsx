"use client";

import Link from "next/link";
import type { KeyboardEvent, MouseEvent } from "react";
import { useEffect, useRef } from "react";

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
  const viewportRef = useRef<HTMLDivElement>(null);
  const currentIndexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  function scrollToIndex(index: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ behavior: "smooth", left: viewport.clientWidth * index });
    currentIndexRef.current = index;
  }

  function clearAutoAdvance() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function startAutoAdvance() {
    if (featuredMovies.length <= 1) return;
    intervalRef.current = setInterval(() => {
      const next = (currentIndexRef.current + 1) % featuredMovies.length;
      scrollToIndex(next);
    }, 7000);
  }

  function resetAutoAdvance() {
    clearAutoAdvance();
    startAutoAdvance();
  }

  function scrollFeatured(direction: "next" | "previous") {
    const next =
      direction === "next"
        ? (currentIndexRef.current + 1) % featuredMovies.length
        : (currentIndexRef.current - 1 + featuredMovies.length) %
          featuredMovies.length;
    scrollToIndex(next);
    resetAutoAdvance();
  }

  function handleMouseDown(e: MouseEvent<HTMLDivElement>) {
    isDragging.current = true;
    dragStartX.current = e.pageX;
    dragScrollLeft.current = viewportRef.current?.scrollLeft ?? 0;
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.style.cursor = "grabbing";
      viewport.style.userSelect = "none";
    }
  }

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!isDragging.current || !viewportRef.current) return;
    e.preventDefault();
    viewportRef.current.scrollLeft =
      dragScrollLeft.current - (e.pageX - dragStartX.current);
  }

  function handleDragEnd() {
    if (!isDragging.current) return;
    isDragging.current = false;
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.style.cursor = "";
      viewport.style.userSelect = "";
    }
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
      className="featured-movie-carousel"
    >
      <h2 className="sr-only" id="featured-movies-heading">
        Filmes em destaque
      </h2>
      <div className="featured-movie-carousel__viewport-outer">
        {featuredMovies.length > 1 ? (
          <button
            aria-label="Mostrar destaque anterior"
            className="carousel-button carousel-button--side carousel-button--prev carousel-button--on-dark"
            onClick={() => scrollFeatured("previous")}
            title="Mostrar destaque anterior"
            type="button"
          >
            <span aria-hidden="true">{"<"}</span>
          </button>
        ) : null}
        <div
          className="featured-movie-carousel__viewport"
          onDragStart={(e) => e.preventDefault()}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleDragEnd}
          onMouseMove={handleMouseMove}
          onMouseUp={handleDragEnd}
          ref={viewportRef}
        >
          <ul
            className="featured-movie-carousel__track"
            onKeyDown={handleFeaturedKeyDown}
            role="list"
          >
            {featuredMovies.map((featuredMovie, index) => (
              <li
                className="featured-movie-carousel__slide"
                key={featuredMovie.id}
              >
                <article
                  aria-label={`Filme em destaque: ${featuredMovie.title}`}
                  className="featured-movie"
                >
                  <div className="featured-movie__media">
                    <ResponsiveImage
                      alt={`Poster de ${featuredMovie.title}`}
                      className="featured-movie__poster"
                      height={720}
                      priority={index === 0}
                      src={featuredMovie.poster_url}
                      sizes="(max-width: 820px) 100vw, 360px"
                      unoptimized
                      width={480}
                    />
                  </div>
                  <div className="featured-movie__content">
                    <p className="eyebrow">Destaque</p>
                    <h3>{featuredMovie.title}</h3>
                    <p className="featured-movie__meta">
                      {formatMovieGenres(featuredMovie.genres)} |{" "}
                      {formatMovieDuration(featuredMovie.duration_minutes)}
                    </p>
                    <Link
                      aria-label={`${primaryActionLabel} de ${featuredMovie.title}`}
                      className="button button-primary"
                      href={getMovieDetailsHref(featuredMovie.id)}
                    >
                      {primaryActionLabel}
                    </Link>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
        {featuredMovies.length > 1 ? (
          <button
            aria-label="Mostrar próximo destaque"
            className="carousel-button carousel-button--side carousel-button--next carousel-button--on-dark"
            onClick={() => scrollFeatured("next")}
            title="Mostrar próximo destaque"
            type="button"
          >
            <span aria-hidden="true">{">"}</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

function handleFeaturedKeyDown(event: KeyboardEvent<HTMLUListElement>) {
  if (
    event.key !== "ArrowLeft" &&
    event.key !== "ArrowRight" &&
    event.key !== "Home" &&
    event.key !== "End"
  ) {
    return;
  }

  const links = Array.from(
    event.currentTarget.querySelectorAll<HTMLAnchorElement>(".featured-movie a")
  );

  if (links.length === 0) {
    return;
  }

  const activeElement = document.activeElement;
  const activeIndex = links.findIndex((link) => link === activeElement);
  let nextIndex = activeIndex >= 0 ? activeIndex : 0;

  if (event.key === "ArrowRight") {
    nextIndex = Math.min(nextIndex + 1, links.length - 1);
  }

  if (event.key === "ArrowLeft") {
    nextIndex = Math.max(nextIndex - 1, 0);
  }

  if (event.key === "Home") {
    nextIndex = 0;
  }

  if (event.key === "End") {
    nextIndex = links.length - 1;
  }

  event.preventDefault();
  links[nextIndex].focus();
  links[nextIndex].scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "nearest",
  });
}
