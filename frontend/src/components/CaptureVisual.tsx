import { useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Icon } from './Icon'

// Proyección de una esfera vectorial: el arrastre gira sus meridianos en el espacio.
function sphereGrid(yaw: number, pitch: number) {
  const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180
  const project = (x: number, vertical: number, z: number) => {
    const horizontal = x * Math.cos(y) + z * Math.sin(y)
    const depth = -x * Math.sin(y) + z * Math.cos(y)
    return { x: 260 + horizontal * 132, y: 230 + (vertical * Math.cos(p) - depth * Math.sin(p)) * 132,
      z: vertical * Math.sin(p) + depth * Math.cos(p) }
  }
  const paths = { front: '', back: '', accent: '' }
  const trace = (point: (angle: number) => [number, number, number], accent = false) => {
    let previous = project(...point(0))
    for (let step = 1; step <= 72; step++) {
      const next = project(...point(step * Math.PI / 36))
      const segment = `M${previous.x.toFixed(2)} ${previous.y.toFixed(2)}L${next.x.toFixed(2)} ${next.y.toFixed(2)}`
      if (accent && previous.z + next.z >= 0) paths.accent += segment
      else paths[previous.z + next.z >= 0 ? 'front' : 'back'] += segment
      previous = next
    }
  }
  for (const latitude of [-60, -30, 0, 30, 60]) {
    const angle = latitude * Math.PI / 180
    trace((t) => [Math.cos(angle) * Math.sin(t), Math.sin(angle), Math.cos(angle) * Math.cos(t)])
  }
  for (let longitude = 0; longitude < 180; longitude += 30) {
    const angle = longitude * Math.PI / 180
    trace((t) => [Math.cos(t) * Math.sin(angle), Math.sin(t), Math.cos(t) * Math.cos(angle)], longitude === 30)
  }
  return paths
}

export function CaptureVisual() {
  const id = useId()
  const [rotation, setRotation] = useState({ yaw: 0, pitch: 0 })
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ id: number; x: number; y: number; width: number; yaw: number; pitch: number } | null>(null)
  const grid = useMemo(() => sphereGrid(rotation.yaw, rotation.pitch), [rotation])
  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return <div className="capture-visual">
    <div className="capture-caption"><span className="flex items-center gap-2"><span className="capture-dot" />Explorá en todas las direcciones</span><Icon name="focus" className="size-5" /></div>
    <div className="capture-globe" role="group" aria-label="Esfera 360° interactiva" aria-describedby={`${id}-instructions`} tabIndex={0} data-dragging={dragging}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || drag.current) return
        const width = event.currentTarget.getBoundingClientRect().width
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width, ...rotation }
        event.currentTarget.setPointerCapture(event.pointerId)
        event.currentTarget.focus({ preventScroll: true })
        setDragging(true)
      }}
      onPointerMove={(event) => {
        const start = drag.current
        if (start?.id === event.pointerId) {
          setRotation({ yaw: start.yaw + (event.clientX - start.x) / start.width * 360,
            pitch: start.pitch - (event.clientY - start.y) / start.width * 360 })
        }
      }}
      onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
      onKeyDown={(event) => {
        const directions: Record<string, [number, number]> = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 15], ArrowDown: [0, -15] }
        if (event.key === 'Home') { event.preventDefault(); setRotation({ yaw: 0, pitch: 0 }) }
        else if (directions[event.key]) {
          event.preventDefault()
          const [yaw, pitch] = directions[event.key]
          setRotation((current) => ({ yaw: current.yaw + yaw, pitch: current.pitch + pitch }))
        }
      }}>
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
        <g stroke={`url(#${id}-rim)`} strokeWidth="1.2">
          <path d={grid.back} strokeOpacity=".12" />
          <path className="capture-grid" d={grid.front} strokeOpacity=".55" />
          <path d={grid.accent} stroke="#9ff3ff" strokeOpacity=".85" strokeWidth="2" />
        </g>
        <rect x="179" y="197" width="162" height="66" rx="33" fill="#0a1425" fillOpacity=".94" stroke="#7ceaff40" />
        <text x="260" y="244" textAnchor="middle" fill="#e2faff" fontSize="43" fontWeight="600" letterSpacing="-2">360°</text>
      </g>
      <g transform={`rotate(${rotation.yaw} 260 230)`}>
      <g className="capture-orbit" stroke={`url(#${id}-rim)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M94 230a166 166 0 0 1 296-103M426 230A166 166 0 0 1 130 333" />
        <path d="m374 125 16 2-1-16M146 335l-16-2 1 16" />
        <circle cx="94" cy="230" r="4" fill="#7ceaff" stroke="none" />
        <circle cx="426" cy="230" r="4" fill="#ad9bff" stroke="none" />
      </g>
      <g className="capture-orbit capture-orbit-outer" stroke="#7ceaff" strokeOpacity=".35"><circle cx="260" cy="230" r="186" strokeDasharray="30 14 2 14" /><circle cx="260" cy="44" r="5" fill="#ad9bff" stroke="none" /></g>
      </g>
    </svg>
    </div>
    <p id={`${id}-instructions`} className="capture-instructions">Arrastrá para girar 360° <span>· Con teclado, usá las flechas</span></p>
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
