"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

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
  const [canScroll, setCanScroll] = useState(movies.length > 1);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const uid = useId();
  const headingId = `movie-carousel-${uid}`;

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const check = () => setCanScroll(rail.scrollWidth > rail.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(rail);
    return () => ro.disconnect();
  }, [movies.length]);

  function scrollRail(direction: "next" | "previous") {
    const rail = railRef.current;
    if (!rail) return;

    const { scrollLeft, clientWidth, scrollWidth } = rail;
    const maxScroll = scrollWidth - clientWidth;
    const scrollDistance = Math.max(clientWidth * 0.85, 220);

    if (direction === "next") {
      rail.scrollTo({
        behavior: "smooth",
        left: scrollLeft + 10 >= maxScroll ? 0 : scrollLeft + scrollDistance,
      });
    } else {
      rail.scrollTo({
        behavior: "smooth",
        left: scrollLeft <= 10 ? maxScroll : scrollLeft - scrollDistance,
      });
    }
  }

  function handleMouseDown(e: MouseEvent<HTMLUListElement>) {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStartX.current = e.pageX;
    dragScrollLeft.current = railRef.current?.scrollLeft ?? 0;
    const rail = railRef.current;
    if (rail) {
      rail.style.cursor = "grabbing";
      rail.style.userSelect = "none";
    }
  }

  function handleMouseMove(e: MouseEvent<HTMLUListElement>) {
    if (!isDragging.current || !railRef.current) return;
    e.preventDefault();
    railRef.current.scrollLeft =
      dragScrollLeft.current - (e.pageX - dragStartX.current);
  }

  function handleDragEnd() {
    if (!isDragging.current) return;
    isDragging.current = false;
    const rail = railRef.current;
    if (rail) {
      rail.style.cursor = "";
      rail.style.userSelect = "";
    }
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
        <div className="movie-carousel-outer">
          {canScroll ? (
            <button
              aria-label={previousButtonLabel ?? `Filme anterior em ${title}`}
              className="carousel-button carousel-button--side carousel-button--prev"
              onClick={() => scrollRail("previous")}
              title={previousButtonLabel ?? `Filme anterior em ${title}`}
              type="button"
            >
              <span aria-hidden="true">{"<"}</span>
            </button>
          ) : null}
          <ul
            aria-label={`${title}: carrossel de filmes`}
            className="movie-carousel"
            onDragStart={(e) => e.preventDefault()}
            onKeyDown={handleCarouselKeyDown}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleDragEnd}
            onMouseMove={handleMouseMove}
            onMouseUp={handleDragEnd}
            ref={railRef}
            role="list"
          >
            {movies.map((movie) => (
              <li className="movie-carousel__item" key={movie.id}>
                <MovieCard movie={movie} />
              </li>
            ))}
          </ul>
          {canScroll ? (
            <button
              aria-label={nextButtonLabel ?? `Próximo filme em ${title}`}
              className="carousel-button carousel-button--side carousel-button--next"
              onClick={() => scrollRail("next")}
              title={nextButtonLabel ?? `Próximo filme em ${title}`}
              type="button"
            >
              <span aria-hidden="true">{">"}</span>
            </button>
          ) : null}
        </div>
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
