import { NextRequest, NextResponse } from "next/server";

import { getTmdbToken } from "../../get-token";

const TRANSLATION_LOCALES = ["en-US", "es-ES", "fr-FR", "de-DE", "it-IT", "zh-CN", "ja-JP"] as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid movie id" }, { status: 400 });
  }

  const token = await getTmdbToken();
  if (!token) {
    return NextResponse.json({ error: "TMDB not configured" }, { status: 500 });
  }

  const headers = { Authorization: `Bearer ${token}` };
  const base = "https://api.themoviedb.org/3";
  const opts = { headers, next: { revalidate: 3600 } };

  const [ptRes, ...rest] = await Promise.all([
    fetch(`${base}/movie/${id}?language=pt-BR`, opts),
    ...TRANSLATION_LOCALES.map((l) => fetch(`${base}/movie/${id}?language=${l}`, opts)),
    fetch(`${base}/movie/${id}/credits?language=en-US`, opts),
    fetch(`${base}/movie/${id}/videos?language=pt-BR`, opts),
    fetch(`${base}/movie/${id}/videos?language=en-US`, opts),
  ]);

  if (!ptRes.ok) {
    return NextResponse.json({ error: "Movie not found" }, { status: ptRes.status });
  }

  const videosEnRes = rest[rest.length - 1];
  const videosPtRes = rest[rest.length - 2];
  const creditsRes = rest[rest.length - 3];
  const localeReses = rest.slice(0, -3);

  const [pt, ...localeAndRestData] = await Promise.all([
    ptRes.json(),
    ...localeReses.map((r) => (r.ok ? r.json() : Promise.resolve(null))),
    creditsRes.ok ? creditsRes.json() : Promise.resolve({ crew: [], cast: [] }),
    videosPtRes.ok ? videosPtRes.json() : Promise.resolve({ results: [] }),
    videosEnRes.ok ? videosEnRes.json() : Promise.resolve({ results: [] }),
  ]);

  const videosEnData = localeAndRestData[localeAndRestData.length - 1];
  const videosPtData = localeAndRestData[localeAndRestData.length - 2];
  const creditsData = localeAndRestData[localeAndRestData.length - 3];
  const localeData = localeAndRestData.slice(0, -3);

  const director: string =
    creditsData.crew?.find((c: { job: string; name: string }) => c.job === "Director")?.name ?? "";

  const cast: string[] =
    (creditsData.cast ?? []).slice(0, 10).map((c: { name: string }) => c.name);

  const trailerUrl = pickTrailerUrl(videosPtData.results, videosEnData.results);

  const translations: Record<string, { title: string; synopsis: string }> = {};
  for (let i = 0; i < TRANSLATION_LOCALES.length; i++) {
    const locale = TRANSLATION_LOCALES[i];
    const d = localeData[i];
    if (d?.title || d?.overview) {
      translations[locale] = {
        title: d.title ?? "",
        synopsis: d.overview ?? "",
      };
    }
  }

  return NextResponse.json({
    pt: { title: pt.title ?? "", synopsis: pt.overview ?? "" },
    translations,
    poster_path: pt.poster_path ?? null,
    runtime: pt.runtime ?? null,
    release_date: pt.release_date ?? "",
    director,
    cast,
    trailer_url: trailerUrl,
  });
}

type TmdbVideo = {
  key: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
};

function pickTrailerUrl(...videoLists: TmdbVideo[][]): string | null {
  for (const videos of videoLists) {
    const youtubeTrailers = (videos ?? []).filter(
      (v) => v.site === "YouTube" && v.type === "Trailer"
    );
    if (youtubeTrailers.length === 0) continue;

    const best = [...youtubeTrailers].sort((a, b) => {
      if (a.official !== b.official) return a.official ? -1 : 1;
      return (b.published_at ?? "").localeCompare(a.published_at ?? "");
    })[0];

    return `https://www.youtube.com/watch?v=${best.key}`;
  }
  return null;
}
