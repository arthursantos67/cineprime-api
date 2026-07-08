"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import QRCode from "react-qr-code";

import { Badge, Dialog } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { LogoCp } from "@/components/ui/LogoCp";
import { useI18n } from "@/i18n";
import { formatDateTime } from "@/utils/formatters";

import { cn } from "../ui/classNames";

// Mirrors the i18n `t`, so callers can pass the real translate function
// (which also accepts interpolation params) without a narrower cast.
type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export type TicketCardTicket = {
  movie: {
    title: string;
    poster_url?: string | null;
    ticket_image_url?: string | null;
  };
  room: {
    name: string;
  };
  seat: {
    identifier: string;
  };
  session: {
    start_time: string;
    projection_format?: string;
    audio_format?: string;
  };
  ticket_code: string;
};

type TicketCardProps = {
  ticket: TicketCardTicket;
};

// Absolute-positioned faces + backface culling: the reliable 3D-flip recipe.
// (A grid stack silently breaks `backface-visibility`, painting both faces at
// once with the reverse one mirrored.)
const faceBaseClasses =
  "absolute inset-0 grid grid-cols-[84px_minmax(0,1fr)] overflow-hidden rounded-card border border-white/10 " +
  "[backface-visibility:hidden] [-webkit-backface-visibility:hidden]";

export function TicketCard({ ticket }: TicketCardProps) {
  const { locale, t } = useI18n();
  const [isFlipped, setIsFlipped] = useState(false);
  const [isCodeDialogOpen, setIsCodeDialogOpen] = useState(false);

  const formatBadges = getFormatBadges(ticket.session, t);
  const sessionLabel = formatDateTime(ticket.session.start_time, locale);
  // Prefer the dedicated landscape ticket art; fall back to the poster.
  const backgroundImage =
    ticket.movie.ticket_image_url || ticket.movie.poster_url || null;

  function toggleFlip() {
    setIsFlipped((current) => !current);
  }

  return (
    <div className="ticket-card grid gap-2.5">
      <div className="[perspective:1600px] rounded-card">
        <div
          className={cn(
            "relative h-[212px] w-full transition-transform duration-500 [transform-style:preserve-3d] [-webkit-transform-style:preserve-3d] motion-reduce:transition-none",
            isFlipped && "[transform:rotateY(180deg)]"
          )}
        >
          {/* ---- Front face: the "cinema ticket" ---- */}
          {/* The hidden face is culled with backface-visibility, but that is
              purely visual — aria-hidden + inert keep its duplicated title and
              code out of the accessibility tree and tab order too. */}
          <div
            aria-hidden={isFlipped}
            className={cn(
              faceBaseClasses,
              "bg-[linear-gradient(135deg,#1c2436,#141a28)]"
            )}
            inert={isFlipped}
          >
            <TicketStub>
              <span aria-hidden="true" className="text-[13px] tracking-[0.3em] text-accent">
                ★★★
              </span>
              <LogoCp className="h-7 w-7" />
              <span className="text-center text-[10px] font-[850] uppercase leading-tight tracking-[0.14em] text-white/70">
                {t("tickets.admitOne")}
              </span>
            </TicketStub>

            <div className="relative flex flex-col gap-2 p-4">
              {backgroundImage ? (
                // Plain <img>: the ticket background can be any admin-provided
                // host, so it must not be gated by next/image's remote allowlist.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
                  // Admin-provided host may 404 or go down: drop the broken
                  // image so the gradient background shows through cleanly.
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                  src={backgroundImage}
                />
              ) : null}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgb(179_19_34_/_28%),transparent_60%)]"
              />

              <div className="relative flex items-center justify-between gap-2">
                <FilmStrip />
                <span className="shrink-0 text-[11px] font-[850] uppercase tracking-[0.24em] text-white/70">
                  CinePrime
                </span>
              </div>

              <div className="relative mt-auto flex items-end justify-between gap-3">
                <div className="grid gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                    {t("tickets.ticket")}
                  </span>
                  <h3 className="m-0 line-clamp-2 text-xl font-[850] leading-tight text-white [overflow-wrap:anywhere]">
                    {ticket.movie.title}
                  </h3>
                  <span className="font-mono text-[11px] font-extrabold text-white/70 [overflow-wrap:anywhere]">
                    {ticket.ticket_code}
                  </span>
                </div>
                <span className="grid shrink-0 place-items-center rounded-md bg-white p-1 shadow-[0_6px_18px_rgb(0_0_0_/_35%)]">
                  <QRCode
                    aria-hidden="true"
                    className="h-[54px] w-[54px]"
                    size={54}
                    value={ticket.ticket_code}
                  />
                </span>
              </div>
            </div>
          </div>

          {/* ---- Back face: the "movie ticket" details ---- */}
          <div
            aria-hidden={!isFlipped}
            className={cn(
              faceBaseClasses,
              "bg-[linear-gradient(135deg,#241a1d,#15181f)] [transform:rotateY(180deg)]"
            )}
            inert={!isFlipped}
          >
            <TicketStub>
              <SeatIcon className="h-6 w-6 text-white/70" />
              <span className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
                {t("tickets.seat")}
              </span>
              <span className="text-center text-sm font-[850] text-white [overflow-wrap:anywhere]">
                {ticket.seat.identifier}
              </span>
            </TicketStub>

            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-3 bg-black/35 px-4 py-2">
                <span className="text-[11px] font-[850] uppercase tracking-[0.2em] text-white">
                  {t("tickets.movieTicket")}
                </span>
                <LogoCp className="h-4 w-4 shrink-0" />
              </div>

              <div className="flex flex-1 flex-col gap-2 p-4">
                <span className="font-mono text-xs font-extrabold text-white/80 [overflow-wrap:anywhere]">
                  {ticket.ticket_code}
                </span>
                <h3 className="m-0 line-clamp-1 text-lg font-[850] leading-tight text-white [overflow-wrap:anywhere]">
                  {ticket.movie.title}
                </h3>

                <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <TicketDetailItem label={t("tickets.session")}>
                    {sessionLabel}
                  </TicketDetailItem>
                  <TicketDetailItem label={t("tickets.room")}>
                    {ticket.room.name}
                  </TicketDetailItem>
                </dl>

                {formatBadges.length > 0 ? (
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    {formatBadges.map((badge) => (
                      <Badge key={badge.label} size="sm" tone={badge.tone}>
                        {badge.label}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          aria-pressed={isFlipped}
          className="inline-flex items-center gap-1.5 rounded-control text-sm font-extrabold text-white/65 underline-offset-4 transition hover:text-white hover:underline focus-visible:outline-none focus-visible:shadow-focus"
          onClick={toggleFlip}
          type="button"
        >
          <FlipIcon className="h-4 w-4" />
          {isFlipped ? t("tickets.flipToFront") : t("tickets.flipToBack")}
        </button>
        <button
          className="rounded-control text-sm font-extrabold text-accent underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:shadow-focus"
          onClick={() => setIsCodeDialogOpen(true)}
          type="button"
        >
          {t("tickets.qrLinkLabel")}
        </button>
      </div>

      <Dialog
        closeLabel={t("common.close")}
        description={t("tickets.qrDialogDescription")}
        isOpen={isCodeDialogOpen}
        onClose={() => setIsCodeDialogOpen(false)}
        title={t("tickets.qrDialogTitle")}
      >
        <TicketCodeDialogContent code={ticket.ticket_code} />
      </Dialog>
    </div>
  );
}

// Perforated left stub shared by both faces, complete with punched holes.
function TicketStub({ children }: { children: ReactNode }) {
  return (
    <aside className="relative flex flex-col items-center justify-center gap-2 border-r border-dashed border-white/25 px-3 py-4">
      <span
        aria-hidden="true"
        className="absolute -top-2 right-[-7px] size-3.5 rounded-full bg-[#0f1420]"
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-2 right-[-7px] size-3.5 rounded-full bg-[#0f1420]"
      />
      {children}
    </aside>
  );
}

function FilmStrip() {
  return (
    <span
      aria-hidden="true"
      className="h-3 w-24 rounded-[2px] border border-white/15 bg-[repeating-linear-gradient(90deg,transparent_0_5px,rgb(255_255_255_/_22%)_5px_9px)]"
    />
  );
}

function FlipIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
    >
      <path d="M21 8a9 9 0 0 0-15-3.5L3 7" />
      <path d="M3 3v4h4" />
      <path d="M3 16a9 9 0 0 0 15 3.5L21 17" />
      <path d="M21 21v-4h-4" />
    </svg>
  );
}

function SeatIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
    >
      <path d="M4 10V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
      <path d="M4 10a2 2 0 0 1 2 2v3h12v-3a2 2 0 0 1 2-2" />
      <path d="M6 18v2M18 18v2" />
    </svg>
  );
}

