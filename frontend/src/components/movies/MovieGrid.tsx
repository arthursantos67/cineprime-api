import type { CatalogMovie } from "@/types/catalog";

import { StateMessage } from "@/components/ui/StateMessage";

import { MovieCard } from "./MovieCard";

type MovieGridProps = {
  ariaLabel?: string;
  emptyDescription?: string;
  emptyTitle?: string;
  isLoading?: boolean;
  loadingLabel?: string;
  movies: CatalogMovie[];
  skeletonCount?: number;
  title?: string;
};

export function MovieGrid({
  ariaLabel,
  emptyDescription = "Nenhum filme foi encontrado para esta seção.",
  emptyTitle = "Nenhum filme disponível",
  isLoading = false,
  loadingLabel = "Carregando filmes...",
  movies,
  skeletonCount = 6,
  title,
}: MovieGridProps) {
  const headingId = title ? `movie-grid-${slugify(title)}` : undefined;

  return (
    <section
      aria-busy={isLoading || undefined}
      aria-label={headingId ? undefined : (ariaLabel ?? "Lista de filmes")}
      aria-labelledby={headingId}
      className="movie-grid-section"
    >
      {title ? (
        <div className="movie-grid-section__header">
          <h2 id={headingId}>{title}</h2>
        </div>
      ) : null}

      {isLoading ? (
        <div className="movie-grid-loading" role="status">
          <span>{loadingLabel}</span>
          <ul aria-hidden="true" className="movie-grid" role="list">
            {Array.from({ length: skeletonCount }, (_, index) => (
              <li className="movie-grid__item" key={index}>
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
        <ul className="movie-grid" role="list">
          {movies.map((movie) => (
            <li className="movie-grid__item" key={movie.id}>
              <MovieCard movie={movie} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
