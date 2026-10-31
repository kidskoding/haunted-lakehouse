"use client";

import { useId } from "react";
import { DESIGN_HEIGHT, DESIGN_WIDTH, START_HOUR, palette } from "./candle-clock-art";

const TICKS = Array.from({ length: 12 }, (_, hour) => hour);

/** The candle-clock scene as a static drawing, for before the scene loads and for no-WebGL browsers. */
export function CandleClockFallback() {
  const haloId = useId();
  const handDegrees = (START_HOUR / 12) * 360;
  return (
    <svg
      viewBox={`0 0 ${String(DESIGN_WIDTH)} ${String(DESIGN_HEIGHT)}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      focusable="false"
    >
      <g transform="translate(104 90)">
        <circle r="62" fill={palette.dial} stroke={palette.dialRim} strokeWidth="2" />
        {TICKS.map((hour) => (
          <line
            key={hour}
            x1="0"
            y1={hour % 3 === 0 ? -50 : -55}
            x2="0"
            y2="-59"
            stroke={palette.tick}
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${String(hour * 30)})`}
          />
        ))}
        <g transform={`rotate(${String(handDegrees)})`}>
          <line
            x1="0"
            y1="8"
            x2="0"
            y2="-48"
            stroke={palette.flame}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cy="-48" r="3" fill={palette.glow} />
        </g>
        <circle r="5" fill={palette.flame} />
      </g>
      <g transform="translate(226 100)">
        <circle cy="-22" r="52" fill={`url(#${haloId})`} />
        <rect x="-11" y="0" width="22" height="62" rx="3" fill={palette.wax} />
        <rect x="5" y="2" width="4" height="58" fill={palette.waxShade} opacity="0.6" />
        <line x1="0" y1="0" x2="0" y2="-6" stroke={palette.wick} strokeWidth="2" />
        <path
          d="M0 -39 C4.3 -23.7 9.4 -15.2 7.2 -9.1 C5.1 -3.6 -5.1 -3.6 -7.2 -9.1 C-9.4 -15.2 -4.3 -23.7 0 -39 Z"
          fill={palette.flame}
        />
        <ellipse cx="0" cy="-10" rx="3" ry="6" fill={palette.glow} />
      </g>
      <defs>
        <radialGradient id={haloId}>
          <stop offset="0" stopColor={palette.flame} stopOpacity="0.25" />
          <stop offset="1" stopColor={palette.ember} stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
