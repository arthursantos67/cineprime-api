import Link from "next/link";

import { ResponsiveImage } from "@/components/ui/ResponsiveImage";
import type { CatalogMovie } from "@/types/catalog";

import {
  formatMovieDuration,
  formatMovieGenres,
  getMovieDetailsHref,
} from "./movie-formatters";

type MovieCardProps = {
  movie: CatalogMovie;
};

export function MovieCard({ movie }: MovieCardProps) {
  const genres = formatMovieGenres(movie.genres);
  const duration = formatMovieDuration(movie.duration_minutes);

  return (
    <article className="movie-card">
      <Link
        aria-label={`Ver detalhes de ${movie.title}`}
        className="movie-card__link"
        href={getMovieDetailsHref(movie.id)}
      >
        <ResponsiveImage
          alt={`Poster de ${movie.title}`}
          className="movie-card__poster"
          height={480}
          loading="lazy"
          src={movie.poster_url}
          sizes="(max-width: 820px) 100vw, (max-width: 1200px) 33vw, 220px"
          unoptimized
          width={320}
        />
        <div className="movie-card__body">
          <h2 className="movie-card__title">{movie.title}</h2>
          <p className="movie-card__genres">{genres}</p>
          <p className="movie-card__duration">{duration}</p>
        </div>
      </Link>
    </article>
  );
}
