"use client";

import React from "react";
import { useState } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { useI18n } from "@/i18n";

export type CalendarDay = {
  day: number;
  iso: string;
} | null;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function buildCalendarWeeks(
  year: number,
  monthIndex: number
): CalendarDay[][] {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: CalendarDay[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => ({
      day: index + 1,
      iso: toIsoDate(year, monthIndex, index + 1),
    })),
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return weeks;
}

export function toggleDateInList(dates: readonly string[], iso: string) {
  return dates.includes(iso)
    ? dates.filter((date) => date !== iso)
    : [...dates, iso].sort();
}

function getWeekdayLabels(locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "narrow" });

  // 2026-03-01 is a Sunday; weeks in buildCalendarWeeks start on Sunday.
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(2026, 2, 1 + index))
  );
}

type MultiDateCalendarProps = {
  disabled?: boolean;
  disabledDates?: readonly string[];
  initialMonth?: string;
  minDate?: string;
  onToggleDate: (iso: string) => void;
  selectedDates: readonly string[];
};

export function MultiDateCalendar({
  disabled = false,
  disabledDates = [],
  initialMonth,
  minDate,
  onToggleDate,
  selectedDates,
}: MultiDateCalendarProps) {
  const { locale, t } = useI18n();
  const [viewMonth, setViewMonth] = useState(() => {
    const base = initialMonth ?? minDate;
    const parsed = base ? /^(\d{4})-(\d{2})/.exec(base) : null;

    if (parsed) {
      return { monthIndex: Number(parsed[2]) - 1, year: Number(parsed[1]) };
    }

    const today = new Date();
    return { monthIndex: today.getMonth(), year: today.getFullYear() };
  });

  const weeks = buildCalendarWeeks(viewMonth.year, viewMonth.monthIndex);
  const weekdayLabels = getWeekdayLabels(locale);
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(viewMonth.year, viewMonth.monthIndex, 1));
  const dayLabelFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
  });

  function moveMonth(step: number) {
    setViewMonth((current) => {
      const next = new Date(current.year, current.monthIndex + step, 1);
      return { monthIndex: next.getMonth(), year: next.getFullYear() };
    });
  }

  return (
    <div className="w-fit max-w-full rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2 pb-2">
        <button
          aria-label={t("admin.session.calendarPrevMonth")}
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          disabled={disabled}
          onClick={() => moveMonth(-1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <span className="text-sm font-extrabold capitalize text-white">
          {monthLabel}
        </span>
        <button
          aria-label={t("admin.session.calendarNextMonth")}
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          disabled={disabled}
          onClick={() => moveMonth(1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </div>

      <div aria-hidden="true" className="grid grid-cols-7 gap-1 pb-1">
        {weekdayLabels.map((label, index) => (
          <span
            className="flex h-8 w-9 items-center justify-center text-xs font-bold text-white/40"
            key={`${label}-${index}`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="grid gap-1">
        {weeks.map((week, weekIndex) => (
          <div className="grid grid-cols-7 gap-1" key={weekIndex}>
            {week.map((calendarDay, dayIndex) => {
              if (!calendarDay) {
                return <span aria-hidden="true" className="h-9 w-9" key={dayIndex} />;
              }

              const isSelected = selectedDates.includes(calendarDay.iso);
              const isDayDisabled =
                disabled ||
                disabledDates.includes(calendarDay.iso) ||
                (minDate !== undefined && calendarDay.iso < minDate);

              return (
                <button
                  aria-label={dayLabelFormatter.format(
                    new Date(
                      viewMonth.year,
                      viewMonth.monthIndex,
                      calendarDay.day
                    )
                  )}
                  aria-pressed={isSelected}
                  className={[
                    "flex h-9 w-9 items-center justify-center rounded text-sm font-bold transition",
                    isSelected
                      ? "bg-brand text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                    "disabled:pointer-events-none disabled:opacity-30",
                  ].join(" ")}
                  disabled={isDayDisabled}
                  key={calendarDay.iso}
                  onClick={() => onToggleDate(calendarDay.iso)}
                  type="button"
                >
                  {calendarDay.day}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
