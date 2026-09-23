import { useId } from 'react';
import { characters } from '../lib/catalog';
export function KinArt({ id = 'eclipse', className = '' }: { id?: string; className?: string }) {
  const uid = useId().replaceAll(':', '');
  const ch = characters.find((c) => c.id === id) || characters[4];
  return (
    <svg
      className={className}
      viewBox="0 0 300 310"
      role="img"
      aria-label={ch.name + ' collectible'}
    >
      <defs>
        <linearGradient id={uid + 'body'} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={ch.color} />
          <stop offset="1" stopColor="#303c36" />
        </linearGradient>
        <linearGradient id={uid + 'glass'} x2=".5" y2="1">
          <stop stopColor="#61746c" />
          <stop offset=".5" stopColor="#1e302a" />
          <stop offset="1" stopColor="#101b18" />
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
        <circle cx="152" cy="201" r="12" fill="#182820" />
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
export function BoxArt() {
  return (
    <div className="static-box" role="img" aria-label="Astral Kin sealed blind box">
      <span>AK</span>
      <small>
        ASTRAL KIN
        <br />
        FRAGMENTS BEYOND THE STARS
      </small>
      <i>01 / THE FIRST CONSTELLATION</i>
    </div>
  );
}
