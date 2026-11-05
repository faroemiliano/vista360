import { useId } from 'react'
import { Icon } from './Icon'

export function CaptureVisual() {
  const id = useId()
  return <div className="capture-visual">
    <div className="capture-caption"><span className="flex items-center gap-2"><span className="capture-dot" />El espacio, desde otro ángulo</span><Icon name="focus" className="size-5" /></div>
    <svg viewBox="0 0 520 460" fill="none" className="capture-optics" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-aperture`}><circle cx="260" cy="230" r="132" /></clipPath>
        <radialGradient id={`${id}-glass`}><stop stopColor="#18223f" /><stop offset=".5" stopColor="#131f37" /><stop offset=".85" stopColor="#091423" /><stop offset="1" stopColor="#162d40" /></radialGradient>
        <linearGradient id={`${id}-rim`} x1="110" y1="75" x2="400" y2="395" gradientUnits="userSpaceOnUse"><stop stopColor="#7eefff" /><stop offset=".45" stopColor="#36657c" /><stop offset=".75" stopColor="#a18aff" /><stop offset="1" stopColor="#426575" /></linearGradient>
        <radialGradient id={`${id}-glow`}><stop stopColor="#6cdfff" stopOpacity=".15" /><stop offset="1" stopColor="#6cdfff" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="260" cy="230" r="220" fill={`url(#${id}-glow)`} />
      <g stroke="#3e597a" strokeOpacity=".3"><path d="M20 230h480M260 15v430" strokeDasharray="3 8" /><circle cx="260" cy="230" r="202" strokeDasharray="1 12" /><circle cx="260" cy="230" r="185" /></g>
      <path d="M104 86H64v40M416 86h40v40M456 334v40h-40M104 374H64v-40" stroke="#77eaff" strokeWidth="2" />
      <circle cx="260" cy="230" r="163" fill="#080f1d" stroke={`url(#${id}-rim)`} strokeWidth="2" />
      <circle cx="260" cy="230" r="150" stroke="#263b54" strokeWidth="14" strokeDasharray="1 5" />
      <circle cx="260" cy="230" r="133" fill={`url(#${id}-glass)`} stroke={`url(#${id}-rim)`} strokeWidth="2" />
      <circle cx="260" cy="230" r="113" stroke="#6deaff" strokeOpacity=".25" />
      <g clipPath={`url(#${id}-aperture)`} stroke={`url(#${id}-rim)`} strokeWidth="1.2" fill="#12253c" fillOpacity=".5">
        <path d="m260 166 55 32 56-65-111-36Z" /><path d="m315 198 0 64 84 15 28-115Z" /><path d="m315 262-55 32 29 80 113-47Z" /><path d="m260 294-55-32-56 65 111 36Z" /><path d="m205 262 0-64-84-15-28 115Z" /><path d="m205 198 55-32-29-80-113 47Z" />
      </g>
      <path d="m260 166 55 32v64l-55 32-55-32v-64Z" fill="#080f20" stroke="#7ceaff" strokeOpacity=".9" />
      <circle cx="260" cy="230" r="27" fill="#172b48" stroke="#9ca8ff" strokeOpacity=".8" />
      <circle cx="260" cy="230" r="11" fill="#89edff" fillOpacity=".8" />
      <ellipse cx="215" cy="165" rx="23" ry="10" transform="rotate(-45 215 165)" fill="#c7f6ff" fillOpacity=".12" />
      <path d="M121 295a153 153 0 0 0 232 61M170 102a153 153 0 0 1 232 65" stroke="#a6d9ff" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
    </svg>
    <div className="capture-foot"><div><span className="capture-spec">VISIÓN COMPLETA</span><p>360° <span>de posibilidades.</span></p></div><span className="capture-axis">↔<br />↕</span></div>
  </div>
}

export function TourCover() {
  return <div className="tour-cover" aria-hidden="true">
    <span className="tour-cover-label">PANORAMA / 360°</span>
    <div className="tour-cover-focus"><Icon name="aperture" className="size-14" /></div>
    <span className="tour-cover-line" />
    <span className="tour-cover-bottom"><Icon name="camera" className="size-4" />Una nueva perspectiva</span>
  </div>
}
