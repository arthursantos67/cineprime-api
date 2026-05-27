"use client";

import type { KeyboardEvent } from "react";
import { useRef } from "react";

import type { CatalogMovie } from "@/types/catalog";

import { StateMessage } from "@/components/ui/StateMessage";

import { MovieCard } from "./MovieCard";

type MovieCarouselProps = {
  ariaLabel?: string;
  emptyDescription?: string;
  emptyTitle?: string;
  isLoading?: boolean;
  loadingLabel?: string;
  movies: CatalogMovie[];
  nextButtonLabel?: string;
  previousButtonLabel?: string;
  skeletonCount?: number;
  title: string;
};

export function MovieCarousel({
  ariaLabel,
  emptyDescription = "Nenhum filme foi encontrado para esta seção.",
  emptyTitle = "Nenhum filme disponível",
  isLoading = false,
  loadingLabel = "Carregando filmes...",
  movies,
  nextButtonLabel,
  previousButtonLabel,
  skeletonCount = 6,
  title,
}: MovieCarouselProps) {
  const railRef = useRef<HTMLUListElement>(null);
  const headingId = `movie-carousel-${slugify(title)}`;
  const hasMultipleMovies = movies.length > 1;

  function scrollRail(direction: "next" | "previous") {
    const rail = railRef.current;

    if (!rail) {
      return;
    }

    const scrollDistance = Math.max(rail.clientWidth * 0.85, 220);
    rail.scrollBy({
      behavior: "smooth",
      left: direction === "next" ? scrollDistance : -scrollDistance,
    });
  }

  return (
    <section
      aria-busy={isLoading || undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : headingId}
      className="movie-carousel-section"
    >
      <div className="movie-carousel-section__header">
        <h2 id={headingId}>{title}</h2>
        {hasMultipleMovies ? (
          <div
            aria-label={`Controles do carrossel ${title}`}
            className="movie-carousel-controls"
            role="group"
          >
            <button
              aria-label={previousButtonLabel ?? `Filme anterior em ${title}`}
              className="carousel-button"
              onClick={() => scrollRail("previous")}
              title={previousButtonLabel ?? `Filme anterior em ${title}`}
              type="button"
            >
              <span aria-hidden="true">{"<"}</span>
            </button>
            <button
              aria-label={nextButtonLabel ?? `Próximo filme em ${title}`}
              className="carousel-button"
              onClick={() => scrollRail("next")}
              title={nextButtonLabel ?? `Próximo filme em ${title}`}
              type="button"
            >
              <span aria-hidden="true">{">"}</span>
            </button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="movie-carousel-loading" role="status">
          <span>{loadingLabel}</span>
          <ul aria-hidden="true" className="movie-carousel" role="list">
            {Array.from({ length: skeletonCount }, (_, index) => (
              <li className="movie-carousel__item" key={index}>
                <div className="movie-card movie-card--skeleton">
                  <div className="movie-card__poster movie-card__poster--skeleton" />
                  <div className="movie-card__body">
                    <span className="skeleton-line skeleton-line--title" />
                    <span className="skeleton-line" />
                    <span className="skeleton-line skeleton-line--short" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!isLoading && movies.length === 0 ? (
        <StateMessage title={emptyTitle}>{emptyDescription}</StateMessage>
      ) : null}

      {!isLoading && movies.length > 0 ? (
        <ul
          aria-label={`${title}: carrossel de filmes`}
          className="movie-carousel"
          onKeyDown={handleCarouselKeyDown}
          ref={railRef}
          role="list"
        >
          {movies.map((movie) => (
            <li className="movie-carousel__item" key={movie.id}>
              <MovieCard movie={movie} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function handleCarouselKeyDown(event: KeyboardEvent<HTMLUListElement>) {
  if (
    event.key !== "ArrowLeft" &&
    event.key !== "ArrowRight" &&
    event.key !== "Home" &&
    event.key !== "End"
  ) {
    return;
  }

  const cards = Array.from(
    event.currentTarget.querySelectorAll<HTMLAnchorElement>(".movie-card__link")
  );

  if (cards.length === 0) {
    return;
  }

  const activeElement = document.activeElement;
  const activeIndex = cards.findIndex((card) => card === activeElement);
  let nextIndex = activeIndex >= 0 ? activeIndex : 0;

  if (event.key === "ArrowRight") {
    nextIndex = Math.min(nextIndex + 1, cards.length - 1);
  }

  if (event.key === "ArrowLeft") {
    nextIndex = Math.max(nextIndex - 1, 0);
  }

  if (event.key === "Home") {
    nextIndex = 0;
  }

  if (event.key === "End") {
    nextIndex = cards.length - 1;
  }

  event.preventDefault();
  cards[nextIndex].focus();
  cards[nextIndex].scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "nearest",
  });
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
