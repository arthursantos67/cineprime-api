export type MovieStatus = "em_cartaz" | "pre_venda";

export type CatalogGenre = {
  id: string;
  name: string;
};

export type CatalogMovie = {
  id: string;
  title: string;
  genres: CatalogGenre[];
  duration_minutes: number;
  release_date?: string | null;
  poster_url: string;
  status: MovieStatus;
  is_featured: boolean;
};

export type CatalogMovieDetail = CatalogMovie & {
  created_at?: string;
  synopsis: string;
  updated_at?: string;
};

export type CatalogRoomSummary = {
  capacity: number;
  id: string;
  name: string;
};

export type CatalogSession = {
  base_price: string;
  created_at?: string;
  end_time: string;
  id: string;
  movie: CatalogMovie;
  room: CatalogRoomSummary;
  start_time: string;
  updated_at?: string;
};
