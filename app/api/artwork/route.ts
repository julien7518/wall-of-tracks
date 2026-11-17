import { NextRequest, NextResponse } from 'next/server';
import { getCachedBlob, setCachedBlob } from '@/lib/cache';

export const runtime = 'nodejs';

/** Only Last.fm's image CDNs are allowed: this route is not a general proxy. */
const ALLOWED_HOSTS = new Set([
  'lastfm.freetls.fastly.net',
  'lastfm-img.freetls.fastly.net',
  'userserve-ak.last.fm',
  'lastfm.imgix.net',
]);

const ARTWORK_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 6_000;

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url');
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let source: URL;
  try {
    source = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid url parameter' }, { status: 400 });
  }

  if (source.protocol !== 'https:' || !ALLOWED_HOSTS.has(source.hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 400 });
  }

  const cacheKey = source.toString();
  const cached = getCachedBlob(cacheKey);
  if (cached) {
    return imageResponse(cached.body, cached.contentType);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(source, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png,*/*' },
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Artwork unavailable' }, { status: 404 });
    }

    const contentType = upstream.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Not an image' }, { status: 404 });
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.byteLength === 0 || body.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Invalid image size' }, { status: 404 });
    }

    setCachedBlob(cacheKey, body, contentType, ARTWORK_TTL_MS);
    return imageResponse(body, contentType);
  } catch {
    return NextResponse.json({ error: 'Artwork fetch failed' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

function imageResponse(body: Buffer, contentType: string) {
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
