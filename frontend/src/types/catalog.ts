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
  translations?: CatalogGenreTranslations;
};

export type CatalogTranslationLocale =
  | "pt-BR"
  | "en-US"
  | "es-ES"
  | "fr-FR"
  | "de-DE"
  | "it-IT"
  | "zh-CN"
  | "ja-JP";

export type CatalogGenreTranslations = Partial<
  Record<CatalogTranslationLocale, { name?: string }>
>;

export type CatalogMovieTranslations = Partial<
  Record<CatalogTranslationLocale, { synopsis?: string; title?: string }>
>;

export type CatalogRoomTranslations = Partial<
  Record<
    CatalogTranslationLocale,
    { description?: string; display_name?: string }
  >
>;

export type CatalogMovieAgeRating = "" | "L" | "10" | "12" | "14" | "16" | "18";

export type CatalogMovie = {
  age_rating?: CatalogMovieAgeRating | null;
  average_rating?: number | null;
  cast?: string[] | null;
  classification_description?: string | null;
  director?: string | null;
  duration_minutes: number;
  genres: CatalogGenre[];
  id: string;
  is_featured: boolean;
  poster_url: string;
  spotlight_url?: string | null;
  trailer_url?: string | null;
  release_date?: string | null;
  review_count?: number;
  status: MovieStatus;
  title: string;
  translations?: CatalogMovieTranslations;
};

export type CatalogMovieDetail = CatalogMovie & {
  created_at?: string;
  synopsis: string;
  updated_at?: string;
};

export type MovieReviewUser = {
  id: string;
  username: string;
  email: string;
};

export type MovieReviewVoteValue = "like" | "dislike";

export type MovieReview = {
  id: string;
  user: MovieReviewUser;
  rating: string;
  comment: string;
  like_count: number;
  dislike_count: number;
  user_vote: MovieReviewVoteValue | null;
  created_at: string;
  updated_at: string;
};

export type MovieReviewsPage = {
  count: number;
  next: string | null;
  previous: string | null;
  results: MovieReview[];
  my_review?: MovieReview | null;
};

export type CatalogRoomSummary = {
  accessible_row_index?: number | null;
  base_price?: string;
  capacity: number;
  max_center_seats_per_row?: number | null;
  description?: string | null;
  display_name?: string | null;
  experience_type?: CatalogRoomExperienceType | null;
  id: string;
  name: string;
  translations?: CatalogRoomTranslations;
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

export type AdminRoom = CatalogRoomSummary & {
  accessible_row_index?: number;
  created_at?: string;
  updated_at?: string;
};

export type RoomTypePricing = {
  id: number;
  experience_type: CatalogRoomExperienceType;
  base_price: string;
  updated_at: string;
};

export type AdminSession = CatalogSession & {
  seat_count?: number;
  has_reservations?: boolean;
  has_purchases?: boolean;
};

export type AdminSeatRow = {
  id: string;
  is_accessible_row: boolean;
  name: string;
  room: string;
};

export type AdminSeat = {
  companion_seat: string | null;
  id: string;
  is_accessible: boolean;
  number: number;
  row: string;
};

export type MovieInterestStatus = {
  count: number;
  user_interested: boolean | null;
};
