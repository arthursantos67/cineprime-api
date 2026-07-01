"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { ReservationOrderSummary } from "./OrderSummaryPanel";

import { Badge } from "@/components/ui/Badge";
import { useI18n } from "@/i18n";
import {
  formatSessionTime,
  getRoomDisplayName,
  getSessionBadges,
} from "@/components/movies/session-selection";
import type { CatalogSession } from "@/types/catalog";

type MoviePreviewPanelProps = {
  session: CatalogSession;
  showOrderSummary?: boolean;
  summaryActionHref?: string;
  summaryActionLabel?: string;
};

const RATING_CLASSIFICATION_URL =
  "https://www.gov.br/mj/pt-br/assuntos/seus-direitos/classificacao-1/volume-3v2.pdf";

const ratingIconColors: Record<string, string> = {
  "10": "bg-[#003580]",
  "12": "bg-[#003580]",
  "14": "bg-[#f5a623]",
  "16": "bg-[#cc3300]",
  "18": "bg-black",
};

function AgeRatingBlock({ ageRating, classificationDescription }: {
  ageRating: string;
  classificationDescription?: string | null;
}) {
  const { t } = useI18n();

  const colorClass = ratingIconColors[ageRating] ?? "bg-neutral-700";

  return (
    <div className="grid gap-2 rounded-[8px] border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="flex items-center gap-3">
        <span
          aria-label={t("movie.ageRatingYears", { rating: ageRating })}
          className={[
            colorClass,
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] text-base font-extrabold text-white",
          ].join(" ")}
        >
          {ageRating}
        </span>
        <p className="text-sm font-extrabold uppercase leading-tight text-white/80">
          {t("session.previewPanel.ratingWarning", { rating: ageRating })}
        </p>
      </div>
      {classificationDescription ? (
        <p className="text-sm leading-relaxed text-white/60">{classificationDescription}</p>
      ) : null}
      <p className="text-sm text-white/40">
        <a
          className="underline underline-offset-2 hover:text-white/70"
          href={RATING_CLASSIFICATION_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("session.previewPanel.ratingLink")}
        </a>
      </p>
    </div>
  );
}

function PanelContent({ session }: { session: CatalogSession }) {
  const { locale, t, formatDate } = useI18n();
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);

  const { movie, room, start_time } = session;
  const roomName = getRoomDisplayName(room);
  const badges = getSessionBadges(session, locale);

  const dateLabel = formatDate(start_time, { dateStyle: "long" });
  const timeLabel = formatSessionTime(start_time, locale);

  return (
    <div className="grid gap-4">
      {/* Poster + meta */}
      <div className="flex gap-3">
        <div className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={movie.title}
            className="h-[144px] w-[96px] rounded-[6px] object-cover shadow-md"
            src={movie.poster_url}
          />
        </div>
        <div className="min-w-0 grid content-start gap-1.5">
          <h3 className="m-0 text-base font-extrabold leading-tight text-white line-clamp-2">
            {movie.title}
          </h3>
          <p className="text-sm text-white/60 leading-snug">
            {dateLabel} · {timeLabel}
          </p>
          <p className="text-sm text-white/60 leading-snug">{roomName}</p>
          {badges.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {badges.map((badge) => (
                <Badge key={badge.label} size="sm" tone="neutral">
                  {badge.label}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Trailer */}
      {movie.trailer_url ? (
        <div>
          <button
            aria-expanded={isTrailerOpen}
            className="flex w-full items-center justify-between gap-2 rounded-[6px] border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-sm font-extrabold text-white/80 transition hover:bg-white/[0.08]"
            onClick={() => setIsTrailerOpen((o) => !o)}
            type="button"
          >
            {t("session.previewPanel.trailer")}
            {isTrailerOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0" />
            )}
          </button>
          {isTrailerOpen ? (
            <div
              className="mt-2 overflow-hidden rounded-[6px] border border-white/[0.07]"
              style={{ aspectRatio: "16/9" }}
            >
              <iframe
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-fullscreen"
                src={movie.trailer_url}
                title={t("session.previewPanel.trailer")}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Age rating block */}
      {movie.age_rating && movie.age_rating !== "L" ? (
        <AgeRatingBlock
          ageRating={movie.age_rating}
          classificationDescription={movie.classification_description}
        />
      ) : null}
    </div>
  );
}

export function MoviePreviewPanel({
  session,
  showOrderSummary = false,
  summaryActionHref,
  summaryActionLabel,
}: MoviePreviewPanelProps) {
  const { t } = useI18n();
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

  return (
    <aside className="movie-preview-panel md:flex md:flex-col md:h-full">
      {/* Mobile: compact collapsed card */}
      <div className="md:hidden">
        <div className="rounded-card border border-white/10 bg-[linear-gradient(180deg,rgb(255_255_255_/_5%),rgb(255_255_255_/_2%))] p-3 shadow-[0_18px_54px_rgb(0_0_0_/_18%)]">
          <button
            aria-expanded={isMobileExpanded}
            className="flex w-full items-center gap-3 text-left"
            onClick={() => setIsMobileExpanded((p) => !p)}
            type="button"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={session.movie.title}
              className="h-12 w-8 shrink-0 rounded-[4px] object-cover"
              src={session.movie.poster_url}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-extrabold text-white">
                {session.movie.title}
              </span>
              <span className="block truncate text-xs text-white/50">
                {t("session.previewPanel.collapsedLabel")}
              </span>
            </span>
            <span className="shrink-0 text-white/40">
              {isMobileExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          </button>
          {isMobileExpanded ? (
            <div className="mt-4 border-t border-white/[0.08] pt-4">
              <PanelContent session={session} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Desktop: full panel */}
      <div className="hidden md:flex md:flex-col gap-4">
        <div className="rounded-card border border-white/10 bg-[linear-gradient(180deg,rgb(255_255_255_/_5%),rgb(255_255_255_/_2%))] p-4 shadow-[0_18px_54px_rgb(0_0_0_/_18%)]">
          <PanelContent session={session} />
        </div>
        {showOrderSummary ? (
          <ReservationOrderSummary
            actionHref={summaryActionHref}
            actionLabel={summaryActionLabel}
          />
        ) : null}
      </div>
    </aside>
  );
}
