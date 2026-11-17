'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fallbackPalette, paletteFromImage, type Palette } from './palette';
import type { Scrobble } from './types';

export function albumKey(item: Pick<Scrobble, 'artist' | 'album'>): string {
  return `${item.artist}::${item.album}`;
}

/**
 * Extracts colours from a bounded number of covers (the most-listened albums),
 * so the first paint stays fast even for a busy listening history.
 */
export function useAlbumPalettes(scrobbles: Scrobble[], limit = 48) {
  const artworkByAlbum = useMemo(() => {
    const counts = new Map<string, number>();
    const artwork = new Map<string, string>();

    for (const item of scrobbles) {
      const key = albumKey(item);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (item.artwork && !artwork.has(key)) artwork.set(key, item.artwork);
    }

    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key]) => key);

    return Object.fromEntries(top.map((key) => [key, artwork.get(key) ?? null]));
  }, [scrobbles, limit]);

  const urlKey = useMemo(
    () => Object.values(artworkByAlbum).filter((url): url is string => Boolean(url)).sort().join('|'),
    [artworkByAlbum],
  );

  const [loaded, setLoaded] = useState<{ key: string; palettes: Record<string, Palette> }>({
    key: '',
    palettes: {},
  });

  useEffect(() => {
    const urls = urlKey ? urlKey.split('|') : [];
    if (urls.length === 0) return;

    let active = true;
    Promise.all(
      urls.map(async (url) => [url, await paletteFromImage(url)] as const),
    ).then((entries) => {
      if (active) setLoaded({ key: urlKey, palettes: Object.fromEntries(entries) });
    });

    return () => {
      active = false;
    };
  }, [urlKey]);

  // Ignore results from a previous request; no synchronous setState in the effect.
  const palettes = useMemo(
    () => (loaded.key === urlKey ? loaded.palettes : {}),
    [loaded, urlKey],
  );

  return useCallback(
    (album: string): Palette => {
      const url = artworkByAlbum[album];
      return (url && palettes[url]) || fallbackPalette(album);
    },
    [artworkByAlbum, palettes],
  );
}
