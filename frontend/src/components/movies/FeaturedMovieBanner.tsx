import Link from "next/link";

import { ResponsiveImage } from "@/components/ui/ResponsiveImage";
import type { CatalogMovie } from "@/types/catalog";

import {
  formatMovieDuration,
  formatMovieGenres,
  getMovieDetailsHref,
} from "./movie-formatters";

type FeaturedMovieBannerProps = {
  movie: CatalogMovie;
  primaryActionLabel?: string;
};

export function FeaturedMovieBanner({
  movie,
  primaryActionLabel = "Ver sessões",
}: FeaturedMovieBannerProps) {
  return (
    <section
      aria-label={`Filme em destaque: ${movie.title}`}
      className="featured-movie"
    >
      <div className="featured-movie__media">
        <ResponsiveImage
          alt={`Poster de ${movie.title}`}
          className="featured-movie__poster"
          height={720}
          priority
          src={movie.poster_url}
          sizes="(max-width: 820px) 100vw, 360px"
          unoptimized
          width={480}
        />
      </div>
      <div className="featured-movie__content">
        <p className="eyebrow">Destaque</p>
        <h2>{movie.title}</h2>
        <p className="featured-movie__meta">
          {formatMovieGenres(movie.genres)} |{" "}
          {formatMovieDuration(movie.duration_minutes)}
        </p>
        <Link
          aria-label={`${primaryActionLabel} de ${movie.title}`}
          className="button button-primary"
          href={getMovieDetailsHref(movie.id)}
        >
          {primaryActionLabel}
        </Link>
      </div>
    </section>
  );
}
