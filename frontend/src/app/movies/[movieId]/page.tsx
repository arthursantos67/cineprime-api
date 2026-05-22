import { MovieDetail } from "@/components/movies";

type MovieDetailPageProps = {
  params: Promise<{
    movieId: string;
  }>;
};

export default async function MovieDetailPage({ params }: MovieDetailPageProps) {
  const { movieId } = await params;

  return <MovieDetail movieId={movieId} />;
}
