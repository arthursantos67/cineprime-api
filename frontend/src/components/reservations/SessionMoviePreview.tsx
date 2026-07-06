"use client";

import { useEffect, useState } from "react";

import { catalogApi } from "@/api/catalog";
import { useI18n } from "@/i18n";
import type { CatalogSession } from "@/types/catalog";

import { MoviePreviewPanel } from "./MoviePreviewPanel";

type SessionMoviePreviewProps = {
  sessionId: string;
  showOrderSummary?: boolean;
  summaryActionHref?: string;
  summaryActionLabel?: string;
};

export function SessionMoviePreview({
  sessionId,
  showOrderSummary = false,
  summaryActionHref,
  summaryActionLabel,
}: SessionMoviePreviewProps) {
  const { locale } = useI18n();
  const [session, setSession] = useState<CatalogSession | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    catalogApi
      .getSession(sessionId, { signal: controller.signal })
      .then(setSession)
      .catch((err) => {
        if (err.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [sessionId, locale]);

  if (error) return <p className="text-sm text-white/50">...</p>;
  if (!session) return <div className="animate-pulse rounded-card bg-white/5 h-64 w-full" />;

  return (
    <MoviePreviewPanel
      session={session}
      showOrderSummary={showOrderSummary}
      summaryActionHref={summaryActionHref}
      summaryActionLabel={summaryActionLabel}
    />
  );
}
