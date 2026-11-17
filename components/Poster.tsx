'use client';

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Disc, { type DiscAlbum } from '@/components/Disc';
import { albumKey, useAlbumPalettes } from '@/lib/usePalettes';
import type { Scrobble, TracksResponse } from '@/lib/types';

type Props = { data: TracksResponse };
type View = 'disc' | 'time' | 'covers';
type DialPoint = {
  item: Scrobble;
  x: number;
  y: number;
  radius: number;
  color: string;
};
type AlbumInfo = {
  key: string;
  artist: string;
  album: string;
  artwork: string | null;
  count: number;
  timeSum: number;
  lastAt: number;
  mean: number;
  color: string;
};

const TAU = Math.PI * 2;
const SIZE = 640;
const CENTER = SIZE / 2;
const INNER = 72;
const OUTER = 224;
const COVER_RADIUS = 276;
const COVER_ALBUM_COUNT = 20;
const RIBBON_ALBUM_COUNT = 12;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const timeFormat = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});
const weekdayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

function polar(angle: number, radius: number) {
  return {
    x: CENTER + Math.cos(angle - Math.PI / 2) * radius,
    y: CENTER + Math.sin(angle - Math.PI / 2) * radius,
  };
}

export default function Poster({ data }: Props) {
  const paletteFor = useAlbumPalettes(data.scrobbles);
  const [view, setView] = useState<View>('disc');
  const [spinning, setSpinning] = useState(() => data.scrobbles.some((item) => item.nowPlaying));
  const [organic, setOrganic] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<string | null>(null);
  const [pinnedPoint, setPinnedPoint] = useState<string | null>(null);
  const [hoveredAlbum, setHoveredAlbum] = useState<string | null>(null);
  const [focusedAlbum, setFocusedAlbum] = useState<string | null>(null);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const isWeek = data.range === '7d';
  const rangeLabel = isWeek ? '07 JOURS' : '24 HEURES';
  const span = Math.max(1, data.windowEnd - data.windowStart);
  const scrobbles = data.scrobbles;

  useEffect(() => {
    const clearFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFocusedAlbum(null);
        setPinnedPoint(null);
        setScrubIndex(null);
      }
    };
    window.addEventListener('keydown', clearFocus);
    return () => window.removeEventListener('keydown', clearFocus);
  }, []);

  const songCounts = new Map<string, number>();
  const artistCounts = new Map<string, number>();
  const albums = new Map<string, AlbumInfo>();

  for (const item of scrobbles) {
    const songKey = `${item.artist}::${item.song}`;
    songCounts.set(songKey, (songCounts.get(songKey) ?? 0) + 1);
    artistCounts.set(item.artist, (artistCounts.get(item.artist) ?? 0) + 1);

    const key = albumKey(item);
    const album = albums.get(key);
    if (album) {
      album.count += 1;
      album.timeSum += item.listenedAt;
      album.lastAt = Math.max(album.lastAt, item.listenedAt);
      if (!album.artwork && item.artwork) album.artwork = item.artwork;
    } else {
      albums.set(key, {
        key,
        artist: item.artist,
        album: item.album,
        artwork: item.artwork,
        count: 1,
        timeSum: item.listenedAt,
        lastAt: item.listenedAt,
        mean: item.listenedAt,
        color: paletteFor(key).ink,
      });
    }
  }

  const albumList = [...albums.values()]
    .map((album) => ({ ...album, mean: album.timeSum / album.count, color: paletteFor(album.key).ink }))
    .sort((a, b) => b.count - a.count);

  const heroArtist =
    [...artistCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? data.username;
  const current = scrobbles.find((item) => item.nowPlaying) ?? scrobbles[scrobbles.length - 1] ?? null;
  const heroCovers = [...albumList].sort((a, b) => b.lastAt - a.lastAt).slice(0, 3).reverse();

  const discAlbums: DiscAlbum[] = albumList.map((album) => ({
    key: album.key,
    artist: album.artist,
    album: album.album,
    artwork: album.artwork,
    count: album.count,
    color: album.color,
  }));
  const labelAlbum = current ? discAlbums.find((album) => album.key === albumKey(current)) ?? discAlbums[0] ?? null : null;

  const coverAlbums = [...albumList]
    .slice(0, COVER_ALBUM_COUNT)
    .sort((a, b) => a.mean - b.mean)
    .map((album, index, list) => {
      const angle = (index / list.length) * TAU;
      const point = polar(angle, COVER_RADIUS);
      return {
        ...album,
        index,
        x: point.x,
        y: point.y,
        size: 30 + Math.min(15, Math.sqrt(album.count) * 4.5),
      };
    });

  const ribbonAlbums = albumList.slice(0, RIBBON_ALBUM_COUNT);

  const dialPoints: DialPoint[] = scrobbles.map((item) => {
    const date = new Date(item.listenedAt);
    const progress = clamp((item.listenedAt - data.windowStart) / span, 0, 1);
    const angle = progress * TAU;
    const hour = date.getHours() + date.getMinutes() / 60;
    const secondary = isWeek ? hour / 24 : date.getMinutes() / 60;
    const distance = INNER + 8 + clamp(secondary, 0, 1) * (OUTER - INNER - 8);
    const point = polar(angle, distance);
    const repeats = songCounts.get(`${item.artist}::${item.song}`) ?? 1;

    return {
      item,
      x: point.x,
      y: point.y,
      radius: 1.7 + Math.min(2.9, Math.log2(repeats + 1) * 1.05) + (item.nowPlaying ? 1.2 : 0),
      color: paletteFor(albumKey(item)).ink,
    };
  });

  const activePointId = pinnedPoint ?? hoveredPoint;
  const activeAlbumKey = focusedAlbum ?? hoveredAlbum;
  const hoveredPointItem = dialPoints.find((point) => point.item.id === activePointId);
  const scrubPoint = scrubIndex !== null ? dialPoints[scrubIndex] : null;
  const captionPoint = hoveredPointItem ?? (activeAlbumKey ? null : scrubPoint);
  const activeAlbum = albumList.find((album) => album.key === activeAlbumKey);
  const focused = albumList.find((album) => album.key === focusedAlbum);

  const scrubProgress = scrubIndex !== null && scrubIndex >= 0 && scrubIndex < scrobbles.length
    ? clamp((scrobbles[scrubIndex].listenedAt - data.windowStart) / span, 0, 1)
    : null;
  const playhead = scrubProgress === null
    ? null
    : {
        angle: scrubProgress * TAU,
        inner: polar(scrubProgress * TAU, INNER - 8),
        outer: polar(scrubProgress * TAU, OUTER + 12),
      };

  const ringRadii = [0.25, 0.5, 0.75, 1].map((fraction) => INNER + fraction * (OUTER - INNER));
  const spokeCount = isWeek ? 7 : 8;
  const spokes = Array.from({ length: spokeCount }, (_, index) => polar((index / spokeCount) * TAU, OUTER));
  const dialLabels = isWeek
    ? Array.from({ length: 7 }, (_, index) => ({
        angle: (index / 7) * TAU,
        label: weekdayFormat
          .format(new Date(data.windowStart + (index / 7) * span))
          .replace('.', '')
          .toUpperCase(),
      }))
    : [0, 0.25, 0.5, 0.75].map((fraction) => ({
        angle: fraction * TAU,
        label: `${String(new Date(data.windowStart + fraction * span).getHours()).padStart(2, '0')}H`,
      }));

  const binCount = isWeek ? 28 : 24;
  const binAlbums = Array.from({ length: binCount }, () => new Map<string, number>());
  const binCounts = new Array<number>(binCount).fill(0);

  for (const item of scrobbles) {
    const progress = clamp((item.listenedAt - data.windowStart) / span, 0, 1);
    const index = clamp(Math.floor(progress * binCount), 0, binCount - 1);
    const key = albumKey(item);
    binCounts[index] += 1;
    const counts = binAlbums[index];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const maxBin = Math.max(1, ...binCounts);
  const bins = binCounts.map((count, index) => {
    const entries = [...binAlbums[index].entries()].sort((a, b) => b[1] - a[1]);
    const topAlbum = entries[0]?.[0];
    return {
      count,
      height: count === 0 ? 2 : 12 + (count / maxBin) * 88,
      color: topAlbum ? paletteFor(topAlbum).ink : 'var(--border)',
    };
  });

  const currentColor = current ? paletteFor(albumKey(current)).ink : 'var(--accent)';
  const displayTitle = focused?.album ?? heroArtist;

  const scoreLabels = [0, 0.5, 1].map((fraction) => {
    const date = new Date(data.windowStart + fraction * span);
    return isWeek
      ? weekdayFormat.format(date).replace('.', '').toUpperCase()
      : `${String(date.getHours()).padStart(2, '0')}H`;
  });

  const toggleAlbum = (key: string) => {
    setFocusedAlbum((currentKey) => (currentKey === key ? null : key));
  };

  const scrubDial = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width / SIZE, rect.height / SIZE);
    if (!scale) return;

    const offsetX = (rect.width - SIZE * scale) / 2;
    const offsetY = (rect.height - SIZE * scale) / 2;
    const x = (event.clientX - rect.left - offsetX) / scale - CENTER;
    const y = (event.clientY - rect.top - offsetY) / scale - CENTER;

    if (Math.hypot(x, y) < INNER * 0.55) {
      setScrubIndex(null);
      return;
    }

    let angle = Math.atan2(y, x) + Math.PI / 2;
    if (angle < 0) angle += TAU;

    let nearest = -1;
    let bestDistance = Infinity;
    for (let index = 0; index < scrobbles.length; index += 1) {
      const trackAngle = ((scrobbles[index].listenedAt - data.windowStart) / span) * TAU;
      const delta = Math.abs(trackAngle - angle);
      const distance = Math.min(delta, TAU - delta);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = index;
      }
    }
    setScrubIndex(nearest >= 0 ? nearest : null);
  };

  return (
    <article className="poster" key={data.range}>
      <div className="poster-main">
        <section className="hero">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" aria-hidden="true" />
              {focused ? 'ALBUM EN VUE' : 'ÉDITION DU JOUR'}
            </p>
            <h1 key={displayTitle}>
              {displayTitle}
              <span className="hero-dot">.</span>
            </h1>
          </div>

          <div className="hero-foot">
            {current && (
              <div className="now-playing">
                <div className="cover-stack" aria-hidden="true">
                  {heroCovers.length === 0 && (
                    <span className="cover-layer cover-layer-2">
                      <span className="cover-glyph" />
                    </span>
                  )}
                  {heroCovers.map((album, index) => (
                    <span
                      key={album.key}
                      className={`cover-layer cover-layer-${heroCovers.length - 1 - index}`}
                      style={index === heroCovers.length - 1 ? { borderColor: currentColor } : undefined}
                    >
                      {album.artwork ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={album.artwork} alt="" />
                      ) : (
                        <span className="cover-glyph" />
                      )}
                    </span>
                  ))}
                </div>
                <div className="now-copy">
                  <strong>{current.song}</strong>
                  <small>{current.artist}</small>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="chart" aria-label="Carte interactive des écoutes et des pochettes">
          <div className="panel-head">
            <div className="view-switch" role="group" aria-label="Vue">
              <button
                type="button"
                className={view === 'disc' ? 'active' : ''}
                aria-pressed={view === 'disc'}
                onClick={() => setView('disc')}
              >
                DISQUE
              </button>
              <button
                type="button"
                className={view === 'time' ? 'active' : ''}
                aria-pressed={view === 'time'}
                onClick={() => setView('time')}
              >
                TEMPS
              </button>
              <button
                type="button"
                className={view === 'covers' ? 'active' : ''}
                aria-pressed={view === 'covers'}
                onClick={() => setView('covers')}
              >
                ALBUMS
              </button>
            </div>
          </div>

          <div className="chart-body">
            <div className={`disc-stage${view === 'disc' ? ' is-active' : ''}`} aria-hidden={view !== 'disc'}>
              <Disc
                albums={discAlbums}
                interactive={view === 'disc'}
                activeKey={activeAlbumKey}
                labelAlbum={labelAlbum}
                spinning={spinning}
                organic={organic}
                onHover={setHoveredAlbum}
                onFocus={toggleAlbum}
                onToggleSpin={() => setSpinning((value) => !value)}
                onToggleOrganic={() => setOrganic((value) => !value)}
                label={`Disque des ${discAlbums.length} albums les plus écoutés, classés par couleur. Rotation ${spinning ? 'active' : 'arrêtée'}.`}
              />
            </div>

            <div className={`dial-stage${view === 'time' ? ' is-active' : ''}`} aria-hidden={view !== 'time'}>
              <svg
                className="dial"
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                role="img"
                aria-label={`${scrobbles.length} écoutes et ${coverAlbums.length} pochettes sur ${rangeLabel.toLowerCase()}`}
                onPointerMove={scrubDial}
                onPointerLeave={() => setScrubIndex(null)}
                onClick={() => { setPinnedPoint(null); setHoveredPoint(null); setFocusedAlbum(null); setHoveredAlbum(null); }}
              >
                <defs>
                  {coverAlbums.map((album) => (
                    <clipPath key={album.key} id={`cover-clip-${album.index}`}>
                      <rect x={-album.size / 2} y={-album.size / 2} width={album.size} height={album.size} />
                    </clipPath>
                  ))}
                </defs>

                <g aria-hidden="true">
                  <circle className="dial-orbit" cx={CENTER} cy={CENTER} r={OUTER + 42} fill="none" stroke="var(--border)" strokeDasharray="1 9" />
                  {ringRadii.map((radius) => (
                    <circle key={radius} className="dial-ring" cx={CENTER} cy={CENTER} r={radius} />
                  ))}
                  {spokes.map((point, index) => (
                    <line
                      key={index}
                      className="dial-spoke"
                      x1={CENTER}
                      y1={CENTER}
                      x2={point.x}
                      y2={point.y}
                    />
                  ))}
                  <circle className="dial-center" cx={CENTER} cy={CENTER} r="3" />
                  {dialLabels.map((label, index) => (
                    <text key={index} className="dial-label" x={polar(label.angle, OUTER - 15).x} y={polar(label.angle, OUTER - 15).y} dominantBaseline="middle">
                      {label.label}
                    </text>
                  ))}
                </g>

                {playhead && (
                  <g className="playhead" aria-hidden="true">
                    <line x1={playhead.inner.x} y1={playhead.inner.y} x2={playhead.outer.x} y2={playhead.outer.y} stroke="var(--accent)" />
                    <circle cx={playhead.outer.x} cy={playhead.outer.y} r="4" fill="var(--accent)" />
                  </g>
                )}

                <g className="dial-covers">
                  {coverAlbums.map((album) => (
                    <g
                      key={album.key}
                      className={`dial-cover${activeAlbumKey === album.key ? ' dial-cover-active' : ''}`}
                      transform={`translate(${album.x} ${album.y})`}
                      opacity={activeAlbumKey && activeAlbumKey !== album.key ? 0.28 : 1}
                      style={{ animationDelay: `${album.index * 38}ms` }}
                      role="button"
                      tabIndex={view === 'time' ? 0 : -1}
                      aria-label={`${album.artist} — ${album.album}, ${album.count} écoutes`}
                      onMouseEnter={() => setHoveredAlbum(album.key)}
                      onMouseLeave={() => setHoveredAlbum((key) => (key === album.key ? null : key))}
                      onFocus={() => setHoveredAlbum(album.key)}
                      onBlur={() => setHoveredAlbum((key) => (key === album.key ? null : key))}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleAlbum(album.key);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleAlbum(album.key);
                        }
                      }}
                    >
                      <title>{`${album.artist} — ${album.album}`}</title>
                      {album.artwork ? (
                        <image
                          href={album.artwork}
                          x={-album.size / 2}
                          y={-album.size / 2}
                          width={album.size}
                          height={album.size}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath={`url(#cover-clip-${album.index})`}
                        />
                      ) : (
                        <rect
                          x={-album.size / 2}
                          y={-album.size / 2}
                          width={album.size}
                          height={album.size}
                          fill={album.color}
                          opacity="0.18"
                        />
                      )}
                      <rect
                        x={-album.size / 2}
                        y={-album.size / 2}
                        width={album.size}
                        height={album.size}
                        fill="none"
                        stroke="var(--paper)"
                        strokeWidth="3"
                      />
                      <rect
                        x={-album.size / 2}
                        y={-album.size / 2}
                        width={album.size}
                        height={album.size}
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth="1"
                      />
                    </g>
                  ))}
                </g>

                <g>
                  {dialPoints.map((point, index) => {
                    const selected = activePointId === point.item.id;
                    const dimmed = (activeAlbumKey && activeAlbumKey !== albumKey(point.item)) ||
                      (scrubIndex !== null && scrubIndex !== index);
                    return (
                      <g
                        key={point.item.id}
                        className={`dial-point${point.item.nowPlaying ? ' dial-point-live' : ''}${selected ? ' dial-point-active' : ''}`}
                        opacity={dimmed ? 0.16 : 1}
                        role="button"
                        tabIndex={view === 'time' ? 0 : -1}
                        aria-label={`${point.item.song} — ${point.item.artist}, ${timeFormat.format(point.item.listenedAt)}`}
                        onMouseEnter={() => setHoveredPoint(point.item.id)}
                        onMouseLeave={() => setHoveredPoint((currentId) => (currentId === point.item.id ? null : currentId))}
                        onFocus={() => setHoveredPoint(point.item.id)}
                        onBlur={() => setHoveredPoint((currentId) => (currentId === point.item.id ? null : currentId))}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPinnedPoint((currentId) => (currentId === point.item.id ? null : point.item.id));
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            setPinnedPoint((currentId) => (currentId === point.item.id ? null : point.item.id));
                          }
                        }}
                      >
                        <circle cx={point.x} cy={point.y} r={Math.max(11, point.radius + 8)} fill="transparent" />
                        {point.item.nowPlaying && (
                          <circle
                            className="dial-live-ring"
                            cx={point.x}
                            cy={point.y}
                            r={point.radius + 7}
                            fill="none"
                            stroke="var(--accent)"
                          />
                        )}
                        <circle
                          className="dial-dot"
                          cx={point.x}
                          cy={point.y}
                          r={selected ? point.radius + 1.8 : point.radius}
                          fill={point.color}
                        />
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>

            <div className={`mosaic${view === 'covers' ? ' is-active' : ''}`} aria-hidden={view !== 'covers'}>
              {coverAlbums.map((album) => (
                <button
                  key={album.key}
                  type="button"
                  className={`mosaic-tile${activeAlbumKey === album.key ? ' mosaic-tile-active' : ''}`}
                  style={{ animationDelay: `${album.index * 28}ms` }}
                  tabIndex={view === 'covers' ? 0 : -1}
                  aria-label={`${album.artist} — ${album.album}, ${album.count} écoutes`}
                  onMouseEnter={() => setHoveredAlbum(album.key)}
                  onMouseLeave={() => setHoveredAlbum((key) => (key === album.key ? null : key))}
                  onFocus={() => setHoveredAlbum(album.key)}
                  onBlur={() => setHoveredAlbum((key) => (key === album.key ? null : key))}
                  onClick={() => toggleAlbum(album.key)}
                >
                  <span className="mosaic-index">{String(album.index + 1).padStart(2, '0')}</span>
                  {album.artwork ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={album.artwork} alt="" />
                  ) : (
                    <span className="mosaic-empty" style={{ background: album.color }} aria-hidden="true" />
                  )}
                  <span className="mosaic-name">{album.album}</span>
                  <span className="mosaic-count">{album.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="chart-caption">
            {captionPoint ? (
              <>
                <span className="caption-title">
                  {captionPoint.item.artist} — {captionPoint.item.song}
                </span>
                <span className="muted">{timeFormat.format(captionPoint.item.listenedAt)}</span>
              </>
            ) : activeAlbum ? (
              <>
                <span className="caption-title">
                  {activeAlbum.artist} — {activeAlbum.album}
                </span>
                <span className="muted">{activeAlbum.count} FOIS</span>
              </>
            ) : null}
          </div>
        </section>
      </div>

      <section className="score" aria-label="Pochettes et partition des écoutes">
        <div className="cover-ribbon">
          {ribbonAlbums.map((album, index) => (
            <button
              key={album.key}
              type="button"
              className={`ribbon-item${activeAlbumKey === album.key ? ' ribbon-item-active' : ''}`}
              style={{ flexGrow: album.count, animationDelay: `${index * 45}ms` }}
              aria-label={`${album.artist} — ${album.album}, ${album.count} écoutes`}
              onMouseEnter={() => setHoveredAlbum(album.key)}
              onMouseLeave={() => setHoveredAlbum((key) => (key === album.key ? null : key))}
              onFocus={() => setHoveredAlbum(album.key)}
              onBlur={() => setHoveredAlbum((key) => (key === album.key ? null : key))}
              onClick={() => toggleAlbum(album.key)}
            >
              {album.artwork ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={album.artwork} alt="" />
              ) : (
                <span className="ribbon-empty" style={{ background: album.color }} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>

        <div className="score-bars" role="img" aria-label="Répartition des écoutes par intervalle">
          {bins.map((bin, index) => (
            <span key={index} className="score-bin">
              <i
                style={{
                  height: `${bin.height}%`,
                  background: bin.color,
                  animationDelay: `${index * 22}ms`,
                }}
              />
            </span>
          ))}
        </div>
        <div className="score-labels" aria-hidden="true">
          {scoreLabels.map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
      </section>
    </article>
  );
}
