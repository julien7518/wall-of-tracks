import type { ConstellationData, Range, Scrobble, Stats } from './types';

export const DEFAULT_USERNAME = 'jojjjjoooooooo';
export const TRACK_CACHE_TTL_MS = 60_000;

const API_ROOT = 'https://ws.audioscrobbler.com/2.0/';
const NO_ARTWORK_HASH = '2a96cbd8b46e442fc41c2b86b821562f';
const FETCH_TIMEOUT_MS = 8_000;

export class ConfigError extends Error {}

type RawImage = { '#text'?: string; size?: string };

type RawTrack = {
  name?: string;
  artist?: { '#text'?: string } | string;
  album?: { '#text'?: string } | string;
  image?: RawImage[];
  date?: { uts?: string };
  '@attr'?: { nowplaying?: string };
};

type RawResponse = {
  error?: number;
  message?: string;
  recenttracks?: { track?: RawTrack | RawTrack[] };
};

function textOf(value: { '#text'?: string } | string | undefined): string {
  if (!value) return '';
  return typeof value === 'string' ? value : (value['#text'] ?? '');
}

function bestArtwork(images: RawImage[] | undefined): string | null {
  if (!Array.isArray(images)) return null;
  const candidates = images
    .map((image) => image?.['#text']?.trim() ?? '')
    .filter((url) => url.startsWith('https://') && !url.includes(NO_ARTWORK_HASH));
  if (candidates.length === 0) return null;
  // Last.fm orders images small -> extralarge; the last valid one is the biggest.
  return candidates[candidates.length - 1];
}

function toProxyPath(sourceUrl: string): string {
  return `/api/artwork?url=${encodeURIComponent(sourceUrl)}`;
}

function computeStats(scrobbles: Scrobble[]): Stats {
  const artists = new Set<string>();
  const albums = new Set<string>();
  const albumCounts = new Map<string, { name: string; artist: string; count: number }>();

  for (const item of scrobbles) {
    artists.add(item.artist);
    const key = `${item.artist}::${item.album}`;
    albums.add(key);
    const current = albumCounts.get(key);
    if (current) current.count += 1;
    else albumCounts.set(key, { name: item.album, artist: item.artist, count: 1 });
  }

  const topAlbum = [...albumCounts.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    total: scrobbles.length,
    uniqueArtists: artists.size,
    uniqueAlbums: albums.size,
    topAlbum,
  };
}

/** Returns a safe, key-free detail string for the UI. */
export function describeUpstreamError(error: unknown): string {
  if (error instanceof ConfigError) return 'Variable LASTFM_API_KEY absente du serveur';
  if (error instanceof Error && error.name === 'AbortError') return 'Délai dépassé lors de l’appel à Last.fm';
  if (error instanceof SyntaxError) return 'Réponse Last.fm illisible';
  return 'Appel à Last.fm échoué';
}

/** Talks to Last.fm. Only ever called from a server route. */
export async function fetchRecentTracks(range: Range): Promise<ConstellationData> {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigError('LASTFM_API_KEY is not configured on the server');
  }

  const username = process.env.LASTFM_USERNAME?.trim() || DEFAULT_USERNAME;
  const fetchedAt = Date.now();
  const windowMs = range === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const windowStart = fetchedAt - windowMs;

  const url = new URL(API_ROOT);
  url.searchParams.set('method', 'user.getrecenttracks');
  url.searchParams.set('user', username);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '200');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Last.fm HTTP ${response.status}`);
  }

  const payload = (await response.json()) as RawResponse;
  if (payload.error || !payload.recenttracks) {
    throw new Error(payload.message ? `Last.fm: ${payload.message}` : 'Réponse Last.fm inattendue');
  }

  const raw = payload.recenttracks.track;
  const tracks: RawTrack[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const scrobbles: Scrobble[] = tracks
    .map((track, index) => {
      const nowPlaying = track['@attr']?.nowplaying === 'true';
      const uts = Number(track.date?.uts);
      const listenedAt = nowPlaying || !Number.isFinite(uts) ? fetchedAt : uts * 1000;
      const source = bestArtwork(track.image);

      return {
        id: `${listenedAt}-${index}-${textOf(track.artist)}`,
        song: track.name?.trim() || 'Titre inconnu',
        artist: textOf(track.artist) || 'Artiste inconnu',
        album: textOf(track.album) || 'Album inconnu',
        listenedAt,
        nowPlaying,
        artwork: source ? toProxyPath(source) : null,
      } satisfies Scrobble;
    })
    .filter((item) => item.nowPlaying || (item.listenedAt >= windowStart && item.listenedAt <= fetchedAt))
    .sort((a, b) => a.listenedAt - b.listenedAt);

  return {
    range,
    fetchedAt,
    windowStart,
    windowEnd: fetchedAt,
    scrobbles,
    stats: computeStats(scrobbles),
    username,
  };
}
