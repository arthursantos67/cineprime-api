import type {
  CatalogAudioFormat,
  CatalogProjectionFormat,
  CatalogRoomExperienceType,
  CatalogRoomSummary,
  CatalogSession,
  CatalogSessionType,
} from "@/types/catalog";
import { formatCurrency, ptBrLocale } from "@/utils/formatters";

export const sessionTimeZone = "America/Fortaleza";

export type SessionDateOption = {
  label: string;
  value: string;
  weekday: string;
};

export type SessionRoomGroup = {
  roomId: string;
  roomName: string;
  sessions: CatalogSession[];
};

export type SessionBadge = {
  label: string;
};

const roomExperienceLabels: Record<
  Exclude<CatalogRoomExperienceType, "">,
  string
> = {
  imax: "IMAX",
  premium: "Premium",
  standard: "Tradicional",
  vip: "VIP",
};

const audioFormatLabels: Record<Exclude<CatalogAudioFormat, "">, string> = {
  dublado: "Dublado",
  legendado: "Legendado",
  original: "Original",
};

const projectionFormatLabels: Record<
  Exclude<CatalogProjectionFormat, "">,
  string
> = {
  "2d": "2D",
  "3d": "3D",
  imax: "IMAX",
};

const sessionTypeLabels: Record<Exclude<CatalogSessionType, "">, string> = {
  preview: "Pré-estreia",
  regular: "Regular",
  special_event: "Evento",
};

export function buildSessionDateOptions(
  startDate: Date,
  dayCount = 7
): SessionDateOption[] {
  const startDateValue = formatDateForSessionQuery(startDate);

  return Array.from({ length: dayCount }, (_, offset) => {
    const value = addDaysToDateValue(startDateValue, offset);

    return {
      label: formatSessionDateLabel(value),
      value,
      weekday: formatSessionWeekday(value),
    };
  });
}

export function formatDateForSessionQuery(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: sessionTimeZone,
    year: "numeric",
  }).formatToParts(date);

  return `${getDatePart(parts, "year")}-${getDatePart(parts, "month")}-${getDatePart(parts, "day")}`;
}

export function formatSessionDateLabel(dateValue: string) {
  return new Intl.DateTimeFormat(ptBrLocale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(parseSessionDateValue(dateValue));
}

export function formatSessionFullDate(dateValue: string) {
  return new Intl.DateTimeFormat(ptBrLocale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(parseSessionDateValue(dateValue));
}

export function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat(ptBrLocale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: sessionTimeZone,
  }).format(new Date(value));
}

export function formatSessionPrice(value: string) {
  return formatCurrency(Number(value));
}

export function getRoomDisplayName(room: CatalogRoomSummary) {
  return room.display_name?.trim() || room.name;
}

export function getSessionBadges(session: CatalogSession): SessionBadge[] {
  const labels = [
    getMetadataLabel(session.room.experience_type, roomExperienceLabels),
    getMetadataLabel(session.projection_format, projectionFormatLabels),
    getMetadataLabel(session.audio_format, audioFormatLabels),
    getMetadataLabel(session.session_type, sessionTypeLabels),
  ];
  const uniqueLabels = labels.filter(
    (label, index): label is string =>
      Boolean(label) && labels.indexOf(label) === index
  );

  return uniqueLabels.map((label) => ({ label }));
}

export function getSessionSeatsHref(sessionId: string) {
  return `/sessions/${sessionId}/seats`;
}

export function groupSessionsByRoom(
  sessions: CatalogSession[]
): SessionRoomGroup[] {
  const groups = new Map<string, SessionRoomGroup>();

  for (const session of [...sessions].sort(compareSessionsByRoomAndTime)) {
    const roomId = session.room.id;
    const group = groups.get(roomId);

    if (group) {
      group.sessions.push(session);
      continue;
    }

    groups.set(roomId, {
      roomId,
      roomName: getRoomDisplayName(session.room),
      sessions: [session],
    });
  }

  return Array.from(groups.values());
}

function compareSessionsByRoomAndTime(
  first: CatalogSession,
  second: CatalogSession
) {
  const roomComparison = getRoomDisplayName(first.room).localeCompare(
    getRoomDisplayName(second.room),
    ptBrLocale
  );

  if (roomComparison !== 0) {
    return roomComparison;
  }

  return (
    new Date(first.start_time).getTime() - new Date(second.start_time).getTime()
  );
}

function addDaysToDateValue(dateValue: string, days: number) {
  const [year, month, day] = parseDateParts(dateValue);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function formatSessionWeekday(dateValue: string) {
  const weekday = new Intl.DateTimeFormat(ptBrLocale, {
    timeZone: "UTC",
    weekday: "short",
  }).format(parseSessionDateValue(dateValue));

  return weekday.replace(".", "");
}

function getDatePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function parseSessionDateValue(dateValue: string) {
  const [year, month, day] = parseDateParts(dateValue);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function parseDateParts(dateValue: string) {
  return dateValue.split("-").map(Number) as [number, number, number];
}

function getMetadataLabel<T extends string>(
  value: T | null | undefined,
  labels: Partial<Record<Exclude<T, "">, string>>
) {
  if (!value) {
    return null;
  }

  return labels[value as Exclude<T, "">] ?? null;
}
