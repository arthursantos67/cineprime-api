import type {
  AdminRoom,
  AdminSeat,
  AdminSeatRow,
  AdminSession,
  CatalogAudioFormat,
  CatalogGenre,
  CatalogMovieAgeRating,
  CatalogMovieDetail,
  CatalogMovieTranslations,
  CatalogProjectionFormat,
  CatalogRoomExperienceType,
  CatalogRoomTranslations,
  CatalogSessionType,
  MovieStatus,
  RoomTypePricing,
} from "@/types/catalog";

import {
  apiRequest,
  isPaginatedResponse,
  type PaginatedResponse,
} from "./client";

export type AdminSummary = {
  movieCount: number;
  nowShowingCount: number;
  roomCount: number;
  sessionsTodayCount: number;
};

export type AdminMovieWritePayload = {
  age_rating?: CatalogMovieAgeRating;
  cast?: string[];
  classification_description?: string;
  director?: string;
  duration_minutes: number;
  genres: string[];
  is_featured?: boolean;
  poster_url: string;
  spotlight_url?: string | null;
  ticket_image_url?: string | null;
  trailer_url?: string | null;
  release_date: string;
  status: MovieStatus;
  synopsis: string;
  title: string;
  translations?: CatalogMovieTranslations;
};

export type AdminGenreWritePayload = {
  name: string;
  source_language?: string;
};

export type AdminRoomWritePayload = {
  accessible_row_index?: number;
  capacity: number;
  max_center_seats_per_row?: number | null;
  description?: string;
  display_name?: string;
  experience_type?: CatalogRoomExperienceType;
  name: string;
  source_language?: string;
  translations?: CatalogRoomTranslations;
};

export type AdminAccessibleRowWritePayload = {
  room: string;
  name: string;
  accessible_seat_count: number;
};

export type AdminBulkLayoutRowSeat = {
  number: number;
};

export type AdminBulkLayoutRow = {
  name: string;
  seats: AdminBulkLayoutRowSeat[];
};

export type AdminBulkLayoutPayload = {
  room: string;
  rows: AdminBulkLayoutRow[];
};

export type AdminBulkLayoutCreatedRow = AdminSeatRow & {
  seats: AdminSeat[];
};

export type RoomTypePricingWritePayload = {
  base_price: string;
};

export type AdminSeatRowWritePayload = {
  name: string;
  room: string;
};

export type AdminSeatWritePayload = {
  companion_seat?: string | null;
  is_accessible?: boolean;
  number: number;
  row: string;
};

export type AdminSessionWritePayload = {
  audio_format?: CatalogAudioFormat;
  end_time: string;
  extra_dates?: string[];
  movie: string;
  projection_format?: CatalogProjectionFormat;
  room: string;
  session_type?: CatalogSessionType;
  start_time: string;
};

export type ListSessionsParams = {
  date?: string;
  movie?: string;
  page?: number;
  room?: string;
};

export type AdminGenre = CatalogGenre & {
  created_at?: string;
  updated_at?: string;
};

export type AdminUser = {
  id: string;
  email: string;
  username: string;
  is_staff: boolean;
  is_protected: boolean;
  role: "user" | "staff" | "master";
  created_at: string;
};

export type AdminPermissionLogEntry = {
  actor: string;
  target: string;
  action: "granted" | "revoked";
  role?: "staff" | "master" | null;
  created_at: string;
};

const USERS_PATH = "/api/v1/users/";
const MOVIES_PATH = "/api/v1/catalog/movies/";
const GENRES_PATH = "/api/v1/catalog/genres/";
const ROOMS_PATH = "/api/v1/catalog/rooms/";
const ROOM_TYPE_PRICING_PATH = "/api/v1/catalog/room-type-pricing/";
const SESSIONS_PATH = "/api/v1/catalog/sessions/";
const SEAT_ROWS_PATH = "/api/v1/reservation/seat-rows/";
const SEATS_PATH = "/api/v1/reservation/seats/";

