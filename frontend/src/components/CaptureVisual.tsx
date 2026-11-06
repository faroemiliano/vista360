import { useId } from 'react'
import { Icon } from './Icon'

export function CaptureVisual() {
  const id = useId()
  return <div className="capture-visual" onPointerMove={(event) => {
    if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--orbit-x', `${-(event.clientY - bounds.top - bounds.height / 2) / bounds.height * 16}deg`)
    event.currentTarget.style.setProperty('--orbit-y', `${(event.clientX - bounds.left - bounds.width / 2) / bounds.width * 20}deg`)
  }} onPointerLeave={(event) => {
    event.currentTarget.style.removeProperty('--orbit-x')
    event.currentTarget.style.removeProperty('--orbit-y')
  }}>
    <div className="capture-caption"><span className="flex items-center gap-2"><span className="capture-dot" />Explorá en todas las direcciones</span><Icon name="focus" className="size-5" /></div>
    <svg viewBox="0 0 520 460" fill="none" className="capture-optics" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-glass`}><stop stopColor="#263d61" /><stop offset="1" stopColor="#0a1425" /></radialGradient>
        <linearGradient id={`${id}-rim`} x1="110" y1="75" x2="400" y2="395" gradientUnits="userSpaceOnUse"><stop stopColor="#7eefff" /><stop offset="1" stopColor="#a18aff" /></linearGradient>
        <radialGradient id={`${id}-glow`}><stop stopColor="#6cdfff" stopOpacity=".2" /><stop offset="1" stopColor="#6cdfff" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="260" cy="230" r="220" fill={`url(#${id}-glow)`} />
      <g stroke="#3e597a" strokeOpacity=".4"><path d="M20 230h480M260 15v430" strokeDasharray="3 8" /><circle cx="260" cy="230" r="202" strokeDasharray="1 12" /></g>
      <g className="capture-sphere">
        <circle cx="260" cy="230" r="132" fill={`url(#${id}-glass)`} stroke={`url(#${id}-rim)`} strokeWidth="2" />
        <g stroke={`url(#${id}-rim)`} strokeOpacity=".4" strokeWidth="1.2">
          <ellipse cx="260" cy="230" rx="62" ry="132" />
          <ellipse cx="260" cy="230" rx="108" ry="132" />
          <ellipse cx="260" cy="230" rx="132" ry="47" />
          <ellipse cx="260" cy="230" rx="132" ry="95" />
          <path d="M128 230h264M260 98v264" />
        </g>
        <rect x="179" y="197" width="162" height="66" rx="33" fill="#0a1425" fillOpacity=".94" stroke="#7ceaff40" />
        <text x="260" y="244" textAnchor="middle" fill="#e2faff" fontSize="43" fontWeight="600" letterSpacing="-2">360°</text>
      </g>
      <g className="capture-orbit" stroke={`url(#${id}-rim)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M94 230a166 166 0 0 1 296-103M426 230A166 166 0 0 1 130 333" />
        <path d="m374 125 16 2-1-16M146 335l-16-2 1 16" />
        <circle cx="94" cy="230" r="4" fill="#7ceaff" stroke="none" />
        <circle cx="426" cy="230" r="4" fill="#ad9bff" stroke="none" />
      </g>
      <g className="capture-orbit capture-orbit-outer" stroke="#7ceaff" strokeOpacity=".35"><circle cx="260" cy="230" r="186" strokeDasharray="30 14 2 14" /><circle cx="260" cy="44" r="5" fill="#ad9bff" stroke="none" /></g>
    </svg>
    <div className="capture-foot"><div><span className="capture-spec">UNA MIRADA SIN LÍMITES</span><p>Tu espacio. <span>Desde cada ángulo.</span></p></div><span className="capture-axis" aria-hidden="true">↔<br />↕</span></div>
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