function TicketDetailItem({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
        {label}
      </dt>
      <dd className="m-0 font-bold text-white [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

export function TicketCodeDialogContent({ code }: { code: string }) {
  const { t } = useI18n();

  return (
    <div className="grid justify-items-center gap-4">
      <span
        aria-label={t("tickets.qrCodeAlt", { code })}
        className="rounded-lg bg-white p-3"
        role="img"
      >
        <QRCode className="h-40 w-40" size={160} value={code} />
      </span>
      <div className="grid w-full gap-1 text-center">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
          {t("tickets.manualCodeLabel")}
        </span>
        <span className="rounded-md border border-dashed border-white/20 bg-black/40 px-3 py-2 font-mono text-base font-extrabold [overflow-wrap:anywhere] text-white">
          {code}
        </span>
      </div>
    </div>
  );
}

type FormatBadge = { label: string; tone: BadgeTone };

export function getFormatBadges(
  session: TicketCardTicket["session"],
  t: TranslateFn
): FormatBadge[] {
  const badges: FormatBadge[] = [];
  const projection = session.projection_format;
  const audio = session.audio_format;

  if (projection) {
    badges.push({
      label: t(`domain.projection.${projection}`),
      tone: projection === "2d" ? "neutral" : "accent",
    });
  }

  if (audio) {
    badges.push({ label: t(`domain.audio.${audio}`), tone: "info" });
  }

  return badges;
}
