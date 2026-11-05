type Name = 'orbit' | 'grid' | 'image' | 'link' | 'eye' | 'arrow' | 'plus' | 'check' | 'globe' | 'help' | 'exit' | 'camera' | 'aperture' | 'focus'
const paths: Record<Name, string> = {
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  aperture: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 8l3.46 2v4L12 16l-3.46-2v-4zM12 8l7.79-.5M15.46 10l4.33 6.5M15.46 14 12 21M12 16l-7.79.5M8.54 14 4.21 7.5M8.54 10 12 3',
  focus: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  orbit: 'M12 3a9 9 0 1 0 9 9M12 8a4 4 0 1 0 4 4M16 3h5v5M21 3l-7 7',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 8h.01',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l4 4L19 6',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  help: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 16h.01',
  exit: 'M9 4H4v16h5M9 12h12M17 8l4 4-4 4',
}
export function Icon({ name, className = 'size-5' }: { name: Name; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
