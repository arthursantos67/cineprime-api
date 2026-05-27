export type MovieStatus = "em_cartaz" | "pre_venda" | "em_breve";

export type CatalogRoomExperienceType =
  | ""
  | "standard"
  | "vip"
  | "premium"
  | "imax";

export type CatalogAudioFormat = "" | "original" | "legendado" | "dublado";

export type CatalogProjectionFormat = "" | "2d" | "3d" | "imax";

export type CatalogSessionType = "" | "regular" | "preview" | "special_event";

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
  description?: string | null;
  display_name?: string | null;
  experience_type?: CatalogRoomExperienceType | null;
  id: string;
  name: string;
};

export type CatalogSession = {
  audio_format?: CatalogAudioFormat | null;
  base_price: string;
  created_at?: string;
  end_time: string;
  id: string;
  movie: CatalogMovie;
  projection_format?: CatalogProjectionFormat | null;
  room: CatalogRoomSummary;
  session_type?: CatalogSessionType | null;
  start_time: string;
  updated_at?: string;
};