export const adminApi = {
  async listUsers(params: { page?: number; role?: "staff" | "master" | "user"; search?: string } = {}) {
    const query = buildQueryString(params);
    const response = await apiRequest<unknown>(
      query ? `${USERS_PATH}?${query}` : USERS_PATH,
      { auth: "required", method: "GET" }
    );

    if (!isPaginatedResponse<AdminUser>(response)) {
      throw new Error("Unexpected admin user list response.");
    }

    return response satisfies PaginatedResponse<AdminUser>;
  },

  async grantAdmin(userId: string, role: "staff" | "master") {
    const response = await apiRequest<unknown>(
      `${USERS_PATH}${userId}/admin/`,
      { auth: "required", method: "POST", json: { role } }
    );

    if (!isAdminUser(response)) {
      throw new Error("Unexpected admin grant response.");
    }

    return response satisfies AdminUser;
  },

  async revokeAdmin(userId: string) {
    const response = await apiRequest<unknown>(
      `${USERS_PATH}${userId}/admin/`,
      { auth: "required", method: "DELETE" }
    );

    if (!isAdminUser(response)) {
      throw new Error("Unexpected admin revoke response.");
    }

    return response satisfies AdminUser;
  },

  async getUserPermissionLogs(userId: string) {
    const response = await apiRequest<unknown>(
      `${USERS_PATH}${userId}/admin/logs/`,
      { auth: "required", method: "GET" }
    );

    if (!Array.isArray(response) || !response.every(isAdminPermissionLogEntry)) {
      throw new Error("Unexpected admin permission logs response.");
    }

    return response satisfies AdminPermissionLogEntry[];
  },

  async deleteUser(userId: string, options: { confirm?: boolean; password?: string } = {}): Promise<void> {
    const url = options.confirm
      ? `${USERS_PATH}${userId}/?confirm=true`
      : `${USERS_PATH}${userId}/`;
    await apiRequest<void>(url, { auth: "required", method: "DELETE", json: { password: options.password ?? "" } });
  },

  async deleteSelfAccount(options: { confirm?: boolean; password?: string; transfer_to?: string } = {}): Promise<void> {
    const url = options.confirm ? `${USERS_PATH}me/?confirm=true` : `${USERS_PATH}me/`;
    const body: Record<string, string> = { password: options.password ?? "" };
    if (options.transfer_to) body.transfer_to = options.transfer_to;
    await apiRequest<void>(url, { auth: "required", method: "DELETE", json: body });
  },

  async getSummary(): Promise<AdminSummary> {
    const today = new Date().toISOString().split("T")[0];

    const [allMovies, nowShowing, rooms, sessionsToday] = await Promise.all([
      apiRequest<PaginatedResponse<{ id: string }>>("/api/v1/catalog/movies/?page_size=1", {
        auth: "required",
      }),
      apiRequest<PaginatedResponse<{ id: string }>>(
        "/api/v1/catalog/movies/?status=em_cartaz&page_size=1",
        { auth: "required" }
      ),
      apiRequest<PaginatedResponse<{ id: string }>>(
        "/api/v1/catalog/rooms/?page_size=1",
        { auth: "required" }
      ),
      apiRequest<PaginatedResponse<{ id: string }>>(
        `/api/v1/catalog/sessions/?date=${today}&page_size=1`,
        { auth: "required" }
      ),
    ]);

    return {
      movieCount: allMovies.count,
      nowShowingCount: nowShowing.count,
      roomCount: rooms.count,
      sessionsTodayCount: sessionsToday.count,
    };
  },

  async listMovies(params: { page?: number; search?: string; status?: MovieStatus } = {}) {
    const response = await apiRequest<unknown>(buildMoviesPath(params), {
      auth: "required",
      method: "GET",
    });

    if (!isPaginatedResponse<CatalogMovieDetail>(response)) {
      throw new Error("Unexpected admin movie list response.");
    }

    return response satisfies PaginatedResponse<CatalogMovieDetail>;
  },

  async getMovie(movieId: string) {
    const response = await apiRequest<unknown>(`${MOVIES_PATH}${movieId}/`, {
      auth: "required",
      method: "GET",
    });

    if (!isAdminMovieDetail(response)) {
      throw new Error("Unexpected admin movie detail response.");
    }

    return response satisfies CatalogMovieDetail;
  },

  async createMovie(payload: AdminMovieWritePayload) {
    const response = await apiRequest<unknown>(MOVIES_PATH, {
      auth: "required",
      json: payload,
      method: "POST",
    });

    if (!isAdminMovieDetail(response)) {
      throw new Error("Unexpected admin create movie response.");
    }

    return response satisfies CatalogMovieDetail;
  },

  async updateMovie(movieId: string, payload: Partial<AdminMovieWritePayload>) {
    const response = await apiRequest<unknown>(`${MOVIES_PATH}${movieId}/`, {
      auth: "required",
      json: payload,
      method: "PATCH",
    });

    if (!isAdminMovieDetail(response)) {
      throw new Error("Unexpected admin update movie response.");
    }

    return response satisfies CatalogMovieDetail;
  },

  async deleteMovie(movieId: string) {
    await apiRequest<unknown>(`${MOVIES_PATH}${movieId}/`, {
      auth: "required",
      method: "DELETE",
    });
  },

  async listGenres(params: { page?: number; search?: string } = {}) {
    const searchParams = new URLSearchParams();
    if (params.page !== undefined) searchParams.set("page", String(params.page));
    if (params.search) searchParams.set("search", params.search);
    const query = searchParams.toString();
    const response = await apiRequest<unknown>(query ? `${GENRES_PATH}?${query}` : GENRES_PATH, {
      auth: "required",
      method: "GET",
    });

    if (!isPaginatedResponse<AdminGenre>(response)) {
      throw new Error("Unexpected admin genre list response.");
    }

    return response satisfies PaginatedResponse<AdminGenre>;
  },

  async createGenre(payload: AdminGenreWritePayload) {
    const response = await apiRequest<unknown>(GENRES_PATH, {
      auth: "required",
      json: payload,
      method: "POST",
    });

    if (!isAdminGenre(response)) {
      throw new Error("Unexpected admin create genre response.");
    }

    return response satisfies AdminGenre;
  },

  async updateGenre(genreId: string, payload: AdminGenreWritePayload) {
    const response = await apiRequest<unknown>(`${GENRES_PATH}${genreId}/`, {
      auth: "required",
      json: payload,
      method: "PATCH",
    });

    if (!isAdminGenre(response)) {
      throw new Error("Unexpected admin update genre response.");
    }

    return response satisfies AdminGenre;
  },

  async deleteGenre(genreId: string) {
    await apiRequest<unknown>(`${GENRES_PATH}${genreId}/`, {
      auth: "required",
      method: "DELETE",
    });
  },

  async listRooms(params: { page?: number; search?: string } = {}) {
    const query = buildQueryString(params);
    const response = await apiRequest<unknown>(
      query ? `${ROOMS_PATH}?${query}` : ROOMS_PATH,
      { auth: "required", method: "GET" }
    );

    if (!isPaginatedResponse<AdminRoom>(response)) {
      throw new Error("Unexpected admin room list response.");
    }

    return response satisfies PaginatedResponse<AdminRoom>;
  },

  async getRoom(roomId: string) {
    const response = await apiRequest<unknown>(`${ROOMS_PATH}${roomId}/`, {
      auth: "required",
      method: "GET",
    });

    if (!isAdminRoom(response)) {
      throw new Error("Unexpected admin room detail response.");
    }

    return response satisfies AdminRoom;
  },

  async createRoom(payload: AdminRoomWritePayload) {
    const response = await apiRequest<unknown>(ROOMS_PATH, {
      auth: "required",
      json: payload,
      method: "POST",
    });

    if (!isAdminRoom(response)) {
      throw new Error("Unexpected admin create room response.");
    }

    return response satisfies AdminRoom;
  },

  async updateRoom(roomId: string, payload: Partial<AdminRoomWritePayload>) {
    const response = await apiRequest<unknown>(`${ROOMS_PATH}${roomId}/`, {
      auth: "required",
      json: payload,
      method: "PATCH",
    });

    if (!isAdminRoom(response)) {
      throw new Error("Unexpected admin update room response.");
    }

    return response satisfies AdminRoom;
  },

  async deleteRoom(roomId: string) {
    await apiRequest<unknown>(`${ROOMS_PATH}${roomId}/`, {
      auth: "required",
      method: "DELETE",
    });
  },

  async listRoomTypePricing(): Promise<RoomTypePricing[]> {
    const response = await apiRequest<unknown>(ROOM_TYPE_PRICING_PATH, {
      auth: "required",
      method: "GET",
    });

    if (!Array.isArray(response) || !response.every(isRoomTypePricing)) {
      throw new Error("Unexpected room type pricing list response.");
    }

    return response satisfies RoomTypePricing[];
  },

  async updateRoomTypePricing(
    id: number,
    payload: RoomTypePricingWritePayload
  ): Promise<RoomTypePricing> {
    const response = await apiRequest<unknown>(
      `${ROOM_TYPE_PRICING_PATH}${id}/`,
      {
        auth: "required",
        json: payload,
        method: "PATCH",
      }
    );

    if (!isRoomTypePricing(response)) {
      throw new Error("Unexpected room type pricing update response.");
    }

    return response satisfies RoomTypePricing;
  },

  async listAllMovies(): Promise<CatalogMovieDetail[]> {
    return fetchAllPages<CatalogMovieDetail>(MOVIES_PATH);
  },

  async listAllRooms(): Promise<AdminRoom[]> {
    return fetchAllPages<AdminRoom>(ROOMS_PATH);
  },

  async listAllSeatRows(roomId: string): Promise<AdminSeatRow[]> {
    const rows = await fetchAllPages<AdminSeatRow>(`${SEAT_ROWS_PATH}?room=${roomId}`, isAdminSeatRow);
    return rows.filter((row) => row.room === roomId);
  },

  async createSeatRow(payload: AdminSeatRowWritePayload) {
    const response = await apiRequest<unknown>(SEAT_ROWS_PATH, {
      auth: "required",
      json: payload,
      method: "POST",
    });

    if (!isAdminSeatRow(response)) {
      throw new Error("Unexpected admin create seat row response.");
    }

    return response satisfies AdminSeatRow;
  },

  async deleteSeatRow(seatRowId: string) {
    await apiRequest<unknown>(`${SEAT_ROWS_PATH}${seatRowId}/`, {
      auth: "required",
      method: "DELETE",
    });
  },

  async updateSeatRow(seatRowId: string, payload: Partial<AdminSeatRowWritePayload>) {
    const response = await apiRequest<unknown>(`${SEAT_ROWS_PATH}${seatRowId}/`, {
      auth: "required",
      json: payload,
      method: "PATCH",
    });

    if (!isAdminSeatRow(response)) {
      throw new Error("Unexpected admin update seat row response.");
    }

    return response satisfies AdminSeatRow;
  },

  async listAllSeats(roomId?: string): Promise<AdminSeat[]> {
    const path = roomId ? `${SEATS_PATH}?room=${roomId}` : SEATS_PATH;
    return fetchAllPages<AdminSeat>(path, isAdminSeat);
  },

  async createSeat(payload: AdminSeatWritePayload) {
    const response = await apiRequest<unknown>(SEATS_PATH, {
      auth: "required",
      json: payload,
      method: "POST",
    });

    if (!isAdminSeat(response)) {
      throw new Error("Unexpected admin create seat response.");
    }

    return response satisfies AdminSeat;
  },

  async updateSeat(seatId: string, payload: Partial<AdminSeatWritePayload>) {
    const response = await apiRequest<unknown>(`${SEATS_PATH}${seatId}/`, {
      auth: "required",
      json: payload,
      method: "PATCH",
    });

    if (!isAdminSeat(response)) {
      throw new Error("Unexpected admin update seat response.");
    }

    return response satisfies AdminSeat;
  },

  async deleteSeat(seatId: string) {
    await apiRequest<unknown>(`${SEATS_PATH}${seatId}/`, {
      auth: "required",
      method: "DELETE",
    });
  },

  async bulkCreateLayout(payload: AdminBulkLayoutPayload): Promise<AdminBulkLayoutCreatedRow[]> {
    const response = await apiRequest<unknown[]>("/api/v1/reservation/bulk-create-layout/", {
      auth: "required",
      json: payload,
      method: "POST",
    });
    return response as AdminBulkLayoutCreatedRow[];
  },

  async createAccessibleRow(
    payload: AdminAccessibleRowWritePayload
  ): Promise<AdminBulkLayoutCreatedRow> {
    const response = await apiRequest<unknown>("/api/v1/reservation/accessible-row/", {
      auth: "required",
      json: payload,
      method: "POST",
    });
    return response as AdminBulkLayoutCreatedRow;
  },

  async listSessions(params: ListSessionsParams = {}) {
    const query = buildSessionsQuery(params);
    const response = await apiRequest<unknown>(
      query ? `${SESSIONS_PATH}?${query}` : SESSIONS_PATH,
      { auth: "required", method: "GET" }
    );

    if (!isPaginatedResponse<AdminSession>(response)) {
      throw new Error("Unexpected admin session list response.");
    }

    return response satisfies PaginatedResponse<AdminSession>;
  },

  async getSession(sessionId: string) {
    const response = await apiRequest<unknown>(`${SESSIONS_PATH}${sessionId}/`, {
      auth: "required",
      method: "GET",
    });

    if (!isAdminSession(response)) {
      throw new Error("Unexpected admin session detail response.");
    }

    return response satisfies AdminSession;
  },

  async createSession(payload: AdminSessionWritePayload) {
    const response = await apiRequest<unknown>(SESSIONS_PATH, {
      auth: "required",
      json: payload,
      method: "POST",
    });

    if (Array.isArray(response)) {
      if (!isAdminSessionArray(response)) {
        throw new Error("Unexpected admin create session response.");
      }
      return response;
    }

    if (!isAdminSession(response)) {
      throw new Error("Unexpected admin create session response.");
    }

    return response satisfies AdminSession;
  },

  async updateSession(sessionId: string, payload: Partial<AdminSessionWritePayload>) {
    const response = await apiRequest<unknown>(`${SESSIONS_PATH}${sessionId}/`, {
      auth: "required",
      json: payload,
      method: "PATCH",
    });

    if (!isAdminSession(response)) {
      throw new Error("Unexpected admin update session response.");
    }

    return response satisfies AdminSession;
  },

  async deleteSession(sessionId: string) {
    await apiRequest<unknown>(`${SESSIONS_PATH}${sessionId}/`, {
      auth: "required",
      method: "DELETE",
    });
  },

  async getTmdbTokenStatus(
    options: { signal?: AbortSignal } = {},
  ): Promise<{ configured: boolean; hint: string | null }> {
    const response = await apiRequest<unknown>("/api/v1/users/config/tmdb-token/", {
      auth: "required",
      method: "GET",
      signal: options.signal,
    });
    if (
      typeof response !== "object" ||
      response === null ||
      !("configured" in response) ||
      typeof (response as Record<string, unknown>).configured !== "boolean"
    ) {
      throw new Error("Unexpected response shape from tmdb-token endpoint");
    }
    const r = response as { configured: boolean; hint: string | null };
    return { configured: r.configured, hint: r.hint ?? null };
  },

  async setTmdbToken(value: string): Promise<void> {
    await apiRequest<unknown>("/api/v1/users/config/tmdb-token/", {
      auth: "required",
      json: { value },
      method: "PUT",
    });
  },
};

