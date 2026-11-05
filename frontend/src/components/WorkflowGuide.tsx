import { Icon } from './Icon'

export function WorkflowGuide({ compact = false }: { compact?: boolean }) {
  const steps = [
    { title: 'Creá tu recorrido', text: 'Poné un nombre a la propiedad.', icon: 'aperture' as const },
    { title: 'Cargá tus fotos', text: 'Una panorámica 360° por ambiente.', icon: 'camera' as const },
    { title: 'Conectá los espacios', text: 'Agregá puntos para ir de uno a otro.', icon: 'link' as const },
    { title: 'Publicá y compartí', text: 'Revisá la visita y obtené el enlace.', icon: 'globe' as const },
  ]
  return <section id="guia" className="scroll-mt-6" aria-label="Cómo crear un recorrido">
    <div className="mb-3 flex items-center gap-2"><span className="eyebrow">De tus fotos a una visita virtual</span><span className="h-px flex-1 bg-surface-800" /></div>
    <ol className={compact ? 'grid grid-cols-2 gap-2 sm:grid-cols-4' : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4'}>{steps.map((step, index) => <li key={step.title} className={`flex gap-3 rounded-xl border border-line/80 bg-surface-900/70 ${compact ? 'items-center p-3' : 'p-4'}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><Icon name={step.icon} className="size-4" /></span>
      <div><p className="text-xs font-semibold"><span className="mr-1 text-subtle">0{index + 1}</span> {step.title}</p>{!compact && <p className="mt-1 text-[11px] leading-relaxed text-muted">{step.text}</p>}</div>
    </li>)}</ol>
  </section>
}
