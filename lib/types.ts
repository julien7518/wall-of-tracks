export type Range = '24h' | '7d';

export type Scrobble = {
  /** Stable identifier used as React key. */
  id: string;
  song: string;
  artist: string;
  album: string;
  /** Epoch milliseconds. The currently playing track uses the fetch time. */
  listenedAt: number;
  nowPlaying: boolean;
  /** Always a local path: the browser never talks to Last.fm. */
  artwork: string | null;
};

export type Stats = {
  total: number;
  uniqueArtists: number;
  uniqueAlbums: number;
  topAlbum: { name: string; artist: string; count: number } | null;
};

export type ConstellationData = {
  range: Range;
  fetchedAt: number;
  windowStart: number;
  windowEnd: number;
  scrobbles: Scrobble[];
  stats: Stats;
  username: string;
};

/** Envelope returned by /api/tracks. */
export type TracksResponse = ConstellationData & {
  /** true when Last.fm failed and we served the previous cached value. */
  stale: boolean;
  /** 'hit' = served from a fresh cache, 'fresh' = just fetched, 'stale' = cached fallback. */
  cacheState: 'hit' | 'fresh' | 'stale';
  notice?: string;
};

export type ErrorResponse = {
  error: string;
  detail: string;
  kind: 'config' | 'upstream';
};

export type ApiResponse = TracksResponse | ErrorResponse;

export function isErrorResponse(value: ApiResponse): value is ErrorResponse {
  return 'error' in value;
}
