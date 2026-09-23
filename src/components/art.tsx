import { useId } from 'react';
import { characters } from '../lib/catalog';
export function KinArt({
  id = 'eclipse',
  className = '',
  silhouette = false,
}: {
  id?: string;
  className?: string;
  silhouette?: boolean;
}) {
  const uid = useId().replaceAll(':', '');
  const found = characters.find((c) => c.id === id) || characters[4];
  const ch = silhouette ? { ...found, name: 'Secret kin', color: '#40377F' } : found;
  return (
    <svg
      className={(className + ' kin-art').trim()}
      viewBox="0 0 300 310"
      role="img"
      aria-label={ch.name + ' collectible'}
    >
      <defs>
        <linearGradient id={uid + 'body'} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={ch.color} />
          <stop offset="1" stopColor="#221B52" />
        </linearGradient>
        <linearGradient id={uid + 'glass'} x2=".5" y2="1">
          <stop stopColor="#2E2668" />
          <stop offset=".5" stopColor="#221B52" />
          <stop offset="1" stopColor="#0E0A26" />
        </linearGradient>
        <radialGradient id={uid + 'glow'}>
          <stop stopColor={ch.color} stopOpacity=".25" />
          <stop offset="1" stopColor={ch.color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="150" cy="157" rx="136" ry="139" fill={'url(#' + uid + 'glow)'} />
      <ellipse cx="150" cy="278" rx="67" ry="10" fill="#000" opacity=".22" />
      <g stroke="#ffffff" strokeOpacity=".08">
        <path
          d="M106 230 Q94 271 121 271 L143 271 L141 230M158 230 L159 271 L184 271 Q205 270 191 230"
          fill={'url(#' + uid + 'body)'}
        />
        <rect x="91" y="159" width="119" height="89" rx="38" fill={'url(#' + uid + 'body)'} />
        <rect
          x="71"
          y="168"
          width="34"
          height="72"
          rx="17"
          transform="rotate(12 88 200)"
          fill={'url(#' + uid + 'body)'}
        />
        <rect
          x="197"
          y="168"
          width="34"
          height="72"
          rx="17"
          transform="rotate(-12 214 200)"
          fill={'url(#' + uid + 'body)'}
        />
        <path d="M91 94L81 43 117 77M184 77L218 44 209 108" fill={'url(#' + uid + 'body)'} />
        <rect x="82" y="68" width="138" height="119" rx="48" fill={'url(#' + uid + 'body)'} />
        <rect x="96" y="92" width="110" height="70" rx="30" fill={'url(#' + uid + 'glass)'} />
        <path
          d="M110 111Q146 89 183 105"
          stroke="#f2efe4"
          strokeOpacity=".3"
          strokeWidth="3"
          fill="none"
        />
        <path d="M120 130h12m37 0h12" stroke={ch.color} strokeWidth="5" strokeLinecap="round" />
        <circle cx="152" cy="201" r="12" fill="#17123A" />
        <path d="M152 193v16m-8-8h16" stroke={ch.color} strokeWidth="2" />
      </g>
      <ellipse
        cx="150"
        cy="64"
        rx="65"
        ry="13"
        fill="none"
        stroke={ch.color}
        strokeOpacity=".65"
        strokeWidth="2"
        transform="rotate(-16 150 64)"
      />
    </svg>
  );
}
/** The sealed Astral Kin box from design/reference.html Frame 1. */
export function BoxArt({ className = '' }: { className?: string }) {
  return (
    <svg
      className={(className + ' box-art').trim()}
      viewBox="0 0 400 420"
      role="img"
      aria-label="Astral Kin sealed blind box"
    >
      <path d="M200 20 380 110v200L200 400 20 310V110z" fill="#2E2668" />
      <path d="M20 110 200 200v200L20 310z" fill="#EEEBFB" />
      <path d="M380 110 200 200v200l180-90z" fill="#C9C4EA" />
      <path d="M200 20 380 110 200 200 20 110z" fill="#FFD84D" />
      <path d="M110 65l180 90" stroke="#C9A21F" strokeWidth="4" strokeDasharray="10 8" />
      <g fontFamily="'Unbounded Variable', system-ui, sans-serif" fontWeight="800" fill="#17123A">
        <text x="46" y="250" transform="skewY(26.6) translate(0,-45)" fontSize="34">
          Astral
        </text>
        <text x="46" y="292" transform="skewY(26.6) translate(0,-45)" fontSize="34">
          Kin
        </text>
      </g>
      <text
        x="48"
        y="330"
        transform="skewY(26.6) translate(0,-45)"
        fontFamily="'Figtree Variable', system-ui, sans-serif"
        fontWeight="700"
        fontSize="15"
        fill="#4A4380"
      >
        Series 01 of 7 characters
      </text>
      <g transform="translate(236 250) skewY(-26.6)">
        <circle cx="46" cy="40" r="30" fill="none" stroke="#17123A" strokeWidth="4" />
        <text
          x="36"
          y="52"
          fontFamily="'Unbounded Variable', system-ui, sans-serif"
          fontWeight="800"
          fontSize="32"
          fill="#17123A"
        >
          ?
        </text>
      </g>
    </svg>
  );
}
