'use client';

import { useEffect, useRef } from 'react';

export type DiscAlbum = {
  key: string;
  artist: string;
  album: string;
  artwork: string | null;
  count: number;
  color: string;
};

type Props = {
  albums: DiscAlbum[];
  interactive: boolean;
  activeKey: string | null;
  labelAlbum: DiscAlbum | null;
  spinning: boolean;
  organic: boolean;
  onHover: (key: string | null) => void;
  onFocus: (key: string) => void;
  onToggleSpin: () => void;
  onToggleOrganic: () => void;
  label: string;
};

const SIZE = 640;
const C = SIZE / 2;
const R_IN = 94;
const R_OUT = 292;
const R_LABEL = 80;
const TAU = Math.PI * 2;

function polar(angle: number, radius: number) {
  return {
    x: C + Math.cos(angle - Math.PI / 2) * radius,
    y: C + Math.sin(angle - Math.PI / 2) * radius,
  };
}

function hueOf(color: string) {
  const match = color.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return 0;
  const r = parseInt(match[1].slice(0, 2), 16) / 255;
  const g = parseInt(match[1].slice(2, 4), 16) / 255;
  const b = parseInt(match[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (!delta) return 0;
  let hue = 0;
  if (max === r) hue = ((g - b) / delta + 6) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return hue * 60;
}

function wedgePath(a0: number, a1: number, organic: boolean, seed: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p1in = polar(a1, R_IN);
  const p0in = polar(a0, R_IN);

  if (!organic) {
    const p0out = polar(a0, R_OUT);
    const p1out = polar(a1, R_OUT);
    return [
      `M ${p0in.x} ${p0in.y}`,
      `L ${p0out.x} ${p0out.y}`,
      `A ${R_OUT} ${R_OUT} 0 ${large} 1 ${p1out.x} ${p1out.y}`,
      `L ${p1in.x} ${p1in.y}`,
      `A ${R_IN} ${R_IN} 0 ${large} 0 ${p0in.x} ${p0in.y}`,
      'Z',
    ].join(' ');
  }

  const steps = Math.max(10, Math.ceil((a1 - a0) * 70));
  const edge: string[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const angle = a0 + (a1 - a0) * t;
    const wave = Math.sin(t * Math.PI * 3 + seed) * 7 + Math.sin(t * Math.PI * 5 + seed * 1.7) * 3;
    const point = polar(angle, R_OUT + wave);
    edge.push(`${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  }
  return [...edge, `L ${p1in.x} ${p1in.y}`, `A ${R_IN} ${R_IN} 0 ${large} 0 ${p0in.x} ${p0in.y}`, 'Z'].join(' ');
}

function coverBox(halfAngle: number) {
  const phi = Math.min(Math.PI, halfAngle);
  const outer = R_OUT;
  const inner = phi <= Math.PI / 2 ? R_IN * Math.cos(phi) : R_OUT * Math.cos(phi);
  const height = R_OUT * Math.sin(Math.min(phi, Math.PI / 2));
  return {
    size: Math.max(outer - inner, 2 * height) * 1.06,
    distance: (outer + inner) / 2,
  };
}

function sectorPath(a0: number, a1: number, radius: number) {
  const start = polar(a0, radius);
  const end = polar(a1, radius);
  return `M ${C} ${C} L ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y} Z`;
}

type OrderedAlbum = DiscAlbum & { hue: number; seed: number };
type Slice = OrderedAlbum & {
  a0: number;
  a1: number;
  mid: number;
  path: string;
  size: number;
  distance: number;
  angle: number;
};

function makeSlice(album: OrderedAlbum, a0: number, a1: number, organic: boolean): Slice {
  const mid = (a0 + a1) / 2;
  const box = coverBox((a1 - a0) / 2);
  return {
    ...album,
    a0,
    a1,
    mid,
    path: wedgePath(a0, a1, organic, album.seed),
    ...box,
    angle: (mid * 180) / Math.PI,
  };
}

export default function Disc({
  albums,
  interactive,
  activeKey,
  labelAlbum,
  spinning,
  organic,
  onHover,
  onFocus,
  onToggleSpin,
  onToggleOrganic,
  label,
}: Props) {
  const spinRef = useRef<SVGGElement>(null);
  const spinningRef = useRef(spinning);

  useEffect(() => {
    spinningRef.current = spinning;
  }, [spinning]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let angle = 0;
    let speed = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const active = spinningRef.current && !reduced;
      const target = active ? 16 : 0;
      speed += (target - speed) * (1 - Math.exp(-dt / (active ? 0.9 : 1.9)));
      angle = (angle + speed * dt) % 360;
      spinRef.current?.setAttribute('transform', `rotate(${angle} ${C} ${C})`);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const selected = [...albums].slice(0, 18);
  const total = selected.reduce((sum, album) => sum + album.count, 0) || 1;
  const ordered = [...selected]
    .map((album, index) => ({ ...album, hue: hueOf(album.color), seed: index * 1.7 }))
    .sort((a, b) => ((a.hue + 20) % 360) - ((b.hue + 20) % 360));

  const slices = ordered.reduce<{ list: Slice[]; acc: number }>(
    (state, album) => {
      const share = album.count / total;
      const a0 = state.acc * TAU;
      const a1 = a0 + share * TAU;
      return {
        list: [...state.list, makeSlice(album, a0, a1, organic)],
        acc: state.acc + share,
      };
    },
    { list: [], acc: 0 },
  ).list;

  const grooves = Array.from({ length: 34 }, (_, index) => R_IN + 6 + (index * (R_OUT - R_IN - 12)) / 33);

  return (
    <div className="disc-wrap">
      <svg
        className="disc-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={label}
        onDoubleClick={onToggleOrganic}
      >
        <defs>
          {slices.map((slice, index) => (
            <clipPath key={slice.key} id={`disc-slice-${index}`} clipPathUnits="userSpaceOnUse">
              <path d={slice.path} />
            </clipPath>
          ))}
          <clipPath id="disc-label-clip" clipPathUnits="userSpaceOnUse">
            <circle cx={C} cy={C} r={R_LABEL} />
          </clipPath>
          <linearGradient id="disc-sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        <circle className="disc-base" cx={C} cy={C} r={R_OUT + 4} />

        <g ref={spinRef}>
          <g className="disc-slices">
            {slices.map((slice, index) => {
              const isActive = activeKey === slice.key;
              const dimmed = activeKey !== null && !isActive;
              return (
                <g
                  key={slice.key}
                  className={`disc-slice${isActive ? ' is-active' : ''}`}
                  opacity={dimmed ? 0.22 : 1}
                  style={{ animationDelay: `${index * 32}ms` }}
                >
                  <g clipPath={`url(#disc-slice-${index})`}>
                    {slice.artwork ? (
                      <image
                        href={slice.artwork}
                        x={-slice.size / 2}
                        y={-slice.size / 2}
                        width={slice.size}
                        height={slice.size}
                        preserveAspectRatio="xMidYMid slice"
                        transform={`translate(${C} ${C}) rotate(${slice.angle}) translate(0 ${-slice.distance})`}
                      />
                    ) : (
                      <rect x="0" y="0" width={SIZE} height={SIZE} fill={slice.color} opacity="0.55" />
                    )}
                  </g>
                  <path className="disc-slice-edge" d={slice.path} />
                  <path
                    className="disc-hit"
                    d={slice.path}
                    role="button"
                    tabIndex={interactive ? 0 : -1}
                    aria-label={`${slice.artist} — ${slice.album}, ${slice.count} écoutes`}
                    onMouseEnter={() => onHover(slice.key)}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover(slice.key)}
                    onBlur={() => onHover(null)}
                    onClick={() => onFocus(slice.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onFocus(slice.key);
                      }
                    }}
                  >
                    <title>{`${slice.artist} — ${slice.album}`}</title>
                  </path>
                </g>
              );
            })}
          </g>

          <g className="disc-label" onClick={onToggleSpin}>
            <circle className="disc-label-base" cx={C} cy={C} r={R_LABEL} />
            {labelAlbum?.artwork && (
              <image
                href={labelAlbum.artwork}
                x={C - R_LABEL}
                y={C - R_LABEL}
                width={R_LABEL * 2}
                height={R_LABEL * 2}
                preserveAspectRatio="xMidYMid slice"
                clipPath="url(#disc-label-clip)"
              />
            )}
            <circle className="disc-label-ring" cx={C} cy={C} r={R_LABEL} />
          </g>
        </g>

        <g className="disc-static" aria-hidden="true">
          {grooves.map((radius) => (
            <circle key={radius} className="disc-groove" cx={C} cy={C} r={radius} />
          ))}
          <path className="disc-sheen" d={sectorPath(0.22, 0.62, R_OUT)} fill="url(#disc-sheen)" />
          <path className="disc-sheen" d={sectorPath(3.36, 3.76, R_OUT)} fill="url(#disc-sheen)" />
          <circle className="disc-spindle" cx={C} cy={C} r="6" />
        </g>

        <g
          className="disc-control"
          role="button"
          tabIndex={interactive ? 0 : -1}
          aria-label={spinning ? 'Arrêter la rotation' : 'Lancer la rotation'}
          onClick={onToggleSpin}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onToggleSpin();
            }
          }}
        >
          <circle cx={C} cy={C + 26} r="13" fill="var(--paper)" opacity="0.88" />
          {spinning ? (
            <>
              <rect className="disc-glyph" x={C - 6} y={C + 20} width="3" height="12" rx="0.5" />
              <rect className="disc-glyph" x={C + 3} y={C + 20} width="3" height="12" rx="0.5" />
            </>
          ) : (
            <path className="disc-glyph" d={`M ${C - 4} ${C + 20} L ${C + 7} ${C + 26} L ${C - 4} ${C + 32} Z`} />
          )}
        </g>

        <circle className="disc-rim" cx={C} cy={C} r={R_OUT + 4} />
      </svg>
    </div>
  );
}
