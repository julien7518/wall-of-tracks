/** Small deterministic string hash (FNV-1a). Used for stable star positions. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable value in [0, 1) derived from a string. */
export function unitHash(input: string): number {
  return hashString(input) / 0xffffffff;
}
