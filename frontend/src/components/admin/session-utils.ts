import { ApiError } from "@/api/client";
import type { AdminSessionWritePayload } from "@/api/admin";

export type FieldErrors = Partial<
  Record<keyof AdminSessionWritePayload | "non_field_errors", string>
>;

const WEEKEND_DAYS = new Set([0, 5, 6]); // Sun, Fri, Sat

export function getSessionPriceMultiplier(date: string, time: string): number {
  const day = new Date(`${date}T${time}`).getDay();
  return WEEKEND_DAYS.has(day) ? 1.24 : 1.0;
}

function flattenErrorMessage(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(flattenErrorMessage).join(" ");
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(flattenErrorMessage)
      .join(" ");
  }
  return String(value);
}

export function extractSessionFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_FAILED") {
    return {};
  }

  const details = error.details as Record<string, unknown> | null;
  if (!details || typeof details !== "object") {
    return {};
  }

  const result: FieldErrors = {};

  for (const [key, val] of Object.entries(details)) {
    if (key === "extra_dates" && val && typeof val === "object" && !Array.isArray(val)) {
      result.extra_dates = Object.entries(val as Record<string, unknown>)
        .map(([date, dateErrors]) => `${date}: ${flattenErrorMessage(dateErrors)}`)
        .join(" ");
      continue;
    }
    const messages = Array.isArray(val) ? val : [val];
    result[key as keyof FieldErrors] = messages.join(" ");
  }

  return result;
}

export function isConflictError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 409 ||
      (error.status === 400 &&
        typeof error.message === "string" &&
        /overlap|conflict|conflito|horário de sessão/i.test(error.message)))
  );
}

export function splitLocalDateTime(isoString: string): {
  date: string;
  time: string;
} {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function combineLocalDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

export function addMinutesToLocalDateTime(
  date: string,
  time: string,
  minutes: number
): { date: string; time: string } {
  const base = new Date(`${date}T${time}`);
  const result = new Date(base.getTime() + minutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${result.getFullYear()}-${pad(result.getMonth() + 1)}-${pad(result.getDate())}`,
    time: `${pad(result.getHours())}:${pad(result.getMinutes())}`,
  };
}