function buildMoviesPath({
  page,
  search,
  status,
}: {
  page?: number;
  search?: string;
  status?: MovieStatus;
}) {
  const searchParams = new URLSearchParams();

  if (status) {
    searchParams.set("status", status);
  }

  if (search) {
    searchParams.set("search", search);
  }

  if (page !== undefined) {
    searchParams.set("page", String(page));
  }

  const query = searchParams.toString();
  return query ? `${MOVIES_PATH}?${query}` : MOVIES_PATH;
}

function buildQueryString(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  return searchParams.toString();
}

async function fetchAllPages<T>(
  path: string,
  filter?: (item: unknown) => item is T
): Promise<T[]> {
  const first = await apiRequest<PaginatedResponse<unknown>>(path, {
    auth: "required",
    method: "GET",
  });

  const allItems: T[] = [];

  function collectFiltered(items: unknown[]) {
    for (const item of items) {
      if (!filter || filter(item)) {
        allItems.push(item as T);
      }
    }
  }

  collectFiltered(first.results);

  let nextUrl: string | null = first.next;

  while (nextUrl) {
    const page = await apiRequest<PaginatedResponse<unknown>>(nextUrl, {
      auth: "required",
      method: "GET",
    });

    collectFiltered(page.results);
    nextUrl = page.next;
  }

  return allItems;
}

