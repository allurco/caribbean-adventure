/**
 * PROTOTYPE: a painted stand-in for the 3D scene behind the combat panels: a
 * golden-hour sea, the two ships side-on, and the smoke bank blowing downwind
 * (left to right, so the attacker on the left holds the weather gauge).
 * Drawn in a 1600 × 1000 SVG; `children` are SVG elements in the same space.
 */
import type { ReactNode } from "react";

interface ShipProps {
  x: number;
  y: number;
  scale: number;
  flip?: boolean;
  damaged?: boolean;
  firing?: boolean;
}

/** A three-masted ship, side-on, sails catching the low sun. */
function ShipSilhouette({ x, y, scale, flip = false, damaged = false, firing = false }: ShipProps) {
  const sx = flip ? -scale : scale;
  return (
    <g transform={`translate(${x} ${y}) scale(${sx} ${scale})`}>
      {/* hull */}
      <path d="M-170 0 L170 0 L150 44 Q0 58 -140 44 Z" fill="#20140c" />
      <path d="M-170 0 L-196 -14 L-150 -6 Z" fill="#20140c" />
      <path d="M150 -26 L176 -30 L170 0 L140 0 Z" fill="#2a1a0f" />
      <path d="M-160 12 L156 12" stroke="#8a6a3a" strokeWidth={3} opacity={0.6} />
      {[-110, -70, -30, 10, 50, 90].map((gx) => (
        <rect key={gx} x={gx} y={18} width={12} height={9} fill="#0c0805" />
      ))}
      {/* masts */}
      {[-90, 10, 110].map((mx, i) => {
        const h = i === 1 ? 300 : 250;
        const broken = damaged && i === 2;
        return (
          <g key={mx}>
            <path d={`M${mx} 0 L${mx} ${broken ? -150 : -h}`} stroke="#1a110a" strokeWidth={6} />
            {!broken && (
              <>
                <path d={`M${mx - 58} ${-h + 40} Q${mx} ${-h + 30} ${mx + 58} ${-h + 40} L${mx + 52} ${-h + 110} Q${mx} ${-h + 120} ${mx - 52} ${-h + 110} Z`} fill="url(#sail)" />
                <path d={`M${mx - 70} ${-h + 125} Q${mx} ${-h + 112} ${mx + 70} ${-h + 125} L${mx + 64} ${-h + 220} Q${mx} ${-h + 232} ${mx - 64} ${-h + 220} Z`} fill="url(#sail)" />
              </>
            )}
            {broken && (
              <>
                <path d={`M${mx - 64} -125 Q${mx} -140 ${mx + 64} -125 L${mx + 58} -40 Q${mx} -30 ${mx - 58} -40 Z`} fill="url(#sail)" opacity={0.85} />
                <path d={`M${mx} -150 L${mx + 60} -60`} stroke="#1a110a" strokeWidth={5} />
              </>
            )}
          </g>
        );
      })}
      {/* bowsprit */}
      <path d="M-170 -8 L-250 -60" stroke="#1a110a" strokeWidth={4} />
      <path d="M-245 -58 L-100 -240 L-150 -40 Z" fill="url(#sail)" opacity={0.9} />
      {firing &&
        [-110, -70, -30, 10, 50, 90].map((gx) => (
          <ellipse key={gx} cx={gx + 6} cy={60} rx={30} ry={18} fill="#f3d9a0" opacity={0.5} filter="url(#blur)" />
        ))}
    </g>
  );
}

export function SeaBackdrop({
  smoke = false,
  close = false,
  defenderDamaged = false,
  attackerFiring = false,
  dim = 0,
  children,
}: {
  smoke?: boolean;
  /** Frame the two ships closer and larger (the cinematic camera). */
  close?: boolean;
  defenderDamaged?: boolean;
  attackerFiring?: boolean;
  /** 0 to 1: a dark veil over the scene for panels to sit on. */
  dim?: number;
  children?: ReactNode;
}) {
  const s = close ? 1.05 : 0.8;
  return (
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3550" />
          <stop offset="0.55" stopColor="#c98a52" />
          <stop offset="1" stopColor="#f2c27c" />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f6f78" />
          <stop offset="0.25" stopColor="#1f4f5c" />
          <stop offset="1" stopColor="#0b2530" />
        </linearGradient>
        <radialGradient id="sun" cx="0.8" cy="0.36" r="0.5">
          <stop offset="0" stopColor="#ffe3a8" stopOpacity={0.9} />
          <stop offset="0.25" stopColor="#f5b46a" stopOpacity={0.35} />
          <stop offset="1" stopColor="#f5b46a" stopOpacity={0} />
        </radialGradient>
        <linearGradient id="sail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b9a581" />
          <stop offset="0.7" stopColor="#efdcb2" />
          <stop offset="1" stopColor="#ffe9bd" />
        </linearGradient>
        <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id="smokeBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="30" />
        </filter>
      </defs>
      <rect width="1600" height="380" fill="url(#sky)" />
      <rect y="380" width="1600" height="620" fill="url(#sea)" />
      {/* glitter under the sun, ahead-right */}
      {Array.from({ length: 26 }, (_, i) => (
        <path key={i} d={`M${1120 + ((i * 53) % 340) - 170} ${392 + i * 9} l${30 + (i % 5) * 9} 0`} stroke="#ffd99a" strokeWidth={2} opacity={0.55 - i * 0.018} />
      ))}
      {/* swell lines */}
      {Array.from({ length: 14 }, (_, i) => (
        <path key={i} d={`M0 ${430 + i * 42} Q400 ${420 + i * 42} 800 ${436 + i * 42} T1600 ${428 + i * 42}`} stroke="#9fc7c6" strokeWidth={1.2} fill="none" opacity={0.08 + i * 0.006} />
      ))}
      <rect width="1600" height="1000" fill="url(#sun)" />
      <ShipSilhouette x={close ? 470 : 540} y={close ? 700 : 640} scale={s} firing={attackerFiring} />
      <ShipSilhouette x={close ? 1150 : 1070} y={close ? 650 : 600} scale={s * 0.86} flip damaged={defenderDamaged} />
      {smoke && (
        <g filter="url(#smokeBlur)" opacity={0.75}>
          <ellipse cx={760} cy={600} rx={160} ry={70} fill="#d8cfc0" />
          <ellipse cx={920} cy={560} rx={200} ry={90} fill="#cfc4b2" />
          <ellipse cx={1100} cy={600} rx={240} ry={80} fill="#c7bba8" opacity={0.8} />
          <ellipse cx={1260} cy={540} rx={180} ry={70} fill="#c2b6a2" opacity={0.6} />
        </g>
      )}
      {dim > 0 && <rect width="1600" height="1000" fill="#0c0805" opacity={dim} />}
      {children}
    </svg>
  );
}
