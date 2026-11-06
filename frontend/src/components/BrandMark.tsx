import { useId } from 'react'

/** Identidad vectorial: diafragma del estudio u órbita 360° animada para el inicio. */
export function BrandMark({ className = 'size-10', dynamic = false }: { className?: string; dynamic?: boolean }) {
  const gradient = useId()
  return <svg className={`${className}${dynamic ? ' brand-mark-dynamic' : ''}`} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <defs><linearGradient id={gradient} x1="5" y1="3" x2="43" y2="45" gradientUnits="userSpaceOnUse"><stop stopColor="#75edff" /><stop offset="1" stopColor="#a794ff" /></linearGradient></defs>
    <rect x="1" y="1" width="46" height="46" rx="14" fill="#102032" stroke="#31506b" />
    {dynamic ? <>
      <g stroke={`url(#${gradient})`} strokeWidth="1.3">
        <circle cx="24" cy="24" r="11" />
        <ellipse cx="24" cy="24" rx="5" ry="11" />
        <ellipse cx="24" cy="24" rx="11" ry="4" />
      </g>
      <g className="brand-orbit" stroke="#9bf3ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 24a16 16 0 0 1 29-9m3 9a16 16 0 0 1-29 9" />
        <path d="m32 14 5 1-1-5M16 34l-5-1 1 5" />
      </g>
    </> : <><g stroke={`url(#${gradient})`} strokeWidth="1.8" strokeLinejoin="round">
      <circle cx="24" cy="24" r="15" />
      <path d="M24 17 37 16.5M30 20.5l7 11M30 27.5 24 39M24 31l-13 .5M18 27.5l-7-11M18 20.5 24 9" />
    </g>
    <path d="m24 17 6 3.5v7L24 31l-6-3.5v-7Z" fill="#75edff" fillOpacity=".16" stroke="#a6f4ff" /></>}
  </svg>
}
