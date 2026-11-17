'use client';

import { useEffect, useRef, useState } from 'react';
import Poster from '@/components/Poster';
import { isErrorResponse, type ApiResponse, type Range, type TracksResponse } from '@/lib/types';

type RequestState = { range: Range; force: boolean; nonce: number };
type Failure = { title: string; detail: string };

export default function Home() {
  const [request, setRequest] = useState<RequestState>({ range: '24h', force: false, nonce: 0 });
  const [data, setData] = useState<TracksResponse | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(true);
  const cursorRef = useRef<HTMLDivElement>(null);

  // Portfolio-style square cursor, only where a real pointer exists.
  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!finePointer || reducedMotion) return;

    document.body.classList.add('has-custom-cursor');
    let frame = 0;
    let x = 0;
    let y = 0;

    const move = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        cursorRef.current?.classList.add('is-visible');
        cursorRef.current?.style.setProperty('transform', `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`);
        frame = 0;
      });
    };

    const over = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      cursorRef.current?.classList.toggle('is-over-action', Boolean(target?.closest('button, a, [role="button"]')));
    };

    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerover', over);

    return () => {
      document.body.classList.remove('has-custom-cursor');
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerover', over);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({ range: request.range });
    if (request.force) params.set('refresh', '1');

    const run = async () => {
      try {
        const response = await fetch(`/api/tracks?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = (await response.json()) as ApiResponse;

        if (!active) return;
        if (!response.ok || isErrorResponse(body)) {
          setFailure({
            title: isErrorResponse(body) ? body.error : 'Le serveur a renvoyé une erreur.',
            detail: isErrorResponse(body) ? body.detail : `Statut HTTP ${response.status}`,
          });
          setData(null);
          return;
        }

        setData(body);
        setFailure(null);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
        setFailure({
          title: 'Le serveur est introuvable.',
          detail: 'Lance docker compose, puis réessaie.',
        });
        setData(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [request]);

  const selectRange = (range: Range) => {
    if (range === request.range && !failure) return;
    setLoading(true);
    setFailure(null);
    setRequest((current) => ({ range, force: false, nonce: current.nonce + 1 }));
  };

  const refresh = () => {
    setLoading(true);
    setFailure(null);
    setRequest((current) => ({ ...current, force: true, nonce: current.nonce + 1 }));
  };

  const tone = failure ? 'bad' : data?.stale ? 'warn' : loading ? 'idle' : 'good';
  const statusLabel = tone === 'good'
    ? 'Données à jour'
    : tone === 'warn'
      ? 'Relevé enregistré'
      : tone === 'bad'
        ? 'Last.fm indisponible'
        : 'Chargement';

  return (
    <div className="site">
      <header className="site-nav">
        <div className="nav-left">
          <span className="nav-mark" aria-hidden="true" />
          <span className="nav-title">WALL OF TRACKS</span>
          <span className="nav-divider" aria-hidden="true">/</span>
          <span className="nav-subtitle">LISTENING EDITION</span>
        </div>

        <div className="nav-right">
          <div className="range-switch" role="group" aria-label="Période">
            <button
              type="button"
              className={request.range === '24h' ? 'active' : ''}
              aria-pressed={request.range === '24h'}
              onClick={() => selectRange('24h')}
            >
              24 H
            </button>
            <button
              type="button"
              className={request.range === '7d' ? 'active' : ''}
              aria-pressed={request.range === '7d'}
              onClick={() => selectRange('7d')}
            >
              7 J
            </button>
          </div>
          <button
            type="button"
            className="refresh"
            onClick={refresh}
            disabled={loading}
            aria-label="Rafraîchir les écoutes"
          >
            ↻
          </button>
          <span className={`status status-${tone}`} role="status" aria-label={statusLabel} />
        </div>
      </header>

      {data?.stale && (
        <p className="notice">RELEVÉ ENREGISTRÉ · LAST.FM INDISPONIBLE</p>
      )}

      <main className="site-main">
        {loading && !data ? (
          <div className="state loader" role="status">
            <span className="loader-mark" aria-hidden="true" />
            <span>CHARGEMENT DES ÉCOUTES</span>
          </div>
        ) : failure ? (
          <div className="state" role="alert">
            <div className="state-inner">
              <h2>{failure.title}</h2>
              <p>{failure.detail}</p>
              <button type="button" onClick={refresh}>RÉESSAYER</button>
            </div>
          </div>
        ) : data ? (
          <Poster data={data} />
        ) : null}
      </main>

      <div ref={cursorRef} className="cursor" aria-hidden="true" />
    </div>
  );
}
