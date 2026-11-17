import { NextRequest, NextResponse } from 'next/server';
import { getOrLoad } from '@/lib/cache';
import {
  ConfigError,
  DEFAULT_USERNAME,
  describeUpstreamError,
  fetchRecentTracks,
  TRACK_CACHE_TTL_MS,
} from '@/lib/lastfm';
import type { ApiResponse, ErrorResponse, Range, TracksResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const range: Range = request.nextUrl.searchParams.get('range') === '7d' ? '7d' : '24h';
  const wantsRefresh = request.nextUrl.searchParams.get('refresh') === '1';
  const username = process.env.LASTFM_USERNAME?.trim() || DEFAULT_USERNAME;

  try {
    const result = await getOrLoad(
      `tracks:${username}:${range}`,
      TRACK_CACHE_TTL_MS,
      () => fetchRecentTracks(range),
      wantsRefresh,
    );

    const stale = result.state === 'stale';
    const minutes = Math.floor(result.ageMs / 60_000);
    const body: TracksResponse = {
      ...result.value,
      stale,
      cacheState: result.state,
      ...(stale
        ? {
            notice: `Last.fm ne répond pas pour le moment — voici le dernier relevé enregistré${
              minutes > 0 ? ` (il y a ${minutes} min)` : ''
            }.`,
          }
        : {}),
    };

    return NextResponse.json<ApiResponse>(body, {
      headers: {
        // The browser always revalidates with us; only our in-process cache
        // decides whether Last.fm is called again.
        'Cache-Control': 'no-store',
        'X-Cache-State': result.state,
      },
    });
  } catch (error) {
    const isConfig = error instanceof ConfigError;
    const body: ErrorResponse = {
      kind: isConfig ? 'config' : 'upstream',
      error: isConfig
        ? 'La clé API Last.fm n’est pas configurée sur le serveur.'
        : 'Last.fm est momentanément indisponible.',
      detail: describeUpstreamError(error),
    };

    return NextResponse.json<ApiResponse>(body, {
      status: isConfig ? 503 : 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