function isAdminRoom(value: unknown): value is AdminRoom {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.capacity === "number"
  );
}

function isRoomTypePricing(value: unknown): value is RoomTypePricing {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.experience_type === "string" &&
    typeof value.base_price === "string" &&
    typeof value.updated_at === "string"
  );
}

function isAdminSeatRow(value: unknown): value is AdminSeatRow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.room === "string"
  );
}

function isAdminSeat(value: unknown): value is AdminSeat {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.row === "string" &&
    typeof value.number === "number" &&
    typeof value.is_accessible === "boolean" &&
    (value.companion_seat === null || typeof value.companion_seat === "string")
  );
}

function isAdminMovieDetail(value: unknown): value is CatalogMovieDetail {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.genres) &&
    typeof value.duration_minutes === "number" &&
    typeof value.poster_url === "string" &&
    isMovieStatus(value.status) &&
    typeof value.is_featured === "boolean" &&
    typeof value.synopsis === "string"
  );
}

function isAdminGenre(value: unknown): value is AdminGenre {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isMovieStatus(value: unknown): value is MovieStatus {
  return value === "em_cartaz" || value === "pre_venda" || value === "em_breve";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAdminSession(value: unknown): value is AdminSession {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.start_time === "string" &&
    typeof value.end_time === "string" &&
    typeof value.base_price === "string" &&
    isRecord(value.movie) &&
    typeof value.movie.id === "string" &&
    isRecord(value.room) &&
    typeof value.room.id === "string"
  );
}

function isAdminSessionArray(value: unknown): value is AdminSession[] {
  return Array.isArray(value) && value.every((item) => isAdminSession(item));
}

function buildSessionsQuery({ date, movie, page, room }: ListSessionsParams) {
  const searchParams = new URLSearchParams();

  if (date) searchParams.set("date", date);
  if (movie) searchParams.set("movie", movie);
  if (room) searchParams.set("room", room);
  if (page !== undefined) searchParams.set("page", String(page));

  return searchParams.toString();
}

function isAdminUser(value: unknown): value is AdminUser {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.username === "string" &&
    typeof value.is_staff === "boolean" &&
    typeof value.is_protected === "boolean" &&
    (value.role === "user" || value.role === "staff" || value.role === "master") &&
    typeof value.created_at === "string"
  );
}

function isAdminPermissionLogEntry(value: unknown): value is AdminPermissionLogEntry {
  return (
    isRecord(value) &&
    typeof value.actor === "string" &&
    typeof value.target === "string" &&
    (value.action === "granted" || value.action === "revoked") &&
    (value.role === "staff" || value.role === "master" || value.role === null || value.role === undefined) &&
    typeof value.created_at === "string"
  );
}
