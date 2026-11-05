import { useId } from 'react'

/** Diafragma geométrico; recurso vectorial local, independiente de las fotos privadas. */
export function BrandMark({ className = 'size-10' }: { className?: string }) {
  const gradient = useId()
  return <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <defs><linearGradient id={gradient} x1="5" y1="3" x2="43" y2="45" gradientUnits="userSpaceOnUse"><stop stopColor="#75edff" /><stop offset="1" stopColor="#a794ff" /></linearGradient></defs>
    <rect x="1" y="1" width="46" height="46" rx="14" fill="#102032" stroke="#31506b" />
    <g stroke={`url(#${gradient})`} strokeWidth="1.8" strokeLinejoin="round">
      <circle cx="24" cy="24" r="15" />
      <path d="M24 17 37 16.5M30 20.5l7 11M30 27.5 24 39M24 31l-13 .5M18 27.5l-7-11M18 20.5 24 9" />
    </g>
    <path d="m24 17 6 3.5v7L24 31l-6-3.5v-7Z" fill="#75edff" fillOpacity=".16" stroke="#a6f4ff" />
  </svg>
}
