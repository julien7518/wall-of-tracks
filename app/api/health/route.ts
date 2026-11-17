import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = Boolean(process.env.LASTFM_API_KEY?.trim());
  return NextResponse.json(
    { ok: true, lastfmKeyConfigured: configured },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
