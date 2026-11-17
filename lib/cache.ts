/**
 * Tiny in-process cache with two useful properties for this project:
 *  - a TTL, so two reloads in a row produce a single Last.fm call;
 *  - single-flight, so simultaneous visitors share the same upstream request.
 * If the loader throws after a value has been cached once, the old value is
 * returned with state 'stale' instead of leaving the page empty.
 */

type Entry<T> = {
  value: T;
  expiresAt: number;
  storedAt: number;
};

export type CacheResult<T> = {
  value: T;
  state: 'hit' | 'fresh' | 'stale';
  ageMs: number;
};

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function getOrLoad<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  forceRefresh = false,
): Promise<CacheResult<T>> {
  const now = Date.now();
  const previous = store.get(key) as Entry<T> | undefined;

  if (!forceRefresh && previous && previous.expiresAt > now) {
    return { value: previous.value, state: 'hit', ageMs: now - previous.storedAt };
  }

  let pending = inflight.get(key) as Promise<T> | undefined;

  if (!pending) {
    pending = loader()
      .then((value) => {
        const storedAt = Date.now();
        store.set(key, { value, storedAt, expiresAt: storedAt + ttlMs });
        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, pending);
  }

  try {
    const value = await pending;
    const storedAt = store.get(key)?.storedAt ?? Date.now();
    return { value, state: 'fresh', ageMs: Date.now() - storedAt };
  } catch (error) {
    if (previous) {
      return { value: previous.value, state: 'stale', ageMs: Date.now() - previous.storedAt };
    }
    throw error;
  }
}

/** Bounded byte cache used by the artwork proxy. */
type BlobEntry = { body: Buffer; contentType: string; expiresAt: number };
const blobs = new Map<string, BlobEntry>();
const MAX_BLOBS = 256;

export function getCachedBlob(key: string): BlobEntry | undefined {
  const entry = blobs.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    blobs.delete(key);
    return undefined;
  }
  // Refresh insertion order so the least recently used entry is evicted first.
  blobs.delete(key);
  blobs.set(key, entry);
  return entry;
}

export function setCachedBlob(key: string, body: Buffer, contentType: string, ttlMs: number) {
  blobs.set(key, { body, contentType, expiresAt: Date.now() + ttlMs });
  while (blobs.size > MAX_BLOBS) {
    const oldest = blobs.keys().next().value;
    if (!oldest) break;
    blobs.delete(oldest);
  }
}
